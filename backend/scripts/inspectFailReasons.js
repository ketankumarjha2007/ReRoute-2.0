const path = require('path');
const Database = require('better-sqlite3');
const { validatePlanConstraints } = require('../optimizer/feasibility');
const { timeToMinutes } = require('../optimizer/constraints');

const dbPath = path.join(__dirname, '..', '..', 'data', 'APS-09.db');
const db = new Database(dbPath, { readonly: true });

const cases = db.prepare('SELECT * FROM eval_optimizer_cases').all();

for (const caseNum of [9, 10, 11, 12, 15, 16]) {
  const c = cases[caseNum - 1];
  console.log(`\n--- Case ${caseNum}: ${c.name} ---`);
  const refSeq = c.reference_sequence.split(',');
  const pois = refSeq.map(pid => db.prepare('SELECT * FROM activities_poi WHERE poi_id = ?').get(pid));

  let curr = timeToMinutes(c.day_start_time);
  for (let i = 0; i < pois.length; i++) {
    const p = pois[i];
    console.log(`Stop ${i}: ${p.poi_id} (${p.name}), opens: ${p.opens_at}, closes: ${p.closes_at}, duration: ${p.typical_duration_minutes}`);
  }
}
db.close();
