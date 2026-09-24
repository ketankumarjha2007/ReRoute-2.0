const supabase = require('../supabase');

/**
 * Get travel edges between two exact POIs.
 */
async function getTravelEdges(originPoiId, destinationPoiId) {
    const { data, error } = await supabase
        .from('poi_travel_matrix')
        .select('*')
        .eq('origin_poi_id', originPoiId)
        .eq('dest_poi_id', destinationPoiId);

    if (error) {
        throw new Error(
            `Failed to fetch travel edges: ${error.message}`
        );
    }

    return data || [];
}


/**
 * Get all outgoing travel edges from one POI.
 */
async function getOutgoingTravelEdges(originPoiId) {
    const { data, error } = await supabase
        .from('poi_travel_matrix')
        .select('*')
        .eq('origin_poi_id', originPoiId);

    if (error) {
        throw new Error(
            `Failed to fetch outgoing travel edges: ${error.message}`
        );
    }

    return data || [];
}


/**
 * Get the complete travel matrix for a city.
 */
async function getTravelMatrixForCity(cityId) {
    const { data: pois, error: poiError } = await supabase
        .from('activities_poi')
        .select('poi_id')
        .eq('city_id', cityId);

    if (poiError) {
        throw new Error(
            `Failed to fetch city POIs: ${poiError.message}`
        );
    }

    if (!pois || pois.length === 0) {
        return [];
    }

    const poiIds = pois.map(poi => poi.poi_id);

    const { data, error } = await supabase
        .from('poi_travel_matrix')
        .select('*')
        .in('origin_poi_id', poiIds)
        .in('dest_poi_id', poiIds);

    if (error) {
        throw new Error(
            `Failed to fetch travel matrix: ${error.message}`
        );
    }

    return data || [];
}


module.exports = {
    getTravelEdges,
    getOutgoingTravelEdges,
    getTravelMatrixForCity
};