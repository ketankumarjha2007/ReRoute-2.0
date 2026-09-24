/**
 * Objective scoring module
 * Normalizes multi-objective values (cost, time, carbon) and computes weighted score.
 */

function normalizeWeights(weights) {
  const w = {
    cost: typeof weights?.cost === 'number' ? Math.max(0, weights.cost) : 0.3333,
    time: typeof weights?.time === 'number' ? Math.max(0, weights.time) : 0.3333,
    carbon: typeof weights?.carbon === 'number' ? Math.max(0, weights.carbon) : 0.3334
  };

  const sum = w.cost + w.time + w.carbon;
  if (sum <= 0) {
    return { cost: 0.3333, time: 0.3333, carbon: 0.3334 };
  }

  return {
    cost: w.cost / sum,
    time: w.time / sum,
    carbon: w.carbon / sum
  };
}

/**
 * Normalizes candidates across an evaluation pool using Min-Max scaling
 * If min === max, normalized value is 0.5.
 */
function scoreCandidates(candidates, weights, bounds) {
  if (!candidates || candidates.length === 0) return [];
  const nw = normalizeWeights(weights);

  // Find min and max across all feasible candidates
  let minCost = Infinity, maxCost = -Infinity;
  let minTime = Infinity, maxTime = -Infinity;
  let minCarbon = Infinity, maxCarbon = -Infinity;

  for (const c of candidates) {
    const cost = c.summary.cost_cents;
    const time = c.summary.minutes;
    const carbon = c.summary.carbon_kg;

    if (cost < minCost) minCost = cost;
    if (cost > maxCost) maxCost = cost;

    if (time < minTime) minTime = time;
    if (time > maxTime) maxTime = time;

    if (carbon < minCarbon) minCarbon = carbon;
    if (carbon > maxCarbon) maxCarbon = carbon;
  }

  // Fallback to bounds if only 1 candidate or all identical
  const budgetCents = bounds?.budget_cents || maxCost;
  const timeLimit = bounds?.time_limit_minutes || maxTime;
  const carbonCap = bounds?.carbon_cap_kg || maxCarbon;

  return candidates.map(c => {
    let normCost = 0;
    if (maxCost > minCost) {
      normCost = (c.summary.cost_cents - minCost) / (maxCost - minCost);
    } else if (budgetCents > 0) {
      normCost = c.summary.cost_cents / budgetCents;
    }

    let normTime = 0;
    if (maxTime > minTime) {
      normTime = (c.summary.minutes - minTime) / (maxTime - minTime);
    } else if (timeLimit > 0) {
      normTime = c.summary.minutes / timeLimit;
    }

    let normCarbon = 0;
    if (maxCarbon > minCarbon) {
      normCarbon = (c.summary.carbon_kg - minCarbon) / (maxCarbon - minCarbon);
    } else if (carbonCap > 0) {
      normCarbon = c.summary.carbon_kg / carbonCap;
    }

    const score = (nw.cost * normCost) + (nw.time * normTime) + (nw.carbon * normCarbon);

    return {
      ...c,
      normalized_metrics: {
        norm_cost: Number(normCost.toFixed(4)),
        norm_time: Number(normTime.toFixed(4)),
        norm_carbon: Number(normCarbon.toFixed(4))
      },
      score: Number(score.toFixed(6)),
      weights: {
        cost: Number(nw.cost.toFixed(4)),
        time: Number(nw.time.toFixed(4)),
        carbon: Number(nw.carbon.toFixed(4))
      }
    };
  }).sort((a, b) => a.score - b.score);
}

module.exports = {
  normalizeWeights,
  scoreCandidates
};
