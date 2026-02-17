const twilio = require('twilio');
const { getDatabase } = require('./database');
const { trackUsage } = require('./usageTracker');

const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

async function sendSMS(conversationId, content, sentBy = 'ai') {
    const db = getDatabase();

    const conv = await db.query(
        'SELECT lead_phone, business_name, assigned_user_id FROM conversations WHERE id = $1',
        [conversationId]
    );
    if (!conv.rows[0]) throw new Error('Conversation not found');

    const { lead_phone, business_name, assigned_user_id } = conv.rows[0];
    const cleanPhone = (lead_phone || '').replace(/\D/g, '');
    if (!cleanPhone || cleanPhone.length < 10) {
        console.log(`⚠️ [${business_name}] Invalid phone: "${lead_phone}" — skipping`);
        return null;
    }

    const msgResult = await db.query(`
        INSERT INTO messages (conversation_id, content, direction, message_type, sent_by, status, timestamp)
        VALUES ($1, $2, 'outbound', 'sms', $3, 'pending', NOW())
        RETURNING *
    `, [conversationId, content, sentBy]);

    const message = msgResult.rows[0];

    try {
        const sent = await twilioClient.messages.create({
            body: content,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: lead_phone
        });

        await db.query("UPDATE messages SET status = 'sent', twilio_sid = $1 WHERE id = $2",
            [sent.sid, message.id]);

        const segments = Math.max(1, Math.ceil((content || '').length / 160));
        await trackUsage({
            userId: assigned_user_id,
            conversationId,
            type: 'sms_outbound',
            service: 'twilio',
            segments
        });

        if (global.io) {
            global.io.emit('new_message', {
                conversation_id: conversationId,
                message: { ...message, status: 'sent', twilio_sid: sent.sid }
            });
        }

        console.log(`✅ [${business_name}] Sent (${sentBy}): "${content.substring(0, 50)}..."`);
        return message;

    } catch (err) {
        await db.query("UPDATE messages SET status = 'failed' WHERE id = $1", [message.id]);
        console.error(`❌ [${business_name}] Twilio send failed:`, err.message);
        throw err;
    }
}

module.exports = { sendSMS };
