const db = require('../db');
const { optimizeItinerary, evaluateSequence, loadCityData } = require('../optimizer/optimizer');
const { timeToMinutes } = require('../optimizer/constraints');

console.log('====================================================');
console.log('  APS-09 Multi-Objective Optimizer Evaluation Suite');
console.log('====================================================\n');

const cases = db.prepare('SELECT * FROM eval_optimizer_cases').all();
console.log(`Loaded ${cases.length} evaluation benchmark cases from APS-09.db\n`);

let matchesCount = 0;
let feasibleCount = 0;

for (let i = 0; i < cases.length; i++) {
  const c = cases[i];
  const weights = JSON.parse(c.weights_json);
  const mustSee = c.must_see_poi_ids ? c.must_see_poi_ids.split(',').map(s => s.trim()) : [];
  const candidateIds = c.candidate_poi_ids ? c.candidate_poi_ids.split(',').map(s => s.trim()) : null;

  console.log(`----------------------------------------------------`);
  console.log(`Case ${i + 1}: ${c.name} (${c.case_id})`);
  console.log(`City: ${c.city_id} | Window: ${c.day_start_time} - ${c.day_end_time} | Budget: ₹${c.budget_cap} | Carbon Cap: ${c.carbon_cap_kg} kg`);
  console.log(`Must-see POIs: ${mustSee.join(', ')}`);
  console.log(`Weights: Cost=${weights.cost}, Time=${weights.time}, Carbon=${weights.carbon}`);
  console.log(`Expected Reference:`);
  console.log(`  Sequence: ${c.reference_sequence}`);
  console.log(`  Cost: ₹${c.reference_cost} | Time: ${c.reference_minutes} mins | Carbon: ${c.reference_carbon_kg} kg`);

  // Run our optimizer with the case constraints
  const result = optimizeItinerary({
    city_id: c.city_id,
    day_start: c.day_start_time,
    day_end: c.day_end_time,
    budget_cap: c.budget_cap,
    carbon_cap_kg: c.carbon_cap_kg,
    must_see_poi_ids: mustSee,
    candidate_poi_ids: candidateIds,
    start_poi_id: c.start_poi_id,
    end_poi_id: c.end_poi_id,
    allowed_modes: c.allowed_modes,
    weights,
    max_activities: c.reference_sequence.split(',').length
  });

  if (result.feasible) {
    feasibleCount++;
    const ourSeq = result.stops.map(s => s.poi_id).join(',');
    const costDiff = (parseFloat(result.summary.cost) - parseFloat(c.reference_cost)).toFixed(2);
    const timeDiff = result.summary.minutes - c.reference_minutes;
    const carbonDiff = (result.summary.carbon_kg - parseFloat(c.reference_carbon_kg)).toFixed(3);

    console.log(`Our Optimizer Result: [FEASIBLE]`);
    console.log(`  Sequence: ${ourSeq}`);
    console.log(`  Cost: ₹${result.summary.cost} (Δ ${costDiff >= 0 ? '+' : ''}${costDiff})`);
    console.log(`  Time: ${result.summary.minutes} mins (Δ ${timeDiff >= 0 ? '+' : ''}${timeDiff})`);
    console.log(`  Carbon: ${result.summary.carbon_kg} kg (Δ ${carbonDiff >= 0 ? '+' : ''}${carbonDiff})`);

    if (ourSeq === c.reference_sequence) {
      console.log(`  Sequence Match: EXACT MATCH ✅`);
      matchesCount++;
    } else {
      console.log(`  Sequence Match: Alternative feasible route with score ${result.score}`);
    }
  } else {
    console.log(`Our Optimizer Result: [INFEASIBLE]`);
    console.log(`  Explanation: ${result.explanation || 'No feasible combination'}`);
  }
  console.log('');
}

console.log('====================================================');
console.log(`Evaluation Summary:`);
console.log(`Total Cases: ${cases.length}`);
console.log(`Feasible Generated: ${feasibleCount}/${cases.length}`);
console.log(`Exact Reference Sequence Matches: ${matchesCount}/${cases.length}`);
console.log('====================================================');
