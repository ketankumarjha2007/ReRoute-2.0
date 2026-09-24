const supabase = require('../supabase');

const {
  timeToMinutes,
  minutesToTime,
  moneyToCents,
  centsToMoney,
  checkOpeningHours
} = require('./constraints');

const {
  normalizeWeights,
  scoreCandidates
} = require('./scoring');

const {
  validatePlanConstraints
} = require('./feasibility');

/**
 * ============================================================
 * SUPABASE DATA LOADER
 * ============================================================
 *
 * Loads all active POIs for a city and the corresponding
 * travel matrix into memory before running the DFS optimizer.
 *
 * This replaces the old SQLite-based implementation.
 */
async function loadCityData(cityId, candidateIds = null) {

  if (!cityId) {
    throw new Error('city_id is required');
  }

  // ------------------------------------------------------------
  // 1. Load active POIs
  // ------------------------------------------------------------
  const { data: poisData, error: poisError } = await supabase
    .from('activities_poi')
    .select('*')
    .eq('city_id', cityId)
    .eq('status', 'active');

  if (poisError) {
    throw new Error(
      `Failed to load POIs from Supabase: ${poisError.message}`
    );
  }

  let pois = poisData || [];

  // ------------------------------------------------------------
  // 2. Filter candidate POIs if supplied
  // ------------------------------------------------------------
  if (candidateIds && Array.isArray(candidateIds) && candidateIds.length > 0) {

    const candidateSet = new Set(candidateIds);

    pois = pois.filter(
      poi => candidateSet.has(poi.poi_id)
    );
  }

  // ------------------------------------------------------------
  // 3. Build POI lookup map
  // ------------------------------------------------------------
  const poiMap = new Map();

  for (const p of pois) {

    poiMap.set(p.poi_id, {
      ...p,

      // IMPORTANT:
      // Money is converted directly into integer cents.
      // We do not perform arithmetic using floating-point money.
      cost_cents: moneyToCents(p.entry_cost),

      carbon_kg: Number(p.carbon_kg || 0),

      duration_minutes:
        Number(p.typical_duration_minutes || 60)
    });
  }

  // ------------------------------------------------------------
  // 4. If no POIs remain, return empty graph
  // ------------------------------------------------------------
  if (pois.length === 0) {
    return {
      poiMap,
      edgeMap: new Map(),
      allPois: []
    };
  }

  // ------------------------------------------------------------
  // 5. Get POI IDs
  // ------------------------------------------------------------
  const poiIdList = pois.map(
    poi => poi.poi_id
  );

  // ------------------------------------------------------------
  // 6. Load travel matrix
  //
  // We fetch every edge whose origin and destination belong
  // to the selected city's POIs.
  // ------------------------------------------------------------
  const { data: edgesData, error: edgesError } = await supabase
    .from('poi_travel_matrix')
    .select(`
      origin_poi_id,
      dest_poi_id,
      mode,
      minutes,
      distance_km,
      carbon_kg,
      cost,
      currency
    `)
    .in('origin_poi_id', poiIdList)
    .in('dest_poi_id', poiIdList);

  if (edgesError) {
    throw new Error(
      `Failed to load travel matrix from Supabase: ${edgesError.message}`
    );
  }

  const edges = edgesData || [];

  // ------------------------------------------------------------
  // 7. Build edge lookup map
  //
  // key:
  // origin_poi_id_destination_poi_id
  //
  // value:
  // [walk edge, cab edge, bus edge, etc.]
  // ------------------------------------------------------------
  const edgeMap = new Map();

  for (const e of edges) {

    const key =
      `${e.origin_poi_id}_${e.dest_poi_id}`;

    if (!edgeMap.has(key)) {
      edgeMap.set(key, []);
    }

    edgeMap.get(key).push({

      ...e,

      // Keep monetary arithmetic integer-safe.
      cost_cents: moneyToCents(e.cost),

      carbon_kg:
        Number(e.carbon_kg || 0),

      minutes:
        Number(e.minutes || 0),

      distance_km:
        Number(e.distance_km || 0)
    });
  }

  return {
    poiMap,
    edgeMap,
    allPois: pois
  };
}


/**
 * ============================================================
 * SELECT BEST TRAVEL EDGE
 * ============================================================
 *
 * Chooses the best transport mode for a single leg based on:
 *
 *   cost weight
 *   time weight
 *   carbon weight
 *
 * Also respects:
 *
 *   allowed_modes
 *   destination opening hours
 */
