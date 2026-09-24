const db = require('../db');
const { timeToMinutes, minutesToTime, moneyToCents, centsToMoney, checkOpeningHours } = require('./constraints');
const { normalizeWeights, scoreCandidates } = require('./scoring');
const { validatePlanConstraints } = require('./feasibility');

/**
 * Pre-fetches POIs and Travel Matrix for a given city and candidate set.
 * Returns in-memory indexed structures for lightning-fast graph search.
 */
function loadCityData(cityId, candidateIds = null) {
  let poiQuery = `SELECT * FROM activities_poi WHERE city_id = ? AND status = 'active'`;
  let pois = db.prepare(poiQuery).all(cityId);

  if (candidateIds && candidateIds.length > 0) {
    const candidateSet = new Set(candidateIds);
    pois = pois.filter(p => candidateSet.has(p.poi_id));
  }

  const poiMap = new Map();
  for (const p of pois) {
    poiMap.set(p.poi_id, {
      ...p,
      cost_cents: moneyToCents(p.entry_cost),
      carbon_kg: Number(p.carbon_kg || 0),
      duration_minutes: Number(p.typical_duration_minutes || 60)
    });
  }

  // Load travel matrix edges
  const matrixQuery = `
    SELECT origin_poi_id, dest_poi_id, mode, minutes, distance_km, carbon_kg, cost, currency
    FROM poi_travel_matrix
    WHERE origin_poi_id IN (${pois.map(() => '?').join(',') || "''"})
      AND dest_poi_id IN (${pois.map(() => '?').join(',') || "''"})
  `;

  const poiIdList = pois.map(p => p.poi_id);
  let edges = [];
  if (poiIdList.length > 0) {
    edges = db.prepare(matrixQuery).all(...poiIdList, ...poiIdList);
  }

  // Edge map: `${origin}_${dest}` -> array of modes
  const edgeMap = new Map();
  for (const e of edges) {
    const key = `${e.origin_poi_id}_${e.dest_poi_id}`;
    if (!edgeMap.has(key)) {
      edgeMap.set(key, []);
    }
    edgeMap.get(key).push({
      ...e,
      cost_cents: moneyToCents(e.cost),
      carbon_kg: Number(e.carbon_kg || 0),
      minutes: Number(e.minutes || 0)
    });
  }

  return { poiMap, edgeMap, allPois: pois };
}

/**
 * Select the best travel mode for a leg given objective weights and allowed modes
 */
function chooseBestEdge(edges, weights, allowedModes = null, currentDepartureMins = null, destPoi = null) {
  if (!edges || edges.length === 0) return null;

  let candidates = edges;
  if (allowedModes && allowedModes.length > 0) {
    const allowed = new Set(
      (Array.isArray(allowedModes) ? allowedModes : allowedModes.split(','))
        .map(m => m.trim().toLowerCase())
    );
    candidates = candidates.filter(e => allowed.has(e.mode.toLowerCase()));
  }

  if (candidates.length === 0) return null;

  // If destination opening hours are known, prefer modes that arrive in time to complete visit
  if (destPoi && currentDepartureMins !== null && destPoi.closes_at) {
    const closeMins = timeToMinutes(destPoi.closes_at);
    const duration = destPoi.duration_minutes || 60;
    const timeViable = candidates.filter(e => {
      const arr = currentDepartureMins + e.minutes;
      const start = destPoi.opens_at ? Math.max(arr, timeToMinutes(destPoi.opens_at)) : arr;
      return (start + duration) <= closeMins;
    });
    if (timeViable.length > 0) {
      candidates = timeViable;
    }
  }

  if (candidates.length === 1) return candidates[0];

  const nw = normalizeWeights(weights);

  // Score each mode alternative deterministically
  let bestEdge = candidates[0];
  let bestScore = Infinity;

  for (const e of candidates) {
    // Normalizing scales for standard leg: cost / 500, mins / 60, carbon / 5
    const normCost = e.cost_cents / 50000;
    const normTime = e.minutes / 60;
    const normCarbon = e.carbon_kg / 5;
    const score = (nw.cost * normCost) + (nw.time * normTime) + (nw.carbon * normCarbon);

    if (score < bestScore) {
      bestScore = score;
      bestEdge = e;
    } else if (Math.abs(score - bestScore) < 1e-6) {
      // Deterministic tie-breaking: lower carbon -> lower cost -> lower time -> mode name
      if (e.carbon_kg < bestEdge.carbon_kg) {
        bestEdge = e;
      } else if (e.cost_cents < bestEdge.cost_cents) {
        bestEdge = e;
      } else if (e.minutes < bestEdge.minutes) {
        bestEdge = e;
      } else if (e.mode < bestEdge.mode) {
        bestEdge = e;
      }
    }
  }

  return bestEdge;
}

