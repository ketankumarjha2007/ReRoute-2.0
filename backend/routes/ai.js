const express = require('express');
const router = express.Router();
const { getAiStatus, testAiConnection } = require('../ai/aiClient');

// GET /api/ai/status
router.get('/status', (req, res) => {
  try {
    const status = getAiStatus();
    res.json(status);
  } catch (err) {
    console.error('Error fetching AI status:', err);
    res.status(500).json({
      success: false,
      error: { code: 'AI_STATUS_ERROR', message: err.message }
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
      error: { code: 'AI_TEST_ERROR', message: err.message }
    });
  }
});

module.exports = router;
