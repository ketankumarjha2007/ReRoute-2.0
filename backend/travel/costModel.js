/**
 * Travel Cost Model
 *
 * Converts route distance into an estimated transport cost.
 *
 * The routing provider supplies:
 *   - distance
 *   - duration
 *
 * This module supplies:
 *   - estimated monetary cost
 *
 * Keeping this separate lets us replace the pricing model later
 * with live taxi/public-transport pricing.
 */

const DEFAULT_COST_RULES = {
    walk: {
        base_cents: 0,
        per_km_cents: 0
    },

    bicycle: {
        base_cents: 0,
        per_km_cents: 0
    },

    bike: {
        base_cents: 1000,
        per_km_cents: 800
    },

    motorcycle: {
        base_cents: 1000,
        per_km_cents: 800
    },

    scooter: {
        base_cents: 1000,
        per_km_cents: 700
    },

    cab: {
        base_cents: 5000,
        per_km_cents: 1800
    },

    taxi: {
        base_cents: 5000,
        per_km_cents: 1800
    },

    car: {
        base_cents: 5000,
        per_km_cents: 1800
    },

    bus: {
        base_cents: 1500,
        per_km_cents: 300
    },

    train: {
        base_cents: 1000,
        per_km_cents: 200
    },

    metro: {
        base_cents: 1000,
        per_km_cents: 200
    }
};

/**
 * Normalize transport mode.
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
 * Get pricing rules for a transport mode.
 */
function getCostRule(
    mode,
    rules = DEFAULT_COST_RULES
) {
    const normalizedMode = normalizeMode(mode);

    if (!normalizedMode) {
        return null;
    }

    return rules[normalizedMode] || null;
}

/**
 * Calculate estimated travel cost.
 *
 * Returns INR cents.
 *
 * Example:
 *
 * cab
 * 5 km
 *
 * = base fare + distance fare
 */
function calculateTravelCost({
    distanceKm,
    mode,
    rules = DEFAULT_COST_RULES
}) {
    const distance = Number(distanceKm);

    if (!Number.isFinite(distance) || distance < 0) {
        return 0;
    }

    const rule = getCostRule(mode, rules);

    if (!rule) {
        return null;
    }

    const baseCents = Number(rule.base_cents) || 0;

    const perKmCents =
        Number(rule.per_km_cents) || 0;

    const total =
        baseCents +
        distance * perKmCents;

    return Math.round(total);
}

/**
 * Add calculated cost to a travel edge.
 *
 * Existing database cost is preserved.
 * A calculated cost is only used when cost is missing.
 */
function enrichEdgeWithCost(
    edge,
    options = {}
) {
    if (!edge) {
        return null;
    }

    const enriched = {
        ...edge
    };

    const hasExistingCost =
        edge.cost_cents !== null &&
        edge.cost_cents !== undefined &&
        edge.cost_cents !== "";

    if (hasExistingCost) {
        const existingCost =
            Number(edge.cost_cents);

        if (
            Number.isFinite(existingCost) &&
            existingCost >= 0
        ) {
            enriched.cost_cents = existingCost;

            return enriched;
        }
    }

    enriched.cost_cents =
        calculateTravelCost({
            distanceKm: edge.distance_km,
            mode: edge.mode,
            rules:
                options.rules ||
                DEFAULT_COST_RULES
        });

    return enriched;
}

/**
 * Enrich a list of edges.
 */
function enrichEdgesWithCost(
    edges = [],
    options = {}
) {
    return edges
        .filter(Boolean)
        .map((edge) =>
            enrichEdgeWithCost(edge, options)
        );
}

module.exports = {
    DEFAULT_COST_RULES,
    normalizeMode,
    getCostRule,
    calculateTravelCost,
    enrichEdgeWithCost,
    enrichEdgesWithCost
};