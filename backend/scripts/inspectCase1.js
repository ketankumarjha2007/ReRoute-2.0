const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, '..', '..', 'data', 'APS-09.db');
const db = new Database(dbPath);

const case1 = db.prepare('SELECT * FROM eval_optimizer_cases WHERE case_id = ?').get('eoc_af023f08');
console.log('Case 1:', case1);

const pois = case1.reference_sequence.split(',');
console.log('\n--- POIs in reference sequence ---');
for (const pid of pois) {
  const p = db.prepare('SELECT * FROM activities_poi WHERE poi_id = ?').get(pid);
  console.log(p.poi_id, p.name, 'Duration:', p.typical_duration_minutes, 'Cost:', p.entry_cost, 'Carbon:', p.carbon_kg, 'Opens:', p.opens_at, 'Closes:', p.closes_at);
}

console.log('\n--- Travel legs in reference sequence ---');
for (let i = 0; i < pois.length - 1; i++) {
  const from = pois[i];
  const to = pois[i+1];
  const edges = db.prepare('SELECT * FROM poi_travel_matrix WHERE origin_poi_id = ? AND dest_poi_id = ?').all(from, to);
  console.log(`\nLeg ${from} -> ${to}:`);
  for (const e of edges) {
    console.log(`  Mode: ${e.mode}, Mins: ${e.minutes}, Cost: ${e.cost}, Carbon: ${e.carbon_kg}, Dist: ${e.distance_km}`);
  }
}

db.close();
