const supabase = require("../supabase");

/**
 * Matrix Provider
 *
 * Reads already-known travel edges from Supabase.
 *
 * This layer does NOT calculate routes.
 * It only answers:
 *
 * "Do we already know how to travel from A -> B?"
 *
 * The Travel Resolver will later decide:
 * - use cached matrix data
 * - or ask a real routing provider
 */

function normalizeMoneyToCents(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "number") {
    return Math.round(value * 100);
  }

  const cleaned = String(value)
    .replace(/[^0-9.-]/g, "")
    .trim();

  if (!cleaned) {
    return null;
  }

  const numeric = Number(cleaned);

  if (!Number.isFinite(numeric)) {
    return null;
  }

  return Math.round(numeric * 100);
}

function normalizeEdge(row) {
  return {
    origin_poi_id: row.origin_poi_id,
    dest_poi_id: row.dest_poi_id,

    mode: row.mode || null,

    minutes:
      row.duration_minutes !== undefined
        ? Number(row.duration_minutes)
        : row.minutes !== undefined
          ? Number(row.minutes)
          : null,

    distance_km:
      row.distance_km !== undefined
        ? Number(row.distance_km)
        : row.distance !== undefined
          ? Number(row.distance)
          : null,

    cost_cents:
      row.cost_cents !== undefined
        ? Number(row.cost_cents)
        : normalizeMoneyToCents(row.cost),

    carbon_kg:
      row.carbon_kg !== undefined
        ? Number(row.carbon_kg)
        : row.carbon !== undefined
          ? Number(row.carbon)
          : null
  };
}

/**
 * Get all cached travel edges between two POIs.
 */
async function getCachedEdges(originPoiId, destPoiId) {
  if (!originPoiId || !destPoiId) {
    return [];
  }

  const { data, error } = await supabase
    .from("poi_travel_matrix")
    .select("*")
    .eq("origin_poi_id", originPoiId)
    .eq("dest_poi_id", destPoiId);

  if (error) {
    throw new Error(
      `Matrix lookup failed: ${error.message}`
    );
  }

  return (data || []).map(normalizeEdge);
}

/**
 * Get all cached outgoing edges from one POI.
 */
async function getCachedOutgoingEdges(originPoiId) {
  if (!originPoiId) {
    return [];
  }

  const { data, error } = await supabase
    .from("poi_travel_matrix")
    .select("*")
    .eq("origin_poi_id", originPoiId);

  if (error) {
    throw new Error(
      `Matrix outgoing lookup failed: ${error.message}`
    );
  }

  return (data || []).map(normalizeEdge);
}

/**
 * Get cached travel edges for a set of POIs.
 *
 * Only edges where BOTH origin and destination belong
 * to the supplied candidate set are returned.
 */
async function getCachedMatrix(poiIds = []) {
  const ids = [
    ...new Set(
      (Array.isArray(poiIds) ? poiIds : [])
        .filter(Boolean)
        .map(String)
    )
  ];

  if (ids.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("poi_travel_matrix")
    .select("*")
    .in("origin_poi_id", ids)
    .in("dest_poi_id", ids);

  if (error) {
    throw new Error(
      `Matrix bulk lookup failed: ${error.message}`
    );
  }

  return (data || []).map(normalizeEdge);
}

/**
 * Convert a list of edges into the same Map structure
 * used by the existing optimizer.
 *
 * Key:
 *   origin_poi_id_dest_poi_id
 *
 * Value:
 *   array of transport options
 */
function buildEdgeMap(edges = []) {
  const edgeMap = new Map();

  for (const edge of edges) {
    if (!edge.origin_poi_id || !edge.dest_poi_id) {
      continue;
    }

    const key = `${edge.origin_poi_id}_${edge.dest_poi_id}`;

    if (!edgeMap.has(key)) {
      edgeMap.set(key, []);
    }

    edgeMap.get(key).push(edge);
  }

  return edgeMap;
}

/**
 * Get a complete cached graph and return it
 * in the format expected by the optimizer.
 */
async function getCachedEdgeMap(poiIds = []) {
  const edges = await getCachedMatrix(poiIds);
  return buildEdgeMap(edges);
}

module.exports = {
  normalizeMoneyToCents,
  normalizeEdge,
  getCachedEdges,
  getCachedOutgoingEdges,
  getCachedMatrix,
  buildEdgeMap,
  getCachedEdgeMap
};