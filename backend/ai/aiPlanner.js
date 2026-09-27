const db = require('../db');

const { parseIntent } = require('./intentParser');

const {
  extractIntentWithLlm,
  generateNarrativeWithLlm,
  explainInfeasibilityWithLlm
} = require('./aiClient');

const { optimizeItinerary } = require('../optimizer/optimizer');

const { diagnoseInfeasibility } = require('../optimizer/infeasibility');

const {
  findSingleConstraintRelaxation
} = require('../optimizer/relaxation');

const { generateExplanation } = require('./explainer');

/**
 * AI Plan My Day Engine
 *
 * Architecture:
 *
 * User Natural Language
 *        ↓
 * Groq GPT-OSS
 *        ↓
 * Structured Semantic Intent
 *        ↓
 * Real SQLite POI Resolution
 *        ↓
 * Authoritative Deterministic Optimizer
 *        ↓
 * Real Itinerary & Metrics
 *        ↓
 * Grounded AI Explanation / Infeasibility Narrative
 */

async function generateAiPlan(prompt, currentCityId = null) {
  if (!prompt || typeof prompt !== 'string') {
    return {
      success: false,
      error: {
        code: 'MISSING_PROMPT',
        message: 'Prompt is required'
      }
    };
  }

  // ============================================================
  // 1. FETCH ACTIVE CITIES
  // ============================================================

  const cities = db
    .prepare(
      "SELECT city_id, name, state, country_code, region FROM cities WHERE status = 'active'"
    )
    .all();

  const cityNames = cities.map((c) => c.name);

  // ============================================================
  // 2. EXTRACT STRUCTURED INTENT
  // ============================================================

  const llmResult = await extractIntentWithLlm(
    prompt,
    cityNames
  );

  let usedFallback = false;
  let fallbackMessage = '';
  let structured = null;

  let modelName = 'Heuristic Intent Engine';
  let providerName = 'Local';

  if (llmResult.success && llmResult.parsed) {
    structured = llmResult.parsed;

    modelName =
      llmResult.model ||
      'openai/gpt-oss-20b';

    providerName =
      llmResult.provider ||
      'Groq';
  } else {
    // Run deterministic smart fallback parser

    usedFallback = true;

    fallbackMessage =
      'AI is temporarily offline. ReRoute is using smart deterministic fallback planning.';

    const localParsed = parseIntent(prompt);

    structured = localParsed.parsed;

    modelName =
      'Smart Heuristic Fallback Engine';

    providerName = 'Local';
  }

  // Safety guard in case the parser returns no structured data.
  if (!structured) {
    return {
      success: false,
      error: {
        code: 'INVALID_INTENT',
        message:
          'Unable to understand the planning request.'
      }
    };
  }

  // ============================================================
  // 3. MATCH CITY STRICTLY FROM SQLITE
  // ============================================================

  let targetCity = null;

  if (structured.city_name) {
    const searchName =
      String(structured.city_name)
        .toLowerCase()
        .trim();

    targetCity = cities.find((c) => {
      const cName =
        String(c.name)
          .toLowerCase()
          .trim();

      return (
        cName === searchName ||
        cName.includes(searchName) ||
        searchName.includes(cName)
      );
    });

    // If traveler explicitly requested a named city
    // that does not exist, do not silently switch.
    if (
      !targetCity &&
      searchName.length > 2
    ) {
      // Check if currentCityId was provided as fallback
      if (currentCityId) {
        targetCity = cities.find(
          (c) =>
            c.city_id === currentCityId
        );
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
    targetCity = cities.find(
      (c) => c.city_id === currentCityId
    );
  }

  // Default to Bengaluru or first city
  // if no city was named at all.
  if (!targetCity) {
    targetCity =
      cities.find((c) =>
        c.name
          .toLowerCase()
          .includes('bengaluru')
      ) || cities[0];
  }

  if (!targetCity) {
    return {
      success: false,
      error: {
        code: 'NO_CITY_AVAILABLE',
        message:
          'No active cities are available in the database.'
      }
    };
  }

  // ============================================================
  // 4. GROUND POIs FROM THE REAL DATABASE
  // ============================================================

  const cityPois = db
    .prepare(
      `
      SELECT
        poi_id,
        name,
        poi_category,
        typical_duration_minutes,
        entry_cost,
        carbon_kg,
        opens_at,
        closes_at,
        closed_days,
        tags,
        description,
        popularity_score
      FROM activities_poi
      WHERE city_id = ?
        AND status = 'active'
      ORDER BY popularity_score DESC
      `
    )
    .all(targetCity.city_id);

  if (cityPois.length === 0) {
    return {
      success: false,
      error: {
        code: 'CITY_NO_POIS',
        message: `No active attractions found in database for ${targetCity.name}.`
      }
    };
  }

  // ============================================================
  // A. RESOLVE EXPLICITLY REQUESTED ATTRACTIONS
  // ============================================================
  //
  // If the traveler explicitly mentions places, those places
  // remain the primary must-see POIs.
  //
  // Examples:
  //
  // "Visit Bangalore Palace and Cubbon Park"
  // "I want to see museums and parks"
  //
  // These are resolved against real SQLite POIs.
  // ============================================================

  const matchedPoiIds = [];

  const keywords = Array.isArray(
    structured.must_see_keywords
  )
    ? structured.must_see_keywords
    : [];

  // ============================================================
  // NORMALIZE POI TEXT
  // ============================================================

  const normalizePoiText = (value) =>
    String(value || '')
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  // ============================================================
  // RESOLVE A REAL POI FROM THE DATABASE
  // ============================================================

  const resolvePoiId = (value) => {
    const query = normalizePoiText(value);

    if (!query) {
      return null;
    }

    // ----------------------------------------------------------
    // 1. EXACT POI NAME
    // ----------------------------------------------------------

    const exactMatch = cityPois.find(
      (poi) =>
        normalizePoiText(poi.name) === query
    );

    if (exactMatch) {
      return exactMatch.poi_id;
    }

    // ----------------------------------------------------------
    // 2. PARTIAL POI NAME
    // ----------------------------------------------------------

    const nameMatch = cityPois.find(
      (poi) => {
        const name = normalizePoiText(
          poi.name
        );

        return (
          name.includes(query) ||
          query.includes(name)
        );
      }
    );

    if (nameMatch) {
      return nameMatch.poi_id;
    }

    // ----------------------------------------------------------
    // 3. TAGS / CATEGORY
    // ----------------------------------------------------------

    const metadataMatch = cityPois.find(
      (poi) => {
        const tags = normalizePoiText(
          poi.tags
        );

        const category =
          normalizePoiText(
            poi.poi_category
          );

        return (
          tags.includes(query) ||
          category.includes(query)
        );
      }
    );

    return metadataMatch
      ? metadataMatch.poi_id
      : null;
  };

  // ============================================================
  // EXTRACT HARD START / END LOCATIONS FROM USER PROMPT
  // ============================================================

  const promptText = String(
    prompt || ''
  );

  let resolvedStartPoiId = null;
  let resolvedEndPoiId = null;

  // ------------------------------------------------------------
  // START LOCATION
  // ------------------------------------------------------------

  const startPatterns = [
    /\bstart(?:ing)?\s+(?:at|from)\s+(.+?)(?=\s+(?:and\s+)?end(?:ing)?\s+(?:at|in|with)|$)/i,

    /\bbegin(?:ning)?\s+(?:at|from)\s+(.+?)(?=\s+(?:and\s+)?(?:end|finish)(?:ing)?\s+(?:at|in|with)|$)/i
  ];

  for (const pattern of startPatterns) {
    const match =
      promptText.match(pattern);

    if (
      match &&
      match[1]
    ) {
      resolvedStartPoiId =
        resolvePoiId(match[1]);

      if (resolvedStartPoiId) {
        break;
      }
    }
  }

  // ------------------------------------------------------------
  // END LOCATION
  // ------------------------------------------------------------

  const endPatterns = [
    /\bend(?:ing)?\s+(?:at|in|with)\s+(.+)$/i,

    /\bfinish(?:ing)?\s+(?:at|in|with)\s+(.+)$/i
  ];

  for (const pattern of endPatterns) {
    const match =
      promptText.match(pattern);

    if (
      match &&
      match[1]
    ) {
      resolvedEndPoiId =
        resolvePoiId(match[1]);

      if (resolvedEndPoiId) {
        break;
      }
    }
  }

  // ============================================================
  // STORE RESOLVED HARD ENDPOINTS
  // ============================================================

  if (resolvedStartPoiId) {
    structured.start_poi_id =
      resolvedStartPoiId;
  }

  if (resolvedEndPoiId) {
    structured.end_poi_id =
      resolvedEndPoiId;
  }

  // ============================================================
  // MATCH EXPLICIT MUST-SEE KEYWORDS
  // ============================================================

  for (const kw of keywords) {
    const kwLower =
      normalizePoiText(kw);

    if (!kwLower) {
      continue;
    }

    const matchedId =
      resolvePoiId(kwLower);

    if (
      matchedId &&
      !matchedPoiIds.includes(
        matchedId
      )
    ) {
      matchedPoiIds.push(
        matchedId
      );
    }
  }

  // ============================================================
  // GENERIC DAY PLAN
  // ============================================================
  //
  // For a generic request such as:
  //
  // "Plan a day in Bengaluru with ₹2500 budget"
  //
  // there may be no explicit must-see POIs.
  //
  // Select up to 3 strong real POIs so the optimizer
  // can build an actual multi-stop day.
  //
  // Hard start/end locations are excluded from this generic
  // attraction selection because they are route constraints.
  // ============================================================

  const hasExplicitAttractions =
    matchedPoiIds.length > 0;

  if (!hasExplicitAttractions) {
    const genericCandidates =
      [...cityPois]
        .filter(
          (poi) =>
            Boolean(poi.poi_id)
        )
        .sort((a, b) => {
          const popularityA =
            Number(
              a.popularity_score || 0
            );

          const popularityB =
            Number(
              b.popularity_score || 0
            );

          const costA =
            Number(
              a.entry_cost || 0
            );

          const costB =
            Number(
              b.entry_cost || 0
            );

          const durationA =
            Number(
              a.typical_duration_minutes ||
                60
            );

          const durationB =
            Number(
              b.typical_duration_minutes ||
                60
            );

          const scoreA =
            popularityA * 10 -
            Math.min(
              costA,
              2500
            ) / 250 -
            Math.max(
              durationA - 120,
              0
            ) / 10;

          const scoreB =
            popularityB * 10 -
            Math.min(
              costB,
              2500
            ) / 250 -
            Math.max(
              durationB - 120,
              0
            ) / 10;

          if (scoreB !== scoreA) {
            return scoreB - scoreA;
          }

          return String(
            a.poi_id
          ).localeCompare(
            String(b.poi_id)
          );
        });

    for (
      const poi of genericCandidates
    ) {
      // Do not duplicate hard start/end
      // locations as generic must-see POIs.
      if (
        poi.poi_id ===
          resolvedStartPoiId ||
        poi.poi_id ===
          resolvedEndPoiId
      ) {
        continue;
      }

      matchedPoiIds.push(
        poi.poi_id
      );

      if (
        matchedPoiIds.length >= 3
      ) {
        break;
      }
    }
  }

  // ============================================================
  // FINAL SAFETY FALLBACK
  // ============================================================

  if (
    matchedPoiIds.length === 0 &&
    cityPois.length > 0
  ) {
    // Prefer a POI that is not a hard endpoint.
    const fallbackPoi =
      cityPois.find(
        (poi) =>
          poi.poi_id !==
            resolvedStartPoiId &&
          poi.poi_id !==
            resolvedEndPoiId
      ) || cityPois[0];

    matchedPoiIds.push(
      fallbackPoi.poi_id
    );
  }

  // ============================================================
  // 5. DETECT PLANNING INTENT
  // ============================================================

  const lowerPrompt =
    prompt.toLowerCase();

  const planningIntent =
    /plan my day|plan my day out|create a day plan|make me a day plan|plan a day|suggest a day itinerary|plan an itinerary|create an itinerary/.test(
      lowerPrompt
    )
      ? 'day_plan'
      : 'route_optimization';

  // ============================================================
  // 6. BUILD OPTIMIZER PAYLOAD
  // ============================================================

  const rawWeights =
    structured.weights || {
      cost: 0.30,
      time: 0.30,
      carbon: 0.40
    };

  const sumW =
    (rawWeights.cost || 0.33) +
    (rawWeights.time || 0.33) +
    (rawWeights.carbon || 0.34);

  const normalizedWeights = {
    cost: Number(
      (
        (rawWeights.cost || 0.33) /
        sumW
      ).toFixed(2)
    ),

    time: Number(
      (
        (rawWeights.time || 0.33) /
        sumW
      ).toFixed(2)
    ),

    carbon: Number(
      (
        (rawWeights.carbon || 0.34) /
        sumW
      ).toFixed(2)
    )
  };

  const optimizerPayload = {
    city_id:
      targetCity.city_id,

    day_date:
      structured.day_date,

    day_start:
      structured.day_start ||
      '09:00',

    day_end:
      structured.day_end ||
      '18:00',

    budget_cap:
      structured.budget_cap
        ? String(
            structured.budget_cap
          )
        : '2500',

    carbon_cap_kg:
      structured.carbon_cap_kg
        ? parseFloat(
            structured.carbon_cap_kg
          )
        : 10,

    // ----------------------------------------------------------
    // MUST-SEE POIs
    // ----------------------------------------------------------

    // Generic AI requests receive up to 3 real POIs.
    must_see_poi_ids:
      matchedPoiIds.slice(0, 3),

    // ----------------------------------------------------------
    // HARD START / END CONSTRAINTS
    // ----------------------------------------------------------

    start_poi_id:
      structured.start_poi_id || null,

    end_poi_id:
      structured.end_poi_id || null,

    // ----------------------------------------------------------
    // ALLOWED TRANSPORT MODES
    // ----------------------------------------------------------

    allowed_modes:
      Array.isArray(
        structured.allowed_modes
      )
        ? structured.allowed_modes
        : null,

    // ----------------------------------------------------------
    // OPTIMIZATION WEIGHTS
    // ----------------------------------------------------------

    weights:
      normalizedWeights,

    planning_intent:
      planningIntent
  };

  // ============================================================
  // 7. EXECUTE DETERMINISTIC OPTIMIZER
  // ============================================================

  const optimizerResult =
    await optimizeItinerary(
      optimizerPayload
    );

  // ============================================================
  // 8. HANDLE FEASIBLE RESULT
  // ============================================================

  if (optimizerResult.feasible) {
    // Generate AI narrative grounded
    // in calculated metrics.

    let narrative = null;

    if (!usedFallback) {
      narrative =
        await generateNarrativeWithLlm(
          targetCity.name,
          optimizerResult.stops,
          optimizerResult.summary,
          prompt
        );
    }

    if (!narrative) {
      narrative =
        generateExplanation(
          optimizerResult,
          optimizerPayload.weights
        );
    }

    const themeTitle =
      structured.theme ||
      'Optimized Multi-Objective Journey';

    return {
      success: true,

      feasible: true,

      theme: themeTitle,

      ai_status: {
        fallback: usedFallback,

        provider:
          providerName,

        message: usedFallback
          ? fallbackMessage
          : `Plan generated with ${providerName} (${modelName})`,

        model: modelName
      },

      city: {
        city_id:
          targetCity.city_id,

        day_date:
          structured.day_date,

        name:
          targetCity.name,

        state:
          targetCity.state,

        country_code:
          targetCity.country_code,

        region:
          targetCity.region
      },

      parsed_intent: {
        budget_cap:
          optimizerPayload.budget_cap,

        carbon_cap_kg:
          optimizerPayload.carbon_cap_kg,

        day_date:
          optimizerPayload.day_date,

        day_start:
          optimizerPayload.day_start,

        day_end:
          optimizerPayload.day_end,

        weights:
          optimizerPayload.weights,

        must_see_poi_ids:
          optimizerPayload.must_see_poi_ids,

        must_see_names:
          optimizerPayload.must_see_poi_ids.map(
            (id) => {
              const p =
                cityPois.find(
                  (x) =>
                    x.poi_id === id
                );

              return p
                ? p.name
                : id;
            }
          ),

        start_poi_id:
          optimizerPayload.start_poi_id,

        start_poi_name:
          optimizerPayload.start_poi_id
            ? (
                cityPois.find(
                  (p) =>
                    p.poi_id ===
                    optimizerPayload.start_poi_id
                ) || {}
              ).name || null
            : null,

        end_poi_id:
          optimizerPayload.end_poi_id,

        end_poi_name:
          optimizerPayload.end_poi_id
            ? (
                cityPois.find(
                  (p) =>
                    p.poi_id ===
                    optimizerPayload.end_poi_id
                ) || {}
              ).name || null
            : null,

        allowed_modes:
          optimizerPayload.allowed_modes
      },

      narrative,

      explanation:
        narrative,

      plan:
        optimizerResult,

      summary:
        optimizerResult.summary,

      stops:
        optimizerResult.stops,

      transfers:
        optimizerResult.transfers,

      weights:
        optimizerResult.weights,

      normalized_metrics:
        optimizerResult.normalized_metrics,

      score:
        optimizerResult.score
    };
  }

  // ============================================================
  // 9. INFEASIBLE OUTCOME
  // ============================================================

  const diagnosis =
    diagnoseInfeasibility(
      optimizerPayload,
      optimizerResult.evaluated_attempts ||
        []
    );

  const relaxation =
    findSingleConstraintRelaxation(
      optimizerPayload,
      diagnosis.binding_constraint,
      optimizeItinerary
    );

  let relaxedPlanData = null;

  if (
    relaxation &&
    relaxation.plan &&
    relaxation.plan.feasible
  ) {
    relaxedPlanData = {
      feasible: true,

      constraint_type:
        relaxation.constraint_type,

      constraint_name:
        relaxation.name,

      original_value:
        relaxation.original_value,

      relaxed_value:
        relaxation.relaxed_value,

      difference:
        relaxation.difference_text,

      description:
        relaxation.description,

      summary:
        relaxation.plan.summary,

      stops:
        relaxation.plan.stops,

      transfers:
        relaxation.plan.transfers
    };
  }

  // ============================================================
  // 10. GROUNDED INFEASIBILITY EXPLANATION
  // ============================================================

  let infeasibleExplanation =
    diagnosis.explanation;

  if (!usedFallback) {
    const aiInfeasibleExpl =
      await explainInfeasibilityWithLlm(
        diagnosis,
        prompt
      );

    if (aiInfeasibleExpl) {
      infeasibleExplanation =
        aiInfeasibleExpl;
    }
  }

  // ============================================================
  // 11. RETURN INFEASIBLE RESULT
  // ============================================================

  return {
    success: true,

    feasible: false,

    ai_status: {
      fallback: usedFallback,

      provider:
        providerName,

      message: usedFallback
        ? fallbackMessage
        : `Evaluated with ${providerName} (${modelName})`,

      model: modelName
    },

    city: {
      city_id:
        targetCity.city_id,

      day_date:
        structured.day_date,

      name:
        targetCity.name,

      state:
        targetCity.state
    },

    parsed_intent: {
      budget_cap:
        optimizerPayload.budget_cap,

      carbon_cap_kg:
        optimizerPayload.carbon_cap_kg,

      day_date:
        optimizerPayload.day_date,

      day_start:
        optimizerPayload.day_start,

      day_end:
        optimizerPayload.day_end,

      weights:
        optimizerPayload.weights,

      must_see_poi_ids:
        optimizerPayload.must_see_poi_ids,

      start_poi_id:
        optimizerPayload.start_poi_id,

      end_poi_id:
        optimizerPayload.end_poi_id,

      allowed_modes:
        optimizerPayload.allowed_modes
    },

    binding_constraint: {
      type:
        diagnosis.binding_constraint?.type ||
        'TIME_LIMIT',

      message:
        diagnosis.explanation,

      ...diagnosis.binding_constraint
    },

    explanation:
      infeasibleExplanation,

    violations:
      diagnosis.violations,

    relaxation:
      relaxedPlanData
        ? {
            type:
              relaxedPlanData.constraint_type,

            constraint:
              relaxedPlanData.constraint_name,

            original_value:
              relaxedPlanData.original_value,

            relaxed_value:
              relaxedPlanData.relaxed_value,

            explanation:
              relaxedPlanData.description,

            // Backward-compatible properties
            original:
              relaxedPlanData.original_value,

            relaxed:
              relaxedPlanData.relaxed_value,

            description:
              relaxedPlanData.description
          }
        : null,

    relaxed_plan:
      relaxedPlanData
  };
}

module.exports = {
  generateAiPlan
};