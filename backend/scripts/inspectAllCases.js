const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, '..', '..', 'data', 'APS-09.db');
const db = new Database(dbPath);

const cases = db.prepare('SELECT * FROM eval_optimizer_cases').all();
console.log(`Total eval cases: ${cases.length}`);

for (const c of cases) {
  const pois = c.reference_sequence.split(',');
  let poiCost = 0;
  let poiMins = 0;
  let poiCarbon = 0;
  for (const pid of pois) {
    const p = db.prepare('SELECT typical_duration_minutes, entry_cost, carbon_kg FROM activities_poi WHERE poi_id = ?').get(pid);
    if (p) {
      poiCost += parseFloat(p.entry_cost || 0);
      poiMins += p.typical_duration_minutes;
      poiCarbon += Number(p.carbon_kg || 0);
    }
  }

  let travelCost = 0;
  let travelMins = 0;
  let travelCarbon = 0;
  for (let i = 0; i < pois.length - 1; i++) {
    // Check which mode matches reference
    const edges = db.prepare('SELECT * FROM poi_travel_matrix WHERE origin_poi_id = ? AND dest_poi_id = ?').all(pois[i], pois[i+1]);
    // find mode where edge is used
    // let's see available modes
    // console.log(`Leg ${pois[i]}->${pois[i+1]} modes:`, edges.map(e => e.mode).join(', '));
  }
  console.log(`Case ${c.case_id} (${c.name}): POIs=${pois.length}, RefCost=${c.reference_cost}, RefMins=${c.reference_minutes}, RefCarbon=${c.reference_carbon_kg}, AllowedModes=${c.allowed_modes}`);
}

db.close();
