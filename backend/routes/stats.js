const express = require('express');
const router = express.Router();
const { getDatabase } = require('../services/database');

// 1. MAIN DASHBOARD STATS
router.get('/', async (req, res) => {
    try {
        const db = getDatabase();

        // A. Basic Counts
        const mainStats = await db.query(`
            SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE has_offer = true) as offers,
                COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) as new_today,
                COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') as new_this_week,
                COUNT(*) FILTER (WHERE ai_enabled = true) as ai_enabled,
                COUNT(*) FILTER (WHERE ai_enabled = false) as ai_disabled,
                COALESCE(SUM(monthly_revenue), 0) as total_monthly_revenue,
                COALESCE(AVG(monthly_revenue), 0) as avg_monthly_revenue
            FROM conversations
        `);

        // B. Submitted Count
        const submittedResult = await db.query(`SELECT COUNT(DISTINCT conversation_id) as count FROM lender_submissions`);

        // C. Goals & Funding
        const goalResult = await db.query(`SELECT value FROM app_settings WHERE key = 'monthly_goal'`);

        const fundedThisMonth = await db.query(`
            SELECT COUNT(*) as deal_count, COALESCE(SUM(funded_amount), 0) as total_funded
            FROM conversations
            WHERE funded_at >= DATE_TRUNC('month', CURRENT_DATE)
        `);

        const fundedLastMonth = await db.query(`
            SELECT COALESCE(SUM(funded_amount), 0) as total_funded
            FROM conversations
            WHERE funded_at >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
              AND funded_at < DATE_TRUNC('month', CURRENT_DATE)
        `);

        // D. Rich Breakdowns
        const stateBreakdown = await db.query(`SELECT state, COUNT(*) as count FROM conversations WHERE state IS NOT NULL GROUP BY state ORDER BY count DESC`);
        const leadSourceBreakdown = await db.query(`SELECT COALESCE(lead_source, 'Unknown') as lead_source, COUNT(*) as count FROM conversations GROUP BY lead_source ORDER BY count DESC`);
        const industryBreakdown = await db.query(`SELECT COALESCE(industry_type, 'Unknown') as industry, COUNT(*) as count FROM conversations GROUP BY industry_type ORDER BY count DESC LIMIT 10`);
        const geoBreakdown = await db.query(`SELECT COALESCE(us_state, business_state, 'Unknown') as region, COUNT(*) as count FROM conversations GROUP BY region ORDER BY count DESC LIMIT 10`);
        const creditBreakdown = await db.query(`SELECT COALESCE(credit_score, 'Unknown') as credit_tier, COUNT(*) as count FROM conversations GROUP BY credit_score ORDER BY count DESC`);
        const fundingBreakdown = await db.query(`SELECT COALESCE(funding_status, 'Unknown') as status, COUNT(*) as count FROM conversations GROUP BY funding_status ORDER BY count DESC`);

        // E. Activity Trend
        const activityTrend = await db.query(`
            SELECT DATE(created_at) as date, COUNT(*) as count
            FROM conversations
            WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
            GROUP BY DATE(created_at)
            ORDER BY date ASC
        `);

        const stats = mainStats.rows[0];

        res.json({
            success: true,
            active: parseInt(stats.total || 0),
            submitted: parseInt(submittedResult.rows[0]?.count || 0),
            offers: parseInt(stats.offers || 0),
            newToday: parseInt(stats.new_today || 0),
            newThisWeek: parseInt(stats.new_this_week || 0),
            aiEnabled: parseInt(stats.ai_enabled || 0),
            aiDisabled: parseInt(stats.ai_disabled || 0),
            totalMonthlyRevenue: parseFloat(stats.total_monthly_revenue || 0),
            avgMonthlyRevenue: parseFloat(stats.avg_monthly_revenue || 0),

            // Critical Goal Data
            monthlyGoal: parseFloat(goalResult.rows[0]?.value || 500000),
            fundedThisMonth: parseFloat(fundedThisMonth.rows[0]?.total_funded || 0),
            dealsClosedThisMonth: parseInt(fundedThisMonth.rows[0]?.deal_count || 0),
            fundedLastMonth: parseFloat(fundedLastMonth.rows[0]?.total_funded || 0),

            // Breakdowns
            stateBreakdown: stateBreakdown.rows,
            leadSourceBreakdown: leadSourceBreakdown.rows,
            industryBreakdown: industryBreakdown.rows,
            geoBreakdown: geoBreakdown.rows,
            creditBreakdown: creditBreakdown.rows,
            fundingBreakdown: fundingBreakdown.rows,
            activityTrend: activityTrend.rows
        });

    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 2. OFFERS LIST
router.get('/offers', async (req, res) => {
    try {
        const db = getDatabase();
        const result = await db.query(`
            SELECT ls.conversation_id, c.business_name, ls.lender_name, ls.offer_amount, ls.factor_rate, ls.last_response_at
            FROM lender_submissions ls
            JOIN conversations c ON c.id = ls.conversation_id
            WHERE ls.status = 'OFFER'
            ORDER BY ls.last_response_at DESC
        `);
        res.json({ success: true, offers: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 3. SUBMITTED LIST
router.get('/submitted', async (req, res) => {
    try {
        const db = getDatabase();
        const result = await db.query(`
            SELECT ls.conversation_id, c.business_name, COUNT(ls.id) as lender_count, MAX(ls.submitted_at) as last_submitted
            FROM lender_submissions ls
            JOIN conversations c ON c.id = ls.conversation_id
            GROUP BY ls.conversation_id, c.business_name
            ORDER BY last_submitted DESC
        `);
        res.json({ success: true, submitted: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
