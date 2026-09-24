const path = require('path');
const Database = require('better-sqlite3');
const { timeToMinutes, minutesToTime } = require('../optimizer/constraints');

const dbPath = path.join(__dirname, '..', '..', 'data', 'APS-09.db');
const db = new Database(dbPath, { readonly: true });

const cases = db.prepare('SELECT * FROM eval_optimizer_cases').all();

console.log('Comparing all 20 reference sequences against organizer numbers:\n');

for (let idx = 0; idx < cases.length; idx++) {
  const c = cases[idx];
  const refSeq = c.reference_sequence.split(',');
  const allowed = c.allowed_modes ? c.allowed_modes.split(',').map(m => m.trim()) : [];

  let currentMins = timeToMinutes(c.day_start_time);
  let totalCost = 0;
  let totalCarbon = 0;

  for (let i = 0; i < refSeq.length; i++) {
    const pid = refSeq[i];
    const poi = db.prepare('SELECT * FROM activities_poi WHERE poi_id = ?').get(pid);

    if (i > 0) {
      const prev = refSeq[i - 1];
      const edges = db.prepare('SELECT * FROM poi_travel_matrix WHERE origin_poi_id = ? AND dest_poi_id = ?').all(prev, pid);
      const filtered = edges.filter(e => allowed.includes(e.mode));
      // find which edge might have been used
      // Let's test all combinations
    }
  }
}

// Let's find for each case what combination of edges on refSeq exactly yields refCost, refMins, refCarbon!
for (let idx = 0; idx < cases.length; idx++) {
  const c = cases[idx];
  const refSeq = c.reference_sequence.split(',');
  const allowed = c.allowed_modes ? c.allowed_modes.split(',').map(m => m.trim()) : [];

  // Get POIs
  const pois = refSeq.map(pid => db.prepare('SELECT * FROM activities_poi WHERE poi_id = ?').get(pid));
  const basePoiCost = pois.reduce((acc, p) => acc + parseFloat(p.entry_cost || 0), 0);
  const basePoiMins = pois.reduce((acc, p) => acc + p.typical_duration_minutes, 0);
  const basePoiCarbon = pois.reduce((acc, p) => acc + Number(p.carbon_kg || 0), 0);

  const neededTravelCost = parseFloat(c.reference_cost) - basePoiCost;
  const neededTravelCarbon = parseFloat(c.reference_carbon_kg) - basePoiCarbon;
  const neededTotalMins = c.reference_minutes;

  // For each leg, find all valid edges
  const legEdges = [];
  for (let i = 0; i < refSeq.length - 1; i++) {
    const edges = db.prepare('SELECT * FROM poi_travel_matrix WHERE origin_poi_id = ? AND dest_poi_id = ?').all(refSeq[i], refSeq[i+1])
      .filter(e => allowed.includes(e.mode));
    legEdges.push(edges);
  }

  // Find Cartesian product of edges
  function getCombinations(index) {
    if (index === legEdges.length) return [[]];
    const subs = getCombinations(index + 1);
    const res = [];
    for (const e of legEdges[index]) {
      for (const s of subs) {
        res.push([e, ...s]);
      }
    }
    return res;
  }

  const combos = getCombinations(0);
  let matchedCombo = null;

  for (const combo of combos) {
    const trCost = combo.reduce((acc, e) => acc + parseFloat(e.cost || 0), 0);
    const trCarbon = combo.reduce((acc, e) => acc + Number(e.carbon_kg || 0), 0);
    const trMins = combo.reduce((acc, e) => acc + e.minutes, 0);

    // Let's check with and without waiting time at POIs
    // Without waiting time: totalMins = basePoiMins + trMins
    // With waiting time:
    let curr = timeToMinutes(c.day_start_time);
    let waitMins = 0;
    for (let i = 0; i < refSeq.length; i++) {
      if (i > 0) curr += combo[i - 1].minutes;
      const p = pois[i];
      if (p.opens_at) {
        const op = timeToMinutes(p.opens_at);
        if (curr < op) {
          waitMins += (op - curr);
          curr = op;
        }
      }
      curr += p.typical_duration_minutes;
    }
    const totalWithWait = (curr - timeToMinutes(c.day_start_time));
    const totalWithoutWait = basePoiMins + trMins;

    const costDiff = Math.abs(basePoiCost + trCost - parseFloat(c.reference_cost));
    const carbonDiff = Math.abs(basePoiCarbon + trCarbon - parseFloat(c.reference_carbon_kg));

    if (costDiff < 0.05 && carbonDiff < 0.05) {
      matchedCombo = {
        combo,
        totalWithWait,
        totalWithoutWait,
        refMins: c.reference_minutes,
        waitMins
      };
      break;
    }
  }

  if (matchedCombo) {
    const modes = matchedCombo.combo.map(e => e.mode).join('->');
    console.log(`Case ${idx + 1} (${c.name}): FOUND MATCH! Modes: [${modes}] | WithWait: ${matchedCombo.totalWithWait}, NoWait: ${matchedCombo.totalWithoutWait}, RefMins: ${matchedCombo.refMins}, WaitMins: ${matchedCombo.waitMins}`);
  } else {
    console.log(`Case ${idx + 1} (${c.name}): NO EDGE COMBO MATCHED!`);
  }
}

db.close();
