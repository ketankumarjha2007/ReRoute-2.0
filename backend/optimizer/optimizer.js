const supabase = require('../supabase');
const { resolveTravel } = require("../travel/travelResolver");

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
 * SUPABASE POI DATA LOADER
 * ============================================================
 *
 * ReRoute 2.0
 *
 * Loads active POIs for a city.
 *
 * IMPORTANT:
 * The travel matrix is intentionally NOT loaded here.
 *
 * The optimizer first builds the smart candidate pool and
 * then calls loadTravelMatrix() to load only the edges needed
 * by those candidate POIs.
 *
 * This avoids loading a potentially huge travel matrix before
 * we know which POIs are actually going to participate in DFS.
 */
async function loadCityData(
  cityId,
  candidateIds = null
) {

  if (!cityId) {
    throw new Error(
      'city_id is required'
    );
  }


  // ==========================================================
  // 1. LOAD ACTIVE POIs
  // ==========================================================

  const {
    data: poisData,
    error: poisError
  } = await supabase

    .from('activities_poi')

    .select('*')

    .eq(
      'city_id',
      cityId
    )

    .eq(
      'status',
      'active'
    );


  if (poisError) {

    throw new Error(
      `Failed to load POIs from Supabase: ${poisError.message}`
    );
  }


  let pois =
    poisData || [];


  // ==========================================================
  // 2. FILTER EXPLICIT CANDIDATE POIs
  // ==========================================================

  if (
    candidateIds &&
    Array.isArray(candidateIds) &&
    candidateIds.length > 0
  ) {

    const candidateSet =
      new Set(
        candidateIds
      );


    pois =
      pois.filter(
        poi =>
          candidateSet.has(
            poi.poi_id
          )
      );
  }


  // ==========================================================
  // 3. BUILD POI LOOKUP MAP
  // ==========================================================

  const poiMap =
    new Map();


  for (
    const p of pois
  ) {

    poiMap.set(
      p.poi_id,
      {
        ...p,

        // ------------------------------------------------------
        // Money
        // ------------------------------------------------------
        //
        // Always convert money to integer cents.
        //

        cost_cents:
          moneyToCents(
            p.entry_cost
          ),


        // ------------------------------------------------------
        // Carbon
        // ------------------------------------------------------

        carbon_kg:
          Number(
            p.carbon_kg || 0
          ),


        // ------------------------------------------------------
        // Duration
        // ------------------------------------------------------

        duration_minutes:
          Number(
            p.typical_duration_minutes || 60
          )
      }
    );
  }


  // ==========================================================
  // 4. RETURN POI DATA
  // ==========================================================
  //
  // No travel matrix is loaded here.
  //

  return {

    poiMap,

    allPois:
      pois
  };
}


/**
 * ============================================================
 * SUPABASE TRAVEL MATRIX LOADER
 * ============================================================
 *
 * ReRoute 2.0
 *
 * Loads ONLY travel edges whose origin and destination POIs
 * belong to the final smart candidate pool.
 *
 * This function is called AFTER:
 *
 *     loadCityData()
 *          ↓
 *     buildSmartCandidatePool()
 *
 * Therefore the database query is limited to the POIs that
 * the deterministic optimizer can actually search.
 */
