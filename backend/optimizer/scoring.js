/**
 * ReRoute 2.0
 * Objective scoring module
 *
 * PRIMARY OBJECTIVES
 * ------------------
 * 1. Cost
 * 2. Time
 * 3. Carbon
 *
 * SECONDARY OBJECTIVE
 * -------------------
 * Itinerary richness / day utilization
 *
 * IMPORTANT:
 * Cost / Time / Carbon are controlled directly by the
 * user's weights.
 *
 * Richness is intentionally tiny and acts only as a
 * tie-breaker. It must NEVER overpower the user's
 * selected optimization priority.
 */

/**
 * ============================================================
 * NORMALIZE WEIGHTS
 * ============================================================
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

  const sum =
    w.cost +
    w.time +
    w.carbon;

  if (sum <= 0) {

    return {
      cost: 0.3333,
      time: 0.3333,
      carbon: 0.3334
    };

  }

  return {

    cost:
      w.cost / sum,

    time:
      w.time / sum,

    carbon:
      w.carbon / sum

  };
}


/**
 * ============================================================
 * CLAMP
 * ============================================================
 */
function clamp(value, min, max) {

  return Math.min(
    max,
    Math.max(min, value)
  );

}


/**
 * ============================================================
 * ITINERARY RICHNESS
 * ============================================================
 *
 * This is deliberately VERY small.
 *
 * It should help break ties between otherwise similar
 * itineraries, but it should never defeat the user's
 * Cost / Time / Carbon preference.
 */
function calculateRichnessPenalty(
  candidate,
  bounds
) {

  const summary =
    candidate.summary || {};

  const totalMinutes =
    Number(summary.minutes) || 0;

  const activityMinutes =
    Number(summary.activity_minutes) || 0;

  const stops =
    Number(summary.stops_count) || 0;

  const timeLimit =
    Number(bounds?.time_limit_minutes) || 0;

  if (
    timeLimit <= 0 ||
    stops <= 0
  ) {

    return 0;

  }


  // ----------------------------------------------------------
  // DAY UTILIZATION
  // ----------------------------------------------------------

  const utilization =
    clamp(
      totalMinutes / timeLimit,
      0,
      1
    );


  // ----------------------------------------------------------
  // ACTIVITY RATIO
  // ----------------------------------------------------------

  const activityRatio =
    totalMinutes > 0
      ? clamp(
          activityMinutes / totalMinutes,
          0,
          1
        )
      : 0;


  // ----------------------------------------------------------
  // STOP RICHNESS
  // ----------------------------------------------------------

  const stopRichness =
    1 -
    Math.exp(
      -0.55 * stops
    );


  // ----------------------------------------------------------
  // QUALITY
  // ----------------------------------------------------------

  const quality =
    (0.50 * utilization) +
    (0.30 * activityRatio) +
    (0.20 * stopRichness);


  /*
   * Maximum penalty = 0.02
   *
   * This is intentionally tiny.
   */
  return clamp(
    0.02 * (1 - quality),
    0,
    0.02
  );

}


/**
 * ============================================================
 * SCORE CANDIDATES
 * ============================================================
 *
 * Lower score = better itinerary.
 *
 * Cost / Time / Carbon:
 *
 *     weighted normalized objective
 *
 * Richness:
 *
 *     tiny secondary tie-breaker
 */
