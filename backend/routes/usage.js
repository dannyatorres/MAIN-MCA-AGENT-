// routes/usage.js
const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { getUserUsageSummary, getAllUsageSummary, getDetailedUsage, COSTS, MARKUP } = require('../services/usageTracker');

// Admin: See all users' usage
router.get('/summary', requireAuth, requireRole('admin'), async (req, res) => {
    try {
        const { start, end } = req.query;
        const startDate = start || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
        const endDate = end || new Date().toISOString();

        const summary = await getAllUsageSummary(startDate, endDate);

        // Calculate totals
        const totals = summary.reduce((acc, row) => ({
            totalCalls: acc.totalCalls + parseInt(row.total_calls || 0),
            totalTokens: acc.totalTokens + parseInt(row.total_tokens || 0),
            totalSMS: acc.totalSMS + parseInt(row.total_sms_segments || 0),
            totalCostActual: acc.totalCostActual + parseFloat(row.total_cost_actual || 0),
            totalCostBillable: acc.totalCostBillable + parseFloat(row.total_cost_billable || 0)
        }), { totalCalls: 0, totalTokens: 0, totalSMS: 0, totalCostActual: 0, totalCostBillable: 0 });

        res.json({ success: true, summary, totals, startDate, endDate });
    } catch (error) {
        console.error('Error fetching usage summary:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Admin: See detailed logs
router.get('/detailed', requireAuth, requireRole('admin'), async (req, res) => {
    try {
        const { start, end, userId } = req.query;
        const startDate = start || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
        const endDate = end || new Date().toISOString();

        const logs = await getDetailedUsage(startDate, endDate, userId || null);
        res.json({ success: true, logs });
    } catch (error) {
        console.error('Error fetching detailed usage:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// User: See own usage
router.get('/my-usage', requireAuth, async (req, res) => {
    try {
        const { start, end } = req.query;
        const startDate = start || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
        const endDate = end || new Date().toISOString();

        const summary = await getUserUsageSummary(req.user.id, startDate, endDate);
        res.json({ success: true, summary });
    } catch (error) {
        console.error('Error fetching user usage:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get pricing info
router.get('/pricing', requireAuth, requireRole('admin'), (req, res) => {
    res.json({ success: true, costs: COSTS, markup: MARKUP });
});

module.exports = router;
