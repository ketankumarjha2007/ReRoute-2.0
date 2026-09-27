const express = require('express');
const router = express.Router();

const {
  getAiStatus,
  testAiConnection
} = require('../ai/aiClient');

const { generateAiPlan } = require('../ai/aiPlanner');

// GET /api/ai/status
router.get('/status', (req, res) => {
  try {
    const status = getAiStatus();

    res.json(status);
  } catch (err) {
    console.error('Error fetching AI status:', err);

    res.status(500).json({
      success: false,
      error: {
        code: 'AI_STATUS_ERROR',
        message: err.message
      }
    });
  }
});

// POST /api/ai/test
router.post('/test', async (req, res) => {
  try {
    const testResult = await testAiConnection();

    if (!testResult.success) {
      return res.status(502).json(testResult);
    }

    res.json(testResult);
  } catch (err) {
    console.error('Error testing AI model:', err);

    res.status(500).json({
      success: false,
      error: {
        code: 'AI_TEST_ERROR',
        message: err.message
      }
    });
  }
});

// POST /api/ai/plan
router.post('/plan', async (req, res) => {
  try {
    const {
      prompt,
      city_id
    } = req.body || {};

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'prompt is required.'
        }
      });
    }

    const plan = await generateAiPlan(
      prompt.trim(),
      city_id || null
    );

    if (!plan.success) {
      return res.status(400).json(plan);
    }

    return res.json(plan);
  } catch (err) {
    console.error('Error generating AI plan:', err);

    return res.status(500).json({
      success: false,
      error: {
        code: 'AI_PLAN_ERROR',
        message: err.message
      }
    });
  }
});

module.exports = router;
