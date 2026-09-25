function normalizeTimeToMinutes(value) {
  if (!value || typeof value !== 'string') return null;

  const [h, m] = value.split(':').map(Number);

  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;

  return h * 60 + m;
}

function collectViolations(evaluatedAttempts = []) {
  const violations = [];

  for (const attempt of evaluatedAttempts) {
    for (const violation of attempt?.check?.violations || []) {
      violations.push({ ...violation });
    }
  }

  return violations;
}

function getConstraintLabel(type) {
  switch (type) {
    case 'OPENING_HOURS': return 'Attraction Opening Hours';
    case 'TIME_LIMIT': return 'Available Time';
    case 'BUDGET': return 'Budget Limit';
    case 'CARBON': return 'Carbon Limit';
    case 'MISSING_TRAVEL_EDGE': return 'Missing Travel Connection';
    case 'MUST_SEE': return 'Must-See Requirement';
    case 'START': return 'Starting Point';
    case 'END': return 'Ending Point';
    case 'TRANSPORT_MODE': return 'Transport Mode';
    case 'CLOSED_DAY': return 'Closed Day';
    default: return 'Multiple Constraints';
  }
}

function extractOpeningHourEvidence(evaluatedAttempts = []) {
  const evidence = [];

  for (const attempt of evaluatedAttempts) {
    const violations =
      attempt?.plan?.opening_hour_violations || [];

    for (const violation of violations) {
      const departureMinutes =
        normalizeTimeToMinutes(violation.departure);

      const closingMinutes =
        normalizeTimeToMinutes(violation.closes_at);

      const excessMinutes =
        Number.isFinite(departureMinutes) &&
        Number.isFinite(closingMinutes)
          ? departureMinutes - closingMinutes
          : null;

      evidence.push({
        type: 'OPENING_HOURS',
        severity: 'hard',
        poi_id: violation.poi_id || null,
        name: violation.name || null,
        poi_name: violation.name || null,
        opens_at: violation.opens_at || null,
        closes_at: violation.closes_at || null,
        arrival: violation.arrival || null,
        departure: violation.departure || null,
        reason: violation.reason || null,
        excess_minutes: excessMinutes
      });
    }
  }

  return evidence;
}

function extractMissingEdgeEvidence(evaluatedAttempts = []) {
  const evidence = [];

  for (const attempt of evaluatedAttempts) {
    const missingEdges =
      attempt?.plan?.missing_edges || [];

    for (const edge of missingEdges) {
      evidence.push({
        type: 'MISSING_TRAVEL_EDGE',
        severity: 'hard',
        from_poi_id:
          edge.from_poi_id ||
          edge.origin_poi_id ||
          null,
        to_poi_id:
          edge.to_poi_id ||
          edge.destination_poi_id ||
          null,
        mode: edge.mode || null,
        message:
          edge.message ||
          'No valid travel connection exists.'
      });
    }
  }

  return evidence;
}

function extractGeneralEvidence(evaluatedAttempts = []) {
  const evidence = [];

  for (const attempt of evaluatedAttempts) {
    const violations =
      attempt?.check?.violations || [];

    const summary =
      attempt?.plan?.summary || {};

    for (const violation of violations) {
      if (
        violation.type === 'OPENING_HOURS' ||
        violation.type === 'MISSING_TRAVEL_EDGE'
      ) {
        continue;
      }

      const item = {
        ...violation,
        severity: violation.severity || 'hard'
      };

      if (
        violation.type === 'TIME_LIMIT' &&
        Number.isFinite(summary.minutes)
      ) {
        item.actual_minutes = summary.minutes;
      }

      if (
        violation.type === 'BUDGET' &&
        summary.cost !== undefined
      ) {
        item.actual_cost = summary.cost;
      }

      if (
        violation.type === 'CARBON' &&
        Number.isFinite(summary.carbon_kg)
      ) {
        item.actual_carbon_kg = summary.carbon_kg;
      }

      evidence.push(item);
    }
  }

  return evidence;
}

function buildConstraintEvidence(
  options = {},
  evaluatedAttempts = []
) {
  const opening =
    extractOpeningHourEvidence(evaluatedAttempts);

  const missingEdges =
    extractMissingEdgeEvidence(evaluatedAttempts);

  const general =
    extractGeneralEvidence(evaluatedAttempts);

  const evidence = [
    ...missingEdges,
    ...opening,
    ...general
  ];

  const start =
    normalizeTimeToMinutes(
      options.day_start || '09:00'
    );

  const end =
    normalizeTimeToMinutes(
      options.day_end || '18:00'
    );

  const availableMins =
    start !== null && end !== null
      ? end - start
      : null;

  return {
    evidence,
    availableMins
  };
}

