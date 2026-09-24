const db = require('../db');
const { parseIntent } = require('./intentParser');
const { extractIntentWithLlm, generateNarrativeWithLlm, explainInfeasibilityWithLlm } = require('./aiClient');
const { optimizeItinerary } = require('../optimizer/optimizer');
const { diagnoseInfeasibility } = require('../optimizer/infeasibility');
const { findSingleConstraintRelaxation } = require('../optimizer/relaxation');
const { generateExplanation } = require('./explainer');

/**
 * AI Plan My Day Engine
 * Architecture:
 *   User Natural Language -> Groq GPT-OSS (or smart deterministic fallback)
 *   -> Structured Semantic Intent -> Real APS-09 SQLite Resolution -> Authoritative Deterministic Optimizer
 *   -> Real Itinerary & Metrics -> Grounded AI Explanation / Infeasibility Narrative
 */
async function generateAiPlan(prompt, currentCityId = null) {
  if (!prompt || typeof prompt !== 'string') {
    return {
      success: false,
      error: { code: 'MISSING_PROMPT', message: 'Prompt is required' }
    };
  }

  // 1. Fetch available active cities from SQLite (database is source of truth)
  const cities = db.prepare("SELECT city_id, name, state, country_code, region FROM cities WHERE status = 'active'").all();
  const cityNames = cities.map(c => c.name);

  // 2. Extract structured intent via Groq GPT-OSS (with graceful deterministic fallback)
  const llmResult = await extractIntentWithLlm(prompt, cityNames);

  let usedFallback = false;
  let fallbackMessage = '';
  let structured = null;
  let modelName = 'Heuristic Intent Engine';
  let providerName = 'Local';

  if (llmResult.success && llmResult.parsed) {
    structured = llmResult.parsed;
    modelName = llmResult.model || 'openai/gpt-oss-20b';
    providerName = llmResult.provider || 'Groq';
  } else {
    // Run deterministic smart fallback parser
    usedFallback = true;
    fallbackMessage = 'AI is temporarily offline. ReRoute is using smart deterministic fallback planning.';
    const localParsed = parseIntent(prompt);
    structured = localParsed.parsed;
    modelName = 'Smart Heuristic Fallback Engine';
    providerName = 'Local';
  }

  // 3. Match City strictly from SQLite Database
  let targetCity = null;
  if (structured.city_name) {
    const searchName = structured.city_name.toLowerCase().trim();
    targetCity = cities.find(c => {
      const cName = c.name.toLowerCase();
      return cName === searchName || cName.includes(searchName) || searchName.includes(cName);
    });

    // If traveler explicitly requested a named city that doesn't exist, do not silently switch
    if (!targetCity && structured.city_name.length > 2) {
      // Check if currentCityId was provided as fallback
      if (currentCityId) {
        targetCity = cities.find(c => c.city_id === currentCityId);
      }
      if (!targetCity) {
        return {
          success: false,
          error: {
            code: 'INVALID_CITY',
            message: `City "${structured.city_name}" is not available in the database. Please select from the 60+ supported cities.`
          }
        };
      }
    }
  }

  if (!targetCity && currentCityId) {
    targetCity = cities.find(c => c.city_id === currentCityId);
  }

  // Default to Bengaluru or first city if no city was named at all
  if (!targetCity) {
    targetCity = cities.find(c => c.name.toLowerCase().includes('bengaluru')) || cities[0];
  }

  // 4. Ground POIs: Match Real POIs from SQLite for this city
  const cityPois = db.prepare(`
    SELECT poi_id, name, poi_category, typical_duration_minutes, entry_cost, carbon_kg, opens_at, closes_at, closed_days, tags, description, popularity_score
    FROM activities_poi
    WHERE city_id = ? AND status = 'active'
    ORDER BY popularity_score DESC
  `).all(targetCity.city_id);

  if (cityPois.length === 0) {
    return {
      success: false,
      error: {
        code: 'CITY_NO_POIS',
        message: `No active attractions found in database for ${targetCity.name}.`
      }
    };
  }

  // Find matching POIs using extracted keywords/names
  const matchedPoiIds = [];
  const keywords = structured.must_see_keywords || [];

  for (const kw of keywords) {
    const kwLower = kw.toLowerCase().trim();
    if (!kwLower) continue;

    for (const poi of cityPois) {
      const pName = poi.name.toLowerCase();
      const pTags = (poi.tags || '').toLowerCase();
      const pCat = (poi.poi_category || '').toLowerCase();

      if (pName.includes(kwLower) || pTags.includes(kwLower) || pCat.includes(kwLower)) {
        if (!matchedPoiIds.includes(poi.poi_id)) {
          matchedPoiIds.push(poi.poi_id);
          break; // One match per keyword
        }
      }
    }
  }

  // If no POI matched by keyword, select 1-2 top attractions
  if (matchedPoiIds.length === 0) {
    matchedPoiIds.push(cityPois[0].poi_id);
    if (cityPois.length > 1) {
      matchedPoiIds.push(cityPois[1].poi_id);
    }
  }

  // 5. Build Optimizer Payload with normalized weights
  const rawWeights = structured.weights || { cost: 0.30, time: 0.30, carbon: 0.40 };
  const sumW = (rawWeights.cost || 0.33) + (rawWeights.time || 0.33) + (rawWeights.carbon || 0.34);
  const normalizedWeights = {
    cost: Number(((rawWeights.cost || 0.33) / sumW).toFixed(2)),
    time: Number(((rawWeights.time || 0.33) / sumW).toFixed(2)),
    carbon: Number(((rawWeights.carbon || 0.34) / sumW).toFixed(2))
  };

  const optimizerPayload = {
    city_id: targetCity.city_id,
    day_start: structured.day_start || '09:00',
    day_end: structured.day_end || '18:00',
    budget_cap: structured.budget_cap ? String(structured.budget_cap) : '2500',
    carbon_cap_kg: structured.carbon_cap_kg ? parseFloat(structured.carbon_cap_kg) : 10,
    must_see_poi_ids: matchedPoiIds.slice(0, 3), // Max 3 must-see for high feasibility
    weights: normalizedWeights
  };

  // 6. Execute Deterministic Optimizer with Real SQLite Data
  const optimizerResult = optimizeItinerary(optimizerPayload);

  // 7. Handle Feasible vs Infeasible outcomes
  if (optimizerResult.feasible) {
    // Generate AI Narrative grounded in calculated metrics
    let narrative = null;
    if (!usedFallback) {
      narrative = await generateNarrativeWithLlm(
        targetCity.name,
        optimizerResult.stops,
        optimizerResult.summary,
        prompt
      );
    }

    if (!narrative) {
      narrative = generateExplanation(optimizerResult, optimizerPayload.weights);
    }

    const themeTitle = structured.theme || 'Optimized Multi-Objective Journey';

    return {
      success: true,
      feasible: true,
      theme: themeTitle,
      ai_status: {
        fallback: usedFallback,
        provider: providerName,
        message: usedFallback ? fallbackMessage : `Plan generated with ${providerName} (${modelName})`,
        model: modelName
      },
      city: {
        city_id: targetCity.city_id,
        name: targetCity.name,
        state: targetCity.state,
        country_code: targetCity.country_code,
        region: targetCity.region
      },
      parsed_intent: {
        budget_cap: optimizerPayload.budget_cap,
        carbon_cap_kg: optimizerPayload.carbon_cap_kg,
        day_start: optimizerPayload.day_start,
        day_end: optimizerPayload.day_end,
        weights: optimizerPayload.weights,
        must_see_poi_ids: optimizerPayload.must_see_poi_ids,
        must_see_names: optimizerPayload.must_see_poi_ids.map(id => {
          const p = cityPois.find(x => x.poi_id === id);
          return p ? p.name : id;
        })
      },
      narrative,
      explanation: narrative,
      plan: optimizerResult,
      summary: optimizerResult.summary,
      stops: optimizerResult.stops,
      transfers: optimizerResult.transfers,
      weights: optimizerResult.weights,
      normalized_metrics: optimizerResult.normalized_metrics,
      score: optimizerResult.score
    };
  }

  // Infeasible outcome -> Run diagnosis and single-constraint relaxation
  const diagnosis = diagnoseInfeasibility(optimizerPayload, optimizerResult.evaluated_attempts || []);
  const relaxation = findSingleConstraintRelaxation(optimizerPayload, diagnosis.binding_constraint, optimizeItinerary);

  let relaxedPlanData = null;
  if (relaxation && relaxation.plan && relaxation.plan.feasible) {
    relaxedPlanData = {
      feasible: true,
      constraint_type: relaxation.constraint_type,
      constraint_name: relaxation.name,
      original_value: relaxation.original_value,
      relaxed_value: relaxation.relaxed_value,
      difference: relaxation.difference_text,
      description: relaxation.description,
      summary: relaxation.plan.summary,
      stops: relaxation.plan.stops,
      transfers: relaxation.plan.transfers
    };
  }

  // Generate grounded infeasibility explanation
  let infeasibleExplanation = diagnosis.explanation;
  if (!usedFallback) {
    const aiInfeasibleExpl = await explainInfeasibilityWithLlm(diagnosis, prompt);
    if (aiInfeasibleExpl) {
      infeasibleExplanation = aiInfeasibleExpl;
    }
  }

  return {
    success: true,
    feasible: false,
    ai_status: {
      fallback: usedFallback,
      provider: providerName,
      message: usedFallback ? fallbackMessage : `Evaluated with ${providerName} (${modelName})`,
      model: modelName
    },
    city: {
      city_id: targetCity.city_id,
      name: targetCity.name,
      state: targetCity.state
    },
    parsed_intent: {
      budget_cap: optimizerPayload.budget_cap,
      carbon_cap_kg: optimizerPayload.carbon_cap_kg,
      day_start: optimizerPayload.day_start,
      day_end: optimizerPayload.day_end,
      weights: optimizerPayload.weights,
      must_see_poi_ids: optimizerPayload.must_see_poi_ids
    },
    binding_constraint: {
      type: diagnosis.binding_constraint?.type || 'TIME_LIMIT',
      message: diagnosis.explanation,
      ...diagnosis.binding_constraint
    },
    explanation: infeasibleExplanation,
    violations: diagnosis.violations,
    relaxation: relaxedPlanData ? {
      type: relaxedPlanData.constraint_type,
      constraint: relaxedPlanData.constraint_name,
      original_value: relaxedPlanData.original_value,
      relaxed_value: relaxedPlanData.relaxed_value,
      explanation: relaxedPlanData.description,
      // Backward-compatible properties
      original: relaxedPlanData.original_value,
      relaxed: relaxedPlanData.relaxed_value,
      description: relaxedPlanData.description
    } : null,
    relaxed_plan: relaxedPlanData
  };
}

module.exports = {
  generateAiPlan
};