function chooseBestEdge(
  edges,
  weights,
  allowedModes = null,
  currentDepartureMins = null,
  destPoi = null
) {

  if (!edges || edges.length === 0) {
    return null;
  }

  let candidates = edges;

  // ------------------------------------------------------------
  // Allowed transport modes
  // ------------------------------------------------------------
  if (allowedModes && allowedModes.length > 0) {

    const allowed = new Set(
      (
        Array.isArray(allowedModes)
          ? allowedModes
          : allowedModes.split(',')
      )
        .map(m => m.trim().toLowerCase())
    );

    candidates = candidates.filter(
      edge =>
        edge.mode &&
        allowed.has(edge.mode.toLowerCase())
    );
  }

  if (candidates.length === 0) {
    return null;
  }

  // ------------------------------------------------------------
  // Prefer modes that can reach the destination in time
  // ------------------------------------------------------------
  if (
    destPoi &&
    currentDepartureMins !== null &&
    destPoi.closes_at
  ) {

    const closeMins =
      timeToMinutes(destPoi.closes_at);

    const duration =
      destPoi.duration_minutes || 60;

    const timeViable = candidates.filter(edge => {

      const arrival =
        currentDepartureMins + edge.minutes;

      const start =
        destPoi.opens_at
          ? Math.max(
              arrival,
              timeToMinutes(destPoi.opens_at)
            )
          : arrival;

      return (
        start + duration <= closeMins
      );
    });

    if (timeViable.length > 0) {
      candidates = timeViable;
    }
  }

  if (candidates.length === 1) {
    return candidates[0];
  }

  const nw = normalizeWeights(weights);

  // ------------------------------------------------------------
  // Weighted deterministic scoring
  // ------------------------------------------------------------
  let bestEdge = candidates[0];
  let bestScore = Infinity;

  for (const edge of candidates) {

    /*
     * Normalization:
     *
     * cost   → ₹500
     * time   → 60 minutes
     * carbon → 5 kg
     *
     * Cost is represented in cents.
     */
    const normCost =
      edge.cost_cents / 50000;

    const normTime =
      edge.minutes / 60;

    const normCarbon =
      edge.carbon_kg / 5;

    const score =
      (nw.cost * normCost) +
      (nw.time * normTime) +
      (nw.carbon * normCarbon);

    if (score < bestScore) {

      bestScore = score;
      bestEdge = edge;

    } else if (
      Math.abs(score - bestScore) < 1e-6
    ) {

      // Deterministic tie-breaking:
      //
      // 1. Lower carbon
      // 2. Lower cost
      // 3. Lower travel time
      // 4. Alphabetical mode
      if (
        edge.carbon_kg <
        bestEdge.carbon_kg
      ) {

        bestEdge = edge;

      } else if (
        edge.cost_cents <
        bestEdge.cost_cents
      ) {

        bestEdge = edge;

      } else if (
        edge.minutes <
        bestEdge.minutes
      ) {

        bestEdge = edge;

      } else if (
        edge.mode < bestEdge.mode
      ) {

        bestEdge = edge;
      }
    }
  }

  return bestEdge;
}


/**
 * ============================================================
 * EVALUATE SEQUENCE
 * ============================================================
 *
 * Converts a sequence of POI IDs into a complete itinerary.
 */
