// routes/strategies.js
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { getDatabase } = require('../services/database');

// GET strategy for a conversation
router.get('/:conversationId', requireAuth, async (req, res) => {
    try {
        const db = getDatabase();
        const result = await db.query(`
            SELECT * FROM lead_strategy 
            WHERE conversation_id = $1 
            ORDER BY created_at DESC 
            LIMIT 1
        `, [req.params.conversationId]);

        if (result.rows.length === 0) {
            return res.json({ success: true, strategy: null });
        }

        res.json({ success: true, strategy: result.rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET scenarios for a conversation
router.get('/:conversationId/scenarios', requireAuth, async (req, res) => {
    try {
        const db = getDatabase();
        const result = await db.query(`
            SELECT * FROM strategy_scenarios 
            WHERE conversation_id = $1 
            ORDER BY 
                CASE tier 
                    WHEN 'conservative' THEN 1 
                    WHEN 'moderate' THEN 2 
                    WHEN 'aggressive' THEN 3 
                END,
                funding_amount ASC
        `, [req.params.conversationId]);

        res.json({ success: true, scenarios: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
