const express = require('express');
const router = express.Router();
const { processLeadWithAI } = require('../services/aiAgent');
const { getDatabase } = require('../services/database');
const { runMorningFollowUp } = require('../services/morningFollowUp');
const { runDailyAgent } = require('../services/dailyAgent');
const twilio = require('twilio');
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// POST /api/agent/trigger
// The Dispatcher calls this URL
router.post('/trigger', async (req, res) => {
    const { conversation_id, system_instruction, direct_message, next_state } = req.body;

    if (!conversation_id) return res.status(400).json({ error: "Missing conversation_id" });

    const db = getDatabase();

    // Fetch business name for logging
    const nameResult = await db.query('SELECT business_name FROM conversations WHERE id = $1', [conversation_id]);
    const bizName = nameResult.rows[0]?.business_name || 'Unknown';
    const shortId = conversation_id.slice(0, 8);

    console.log(`📨 Received Dispatcher Trigger for "${bizName}" (${shortId})`);

    // Atomic lock acquisition - prevents race condition
    const lockResult = await db.query(`
        UPDATE conversations 
        SET ai_processing = true, last_activity = NOW()
        WHERE id = $1 
          AND (ai_processing = false OR ai_processing IS NULL OR last_activity < NOW() - INTERVAL '2 minutes')
        RETURNING id
    `, [conversation_id]);

    if (lockResult.rowCount === 0) {
        console.log(`🔒 [${bizName}] Already processing - skipping`);
        return res.json({ success: false, skipped: true, reason: 'ai_processing lock' });
    }

    console.log(`🔓 [${bizName}] Lock acquired`);

    let result;
    try {
        // Direct message = skip AI entirely
        if (direct_message) {
            console.log(`📨 [${bizName}] Direct message (no AI)`);
            result = { shouldReply: true, content: direct_message };
        } else {
            // 1. Run the AI Logic via Router
            result = await processLeadWithAI(conversation_id, system_instruction);
        }

    if (result.error) return res.status(500).json(result);

    // 2. Send SMS if AI generated a reply
    if (result.shouldReply && result.content) {
        try {

            // A. Get Phone Number
            const lead = await db.query("SELECT lead_phone FROM conversations WHERE id = $1", [conversation_id]);
            if (lead.rows.length === 0) throw new Error("Lead not found");
            const phone = lead.rows[0].lead_phone;
            // Validate phone before sending
            const cleanPhone = (phone || '').replace(/\D/g, '');
            if (!cleanPhone || cleanPhone.length < 10) {
                console.log(`⚠️ [${bizName}] Invalid phone: "${phone}" - skipping SMS`);
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
            await twilioClient.messages.create({
                body: result.content,
                from: process.env.TWILIO_PHONE_NUMBER,
                to: phone
            });

            // D. Mark Sent
            await db.query("UPDATE messages SET status = 'sent' WHERE id = $1", [messageId]);
            console.log(`📊 [${bizName}] Updating activity (is_nudge=${req.body.is_nudge})`);
            // Update last_activity and nudge_count
            if (req.body.is_nudge) {
                await db.query(`
                    UPDATE conversations 
                    SET last_activity = NOW(), nudge_count = COALESCE(nudge_count, 0) + 1 
                    WHERE id = $1
                `, [conversation_id]);
            } else {
                await db.query("UPDATE conversations SET last_activity = NOW() WHERE id = $1", [conversation_id]);
            }

            // E. Apply next_state only if safe
            if (next_state) {
                const currentCheck = await db.query('SELECT state FROM conversations WHERE id = $1', [conversation_id]);
                const currentState = currentCheck.rows[0]?.state;
                
                // Protected states that dispatcher shouldn't overwrite
                const protectedStates = ['DEAD', 'FUNDED', 'SUBMITTED', 'HUMAN_REVIEW', 'ARCHIVED'];
                
                if (protectedStates.includes(currentState)) {
                    console.log(`🛡️ [${bizName}] State ${currentState} is protected - ignoring next_state: ${next_state}`);
                } else {
                    await db.query(`
                        INSERT INTO state_history (conversation_id, old_state, new_state, changed_by)
                        VALUES ($1, $2, $3, 'drip')
                    `, [conversation_id, currentState, next_state]);
                    await db.query(`UPDATE conversations SET state = $1 WHERE id = $2`, [next_state, conversation_id]);
                    console.log(`📊 [${bizName}] ${currentState} → ${next_state} (drip)`);
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
                        is_drip: !!direct_message,
                        timestamp: new Date().toISOString()
                    }
                });
            }

            console.log(`✅ [${bizName}] AI Sent Message to ${phone}`);
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
    } catch (err) {
        console.error(`❌ [${bizName}] Error in trigger:`, err);
        if (!res.headersSent) {
            return res.status(500).json({ error: err.message });
        }
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

// POST /api/agent/daily-report
router.post('/daily-report', async (req, res) => {
    const secret = req.headers['x-internal-secret'];
    if (secret !== process.env.INTERNAL_API_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const { date } = req.body || {};

    console.log('📊 Daily report triggered via API', date ? `(date: ${date})` : '');
    try {
        const report = await runDailyAgent(date || null);
        return res.json({ success: true, report });
    } catch (err) {
        console.error('Daily report error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