function evaluateSequence(
  sequence,
  poiMap,
  edgeMap,
  options
) {

  const {
    day_start = '09:00',
    weights = {
      cost: 0.33,
      time: 0.33,
      carbon: 0.34
    },
    allowed_modes = null
  } = options;

  let currentMins =
    timeToMinutes(day_start);

  const stops = [];
  const transfers = [];

  const openingHourViolations = [];
  const missingEdges = [];

  let totalCostCents = 0;
  let totalCarbonKg = 0;

  let totalActivityMins = 0;
  let totalTravelMins = 0;
  let totalWaitMins = 0;

  // ------------------------------------------------------------
  // Process every POI in the sequence
  // ------------------------------------------------------------
  for (
    let i = 0;
    i < sequence.length;
    i++
  ) {

    const poiId = sequence[i];

    const poi =
      poiMap.get(poiId);

    if (!poi) {
      return null;
    }

    // ----------------------------------------------------------
    // Travel from previous POI
    // ----------------------------------------------------------
    if (i > 0) {

      const prevPoiId =
        sequence[i - 1];

      const key =
        `${prevPoiId}_${poiId}`;

      const edges =
        edgeMap.get(key) || [];

      const edge =
        chooseBestEdge(
          edges,
          weights,
          allowed_modes,
          currentMins,
          poi
        );

      if (!edge) {

        missingEdges.push({
          from: prevPoiId,
          to: poiId
        });

        /*
         * Diagnostic fallback only.
         *
         * This plan will still be rejected by
         * validatePlanConstraints because
         * missing_edges is recorded.
         */
        currentMins += 30;

      } else {

        transfers.push({

          from_poi_id:
            edge.origin_poi_id,

          to_poi_id:
            edge.dest_poi_id,

          mode:
            edge.mode,

          minutes:
            edge.minutes,

          distance_km:
            Number(edge.distance_km || 0),

          cost:
            centsToMoney(
              edge.cost_cents
            ),

          cost_cents:
            edge.cost_cents,

          carbon_kg:
            Number(
              edge.carbon_kg.toFixed(3)
            ),

          departure_time:
            minutesToTime(currentMins),

          arrival_time:
            minutesToTime(
              currentMins + edge.minutes
            )
        });

        currentMins +=
          edge.minutes;

        totalTravelMins +=
          edge.minutes;

        totalCostCents +=
          edge.cost_cents;

        totalCarbonKg +=
          edge.carbon_kg;
      }
    }

    // ----------------------------------------------------------
    // Arrival + opening hours
    // ----------------------------------------------------------
    const arrivalTime =
      minutesToTime(currentMins);

    const duration =
      poi.duration_minutes;

    const ohCheck =
      checkOpeningHours(
        currentMins,
        duration,
        poi.opens_at,
        poi.closes_at
      );

    if (!ohCheck.valid) {

      openingHourViolations.push({

        poi_id:
          poi.poi_id,

        name:
          poi.name,

        opens_at:
          poi.opens_at,

        closes_at:
          poi.closes_at,

        arrival:
          arrivalTime,

        departure:
          minutesToTime(
            ohCheck.actualEndMins
          ),

        reason:
          ohCheck.reason
      });
    }

    const waitTime =
      ohCheck.waitTime;

    totalWaitMins +=
      waitTime;

    const startMins =
      ohCheck.actualStartMins;

    const endMins =
      ohCheck.actualEndMins;

    // ----------------------------------------------------------
    // Add stop
    // ----------------------------------------------------------
    stops.push({

      poi_id:
        poi.poi_id,

      name:
        poi.name,

      category:
        poi.poi_category,

      arrival:
        arrivalTime,

      departure:
        minutesToTime(endMins),

      duration_minutes:
        duration,

      wait_minutes:
        waitTime,

      entry_cost:
        centsToMoney(
          poi.cost_cents
        ),

      entry_cost_cents:
        poi.cost_cents,

      currency:
        poi.currency || 'INR',

      carbon_kg:
        Number(
          poi.carbon_kg.toFixed(3)
        ),

      lat:
        poi.lat,

      lng:
        poi.lng,

      opens_at:
        poi.opens_at,

      closes_at:
        poi.closes_at
    });

    currentMins =
      endMins;

    totalActivityMins +=
      duration;

    totalCostCents +=
      poi.cost_cents;

    totalCarbonKg +=
      poi.carbon_kg;
  }

  // ------------------------------------------------------------
  // Final summary
  // ------------------------------------------------------------
  const startMins =
    timeToMinutes(day_start);

  const totalMinutes =
    currentMins - startMins;

  return {

    stops,

    transfers,

    opening_hour_violations:
      openingHourViolations,

    missing_edges:
      missingEdges,

    summary: {

      cost:
        centsToMoney(
          totalCostCents
        ),

      cost_cents:
        totalCostCents,

      currency:
        'INR',

      minutes:
        totalMinutes,

      activity_minutes:
        totalActivityMins,

      travel_minutes:
        totalTravelMins,

      wait_minutes:
        totalWaitMins,

      carbon_kg:
        Number(
          totalCarbonKg.toFixed(3)
        ),

      day_start,

      day_end:
        minutesToTime(currentMins),

      stops_count:
        stops.length
    }
  };
}


/**
 * ============================================================
 * MAIN DETERMINISTIC OPTIMIZER
 * ============================================================
 *
 * IMPORTANT:
 * This function is now ASYNC because the POI/travel graph
 * comes from Supabase.
 */
