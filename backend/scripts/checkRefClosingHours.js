const path = require('path');
const Database = require('better-sqlite3');
const { timeToMinutes, minutesToTime } = require('../optimizer/constraints');

const dbPath = path.join(__dirname, '..', '..', 'data', 'APS-09.db');
const db = new Database(dbPath, { readonly: true });

const cases = db.prepare('SELECT * FROM eval_optimizer_cases').all();

console.log('Case | Name | Closes_at status of reference sequence:');

for (let idx = 0; idx < cases.length; idx++) {
  const c = cases[idx];
  const refSeq = c.reference_sequence.split(',');
  const pois = refSeq.map(pid => db.prepare('SELECT * FROM activities_poi WHERE poi_id = ?').get(pid));

  // Let's calculate timing based on NoWait / WithWait
  // In each leg, get the edge used
  let curr = timeToMinutes(c.day_start_time);
  let overEndCount = 0;
  let overArrivalCount = 0;
  let violations = [];

  for (let i = 0; i < refSeq.length; i++) {
    if (i > 0) {
      // Find edge
      const edges = db.prepare('SELECT * FROM poi_travel_matrix WHERE origin_poi_id = ? AND dest_poi_id = ?').all(refSeq[i-1], refSeq[i]);
      // pick shortest/matching
      curr += edges[0].minutes;
    }
    const p = pois[i];
    const arr = curr;
    if (p.opens_at) {
      const op = timeToMinutes(p.opens_at);
      if (curr < op) curr = op;
    }
    const start = curr;
    const end = start + p.typical_duration_minutes;
    curr = end;

    if (p.closes_at) {
      const cl = timeToMinutes(p.closes_at);
      if (arr > cl) overArrivalCount++;
      if (end > cl) {
        overEndCount++;
        violations.push(`${p.name} (${p.poi_id}): arr=${minutesToTime(arr)}, end=${minutesToTime(end)}, close=${p.closes_at}`);
      }
    }
  }

  console.log(`Case ${idx + 1} (${c.name}): OverEnd=${overEndCount}, OverArr=${overArrivalCount}`);
  if (violations.length > 0) {
    console.log(`   Violations: ${violations.join('; ')}`);
  }
}

db.close();
