// routes/health.js - HANDLES: Health check endpoint
// This tells you if the server is running

const express = require('express');
const router = express.Router();

// Health check endpoint
router.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString()
    });
});

module.exports = router;
