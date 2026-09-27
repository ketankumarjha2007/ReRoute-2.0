/**
 * Carbon Model
 *
 * Converts travel distance + transport mode into estimated
 * CO2 emissions.
 *
 * The model is intentionally isolated from routing.
 * A routing provider tells us:
 *
 *   "This route is 8.4 km and takes 21 minutes."
 *
 * This module tells us:
 *
 *   "That route produces approximately X kg CO2."
 *
 * This keeps the architecture replaceable later.
 */

// Default emission factors in kg CO2 per passenger-km.
//
// These are application defaults, not immutable scientific constants.
// They can later be replaced with region/provider-specific factors.

const DEFAULT_EMISSION_FACTORS = {
  walk: 0,
  bicycle: 0,
  bike: 0.08,
  scooter: 0.06,
  motorcycle: 0.08,
  cab: 0.17,
  taxi: 0.17,
  car: 0.17,
  bus: 0.08,
  train: 0.04,
  metro: 0.04,
  rail: 0.04
};

/**
 * Normalize a transport mode.
 */
function normalizeMode(mode) {
  if (!mode) {
    return null;
  }

  return String(mode)
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

/**
 * Get the emission factor for a transport mode.
 */
function getEmissionFactor(
  mode,
  factors = DEFAULT_EMISSION_FACTORS
) {
  const normalizedMode = normalizeMode(mode);

  if (!normalizedMode) {
    return 0;
  }

  return Number(factors[normalizedMode] ?? 0);
}

/**
 * Calculate carbon emissions from distance.
 *
 * distanceKm:
 *   route distance in kilometres
 *
 * mode:
 *   transport mode
 *
 * passengers:
 *   number of passengers sharing the vehicle
 *
 * Returns:
 *   carbon emissions in kilograms.
 */
function calculateCarbon({
  distanceKm,
  mode,
  passengers = 1,
  emissionFactors = DEFAULT_EMISSION_FACTORS
}) {
  const distance = Number(distanceKm);

  if (!Number.isFinite(distance) || distance < 0) {
    return 0;
  }

  const passengerCount = Math.max(
    1,
    Number(passengers) || 1
  );

  const factor = getEmissionFactor(
    mode,
    emissionFactors
  );

  const carbon = (distance * factor) / passengerCount;

  return Number(carbon.toFixed(4));
}

/**
 * Add calculated carbon to a normalized travel edge.
 *
 * If the edge already contains carbon data, preserve it.
 * Otherwise calculate it from distance + mode.
 */
function enrichEdgeWithCarbon(edge, options = {}) {
  if (!edge) {
    return null;
  }

  const enriched = {
    ...edge
  };

  const existingCarbon = Number(edge.carbon_kg);

  if (
    Number.isFinite(existingCarbon) &&
    existingCarbon >= 0
  ) {
    enriched.carbon_kg = existingCarbon;
    return enriched;
  }

  enriched.carbon_kg = calculateCarbon({
    distanceKm: edge.distance_km,
    mode: edge.mode,
    passengers: options.passengers ?? 1,
    emissionFactors:
      options.emissionFactors ?? DEFAULT_EMISSION_FACTORS
  });

  return enriched;
}

/**
 * Enrich an entire list of travel edges.
 */
function enrichEdgesWithCarbon(edges = [], options = {}) {
  return edges
    .filter(Boolean)
    .map((edge) =>
      enrichEdgeWithCarbon(edge, options)
    );
}

module.exports = {
  DEFAULT_EMISSION_FACTORS,
  normalizeMode,
  getEmissionFactor,
  calculateCarbon,
  enrichEdgeWithCarbon,
  enrichEdgesWithCarbon
};