const { minutesToTime, timeToMinutes, centsToMoney, moneyToCents } = require('./constraints');

/**
 * Diagnoses infeasibility and identifies the binding constraint
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
  const budgetCents = (budget_cap !== undefined && budget_cap !== null && budget_cap !== '')
    ? moneyToCents(budget_cap)
    : null;
  const carbonCap = (carbon_cap_kg !== undefined && carbon_cap_kg !== null && Number(carbon_cap_kg) > 0)
    ? Number(carbon_cap_kg)
    : null;

  // Gather violations across attempts
  let allViolations = [];
  for (const att of evaluatedAttempts) {
    if (att.check && att.check.violations) {
      allViolations.push(...att.check.violations);
    }
  }

  // Look for minimum required values among attempted candidate sequences
  let minRequiredTime = Infinity;
  let minRequiredCostCents = Infinity;
  let minRequiredCarbon = Infinity;
  let openingHourIssues = [];
  let missingEdgeIssues = [];

  for (const att of evaluatedAttempts) {
    if (att.plan && att.plan.summary) {
      if (att.plan.summary.minutes < minRequiredTime) minRequiredTime = att.plan.summary.minutes;
      if (att.plan.summary.cost_cents < minRequiredCostCents) minRequiredCostCents = att.plan.summary.cost_cents;
      if (att.plan.summary.carbon_kg < minRequiredCarbon) minRequiredCarbon = att.plan.summary.carbon_kg;
    }
    if (att.plan && att.plan.opening_hour_violations && att.plan.opening_hour_violations.length > 0) {
      openingHourIssues.push(...att.plan.opening_hour_violations);
    }
    if (att.plan && att.plan.missing_edges && att.plan.missing_edges.length > 0) {
      missingEdgeIssues.push(...att.plan.missing_edges);
    }
  }

  // Determine binding constraint in order of physical impossibilities -> resource limits
  let bindingConstraint = null;
  let explanation = '';

  if (missingEdgeIssues.length > 0) {
    const edge = missingEdgeIssues[0];
    bindingConstraint = {
      type: 'MISSING_TRAVEL_EDGE',
      label: 'Missing Transit Route',
      from: edge.from,
      to: edge.to
    };
    explanation = `There is no valid transport connection in the travel network between attraction ${edge.from} and ${edge.to}.`;
  } else if (openingHourIssues.length > 0) {
    const oh = openingHourIssues[0];
    bindingConstraint = {
      type: 'OPENING_HOURS',
      label: 'Attraction Opening Hours',
      poi_name: oh.name,
      opens_at: oh.opens_at,
      closes_at: oh.closes_at,
      arrival: oh.arrival,
      departure: oh.departure
    };
    explanation = `${oh.name} closes at ${oh.closes_at}, but your visit cannot be completed before ${oh.departure}.`;
  } else if (minRequiredTime !== Infinity && minRequiredTime > availableMins) {
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
    explanation = `Your selected must-see attractions require ${minRequiredTime} minutes (including activities and travel), but your available day window from ${day_start} to ${day_end} is only ${availableMins} minutes (short by ${diff} minutes).`;
  } else if (budgetCents !== null && minRequiredCostCents !== Infinity && minRequiredCostCents > budgetCents) {
    const diffCents = minRequiredCostCents - budgetCents;
    bindingConstraint = {
      type: 'BUDGET_LIMIT',
      label: 'Budget Cap',
      required_cost: `₹${centsToMoney(minRequiredCostCents)}`,
      available_budget: `₹${centsToMoney(budgetCents)}`,
      excess_cost: `₹${centsToMoney(diffCents)}`
    };
    explanation = `Your budget cap of ₹${centsToMoney(budgetCents)} is lower than the minimum feasible itinerary cost of ₹${centsToMoney(minRequiredCostCents)} (short by ₹${centsToMoney(diffCents)}).`;
  } else if (carbonCap !== null && minRequiredCarbon !== Infinity && minRequiredCarbon > carbonCap) {
    const diffCarbon = Number((minRequiredCarbon - carbonCap).toFixed(2));
    bindingConstraint = {
      type: 'CARBON_LIMIT',
      label: 'Carbon Cap',
      required_carbon_kg: Number(minRequiredCarbon.toFixed(2)),
      available_carbon_kg: carbonCap,
      excess_carbon_kg: diffCarbon
    };
    explanation = `Your carbon cap of ${carbonCap.toFixed(1)} kg CO₂ is lower than the minimum achievable emissions of ${minRequiredCarbon.toFixed(1)} kg CO₂ for this route (exceeded by ${diffCarbon} kg).`;
  } else {
    // General constraint conflict
    bindingConstraint = {
      type: 'MULTIPLE_CONSTRAINTS',
      label: 'Combined Constraints',
      available_minutes: availableMins
    };
    explanation = `The selected ${must_see_poi_ids.length} attractions cannot be scheduled simultaneously within the specified time, budget, and carbon constraints.`;
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
