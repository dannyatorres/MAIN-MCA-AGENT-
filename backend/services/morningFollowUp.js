// services/morningFollowUp.js
// 🌅 Morning warm-up agent - texts offer leads at 9am EST

const { getDatabase } = require('./database');
const { trackUsage } = require('./usageTracker');
const { OpenAI } = require('openai');
const twilio = require('twilio');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

function getPrompt() {
    try {
        const promptPath = path.join(__dirname, '../prompts/morning_followup.md');
        return fs.readFileSync(promptPath, 'utf8');
    } catch (err) {
        console.error('Failed to load morning prompt:', err.message);
        return 'Send a short, casual morning follow-up text. Keep it under 20 words. If they already said no or got funded, respond with NO_SEND';
    }
}

async function generateMorningMessage(conversationHistory, businessName, db, conversationId, userId) {
    const systemPrompt = getPrompt();
    
    const recentMessages = conversationHistory
        .slice(-10)
        .map(m => `${m.direction === 'outbound' ? 'You' : 'Them'}: ${m.content}`)
        .join('\n');

    const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Business: ${businessName}\n\nRecent conversation:\n${recentMessages}\n\nShould you send a follow-up? If yes, generate it. If no, respond with NO_SEND` }
        ],
        max_tokens: 60,
        temperature: 0.7
    });

    // Track usage
    if (response.usage) {
        await trackUsage({
            userId: userId,
            conversationId: conversationId,
            type: 'llm_call',
            service: 'openai',
            model: 'gpt-4o',
            inputTokens: response.usage.prompt_tokens,
            outputTokens: response.usage.completion_tokens,
            metadata: { source: 'morning_follow_up' }
        });
    }

    const reply = response.choices[0]?.message?.content?.trim();
    
    // If AI says don't send, return null
    if (!reply || reply === 'NO_SEND' || reply.toUpperCase().includes('NO_SEND')) {
        return null;
    }
    
    return reply;
}

async function runMorningFollowUp() {
    const db = getDatabase();
    console.log('🌅 [Morning Follow-Up] Starting at', new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));

    try {
        const result = await db.query(`
            SELECT DISTINCT ON (c.id)
                c.id as conversation_id,
                c.business_name,
                c.lead_phone,
                c.assigned_user_id,
                ls.offer_amount,
                ls.lender_name,
                last_msg.direction as last_direction,
                last_msg.timestamp as last_msg_time
            FROM conversations c
            JOIN lender_submissions ls ON ls.conversation_id = c.id 
                AND ls.status = 'OFFER'
                AND ls.last_response_at > NOW() - INTERVAL '48 hours'
            LEFT JOIN LATERAL (
                SELECT direction, timestamp
                FROM messages m 
                WHERE m.conversation_id = c.id 
                ORDER BY m.timestamp DESC 
                LIMIT 1
            ) last_msg ON true
            WHERE 
                c.state NOT IN ('DEAD', 'ARCHIVED', 'FUNDED', 'STALE')
                AND c.lead_phone IS NOT NULL
                AND NOT EXISTS (
                    SELECT 1 FROM messages m2 
                    WHERE m2.conversation_id = c.id 
                    AND m2.sent_by = 'morning_agent'
                    AND m2.timestamp > NOW() - INTERVAL '20 hours'
                )
            ORDER BY c.id, ls.last_response_at DESC
            LIMIT 50
        `);

        const leads = result.rows;

        if (leads.length === 0) {
            console.log('🌅 [Morning Follow-Up] No leads need follow-up today.');
            return { sent: 0, skipped: 0, noSend: 0 };
        }

        console.log(`🌅 [Morning Follow-Up] Found ${leads.length} leads to check.`);

        let sent = 0;
        let skipped = 0;
        let noSend = 0;

        for (const lead of leads) {
            try {
                // Get conversation history for context
                const historyRes = await db.query(`
                    SELECT content, direction, timestamp
                    FROM messages
                    WHERE conversation_id = $1
                    ORDER BY timestamp DESC
                    LIMIT 10
                `, [lead.conversation_id]);

                const history = historyRes.rows.reverse();

                // Generate contextual message (AI decides if should send)
                const message = await generateMorningMessage(
                    history, 
                    lead.business_name, 
                    db, 
                    lead.conversation_id, 
                    lead.assigned_user_id
                );

                // Skip if AI decided not to send
                if (!message) {
                    console.log(`⏭️ Skipping ${lead.business_name} - AI decided not to send`);
                    noSend++;
                    continue;
                }
                
                console.log(`📱 Sending to ${lead.business_name}: "${message}"`);

                // Send via Twilio
                const twilioMsg = await twilioClient.messages.create({
                    body: message,
                    from: process.env.TWILIO_PHONE_NUMBER,
                    to: lead.lead_phone
                });

                // Save to messages table
                await db.query(`
                    INSERT INTO messages (
                        conversation_id, content, direction, message_type,
                        sent_by, status, twilio_sid, timestamp
                    ) VALUES ($1, $2, 'outbound', 'sms', 'morning_agent', 'sent', $3, NOW())
                `, [lead.conversation_id, message, twilioMsg.sid]);

                // Update conversation activity
                await db.query(`
                    UPDATE conversations SET last_activity = NOW() WHERE id = $1
                `, [lead.conversation_id]);

                // Track SMS usage
                const segmentCount = Math.ceil(message.length / 160);
                await trackUsage({
                    userId: lead.assigned_user_id,
                    conversationId: lead.conversation_id,
                    type: 'sms_outbound',
                    service: 'twilio',
                    segments: segmentCount,
                    metadata: { source: 'morning_follow_up' }
                });

                sent++;

                // 5 second interval between texts
                await new Promise(r => setTimeout(r, 5000));

            } catch (err) {
                console.error(`❌ Failed to send to ${lead.business_name}:`, err.message);
                skipped++;
            }
        }

        console.log(`🌅 [Morning Follow-Up] Complete: ${sent} sent, ${noSend} AI skipped, ${skipped} errors`);
        return { sent, skipped, noSend };

    } catch (err) {
        console.error('🔥 [Morning Follow-Up] Critical error:', err);
        return { error: err.message };
    }
}

module.exports = { runMorningFollowUp };
