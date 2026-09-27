/**
 * ReRoute 2.0
 * Objective scoring module
 *
 * Primary objectives:
 *   1. Cost
 *   2. Time
 *   3. Carbon
 *
 * Secondary itinerary-quality objective:
 *   4. Day utilization / itinerary richness
 *
 * The richness factor is intentionally bounded and small.
 * It prevents a trivial 1-stop itinerary from always winning
 * merely because it is extremely cheap or short, while keeping
 * cost/time/carbon as the user's primary objectives.
 */

function normalizeWeights(weights) {
  const w = {
    cost:
      typeof weights?.cost === 'number'
        ? Math.max(0, weights.cost)
        : 0.3333,

    time:
      typeof weights?.time === 'number'
        ? Math.max(0, weights.time)
        : 0.3333,

    carbon:
      typeof weights?.carbon === 'number'
        ? Math.max(0, weights.carbon)
        : 0.3334
  };

  const sum = w.cost + w.time + w.carbon;

  if (sum <= 0) {
    return {
      cost: 0.3333,
      time: 0.3333,
      carbon: 0.3334
    };
  }

  return {
    cost: w.cost / sum,
    time: w.time / sum,
    carbon: w.carbon / sum
  };
}

/**
 * Clamp a value between min and max.
 */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Calculate a bounded itinerary-quality penalty.
 *
 * A day planner should not automatically select a tiny itinerary
 * when there is substantial time available.
 *
 * This does NOT force a minimum number of stops.
 * It simply gives richer, better-utilized itineraries a modest
 * advantage when they remain feasible.
 */
function calculateRichnessPenalty(candidate, bounds) {
  const summary = candidate.summary || {};

  const totalMinutes = Number(summary.minutes) || 0;
  const activityMinutes =
    Number(summary.activity_minutes) || 0;

  const travelMinutes =
    Number(summary.travel_minutes) || 0;

  const stops =
    Number(candidate.summary?.stops_count) || 0;

  const timeLimit =
    Number(bounds?.time_limit_minutes) || 0;

  if (timeLimit <= 0 || stops <= 0) {
    return 0;
  }

  /*
   * ----------------------------------------------------------
   * 1. DAY UTILIZATION
   * ----------------------------------------------------------
   *
   * How much of the available planning window is actually used?
   *
   * We cap this at 1 so unusually long plans cannot receive
   * extra benefit.
   */
  const utilization =
    clamp(totalMinutes / timeLimit, 0, 1);

  /*
   * ----------------------------------------------------------
   * 2. ACTIVITY UTILIZATION
   * ----------------------------------------------------------
   *
   * Prefer actual experiences over an itinerary dominated by
   * travel/waiting.
   */
  const activityRatio =
    totalMinutes > 0
      ? clamp(activityMinutes / totalMinutes, 0, 1)
      : 0;

  /*
   * ----------------------------------------------------------
   * 3. STOP RICHNESS
   * ----------------------------------------------------------
   *
   * Reward additional meaningful stops, but with diminishing
   * returns. This avoids turning the optimizer into "visit as
   * many places as possible".
   *
   * 1 stop  -> 0.35
   * 2 stops -> 0.60
   * 3 stops -> 0.78
   * 4 stops -> 0.90
   * 5+      -> 1.00
   */
  const stopRichness =
    1 - Math.exp(-0.55 * stops);

  /*
   * ----------------------------------------------------------
   * COMBINED QUALITY
   * ----------------------------------------------------------
   */
  const quality =
    (0.50 * utilization) +
    (0.30 * activityRatio) +
    (0.20 * stopRichness);

  /*
   * Keep this deliberately small.
   *
   * The maximum penalty is 0.12, so cost/time/carbon still
   * dominate the optimization.
   */
  return clamp(
    0.12 * (1 - quality),
    0,
    0.12
  );
}

/**
 * Normalizes candidates across an evaluation pool using
 * Min-Max scaling and then applies the weighted objective.
 *
 * A small bounded itinerary-richness adjustment is applied
 * after the primary objective score.
 */
