const express = require('express');
const router = express.Router();
const { getDatabase } = require('../services/database');

// GET /api/dispatcher/find-leads
// Returns leads that need AI processing
router.get('/find-leads', async (req, res) => {
    try {
        const { limit = 10 } = req.query;
        const db = getDatabase();

        console.log('🔍 Finding leads that need AI processing...');

        // QUERY: Find 'NEW' leads OR 'STALE' leads (No reply in 24h)
        const query = `
            SELECT
                c.id,
                c.lead_phone,
                c.state,
                c.business_name,
                EXTRACT(EPOCH FROM (NOW() - COALESCE(last_msg.timestamp, c.created_at)))/3600 as hours_since_last_action
            FROM conversations c
            LEFT JOIN LATERAL (
                SELECT direction, timestamp
                FROM messages m
                WHERE m.conversation_id = c.id
                ORDER BY m.timestamp DESC
                LIMIT 1
            ) last_msg ON true
            WHERE
                c.state NOT IN ('DEAD', 'ARCHIVED', 'FUNDED')
                AND (
                    -- RULE 1: If NEW, wait just 5 minutes
                    (c.state = 'NEW' AND c.last_activity < NOW() - INTERVAL '5 minutes')
                    OR
                    -- RULE 2: If STALE, wait 24h for reply AND wait 1h between checks
                    (
                        last_msg.direction = 'outbound' 
                        AND last_msg.timestamp < NOW() - INTERVAL '24 hours'
                        AND c.last_activity < NOW() - INTERVAL '1 hour'
                    )
                )
            LIMIT $1
        `;

        const { rows } = await db.query(query, [parseInt(limit)]);

        console.log(`✅ Found ${rows.length} leads that need processing`);

        res.json({
            success: true,
            leads: rows,
            count: rows.length
        });

    } catch (error) {
        console.error('❌ Error finding leads:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// POST /api/dispatcher/mark-processed
// Marks a lead as processed to prevent re-processing
router.post('/mark-processed', async (req, res) => {
    try {
        const { conversation_id, new_state } = req.body;

        if (!conversation_id) {
            return res.status(400).json({
                success: false,
                error: 'Missing conversation_id'
            });
        }

        const db = getDatabase();

        console.log(`📝 Marking lead ${conversation_id} as processed`);

        // Update last_activity and optionally change state
        await db.query(`
            UPDATE conversations
            SET last_activity = NOW(),
                state = CASE WHEN state = 'NEW' THEN 'INITIAL_CONTACT' ELSE COALESCE($2, state) END
            WHERE id = $1
        `, [conversation_id, new_state || null]);

        console.log(`✅ Lead ${conversation_id} marked as processed`);

        res.json({
            success: true,
            message: 'Lead marked as processed'
        });

    } catch (error) {
        console.error('❌ Error marking lead as processed:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
