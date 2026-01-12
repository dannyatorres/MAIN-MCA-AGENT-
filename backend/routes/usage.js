// routes/usage.js
const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { getDatabase } = require('../services/database');
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

// Breakdown by service/model
router.get('/breakdown', requireAuth, requireRole('admin'), async (req, res) => {
    try {
        const { start, end } = req.query;
        const startDate = start || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
        const endDate = end || new Date().toISOString();

        const db = getDatabase();
        const result = await db.query(`
            SELECT 
                u.name as user_name,
                u.email,
                ul.user_id,
                ul.service,
                ul.model,
                ul.usage_type,
                COUNT(*) as calls,
                SUM(ul.input_tokens) as input_tokens,
                SUM(ul.output_tokens) as output_tokens,
                SUM(ul.total_tokens) as total_tokens,
                SUM(ul.segments) as segments,
                SUM(ul.cost_actual) as cost_actual,
                SUM(ul.cost_billable) as cost_billable
            FROM usage_logs ul
            LEFT JOIN users u ON ul.user_id = u.id
            WHERE ul.created_at >= $1 AND ul.created_at < $2
            GROUP BY u.name, u.email, ul.user_id, ul.service, ul.model, ul.usage_type
            ORDER BY cost_billable DESC
        `, [startDate, endDate]);

        res.json({ success: true, breakdown: result.rows });
    } catch (error) {
        console.error('Error fetching usage breakdown:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get pricing info
router.get('/pricing', requireAuth, requireRole('admin'), (req, res) => {
    res.json({ success: true, costs: COSTS, markup: MARKUP });
});

// Daily trends for charts
router.get('/daily-trends', requireAuth, requireRole('admin'), async (req, res) => {
    try {
        const { start, end } = req.query;
        const startDate = start || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const endDate = end || new Date().toISOString();

        const db = getDatabase();
        const result = await db.query(`
            SELECT 
                DATE(created_at) as date,
                COUNT(*) as calls,
                SUM(total_tokens) as tokens,
                SUM(cost_actual) as cost,
                SUM(cost_billable) as billable
            FROM usage_logs
            WHERE created_at >= $1 AND created_at < $2
            GROUP BY DATE(created_at)
            ORDER BY date ASC
        `, [startDate, endDate]);

        res.json({ success: true, trends: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Service breakdown for pie chart
router.get('/by-service', requireAuth, requireRole('admin'), async (req, res) => {
    try {
        const { start, end } = req.query;
        const startDate = start || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
        const endDate = end || new Date().toISOString();

        const db = getDatabase();
        const result = await db.query(`
            SELECT 
                service,
                COUNT(*) as calls,
                SUM(cost_actual) as cost,
                SUM(cost_billable) as billable
            FROM usage_logs
            WHERE created_at >= $1 AND created_at < $2
            GROUP BY service
            ORDER BY billable DESC
        `, [startDate, endDate]);

        res.json({ success: true, services: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