/**
 * Builds a full itinerary schedule from an ordered sequence of POI IDs
 */
function evaluateSequence(sequence, poiMap, edgeMap, options) {
  const {
    day_start = '09:00',
    weights = { cost: 0.33, time: 0.33, carbon: 0.34 },
    allowed_modes = null
  } = options;

  let currentMins = timeToMinutes(day_start);
  const stops = [];
  const transfers = [];
  const openingHourViolations = [];
  const missingEdges = [];

  let totalCostCents = 0;
  let totalCarbonKg = 0;
  let totalActivityMins = 0;
  let totalTravelMins = 0;
  let totalWaitMins = 0;

  for (let i = 0; i < sequence.length; i++) {
    const poiId = sequence[i];
    const poi = poiMap.get(poiId);
    if (!poi) {
      return null;
    }

    // Travel from previous POI
    if (i > 0) {
      const prevPoiId = sequence[i - 1];
      const key = `${prevPoiId}_${poiId}`;
      const edges = edgeMap.get(key) || [];
      const edge = chooseBestEdge(edges, weights, allowed_modes, currentMins, poi);

      if (!edge) {
        missingEdges.push({ from: prevPoiId, to: poiId });
        // Estimate fallback if missing to avoid hard crash, but record violation
        currentMins += 30;
      } else {
        transfers.push({
          from_poi_id: edge.origin_poi_id,
          to_poi_id: edge.dest_poi_id,
          mode: edge.mode,
          minutes: edge.minutes,
          distance_km: Number(edge.distance_km || 0),
          cost: centsToMoney(edge.cost_cents),
          cost_cents: edge.cost_cents,
          carbon_kg: Number(edge.carbon_kg.toFixed(3)),
          departure_time: minutesToTime(currentMins),
          arrival_time: minutesToTime(currentMins + edge.minutes)
        });

        currentMins += edge.minutes;
        totalTravelMins += edge.minutes;
        totalCostCents += edge.cost_cents;
        totalCarbonKg += edge.carbon_kg;
      }
    }

    const arrivalTime = minutesToTime(currentMins);
    const duration = poi.duration_minutes;

    // Opening hours check
    const ohCheck = checkOpeningHours(currentMins, duration, poi.opens_at, poi.closes_at);
    if (!ohCheck.valid) {
      openingHourViolations.push({
        poi_id: poi.poi_id,
        name: poi.name,
        opens_at: poi.opens_at,
        closes_at: poi.closes_at,
        arrival: arrivalTime,
        departure: minutesToTime(ohCheck.actualEndMins),
        reason: ohCheck.reason
      });
    }

    const waitTime = ohCheck.waitTime;
    totalWaitMins += waitTime;
    const startMins = ohCheck.actualStartMins;
    const endMins = ohCheck.actualEndMins;

    stops.push({
      poi_id: poi.poi_id,
      name: poi.name,
      category: poi.poi_category,
      arrival: arrivalTime,
      departure: minutesToTime(endMins),
      duration_minutes: duration,
      wait_minutes: waitTime,
      entry_cost: centsToMoney(poi.cost_cents),
      entry_cost_cents: poi.cost_cents,
      currency: poi.currency || 'INR',
      carbon_kg: Number(poi.carbon_kg.toFixed(3)),
      lat: poi.lat,
      lng: poi.lng,
      opens_at: poi.opens_at,
      closes_at: poi.closes_at
    });

    currentMins = endMins;
    totalActivityMins += duration;
    totalCostCents += poi.cost_cents;
    totalCarbonKg += poi.carbon_kg;
  }

  const startMins = timeToMinutes(day_start);
  const totalMinutes = currentMins - startMins;

  return {
    stops,
    transfers,
    opening_hour_violations: openingHourViolations,
    missing_edges: missingEdges,
    summary: {
      cost: centsToMoney(totalCostCents),
      cost_cents: totalCostCents,
      currency: 'INR',
      minutes: totalMinutes,
      activity_minutes: totalActivityMins,
      travel_minutes: totalTravelMins,
      wait_minutes: totalWaitMins,
      carbon_kg: Number(totalCarbonKg.toFixed(3)),
      day_start,
      day_end: minutesToTime(currentMins),
      stops_count: stops.length
    }
  };
}

