const express = require('express');
const router = express.Router();
const { getDatabase } = require('../services/database');

// GET Goal
router.get('/goal', async (req, res) => {
    try {
        const db = getDatabase();
        const result = await db.query(`SELECT value FROM app_settings WHERE key = 'monthly_goal'`);
        const goal = result.rows[0]?.value || '500000';
        res.json({ success: true, goal: parseFloat(goal) });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// SET Goal
router.post('/goal', async (req, res) => {
    try {
        const { goal } = req.body;
        if (!goal || isNaN(goal)) return res.status(400).json({ success: false, error: 'Invalid goal amount' });

        const db = getDatabase();
        await db.query(`
            INSERT INTO app_settings (key, value, updated_at) VALUES ('monthly_goal', $1, NOW())
            ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()
        `, [goal.toString()]);

        res.json({ success: true, goal: parseFloat(goal) });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// MARK FUNDED
router.post('/conversations/:id/mark-funded', async (req, res) => {
    try {
        const { id } = req.params;
        const { amount } = req.body;

        if (!amount || isNaN(amount)) return res.status(400).json({ success: false, error: 'Invalid amount' });

        const db = getDatabase();
        await db.query(`
            UPDATE conversations
            SET funded_amount = $1, funded_at = NOW(), state = 'FUNDED', current_step = 'funded'
            WHERE id = $2
        `, [parseFloat(amount), id]);

        res.json({ success: true, message: 'Deal marked as funded' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
