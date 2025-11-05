// routes/health.js - HANDLES: Health check endpoint and stats
// This tells you if the server is running

const express = require('express');
const router = express.Router();
const { getDatabase } = require('../services/database');

// Health check endpoint
router.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString()
    });
});

// Stats endpoint
router.get('/stats', async (req, res) => {
    try {
        const db = getDatabase();

        // Get total conversations
        const totalResult = await db.query('SELECT COUNT(*) as count FROM conversations');
        const totalConversations = parseInt(totalResult.rows[0].count) || 0;

        // Get conversations by state
        const stateResult = await db.query(`
            SELECT state, COUNT(*) as count
            FROM conversations
            GROUP BY state
        `);

        const stateBreakdown = {};
        stateResult.rows.forEach(row => {
            stateBreakdown[row.state || 'UNKNOWN'] = parseInt(row.count) || 0;
        });

        // Get recent activity count (last 7 days)
        const recentResult = await db.query(`
            SELECT COUNT(*) as count
            FROM conversations
            WHERE last_activity > NOW() - INTERVAL '7 days'
        `);
        const recentActivity = parseInt(recentResult.rows[0].count) || 0;

        // Return valid JSON response
        res.json({
            totalConversations: totalConversations,
            stateBreakdown: stateBreakdown,
            recentActivity: recentActivity,
            newLeads: stateBreakdown['NEW'] || 0,
            qualified: stateBreakdown['QUALIFIED'] || 0,
            funded: stateBreakdown['FUNDED'] || 0
        });

    } catch (error) {
        console.error('Stats endpoint error:', error);
        // Always return valid JSON even on error
        res.json({
            totalConversations: 0,
            stateBreakdown: {},
            recentActivity: 0,
            newLeads: 0,
            qualified: 0,
            funded: 0,
            error: true
        });
    }
});

module.exports = router;