/**
 * Main Deterministic Optimizer
 */
function optimizeItinerary(options) {
  const {
    city_id,
    day_start = '09:00',
    day_end = '18:00',
    budget_cap,
    carbon_cap_kg,
    must_see_poi_ids = [],
    candidate_poi_ids = null,
    start_poi_id = null,
    end_poi_id = null,
    allowed_modes = null,
    weights = { cost: 0.33, time: 0.33, carbon: 0.34 },
    max_activities = 6
  } = options;

  // Load POI & matrix graph
  const { poiMap, edgeMap, allPois } = loadCityData(city_id, candidate_poi_ids);

  if (allPois.length === 0) {
    return {
      feasible: false,
      violations: [{
        type: 'NO_CANDIDATE_POIS',
        severity: 'hard',
        message: 'No active POIs found for this city.'
      }]
    };
  }

  // Validate must-see POIs exist
  const missingMustSeePois = must_see_poi_ids.filter(id => !poiMap.has(id));
  if (missingMustSeePois.length > 0) {
    return {
      feasible: false,
      violations: [{
        type: 'INVALID_POI_ID',
        severity: 'hard',
        message: `Must-see attraction(s) not found in city: ${missingMustSeePois.join(', ')}`
      }]
    };
  }

  const dayStartMins = timeToMinutes(day_start);
  const dayEndMins = timeToMinutes(day_end);
  const availableDayMins = Math.max(0, dayEndMins - dayStartMins);
  const budgetCents = (budget_cap !== undefined && budget_cap !== null && budget_cap !== '')
    ? moneyToCents(budget_cap)
    : Infinity;
  const carbonCap = (carbon_cap_kg !== undefined && carbon_cap_kg !== null && Number(carbon_cap_kg) > 0)
    ? Number(carbon_cap_kg)
    : Infinity;

  // Branch and bound candidate sequence generation
  const mustSeeSet = new Set(must_see_poi_ids);
  const requiredCount = mustSeeSet.size;

  // Pool of candidate POIs to consider
  let pool = [];
  if (must_see_poi_ids.length > 0) {
    pool = [...must_see_poi_ids];
    if (start_poi_id && !pool.includes(start_poi_id) && poiMap.has(start_poi_id)) {
      pool.push(start_poi_id);
    }
    if (end_poi_id && !pool.includes(end_poi_id) && poiMap.has(end_poi_id)) {
      pool.push(end_poi_id);
    }

    // Add remaining POIs from allPois
    const remaining = allPois
      .filter(p => !pool.includes(p.poi_id))
      .sort((a, b) => (b.popularity_score || 0) - (a.popularity_score || 0));
    
    const limit = candidate_poi_ids ? remaining.length : Math.min(10, max_activities + 2);
    for (const r of remaining.slice(0, limit)) {
      pool.push(r.poi_id);
    }
  } else {
    // If no must-see, pick top candidates by popularity & value
    pool = allPois
      .sort((a, b) => ((b.popularity_score || 0) + (b.value_score || 0)) - ((a.popularity_score || 0) + a.value_score || 0))
      .slice(0, candidate_poi_ids ? allPois.length : Math.min(10, max_activities + 2))
      .map(p => p.poi_id);
  }

  const feasiblePlans = [];
  const allEvaluatedPlans = [];

  // Generate sequences using Depth-First Search with early pruning
  function search(currentSeq, currentVisited, currentMins, currentCostCents, currentCarbon) {
    // If all must-see are visited (and start/end satisfied if given)
    const hasAllMustSee = must_see_poi_ids.every(id => currentVisited.has(id));
    const satisfiesEnd = !end_poi_id || currentSeq[currentSeq.length - 1] === end_poi_id;

    if (currentSeq.length > 0 && hasAllMustSee && satisfiesEnd) {
      // Evaluate full plan
      const evalPlan = evaluateSequence(currentSeq, poiMap, edgeMap, {
        day_start,
        weights,
        allowed_modes
      });

      if (evalPlan) {
        const check = validatePlanConstraints(evalPlan, {
          day_start,
          day_end,
          budget_cap,
          carbon_cap_kg,
          must_see_poi_ids,
          start_poi_id,
          end_poi_id,
          allowed_modes
        });

        if (check.feasible) {
          feasiblePlans.push(evalPlan);
        } else {
          allEvaluatedPlans.push({ plan: evalPlan, check });
        }
      }
    }

    if (currentSeq.length >= max_activities) {
      return;
    }

    // If current sequence already ends with required end_poi_id, do not extend
    if (end_poi_id && currentSeq.length > 0 && currentSeq[currentSeq.length - 1] === end_poi_id) {
      return;
    }

    for (const nextPoiId of pool) {
      if (currentVisited.has(nextPoiId)) continue;

      // Start constraint
      if (currentSeq.length === 0 && start_poi_id && nextPoiId !== start_poi_id) {
        continue;
      }

      const nextPoi = poiMap.get(nextPoiId);
      let legMins = 0;
      let legCostCents = 0;
      let legCarbon = 0;

      if (currentSeq.length > 0) {
        const lastId = currentSeq[currentSeq.length - 1];
        const key = `${lastId}_${nextPoiId}`;
        const edges = edgeMap.get(key) || [];
        const edge = chooseBestEdge(edges, weights, allowed_modes, currentMins, nextPoi);
        if (!edge) {
          continue; // No edge available
        }
        legMins = edge.minutes;
        legCostCents = edge.cost_cents;
        legCarbon = edge.carbon_kg;
      }

      // Fast Pruning: Check cumulative limits
      const nextArrivalTime = currentMins + legMins;
      const openCheck = checkOpeningHours(nextArrivalTime, nextPoi.duration_minutes, nextPoi.opens_at, nextPoi.closes_at);
      if (!openCheck.valid) {
        continue; // Opening hours pruned
      }

      const nextDepartureMins = openCheck.actualEndMins;
      const nextTotalMins = nextDepartureMins - dayStartMins;
      const nextTotalCostCents = currentCostCents + legCostCents + nextPoi.cost_cents;
      const nextTotalCarbon = currentCarbon + legCarbon + nextPoi.carbon_kg;

      if (nextTotalMins > availableDayMins && feasiblePlans.length > 0) {
        continue; // Exceeds available time
      }
      if (nextTotalCostCents > budgetCents && feasiblePlans.length > 0) {
        continue; // Exceeds budget
      }
      if (nextTotalCarbon > carbonCap && feasiblePlans.length > 0) {
        continue; // Exceeds carbon
      }

      currentVisited.add(nextPoiId);
      currentSeq.push(nextPoiId);

      search(currentSeq, currentVisited, nextDepartureMins, nextTotalCostCents, nextTotalCarbon);

      currentSeq.pop();
      currentVisited.delete(nextPoiId);
    }
  }

  // Run DFS
  search([], new Set(), dayStartMins, 0, 0);

  // If no feasible plans found with all bounds, evaluate direct must-see sequences for diagnostic
  if (feasiblePlans.length === 0) {
    let fallbackSeq = [];
    if (start_poi_id) fallbackSeq.push(start_poi_id);
    for (const m of must_see_poi_ids) {
      if (!fallbackSeq.includes(m)) fallbackSeq.push(m);
    }
    if (end_poi_id && !fallbackSeq.includes(end_poi_id)) {
      fallbackSeq.push(end_poi_id);
    }

    if (fallbackSeq.length > 0) {
      const fallbackPlan = evaluateSequence(fallbackSeq, poiMap, edgeMap, {
        day_start,
        weights,
        allowed_modes
      });
      if (fallbackPlan) {
        const check = validatePlanConstraints(fallbackPlan, {
          day_start,
          day_end,
          budget_cap,
          carbon_cap_kg,
          must_see_poi_ids,
          start_poi_id,
          end_poi_id,
          allowed_modes
        });
        allEvaluatedPlans.push({ plan: fallbackPlan, check });
      }
    }

    return {
      feasible: false,
      evaluated_attempts: allEvaluatedPlans
    };
  }

  // Score all feasible plans
  const scored = scoreCandidates(feasiblePlans, weights, {
    budget_cents: budgetCents !== Infinity ? budgetCents : null,
    time_limit_minutes: availableDayMins,
    carbon_cap_kg: carbonCap !== Infinity ? carbonCap : null
  });

  const bestPlan = scored[0];

  return {
    feasible: true,
    ...bestPlan,
    candidates_count: feasiblePlans.length
  };
}

module.exports = {
  loadCityData,
  chooseBestEdge,
  evaluateSequence,
  optimizeItinerary
};
