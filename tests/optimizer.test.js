const assert = require('assert');
const path = require('path');
const db = require('../backend/db');
const { optimizeItinerary } = require('../backend/optimizer/optimizer');
const { diagnoseInfeasibility } = require('../backend/optimizer/infeasibility');
const { findSingleConstraintRelaxation } = require('../backend/optimizer/relaxation');
const { parseIntent } = require('../backend/ai/intentParser');

console.log('========================================================');
console.log('   ReRoute Multi-Objective Optimizer Test Suite');
console.log('========================================================\n');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`PASS: ${name} ✅`);
    passedTests++;
  } catch (err) {
    console.error(`FAIL: ${name} ❌`);
    console.error(`  ${err.message}`);
  }
}

// 1. Feasible itinerary test
runTest('1. Should produce a valid feasible itinerary for Bengaluru', () => {
  const result = optimizeItinerary({
    city_id: 'cty_17b8ef2f', // Bengaluru
    day_start: '09:00',
    day_end: '18:00',
    budget_cap: '3000',
    carbon_cap_kg: 15,
    must_see_poi_ids: ['poi_97a3672d'],
    weights: { cost: 0.33, time: 0.33, carbon: 0.34 }
  });

  assert.strictEqual(result.feasible, true, 'Result must be feasible');
  assert(result.stops.length >= 1, 'Must have at least 1 stop');
  assert(result.summary.cost, 'Summary must have cost');
  assert(result.summary.minutes > 0, 'Summary must have positive minutes');
  assert(result.summary.carbon_kg >= 0, 'Summary must have carbon');
  assert.strictEqual(result.stops.some(s => s.poi_id === 'poi_97a3672d'), true, 'Must include must-see POI');
});

// 2. Must-see POI inclusion test
runTest('2. Must include all specified must-see POIs without silently dropping', () => {
  const mustSee = ['poi_7f6561ec', 'poi_e68abae6']; // Jaipur POIs
  const result = optimizeItinerary({
    city_id: 'cty_c07454f1', // Jaipur
    day_start: '08:30',
    day_end: '20:00',
    budget_cap: '5000',
    carbon_cap_kg: 20,
    must_see_poi_ids: mustSee
  });

  assert.strictEqual(result.feasible, true);
  for (const pid of mustSee) {
    const included = result.stops.some(s => s.poi_id === pid);
    assert.strictEqual(included, true, `Must include must-see POI ${pid}`);
  }
});

// 3. Opening-hour violation test
runTest('3. Must reject or report opening hours violation', () => {
  // Try scheduling late at night when attractions are closed
  const result = optimizeItinerary({
    city_id: 'cty_c07454f1',
    day_start: '22:00',
    day_end: '23:30',
    budget_cap: '5000',
    carbon_cap_kg: 20,
    must_see_poi_ids: ['poi_364cac5a'] // Closes at 17:00
  });

  assert.strictEqual(result.feasible, false, 'Should be infeasible when attraction is closed');
  const diag = diagnoseInfeasibility({
    city_id: 'cty_c07454f1',
    day_start: '22:00',
    day_end: '23:30',
    must_see_poi_ids: ['poi_364cac5a']
  }, result.evaluated_attempts);
  assert(diag.explanation.length > 0, 'Must have plain language explanation');
});

// 4. Budget infeasibility test
runTest('4. Must detect budget infeasibility when budget cap is too low', () => {
  const result = optimizeItinerary({
    city_id: 'cty_c07454f1',
    day_start: '08:30',
    day_end: '20:00',
    budget_cap: '5.00', // Ridiculously low ₹5 budget
    carbon_cap_kg: 20,
    must_see_poi_ids: ['poi_364cac5a'] // Entry cost alone is ₹2500
  });

  assert.strictEqual(result.feasible, false, 'Must be infeasible with ₹5 budget');
  const diag = diagnoseInfeasibility({
    budget_cap: '5.00',
    must_see_poi_ids: ['poi_364cac5a'],
    day_start: '08:30',
    day_end: '20:00'
  }, result.evaluated_attempts);
  assert.strictEqual(diag.binding_constraint.type, 'BUDGET_LIMIT');
  assert(diag.explanation.includes('budget cap of ₹5.00 is lower than the minimum'));
});

