require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./db');

const citiesRoute = require('./routes/cities');
const poisRoute = require('./routes/pois');
const optimizeRoute = require('./routes/optimize');
const explainRoute = require('./routes/explain');
const contactRoute = require('./routes/contact');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'ReRoute Multi-Objective Itinerary Optimizer backend running',
    database: 'connected',
    status: 'healthy'
  });
});

// Mounted routes
app.use('/api/cities', citiesRoute);
app.use('/api/pois', poisRoute);
app.use('/api/optimize', optimizeRoute);
app.use('/api/explain', explainRoute);
app.use('/api/contact', contactRoute);

// Eval Cases route
app.get('/api/cases', (req, res) => {
  try {
    const cases = db.prepare('SELECT case_id, name, city_id, day_start_time, day_end_time, reference_cost, reference_minutes, reference_carbon_kg FROM eval_optimizer_cases').all();
    res.json({ success: true, count: cases.length, cases });
  } catch (err) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

app.get('/api/cases/:case_id', (req, res) => {
  try {
    const c = db.prepare('SELECT * FROM eval_optimizer_cases WHERE case_id = ?').get(req.params.case_id);
    if (!c) return res.status(404).json({ success: false, error: { message: 'Case not found' } });
    res.json({ success: true, case: c });
  } catch (err) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

// Travel edge lookup
app.get('/api/travel/:from/:to', (req, res) => {
  try {
    const edges = db.prepare('SELECT * FROM poi_travel_matrix WHERE origin_poi_id = ? AND dest_poi_id = ?').all(req.params.from, req.params.to);
    res.json({ success: true, edges });
  } catch (err) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

// Global 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.originalUrl} not found.` }
  });
});

// Global Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_SERVER_ERROR', message: err.message }
  });
});

app.listen(PORT, () => {
  console.log(`🚀 ReRoute Optimizer Server listening on http://localhost:${PORT}`);
});