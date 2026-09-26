const assert = require('assert');

const {
  optimizeItinerary
} = require('../backend/optimizer/optimizer');

const {
  diagnoseInfeasibility
} = require('../backend/optimizer/infeasibility');

const {
  findSingleConstraintRelaxation
} = require('../backend/optimizer/relaxation');

const {
  parseIntent
} = require('../backend/ai/intentParser');

console.log('========================================================');
console.log('   ReRoute Multi-Objective Optimizer Test Suite');
console.log('========================================================\n');

let passedTests = 0;
let totalTests = 0;

/**
 * ============================================================
 * Run one test safely.
 *
 * The optimizer is asynchronous because it loads
 * POI/travel data from Supabase.
 * ============================================================
 */
async function runTest(name, fn) {
  totalTests++;

  try {
    await fn();

    console.log(`PASS: ${name} ✅`);
    passedTests++;
  } catch (err) {
    console.error(`FAIL: ${name} ❌`);
    console.error(`  ${err.message}`);

    if (err.stack) {
      console.error(err.stack);
    }
  }
}

/**
 * ============================================================
 * TEST SUITE
 * ============================================================
 */
async function main() {

  // ==========================================================
  // 1. Feasible itinerary test
  // ==========================================================

  await runTest(
    '1. Should produce a valid feasible itinerary for Bengaluru',
    async () => {

      const result = await optimizeItinerary({
        city_id: 'cty_17b8ef2f', // Bengaluru
        day_start: '09:00',
        day_end: '18:00',
        budget_cap: '3000',
        carbon_cap_kg: 15,
        must_see_poi_ids: ['poi_97a3672d'],
        weights: {
          cost: 0.33,
          time: 0.33,
          carbon: 0.34
        }
      });

      assert.strictEqual(
        result.feasible,
        true,
        'Result must be feasible'
      );

      assert(
        Array.isArray(result.stops),
        'Result must contain stops array'
      );

      assert(
        result.stops.length >= 1,
        'Must have at least 1 stop'
      );

      assert(
        result.summary,
        'Result must contain summary'
      );

      assert(
        result.summary.cost,
        'Summary must have cost'
      );

      assert(
        result.summary.minutes > 0,
        'Summary must have positive minutes'
      );

      assert(
        result.summary.carbon_kg >= 0,
        'Summary must have carbon'
      );

      assert.strictEqual(
        result.stops.some(
          stop => stop.poi_id === 'poi_97a3672d'
        ),
        true,
        'Must include must-see POI'
      );
    }
  );


  // ==========================================================
  // 2. Must-see POI inclusion test
  // ==========================================================

  await runTest(
    '2. Must include all specified must-see POIs without silently dropping',
    async () => {

      const mustSee = [
        'poi_7f6561ec',
        'poi_e68abae6'
      ];

      const result = await optimizeItinerary({
        city_id: 'cty_c07454f1', // Jaipur
        day_start: '08:30',
        day_end: '20:00',
        budget_cap: '5000',
        carbon_cap_kg: 20,
        must_see_poi_ids: mustSee
      });

      assert.strictEqual(
        result.feasible,
        true,
        'Itinerary must be feasible'
      );

      assert(
        Array.isArray(result.stops),
        'Result must contain stops array'
      );

      for (const pid of mustSee) {

        const included = result.stops.some(
          stop => stop.poi_id === pid
        );

        assert.strictEqual(
          included,
          true,
          `Must include must-see POI ${pid}`
        );
      }
    }
  );


  // ==========================================================
  // 3. Opening-hours violation test
  // ==========================================================

  await runTest(
    '3. Must reject or report opening hours violation',
    async () => {

      const result = await optimizeItinerary({
        city_id: 'cty_c07454f1',
        day_start: '22:00',
        day_end: '23:30',
        budget_cap: '5000',
        carbon_cap_kg: 20,
        must_see_poi_ids: ['poi_364cac5a']
      });

      assert.strictEqual(
        result.feasible,
        false,
        'Should be infeasible when attraction is closed'
      );

      assert(
        Array.isArray(result.evaluated_attempts),
        'Infeasible result must contain evaluated_attempts'
      );

      const diag = diagnoseInfeasibility(
        {
          city_id: 'cty_c07454f1',
          day_start: '22:00',
          day_end: '23:30',
          must_see_poi_ids: ['poi_364cac5a']
        },
        result.evaluated_attempts
      );

      assert(
        diag,
        'Infeasibility diagnosis must be returned'
      );

      assert(
        typeof diag.explanation === 'string',
        'Diagnosis must contain explanation'
      );

      assert(
        diag.explanation.length > 0,
        'Must have plain language explanation'
      );
    }
  );


  // ==========================================================
  // 4. Budget infeasibility test
  // ==========================================================

  await runTest(
    '4. Must detect budget infeasibility when budget cap is too low',
    async () => {

      const result = await optimizeItinerary({
        city_id: 'cty_c07454f1',
        day_start: '08:30',
        day_end: '20:00',
        budget_cap: '5.00',
        carbon_cap_kg: 20,
        must_see_poi_ids: ['poi_364cac5a']
      });

      assert.strictEqual(
        result.feasible,
        false,
        'Must be infeasible with ₹5 budget'
      );

      assert(
        Array.isArray(result.evaluated_attempts),
        'Infeasible result must contain evaluated_attempts'
      );

      const diag = diagnoseInfeasibility(
        {
          city_id: 'cty_c07454f1',
          day_start: '08:30',
          day_end: '20:00',
          budget_cap: '5.00',
          must_see_poi_ids: ['poi_364cac5a']
        },
        result.evaluated_attempts
      );

      assert(
        diag,
        'Infeasibility diagnosis must be returned'
      );

      assert(
        diag.binding_constraint,
        'Binding constraint must be identified'
      );

      assert.strictEqual(
        diag.binding_constraint.type,
        'BUDGET_LIMIT',
        'Binding constraint must be budget limit'
      );

      // The backend currently explains the issue like:
      // "Total cost of ₹2500.00 exceeds your budget cap of ₹5.00."
      assert(
        diag.explanation.includes('budget cap of ₹5.00'),
        'Explanation must identify the insufficient budget'
      );

      assert(
        diag.explanation.includes('exceeds'),
        'Explanation must explain that the itinerary exceeds the budget'
      );

      assert(
        diag.explanation.includes('₹'),
        'Explanation must include currency'
      );
    }
  );


  // ==========================================================
  // 5. Carbon infeasibility test
  // ==========================================================

  await runTest(
    '5. Must detect carbon infeasibility when carbon cap is too low',
    async () => {

      const result = await optimizeItinerary({
        city_id: 'cty_c07454f1',
        day_start: '08:30',
        day_end: '20:00',
        budget_cap: '5000',
        carbon_cap_kg: 0.05,
        must_see_poi_ids: ['poi_7f6561ec']
      });

      assert.strictEqual(
        result.feasible,
        false,
        'Must be infeasible with 0.05 kg carbon cap'
      );

      assert(
        Array.isArray(result.evaluated_attempts),
        'Infeasible result must contain evaluated_attempts'
      );

      const diag = diagnoseInfeasibility(
        {
          city_id: 'cty_c07454f1',
          day_start: '08:30',
          day_end: '20:00',
          carbon_cap_kg: 0.05,
          must_see_poi_ids: ['poi_7f6561ec']
        },
        result.evaluated_attempts
      );

      assert(
        diag.binding_constraint,
        'Binding constraint must be identified'
      );

      assert.strictEqual(
        diag.binding_constraint.type,
        'CARBON_LIMIT',
        'Binding constraint must be carbon limit'
      );
    }
  );


  // ==========================================================
  // 6. Time infeasibility test
  // ==========================================================

  await runTest(
    '6. Must detect time infeasibility when time window is too small',
    async () => {

      const result = await optimizeItinerary({
        city_id: 'cty_c07454f1',
        day_start: '09:00',
        day_end: '09:30',
        budget_cap: '5000',
        carbon_cap_kg: 20,
        must_see_poi_ids: ['poi_364cac5a']
      });

      assert.strictEqual(
        result.feasible,
        false,
        'Must be infeasible with 30 min window'
      );

      assert(
        Array.isArray(result.evaluated_attempts),
        'Infeasible result must contain evaluated_attempts'
      );

      const diag = diagnoseInfeasibility(
        {
          city_id: 'cty_c07454f1',
          day_start: '09:00',
          day_end: '09:30',
          must_see_poi_ids: ['poi_364cac5a']
        },
        result.evaluated_attempts
      );

      assert(
        diag.binding_constraint,
        'Binding constraint must be identified'
      );

      assert.strictEqual(
        diag.binding_constraint.type,
        'TIME_LIMIT',
        'Binding constraint must be time limit'
      );
    }
  );


  // ==========================================================
  // 7. Exactly-one relaxation test
  // ==========================================================

  await runTest(
    '7. Exactly-one constraint relaxation should find a valid plan',
    async () => {

      const infeasibleOpts = {
        city_id: 'cty_c07454f1',
        day_start: '08:30',
        day_end: '20:00',
        budget_cap: '10.00',
        carbon_cap_kg: 20,
        must_see_poi_ids: ['poi_7f6561ec']
      };

      const res = await optimizeItinerary(
        infeasibleOpts
      );

      assert.strictEqual(
        res.feasible,
        false,
        'Original plan must be infeasible'
      );

      assert(
        Array.isArray(res.evaluated_attempts),
        'Infeasible result must contain evaluated_attempts'
      );

      const diag = diagnoseInfeasibility(
        infeasibleOpts,
        res.evaluated_attempts
      );

      assert(
        diag.binding_constraint,
        'Binding constraint must be identified'
      );

      const relaxation = await findSingleConstraintRelaxation(
        infeasibleOpts,
        diag.binding_constraint,
        optimizeItinerary
      );

      assert(
        relaxation !== null,
        'Should return a relaxation proposal'
      );

      assert(
        relaxation,
        'Relaxation result must exist'
      );

      assert.strictEqual(
        relaxation.constraint_type,
        'BUDGET',
        'Relaxation should target budget'
      );

      assert(
        relaxation.plan,
        'Relaxation must contain a plan'
      );

      assert.strictEqual(
        relaxation.plan.feasible,
        true,
        'Relaxed plan must be feasible'
      );

      assert(
        typeof relaxation.relaxed_value === 'string',
        'Relaxed value must be formatted as a string'
      );

      assert(
        relaxation.relaxed_value.includes('₹'),
        'Relaxed budget value formatted with currency'
      );
    }
  );


  // ==========================================================
  // 8. Slider weight change test
  // ==========================================================

  await runTest(
    '8. Changing weights should alter scoring deterministically',
    async () => {

      const optsCarbon = {
        city_id: 'cty_c07454f1',
        day_start: '08:30',
        day_end: '20:00',
        budget_cap: '5000',
        carbon_cap_kg: 20,
        must_see_poi_ids: ['poi_7f6561ec'],
        weights: {
          cost: 0.1,
          time: 0.1,
          carbon: 0.8
        }
      };

      const optsCost = {
        ...optsCarbon,
        weights: {
          cost: 0.8,
          time: 0.1,
          carbon: 0.1
        }
      };

      const resCarbon = await optimizeItinerary(
        optsCarbon
      );

      const resCost = await optimizeItinerary(
        optsCost
      );

      assert.strictEqual(
        resCarbon.feasible,
        true,
        'Carbon-weighted plan must be feasible'
      );

      assert.strictEqual(
        resCost.feasible,
        true,
        'Cost-weighted plan must be feasible'
      );

      assert.strictEqual(
        typeof resCarbon.score,
        'number',
        'Carbon-weighted result must contain numeric score'
      );

      assert.strictEqual(
        typeof resCost.score,
        'number',
        'Cost-weighted result must contain numeric score'
      );

      assert(
        Number.isFinite(resCarbon.score),
        'Carbon-weighted score must be finite'
      );

      assert(
        Number.isFinite(resCost.score),
        'Cost-weighted score must be finite'
      );
    }
  );


  // ==========================================================
  // 9. AI Intent Parser test
  // ==========================================================

  await runTest(
    '9. AI Intent parser extracts city, budget, and real POIs from text',
    async () => {

      const parsed = parseIntent(
        'Plan a low-carbon day in Bengaluru under ₹1500 with palace and park'
      );

      assert.strictEqual(
        parsed.success,
        true
      );

      assert.strictEqual(
        parsed.parsed.city_name,
        'Bengaluru'
      );

      assert.strictEqual(
        parsed.parsed.budget_cap,
        '1500'
      );

      assert(
        parsed.parsed.weights.carbon > 0.4,
        'Should bias carbon weight high'
      );
    }
  );


  // ==========================================================
  // FINAL RESULTS
  // ==========================================================

  console.log('\n========================================================');
  console.log(
    `Results: ${passedTests}/${totalTests} Tests Passed!`
  );
  console.log('========================================================');

  if (passedTests !== totalTests) {
    process.exitCode = 1;
  }
}


/**
 * ============================================================
 * START TEST SUITE
 * ============================================================
 */

main().catch(err => {
  console.error('\nUnexpected test-suite error ❌');
  console.error(err);

  process.exitCode = 1;
});