async function optimizeItinerary(options) {

  const {
  city_id,

  day_start = '09:00',

  day_end = '18:00',

  budget_cap,

  carbon_cap_kg,

  must_see_poi_ids = [],

  candidate_poi_ids = null,

  start_poi_id = null,

  end_poi_id = null,

  allowed_modes = null,

  weights = {
    cost: 0.33,
    time: 0.33,
    carbon: 0.34
  },

  max_activities = 6,

  // Temporary opening-hours changes used by
  // the single-constraint relaxation engine.
  opening_hours_overrides = {}

} = options;

  // ==========================================================
  // LOAD CITY GRAPH FROM SUPABASE
  // ==========================================================

  const {
    poiMap,
    edgeMap,
    allPois
  } = await loadCityData(
    city_id,
    candidate_poi_ids
  );

// ==========================================================
// APPLY OPENING-HOURS OVERRIDES
// ==========================================================
//
// These temporary overrides are used by the
// single-constraint relaxation engine.
//
// Supported keys:
//   - POI ID:  "poi_xxxxx"
//   - POI name: "name:Sunset Point"
//
// They affect only this optimizer run.
// ==========================================================

if (
  opening_hours_overrides &&
  typeof opening_hours_overrides === 'object'
) {
  for (
    const [overrideKey, overrideValue]
    of Object.entries(opening_hours_overrides)
  ) {
    if (!overrideValue) {
      continue;
    }

    let targetPoi = null;

    // Exact POI-ID match
    if (poiMap.has(overrideKey)) {
      targetPoi = poiMap.get(overrideKey);
    }

    // Name-based match
    if (
      !targetPoi &&
      overrideKey.startsWith('name:')
    ) {
      const targetName =
        overrideKey.slice(5);

      const matchingPoi =
        allPois.find(
          poi => poi.name === targetName
        );

      if (matchingPoi) {
        targetPoi =
          poiMap.get(
            matchingPoi.poi_id
          );
      }
    }

    // Ignore overrides for POIs that are not
    // part of this optimization run.
    if (!targetPoi) {
      continue;
    }

    // Override opening time if supplied
    if (
      overrideValue.opens_at !== undefined
    ) {
      targetPoi.opens_at =
        overrideValue.opens_at;
    }

    // Override closing time if supplied
    if (
      overrideValue.closes_at !== undefined
    ) {
      targetPoi.closes_at =
        overrideValue.closes_at;
    }
  }
}
  // ==========================================================
  // EMPTY CITY
  // ==========================================================

  if (allPois.length === 0) {

    return {

      feasible: false,

      violations: [{

        type:
          'NO_CANDIDATE_POIS',

        severity:
          'hard',

        message:
          'No active POIs found for this city.'
      }]
    };
  }


  // ==========================================================
  // VALIDATE MUST-SEE POIs
  // ==========================================================

  const missingMustSeePois =
    must_see_poi_ids.filter(
      id => !poiMap.has(id)
    );

  if (
    missingMustSeePois.length > 0
  ) {

    return {

      feasible: false,

      violations: [{

        type:
          'INVALID_POI_ID',

        severity:
          'hard',

        message:
          `Must-see attraction(s) not found in city: ${missingMustSeePois.join(', ')}`
      }]
    };
  }


  // ==========================================================
  // DAY / BUDGET / CARBON LIMITS
  // ==========================================================

  const dayStartMins =
    timeToMinutes(day_start);

  const dayEndMins =
    timeToMinutes(day_end);

  const availableDayMins =
    Math.max(
      0,
      dayEndMins - dayStartMins
    );


  const budgetCents =
    (
      budget_cap !== undefined &&
      budget_cap !== null &&
      budget_cap !== ''
    )
      ? moneyToCents(budget_cap)
      : Infinity;


  const carbonCap =
    (
      carbon_cap_kg !== undefined &&
      carbon_cap_kg !== null &&
      Number(carbon_cap_kg) > 0
    )
      ? Number(carbon_cap_kg)
      : Infinity;


  // ==========================================================
  // BUILD MUST-SEE SET
  // ==========================================================

  const mustSeeSet =
    new Set(must_see_poi_ids);

  const requiredCount =
    mustSeeSet.size;


  // ==========================================================
  // BUILD CANDIDATE POOL
  // ==========================================================

  let pool = [];

  if (
    must_see_poi_ids.length > 0
  ) {

    // Start with mandatory POIs.
    pool = [
      ...must_see_poi_ids
    ];


    // Add required start.
    if (
      start_poi_id &&
      !pool.includes(start_poi_id) &&
      poiMap.has(start_poi_id)
    ) {

      pool.push(start_poi_id);
    }


    // Add required end.
    if (
      end_poi_id &&
      !pool.includes(end_poi_id) &&
      poiMap.has(end_poi_id)
    ) {

      pool.push(end_poi_id);
    }


    // Add additional high-value POIs.
    const remaining =
      allPois

        .filter(
          p => !pool.includes(p.poi_id)
        )

        .sort(
          (a, b) =>
            (b.popularity_score || 0) -
            (a.popularity_score || 0)
        );


    const limit =
      candidate_poi_ids
        ? remaining.length
        : Math.min(
            10,
            max_activities + 2
          );


    for (
      const r of remaining.slice(
        0,
        limit
      )
    ) {

      pool.push(
        r.poi_id
      );
    }

  } else {

    // No mandatory attractions.
    // Select highest-value candidates.

    pool =
      allPois

        .sort(
          (a, b) =>
            (
              (b.popularity_score || 0) +
              (b.value_score || 0)
            ) -
            (
              (a.popularity_score || 0) +
              (a.value_score || 0)
            )
        )

        .slice(
          0,
          candidate_poi_ids
            ? allPois.length
            : Math.min(
                10,
                max_activities + 2
              )
        )

        .map(
          p => p.poi_id
        );
  }


  // ==========================================================
  // SEARCH STATE
  // ==========================================================

  const feasiblePlans = [];

  const allEvaluatedPlans = [];


  // ==========================================================
  // DEPTH-FIRST SEARCH
  // ==========================================================

  function search(
    currentSeq,
    currentVisited,
    currentMins,
    currentCostCents,
    currentCarbon
  ) {

    // --------------------------------------------------------
    // Check mandatory POIs
    // --------------------------------------------------------

    const hasAllMustSee =
      must_see_poi_ids.every(
        id =>
          currentVisited.has(id)
      );


    const satisfiesEnd =
      !end_poi_id ||
      currentSeq[
        currentSeq.length - 1
      ] === end_poi_id;


    // --------------------------------------------------------
    // Evaluate completed sequence
    // --------------------------------------------------------

    if (
      currentSeq.length > 0 &&
      hasAllMustSee &&
      satisfiesEnd
    ) {

      const evalPlan =
        evaluateSequence(
          currentSeq,
          poiMap,
          edgeMap,
          {
            day_start,
            weights,
            allowed_modes
          }
        );


      if (evalPlan) {

        const check =
          validatePlanConstraints(
            evalPlan,
            {
              day_start,
              day_end,
              budget_cap,
              carbon_cap_kg,
              must_see_poi_ids,
              start_poi_id,
              end_poi_id,
              allowed_modes
            }
          );


        if (check.feasible) {

          feasiblePlans.push(
            evalPlan
          );

        } else {

          allEvaluatedPlans.push({
            plan: evalPlan,
            check
          });
        }
      }
    }


    // --------------------------------------------------------
    // Maximum activity limit
    // --------------------------------------------------------

    if (
      currentSeq.length >=
      max_activities
    ) {

      return;
    }


    // --------------------------------------------------------
    // Do not continue after required end POI
    // --------------------------------------------------------

    if (
      end_poi_id &&
      currentSeq.length > 0 &&
      currentSeq[
        currentSeq.length - 1
      ] === end_poi_id
    ) {

      return;
    }


    // --------------------------------------------------------
    // Try every unused POI
    // --------------------------------------------------------

    for (
      const nextPoiId of pool
    ) {

      if (
        currentVisited.has(
          nextPoiId
        )
      ) {

        continue;
      }


      // ------------------------------------------------------
      // Start constraint
      // ------------------------------------------------------

      if (
        currentSeq.length === 0 &&
        start_poi_id &&
        nextPoiId !== start_poi_id
      ) {

        continue;
      }


      const nextPoi =
        poiMap.get(
          nextPoiId
        );

      if (!nextPoi) {
        continue;
      }


      let legMins = 0;
      let legCostCents = 0;
      let legCarbon = 0;


      // ------------------------------------------------------
      // Travel from current POI
      // ------------------------------------------------------

      if (
        currentSeq.length > 0
      ) {

        const lastId =
          currentSeq[
            currentSeq.length - 1
          ];

        const key =
          `${lastId}_${nextPoiId}`;

        const edges =
          edgeMap.get(key) || [];


        const edge =
          chooseBestEdge(
            edges,
            weights,
            allowed_modes,
            currentMins,
            nextPoi
          );


        // No travel edge → impossible branch.
        if (!edge) {
          continue;
        }


        legMins =
          edge.minutes;

        legCostCents =
          edge.cost_cents;

        legCarbon =
          edge.carbon_kg;
      }


      // ------------------------------------------------------
      // Opening hours
      // ------------------------------------------------------

      const nextArrivalTime =
        currentMins + legMins;


      const openCheck =
        checkOpeningHours(
          nextArrivalTime,
          nextPoi.duration_minutes,
          nextPoi.opens_at,
          nextPoi.closes_at
        );


      if (!openCheck.valid) {
        continue;
      }


      const nextDepartureMins =
        openCheck.actualEndMins;


      const nextTotalMins =
        nextDepartureMins -
        dayStartMins;


      const nextTotalCostCents =
        currentCostCents +
        legCostCents +
        nextPoi.cost_cents;


      const nextTotalCarbon =
        currentCarbon +
        legCarbon +
        nextPoi.carbon_kg;


      // ------------------------------------------------------
      // Resource pruning
      //
      // We intentionally keep the existing behavior:
      // resource pruning becomes strict once at least one
      // feasible plan has been found.
      // ------------------------------------------------------

      if (
        nextTotalMins >
          availableDayMins &&
        feasiblePlans.length > 0
      ) {

        continue;
      }


      if (
        nextTotalCostCents >
          budgetCents &&
        feasiblePlans.length > 0
      ) {

        continue;
      }


      if (
        nextTotalCarbon >
          carbonCap &&
        feasiblePlans.length > 0
      ) {

        continue;
      }


      // ------------------------------------------------------
      // DFS recurse
      // ------------------------------------------------------

      currentVisited.add(
        nextPoiId
      );

      currentSeq.push(
        nextPoiId
      );


      search(
        currentSeq,
        currentVisited,
        nextDepartureMins,
        nextTotalCostCents,
        nextTotalCarbon
      );


      currentSeq.pop();

      currentVisited.delete(
        nextPoiId
      );
    }
  }


  // ==========================================================
  // RUN DFS
  // ==========================================================

  search(
    [],
    new Set(),
    dayStartMins,
    0,
    0
  );


  // ==========================================================
  // INFEASIBLE CASE
  // ==========================================================

  if (
    feasiblePlans.length === 0
  ) {

    /*
     * Build a diagnostic sequence using:
     *
     * start → must-see POIs → end
     *
     * This does NOT become a returned itinerary.
     * It is only used by the infeasibility engine.
     */

    let fallbackSeq = [];


    if (start_poi_id) {

      fallbackSeq.push(
        start_poi_id
      );
    }


    for (
      const m of must_see_poi_ids
    ) {

      if (
        !fallbackSeq.includes(m)
      ) {

        fallbackSeq.push(m);
      }
    }


    if (
      end_poi_id &&
      !fallbackSeq.includes(
        end_poi_id
      )
    ) {

      fallbackSeq.push(
        end_poi_id
      );
    }


    if (
      fallbackSeq.length > 0
    ) {

      const fallbackPlan =
        evaluateSequence(
          fallbackSeq,
          poiMap,
          edgeMap,
          {
            day_start,
            weights,
            allowed_modes
          }
        );


      if (fallbackPlan) {

        const check =
          validatePlanConstraints(
            fallbackPlan,
            {
              day_start,
              day_end,
              budget_cap,
              carbon_cap_kg,
              must_see_poi_ids,
              start_poi_id,
              end_poi_id,
              allowed_modes
            }
          );


        allEvaluatedPlans.push({
          plan: fallbackPlan,
          check
        });
      }
    }


    return {

      feasible: false,

      evaluated_attempts:
        allEvaluatedPlans
    };
  }


  // ==========================================================
  // SCORE FEASIBLE PLANS
  // ==========================================================

  const scored =
    scoreCandidates(
      feasiblePlans,
      weights,
      {
        budget_cents:
          budgetCents !== Infinity
            ? budgetCents
            : null,

        time_limit_minutes:
          availableDayMins,

        carbon_cap_kg:
          carbonCap !== Infinity
            ? carbonCap
            : null
      }
    );


  const bestPlan =
    scored[0];


  // ==========================================================
  // RETURN BEST PLAN
  // ==========================================================

  return {

    feasible: true,

    ...bestPlan,

    candidates_count:
      feasiblePlans.length
  };
}


/**
 * ============================================================
 * EXPORTS
 * ============================================================
 */

module.exports = {

  loadCityData,

  chooseBestEdge,

  evaluateSequence,

  optimizeItinerary
};