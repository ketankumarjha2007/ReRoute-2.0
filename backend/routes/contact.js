const express = require('express');
const router = express.Router();
const db = require('../db');

// Ensure contact_messages table exists in SQLite
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS contact_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
} catch (e) {
  console.warn('Could not initialize contact_messages table:', e.message);
}

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

    try {
      const stmt = db.prepare('INSERT INTO contact_messages (name, email, message) VALUES (?, ?, ?)');
      stmt.run(name.trim(), email.trim(), message.trim());
    } catch (insertErr) {
      console.warn('Could not persist contact message to SQLite:', insertErr.message);
    }

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
