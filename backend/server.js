require('dotenv').config();

const express = require('express');
const cors = require('cors');
const db = require('./db');

// Routes
const citiesRoute = require('./routes/cities');
const poisRoute = require('./routes/pois');
const travelRoute = require('./routes/travel');
const optimizeRoute = require('./routes/optimize');
const explainRoute = require('./routes/explain');
const contactRoute = require('./routes/contact');
const aiRoute = require('./routes/ai');

const { generateAiPlan } = require('./ai/aiPlanner');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());


// ======================================================
// HEALTH CHECK
// ======================================================

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'ReRoute Multi-Objective Itinerary Optimizer backend running',
    database: 'connected',
    status: 'healthy'
  });
});


// ======================================================
// MOUNTED API ROUTES
// ======================================================

app.use('/api/cities', citiesRoute);
app.use('/api/pois', poisRoute);
app.use('/api/travel', travelRoute);
app.use('/api/optimize', optimizeRoute);
app.use('/api/explain', explainRoute);
app.use('/api/contact', contactRoute);
app.use('/api/ai', aiRoute);


// ======================================================
// AI — PLAN MY DAY
// ======================================================

app.post('/api/plan-my-day', async (req, res) => {
  try {
    const {
      prompt,
      city_id,
      planner_context
    } = req.body;

    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PROMPT',
          message: 'Prompt text is required'
        }
      });
    }

    const plan = await generateAiPlan(
      prompt,
      city_id,
      planner_context || {}
    );

    res.json(plan);

  } catch (error) {
    console.error(
      'Error in /api/plan-my-day:',
      error
    );

    res.status(500).json({
      success: false,
      error: {
        code: 'AI_PLANNER_ERROR',
        message: error.message
      }
    });
  }
});


// ======================================================
// EVALUATION CASES
// ======================================================

app.get('/api/cases', (req, res) => {
  try {
    const cases = db.prepare(`
      SELECT
        case_id,
        name,
        city_id,
        day_start_time,
        day_end_time,
        reference_cost,
        reference_minutes,
        reference_carbon_kg
      FROM eval_optimizer_cases
    `).all();

    res.json({
      success: true,
      count: cases.length,
      cases
    });

  } catch (err) {
    console.error('GET /api/cases error:', err);

    res.status(500).json({
      success: false,
      error: {
        message: err.message
      }
    });
  }
});


app.get('/api/cases/:case_id', (req, res) => {
  try {
    const c = db.prepare(`
      SELECT *
      FROM eval_optimizer_cases
      WHERE case_id = ?
    `).get(req.params.case_id);

    if (!c) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Case not found'
        }
      });
    }

    res.json({
      success: true,
      case: c
    });

  } catch (err) {
    console.error('GET /api/cases/:case_id error:', err);

    res.status(500).json({
      success: false,
      error: {
        message: err.message
      }
    });
  }
});


// ======================================================
// GLOBAL 404 HANDLER
// ======================================================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.originalUrl} not found.`
    }
  });
});


// ======================================================
// GLOBAL ERROR HANDLER
// ======================================================

app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: err.message
    }
  });
});


// ======================================================
// START SERVER
// ======================================================

app.listen(PORT, () => {
  console.log(
    `🚀 ReRoute Optimizer Server listening on http://localhost:${PORT}`
  );
});