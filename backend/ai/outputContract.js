/*
 * ============================================================
 * ReRoute AI OUTPUT CONTRACT
 * ============================================================
 *
 * Groq is responsible ONLY for understanding user intent.
 *
 * Groq must NOT:
 * - calculate itinerary cost
 * - calculate travel time
 * - calculate carbon
 * - decide feasibility
 * - create an itinerary
 * - invent POI IDs
 *
 * The deterministic ReRoute optimizer remains authoritative.
 * ============================================================
 */

const SUPPORTED_MODES = [
  'walk',
  'cab'
];

const AI_ALLOWED_FIELDS = [
  'city_name',
  'budget_cap',
  'carbon_cap_kg',
  'day_start',
  'day_end',
  'weights',
  'must_see_keywords',
  'allowed_modes',
  'theme'
];

const AI_FORBIDDEN_FIELDS = [
  'cost',
  'total_cost',
  'estimated_cost',
  'carbon',
  'total_carbon',
  'travel_minutes',
  'total_minutes',
  'duration_minutes',
  'feasible',
  'itinerary',
  'route',
  'stops',
  'transfers',
  'score'
];


/*
 * ------------------------------------------------------------
 * Validate HH:MM
 * ------------------------------------------------------------
 */

function isValidTime(value) {

  if (
    typeof value !== 'string' ||
    !/^\d{2}:\d{2}$/.test(value)
  ) {
    return false;
  }

  const [hours, minutes] =
    value.split(':').map(Number);

  return (
    hours >= 0 &&
    hours <= 23 &&
    minutes >= 0 &&
    minutes <= 59
  );
}


/*
 * ------------------------------------------------------------
 * Validate money string
 *
 * Examples:
 * "1500"
 * "1500.00"
 * "999.50"
 *
 * Do NOT use parseFloat for money validation.
 * ------------------------------------------------------------
 */

function isValidMoney(value) {

  if (
    typeof value !== 'string'
  ) {
    return false;
  }

  return /^\d+(?:\.\d{1,2})?$/.test(
    value.trim()
  );
}


/*
 * ------------------------------------------------------------
 * Validate weights
 * ------------------------------------------------------------
 */

function validateWeights(weights) {

  if (
    !weights ||
    typeof weights !== 'object'
  ) {
    return {
      valid: false,
      message: 'weights object is required'
    };
  }

  const cost =
    Number(weights.cost);

  const time =
    Number(weights.time);

  const carbon =
    Number(weights.carbon);

  if (
    !Number.isFinite(cost) ||
    !Number.isFinite(time) ||
    !Number.isFinite(carbon)
  ) {
    return {
      valid: false,
      message: 'weights must contain numeric cost, time and carbon values'
    };
  }

  if (
    cost < 0 ||
    time < 0 ||
    carbon < 0
  ) {
    return {
      valid: false,
      message: 'weights cannot be negative'
    };
  }

  const total =
    cost + time + carbon;

  if (
    Math.abs(total - 1) > 0.01
  ) {
    return {
      valid: false,
      message:
        `weights must sum to approximately 1.0, received ${total}`
    };
  }

  return {
    valid: true
  };
}


/*
 * ------------------------------------------------------------
 * Main AI output contract validator
 * ------------------------------------------------------------
 */

