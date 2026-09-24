const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/cities
router.get('/', (req, res) => {
  try {
    const cities = db.prepare(`
      SELECT
        city_id,
        name,
        state,
        country_id,
        country_code,
        lat,
        lng,
        timezone,
        region,
        population,
        season_profile,
        peak_months,
        primary_language,
        description,
        status
      FROM cities
      WHERE status = 'active'
      ORDER BY name ASC
    `).all();

    res.json({
      success: true,
      count: cities.length,
      cities
    });
  } catch (error) {
    console.error('Error fetching cities:', error);
    res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: error.message }
    });
  }
});

module.exports = router;
