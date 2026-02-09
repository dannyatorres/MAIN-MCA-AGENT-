const express = require('express');
const router = express.Router();
const { getDatabase } = require('../services/database');
const { requireRole } = require('../middleware/auth');
const { generateDailyReport } = require('../services/dailyAgent');

// Get all reports - ADMIN ONLY
router.get('/', requireRole('admin'), async (req, res) => {
    try {
        const db = getDatabase();
        const result = await db.query(`
            SELECT id, date, stats, created_at 
            FROM daily_reports 
            ORDER BY date DESC 
            LIMIT 30
        `);
        res.json({ success: true, reports: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Get single report
router.get('/:date', requireRole('admin'), async (req, res) => {
    try {
        const db = getDatabase();
        const result = await db.query(
            'SELECT * FROM daily_reports WHERE date = $1',
            [req.params.date]
        );
        if (result.rows.length === 0) {
            return res.json({ success: false, message: 'No report for this date' });
        }
        res.json({ success: true, report: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Generate report on demand - ADMIN ONLY
router.post('/generate', requireRole('admin'), async (req, res) => {
    try {
        const date = req.body.date || new Date().toISOString().split('T')[0];
        res.json({ success: true, message: 'Report generation started', date });

        // Fire and forget
        generateDailyReport(date)
            .then(() => console.log(`✅ Daily report generated for ${date}`))
            .catch(err => console.error(`❌ Daily report failed: ${err.message}`));
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