function scoreCandidates(
  candidates,
  weights,
  bounds
) {

  if (
    !candidates ||
    candidates.length === 0
  ) {

    return [];

  }


  const nw =
    normalizeWeights(weights);


  const planningIntent =
    bounds?.planning_intent ||
    'route_optimization';


  // ==========================================================
  // FIND OBJECTIVE RANGES
  // ==========================================================

  let minCost = Infinity;
  let maxCost = -Infinity;

  let minTime = Infinity;
  let maxTime = -Infinity;

  let minCarbon = Infinity;
  let maxCarbon = -Infinity;


  for (
    const candidate of candidates
  ) {

    const summary =
      candidate.summary || {};


    const cost =
      Number(
        summary.cost_cents
      ) || 0;


    const time =
      Number(
        summary.minutes
      ) || 0;


    const carbon =
      Number(
        summary.carbon_kg
      ) || 0;


    minCost =
      Math.min(
        minCost,
        cost
      );

    maxCost =
      Math.max(
        maxCost,
        cost
      );


    minTime =
      Math.min(
        minTime,
        time
      );

    maxTime =
      Math.max(
        maxTime,
        time
      );


    minCarbon =
      Math.min(
        minCarbon,
        carbon
      );

    maxCarbon =
      Math.max(
        maxCarbon,
        carbon
      );

  }


  // ==========================================================
  // EXTERNAL CONSTRAINT BOUNDS
  // ==========================================================

  const budgetCents =
    Number(
      bounds?.budget_cents
    ) > 0

      ? Number(
          bounds.budget_cents
        )

      : maxCost;


  const timeLimit =
    Number(
      bounds?.time_limit_minutes
    ) > 0

      ? Number(
          bounds.time_limit_minutes
        )

      : maxTime;


  const carbonCap =
    Number(
      bounds?.carbon_cap_kg
    ) > 0

      ? Number(
          bounds.carbon_cap_kg
        )

      : maxCarbon;


  // ==========================================================
  // SCORE EACH CANDIDATE
  // ==========================================================

  const scored =
    candidates.map(
      candidate => {

        const summary =
          candidate.summary || {};


        const cost =
          Number(
            summary.cost_cents
          ) || 0;


        const time =
          Number(
            summary.minutes
          ) || 0;


        const carbon =
          Number(
            summary.carbon_kg
          ) || 0;


        // ====================================================
        // COST NORMALIZATION
        // ====================================================

        let normCost = 0;

        if (
          maxCost >
          minCost
        ) {

          normCost =
            (
              cost -
              minCost
            ) /
            (
              maxCost -
              minCost
            );

        }
        else if (
          budgetCents > 0
        ) {

          normCost =
            cost /
            budgetCents;

        }


        // ====================================================
        // TIME NORMALIZATION
        // ====================================================

        let normTime = 0;

        if (
          maxTime >
          minTime
        ) {

          normTime =
            (
              time -
              minTime
            ) /
            (
              maxTime -
              minTime
            );

        }
        else if (
          timeLimit > 0
        ) {

          normTime =
            time /
            timeLimit;

        }


        // ====================================================
        // CARBON NORMALIZATION
        // ====================================================

        let normCarbon = 0;

        if (
          maxCarbon >
          minCarbon
        ) {

          normCarbon =
            (
              carbon -
              minCarbon
            ) /
            (
              maxCarbon -
              minCarbon
            );

        }
        else if (
          carbonCap > 0
        ) {

          normCarbon =
            carbon /
            carbonCap;

        }


        // ====================================================
        // CLAMP NORMALIZED VALUES
        // ====================================================

        normCost =
          clamp(
            normCost,
            0,
            1
          );

        normTime =
          clamp(
            normTime,
            0,
            1
          );

        normCarbon =
          clamp(
            normCarbon,
            0,
            1
          );


        // ====================================================
        // PRIMARY OBJECTIVE
        // ====================================================
        //
        // THIS IS THE MOST IMPORTANT PART.
        //
        // User weights directly control this score.
        //
        // Example:
        //
        // Cost    0.80
        // Time    0.10
        // Carbon  0.10
        //
        // Cost dominates.
        //
        // Carbon  0.80
        // Cost    0.10
        // Time    0.10
        //
        // Carbon dominates.
        // ====================================================

        const objectiveScore =
          (
            nw.cost *
            normCost
          ) +
          (
            nw.time *
            normTime
          ) +
          (
            nw.carbon *
            normCarbon
          );


        // ====================================================
        // SECONDARY RICHNESS
        // ====================================================
        //
        // Only a very small tie-breaker.
        //
        // NEVER multiplied by 4.
        // ====================================================

        const baseRichnessPenalty =
          calculateRichnessPenalty(
            candidate,
            {
              time_limit_minutes:
                timeLimit
            }
          );


        /*
         * Day plans receive the same small richness term.
         *
         * We deliberately do NOT make it 4x larger.
         *
         * This ensures:
         *
         *     user weights > richness
         */

        const richnessPenalty =
          planningIntent === 'day_plan'
            ? baseRichnessPenalty
            : baseRichnessPenalty * 0.5;


        // ====================================================
        // FINAL SCORE
        // ====================================================

        const score =
          objectiveScore +
          richnessPenalty;


        // ====================================================
        // RETURN SCORED CANDIDATE
        // ====================================================

        return {

          ...candidate,

          normalized_metrics: {

            norm_cost:
              Number(
                normCost.toFixed(4)
              ),

            norm_time:
              Number(
                normTime.toFixed(4)
              ),

            norm_carbon:
              Number(
                normCarbon.toFixed(4)
              ),

            itinerary_utilization:
              Number(
                (
                  timeLimit > 0
                    ? clamp(
                        time /
                        timeLimit,
                        0,
                        1
                      )
                    : 0
                ).toFixed(4)
              ),

            richness_penalty:
              Number(
                richnessPenalty.toFixed(4)
              )

          },

          score:
            Number(
              score.toFixed(6)
            ),

          weights: {

            cost:
              Number(
                nw.cost.toFixed(4)
              ),

            time:
              Number(
                nw.time.toFixed(4)
              ),

            carbon:
              Number(
                nw.carbon.toFixed(4)
              )

          }

        };

      }
    );


  // ==========================================================
  // SORT
  // ==========================================================

  scored.sort(
    (a, b) => {

      /*
       * Primary score comparison.
       */
      const scoreDifference =
        a.score -
        b.score;


      if (
        Math.abs(
          scoreDifference
        ) > 0.000001
      ) {

        return scoreDifference;

      }


      /*
       * If scores are effectively equal,
       * prefer better itinerary utilization.
       */
      const utilizationA =
        Number(
          a.normalized_metrics
            ?.itinerary_utilization
        ) || 0;


      const utilizationB =
        Number(
          b.normalized_metrics
            ?.itinerary_utilization
        ) || 0;


      if (
        utilizationA !==
        utilizationB
      ) {

        return (
          utilizationB -
          utilizationA
        );

      }


      /*
       * Final deterministic tie-breaker:
       * fewer minutes.
       */
      const timeA =
        Number(
          a.summary?.minutes
        ) || 0;


      const timeB =
        Number(
          b.summary?.minutes
        ) || 0;


      return (
        timeA -
        timeB
      );

    }
  );


  return scored;

}


/**
 * ============================================================
 * EXPORTS
 * ============================================================
 */

module.exports = {

  normalizeWeights,

  scoreCandidates

};