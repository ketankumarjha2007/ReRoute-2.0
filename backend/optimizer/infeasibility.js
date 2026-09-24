const {
  minutesToTime,
  timeToMinutes,
  centsToMoney,
  moneyToCents
} = require('./constraints');

/**
 * Diagnoses infeasibility and identifies the binding constraint.
 *
 * Important:
 * For OPENING_HOURS violations, the POI ID is preserved in
 * binding_constraint.poi_id so the relaxation engine can identify
 * exactly which POI's hours need to be relaxed.
 */
function diagnoseInfeasibility(options, evaluatedAttempts = []) {
  const {
    day_start = '09:00',
    day_end = '18:00',
    budget_cap,
    carbon_cap_kg,
    must_see_poi_ids = []
  } = options;

  const startMins = timeToMinutes(day_start);
  const endMins = timeToMinutes(day_end);
  const availableMins = Math.max(0, endMins - startMins);

  const budgetCents =
    budget_cap !== undefined &&
    budget_cap !== null &&
    budget_cap !== ''
      ? moneyToCents(budget_cap)
      : null;

  const carbonCap =
    carbon_cap_kg !== undefined &&
    carbon_cap_kg !== null &&
    Number(carbon_cap_kg) > 0
      ? Number(carbon_cap_kg)
      : null;

  // ------------------------------------------------------------
  // Gather violations across all evaluated attempts
  // ------------------------------------------------------------

  const allViolations = [];

  for (const att of evaluatedAttempts) {
    if (att?.check?.violations) {
      allViolations.push(...att.check.violations);
    }
  }

  // ------------------------------------------------------------
  // Look for minimum required values among attempted sequences
  // ------------------------------------------------------------

  let minRequiredTime = Infinity;
  let minRequiredCostCents = Infinity;
  let minRequiredCarbon = Infinity;

  const openingHourIssues = [];
  const missingEdgeIssues = [];

  for (const att of evaluatedAttempts) {
    if (att?.plan?.summary) {
      const summary = att.plan.summary;

      if (
        Number.isFinite(Number(summary.minutes)) &&
        summary.minutes < minRequiredTime
      ) {
        minRequiredTime = summary.minutes;
      }

      if (
        Number.isFinite(Number(summary.cost_cents)) &&
        summary.cost_cents < minRequiredCostCents
      ) {
        minRequiredCostCents = summary.cost_cents;
      }

      if (
        Number.isFinite(Number(summary.carbon_kg)) &&
        summary.carbon_kg < minRequiredCarbon
      ) {
        minRequiredCarbon = summary.carbon_kg;
      }
    }

    if (
      Array.isArray(att?.plan?.opening_hour_violations) &&
      att.plan.opening_hour_violations.length > 0
    ) {
      openingHourIssues.push(
        ...att.plan.opening_hour_violations
      );
    }

    if (
      Array.isArray(att?.plan?.missing_edges) &&
      att.plan.missing_edges.length > 0
    ) {
      missingEdgeIssues.push(
        ...att.plan.missing_edges
      );
    }
  }

  // ------------------------------------------------------------
  // Determine binding constraint
  //
  // Priority:
  // 1. Missing travel edge
  // 2. Opening hours
  // 3. Time
  // 4. Budget
  // 5. Carbon
  // 6. Multiple constraints
  // ------------------------------------------------------------

  let bindingConstraint = null;
  let explanation = '';

  // ------------------------------------------------------------
  // 1. Missing travel edge
  // ------------------------------------------------------------

  if (missingEdgeIssues.length > 0) {
    const edge = missingEdgeIssues[0];

    bindingConstraint = {
      type: 'MISSING_TRAVEL_EDGE',
      label: 'Missing Transit Route',
      from: edge.from,
      to: edge.to
    };

    explanation =
      `There is no valid transport connection in the travel network ` +
      `between attraction ${edge.from} and ${edge.to}.`;
  }

  // ------------------------------------------------------------
  // 2. Opening hours
  // ------------------------------------------------------------

  else if (openingHourIssues.length > 0) {
    const oh = openingHourIssues[0];

    /*
     * IMPORTANT FIX:
     *
     * opening_hour_violations already contains:
     *
     * poi_id: "poi_a34a401d"
     *
     * Preserve that ID inside binding_constraint.
     *
     * The relaxation engine needs this exact ID to construct:
     *
     * opening_hours_overrides: {
     *   "poi_a34a401d": {
     *      closes_at: "19:22"
     *   }
     * }
     */
    bindingConstraint = {
      type: 'OPENING_HOURS',
      label: 'Attraction Opening Hours',

      // Critical field for relaxation.js
      poi_id: oh.poi_id || null,

      poi_name: oh.name || oh.poi_name || null,

      opens_at: oh.opens_at || null,
      closes_at: oh.closes_at || null,

      arrival: oh.arrival || null,
      departure: oh.departure || null
    };

    const poiLabel =
      oh.name ||
      oh.poi_name ||
      oh.poi_id ||
      'The selected attraction';

    explanation =
      `${poiLabel} closes at ${oh.closes_at}, ` +
      `but your visit cannot be completed before ${oh.departure}.`;
  }

  // ------------------------------------------------------------
  // 3. Time limit
  // ------------------------------------------------------------

  else if (
    minRequiredTime !== Infinity &&
    minRequiredTime > availableMins
  ) {
    const diff = minRequiredTime - availableMins;

    bindingConstraint = {
      type: 'TIME_LIMIT',
      label: 'Available Time Window',
      required_minutes: minRequiredTime,
      available_minutes: availableMins,
      excess_minutes: diff,
      day_start,
      day_end
    };

    explanation =
      `Your selected must-see attractions require ` +
      `${minRequiredTime} minutes (including activities and travel), ` +
      `but your available day window from ${day_start} to ${day_end} ` +
      `is only ${availableMins} minutes ` +
      `(short by ${diff} minutes).`;
  }

  // ------------------------------------------------------------
  // 4. Budget limit
  // ------------------------------------------------------------

  else if (
    budgetCents !== null &&
    minRequiredCostCents !== Infinity &&
    minRequiredCostCents > budgetCents
  ) {
    const diffCents =
      minRequiredCostCents - budgetCents;

    bindingConstraint = {
      type: 'BUDGET_LIMIT',
      label: 'Budget Cap',
      required_cost:
        `₹${centsToMoney(minRequiredCostCents)}`,
      available_budget:
        `₹${centsToMoney(budgetCents)}`,
      excess_cost:
        `₹${centsToMoney(diffCents)}`
    };

    explanation =
      `Your budget cap of ₹${centsToMoney(budgetCents)} ` +
      `is lower than the minimum feasible itinerary cost of ` +
      `₹${centsToMoney(minRequiredCostCents)} ` +
      `(short by ₹${centsToMoney(diffCents)}).`;
  }

  // ------------------------------------------------------------
  // 5. Carbon limit
  // ------------------------------------------------------------

  else if (
    carbonCap !== null &&
    minRequiredCarbon !== Infinity &&
    minRequiredCarbon > carbonCap
  ) {
    const diffCarbon =
      Number(
        (minRequiredCarbon - carbonCap).toFixed(2)
      );

    bindingConstraint = {
      type: 'CARBON_LIMIT',
      label: 'Carbon Cap',
      required_carbon_kg:
        Number(minRequiredCarbon.toFixed(2)),
      available_carbon_kg: carbonCap,
      excess_carbon_kg: diffCarbon
    };

    explanation =
      `Your carbon cap of ${carbonCap.toFixed(1)} kg CO₂ ` +
      `is lower than the minimum achievable emissions of ` +
      `${minRequiredCarbon.toFixed(1)} kg CO₂ for this route ` +
      `(exceeded by ${diffCarbon} kg).`;
  }

  // ------------------------------------------------------------
  // 6. General combined constraint conflict
  // ------------------------------------------------------------

  else {
    bindingConstraint = {
      type: 'MULTIPLE_CONSTRAINTS',
      label: 'Combined Constraints',
      available_minutes: availableMins
    };

    explanation =
      `The selected ${must_see_poi_ids.length} attractions ` +
      `cannot be scheduled simultaneously within the specified ` +
      `time, budget, and carbon constraints.`;
  }

  // ------------------------------------------------------------
  // Safety fallback:
  //
  // If opening-hours violation exists but somehow the selected
  // opening issue does not contain poi_id, try to recover the ID
  // from the general violations list by matching the POI name.
  //
  // This prevents the relaxation flow from breaking if the
  // internal violation object changes slightly later.
  // ------------------------------------------------------------

  if (
    bindingConstraint?.type === 'OPENING_HOURS' &&
    !bindingConstraint.poi_id
  ) {
    const matchingViolation = allViolations.find(
      violation =>
        violation?.type === 'OPENING_HOURS' &&
        (
          (
            bindingConstraint.poi_name &&
            (
              violation.poi_name === bindingConstraint.poi_name ||
              violation.name === bindingConstraint.poi_name
            )
          ) ||
          (
            bindingConstraint.arrival &&
            violation.arrival === bindingConstraint.arrival &&
            bindingConstraint.departure &&
            violation.departure === bindingConstraint.departure
          )
        ) &&
        violation.poi_id
    );

    if (matchingViolation) {
      bindingConstraint.poi_id =
        matchingViolation.poi_id;
    }
  }

  return {
    binding_constraint: bindingConstraint,
    explanation,
    violations: allViolations
  };
}

module.exports = {
  diagnoseInfeasibility
};