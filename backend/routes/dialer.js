// routes/dialer.js - Power Dialer API
const express = require('express');
const router = express.Router();
const { getDatabase } = require('../services/database');
const { getConversationAccessClause, requireModifyPermission } = require('../middleware/dataAccess');

// States that indicate "ghosted after SMS" - adjust these as needed
const DIALER_ELIGIBLE_STATES = [
    'SENT_FU_3',
    'SENT_FU_4',
    'STALE',
    'VETTING_NUDGE_2',
    'SENT_BALLPARK'
];

// GET /api/dialer/queue - Get leads ready for calling
router.get('/queue', async (req, res) => {
    try {
        const db = getDatabase();
        const access = getConversationAccessClause(req.user, 'c');

        const query = `
            SELECT 
                c.id,
                c.display_id,
                c.first_name,
                c.last_name,
                c.business_name,
                c.lead_phone as phone,
                c.state,
                c.last_activity,
                c.call_attempts,
                c.call_disposition,
                c.channel_lock
            FROM conversations c
            WHERE ${access.clause}
              AND c.lead_phone IS NOT NULL
              AND c.lead_phone != ''
              AND c.state NOT IN ('DEAD', 'ARCHIVED', 'FUNDED')
              AND (c.channel_lock IS NULL OR c.channel_lock != 'sms')
              AND (
                  (SELECT direction FROM messages m 
                   WHERE m.conversation_id = c.id 
                   ORDER BY m.timestamp DESC 
                   LIMIT 1) = 'outbound'
                  OR NOT EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id)
              )
            ORDER BY c.last_activity DESC
            LIMIT 100
        `;

        const result = await db.query(query, access.params);

        console.log(`📞 Dialer queue loaded: ${result.rows.length} leads`);

        res.json({
            success: true,
            leads: result.rows,
            count: result.rows.length
        });

    } catch (error) {
        console.error('❌ Dialer queue error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/dialer/disposition - Log call outcome
router.post('/disposition', requireModifyPermission, async (req, res) => {
    try {
        const { conversationId, disposition, attempt, duration } = req.body;
        const db = getDatabase();

        if (!conversationId || !disposition) {
            return res.status(400).json({ success: false, error: 'Missing conversationId or disposition' });
        }

        console.log(`📞 Logging disposition: ${disposition} for ${conversationId} (attempt ${attempt}, ${duration}s)`);

        // Update conversation with call info
        await db.query(`
            UPDATE conversations
            SET 
                call_disposition = $1,
                call_attempts = COALESCE(call_attempts, 0) + 1,
                last_call_attempt = NOW(),
                last_activity = NOW()
            WHERE id = $2
        `, [disposition, conversationId]);

        // Log to messages as a system note (so it shows in chat history)
        const dispositionLabels = {
            'answered': '📞 Call answered',
            'no_answer': '📵 No answer',
            'voicemail': '📬 Left voicemail',
            'wrong_number': '⚠️ Wrong number',
            'callback': '🔄 Callback requested',
            'not_interested': '🚫 Not interested',
            'skip': '⏭️ Skipped'
        };

        const noteContent = `${dispositionLabels[disposition] || disposition}${duration > 0 ? ` (${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')})` : ''}`;

        await db.query(`
            INSERT INTO messages (
                conversation_id, content, direction, message_type,
                sent_by, timestamp, status
            )
            VALUES ($1, $2, 'internal', 'system', 'system', NOW(), 'delivered')
        `, [conversationId, noteContent]);

        // Update state based on disposition
        let newState = null;
        if (disposition === 'answered') {
            newState = 'INTERESTED'; // They picked up, probably interested
        } else if (disposition === 'wrong_number') {
            newState = 'DEAD'; // Bad number, mark dead
        } else if (disposition === 'not_interested') {
            newState = 'DEAD';
        }

        if (newState) {
            await db.query(`
                UPDATE conversations SET state = $1 WHERE id = $2
            `, [newState, conversationId]);
        }

        res.json({ success: true, disposition, newState });

    } catch (error) {
        console.error('❌ Disposition error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/conversations/:id/channel-lock - Lock a channel
router.post('/:id/channel-lock', requireModifyPermission, async (req, res) => {
    try {
        const { id } = req.params;
        const { channel } = req.body; // 'voice' or 'sms'
        const db = getDatabase();

        if (!['voice', 'sms'].includes(channel)) {
            return res.status(400).json({ success: false, error: 'Invalid channel. Must be "voice" or "sms"' });
        }

        console.log(`🔒 Locking channel: ${channel} for conversation ${id}`);

        await db.query(`
            UPDATE conversations
            SET channel_lock = $1, channel_locked_at = NOW()
            WHERE id = $2
        `, [channel, id]);

        res.json({ success: true, channel });

    } catch (error) {
        console.error('❌ Channel lock error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// DELETE /api/conversations/:id/channel-lock - Unlock channel
router.delete('/:id/channel-lock', requireModifyPermission, async (req, res) => {
    try {
        const { id } = req.params;
        const db = getDatabase();

        console.log(`🔓 Unlocking channel for conversation ${id}`);

        await db.query(`
            UPDATE conversations
            SET channel_lock = NULL, channel_locked_at = NULL
            WHERE id = $1
        `, [id]);

        res.json({ success: true });

    } catch (error) {
        console.error('❌ Channel unlock error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/dialer/stats - Get dialing session stats (optional)
router.get('/stats', async (req, res) => {
    try {
        const db = getDatabase();
        const access = getConversationAccessClause(req.user, 'c');

        // Get today's call stats
        const result = await db.query(`
            SELECT 
                call_disposition,
                COUNT(*) as count
            FROM conversations c
            WHERE ${access.clause}
              AND last_call_attempt >= CURRENT_DATE
              AND call_disposition IS NOT NULL
            GROUP BY call_disposition
        `, access.params);

        const stats = {
            answered: 0,
            no_answer: 0,
            voicemail: 0,
            wrong_number: 0,
            callback: 0,
            skip: 0
        };

        result.rows.forEach(row => {
            if (Object.prototype.hasOwnProperty.call(stats, row.call_disposition)) {
                stats[row.call_disposition] = parseInt(row.count, 10);
            }
        });

        res.json({ success: true, stats });

    } catch (error) {
        console.error('❌ Dialer stats error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
