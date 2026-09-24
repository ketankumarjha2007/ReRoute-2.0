const express = require('express');
const router = express.Router();
const db = require('../db');

// In-memory store for contact submissions to protect read-only APS-09.db
const inMemoryContactMessages = [];

// POST /api/contact
router.post('/', (req, res) => {
  try {
    const { name, email, message } = req.body;

    // Validation
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_NAME', message: 'Please provide a valid name (at least 2 characters).' }
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email.trim())) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_EMAIL', message: 'Please provide a valid email address.' }
      });
    }

    if (!message || typeof message !== 'string' || message.trim().length < 10) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_MESSAGE', message: 'Please provide a message with at least 10 characters.' }
      });
    }

    inMemoryContactMessages.push({
      id: inMemoryContactMessages.length + 1,
      name: name.trim(),
      email: email.trim(),
      message: message.trim(),
      created_at: new Date().toISOString()
    });

    res.json({
      success: true,
      message: 'Message submitted successfully. The ReRoute team has received your inquiry.'
    });
  } catch (error) {
    console.error('Error handling contact submission:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to submit contact message. Please try again later.' }
    });
  }
});

module.exports = router;
