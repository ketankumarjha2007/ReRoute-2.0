const { minutesToTime, timeToMinutes, centsToMoney, moneyToCents } = require('./constraints');

/**
 * Generates single-constraint relaxations and finds the best feasible plan
 */
function findSingleConstraintRelaxation(options, bindingConstraint, optimizeFn) {
  const relaxations = [];

  const {
    city_id,
    day_start = '09:00',
    day_end = '18:00',
    budget_cap,
    carbon_cap_kg,
    must_see_poi_ids = [],
    weights,
    allowed_modes,
    max_activities
  } = options;

  const currentEndMins = timeToMinutes(day_end);
  const currentStartMins = timeToMinutes(day_start);

  // 1. Candidate: Extend Day End Time
  // Extend by needed excess or progressive increments (30, 60, 90, 120, 180 min)
  let neededTimeExtension = 60;
  if (bindingConstraint?.type === 'TIME_LIMIT' && bindingConstraint.excess_minutes) {
    neededTimeExtension = Math.ceil(bindingConstraint.excess_minutes / 15) * 15 + 15;
  }
  const candidateEndTimes = [
    Math.min(23 * 60 + 59, currentEndMins + neededTimeExtension),
    Math.min(23 * 60 + 59, currentEndMins + 120),
    Math.min(23 * 60 + 59, currentEndMins + 180)
  ];

  for (const newEndMins of Array.from(new Set(candidateEndTimes))) {
    if (newEndMins <= currentEndMins) continue;
    const newDayEnd = minutesToTime(newEndMins);
    const testOptions = { ...options, day_end: newDayEnd };
    const res = optimizeFn(testOptions);
    if (res && res.feasible) {
      const addedMins = newEndMins - currentEndMins;
      relaxations.push({
        constraint_type: 'TIME',
        name: 'Day End Time',
        action: 'Extend Day End',
        original_value: day_end,
        relaxed_value: newDayEnd,
        difference_text: `+${addedMins} minutes`,
        description: `Extend your day from ${day_end} to ${newDayEnd} (${addedMins} extra minutes).`,
        priority: bindingConstraint?.type === 'TIME_LIMIT' ? 1 : 2,
        plan: res
      });
      break; // Keep minimal feasible extension
    }
  }

  // 2. Candidate: Shift Day Start Earlier
  let neededStartShift = 60;
  if (bindingConstraint?.type === 'TIME_LIMIT' && bindingConstraint.excess_minutes) {
    neededStartShift = Math.ceil(bindingConstraint.excess_minutes / 15) * 15 + 15;
  }
  const candidateStartTimes = [
    Math.max(6 * 60, currentStartMins - neededStartShift),
    Math.max(6 * 60, currentStartMins - 120)
  ];

  for (const newStartMins of Array.from(new Set(candidateStartTimes))) {
    if (newStartMins >= currentStartMins) continue;
    const newDayStart = minutesToTime(newStartMins);
    const testOptions = { ...options, day_start: newDayStart };
    const res = optimizeFn(testOptions);
    if (res && res.feasible) {
      const earlierMins = currentStartMins - newStartMins;
      relaxations.push({
        constraint_type: 'TIME_START',
        name: 'Day Start Time',
        action: 'Shift Day Start Earlier',
        original_value: day_start,
        relaxed_value: newDayStart,
        difference_text: `${earlierMins} mins earlier`,
        description: `Start your day at ${newDayStart} instead of ${day_start} (${earlierMins} mins earlier).`,
        priority: bindingConstraint?.type === 'TIME_LIMIT' ? 1 : 3,
        plan: res
      });
      break;
    }
  }

  // 3. Candidate: Increase Budget Cap
  const currentBudgetCents = budget_cap ? moneyToCents(budget_cap) : null;
  if (currentBudgetCents !== null) {
    const candidateBudgets = [];
    if (bindingConstraint?.type === 'BUDGET_LIMIT' && bindingConstraint.required_cost) {
      const reqCents = moneyToCents(bindingConstraint.required_cost);
      candidateBudgets.push(reqCents);
      candidateBudgets.push(Math.round(reqCents * 1.15));
    }
    const multipliers = [1.25, 1.5, 2.0, 3.0, 5.0, 10.0, 50.0, 100.0];
    for (const m of multipliers) {
      candidateBudgets.push(Math.round(currentBudgetCents * m));
    }

    for (const relaxedCents of Array.from(new Set(candidateBudgets)).sort((a, b) => a - b)) {
      if (relaxedCents <= currentBudgetCents) continue;
      const relaxedBudgetStr = centsToMoney(relaxedCents);
      const testOptions = { ...options, budget_cap: relaxedBudgetStr };
      const res = optimizeFn(testOptions);
      if (res && res.feasible) {
        relaxations.push({
          constraint_type: 'BUDGET',
          name: 'Budget Cap',
          action: 'Increase Budget Cap',
          original_value: `₹${centsToMoney(currentBudgetCents)}`,
          relaxed_value: `₹${relaxedBudgetStr}`,
          difference_text: `+₹${centsToMoney(relaxedCents - currentBudgetCents)}`,
          description: `Increase the budget cap from ₹${centsToMoney(currentBudgetCents)} to ₹${relaxedBudgetStr}.`,
          priority: bindingConstraint?.type === 'BUDGET_LIMIT' ? 1 : 4,
          plan: res
        });
        break;
      }
    }
  }

  // 4. Candidate: Increase Carbon Cap
  const currentCarbonCap = Number(carbon_cap_kg);
  if (!isNaN(currentCarbonCap) && currentCarbonCap > 0) {
    const candidateCarbons = [];
    if (bindingConstraint?.type === 'CARBON_LIMIT' && bindingConstraint.required_carbon_kg) {
      candidateCarbons.push(Number((bindingConstraint.required_carbon_kg + 0.5).toFixed(1)));
      candidateCarbons.push(Number((bindingConstraint.required_carbon_kg * 1.2).toFixed(1)));
    }
    const carbonMultipliers = [1.3, 1.6, 2.0, 3.0, 5.0, 10.0];
    for (const cm of carbonMultipliers) {
      candidateCarbons.push(Number((currentCarbonCap * cm).toFixed(2)));
    }

    for (const relaxedCarbon of Array.from(new Set(candidateCarbons)).sort((a, b) => a - b)) {
      if (relaxedCarbon <= currentCarbonCap) continue;
      const testOptions = { ...options, carbon_cap_kg: relaxedCarbon };
      const res = optimizeFn(testOptions);
      if (res && res.feasible) {
        relaxations.push({
          constraint_type: 'CARBON',
          name: 'Carbon Emissions Cap',
          action: 'Increase Carbon Cap',
          original_value: `${currentCarbonCap.toFixed(1)} kg`,
          relaxed_value: `${relaxedCarbon.toFixed(1)} kg`,
          difference_text: `+${(relaxedCarbon - currentCarbonCap).toFixed(1)} kg`,
          description: `Increase the carbon cap from ${currentCarbonCap.toFixed(1)} kg to ${relaxedCarbon.toFixed(1)} kg CO₂.`,
          priority: bindingConstraint?.type === 'CARBON_LIMIT' ? 1 : 5,
          plan: res
        });
        break;
      }
    }
  }

  if (relaxations.length === 0) {
    return null;
  }

  // Sort by priority (binding constraint matches first)
  relaxations.sort((a, b) => a.priority - b.priority);

  return relaxations[0];
}

module.exports = {
  findSingleConstraintRelaxation
};