function scoreCandidates(candidates, weights, bounds) {

  const planningIntent = bounds?.planning_intent || 'route_optimization';

  if (!candidates || candidates.length === 0) {
    return [];
  }

  const nw = normalizeWeights(weights);

  // ----------------------------------------------------------
  // Find min/max across feasible candidates
  // ----------------------------------------------------------

  let minCost = Infinity;
  let maxCost = -Infinity;

  let minTime = Infinity;
  let maxTime = -Infinity;

  let minCarbon = Infinity;
  let maxCarbon = -Infinity;

  for (const c of candidates) {
    const cost =
      Number(c.summary?.cost_cents) || 0;

    const time =
      Number(c.summary?.minutes) || 0;

    const carbon =
      Number(c.summary?.carbon_kg) || 0;

    if (cost < minCost) minCost = cost;
    if (cost > maxCost) maxCost = cost;

    if (time < minTime) minTime = time;
    if (time > maxTime) maxTime = time;

    if (carbon < minCarbon) minCarbon = carbon;
    if (carbon > maxCarbon) maxCarbon = carbon;
  }

  // ----------------------------------------------------------
  // Fallback bounds
  // ----------------------------------------------------------

  const budgetCents =
    Number(bounds?.budget_cents) > 0
      ? Number(bounds.budget_cents)
      : maxCost;

  const timeLimit =
    Number(bounds?.time_limit_minutes) > 0
      ? Number(bounds.time_limit_minutes)
      : maxTime;

  const carbonCap =
    Number(bounds?.carbon_cap_kg) > 0
      ? Number(bounds.carbon_cap_kg)
      : maxCarbon;

  // ----------------------------------------------------------
  // Score every candidate
  // ----------------------------------------------------------

  return candidates
    .map(candidate => {
      const summary =
        candidate.summary || {};

      const cost =
        Number(summary.cost_cents) || 0;

      const time =
        Number(summary.minutes) || 0;

      const carbon =
        Number(summary.carbon_kg) || 0;

      // ------------------------------------------------------
      // Cost normalization
      // ------------------------------------------------------

      let normCost = 0;

      if (maxCost > minCost) {
        normCost =
          (cost - minCost) /
          (maxCost - minCost);
      } else if (budgetCents > 0) {
        normCost =
          cost / budgetCents;
      }

      // ------------------------------------------------------
      // Time normalization
      // ------------------------------------------------------

      let normTime = 0;

      if (maxTime > minTime) {
        normTime =
          (time - minTime) /
          (maxTime - minTime);
      } else if (timeLimit > 0) {
        normTime =
          time / timeLimit;
      }

      // ------------------------------------------------------
      // Carbon normalization
      // ------------------------------------------------------

      let normCarbon = 0;

      if (maxCarbon > minCarbon) {
        normCarbon =
          (carbon - minCarbon) /
          (maxCarbon - minCarbon);
      } else if (carbonCap > 0) {
        normCarbon =
          carbon / carbonCap;
      }

      // ------------------------------------------------------
      // Primary multi-objective score
      // ------------------------------------------------------

      const objectiveScore =
        (nw.cost * normCost) +
        (nw.time * normTime) +
        (nw.carbon * normCarbon);

      // ------------------------------------------------------
      // Secondary itinerary-quality adjustment
      // ------------------------------------------------------

      const baseRichnessPenalty =
        calculateRichnessPenalty(
          candidate,
          {
            time_limit_minutes: timeLimit
          }
        );

      // Generic day planning should favor a useful, well-utilized
      // itinerary more strongly than a normal route-optimization query.
      // This remains bounded and never overrides feasibility constraints.
      const richnessMultiplier =
        planningIntent === 'day_plan'
          ? 4
          : 1;

      const richnessPenalty =
        Math.min(
          0.30,
          baseRichnessPenalty * richnessMultiplier
        );

      const score =
        objectiveScore +
        richnessPenalty;

      return {
        ...candidate,

        normalized_metrics: {
          norm_cost:
            Number(normCost.toFixed(4)),

          norm_time:
            Number(normTime.toFixed(4)),

          norm_carbon:
            Number(normCarbon.toFixed(4)),

          itinerary_utilization:
            Number(
              (
                timeLimit > 0
                  ? clamp(time / timeLimit, 0, 1)
                  : 0
              ).toFixed(4)
            ),

          richness_penalty:
            Number(
              richnessPenalty.toFixed(4)
            )
        },

        score:
          Number(score.toFixed(6)),

        weights: {
          cost:
            Number(nw.cost.toFixed(4)),

          time:
            Number(nw.time.toFixed(4)),

          carbon:
            Number(nw.carbon.toFixed(4))
        }
      };
    })
    .sort((a, b) => a.score - b.score);
}

module.exports = {
  normalizeWeights,
  scoreCandidates
};


