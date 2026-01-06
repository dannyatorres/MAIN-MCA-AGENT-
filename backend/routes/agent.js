const express = require('express');
const router = express.Router();
const { processLeadWithAI } = require('../services/aiAgent'); // ✅ Correct
const { getDatabase } = require('../services/database');
const twilio = require('twilio');

// POST /api/agent/trigger
// The Dispatcher calls this URL
router.post('/trigger', async (req, res) => {
    const { conversation_id, system_instruction } = req.body;

    if (!conversation_id) return res.status(400).json({ error: "Missing conversation_id" });

    console.log(`📨 Received Dispatcher Trigger for ${conversation_id}`);

    // 1. Run the AI Logic
    const result = await processLeadWithAI(conversation_id, system_instruction);

    if (result.error) return res.status(500).json(result);

    // 2. Send SMS if AI generated a reply
    if (result.shouldReply && result.content) {
        try {
            const db = getDatabase();

            // A. Get Phone Number
            const lead = await db.query("SELECT lead_phone FROM conversations WHERE id = $1", [conversation_id]);
            if (lead.rows.length === 0) throw new Error("Lead not found");
            const phone = lead.rows[0].lead_phone;

            // B. Insert into DB (So we see it in the chat window)
            const insert = await db.query(`
                INSERT INTO messages (conversation_id, content, direction, message_type, status, timestamp)
                VALUES ($1, $2, 'outbound', 'sms', 'pending', NOW())
                RETURNING id
            `, [conversation_id, result.content]);

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
});

module.exports = router;
