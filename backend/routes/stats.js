const express = require('express');
const router = express.Router();
const { getDatabase } = require('../services/database');

// Main stats endpoint
router.get('/', async (req, res) => {
    try {
        const db = getDatabase();

        const activeResult = await db.query(`
            SELECT COUNT(*) FROM conversations
            WHERE state NOT IN ('DEAD', 'ARCHIVED', 'FUNDED', 'STALE')
        `);

        const submittedResult = await db.query(`
            SELECT COUNT(DISTINCT conversation_id) FROM lender_submissions
        `);

        const offersResult = await db.query(`
            SELECT COUNT(DISTINCT conversation_id) FROM lender_submissions
            WHERE status = 'OFFER'
        `);

        res.json({
            success: true,
            active: parseInt(activeResult.rows[0].count),
            submitted: parseInt(submittedResult.rows[0].count),
            offers: parseInt(offersResult.rows[0].count)
        });

    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({ error: error.message });
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
        res.status(500).json({ error: error.message });
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
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
