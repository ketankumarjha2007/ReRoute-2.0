const path = require('path');
const Database = require('better-sqlite3');
const { loadCityData } = require('../optimizer/optimizer');
const { timeToMinutes } = require('../optimizer/constraints');

const dbPath = path.join(__dirname, '..', '..', 'data', 'APS-09.db');
const db = new Database(dbPath, { readonly: true });

const c = db.prepare("SELECT * FROM eval_optimizer_cases WHERE case_id = 'eoc_9d2693d3'").get();
const candidateIds = c.candidate_poi_ids.split(',');
const { poiMap, edgeMap } = loadCityData(c.city_id, candidateIds);

console.log('Case 10 Candidates:');
for (const pid of candidateIds) {
  const p = poiMap.get(pid);
  console.log(`  ${pid} (${p.name}): dur=${p.duration_minutes}, opens=${p.opens_at}, closes=${p.closes_at}, cost=${p.entry_cost}`);
}

db.close();
