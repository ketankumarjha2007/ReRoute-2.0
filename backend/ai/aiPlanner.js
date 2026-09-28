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
 * Flow:
 *
 * User Natural Language
 *        ↓
 * Groq GPT-OSS
 *        ↓
 * Structured Intent
 *        ↓
 * Current Planner Context
 *        ↓
 * Real Database POI Resolution
 *        ↓
 * Deterministic Optimizer
 *        ↓
 * Real Itinerary + Metrics
 *        ↓
 * Grounded AI Explanation
 */

async function generateAiPlan(
  prompt,
  currentCityId = null,
  plannerContext = {}
) {
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
  // 0. NORMALIZE PLANNER CONTEXT
  // ============================================================

  const context =
    plannerContext &&
    typeof plannerContext === 'object'
      ? plannerContext
      : {};

  // ============================================================
  // 1. FETCH ACTIVE CITIES
  // ============================================================

  const cities = db
    .prepare(
      "SELECT city_id, name, state, country_code, region FROM cities WHERE status = 'active'"
    )
    .all();

  const cityNames = cities.map(
    (city) => city.name
  );

  // ============================================================
  // 2. EXTRACT STRUCTURED INTENT
  // ============================================================

  const llmResult =
    await extractIntentWithLlm(
      prompt,
      cityNames
    );

  let usedFallback = false;
  let fallbackMessage = '';
  let structured = null;

  let modelName =
    'Heuristic Intent Engine';

  let providerName = 'Local';

  if (
    llmResult.success &&
    llmResult.parsed
  ) {
    structured =
      llmResult.parsed;

    modelName =
      llmResult.model ||
      'openai/gpt-oss-20b';

    providerName =
      llmResult.provider ||
      'Groq';
  } else {
    usedFallback = true;

    fallbackMessage =
      'AI is temporarily offline. ReRoute is using smart deterministic fallback planning.';

    const localParsed =
      parseIntent(prompt);

    structured =
      localParsed.parsed;

    modelName =
      'Smart Heuristic Fallback Engine';

    providerName = 'Local';
  }

  // ============================================================
  // SAFETY GUARD
  // ============================================================

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
  // 2.5 MERGE CURRENT PLANNER CONTEXT
  // ============================================================
  //
  // The Planner UI is authoritative for the constraints
  // explicitly selected by the user.
  //
  // AI can understand the natural-language request and
  // determine preferences, but it must not silently remove
  // hard planner constraints.
  //
  // ============================================================

  // ------------------------------------------------------------
  // DATE
  // ------------------------------------------------------------

  if (context.day_date) {
    structured.day_date =
      context.day_date;
  }

  // ------------------------------------------------------------
  // DAY START
  // ------------------------------------------------------------

  if (context.day_start) {
    structured.day_start =
      context.day_start;
  }

  // ------------------------------------------------------------
  // DAY END
  // ------------------------------------------------------------

  if (context.day_end) {
    structured.day_end =
      context.day_end;
  }

  // ------------------------------------------------------------
  // BUDGET
  // ------------------------------------------------------------

  if (
    context.budget_cap !== null &&
    context.budget_cap !== undefined &&
    context.budget_cap !== ''
  ) {
    const contextBudget =
      Number(context.budget_cap);

    if (
      Number.isFinite(contextBudget) &&
      contextBudget > 0
    ) {
      structured.budget_cap =
        String(contextBudget);
    }
  }

  // ------------------------------------------------------------
  // CARBON CAP
  // ------------------------------------------------------------

  if (
    context.carbon_cap_kg !== null &&
    context.carbon_cap_kg !== undefined &&
    context.carbon_cap_kg !== ''
  ) {
    const contextCarbon =
      Number(context.carbon_cap_kg);

    if (
      Number.isFinite(contextCarbon) &&
      contextCarbon > 0
    ) {
      structured.carbon_cap_kg =
        contextCarbon;
    }
  }

  // ------------------------------------------------------------
  // HARD START
  // ------------------------------------------------------------

  if (context.start_poi_id) {
    structured.start_poi_id =
      context.start_poi_id;
  }

  // ------------------------------------------------------------
  // HARD END
  // ------------------------------------------------------------

  if (context.end_poi_id) {
    structured.end_poi_id =
      context.end_poi_id;
  }

  // ------------------------------------------------------------
  // HARD MUST-SEE POIs
  // ------------------------------------------------------------

  if (
    Array.isArray(
      context.must_see_poi_ids
    )
  ) {
    structured.must_see_poi_ids =
      context.must_see_poi_ids.filter(
        Boolean
      );
  }

  // ------------------------------------------------------------
  // ALLOWED TRANSPORT MODES
  // ------------------------------------------------------------

  if (
    Array.isArray(
      context.allowed_modes
    ) &&
    context.allowed_modes.length > 0
  ) {
    structured.allowed_modes =
      context.allowed_modes;
  }

  // ------------------------------------------------------------
  // PLANNER WEIGHTS
  // ------------------------------------------------------------

  if (
    context.weights &&
    typeof context.weights === 'object'
  ) {
    structured.weights =
      context.weights;
  }

  // ============================================================
  // 3. MATCH CITY STRICTLY FROM DATABASE
  // ============================================================

  let targetCity = null;

  if (structured.city_name) {
    const searchName =
      String(
        structured.city_name
      )
        .toLowerCase()
        .trim();

    targetCity = cities.find(
      (city) => {
        const cityName =
          String(city.name)
            .toLowerCase()
            .trim();

        return (
          cityName === searchName ||
          cityName.includes(searchName) ||
          searchName.includes(cityName)
        );
      }
    );

    // If an explicit city was requested but
    // it does not exist, do not silently switch.
    if (
      !targetCity &&
      searchName.length > 2
    ) {
      if (currentCityId) {
        targetCity =
          cities.find(
            (city) =>
              city.city_id ===
              currentCityId
          );
      }

      if (!targetCity) {
        return {
          success: false,
          error: {
            code: 'INVALID_CITY',
            message:
              `City "${structured.city_name}" is not available in the database. Please select from the 60+ supported cities.`
          }
        };
      }
    }
  }

  // Use current planner city when AI
  // did not provide a city.
  if (
    !targetCity &&
    currentCityId
  ) {
    targetCity =
      cities.find(
        (city) =>
          city.city_id ===
          currentCityId
      );
  }

  // Default to Bengaluru.
  if (!targetCity) {
    targetCity =
      cities.find(
        (city) =>
          String(city.name)
            .toLowerCase()
            .includes('bengaluru')
      ) ||
      cities[0];
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
  // 4. LOAD REAL POIs
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
        message:
          `No active attractions found in database for ${targetCity.name}.`
      }
    };
  }

  // ============================================================
  // 5. POI NORMALIZATION / RESOLUTION
  // ============================================================

  const normalizePoiText =
    (value) =>
      String(value || '')
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

  const resolvePoiId =
    (value) => {
      const query =
        normalizePoiText(value);

      if (!query) {
        return null;
      }

      // --------------------------------------------------------
      // Exact POI name
      // --------------------------------------------------------

      const exactMatch =
        cityPois.find(
          (poi) =>
            normalizePoiText(
              poi.name
            ) === query
        );

      if (exactMatch) {
        return exactMatch.poi_id;
      }

      // --------------------------------------------------------
      // Partial POI name
      // --------------------------------------------------------

      const nameMatch =
        cityPois.find(
          (poi) => {
            const name =
              normalizePoiText(
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

      // --------------------------------------------------------
      // Tags / category
      // --------------------------------------------------------

      const metadataMatch =
        cityPois.find(
          (poi) => {
            const tags =
              normalizePoiText(
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
  // 6. HARD START / END RESOLUTION
  // ============================================================

  const promptText =
    String(prompt || '');

  let resolvedStartPoiId =
    context.start_poi_id ||
    structured.start_poi_id ||
    null;

  let resolvedEndPoiId =
    context.end_poi_id ||
    structured.end_poi_id ||
    null;

  // ------------------------------------------------------------
  // START FROM NATURAL LANGUAGE
  // ------------------------------------------------------------

  const startPatterns = [
    /\bstart(?:ing)?\s+(?:at|from)\s+(.+?)(?=\s+(?:and\s+)?end(?:ing)?\s+(?:at|in|with)|$)/i,

    /\bbegin(?:ning)?\s+(?:at|from)\s+(.+?)(?=\s+(?:and\s+)?(?:end|finish)(?:ing)?\s+(?:at|in|with)|$)/i
  ];

  for (
    const pattern of startPatterns
  ) {
    const match =
      promptText.match(pattern);

    if (
      match &&
      match[1]
    ) {
      const id =
        resolvePoiId(match[1]);

      if (id) {
        resolvedStartPoiId =
          id;
        break;
      }
    }
  }

  // ------------------------------------------------------------
  // END FROM NATURAL LANGUAGE
  // ------------------------------------------------------------

  const endPatterns = [
    /\bend(?:ing)?\s+(?:at|in|with)\s+(.+)$/i,

    /\bfinish(?:ing)?\s+(?:at|in|with)\s+(.+)$/i
  ];

  for (
    const pattern of endPatterns
  ) {
    const match =
      promptText.match(pattern);

    if (
      match &&
      match[1]
    ) {
      const id =
        resolvePoiId(match[1]);

      if (id) {
        resolvedEndPoiId =
          id;
        break;
      }
    }
  }

  // ------------------------------------------------------------
  // SAVE RESOLVED ENDPOINTS
  // ------------------------------------------------------------

  if (resolvedStartPoiId) {
    structured.start_poi_id =
      resolvedStartPoiId;
  }

  if (resolvedEndPoiId) {
    structured.end_poi_id =
      resolvedEndPoiId;
  }

  // ============================================================
  // 7. BUILD MUST-SEE POI LIST
  // ============================================================

  const matchedPoiIds = [];

  // ------------------------------------------------------------
  // FIRST: PLANNER SELECTED MUST-SEE POIs
  // ------------------------------------------------------------

  if (
    Array.isArray(
      context.must_see_poi_ids
    )
  ) {
    for (
      const poiId of
        context.must_see_poi_ids
    ) {
      if (!poiId) {
        continue;
      }

      const realPoi =
        cityPois.find(
          (poi) =>
            String(poi.poi_id) ===
            String(poiId)
        );

      if (
        realPoi &&
        !matchedPoiIds.includes(
          realPoi.poi_id
        )
      ) {
        matchedPoiIds.push(
          realPoi.poi_id
        );
      }
    }
  }

  // Also respect IDs already returned
  // by the structured intent.
  if (
    Array.isArray(
      structured.must_see_poi_ids
    )
  ) {
    for (
      const poiId of
        structured.must_see_poi_ids
    ) {
      if (!poiId) {
        continue;
      }

      const realPoi =
        cityPois.find(
          (poi) =>
            String(poi.poi_id) ===
            String(poiId)
        );

      if (
        realPoi &&
        !matchedPoiIds.includes(
          realPoi.poi_id
        )
      ) {
        matchedPoiIds.push(
          realPoi.poi_id
        );
      }
    }
  }

  // ------------------------------------------------------------
  // SECOND: AI NATURAL-LANGUAGE KEYWORDS
  // ------------------------------------------------------------

  const keywords =
    Array.isArray(
      structured.must_see_keywords
    )
      ? structured.must_see_keywords
      : [];

  for (
    const keyword of keywords
  ) {
    const normalized =
      normalizePoiText(keyword);

    if (!normalized) {
      continue;
    }

    const matchedId =
      resolvePoiId(normalized);

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
  // 8. GENERIC DAY PLAN
  // ============================================================
  //
  // Only add generic POIs when the user has not already
  // specified must-see attractions.
  //
  // This prevents the AI from replacing the user's
  // selected attractions with random POIs.
  // ============================================================

  const hasExplicitAttractions =
    matchedPoiIds.length > 0;

  if (
    !hasExplicitAttractions
  ) {
    const genericCandidates =
      [...cityPois]
        .filter(
          (poi) =>
            Boolean(poi.poi_id)
        )
        .sort(
          (a, b) => {
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
              ) /
                250 -
              Math.max(
                durationA - 120,
                0
              ) /
                10;

            const scoreB =
              popularityB * 10 -
              Math.min(
                costB,
                2500
              ) /
                250 -
              Math.max(
                durationB - 120,
                0
              ) /
                10;

            if (
              scoreB !== scoreA
            ) {
              return (
                scoreB -
                scoreA
              );
            }

            return String(
              a.poi_id
            ).localeCompare(
              String(b.poi_id)
            );
          }
        );

    for (
      const poi of
        genericCandidates
    ) {
      // Don't use hard endpoints as
      // generic attraction selections.
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
  // 9. SAFETY FALLBACK
  // ============================================================

  if (
    matchedPoiIds.length === 0 &&
    cityPois.length > 0
  ) {
    const fallbackPoi =
      cityPois.find(
        (poi) =>
          poi.poi_id !==
            resolvedStartPoiId &&
          poi.poi_id !==
            resolvedEndPoiId
      ) ||
      cityPois[0];

    matchedPoiIds.push(
      fallbackPoi.poi_id
    );
  }

  // ============================================================
  // 10. DETECT PLANNING INTENT
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
  // 11. NORMALIZE OPTIMIZATION WEIGHTS
  // ============================================================
  //
  // IMPORTANT:
  // Never use:
  //
  //   value || fallback
  //
  // because 0 is a valid weight.
  // ============================================================

  const rawWeights =
    structured.weights &&
    typeof structured.weights ===
      'object'
      ? structured.weights
      : {
          cost: 0.30,
          time: 0.30,
          carbon: 0.40
        };

  const safeCost =
    Number.isFinite(
      Number(rawWeights.cost)
    )
      ? Number(rawWeights.cost)
      : 0.33;

  const safeTime =
    Number.isFinite(
      Number(rawWeights.time)
    )
      ? Number(rawWeights.time)
      : 0.33;

  const safeCarbon =
    Number.isFinite(
      Number(rawWeights.carbon)
    )
      ? Number(rawWeights.carbon)
      : 0.34;

  const sumW =
    safeCost +
    safeTime +
    safeCarbon;

  const normalizedWeights =
    sumW > 0
      ? {
          cost:
            Number(
              (
                safeCost /
                sumW
              ).toFixed(4)
            ),

          time:
            Number(
              (
                safeTime /
                sumW
              ).toFixed(4)
            ),

          carbon:
            Number(
              (
                safeCarbon /
                sumW
              ).toFixed(4)
            )
        }
      : {
          cost: 0.3333,
          time: 0.3333,
          carbon: 0.3334
        };

  // ============================================================
  // 12. BUILD OPTIMIZER PAYLOAD
  // ============================================================

  const optimizerPayload = {
    city_id:
      targetCity.city_id,

    day_date:
      structured.day_date ||
      context.day_date ||
      null,

    day_start:
      structured.day_start ||
      context.day_start ||
      '09:00',

    day_end:
      structured.day_end ||
      context.day_end ||
      '18:00',

    budget_cap:
      structured.budget_cap !==
        null &&
      structured.budget_cap !==
        undefined &&
      structured.budget_cap !== ''
        ? String(
            structured.budget_cap
          )
        : '2500',

    carbon_cap_kg:
      structured.carbon_cap_kg !==
        null &&
      structured.carbon_cap_kg !==
        undefined &&
      structured.carbon_cap_kg !== ''
        ? parseFloat(
            structured.carbon_cap_kg
          )
        : 10,

    // ----------------------------------------------------------
    // MUST-SEE POIs
    // ----------------------------------------------------------

    must_see_poi_ids:
      matchedPoiIds.slice(0, 3),

    // ----------------------------------------------------------
    // HARD START
    // ----------------------------------------------------------

    start_poi_id:
      resolvedStartPoiId ||
      structured.start_poi_id ||
      context.start_poi_id ||
      null,

    // ----------------------------------------------------------
    // HARD END
    // ----------------------------------------------------------

    end_poi_id:
      resolvedEndPoiId ||
      structured.end_poi_id ||
      context.end_poi_id ||
      null,

    // ----------------------------------------------------------
    // TRANSPORT
    // ----------------------------------------------------------

    allowed_modes:
      Array.isArray(
        structured.allowed_modes
      )
        ? structured.allowed_modes
        : Array.isArray(
            context.allowed_modes
          )
          ? context.allowed_modes
          : null,

    // ----------------------------------------------------------
    // WEIGHTS
    // ----------------------------------------------------------

    weights:
      normalizedWeights,

    // ----------------------------------------------------------
    // PLANNING INTENT
    // ----------------------------------------------------------

    planning_intent:
      planningIntent
  };

  // ============================================================
  // DEBUG LOG
  // ============================================================
  //
  // This is useful while testing Plan My Day.
  // It lets us verify that the optimizer is receiving the
  // actual constraints selected in the UI.
  // ============================================================

  console.log(
    '\n========== AI PLAN OPTIMIZER PAYLOAD =========='
  );

  console.log(
    JSON.stringify(
      {
        city_id:
          optimizerPayload.city_id,

        day_date:
          optimizerPayload.day_date,

        day_start:
          optimizerPayload.day_start,

        day_end:
          optimizerPayload.day_end,

        budget_cap:
          optimizerPayload.budget_cap,

        carbon_cap_kg:
          optimizerPayload.carbon_cap_kg,

        must_see_poi_ids:
          optimizerPayload.must_see_poi_ids,

        start_poi_id:
          optimizerPayload.start_poi_id,

        end_poi_id:
          optimizerPayload.end_poi_id,

        allowed_modes:
          optimizerPayload.allowed_modes,

        weights:
          optimizerPayload.weights,

        planning_intent:
          optimizerPayload.planning_intent
      },
      null,
      2
    )
  );

  console.log(
    '================================================\n'
  );

  // ============================================================
  // 13. EXECUTE DETERMINISTIC OPTIMIZER
  // ============================================================

  const optimizerResult =
    await optimizeItinerary(
      optimizerPayload
    );

  // ============================================================
  // 14. HANDLE FEASIBLE RESULT
  // ============================================================

  if (
    optimizerResult.feasible
  ) {
    let narrative = null;

    // ----------------------------------------------------------
    // AI NARRATIVE
    // ----------------------------------------------------------

    if (!usedFallback) {
      narrative =
        await generateNarrativeWithLlm(
          targetCity.name,
          optimizerResult.stops,
          optimizerResult.summary,
          prompt
        );
    }

    // ----------------------------------------------------------
    // DETERMINISTIC FALLBACK EXPLANATION
    // ----------------------------------------------------------

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

    // ==========================================================
    // FINAL SUCCESS RESPONSE
    // ==========================================================

    return {
      success: true,

      feasible: true,

      theme: themeTitle,

      ai_status: {
        fallback:
          usedFallback,

        provider:
          providerName,

        message:
          usedFallback
            ? fallbackMessage
            : `Plan generated with ${providerName} (${modelName})`,

        model:
          modelName
      },

      city: {
        city_id:
          targetCity.city_id,

        day_date:
          optimizerPayload.day_date,

        name:
          targetCity.name,

        state:
          targetCity.state,

        country_code:
          targetCity.country_code,

        region:
          targetCity.region
      },

      // ========================================================
      // RETURN PARSED INTENT
      // ========================================================

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
          optimizerPayload
            .must_see_poi_ids
            .map(
              (id) => {
                const poi =
                  cityPois.find(
                    (item) =>
                      item.poi_id ===
                      id
                  );

                return poi
                  ? poi.name
                  : id;
              }
            ),

        start_poi_id:
          optimizerPayload.start_poi_id,

        start_poi_name:
          optimizerPayload.start_poi_id
            ? (
                cityPois.find(
                  (poi) =>
                    poi.poi_id ===
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
                  (poi) =>
                    poi.poi_id ===
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
  // 15. DIAGNOSE INFEASIBILITY
  // ============================================================

  const diagnosis =
    diagnoseInfeasibility(
      optimizerPayload,
      optimizerResult.evaluated_attempts ||
        []
    );

  // ============================================================
  // 16. FIND SINGLE CONSTRAINT RELAXATION
  // ============================================================

  const relaxation =
    findSingleConstraintRelaxation(
      optimizerPayload,
      diagnosis.binding_constraint,
      optimizeItinerary
    );

  let relaxedPlanData =
    null;

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
  // 17. GROUNDED INFEASIBILITY EXPLANATION
  // ============================================================

  let infeasibleExplanation =
    diagnosis.explanation;

  if (!usedFallback) {
    const aiInfeasibleExplanation =
      await explainInfeasibilityWithLlm(
        diagnosis,
        prompt
      );

    if (aiInfeasibleExplanation) {
      infeasibleExplanation =
        aiInfeasibleExplanation;
    }
  }

  // ============================================================
  // 18. RETURN INFEASIBLE RESULT
  // ============================================================

  return {
    success: true,

    feasible: false,

    ai_status: {
      fallback:
        usedFallback,

      provider:
        providerName,

      message:
        usedFallback
          ? fallbackMessage
          : `Evaluated with ${providerName} (${modelName})`,

      model:
        modelName
    },

    city: {
      city_id:
        targetCity.city_id,

      day_date:
        optimizerPayload.day_date,

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

            original:
              relaxedPlanData.original_value,

            relaxed:
              relaxedPlanData.relaxed_value,

            explanation:
              relaxedPlanData.description,

            // Backward-compatible properties
            original_value:
              relaxedPlanData.original_value,

            relaxed_value:
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