const express = require('express');
const router = express.Router();

const {
    getTravelEdges,
    getOutgoingTravelEdges,
    getTravelMatrixForCity
} = require('../data/travel');

/**
 * GET /api/travel/:from/:to
 *
 * Returns all available travel edges between two exact POIs.
 */
router.get('/:from/:to', async (req, res) => {
    try {
        const { from, to } = req.params;

        const edges = await getTravelEdges(from, to);

        res.json({
            success: true,
            from,
            to,
            count: edges.length,
            edges
        });

    } catch (error) {
        console.error('GET /api/travel/:from/:to error:', error);

        res.status(500).json({
            success: false,
            error: {
                code: 'TRAVEL_FETCH_FAILED',
                message: error.message
            }
        });
    }
});

/**
 * GET /api/travel/outgoing/:poi_id
 *
 * Returns all outgoing travel edges from a POI.
 */
router.get('/outgoing/:poi_id', async (req, res) => {
    try {
        const edges = await getOutgoingTravelEdges(req.params.poi_id);

        res.json({
            success: true,
            origin_poi_id: req.params.poi_id,
            count: edges.length,
            edges
        });

    } catch (error) {
        console.error('GET /api/travel/outgoing/:poi_id error:', error);

        res.status(500).json({
            success: false,
            error: {
                code: 'OUTGOING_TRAVEL_FETCH_FAILED',
                message: error.message
            }
        });
    }
});

/**
 * GET /api/travel/city/:city_id
 *
 * Returns the complete travel matrix for a city.
 */
router.get('/city/:city_id', async (req, res) => {
    try {
        const edges = await getTravelMatrixForCity(req.params.city_id);

        res.json({
            success: true,
            city_id: req.params.city_id,
            count: edges.length,
            edges
        });

    } catch (error) {
        console.error('GET /api/travel/city/:city_id error:', error);

        res.status(500).json({
            success: false,
            error: {
                code: 'CITY_TRAVEL_FETCH_FAILED',
                message: error.message
            }
        });
    }
});

module.exports = router;