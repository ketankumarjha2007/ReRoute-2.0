function normalizeTimeToMinutes(value) {
  if (!value || typeof value !== 'string') return null;

  const [h, m] = value.split(':').map(Number);

  if (!Number.isFinite(h) || !Number.isFinite(m)) {
    return null;
  }

  return h * 60 + m;
}


function collectViolations(evaluatedAttempts = []) {
  const violations = [];

  for (const attempt of evaluatedAttempts) {
    for (const violation of attempt?.check?.violations || []) {
      violations.push({ ...violation });
    }
  }

  return violations;
}


function getConstraintLabel(type) {
  switch (type) {
    case 'OPENING_HOURS':
      return 'Attraction Opening Hours';

    case 'TIME_LIMIT':
      return 'Available Time';

    case 'BUDGET':
      return 'Budget Limit';

    case 'CARBON':
      return 'Carbon Limit';

    case 'MISSING_TRAVEL_EDGE':
      return 'Missing Travel Connection';

    case 'MUST_SEE':
      return 'Must-See Requirement';

    case 'START':
      return 'Starting Point';

    case 'END':
      return 'Ending Point';

    case 'TRANSPORT_MODE':
      return 'Transport Mode';

    case 'CLOSED_DAY':
      return 'Closed Day';

    default:
      return 'Multiple Constraints';
  }
}


/**
 * Extract opening-hour evidence from evaluated plans.
 */
function extractOpeningHourEvidence(evaluatedAttempts = []) {
  const evidence = [];

  for (const attempt of evaluatedAttempts) {

    const violations =
      attempt?.plan?.opening_hour_violations || [];

    for (const violation of violations) {

      const departureMinutes =
        normalizeTimeToMinutes(violation.departure);

      const closingMinutes =
        normalizeTimeToMinutes(violation.closes_at);

      const excessMinutes =
        Number.isFinite(departureMinutes) &&
        Number.isFinite(closingMinutes)
          ? departureMinutes - closingMinutes
          : null;

      evidence.push({
        type: 'OPENING_HOURS',
        severity: 'hard',

        poi_id:
          violation.poi_id || null,

        name:
          violation.name || null,

        poi_name:
          violation.name || null,

        opens_at:
          violation.opens_at || null,

        closes_at:
          violation.closes_at || null,

        arrival:
          violation.arrival || null,

        departure:
          violation.departure || null,

        reason:
          violation.reason || null,

        excess_minutes:
          excessMinutes
      });
    }
  }

  return evidence;
}


/**
 * Extract missing travel-edge evidence.
 */
function extractMissingEdgeEvidence(evaluatedAttempts = []) {
  const evidence = [];

  for (const attempt of evaluatedAttempts) {

    const missingEdges =
      attempt?.plan?.missing_edges || [];

    for (const edge of missingEdges) {

      evidence.push({
        type: 'MISSING_TRAVEL_EDGE',

        severity: 'hard',

        from_poi_id:
          edge.from_poi_id ||
          edge.origin_poi_id ||
          null,

        to_poi_id:
          edge.to_poi_id ||
          edge.destination_poi_id ||
          null,

        mode:
          edge.mode || null,

        message:
          edge.message ||
          'No valid travel connection exists.'
      });
    }
  }

  return evidence;
}


/**
 * Extract normal feasibility violations.
 */
function extractGeneralEvidence(evaluatedAttempts = []) {
  const evidence = [];

  for (const attempt of evaluatedAttempts) {

    const violations =
      attempt?.check?.violations || [];

    const summary =
      attempt?.plan?.summary || {};

    for (const violation of violations) {

      if (
        violation.type === 'OPENING_HOURS' ||
        violation.type === 'MISSING_TRAVEL_EDGE'
      ) {
        continue;
      }

      const item = {
        ...violation,
        severity:
          violation.severity || 'hard'
      };


      // ----------------------------------------------------------
      // TIME
      // ----------------------------------------------------------

      if (
        violation.type === 'TIME_LIMIT' &&
        Number.isFinite(summary.minutes)
      ) {
        item.actual_minutes =
          summary.minutes;
      }


      // ----------------------------------------------------------
      // BUDGET
      // ----------------------------------------------------------

      if (
        violation.type === 'BUDGET' &&
        summary.cost !== undefined
      ) {
        item.actual_cost =
          summary.cost;
      }


      // ----------------------------------------------------------
      // CARBON
      // ----------------------------------------------------------

      if (
        violation.type === 'CARBON' &&
        Number.isFinite(summary.carbon_kg)
      ) {
        item.actual_carbon_kg =
          summary.carbon_kg;
      }

      evidence.push(item);
    }
  }

  return evidence;
}


