/**
 * ============================================================
 * ReRoute Mathematical Verification Layer
 * ============================================================
 *
 * PURPOSE:
 *
 * Independently verify an itinerary produced by the optimizer.
 *
 * The verifier does NOT trust:
 * - Groq
 * - optimizer summary
 * - optimizer cost
 * - optimizer carbon
 * - optimizer time
 *
 * It reads the underlying APS-09 data from Supabase and
 * independently recomputes:
 *
 *   1. POI entry cost
 *   2. Travel cost
 *   3. Total cost
 *   4. Activity time
 *   5. Travel time
 *   6. Waiting time
 *   7. Total elapsed time
 *   8. POI carbon
 *   9. Travel carbon
 *  10. Total carbon
 *  11. Budget constraint
 *  12. Carbon constraint
 *  13. Day-end constraint
 *  14. Start/end constraints
 *  15. Must-see constraints
 *  16. Travel-edge validity
 *  17. Opening-hours validity
 *
 * IMPORTANT:
 *
 * This verifier is intentionally independent from the
 * optimizer's summary calculations.
 * ============================================================
 */

const supabase = require('../supabase');

const {
  timeToMinutes,
  minutesToTime,
  moneyToCents,
  centsToMoney
} = require('./constraints');


/**
 * ============================================================
 * CONSTANTS
 * ============================================================
 */

const CARBON_EPSILON = 0.001;

const TIME_EPSILON = 0;

const SUPPORTED_MODES = [
  'walk',
  'cab'
];


/**
 * ============================================================
 * TIME HELPERS
 * ============================================================
 */

function safeTimeToMinutes(value) {

  if (!value) {
    return null;
  }

  try {
    return timeToMinutes(value);
  } catch {
    return null;
  }
}


/**
 * ============================================================
 * NUMERIC COMPARISON
 * ============================================================
 */

function numbersEqual(a, b, epsilon = 0.000001) {

  if (
    !Number.isFinite(Number(a)) ||
    !Number.isFinite(Number(b))
  ) {
    return false;
  }

  return (
    Math.abs(
      Number(a) - Number(b)
    ) <= epsilon
  );
}


/**
 * ============================================================
 * FETCH POIS
 * ============================================================
 */

async function fetchPois(poiIds) {

  const uniqueIds = [
    ...new Set(
      poiIds.filter(Boolean)
    )
  ];

  if (uniqueIds.length === 0) {
    return new Map();
  }


  const {
    data,
    error
  } = await supabase
    .from('activities_poi')
    .select('*')
    .in('poi_id', uniqueIds);


  if (error) {

    throw new Error(
      `Verification failed while loading POIs: ${error.message}`
    );
  }


  const map = new Map();


  for (const poi of data || []) {

    map.set(
      poi.poi_id,
      poi
    );
  }


  return map;
}


/**
 * ============================================================
 * FETCH TRAVEL EDGES
 * ============================================================
 *
 * We fetch the exact origin -> destination -> mode edge used
 * by the optimizer.
 * ============================================================
 */

async function fetchTravelEdges(transfers) {

  const uniqueKeys = [
    ...new Set(
      transfers.map(
        transfer =>
          `${transfer.from_poi_id}|${transfer.to_poi_id}|${String(
            transfer.mode || ''
          ).toLowerCase()}`
      )
    )
  ];


  if (uniqueKeys.length === 0) {
    return new Map();
  }


  const originIds = [
    ...new Set(
      transfers
        .map(t => t.from_poi_id)
        .filter(Boolean)
    )
  ];


  const destinationIds = [
    ...new Set(
      transfers
        .map(t => t.to_poi_id)
        .filter(Boolean)
    )
  ];


  const {
    data,
    error
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
      originIds
    )
    .in(
      'dest_poi_id',
      destinationIds
    );


  if (error) {

    throw new Error(
      `Verification failed while loading travel edges: ${error.message}`
    );
  }


  const map = new Map();


  for (const edge of data || []) {

    const key =
      `${edge.origin_poi_id}|${edge.dest_poi_id}|${String(
        edge.mode || ''
      ).toLowerCase()}`;


    map.set(
      key,
      edge
    );
  }


  return map;
}


