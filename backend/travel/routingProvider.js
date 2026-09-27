const {
  calculateCarbon
} = require("./carbonModel");

/**
 * Routing Provider
 *
 * Responsible for obtaining a real-world route between
 * two geographic coordinates.
 *
 * The rest of ReRoute should NOT call OSRM directly.
 *
 * Architecture:
 *
 * Optimizer
 *    ↓
 * Travel Resolver
 *    ↓
 * Routing Provider
 *    ↓
 * OSRM
 *
 * This abstraction allows us to replace OSRM later without
 * changing the optimizer.
 */

const DEFAULT_OSRM_BASE_URL =
  process.env.OSRM_BASE_URL ||
  "https://router.project-osrm.org";

/**
 * Validate a coordinate.
 */
function validateCoordinate(coordinate, name) {
  if (!coordinate) {
    throw new Error(`${name} is required`);
  }

  const lat = Number(coordinate.lat);
  const lng = Number(coordinate.lng);

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng)
  ) {
    throw new Error(
      `${name} must contain valid lat/lng coordinates`
    );
  }

  if (lat < -90 || lat > 90) {
    throw new Error(`${name}.lat is outside valid range`);
  }

  if (lng < -180 || lng > 180) {
    throw new Error(`${name}.lng is outside valid range`);
  }

  return {
    lat,
    lng
  };
}

/**
 * Map ReRoute transport modes to OSRM profiles.
 *
 * OSRM's standard public server currently exposes the
 * driving profile. Other profiles can be supported later
 * through a different routing backend.
 */
function getOsrmProfile(mode) {
  const normalized = String(mode || "")
    .trim()
    .toLowerCase();

  switch (normalized) {
    case "cab":
    case "taxi":
    case "car":
    case "bike":
    case "motorcycle":
    case "scooter":
    case "driving":
      return "driving";

    default:
      return "driving";
  }
}

/**
 * Build an OSRM route URL.
 */
function buildOsrmUrl({
  from,
  to,
  mode = "cab",
  baseUrl = DEFAULT_OSRM_BASE_URL
}) {
  const start = validateCoordinate(from, "from");
  const end = validateCoordinate(to, "to");

  const profile = getOsrmProfile(mode);

  const coordinates =
    `${start.lng},${start.lat};` +
    `${end.lng},${end.lat}`;

  const url =
    `${baseUrl.replace(/\/$/, "")}` +
    `/route/v1/${profile}/${coordinates}` +
    `?overview=false&steps=false`;

  return url;
}

/**
 * Request a route from OSRM.
 */
async function routeWithOsrm({
  from,
  to,
  mode = "cab",
  baseUrl = DEFAULT_OSRM_BASE_URL,
  passengers = 1,
  emissionFactors
}) {
  const url = buildOsrmUrl({
    from,
    to,
    mode,
    baseUrl
  });

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Routing provider returned HTTP ${response.status}`
    );
  }

  const payload = await response.json();

  if (
    !payload ||
    payload.code !== "Ok" ||
    !Array.isArray(payload.routes) ||
    payload.routes.length === 0
  ) {
    throw new Error(
      `Routing provider returned no usable route`
    );
  }

  const route = payload.routes[0];

  const distanceKm =
    Number(route.distance || 0) / 1000;

  const minutes =
    Number(route.duration || 0) / 60;

  const carbonKg = calculateCarbon({
    distanceKm,
    mode,
    passengers,
    emissionFactors
  });

  return {
    origin: {
      lat: Number(from.lat),
      lng: Number(from.lng)
    },

    destination: {
      lat: Number(to.lat),
      lng: Number(to.lng)
    },

    mode,

    minutes: Number(minutes.toFixed(2)),

    distance_km: Number(
      distanceKm.toFixed(3)
    ),

    carbon_kg: carbonKg,

    provider: "osrm",

    source: "routing_provider"
  };
}

/**
 * Generic routing function.
 *
 * Keep this as the public interface used by the
 * Travel Resolver.
 */
async function getRoute(options = {}) {
  return routeWithOsrm(options);
}

module.exports = {
  DEFAULT_OSRM_BASE_URL,
  validateCoordinate,
  getOsrmProfile,
  buildOsrmUrl,
  routeWithOsrm,
  getRoute
};