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

// GET learned patterns awaiting review
router.get('/learned-patterns', requireAuth, requireRole('admin'), async (req, res) => {
    try {
        const db = getDatabase();

        const result = await db.query(`
            SELECT 
                lead_message,
                human_response,
                COUNT(*) as times,
                MAX(lead_grade) as lead_grade,
                AVG(monthly_revenue) as avg_revenue
            FROM response_training
            WHERE response_source = 'HUMAN_MANUAL'
              AND human_response IS NOT NULL
              AND LENGTH(human_response) > 10
            GROUP BY lead_message, human_response
            HAVING COUNT(*) >= 2
            ORDER BY COUNT(*) DESC
            LIMIT 20
        `);

        res.json({ success: true, patterns: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST approve a pattern (adds to MD)
router.post('/approve-pattern', requireAuth, requireRole('admin'), async (req, res) => {
    try {
        const { leadMessage, humanResponse } = req.body;
        const fs = require('fs');
        const path = require('path');

        const mdPath = path.join(__dirname, '../prompts/dan_torres.md');
        const currentContent = fs.readFileSync(mdPath, 'utf8');

        if (!currentContent.includes('## LEARNED PATTERNS')) {
            fs.appendFileSync(mdPath, '\n\n## LEARNED PATTERNS (auto-approved)\n');
        }

        const newPattern = `\n- When lead says "${leadMessage.substring(0, 50)}..." → "${humanResponse.substring(0, 80)}..."`;
        fs.appendFileSync(mdPath, newPattern);

        res.json({ success: true, message: 'Pattern added to persona' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET current learned patterns from MD
router.get('/current-patterns', requireAuth, requireRole('admin'), async (req, res) => {
    try {
        const fs = require('fs');
        const path = require('path');

        const mdPath = path.join(__dirname, '../prompts/dan_torres.md');
        const content = fs.readFileSync(mdPath, 'utf8');

        const match = content.match(/## LEARNED PATTERNS[\s\S]*$/);
        const learned = match ? match[0] : 'No learned patterns yet';

        res.json({ success: true, content: learned });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// DELETE a pattern from MD
router.post('/remove-pattern', requireAuth, requireRole('admin'), async (req, res) => {
    try {
        const { pattern } = req.body;
        const fs = require('fs');
        const path = require('path');

        const mdPath = path.join(__dirname, '../prompts/dan_torres.md');
        let content = fs.readFileSync(mdPath, 'utf8');

        content = content.split('\n').filter(line => !line.includes(pattern)).join('\n');
        fs.writeFileSync(mdPath, content);

        res.json({ success: true, message: 'Pattern removed' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