/**
 * Build complete constraint evidence.
 */
function buildConstraintEvidence(
  options = {},
  evaluatedAttempts = []
) {
  const opening =
    extractOpeningHourEvidence(
      evaluatedAttempts
    );

  const missingEdges =
    extractMissingEdgeEvidence(
      evaluatedAttempts
    );

  const general =
    extractGeneralEvidence(
      evaluatedAttempts
    );

  const evidence = [
    ...missingEdges,
    ...opening,
    ...general
  ];


  const start =
    normalizeTimeToMinutes(
      options.day_start || '09:00'
    );

  const end =
    normalizeTimeToMinutes(
      options.day_end || '18:00'
    );

  const availableMins =
    start !== null &&
    end !== null
      ? end - start
      : null;


  return {
    evidence,
    availableMins
  };
}


/**
 * Select the most useful binding constraint.
 */
function selectBindingConstraint(
  evidence = []
) {
  if (!evidence.length) {
    return null;
  }


  // ------------------------------------------------------------
  // 1. Missing travel connection
  // ------------------------------------------------------------

  const missingEdge =
    evidence.find(
      item =>
        item.type === 'MISSING_TRAVEL_EDGE'
    );

  if (missingEdge) {
    return {
      ...missingEdge,
      label:
        getConstraintLabel(
          missingEdge.type
        )
    };
  }


  // ------------------------------------------------------------
  // 2. Opening hours
  // ------------------------------------------------------------

  const openingViolation =
    evidence
      .filter(
        item =>
          item.type === 'OPENING_HOURS'
      )
      .sort(
        (a, b) =>
          (b.excess_minutes || 0) -
          (a.excess_minutes || 0)
      )[0];

  if (openingViolation) {
    return {
      ...openingViolation,
      label:
        getConstraintLabel(
          openingViolation.type
        )
    };
  }


  // ------------------------------------------------------------
  // 3. Hard constraint
  // ------------------------------------------------------------

  const hardViolation =
    evidence.find(
      item =>
        item.severity === 'hard'
    );

  if (hardViolation) {
    return {
      ...hardViolation,
      label:
        getConstraintLabel(
          hardViolation.type
        )
    };
  }


  // ------------------------------------------------------------
  // 4. First available evidence
  // ------------------------------------------------------------

  return {
    ...evidence[0],

    label:
      getConstraintLabel(
        evidence[0].type
      )
  };
}


/**
 * Format a number as INR without relying on floating-point
 * arithmetic for optimizer calculations.
 */
function formatRupees(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const numeric =
    Number(value);

  if (!Number.isFinite(numeric)) {
    return null;
  }

  return `₹${numeric.toFixed(2)}`;
}


/**
 * Build a human-readable infeasibility explanation.
 */
