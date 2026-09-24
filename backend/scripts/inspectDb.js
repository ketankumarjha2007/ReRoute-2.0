const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, '..', '..', 'data', 'APS-09.db');
const db = new Database(dbPath);

console.log('--- TABLES ---');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
console.log(tables.map(t => t.name));

const tablesToInspect = [
  'cities',
  'categories',
  'activities_poi',
  'poi_travel_matrix',
  'eval_optimizer_cases',
  'transfers',
  'weather_daily',
  'itineraries',
  'itinerary_items'
];

for (const table of tablesToInspect) {
  console.log(`\n================ SCHEMA: ${table} ================`);
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  console.log(columns.map(c => `${c.cid}: ${c.name} (${c.type})` + (c.pk ? ' [PK]' : '')).join('\n'));
  
  console.log(`--- SAMPLE ROW: ${table} ---`);
  const sample = db.prepare(`SELECT * FROM ${table} LIMIT 1`).get();
  console.log(JSON.stringify(sample, null, 2));
}

db.close();
