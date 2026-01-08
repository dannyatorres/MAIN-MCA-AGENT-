const express = require('express');
const router = express.Router();
const { getDatabase } = require('../services/database');
const { getConversationAccessClause } = require('../middleware/dataAccess');

// 1. MAIN DASHBOARD STATS
router.get('/', async (req, res) => {
    try {
        const db = getDatabase();
        const access = getConversationAccessClause(req.user, 'c');

        // A. Basic Counts
        const mainStats = await db.query(`
            SELECT
                COUNT(*) as total,
                (SELECT COUNT(DISTINCT ls.conversation_id)
                 FROM lender_submissions ls
                 JOIN conversations c ON c.id = ls.conversation_id
                 WHERE ls.status = 'OFFER' AND ${access.clause}) as offers,
                COUNT(*) FILTER (WHERE c.created_at >= CURRENT_DATE) as new_today,
                COUNT(*) FILTER (WHERE c.created_at >= CURRENT_DATE - INTERVAL '7 days') as new_this_week,
                COUNT(*) FILTER (WHERE c.ai_enabled = true) as ai_enabled,
                COUNT(*) FILTER (WHERE c.ai_enabled = false) as ai_disabled,
                COALESCE(SUM(c.monthly_revenue), 0) as total_monthly_revenue,
                COALESCE(AVG(c.monthly_revenue), 0) as avg_monthly_revenue
            FROM conversations c
            WHERE ${access.clause}
        `, access.params);

        // B. Submitted Count
        const submittedResult = await db.query(`
            SELECT COUNT(DISTINCT ls.conversation_id) as count
            FROM lender_submissions ls
            JOIN conversations c ON c.id = ls.conversation_id
            WHERE ${access.clause}
        `, access.params);

        // C. Goals & Funding
        const goalResult = await db.query(`SELECT value FROM app_settings WHERE key = 'monthly_goal'`);

        const fundedThisMonth = await db.query(`
            SELECT COUNT(*) as deal_count, COALESCE(SUM(c.funded_amount), 0) as total_funded
            FROM conversations c
            WHERE c.funded_at >= DATE_TRUNC('month', CURRENT_DATE)
              AND ${access.clause}
        `, access.params);

        const fundedLastMonth = await db.query(`
            SELECT COALESCE(SUM(c.funded_amount), 0) as total_funded
            FROM conversations c
            WHERE c.funded_at >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
              AND c.funded_at < DATE_TRUNC('month', CURRENT_DATE)
              AND ${access.clause}
        `, access.params);

        // D. Rich Breakdowns
        const stateBreakdown = await db.query(`
            SELECT c.state, COUNT(*) as count
            FROM conversations c
            WHERE c.state IS NOT NULL AND ${access.clause}
            GROUP BY c.state ORDER BY count DESC
        `, access.params);

        const leadSourceBreakdown = await db.query(`
            SELECT COALESCE(c.lead_source, 'Unknown') as lead_source, COUNT(*) as count
            FROM conversations c
            WHERE ${access.clause}
            GROUP BY c.lead_source ORDER BY count DESC
        `, access.params);

        const industryBreakdown = await db.query(`
            SELECT COALESCE(c.industry_type, 'Unknown') as industry, COUNT(*) as count
            FROM conversations c
            WHERE ${access.clause}
            GROUP BY c.industry_type ORDER BY count DESC LIMIT 10
        `, access.params);

        const geoBreakdown = await db.query(`
            SELECT COALESCE(c.us_state, 'Unknown') as region, COUNT(*) as count
            FROM conversations c
            WHERE ${access.clause}
            GROUP BY region ORDER BY count DESC LIMIT 10
        `, access.params);

        const creditBreakdown = await db.query(`
            SELECT COALESCE(c.credit_score::text, 'Unknown') as credit_tier, COUNT(*) as count
            FROM conversations c
            WHERE ${access.clause}
            GROUP BY c.credit_score ORDER BY count DESC
        `, access.params);

        const fundingBreakdown = await db.query(`
            SELECT COALESCE(c.funding_status, 'Unknown') as status, COUNT(*) as count
            FROM conversations c
            WHERE ${access.clause}
            GROUP BY c.funding_status ORDER BY count DESC
        `, access.params);

        // E. Activity Trend
        const activityTrend = await db.query(`
            SELECT DATE(c.created_at) as date, COUNT(*) as count
            FROM conversations c
            WHERE c.created_at >= CURRENT_DATE - INTERVAL '30 days'
              AND ${access.clause}
            GROUP BY DATE(c.created_at)
            ORDER BY date ASC
        `, access.params);

        const stats = mainStats.rows[0];

        res.json({
            success: true,
            user: {
                name: req.user?.name || 'Boss',
                firstName: req.user?.name?.split(' ')[0] || 'Boss',
                role: req.user?.role
            },
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
        const access = getConversationAccessClause(req.user, 'c');

        const result = await db.query(`
            SELECT ls.conversation_id, c.business_name, ls.lender_name, ls.offer_amount, ls.factor_rate, ls.last_response_at
            FROM lender_submissions ls
            JOIN conversations c ON c.id = ls.conversation_id
            WHERE ls.status = 'OFFER' AND ${access.clause}
            ORDER BY ls.last_response_at DESC
        `, access.params);
        res.json({ success: true, offers: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 3. SUBMITTED LIST
router.get('/submitted', async (req, res) => {
    try {
        const db = getDatabase();
        const access = getConversationAccessClause(req.user, 'c');

        const result = await db.query(`
            SELECT ls.conversation_id, c.business_name, COUNT(ls.id) as lender_count, MAX(ls.submitted_at) as last_submitted
            FROM lender_submissions ls
            JOIN conversations c ON c.id = ls.conversation_id
            WHERE ${access.clause}
            GROUP BY ls.conversation_id, c.business_name
            ORDER BY last_submitted DESC
        `, access.params);
        res.json({ success: true, submitted: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
