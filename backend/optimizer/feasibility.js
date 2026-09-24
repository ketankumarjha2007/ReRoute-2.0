const { timeToMinutes, moneyToCents, centsToMoney } = require('./constraints');

/**
 * Feasibility engine
 * Checks all hard constraints on a candidate plan or a set of user inputs.
 */

function validatePlanConstraints(plan, constraints) {
  const violations = [];

  const {
    day_start,
    day_end,
    budget_cap,
    carbon_cap_kg,
    must_see_poi_ids = [],
    start_poi_id,
    end_poi_id,
    allowed_modes
  } = constraints;

  // 1. Must-see POIs constraint
  const visitedPoiIds = new Set(plan.stops.map(s => s.poi_id));
  const missingMustSee = must_see_poi_ids.filter(id => !visitedPoiIds.has(id));
  if (missingMustSee.length > 0) {
    violations.push({
      type: 'MUST_SEE_UNSATISFIED',
      severity: 'hard',
      message: `Plan misses ${missingMustSee.length} mandatory attraction(s): ${missingMustSee.join(', ')}.`,
      missing: missingMustSee
    });
  }

  // 2. Start POI constraint
  if (start_poi_id && plan.stops.length > 0 && plan.stops[0].poi_id !== start_poi_id) {
    violations.push({
      type: 'START_CONSTRAINT',
      severity: 'hard',
      message: `Itinerary does not start at required POI ${start_poi_id}.`,
      required: start_poi_id,
      actual: plan.stops[0].poi_id
    });
  }

  // 3. End POI constraint
  if (end_poi_id && plan.stops.length > 0 && plan.stops[plan.stops.length - 1].poi_id !== end_poi_id) {
    violations.push({
      type: 'END_CONSTRAINT',
      severity: 'hard',
      message: `Itinerary does not end at required POI ${end_poi_id}.`,
      required: end_poi_id,
      actual: plan.stops[plan.stops.length - 1].poi_id
    });
  }

  // 4. Time limit constraint
  const dayStartMins = timeToMinutes(day_start);
  const dayEndMins = timeToMinutes(day_end);
  const availableMins = Math.max(0, dayEndMins - dayStartMins);

  if (plan.summary.minutes > availableMins) {
    violations.push({
      type: 'TIME_LIMIT',
      severity: 'hard',
      message: `The itinerary requires ${plan.summary.minutes} minutes, but your available window is only ${availableMins} minutes (${day_start} to ${day_end}).`,
      required: plan.summary.minutes,
      available: availableMins,
      excess: plan.summary.minutes - availableMins
    });
  }

  // 5. Budget limit constraint
  if (budget_cap !== undefined && budget_cap !== null && budget_cap !== '') {
    const budgetCents = moneyToCents(budget_cap);
    const costCents = plan.summary.cost_cents;
    if (costCents > budgetCents) {
      violations.push({
        type: 'BUDGET_LIMIT',
        severity: 'hard',
        message: `Total cost of ₹${centsToMoney(costCents)} exceeds your budget cap of ₹${centsToMoney(budgetCents)}.`,
        required_cents: costCents,
        available_cents: budgetCents,
        excess_cents: costCents - budgetCents,
        cost_formatted: `₹${centsToMoney(costCents)}`,
        budget_formatted: `₹${centsToMoney(budgetCents)}`
      });
    }
  }

  // 6. Carbon limit constraint
  if (carbon_cap_kg !== undefined && carbon_cap_kg !== null && Number(carbon_cap_kg) > 0) {
    const carbonCap = Number(carbon_cap_kg);
    if (plan.summary.carbon_kg > carbonCap) {
      violations.push({
        type: 'CARBON_LIMIT',
        severity: 'hard',
        message: `Total carbon emissions of ${plan.summary.carbon_kg.toFixed(2)} kg CO₂ exceed your cap of ${carbonCap.toFixed(2)} kg CO₂.`,
        required: Number(plan.summary.carbon_kg.toFixed(3)),
        available: carbonCap,
        excess: Number((plan.summary.carbon_kg - carbonCap).toFixed(3))
      });
    }
  }

  // 7. Opening hours violations
  if (plan.opening_hour_violations && plan.opening_hour_violations.length > 0) {
    for (const ohv of plan.opening_hour_violations) {
      violations.push({
        type: 'OPENING_HOURS',
        severity: 'hard',
        poi_id: ohv.poi_id,
        poi_name: ohv.name,
        message: `${ohv.name}: ${ohv.reason}`,
        opens_at: ohv.opens_at,
        closes_at: ohv.closes_at,
        arrival: ohv.arrival,
        departure: ohv.departure
      });
    }
  }

  // 8. Missing travel edges
  if (plan.missing_edges && plan.missing_edges.length > 0) {
    for (const me of plan.missing_edges) {
      violations.push({
        type: 'MISSING_TRAVEL_EDGE',
        severity: 'hard',
        from: me.from,
        to: me.to,
        message: `No valid travel connection found from ${me.from} to ${me.to}.`
      });
    }
  }

  // 9. Transport mode constraints
  if (allowed_modes && allowed_modes.length > 0 && plan.transfers) {
    const allowedSet = new Set(Array.isArray(allowed_modes) ? allowed_modes : allowed_modes.split(',').map(m => m.trim().toLowerCase()));
    for (const tr of plan.transfers) {
      if (tr.mode && !allowedSet.has(tr.mode.toLowerCase())) {
        violations.push({
          type: 'MODE_CONSTRAINT',
          severity: 'hard',
          mode: tr.mode,
          message: `Transfer mode '${tr.mode}' is not in allowed modes: ${Array.from(allowedSet).join(', ')}.`
        });
      }
    }
  }

  // 10. Closed days violations
  if (plan.closed_day_violations && plan.closed_day_violations.length > 0) {
    for (const cd of plan.closed_day_violations) {
      violations.push({
        type: 'CLOSED_DAY',
        severity: 'hard',
        poi_id: cd.poi_id,
        poi_name: cd.name,
        message: `${cd.name} is closed on this day (${cd.reason || 'Attraction weekly holiday'}).`
      });
    }
  }

  return {
    feasible: violations.length === 0,
    violations
  };
}

module.exports = {
  validatePlanConstraints
};
