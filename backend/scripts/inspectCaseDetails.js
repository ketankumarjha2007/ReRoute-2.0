const path = require('path');
const Database = require('better-sqlite3');
const { optimizeItinerary, evaluateSequence, loadCityData } = require('../optimizer/optimizer');
const { timeToMinutes } = require('../optimizer/constraints');

const dbPath = path.join(__dirname, '..', '..', 'data', 'APS-09.db');
const db = new Database(dbPath, { readonly: true });

const cases = db.prepare('SELECT * FROM eval_optimizer_cases').all();

for (const caseNum of [9, 10, 11, 12, 15, 16]) {
  const c = cases[caseNum - 1];
  console.log(`\n================== Case ${caseNum}: ${c.name} (${c.case_id}) ==================`);
  console.log('City:', c.city_id, 'Window:', c.day_start_time, '-', c.day_end_time);
  console.log('Budget cap:', c.budget_cap, 'Carbon cap:', c.carbon_cap_kg, 'Allowed modes:', c.allowed_modes);
  console.log('Start:', c.start_poi_id, 'End:', c.end_poi_id);
  console.log('Must-see:', c.must_see_poi_ids);
  console.log('Ref seq:', c.reference_sequence);

  const refSeq = c.reference_sequence.split(',');
  for (const pid of refSeq) {
    const p = db.prepare('SELECT * FROM activities_poi WHERE poi_id = ?').get(pid);
    console.log(`  POI ${pid} (${p.name}): duration=${p.typical_duration_minutes}, cost=${p.entry_cost}, carbon=${p.carbon_kg}, opens=${p.opens_at}, closes=${p.closes_at}`);
  }

  for (let i = 0; i < refSeq.length - 1; i++) {
    const from = refSeq[i];
    const to = refSeq[i + 1];
    const edges = db.prepare('SELECT * FROM poi_travel_matrix WHERE origin_poi_id = ? AND dest_poi_id = ?').all(from, to);
    console.log(`  Leg ${from} -> ${to}:`);
    for (const e of edges) {
      console.log(`    mode=${e.mode}, mins=${e.minutes}, cost=${e.cost}, carbon=${e.carbon_kg}`);
    }
  }
}

db.close();