async function loadTravelMatrix(
  candidatePoiIds
) {

  // ==========================================================
  // 1. HANDLE EMPTY CANDIDATE POOL
  // ==========================================================

  if (
    !Array.isArray(candidatePoiIds) ||
    candidatePoiIds.length === 0
  ) {

    return new Map();
  }


  // ==========================================================
  // 2. REMOVE DUPLICATE POI IDs
  // ==========================================================

  const poiIdList =
    [
      ...new Set(
        candidatePoiIds
      )
    ];


  // ==========================================================
  // 3. LOAD REQUIRED TRAVEL EDGES
  // ==========================================================

  const {
    data: edgesData,
    error: edgesError
  } = await supabase

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

    .in(
      'origin_poi_id',
      poiIdList
    )

    .in(
      'dest_poi_id',
      poiIdList
    );


  if (edgesError) {

    throw new Error(
      `Failed to load travel matrix from Supabase: ${edgesError.message}`
    );
  }


  const edges =
    edgesData || [];


  // ==========================================================
  // 4. BUILD EDGE LOOKUP MAP
  // ==========================================================

  const edgeMap =
    new Map();


  for (
    const e of edges
  ) {

    const key =
      `${e.origin_poi_id}_${e.dest_poi_id}`;


    if (
      !edgeMap.has(
        key
      )
    ) {

      edgeMap.set(
        key,
        []
      );
    }


    edgeMap
      .get(key)
      .push({

        ...e,


        // ------------------------------------------------------
        // Money
        // ------------------------------------------------------

        cost_cents:
          moneyToCents(
            e.cost
          ),


        // ------------------------------------------------------
        // Carbon
        // ------------------------------------------------------

        carbon_kg:
          Number(
            e.carbon_kg || 0
          ),


        // ------------------------------------------------------
        // Travel time
        // ------------------------------------------------------

        minutes:
          Number(
            e.minutes || 0
          ),


        // ------------------------------------------------------
        // Distance
        // ------------------------------------------------------

        distance_km:
          Number(
            e.distance_km || 0
          )
      });
  }


  // ==========================================================
  // 5. RETURN EDGE MAP
  // ==========================================================

  return edgeMap;
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

        console.log(
        );

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
 * BUILD SMART CANDIDATE POOL
 * ============================================================
 *
 * ReRoute 2.0
 *
 * Builds a diversified, bounded search pool instead of taking
 * only the most popular POIs.
 *
 * The pool combines:
 *
 * - Mandatory POIs
 * - Start / end POIs
 * - Popularity + value
 * - Low-cost POIs
 * - Low-carbon POIs
 * - Short-duration POIs
 * - Balanced multi-objective ranking
 *
 * This function only controls the optimizer search space.
 * Hard constraints and final itinerary selection remain the
 * responsibility of the deterministic optimizer.
 */
function buildSmartCandidatePool({
  allPois,
  mustSeePoiIds = [],
  startPoiId = null,
  endPoiId = null,
  maxActivities = 6,
  explicitCandidateIds = null
}) {
  if (!Array.isArray(allPois) || allPois.length === 0) {
    return [];
  }

  // ----------------------------------------------------------
  // Explicit candidate mode
  // ----------------------------------------------------------
  //
  // loadCityData() already filters allPois when explicit IDs
  // are supplied. Preserve that exact search universe.
  //
  if (
    Array.isArray(explicitCandidateIds) &&
    explicitCandidateIds.length > 0
  ) {
    const allowed = new Set(explicitCandidateIds);

    return allPois
      .filter(poi => allowed.has(poi.poi_id))
      .map(poi => poi.poi_id);
  }

  // ----------------------------------------------------------
  // POI lookup and deterministic selection state
  // ----------------------------------------------------------

  const poiMap = new Map(
    allPois.map(poi => [poi.poi_id, poi])
  );

  const selected = [];
  const selectedSet = new Set();

  const addPoi = poiId => {
    if (!poiId) {
      return;
    }

    if (!poiMap.has(poiId)) {
      return;
    }

    if (selectedSet.has(poiId)) {
      return;
    }

    selected.push(poiId);
    selectedSet.add(poiId);
  };

  // ----------------------------------------------------------
  // Mandatory POIs always get priority
  // ----------------------------------------------------------

  for (const poiId of mustSeePoiIds) {
    addPoi(poiId);
  }

  // ----------------------------------------------------------
  // Start / end POIs get priority
  // ----------------------------------------------------------

  addPoi(startPoiId);
  addPoi(endPoiId);

  const remaining = allPois.filter(
    poi => !selectedSet.has(poi.poi_id)
  );

  if (remaining.length === 0) {
    return selected;
  }

  // ----------------------------------------------------------
  // Safe numeric helpers
  // ----------------------------------------------------------

  const numberValue = (value, fallback = 0) => {
    const number = Number(value);

    return Number.isFinite(number)
      ? number
      : fallback;
  };

  const getPopularity = poi =>
    numberValue(poi.popularity_score);

  const getValue = poi =>
    numberValue(poi.value_score);

  const getCost = poi =>
    numberValue(
      poi.cost_cents ??
      poi.entry_cost_cents ??
      poi.entry_cost ??
      poi.cost
    );

  const getCarbon = poi =>
    numberValue(
      poi.carbon_kg ??
      poi.carbon ??
      poi.emission_kg
    );

  const getDuration = poi =>
    numberValue(
      poi.duration_minutes ??
      poi.typical_duration_minutes ??
      poi.duration ??
      poi.visit_duration_minutes,
      60
    );

  // ----------------------------------------------------------
  // Normalize a value between 0 and 1
  // ----------------------------------------------------------

  const normalize = (value, min, max) => {
    if (max === min) {
      return 0.5;
    }

    return (value - min) / (max - min);
  };

  // ----------------------------------------------------------
  // Metric ranges
  // ----------------------------------------------------------

  const costs = remaining.map(getCost);
  const carbons = remaining.map(getCarbon);
  const durations = remaining.map(getDuration);

  const minCost = Math.min(...costs);
  const maxCost = Math.max(...costs);

  const minCarbon = Math.min(...carbons);
  const maxCarbon = Math.max(...carbons);

  const minDuration = Math.min(...durations);
  const maxDuration = Math.max(...durations);

  // ----------------------------------------------------------
  // Ranking 1: popularity + value
  // ----------------------------------------------------------

  const qualityRanked = [...remaining].sort((a, b) => {
    const scoreA =
      getPopularity(a) +
      getValue(a);

    const scoreB =
      getPopularity(b) +
      getValue(b);

    if (scoreB !== scoreA) {
      return scoreB - scoreA;
    }

    return String(a.poi_id).localeCompare(
      String(b.poi_id)
    );
  });

  // ----------------------------------------------------------
  // Ranking 2: low cost
  // ----------------------------------------------------------

  const lowCostRanked = [...remaining].sort((a, b) => {
    const difference =
      getCost(a) -
      getCost(b);

    if (difference !== 0) {
      return difference;
    }

    return String(a.poi_id).localeCompare(
      String(b.poi_id)
    );
  });

  // ----------------------------------------------------------
  // Ranking 3: low carbon
  // ----------------------------------------------------------

  const lowCarbonRanked = [...remaining].sort((a, b) => {
    const difference =
      getCarbon(a) -
      getCarbon(b);

    if (difference !== 0) {
      return difference;
    }

    return String(a.poi_id).localeCompare(
      String(b.poi_id)
    );
  });

  // ----------------------------------------------------------
  // Ranking 4: short duration
  // ----------------------------------------------------------

  const shortDurationRanked = [...remaining].sort((a, b) => {
    const difference =
      getDuration(a) -
      getDuration(b);

    if (difference !== 0) {
      return difference;
    }

    return String(a.poi_id).localeCompare(
      String(b.poi_id)
    );
  });

  // ----------------------------------------------------------
  // Ranking 5: balanced multi-objective ranking
  // ----------------------------------------------------------

  const smartRanked = [...remaining].sort((a, b) => {
    const aCost =
      1 -
      normalize(
        getCost(a),
        minCost,
        maxCost
      );

    const bCost =
      1 -
      normalize(
        getCost(b),
        minCost,
        maxCost
      );

    const aCarbon =
      1 -
      normalize(
        getCarbon(a),
        minCarbon,
        maxCarbon
      );

    const bCarbon =
      1 -
      normalize(
        getCarbon(b),
        minCarbon,
        maxCarbon
      );

    const aTime =
      1 -
      normalize(
        getDuration(a),
        minDuration,
        maxDuration
      );

    const bTime =
      1 -
      normalize(
        getDuration(b),
        minDuration,
        maxDuration
      );

    const aScore =
      getPopularity(a) * 0.25 +
      getValue(a) * 0.25 +
      aCost * 0.15 +
      aCarbon * 0.20 +
      aTime * 0.15;

    const bScore =
      getPopularity(b) * 0.25 +
      getValue(b) * 0.25 +
      bCost * 0.15 +
      bCarbon * 0.20 +
      bTime * 0.15;

    if (bScore !== aScore) {
      return bScore - aScore;
    }

    return String(a.poi_id).localeCompare(
      String(b.poi_id)
    );
  });

  // ----------------------------------------------------------
  // Bounded candidate pool
  // ----------------------------------------------------------
  //
  // Previous implementation effectively limited the default
  // search to around 8 POIs.
  //
  // ReRoute 2.0 uses a diversified pool of up to 24 POIs.
  //
  const targetPoolSize = Math.min(
    allPois.length,
    Math.max(
      16,
      maxActivities * 4
    ),
    24
  );

  const strategyLimit = Math.max(
    3,
    Math.ceil(targetPoolSize / 5)
  );

  // ----------------------------------------------------------
  // Add candidates from ranking without duplicates
  // ----------------------------------------------------------

  const addFromRanking = (ranking, limit) => {
    let added = 0;

    for (const poi of ranking) {
      if (selectedSet.has(poi.poi_id)) {
        continue;
      }

      addPoi(poi.poi_id);

      added++;

      if (added >= limit) {
        break;
      }
    }
  };

  // ----------------------------------------------------------
  // Diversified candidate selection
  // ----------------------------------------------------------

  addFromRanking(
    qualityRanked,
    strategyLimit
  );

  addFromRanking(
    lowCostRanked,
    strategyLimit
  );

  addFromRanking(
    lowCarbonRanked,
    strategyLimit
  );

  addFromRanking(
    shortDurationRanked,
    strategyLimit
  );

  addFromRanking(
    smartRanked,
    targetPoolSize
  );

  // ----------------------------------------------------------
  // Safety fill
  // ----------------------------------------------------------

  for (const poi of smartRanked) {
    if (selected.length >= targetPoolSize) {
      break;
    }

    addPoi(poi.poi_id);
  }

  return selected;
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

const productionTravelGraphCache = new Map();

async function buildProductionTravelGraph(
  pool,
  allowedModes = null,
  allPois = []
) {
  // pool contains POI IDs.

  const cacheModes =
    Array.isArray(allowedModes) &&
      allowedModes.length > 0
      ? allowedModes
        .map(mode => String(mode).toLowerCase())
        .sort()
      : ["cab"];

  const cacheKey =
    JSON.stringify({
      pool: [...pool].sort(),
      modes: cacheModes
    });

  const cachedGraph =
    productionTravelGraphCache.get(cacheKey);

  if (cachedGraph) {
    console.log(
      `[ReRoute 2.0] Reusing cached travel graph: ${cachedGraph.size} POI connections`
    );

    return new Map(
      Array.from(cachedGraph.entries()).map(([key, edges]) => [
        key,
        edges.map(edge => ({ ...edge }))
      ])
    );
  }

  // allPois contains the full POI objects required by
  // the dynamic routing provider.

  const modes =
    Array.isArray(allowedModes) &&
      allowedModes.length > 0
      ? allowedModes
      : ["cab"];

  const edgeMap =
    await loadTravelMatrix(
      pool
    );

  const poiById =
    new Map(
      allPois.map(poi => [
        poi.poi_id,
        poi
      ])
    );

  const poolPois =
    pool
      .map(poiId => poiById.get(poiId))
      .filter(Boolean);

  if (poolPois.length !== pool.length) {
    throw new Error(
      `Production travel graph could not resolve all candidate POI IDs. Expected ${pool.length}, got ${poolPois.length}.`
    );
  }

  let dynamicRoutes = 0;

  for (const fromPoi of poolPois) {
    for (const toPoi of poolPois) {

      if (
        !fromPoi ||
        !toPoi ||
        fromPoi.poi_id === toPoi.poi_id
      ) {
        continue;
      }

      const key =
        `${fromPoi.poi_id}_${toPoi.poi_id}`;

      const existingEdges =
        edgeMap.get(key) || [];

      // ============================================================
      // CHECK WHICH MODES ALREADY EXIST IN THE MATRIX
      // ============================================================

      const existingModes = new Set(
        existingEdges
          .map(edge =>
            String(edge.mode || "")
              .trim()
              .toLowerCase()
          )
          .filter(Boolean)
      );

      // Only request dynamic routing for modes
      // that are actually missing from the matrix.
      const missingModes = modes.filter(
        mode =>
          !existingModes.has(
            String(mode).toLowerCase()
          )
      );

      // If every requested mode already exists,
      // the database matrix is sufficient.
      if (missingModes.length === 0) {
        continue;
      }

      try {

        // ==========================================================
        // RESOLVE MISSING ROUTING MODES
        // ==========================================================

        const dynamicEdges = [];

        for (const missingMode of missingModes) {

          try {

            const edge =
              await resolveTravel({
                fromPoi,
                toPoi,
                allowedModes: [missingMode]
              });

            if (!edge) {
              continue;
            }

            dynamicEdges.push({
              ...edge,

              mode:
                edge.mode ||
                missingMode
            });

            dynamicRoutes++;

          } catch (modeError) {

            console.warn(
              `[ReRoute 2.0] Unable to resolve ${missingMode} route ${fromPoi.poi_id} -> ${toPoi.poi_id}: ${modeError.message}`
            );

          }
        }

        // ==========================================================
        // MERGE MATRIX + DYNAMIC ROUTES
        // ==========================================================

        if (dynamicEdges.length > 0) {

          const mergedEdges = [
            ...existingEdges,
            ...dynamicEdges
          ];

          // Remove duplicate modes while preserving
          // the existing matrix edge when available.
          const uniqueEdges = [];
          const seenModes = new Set();

          for (const edge of mergedEdges) {

            const mode =
              String(edge.mode || "")
                .trim()
                .toLowerCase();

            if (!mode) {
              continue;
            }

            if (seenModes.has(mode)) {
              continue;
            }

            seenModes.add(mode);
            uniqueEdges.push(edge);
          }

          edgeMap.set(
            key,
            uniqueEdges
          );
        }

      } catch (error) {

        console.warn(
          `[ReRoute 2.0] Unable to resolve ${fromPoi.poi_id} -> ${toPoi.poi_id}: ${error.message}`
        );

      }
    }
  }

  console.log(
    `[ReRoute 2.0] Dynamic routes resolved: ${dynamicRoutes}`
  );


  const graphToCache =
    new Map(
      Array.from(edgeMap.entries()).map(([key, edges]) => [
        key,
        edges.map(edge => ({ ...edge }))
      ])
    );

  productionTravelGraphCache.set(
    cacheKey,
    graphToCache
  );

  console.log(
    `[ReRoute 2.0] Final travel graph: ${edgeMap.size} POI connections`
  );

  return edgeMap;
}

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

    planning_intent = 'route_optimization',

    max_activities = 6,

    // Temporary opening-hours changes used by
    // the single-constraint relaxation engine.
    opening_hours_overrides = {}

  } = options;

  // ==========================================================
  // LOAD CITY POIs FROM SUPABASE
  // ==========================================================
  //
  // ReRoute 2.0 loads POIs first.
  // The travel matrix is loaded only after the smart candidate
  // pool has been created.
  //

  const {
    poiMap,
    allPois
  } = await loadCityData(
    city_id,
    candidate_poi_ids
  );


  let edgeMap =
    new Map();
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
  // BUILD SMART CANDIDATE POOL
  // ==========================================================
  //
  // ReRoute 2.0
  //
  // The optimizer now uses the diversified candidate pool
  // defined above instead of the old popularity-only pool.
  //
  // Candidate selection considers:
  //
  // 1. Mandatory POIs
  // 2. Start / End POIs
  // 3. Popularity + value
  // 4. Low cost
  // 5. Low carbon
  // 6. Short duration
  // 7. Balanced multi-objective ranking
  //
  // The final itinerary is still selected by the existing
  // deterministic DFS + constraint validation + scoring logic.
  //

  const pool =
    buildSmartCandidatePool({
      allPois,

      mustSeePoiIds:
        must_see_poi_ids,

      startPoiId:
        start_poi_id,

      endPoiId:
        end_poi_id,

      maxActivities:
        max_activities,

      explicitCandidateIds:
        candidate_poi_ids
    });

  // ==========================================================
  // LOAD SMART TRAVEL GRAPH
  // ==========================================================
  //
  // Only load travel edges between POIs that are actually
  // present in the candidate search pool.
  //

  edgeMap =
    await buildProductionTravelGraph(
      pool,
      allowed_modes,
      allPois
    );
  console.log(
    `[ReRoute 2.0] Candidate pool: ${pool.length}/${allPois.length} POIs`
  );
  console.log(
    `[ReRoute 2.0] Travel graph: ${edgeMap.size} POI connections`
  );

  // ==========================================================
  // SEARCH STATE
  // ==========================================================

  const feasiblePlans = [];
  const feasiblePlanCounts = new Map();

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

          const planLength =
            Number(evalPlan.summary?.stops_count) || 0;

          feasiblePlanCounts.set(
            planLength,
            (feasiblePlanCounts.get(planLength) || 0) + 1
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
        availableDayMins
      ) {

        continue;
      }


      if (
        nextTotalCostCents >
        budgetCents
      ) {

        continue;
      }


      if (
        nextTotalCarbon >
        carbonCap
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

  console.log(
    '[ReRoute 2.0] Feasible plan counts:',
    Object.fromEntries(feasiblePlanCounts)
  );

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
            : null,

        planning_intent
      }
    );


  console.log('[ReRoute 2.0] Top scored plans:', scored.slice(0, 10).map(p => ({
    stops: p.summary?.stops_count,
    minutes: p.summary?.minutes,
    cost: p.summary?.cost,
    carbon: p.summary?.carbon_kg,
    score: p.score,
    richness_penalty: p.normalized_metrics?.richness_penalty,
    utilization: p.normalized_metrics?.itinerary_utilization
  })));

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
  loadTravelMatrix,
  chooseBestEdge,
  evaluateSequence,
  optimizeItinerary
};










