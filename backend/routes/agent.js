const express = require('express');
const router = express.Router();
const { routeMessage } = require('../services/agentRouter'); // ✅ Routes to correct agent based on state
const { getDatabase } = require('../services/database');
const { runMorningFollowUp } = require('../services/morningFollowUp');
const twilio = require('twilio');

// POST /api/agent/trigger
// The Dispatcher calls this URL
router.post('/trigger', async (req, res) => {
    const { conversation_id, system_instruction, direct_message, next_state } = req.body;

    if (!conversation_id) return res.status(400).json({ error: "Missing conversation_id" });

    console.log(`📨 Received Dispatcher Trigger for ${conversation_id}`);

    const db = getDatabase();

    // Check lock to prevent double-sends
    const lockCheck = await db.query(
        `SELECT ai_processing, last_activity FROM conversations WHERE id = $1`,
        [conversation_id]
    );

    if (lockCheck.rows[0]?.ai_processing === true) {
        // Check if lock is stale (older than 2 minutes)
        const lastActivity = new Date(lockCheck.rows[0].last_activity);
        const minutesAgo = (Date.now() - lastActivity) / 60000;
        
        if (minutesAgo > 2) {
            console.log(`🔓 [${conversation_id}] Force releasing stale lock (${minutesAgo.toFixed(1)}m old)`);
            // Continue processing - lock was stuck
        } else {
            console.log(`🔒 [${conversation_id}] Already processing - skipping`);
            return res.json({ success: false, skipped: true, reason: 'ai_processing lock' });
        }
    }

    // Set lock
    await db.query(`UPDATE conversations SET ai_processing = true WHERE id = $1`, [conversation_id]);

    let result;
    try {
        // Direct message = skip AI entirely
        if (direct_message) {
            console.log(`📨 Direct message (no AI) for ${conversation_id}`);
            result = { shouldReply: true, content: direct_message };
        } else {
            // 1. Run the AI Logic via Router
            result = await routeMessage(conversation_id, null, system_instruction);
        }

    if (result.error) return res.status(500).json(result);

    // 2. Send SMS if AI generated a reply
    if (result.shouldReply && result.content) {
        try {
            const db = getDatabase();

            // A. Get Phone Number
            const lead = await db.query("SELECT lead_phone FROM conversations WHERE id = $1", [conversation_id]);
            if (lead.rows.length === 0) throw new Error("Lead not found");
            const phone = lead.rows[0].lead_phone;
            // Validate phone before sending
            const cleanPhone = (phone || '').replace(/\D/g, '');
            if (!cleanPhone || cleanPhone.length < 10) {
                console.log(`⚠️ [${conversation_id}] Invalid phone: "${phone}" - skipping SMS`);
                return res.json({ success: true, action: 'skipped', reason: 'invalid_phone' });
            }

            // B. Insert into DB (So we see it in the chat window)
            const sentBy = direct_message ? 'drip' : 'ai';
            const insert = await db.query(`
                INSERT INTO messages (conversation_id, content, direction, message_type, status, timestamp, sent_by)
                VALUES ($1, $2, 'outbound', 'sms', 'pending', NOW(), $3)
                RETURNING id
            `, [conversation_id, result.content, sentBy]);

            const messageId = insert.rows[0].id;

            // C. Send via Twilio
            const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
            await client.messages.create({
                body: result.content,
                from: process.env.TWILIO_PHONE_NUMBER,
                to: phone
            });

            // D. Mark Sent
            await db.query("UPDATE messages SET status = 'sent' WHERE id = $1", [messageId]);
            await db.query("UPDATE conversations SET last_activity = NOW() WHERE id = $1", [conversation_id]);

            // E. Apply next_state only if safe
            if (next_state) {
                const currentCheck = await db.query('SELECT state FROM conversations WHERE id = $1', [conversation_id]);
                const currentState = currentCheck.rows[0]?.state;
                
                // Protected states that dispatcher shouldn't overwrite
                const protectedStates = ['DEAD', 'FUNDED', 'SUBMITTED', 'HUMAN_REVIEW', 'ARCHIVED'];
                
                if (protectedStates.includes(currentState)) {
                    console.log(`🛡️ [${conversation_id}] State ${currentState} is protected - ignoring next_state: ${next_state}`);
                } else {
                    await db.query(`
                        INSERT INTO state_history (conversation_id, old_state, new_state, changed_by)
                        VALUES ($1, $2, $3, 'drip')
                    `, [conversation_id, currentState, next_state]);
                    await db.query(`UPDATE conversations SET state = $1 WHERE id = $2`, [next_state, conversation_id]);
                    console.log(`📊 [${conversation_id}] ${currentState} → ${next_state} (drip)`);
                }
            }

            // 🔔 Notify frontend of AI message
            if (global.io) {
                console.log('🔴 BACKEND EMIT: new_message (agent)', { conversation_id: conversation_id, message_id: messageId });
                global.io.emit('new_message', {
                    conversation_id: conversation_id,
                    message: {
                        id: messageId,
                        content: result.content,
                        direction: 'outbound',
                        sent_by: 'ai',
                        is_drip: true,
                        timestamp: new Date().toISOString()
                    }
                });
            }

            console.log(`✅ AI Sent Message to ${phone}`);
        } catch (err) {
            console.error("❌ Failed to send AI SMS:", err.message);
            return res.status(500).json({ error: "AI generated text but failed to send SMS" });
        }
    }

    // UPDATE THE RESPONSE TO INCLUDE THE REPLY
    res.json({
        success: true,
        action: result.shouldReply ? "sent_message" : "status_update_only",
        ai_reply: result.content || "No reply generated (Status update or silence)"
    });
    } finally {
        await db.query(`UPDATE conversations SET ai_processing = false WHERE id = $1`, [conversation_id]);
    }
});

// POST /api/agent/morning-followup
router.post('/morning-followup', async (req, res) => {
    // Allow internal calls with secret
    const secret = req.headers['x-internal-secret'];
    if (secret !== process.env.INTERNAL_API_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log('🌅 Morning follow-up triggered via API');
    try {
        const result = await runMorningFollowUp();
        return res.json({ success: true, ...result });
    } catch (err) {
        console.error('Morning follow-up error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