function buildExplanation(
  bindingConstraint
) {
  if (!bindingConstraint) {
    return (
      'No feasible itinerary satisfies all required constraints.'
    );
  }


  switch (bindingConstraint.type) {

    // ==========================================================
    // OPENING HOURS
    // ==========================================================

    case 'OPENING_HOURS': {

      const name =
        bindingConstraint.name ||
        bindingConstraint.poi_name ||
        bindingConstraint.poi_id ||
        'The selected attraction';

      const closesAt =
        bindingConstraint.closes_at ||
        'the configured closing time';

      const departure =
        bindingConstraint.departure ||
        'the required departure time';

      return (
        `${name} closes at ${closesAt}, ` +
        `but the visit cannot be completed before ${departure}.`
      );
    }


    // ==========================================================
    // MISSING TRAVEL EDGE
    // ==========================================================

    case 'MISSING_TRAVEL_EDGE':

      return (
        bindingConstraint.message ||
        'No valid travel connection exists for the requested itinerary.'
      );


    // ==========================================================
    // TIME
    // ==========================================================

    case 'TIME_LIMIT':

      return (
        bindingConstraint.message ||
        'The requested itinerary exceeds the available time.'
      );


    // ==========================================================
    // BUDGET
    // ==========================================================

    case 'BUDGET': {

      /*
       * Prefer the explicit violation message when one exists.
       */
      if (bindingConstraint.message) {
        return bindingConstraint.message;
      }


      /*
       * When the actual required cost and requested budget
       * are available, produce a precise explanation.
       */
      const actualCost =
        formatRupees(
          bindingConstraint.actual_cost
        );

      const budgetCap =
        formatRupees(
          bindingConstraint.limit ??
          bindingConstraint.budget_cap ??
          bindingConstraint.max_cost
        );


      if (
        actualCost &&
        budgetCap
      ) {
        return (
          `The minimum feasible itinerary costs ${actualCost}, ` +
          `which exceeds the budget cap of ${budgetCap}.`
        );
      }


      return (
        'The requested itinerary exceeds the available budget.'
      );
    }


    // ==========================================================
    // CARBON
    // ==========================================================

    case 'CARBON':

      return (
        bindingConstraint.message ||
        'The requested itinerary exceeds the carbon limit.'
      );


    // ==========================================================
    // MUST SEE
    // ==========================================================

    case 'MUST_SEE':

      return (
        bindingConstraint.message ||
        'The required must-see attractions cannot all be included in a feasible itinerary.'
      );


    // ==========================================================
    // START
    // ==========================================================

    case 'START':

      return (
        bindingConstraint.message ||
        'The requested starting point cannot be satisfied.'
      );


    // ==========================================================
    // END
    // ==========================================================

    case 'END':

      return (
        bindingConstraint.message ||
        'The requested ending point cannot be satisfied.'
      );


    // ==========================================================
    // TRANSPORT
    // ==========================================================

    case 'TRANSPORT_MODE':

      return (
        bindingConstraint.message ||
        'The requested transport mode cannot satisfy the itinerary constraints.'
      );


    // ==========================================================
    // CLOSED DAY
    // ==========================================================

    case 'CLOSED_DAY':

      return (
        bindingConstraint.message ||
        'A required attraction is closed on the requested day.'
      );


    // ==========================================================
    // FALLBACK
    // ==========================================================

    default:

      return (
        bindingConstraint.message ||
        'No feasible itinerary satisfies all required constraints.'
      );
  }
}


/**
 * Main infeasibility diagnosis.
 */
function diagnoseInfeasibility(
  options = {},
  evaluatedAttempts = []
) {

  const allViolations =
    collectViolations(
      evaluatedAttempts
    );


  const diagnostic =
    buildConstraintEvidence(
      options,
      evaluatedAttempts
    );


  const selected =
    selectBindingConstraint(
      diagnostic.evidence
    );


  let bindingConstraint = null;


  if (selected) {
    bindingConstraint = {
      ...selected
    };
  }


  if (!bindingConstraint) {
    bindingConstraint = {
      type: 'MULTIPLE_CONSTRAINTS',

      label:
        'Multiple Constraints',

      available_minutes:
        diagnostic.availableMins
    };
  }


  /*
   * Add the requested constraint values to the
   * binding constraint when available.
   *
   * This makes the explanation engine much more useful
   * for budget/time/carbon diagnostics.
   */

  if (
    bindingConstraint.type === 'BUDGET'
  ) {

    if (
      options.budget_cap !== undefined
    ) {
      bindingConstraint.budget_cap =
        options.budget_cap;
    }
  }


  if (
    bindingConstraint.type === 'CARBON'
  ) {

    if (
      options.carbon_cap_kg !== undefined
    ) {
      bindingConstraint.carbon_cap_kg =
        options.carbon_cap_kg;
    }
  }


  if (
    bindingConstraint.type === 'TIME_LIMIT'
  ) {

    bindingConstraint.day_start =
      options.day_start ||
      '09:00';

    bindingConstraint.day_end =
      options.day_end ||
      '18:00';
  }


  const explanation =
    buildExplanation(
      bindingConstraint
    );


  return {
    binding_constraint:
      bindingConstraint,

    explanation,

    violations:
      allViolations
  };
}


module.exports = {
  diagnoseInfeasibility,
  collectViolations,
  buildConstraintEvidence,
  selectBindingConstraint,
  buildExplanation
};