/**
 * ============================================================
 * VERIFY ITINERARY
 * ============================================================
 */

async function verifyItinerary(
  plan,
  constraints = {}
) {

  const errors = [];
  const warnings = [];

  const checks = {};


  /*
   * ----------------------------------------------------------
   * Basic structure
   * ----------------------------------------------------------
   */

  if (
    !plan ||
    typeof plan !== 'object'
  ) {

    return {

      verified: false,

      checks,

      errors: [
        'Plan is missing or invalid.'
      ],

      warnings,

      recomputed: null
    };
  }


  const stops =
    Array.isArray(plan.stops)
      ? plan.stops
      : [];


  const transfers =
    Array.isArray(plan.transfers)
      ? plan.transfers
      : [];


  if (stops.length === 0) {

    errors.push(
      'Plan contains no stops.'
    );
  }


  /*
   * ----------------------------------------------------------
   * Extract IDs
   * ----------------------------------------------------------
   */

  const stopIds =
    stops.map(
      stop => stop.poi_id
    );


  const transferPoiIds =
    transfers.flatMap(
      transfer => [
        transfer.from_poi_id,
        transfer.to_poi_id
      ]
    );


  const allPoiIds = [
    ...stopIds,
    ...transferPoiIds
  ];


  /*
   * ----------------------------------------------------------
   * Load RAW database data
   * ----------------------------------------------------------
   */

  let poiMap;

  let edgeMap;


  try {

    poiMap =
      await fetchPois(
        allPoiIds
      );


    edgeMap =
      await fetchTravelEdges(
        transfers
      );

  } catch (error) {

    return {

      verified: false,

      checks,

      errors: [
        error.message
      ],

      warnings,

      recomputed: null
    };
  }


  /*
   * ----------------------------------------------------------
   * Verify all POIs exist
   * ----------------------------------------------------------
   */

  const missingPois =
    allPoiIds.filter(
      id =>
        id &&
        !poiMap.has(id)
    );


  checks.poi_data =
    missingPois.length === 0;


  if (
    missingPois.length > 0
  ) {

    errors.push(
      `Missing POI records in database: ${[
        ...new Set(missingPois)
      ].join(', ')}`
    );
  }


  /*
   * ----------------------------------------------------------
   * Constraint inputs
   * ----------------------------------------------------------
   */

  const dayStart =
    constraints.day_start ||
    '09:00';


  const dayEnd =
    constraints.day_end ||
    '18:00';


  const dayStartMins =
    safeTimeToMinutes(
      dayStart
    );


  const dayEndMins =
    safeTimeToMinutes(
      dayEnd
    );


  const budgetCap =
    constraints.budget_cap !== undefined &&
    constraints.budget_cap !== null &&
    constraints.budget_cap !== ''
      ? moneyToCents(
          String(
            constraints.budget_cap
          )
        )
      : Infinity;


  const carbonCap =
    constraints.carbon_cap_kg !== undefined &&
    constraints.carbon_cap_kg !== null &&
    constraints.carbon_cap_kg !== ''
      ? Number(
          constraints.carbon_cap_kg
        )
      : Infinity;


  const mustSee =
    Array.isArray(
      constraints.must_see_poi_ids
    )
      ? constraints.must_see_poi_ids
      : [];


  const allowedModes =
    Array.isArray(
      constraints.allowed_modes
    )
      ? constraints.allowed_modes.map(
          mode =>
            String(mode).toLowerCase()
        )
      : null;


  /*
   * ----------------------------------------------------------
   * START / END
   * ----------------------------------------------------------
   */

  const firstStop =
    stops[0];

  const lastStop =
    stops[stops.length - 1];


  if (
    constraints.start_poi_id
  ) {

    checks.start_poi =
      Boolean(
        firstStop &&
        firstStop.poi_id ===
          constraints.start_poi_id
      );


    if (!checks.start_poi) {

      errors.push(
        'Plan does not start at the required POI.'
      );
    }

  } else {

    checks.start_poi = true;
  }


  if (
    constraints.end_poi_id
  ) {

    checks.end_poi =
      Boolean(
        lastStop &&
        lastStop.poi_id ===
          constraints.end_poi_id
      );


    if (!checks.end_poi) {

      errors.push(
        'Plan does not end at the required POI.'
      );
    }

  } else {

    checks.end_poi = true;
  }


  /*
   * ----------------------------------------------------------
   * MUST-SEE
   * ----------------------------------------------------------
   */

  const stopIdSet =
    new Set(
      stopIds
    );


  const missingMustSee =
    mustSee.filter(
      id =>
        !stopIdSet.has(id)
    );


  checks.must_see =
    missingMustSee.length === 0;


  if (
    missingMustSee.length > 0
  ) {

    errors.push(
      `Missing required must-see POIs: ${missingMustSee.join(', ')}`
    );
  }


  /*
   * ----------------------------------------------------------
   * RECOMPUTATION STATE
   * ----------------------------------------------------------
   */

  let currentMins =
    dayStartMins;


  let totalCostCents = 0;

  let totalCarbonKg = 0;

  let totalActivityMins = 0;

  let totalTravelMins = 0;

  let totalWaitMins = 0;


  /*
   * Expected transfer count
   *
   * n stops normally means n - 1 transfers.
   */

  const expectedTransferCount =
    Math.max(
      0,
      stops.length - 1
    );


  checks.transfer_count =
    transfers.length ===
    expectedTransferCount;


  if (
    !checks.transfer_count
  ) {

    errors.push(
      `Expected ${expectedTransferCount} transfers but received ${transfers.length}.`
    );
  }


  /*
   * ----------------------------------------------------------
   * VERIFY EVERY STOP
   * ----------------------------------------------------------
   */

  for (
    let i = 0;
    i < stops.length;
    i++
  ) {

    const stop =
      stops[i];


    const poi =
      poiMap.get(
        stop.poi_id
      );


    if (!poi) {
      continue;
    }


    /*
     * --------------------------------------------------------
     * Travel from previous stop
     * --------------------------------------------------------
     */

    if (i > 0) {

      const transfer =
        transfers[i - 1];


      if (!transfer) {

        errors.push(
          `Missing transfer before stop ${stop.poi_id}.`
        );

        continue;
      }


      /*
       * Verify transfer endpoints
       */

      const expectedFrom =
        stops[i - 1].poi_id;


      const expectedTo =
        stop.poi_id;


      if (
        transfer.from_poi_id !==
        expectedFrom
      ) {

        errors.push(
          `Transfer ${i} has incorrect origin.`
        );
      }


      if (
        transfer.to_poi_id !==
        expectedTo
      ) {

        errors.push(
          `Transfer ${i} has incorrect destination.`
        );
      }


      /*
       * Verify transport mode
       */

      const mode =
        String(
          transfer.mode || ''
        ).toLowerCase();


      if (
        allowedModes &&
        allowedModes.length > 0 &&
        !allowedModes.includes(mode)
      ) {

        errors.push(
          `Transfer ${i} uses unsupported mode: ${transfer.mode}.`
        );
      }


      if (
        !SUPPORTED_MODES.includes(
          mode
        )
      ) {

        errors.push(
          `Transfer ${i} uses unsupported ReRoute mode: ${transfer.mode}.`
        );
      }


      /*
       * Find exact raw database edge.
       */

      const edgeKey =
        `${expectedFrom}|${expectedTo}|${mode}`;


      const edge =
        edgeMap.get(
          edgeKey
        );


      if (!edge) {

        errors.push(
          `Travel edge missing from database: ${expectedFrom} → ${expectedTo} (${mode}).`
        );

      } else {

        /*
         * Recalculate travel metrics from DB.
         */

        const edgeMinutes =
          Number(
            edge.minutes || 0
          );


        const edgeCostCents =
          moneyToCents(
            String(
              edge.cost ?? '0'
            )
          );


        const edgeCarbon =
          Number(
            edge.carbon_kg || 0
          );


        totalTravelMins +=
          edgeMinutes;


        totalCostCents +=
          edgeCostCents;


        totalCarbonKg +=
          edgeCarbon;


        /*
         * Verify optimizer's transfer values against DB.
         */

        if (
          Number(
            transfer.minutes
          ) !==
          edgeMinutes
        ) {

          errors.push(
            `Travel time mismatch for ${expectedFrom} → ${expectedTo}.`
          );
        }


        const transferCostCents =
          moneyToCents(
            String(
              transfer.cost ?? '0'
            )
          );


        if (
          transferCostCents !==
          edgeCostCents
        ) {

          errors.push(
            `Travel cost mismatch for ${expectedFrom} → ${expectedTo}.`
          );
        }


        if (
          !numbersEqual(
            transfer.carbon_kg,
            edgeCarbon,
            CARBON_EPSILON
          )
        ) {

          errors.push(
            `Travel carbon mismatch for ${expectedFrom} → ${expectedTo}.`
          );
        }


        /*
         * Advance independent clock.
         */

        currentMins +=
          edgeMinutes;
      }
    }


    /*
     * --------------------------------------------------------
     * Arrival
     * --------------------------------------------------------
     */

    const expectedArrival =
      currentMins;


    const actualArrival =
      safeTimeToMinutes(
        stop.arrival
      );


    if (
      actualArrival === null
    ) {

      errors.push(
        `Invalid arrival time for ${stop.name || stop.poi_id}.`
      );

    } else if (
      actualArrival !==
      expectedArrival
    ) {

      errors.push(
        `Arrival time mismatch for ${stop.name || stop.poi_id}: expected ${minutesToTime(expectedArrival)}, received ${stop.arrival}.`
      );
    }


    /*
     * --------------------------------------------------------
     * Opening hours
     * --------------------------------------------------------
     */

    const opens =
      safeTimeToMinutes(
        poi.opens_at
      );


    const closes =
      safeTimeToMinutes(
        poi.closes_at
      );


    let actualStart =
      currentMins;


    let wait =
      0;


    if (
      opens !== null &&
      actualStart < opens
    ) {

      wait =
        opens -
        actualStart;

      actualStart =
        opens;
    }


    const duration =
      Number(
        poi.typical_duration_minutes || 0
      );


    const actualEnd =
      actualStart +
      duration;


    /*
     * Verify opening hours.
     */

    if (
      closes !== null &&
      actualEnd > closes
    ) {

      errors.push(
        `${poi.name} violates opening hours: ${minutesToTime(actualEnd)} > ${poi.closes_at}.`
      );
    }


    /*
     * Verify returned wait time.
     */

    if (
      Number(
        stop.wait_minutes || 0
      ) !==
      wait
    ) {

      errors.push(
        `Waiting-time mismatch for ${poi.name}.`
      );
    }


    /*
     * Verify returned departure.
     */

    const actualDeparture =
      safeTimeToMinutes(
        stop.departure
      );


    if (
      actualDeparture === null
    ) {

      errors.push(
        `Invalid departure time for ${poi.name}.`
      );

    } else if (
      actualDeparture !==
      actualEnd
    ) {

      errors.push(
        `Departure time mismatch for ${poi.name}: expected ${minutesToTime(actualEnd)}, received ${stop.departure}.`
      );
    }


    /*
     * Add activity time.
     */

    totalActivityMins +=
      duration;


    totalWaitMins +=
      wait;


    /*
     * Add POI cost.
     */

    const poiCostCents =
      moneyToCents(
        String(
          poi.entry_cost ?? '0'
        )
      );


    totalCostCents +=
      poiCostCents;


    /*
     * Add POI carbon.
     */

    const poiCarbon =
      Number(
        poi.carbon_kg || 0
      );


    totalCarbonKg +=
      poiCarbon;


    /*
     * Advance independent clock.
     */

    currentMins =
      actualEnd;


    /*
     * Verify returned POI values.
     */

    const returnedCostCents =
      moneyToCents(
        String(
          stop.entry_cost ?? '0'
        )
      );


    if (
      returnedCostCents !==
      poiCostCents
    ) {

      errors.push(
        `POI entry cost mismatch for ${poi.name}.`
      );
    }


    if (
      !numbersEqual(
        stop.carbon_kg,
        poiCarbon,
        CARBON_EPSILON
      )
    ) {

      errors.push(
        `POI carbon mismatch for ${poi.name}.`
      );
    }


    if (
      Number(
        stop.duration_minutes
      ) !==
      duration
    ) {

      errors.push(
        `POI duration mismatch for ${poi.name}.`
      );
    }
  }


  /*
   * ----------------------------------------------------------
   * FINAL RECOMPUTED VALUES
   * ----------------------------------------------------------
   */

  const recomputedTotalMinutes =
    currentMins -
    dayStartMins;


  const recomputed = {

    cost:
      centsToMoney(
        totalCostCents
      ),

    cost_cents:
      totalCostCents,

    activity_minutes:
      totalActivityMins,

    travel_minutes:
      totalTravelMins,

    wait_minutes:
      totalWaitMins,

    minutes:
      recomputedTotalMinutes,

    carbon_kg:
      Number(
        totalCarbonKg.toFixed(3)
      ),

    day_start:
      dayStart,

    day_end:
      minutesToTime(
        currentMins
      ),

    stops_count:
      stops.length
  };


  /*
   * ----------------------------------------------------------
   * Verify summary supplied by optimizer
   * ----------------------------------------------------------
   */

  const optimizerSummary =
    plan.summary || {};


  checks.summary_cost =
    String(
      optimizerSummary.cost
    ) ===
    recomputed.cost;


  if (
    !checks.summary_cost
  ) {

    errors.push(
      `Summary cost mismatch: optimizer=${optimizerSummary.cost}, verifier=${recomputed.cost}.`
    );
  }


  checks.summary_minutes =
    Number(
      optimizerSummary.minutes
    ) ===
    recomputed.minutes;


  if (
    !checks.summary_minutes
  ) {

    errors.push(
      `Summary time mismatch: optimizer=${optimizerSummary.minutes}, verifier=${recomputed.minutes}.`
    );
  }


  checks.summary_carbon =
    numbersEqual(
      optimizerSummary.carbon_kg,
      recomputed.carbon_kg,
      CARBON_EPSILON
    );


  if (
    !checks.summary_carbon
  ) {

    errors.push(
      `Summary carbon mismatch: optimizer=${optimizerSummary.carbon_kg}, verifier=${recomputed.carbon_kg}.`
    );
  }


  /*
   * ----------------------------------------------------------
   * Budget constraint
   * ----------------------------------------------------------
   */

  checks.budget =
    budgetCap === Infinity ||
    totalCostCents <=
      budgetCap;


  if (
    !checks.budget
  ) {

    errors.push(
      `Budget exceeded: ${recomputed.cost} > ${centsToMoney(budgetCap)}.`
    );
  }


  /*
   * ----------------------------------------------------------
   * Carbon constraint
   * ----------------------------------------------------------
   */

  checks.carbon_cap =
    carbonCap === Infinity ||
    totalCarbonKg <=
      carbonCap +
      CARBON_EPSILON;


  if (
    !checks.carbon_cap
  ) {

    errors.push(
      `Carbon cap exceeded: ${recomputed.carbon_kg} > ${carbonCap}.`
    );
  }


  /*
   * ----------------------------------------------------------
   * Day-end constraint
   * ----------------------------------------------------------
   */

  checks.day_end =
    dayEndMins === null ||
    currentMins <=
      dayEndMins +
      TIME_EPSILON;


  if (
    !checks.day_end
  ) {

    errors.push(
      `Day-end exceeded: ${minutesToTime(currentMins)} > ${dayEnd}.`
    );
  }


  /*
   * ----------------------------------------------------------
   * Overall verification
   * ----------------------------------------------------------
   */

  const verified =
    errors.length === 0;


  return {

    verified,

    checks,

    errors,

    warnings,

    recomputed,

    source:
      'Independent Supabase data verification',

    verifier_version:
      '1.0.0'
  };
}


/**
 * ============================================================
 * EXPORT
 * ============================================================
 */

module.exports = {
  verifyItinerary
};