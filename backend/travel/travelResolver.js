const {
  getCachedEdges
} = require("./matrixProvider");

const {
  getRoute
} = require("./routingProvider");

const {
  enrichEdgeWithCarbon
} = require("./carbonModel");

const {
  enrichEdgeWithCost
} = require("./costModel");

/**
 * Travel Resolver
 *
 * Resolution order:
 *
 * 1. Existing matrix/cache
 * 2. Real routing provider
 *
 * Every returned edge is normalized so the optimizer can
 * work with:
 *
 * - time
 * - distance
 * - cost
 * - carbon
 * - transport mode
 */

function selectCachedEdge(
  edges = [],
  allowedModes = []
) {
  if (!edges.length) {
    return null;
  }

  const normalizedAllowedModes =
    allowedModes.length > 0
      ? new Set(
          allowedModes.map((mode) =>
            String(mode).trim().toLowerCase()
          )
        )
      : null;

  const usable = edges.filter((edge) => {
    if (!edge.mode) {
      return false;
    }

    if (!normalizedAllowedModes) {
      return true;
    }

    return normalizedAllowedModes.has(
      String(edge.mode).trim().toLowerCase()
    );
  });

  if (!usable.length) {
    return null;
  }

  return [...usable].sort((a, b) => {
    const aMinutes = Number(a.minutes ?? Infinity);
    const bMinutes = Number(b.minutes ?? Infinity);

    if (aMinutes !== bMinutes) {
      return aMinutes - bMinutes;
    }

    const aCost = Number(a.cost_cents ?? Infinity);
    const bCost = Number(b.cost_cents ?? Infinity);

    return aCost - bCost;
  })[0];
}

/**
 * Enrich an edge with all calculated objectives.
 */
function normalizeTravelEdge(
  edge,
  options = {}
) {
  let normalized = {
    ...edge
  };

  normalized =
    enrichEdgeWithCost(
      normalized,
      {
        rules: options.costRules
      }
    );

  normalized =
    enrichEdgeWithCarbon(
      normalized,
      {
        passengers:
          options.passengers ?? 1,

        emissionFactors:
          options.emissionFactors
      }
    );

  return normalized;
}

/**
 * Resolve travel between two POIs.
 */
async function resolveTravel({
  fromPoi,
  toPoi,
  allowedModes = [],
  passengers = 1,
  costRules,
  emissionFactors
}) {
  if (!fromPoi || !toPoi) {
    throw new Error(
      "resolveTravel requires fromPoi and toPoi"
    );
  }

  if (!fromPoi.poi_id || !toPoi.poi_id) {
    throw new Error(
      "Both POIs must contain poi_id"
    );
  }

  /**
   * -------------------------------------------------------
   * STEP 1 — MATRIX / DATABASE
   * -------------------------------------------------------
   */

  const cachedEdges =
    await getCachedEdges(
      fromPoi.poi_id,
      toPoi.poi_id
    );

  const cachedEdge =
    selectCachedEdge(
      cachedEdges,
      allowedModes
    );

  if (cachedEdge) {
    const normalized =
      normalizeTravelEdge(
        cachedEdge,
        {
          passengers,
          costRules,
          emissionFactors
        }
      );

    return {
      ...normalized,

      origin_poi_id:
        fromPoi.poi_id,

      dest_poi_id:
        toPoi.poi_id,

      source: "matrix",
      cached: true
    };
  }

  /**
   * -------------------------------------------------------
   * STEP 2 — REAL ROUTING
   * -------------------------------------------------------
   */

  if (
    fromPoi.lat === undefined ||
    fromPoi.lng === undefined ||
    toPoi.lat === undefined ||
    toPoi.lng === undefined
  ) {
    throw new Error(
      "POIs must contain lat/lng coordinates for real routing"
    );
  }

  const modes =
    allowedModes.length > 0
      ? allowedModes
      : ["cab"];

  const routingErrors = [];

  for (const mode of modes) {
    try {
      const route =
        await getRoute({
          from: {
            lat: fromPoi.lat,
            lng: fromPoi.lng
          },

          to: {
            lat: toPoi.lat,
            lng: toPoi.lng
          },

          mode,

          passengers,

          emissionFactors
        });

      const normalized =
        normalizeTravelEdge(
          {
            origin_poi_id:
              fromPoi.poi_id,

            dest_poi_id:
              toPoi.poi_id,

            mode:
              route.mode,

            minutes:
              route.minutes,

            distance_km:
              route.distance_km,

            cost_cents:
              null,

            carbon_kg:
              route.carbon_kg,

            provider:
              route.provider,

            source:
              route.source
          },
          {
            passengers,
            costRules,
            emissionFactors
          }
        );

      return {
        ...normalized,

        origin_poi_id:
          fromPoi.poi_id,

        dest_poi_id:
          toPoi.poi_id,

        provider:
          route.provider,

        source:
          route.source,

        cached: false
      };
    } catch (error) {
      routingErrors.push({
        mode,
        message: error.message
      });
    }
  }

  const error = new Error(
    `No travel route could be resolved from ` +
    `${fromPoi.poi_id} to ${toPoi.poi_id}`
  );

  error.details = {
    fromPoiId:
      fromPoi.poi_id,

    toPoiId:
      toPoi.poi_id,

    attemptedModes:
      modes,

    routingErrors
  };

  throw error;
}

/**
 * Resolve multiple travel pairs sequentially.
 */
async function resolveTravelPairs(
  pairs = [],
  options = {}
) {
  const results = [];

  for (const pair of pairs) {
    const result =
      await resolveTravel({
        ...options,

        fromPoi:
          pair.fromPoi,

        toPoi:
          pair.toPoi,

        allowedModes:
          pair.allowedModes ??
          options.allowedModes ??
          []
      });

    results.push(result);
  }

  return results;
}

module.exports = {
  selectCachedEdge,
  normalizeTravelEdge,
  resolveTravel,
  resolveTravelPairs
};