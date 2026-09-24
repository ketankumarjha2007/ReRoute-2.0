const express = require('express');
const router = express.Router();
const { parseIntent } = require('../ai/intentParser');
const { generateExplanation } = require('../ai/explainer');
const { generateAiPlan } = require('../ai/aiPlanner');

// POST /api/explain/parse
router.post('/parse', (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_PROMPT', message: 'Prompt text is required' }
      });
    }

    const result = parseIntent(prompt);
    res.json(result);
  } catch (error) {
    console.error('Error parsing intent:', error);
    res.status(500).json({
      success: false,
      error: { code: 'PARSE_ERROR', message: error.message }
    });
  }
});

// POST /api/explain
router.post('/', (req, res) => {
  try {
    const { plan, weights } = req.body;
    const explanation = generateExplanation(plan, weights);

    res.json({
      success: true,
      explanation
    });
  } catch (error) {
    console.error('Error generating explanation:', error);
    res.status(500).json({
      success: false,
      error: { code: 'EXPLANATION_ERROR', message: error.message }
    });
  }
});

// POST /api/explain/plan-my-day
router.post('/plan-my-day', async (req, res) => {
  try {
    const { prompt, city_id } = req.body;
    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_PROMPT', message: 'Prompt text is required' }
      });
    }

    const plan = await generateAiPlan(prompt, city_id);
    res.json(plan);
  } catch (error) {
    console.error('Error in AI plan my day:', error);
    res.status(500).json({
      success: false,
      error: { code: 'AI_PLANNER_ERROR', message: error.message }
    });
  }
});

module.exports = router;
