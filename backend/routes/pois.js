const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/pois?city_id=...
router.get('/', (req, res) => {
  try {
    const { city_id, category } = req.query;

    if (!city_id) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_CITY_ID', message: 'city_id query parameter is required' }
      });
    }

    let query = `
      SELECT
        p.poi_id,
        p.city_id,
        p.name,
        p.category_id,
        p.poi_category,
        p.lat,
        p.lng,
        p.typical_duration_minutes,
        p.entry_cost,
        p.currency,
        p.carbon_kg,
        p.popularity_score,
        p.value_score,
        p.opens_at,
        p.closes_at,
        p.closed_days,
        p.best_season,
        p.tags,
        p.description,
        p.status
      FROM activities_poi p
      WHERE p.city_id = ? AND p.status = 'active'
    `;

    const params = [city_id];

    if (category) {
      query += ` AND p.poi_category = ?`;
      params.push(category);
    }

    query += ` ORDER BY p.popularity_score DESC, p.value_score DESC`;

    const pois = db.prepare(query).all(...params);

    res.json({
      success: true,
      count: pois.length,
      pois
    });
  } catch (error) {
    console.error('Error fetching POIs:', error);
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: error.message }
    });
  }
});

// GET /api/pois/:poi_id
router.get('/:poi_id', (req, res) => {
  try {
    const { poi_id } = req.params;
    const poi = db.prepare('SELECT * FROM activities_poi WHERE poi_id = ?').get(poi_id);

    if (!poi) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `POI ${poi_id} not found.` }
      });
    }

    res.json({
      success: true,
      poi
    });
  } catch (error) {
    console.error('Error fetching POI:', error);
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: error.message }
    });
  }
});

module.exports = router;