function selectBindingConstraint(evidence = []) {
  if (!evidence.length) return null;

  const missingEdge =
    evidence.find(
      item => item.type === 'MISSING_TRAVEL_EDGE'
    );

  if (missingEdge) {
    return {
      ...missingEdge,
      label: getConstraintLabel(missingEdge.type)
    };
  }

  const openingViolation =
    evidence
      .filter(
        item => item.type === 'OPENING_HOURS'
      )
      .sort(
        (a, b) =>
          (b.excess_minutes || 0) -
          (a.excess_minutes || 0)
      )[0];

  if (openingViolation) {
    return {
      ...openingViolation,
      label: getConstraintLabel(
        openingViolation.type
      )
    };
  }

  const hardViolation =
    evidence.find(
      item => item.severity === 'hard'
    );

  if (hardViolation) {
    return {
      ...hardViolation,
      label: getConstraintLabel(
        hardViolation.type
      )
    };
  }

  return {
    ...evidence[0],
    label: getConstraintLabel(
      evidence[0].type
    )
  };
}

function buildExplanation(bindingConstraint) {
  if (!bindingConstraint) {
    return 'No feasible itinerary satisfies all required constraints.';
  }

  switch (bindingConstraint.type) {
    case 'OPENING_HOURS': {
      const name =
        bindingConstraint.name ||
        bindingConstraint.poi_name ||
        bindingConstraint.poi_id ||
        'The selected attraction';

      const closesAt =
        bindingConstraint.closes_at ||
        'the configured closing time';

      const departure =
        bindingConstraint.departure ||
        'the required departure time';

      return (
        `${name} closes at ${closesAt}, ` +
        `but the visit cannot be completed before ${departure}.`
      );
    }

    case 'MISSING_TRAVEL_EDGE':
      return (
        bindingConstraint.message ||
        'No valid travel connection exists for the requested itinerary.'
      );

    case 'TIME_LIMIT':
      return (
        bindingConstraint.message ||
        'The requested itinerary exceeds the available time.'
      );

    case 'BUDGET':
      return (
        bindingConstraint.message ||
        'The requested itinerary exceeds the available budget.'
      );

    case 'CARBON':
      return (
        bindingConstraint.message ||
        'The requested itinerary exceeds the carbon limit.'
      );

    case 'MUST_SEE':
      return (
        bindingConstraint.message ||
        'The required must-see attractions cannot all be included in a feasible itinerary.'
      );

    case 'START':
      return (
        bindingConstraint.message ||
        'The requested starting point cannot be satisfied.'
      );

    case 'END':
      return (
        bindingConstraint.message ||
        'The requested ending point cannot be satisfied.'
      );

    case 'TRANSPORT_MODE':
      return (
        bindingConstraint.message ||
        'The requested transport mode cannot satisfy the itinerary constraints.'
      );

    case 'CLOSED_DAY':
      return (
        bindingConstraint.message ||
        'A required attraction is closed on the requested day.'
      );

    default:
      return (
        bindingConstraint.message ||
        'No feasible itinerary satisfies all required constraints.'
      );
  }
}

function diagnoseInfeasibility(
  options = {},
  evaluatedAttempts = []
) {
  const allViolations =
    collectViolations(evaluatedAttempts);

  const diagnostic =
    buildConstraintEvidence(
      options,
      evaluatedAttempts
    );

  const selected =
    selectBindingConstraint(
      diagnostic.evidence
    );

  let bindingConstraint = null;

  if (selected) {
    bindingConstraint = {
      ...selected
    };
  }

  if (!bindingConstraint) {
    bindingConstraint = {
      type: 'MULTIPLE_CONSTRAINTS',
      label: 'Multiple Constraints',
      available_minutes:
        diagnostic.availableMins
    };
  }

  const explanation =
    buildExplanation(bindingConstraint);

  return {
    binding_constraint: bindingConstraint,
    explanation,
    violations: allViolations
  };
}

module.exports = {
  diagnoseInfeasibility,
  collectViolations,
  buildConstraintEvidence,
  selectBindingConstraint,
  buildExplanation
};
