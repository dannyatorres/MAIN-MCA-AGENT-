const express = require('express');
const router = express.Router();
const { getDatabase } = require('../services/database');

// Main stats endpoint
router.get('/', async (req, res) => {
    try {
        const db = getDatabase();

        // Total conversations
        const totalResult = await db.query(`SELECT COUNT(*) FROM conversations`);

        // State breakdown
        const stateResult = await db.query(`
            SELECT state, COUNT(*) as count
            FROM conversations
            GROUP BY state
        `);

        // Submitted = conversations sent to lenders
        const submittedResult = await db.query(`
            SELECT COUNT(DISTINCT conversation_id) FROM lender_submissions
        `);

        // Offers = conversations with OFFER status
        const offersResult = await db.query(`
            SELECT COUNT(DISTINCT conversation_id) FROM lender_submissions
            WHERE status = 'OFFER'
        `);

        // Build state breakdown object
        const stateBreakdown = {};
        stateResult.rows.forEach(row => {
            if (row.state) stateBreakdown[row.state] = parseInt(row.count);
        });

        res.json({
            success: true,
            totalConversations: parseInt(totalResult.rows[0]?.count || 0),
            active: parseInt(totalResult.rows[0]?.count || 0),
            submitted: parseInt(submittedResult.rows[0]?.count || 0),
            offers: parseInt(offersResult.rows[0]?.count || 0),
            stateBreakdown,
            newLeads: stateBreakdown['NEW'] || 0,
            qualified: stateBreakdown['QUALIFIED'] || 0,
            funded: stateBreakdown['FUNDED'] || 0
        });

    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Detailed offers list
router.get('/offers', async (req, res) => {
    try {
        const db = getDatabase();

        const result = await db.query(`
            SELECT
                ls.conversation_id,
                c.business_name,
                ls.lender_name,
                ls.offer_amount,
                ls.factor_rate,
                ls.last_response_at
            FROM lender_submissions ls
            JOIN conversations c ON c.id = ls.conversation_id
            WHERE ls.status = 'OFFER'
            ORDER BY ls.last_response_at DESC
        `);

        res.json({ success: true, offers: result.rows });

    } catch (error) {
        console.error('Offers error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Detailed submissions list
router.get('/submitted', async (req, res) => {
    try {
        const db = getDatabase();

        const result = await db.query(`
            SELECT
                ls.conversation_id,
                c.business_name,
                COUNT(ls.id) as lender_count,
                MAX(ls.submitted_at) as last_submitted
            FROM lender_submissions ls
            JOIN conversations c ON c.id = ls.conversation_id
            GROUP BY ls.conversation_id, c.business_name
            ORDER BY last_submitted DESC
        `);

        res.json({ success: true, submitted: result.rows });

    } catch (error) {
        console.error('Submitted error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