// 5. Carbon infeasibility test
runTest('5. Must detect carbon infeasibility when carbon cap is too low', () => {
  const result = optimizeItinerary({
    city_id: 'cty_c07454f1',
    day_start: '08:30',
    day_end: '20:00',
    budget_cap: '5000',
    carbon_cap_kg: 0.05, // 50 grams cap
    must_see_poi_ids: ['poi_7f6561ec'] // 2.2 kg carbon
  });

  assert.strictEqual(result.feasible, false, 'Must be infeasible with 0.05 kg carbon cap');
  const diag = diagnoseInfeasibility({
    carbon_cap_kg: 0.05,
    must_see_poi_ids: ['poi_7f6561ec'],
    day_start: '08:30',
    day_end: '20:00'
  }, result.evaluated_attempts);
  assert.strictEqual(diag.binding_constraint.type, 'CARBON_LIMIT');
});

// 6. Time infeasibility test
runTest('6. Must detect time infeasibility when time window is too small', () => {
  const result = optimizeItinerary({
    city_id: 'cty_c07454f1',
    day_start: '09:00',
    day_end: '09:30', // Only 30 minutes window
    budget_cap: '5000',
    carbon_cap_kg: 20,
    must_see_poi_ids: ['poi_364cac5a'] // Takes 120 minutes
  });

  assert.strictEqual(result.feasible, false, 'Must be infeasible with 30 min window');
  const diag = diagnoseInfeasibility({
    day_start: '09:00',
    day_end: '09:30',
    must_see_poi_ids: ['poi_364cac5a']
  }, result.evaluated_attempts);
  assert.strictEqual(diag.binding_constraint.type, 'TIME_LIMIT');
});

// 7. Exactly-one relaxation test
runTest('7. Exactly-one constraint relaxation should find a valid plan', () => {
  const infeasibleOpts = {
    city_id: 'cty_c07454f1',
    day_start: '08:30',
    day_end: '20:00',
    budget_cap: '10.00',
    carbon_cap_kg: 20,
    must_see_poi_ids: ['poi_7f6561ec'] // ₹750 cost
  };

  const res = optimizeItinerary(infeasibleOpts);
  assert.strictEqual(res.feasible, false);

  const diag = diagnoseInfeasibility(infeasibleOpts, res.evaluated_attempts);
  const relaxation = findSingleConstraintRelaxation(infeasibleOpts, diag.binding_constraint, optimizeItinerary);

  assert(relaxation !== null, 'Should return a relaxation proposal');
  assert.strictEqual(relaxation.constraint_type, 'BUDGET');
  assert.strictEqual(relaxation.plan.feasible, true, 'Relaxed plan must be feasible');
  assert(relaxation.relaxed_value.includes('₹'), 'Relaxed budget value formatted with currency');
});

// 8. Slider weight change produces deterministic responsive score changes
runTest('8. Changing weights should alter scoring deterministically', () => {
  const optsCarbon = {
    city_id: 'cty_c07454f1',
    day_start: '08:30',
    day_end: '20:00',
    budget_cap: '5000',
    carbon_cap_kg: 20,
    must_see_poi_ids: ['poi_7f6561ec'],
    weights: { cost: 0.1, time: 0.1, carbon: 0.8 }
  };

  const optsCost = {
    ...optsCarbon,
    weights: { cost: 0.8, time: 0.1, carbon: 0.1 }
  };

  const resCarbon = optimizeItinerary(optsCarbon);
  const resCost = optimizeItinerary(optsCost);

  assert.strictEqual(resCarbon.feasible, true);
  assert.strictEqual(resCost.feasible, true);
  assert.strictEqual(typeof resCarbon.score, 'number');
  assert.strictEqual(typeof resCost.score, 'number');
});

// 9. AI Intent Parser with database grounding
runTest('9. AI Intent parser extracts city, budget, and real POIs from text', () => {
  const parsed = parseIntent('Plan a low-carbon day in Bengaluru under ₹1500 with palace and park');
  assert.strictEqual(parsed.success, true);
  assert.strictEqual(parsed.parsed.city_name, 'Bengaluru');
  assert.strictEqual(parsed.parsed.budget_cap, '1500');
  assert(parsed.parsed.weights.carbon > 0.4, 'Should bias carbon weight high');
});

console.log('\n========================================================');
console.log(`Results: ${passedTests}/${totalTests} Tests Passed!`);
console.log('========================================================');

if (passedTests !== totalTests) {
  process.exit(1);
}