function validateAiOutput(aiOutput) {

  const errors = [];
  const warnings = [];

  /*
   * Must be an object
   */
  if (
    !aiOutput ||
    typeof aiOutput !== 'object' ||
    Array.isArray(aiOutput)
  ) {

    return {
      valid: false,
      errors: [
        'AI output must be a JSON object'
      ],
      warnings
    };
  }


  /*
   * ----------------------------------------------------------
   * Check forbidden fields
   * ----------------------------------------------------------
   */

  for (
    const field of AI_FORBIDDEN_FIELDS
  ) {

    if (
      Object.prototype.hasOwnProperty.call(
        aiOutput,
        field
      )
    ) {

      errors.push(
        `Forbidden AI field: ${field}`
      );
    }
  }


  /*
   * ----------------------------------------------------------
   * Check unknown fields
   * ----------------------------------------------------------
   */

  for (
    const field of Object.keys(aiOutput)
  ) {

    if (
      !AI_ALLOWED_FIELDS.includes(field)
    ) {

      errors.push(
        `Unknown AI field: ${field}`
      );
    }
  }


  /*
   * ----------------------------------------------------------
   * City
   * ----------------------------------------------------------
   */

  if (
    aiOutput.city_name !== null &&
    aiOutput.city_name !== undefined &&
    typeof aiOutput.city_name !== 'string'
  ) {

    errors.push(
      'city_name must be a string or null'
    );
  }


  /*
   * ----------------------------------------------------------
   * Budget
   * ----------------------------------------------------------
   */

  if (
    aiOutput.budget_cap !== null &&
    aiOutput.budget_cap !== undefined
  ) {

    if (
      !isValidMoney(
        aiOutput.budget_cap
      )
    ) {

      errors.push(
        'budget_cap must be a money string such as "1500.00"'
      );
    }
  }


  /*
   * ----------------------------------------------------------
   * Carbon
   * ----------------------------------------------------------
   */

  if (
    aiOutput.carbon_cap_kg !== null &&
    aiOutput.carbon_cap_kg !== undefined
  ) {

    const carbon =
      Number(
        aiOutput.carbon_cap_kg
      );

    if (
      !Number.isFinite(carbon)
    ) {

      errors.push(
        'carbon_cap_kg must be numeric'
      );

    } else if (
      carbon < 0
    ) {

      errors.push(
        'carbon_cap_kg cannot be negative'
      );
    }
  }


  /*
   * ----------------------------------------------------------
   * Time
   * ----------------------------------------------------------
   */

  if (
    aiOutput.day_start !== null &&
    aiOutput.day_start !== undefined
  ) {

    if (
      !isValidTime(
        aiOutput.day_start
      )
    ) {

      errors.push(
        'day_start must use HH:MM format'
      );
    }
  }


  if (
    aiOutput.day_end !== null &&
    aiOutput.day_end !== undefined
  ) {

    if (
      !isValidTime(
        aiOutput.day_end
      )
    ) {

      errors.push(
        'day_end must use HH:MM format'
      );
    }
  }


  /*
   * If both exist, end must be after start.
   */

  if (
    isValidTime(aiOutput.day_start) &&
    isValidTime(aiOutput.day_end)
  ) {

    const [
      startHour,
      startMinute
    ] =
      aiOutput.day_start
        .split(':')
        .map(Number);

    const [
      endHour,
      endMinute
    ] =
      aiOutput.day_end
        .split(':')
        .map(Number);

    const start =
      startHour * 60 +
      startMinute;

    const end =
      endHour * 60 +
      endMinute;

    if (end <= start) {

      errors.push(
        'day_end must be after day_start'
      );
    }
  }


  /*
   * ----------------------------------------------------------
   * Weights
   * ----------------------------------------------------------
   */

  const weightValidation =
    validateWeights(
      aiOutput.weights
    );

  if (
    !weightValidation.valid
  ) {

    errors.push(
      weightValidation.message
    );
  }


  /*
   * ----------------------------------------------------------
   * Must-see keywords
   * ----------------------------------------------------------
   */

  if (
    !Array.isArray(
      aiOutput.must_see_keywords
    )
  ) {

    errors.push(
      'must_see_keywords must be an array'
    );
  }


  /*
   * ----------------------------------------------------------
   * Transport modes
   * ----------------------------------------------------------
   */

  if (
    !Array.isArray(
      aiOutput.allowed_modes
    )
  ) {

    errors.push(
      'allowed_modes must be an array'
    );

  } else {

    for (
      const mode of
      aiOutput.allowed_modes
    ) {

      if (
        !SUPPORTED_MODES.includes(
          String(mode).toLowerCase()
        )
      ) {

        errors.push(
          `Unsupported transport mode: ${mode}`
        );
      }
    }
  }


  /*
   * ----------------------------------------------------------
   * Theme
   * ----------------------------------------------------------
   */

  if (
    aiOutput.theme !== null &&
    aiOutput.theme !== undefined &&
    typeof aiOutput.theme !== 'string'
  ) {

    errors.push(
      'theme must be a string or null'
    );
  }


  return {
    valid:
      errors.length === 0,

    errors,

    warnings
  };
}


module.exports = {
  validateAiOutput,
  validateWeights,
  isValidMoney,
  isValidTime,
  SUPPORTED_MODES
};