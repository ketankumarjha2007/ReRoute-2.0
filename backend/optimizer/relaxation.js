const {
  minutesToTime,
  timeToMinutes,
  centsToMoney,
  moneyToCents
} = require('./constraints');

/**
 * Generates single-constraint relaxations and finds
 * the best feasible plan by relaxing exactly ONE constraint.
 *
 * IMPORTANT:
 * optimizeFn is async because the optimizer uses Supabase.
 */
async function findSingleConstraintRelaxation(
  options,
  bindingConstraint,
  optimizeFn
) {
  const relaxations = [];

  const {
    city_id,
    day_start = '09:00',
    day_end = '18:00',
    budget_cap,
    carbon_cap_kg,
    must_see_poi_ids = [],
    weights,
    allowed_modes,
    max_activities,
    candidate_poi_ids,
    start_poi_id,
    end_poi_id
  } = options;

  const currentEndMins = timeToMinutes(day_end);
  const currentStartMins = timeToMinutes(day_start);

  // ============================================================
  // 1. EXTEND DAY END TIME
  // ============================================================

  let neededTimeExtension = 60;

  if (
    bindingConstraint?.type === 'TIME_LIMIT' &&
    bindingConstraint.excess_minutes
  ) {
    neededTimeExtension =
      Math.ceil(bindingConstraint.excess_minutes / 15) * 15 + 15;
  }

  const candidateEndTimes = [
    Math.min(
      23 * 60 + 59,
      currentEndMins + neededTimeExtension
    ),
    Math.min(
      23 * 60 + 59,
      currentEndMins + 120
    ),
    Math.min(
      23 * 60 + 59,
      currentEndMins + 180
    )
  ];

  for (
    const newEndMins of Array.from(
      new Set(candidateEndTimes)
    )
  ) {
    if (newEndMins <= currentEndMins) {
      continue;
    }

    const newDayEnd = minutesToTime(newEndMins);

    const testOptions = {
      ...options,
      day_end: newDayEnd
    };

    const res = await optimizeFn(testOptions);

    if (res && res.feasible) {
      const addedMins =
        newEndMins - currentEndMins;

      relaxations.push({
        constraint_type: 'TIME',
        name: 'Day End Time',
        action: 'Extend Day End',
        original_value: day_end,
        relaxed_value: newDayEnd,
        difference_text: `+${addedMins} minutes`,
        description:
          `Extend your day from ${day_end} to ${newDayEnd} ` +
          `(${addedMins} extra minutes).`,
        priority:
          bindingConstraint?.type === 'TIME_LIMIT'
            ? 1
            : 2,
        plan: res
      });

      break;
    }
  }

  // ============================================================
  // 2. SHIFT DAY START EARLIER
  // ============================================================

  let neededStartShift = 60;

  if (
    bindingConstraint?.type === 'TIME_LIMIT' &&
    bindingConstraint.excess_minutes
  ) {
    neededStartShift =
      Math.ceil(
        bindingConstraint.excess_minutes / 15
      ) * 15 + 15;
  }

  const candidateStartTimes = [
    Math.max(
      6 * 60,
      currentStartMins - neededStartShift
    ),
    Math.max(
      6 * 60,
      currentStartMins - 120
    )
  ];

  for (
    const newStartMins of Array.from(
      new Set(candidateStartTimes)
    )
  ) {
    if (newStartMins >= currentStartMins) {
      continue;
    }

    const newDayStart =
      minutesToTime(newStartMins);

    const testOptions = {
      ...options,
      day_start: newDayStart
    };

    const res = await optimizeFn(testOptions);

    if (res && res.feasible) {
      const earlierMins =
        currentStartMins - newStartMins;

      relaxations.push({
        constraint_type: 'TIME_START',
        name: 'Day Start Time',
        action: 'Shift Day Start Earlier',
        original_value: day_start,
        relaxed_value: newDayStart,
        difference_text:
          `${earlierMins} mins earlier`,
        description:
          `Start your day at ${newDayStart} instead of ` +
          `${day_start} (${earlierMins} mins earlier).`,
        priority:
          bindingConstraint?.type === 'TIME_LIMIT'
            ? 1
            : 3,
        plan: res
      });

      break;
    }
  }

  // ============================================================
  // 3. INCREASE BUDGET CAP
  // ============================================================

  const currentBudgetCents =
    budget_cap !== undefined &&
    budget_cap !== null &&
    budget_cap !== ''
      ? moneyToCents(budget_cap)
      : null;

  if (currentBudgetCents !== null) {
    const candidateBudgets = [];

    if (
      bindingConstraint?.type === 'BUDGET_LIMIT' &&
      bindingConstraint.required_cost
    ) {
      const reqCents =
        moneyToCents(
          bindingConstraint.required_cost
        );

      candidateBudgets.push(reqCents);
      candidateBudgets.push(
        Math.round(reqCents * 1.15)
      );
    }

    const multipliers = [
      1.25,
      1.5,
      2.0,
      3.0,
      5.0,
      10.0,
      50.0,
      100.0
    ];

    for (const multiplier of multipliers) {
      candidateBudgets.push(
        Math.round(
          currentBudgetCents * multiplier
        )
      );
    }

    const uniqueBudgets =
      Array.from(
        new Set(candidateBudgets)
      ).sort((a, b) => a - b);

    for (
      const relaxedCents of uniqueBudgets
    ) {
      if (
        relaxedCents <= currentBudgetCents
      ) {
        continue;
      }

      const relaxedBudgetStr =
        centsToMoney(relaxedCents);

      const testOptions = {
        ...options,
        budget_cap: relaxedBudgetStr
      };

      const res =
        await optimizeFn(testOptions);

      if (res && res.feasible) {
        relaxations.push({
          constraint_type: 'BUDGET',
          name: 'Budget Cap',
          action: 'Increase Budget Cap',
          original_value:
            `₹${centsToMoney(currentBudgetCents)}`,
          relaxed_value:
            `₹${relaxedBudgetStr}`,
          difference_text:
            `+₹${centsToMoney(
              relaxedCents -
              currentBudgetCents
            )}`,
          description:
            `Increase the budget cap from ` +
            `₹${centsToMoney(
              currentBudgetCents
            )} to ₹${relaxedBudgetStr}.`,
          priority:
            bindingConstraint?.type ===
            'BUDGET_LIMIT'
              ? 1
              : 4,
          plan: res
        });

        break;
      }
    }
  }

  // ============================================================
  // 4. INCREASE CARBON CAP
  // ============================================================

  const currentCarbonCap =
    Number(carbon_cap_kg);

  if (
    !isNaN(currentCarbonCap) &&
    currentCarbonCap > 0
  ) {
    const candidateCarbons = [];

    if (
      bindingConstraint?.type ===
        'CARBON_LIMIT' &&
      bindingConstraint.required_carbon_kg
    ) {
      candidateCarbons.push(
        Number(
          (
            Number(
              bindingConstraint.required_carbon_kg
            ) + 0.5
          ).toFixed(1)
        )
      );

      candidateCarbons.push(
        Number(
          (
            Number(
              bindingConstraint.required_carbon_kg
            ) * 1.2
          ).toFixed(1)
        )
      );
    }

    const carbonMultipliers = [
      1.3,
      1.6,
      2.0,
      3.0,
      5.0,
      10.0
    ];

    for (
      const multiplier of carbonMultipliers
    ) {
      candidateCarbons.push(
        Number(
          (
            currentCarbonCap *
            multiplier
          ).toFixed(2)
        )
      );
    }

    const uniqueCarbons =
      Array.from(
        new Set(candidateCarbons)
      ).sort((a, b) => a - b);

    for (
      const relaxedCarbon of uniqueCarbons
    ) {
      if (
        relaxedCarbon <= currentCarbonCap
      ) {
        continue;
      }

      const testOptions = {
        ...options,
        carbon_cap_kg: relaxedCarbon
      };

      const res =
        await optimizeFn(testOptions);

      if (res && res.feasible) {
        relaxations.push({
          constraint_type: 'CARBON',
          name: 'Carbon Emissions Cap',
          action: 'Increase Carbon Cap',
          original_value:
            `${currentCarbonCap.toFixed(1)} kg`,
          relaxed_value:
            `${relaxedCarbon.toFixed(1)} kg`,
          difference_text:
            `+${(
              relaxedCarbon -
              currentCarbonCap
            ).toFixed(1)} kg`,
          description:
            `Increase the carbon cap from ` +
            `${currentCarbonCap.toFixed(1)} kg ` +
            `to ${relaxedCarbon.toFixed(1)} kg CO₂.`,
          priority:
            bindingConstraint?.type ===
            'CARBON_LIMIT'
              ? 1
              : 5,
          plan: res
        });

        break;
      }
    }
  }

  // ============================================================
  // 5. RELAX OPENING HOURS
  // ============================================================
  //
  // This is the important Case 02 fix.
  //
  // Example:
  //
  // Sunset Point:
  //     Original closing = 17:00
  //     Required departure = 19:22
  //
  // We temporarily extend ONLY Sunset Point's closing
  // time. The database is NOT modified.
  //
  // ============================================================

  if (
    bindingConstraint?.type ===
    'OPENING_HOURS'
  ) {
    const poiId =
      bindingConstraint.poi_id ||
      null;

    const poiName =
      bindingConstraint.poi_name ||
      null;

    const requiredDeparture =
      bindingConstraint.departure ||
      null;

    const originalClosing =
      bindingConstraint.closes_at ||
      null;

    if (
      requiredDeparture
    ) {
      const requiredDepartureMins =
        timeToMinutes(
          requiredDeparture
        );

      const originalClosingMins =
        originalClosing
          ? timeToMinutes(
              originalClosing
            )
          : requiredDepartureMins;

      // Generate the smallest useful relaxation
      // first, followed by safe increments.
      const candidateClosingTimes = [
        requiredDepartureMins,
        requiredDepartureMins + 15,
        requiredDepartureMins + 30,

        originalClosingMins + 30,
        originalClosingMins + 60,
        originalClosingMins + 120
      ];

      const uniqueClosingTimes =
        Array.from(
          new Set(
            candidateClosingTimes
              .map(minutes =>
                Math.min(
                  minutes,
                  23 * 60 + 59
                )
              )
          )
        )
        .filter(
          minutes =>
            minutes >
            originalClosingMins
        )
        .sort(
          (a, b) => a - b
        );

      for (
        const newClosingMins of
          uniqueClosingTimes
      ) {
        const newClosingTime =
          minutesToTime(
            newClosingMins
          );

        /*
         * Prefer the exact POI ID.
         *
         * If the binding constraint does not
         * contain poi_id, fall back to:
         *
         * name:Sunset Point
         */
        const overrideKey =
          poiId ||
          (
            poiName
              ? `name:${poiName}`
              : null
          );

        if (!overrideKey) {
          continue;
        }

        const openingHoursOverrides = {
          ...(options.opening_hours_overrides || {}),
          [overrideKey]: {
            ...(options.opening_hours_overrides?.[
              overrideKey
            ] || {}),
            closes_at:
              newClosingTime
          }
        };

        const testOptions = {
          ...options,
          opening_hours_overrides:
            openingHoursOverrides
        };

        const res =
          await optimizeFn(
            testOptions
          );

        if (
          res &&
          res.feasible
        ) {
          const extraMinutes =
            newClosingMins -
            originalClosingMins;

          relaxations.push({
            constraint_type:
              'OPENING_HOURS',

            name:
              'Attraction Opening Hours',

            action:
              'Extend Attraction Closing Time',

            poi_id:
              poiId,

            poi_name:
              poiName,

            original_value:
              originalClosing,

            relaxed_value:
              newClosingTime,

            difference_text:
              `+${extraMinutes} minutes`,

            description:
              `${poiName || 'The attraction'} ` +
              `normally closes at ` +
              `${originalClosing}, but the ` +
              `visit requires departure at ` +
              `${requiredDeparture}. ` +
              `Relax its closing time to ` +
              `${newClosingTime}.`,

            priority: 0,

            plan: res
          });

          // Stop at the smallest feasible
          // opening-hours relaxation.
          break;
        }
      }
    }
  }

  // ============================================================
  // NO RELAXATION FOUND
  // ============================================================

  if (
    relaxations.length === 0
  ) {
    return null;
  }

  // Binding constraint gets priority.
  relaxations.sort(
    (a, b) =>
      a.priority - b.priority
  );

  return relaxations[0];
}

module.exports = {
  findSingleConstraintRelaxation
};