// routes/messages.js - FIXED: Sending Logic & SQL Syntax
const express = require('express');
const router = express.Router();
const { getDatabase } = require('../services/database');
const { processLeadWithAI, trackResponseForTraining } = require('../services/aiAgent');
const multer = require('multer');
const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

// 1. Configure AWS S3
const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || 'us-east-1'
});

const upload = multer({ storage: multer.memoryStorage() });

async function resolveConversationId(conversationId, db) {
    const isNumeric = /^\d+$/.test(String(conversationId));
    if (isNumeric) {
        const result = await db.query(
            'SELECT id FROM conversations WHERE display_id = $1',
            [parseInt(conversationId)]
        );
        if (result.rows.length === 0) return null;
        return result.rows[0].id;
    }
    return conversationId;
}

// Get messages
router.get('/:conversationId', async (req, res) => {
    try {
        const { conversationId } = req.params;
        const db = getDatabase();
        const actualId = await resolveConversationId(conversationId, db);

        if (!actualId) return res.json([]);

        const result = await db.query(`
            SELECT * FROM messages
            WHERE conversation_id = $1
            ORDER BY timestamp ASC
        `, [actualId]);

        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.json([]);
    }
});

// Send a new message
router.post('/send', async (req, res) => {
    try {
        let { conversation_id, content, message_content, direction, message_type, sent_by, sender_type, media_url } = req.body;

        // --- FIX 1: Set Default Direction Immediately ---
        // This ensures the Twilio block below actually runs
        direction = direction || 'outbound';

        content = content || message_content;
        sent_by = sent_by || sender_type;

        const db = getDatabase();

        console.log('📤 Sending message:', { conversation_id, content, media_url, direction });

        const actualConversationId = await resolveConversationId(conversation_id, db);

        if (!actualConversationId) {
            return res.status(404).json({ success: false, error: 'Conversation not found' });
        }

        const convResult = await db.query(
            'SELECT lead_phone, business_name FROM conversations WHERE id = $1',
            [actualConversationId]
        );

        if (convResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Conversation not found' });
        }

        const { lead_phone } = convResult.rows[0];
        const type = media_url ? 'mms' : (message_type || 'sms');

        // Insert message into database FIRST
        const result = await db.query(`
            INSERT INTO messages (
                conversation_id, content, direction, message_type,
                sent_by, timestamp, status, media_url
            )
            VALUES ($1, $2, $3, $4, $5, NOW(), 'pending', $6)
            RETURNING *
        `, [
            actualConversationId,
            content || '',
            direction,
            type,
            sent_by || 'system',
            media_url || null
        ]);

        const newMessage = result.rows[0];

        // ACTUALLY SEND VIA TWILIO (Now this check will pass)
        if (direction === 'outbound') {
            try {
                if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
                    throw new Error('Twilio credentials not configured');
                }

                const twilio = require('twilio');
                const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

                const msgOptions = {
                    body: content || '',
                    from: process.env.TWILIO_PHONE_NUMBER,
                    to: lead_phone
                };

                if (media_url) {
                    msgOptions.mediaUrl = [media_url];
                }

                const twilioMessage = await twilioClient.messages.create(msgOptions);
                console.log(`✅ Twilio Sent! SID: ${twilioMessage.sid}`);

                await db.query(
                    'UPDATE messages SET status = $1, twilio_sid = $2 WHERE id = $3',
                    ['sent', twilioMessage.sid, newMessage.id]
                );

                newMessage.status = 'sent';
                newMessage.twilio_sid = twilioMessage.sid;

            } catch (twilioError) {
                console.error('❌ Twilio error:', twilioError.message);
                await db.query('UPDATE messages SET status = $1 WHERE id = $2', ['failed', newMessage.id]);
                newMessage.status = 'failed';
            }
        }

        await db.query(
            'UPDATE conversations SET last_activity = NOW() WHERE id = $1',
            [actualConversationId]
        );

        console.log('🔴 BACKEND EMIT: new_message', { conversation_id: actualConversationId, message_id: newMessage.id });
        if (global.io) {
            global.io.emit('new_message', {
                conversation_id: actualConversationId,
                message: newMessage
            });
        }

        // --- FIX 2: Correct SQL Syntax for Training Update ---
        if (sent_by === 'user' || sender_type === 'user') {
            (async () => {
                try {
                    const lastInbound = await db.query(`
                        SELECT content FROM messages
                        WHERE conversation_id = $1 AND direction = 'inbound'
                        ORDER BY timestamp DESC LIMIT 1
                    `, [actualConversationId]);

                    const leadMessage = lastInbound.rows[0]?.content || 'N/A';

                    if (trackResponseForTraining) {
                        await trackResponseForTraining(
                            actualConversationId,
                            leadMessage,
                            content,
                            'HUMAN_MANUAL'
                        );

                        // FIXED SQL: Use Subquery instead of ORDER BY in UPDATE
                        await db.query(`
                            UPDATE response_training
                            SET message_id = $1
                            WHERE id = (
                                SELECT id FROM response_training
                                WHERE conversation_id = $2
                                AND human_response = $3
                                AND message_id IS NULL
                                ORDER BY created_at DESC
                                LIMIT 1
                            )
                        `, [newMessage.id, actualConversationId, content]);
                    }
                } catch (err) {
                    console.error('Training track failed:', err.message);
                }
            })();
        }

        res.json({ success: true, message: newMessage });

    } catch (error) {
        console.error('❌ Error sending message:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// S3 Upload Route
router.post('/upload', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    try {
        const filename = `mms/${Date.now()}_${uuidv4()}_${req.file.originalname.replace(/\s/g, '_')}`;
        const uploadResult = await s3.upload({
            Bucket: process.env.S3_DOCUMENTS_BUCKET,
            Key: filename,
            Body: req.file.buffer,
            ContentType: req.file.mimetype
        }).promise();

        res.json({ success: true, url: uploadResult.Location });
    } catch (error) {
        console.error('❌ S3 Upload Error:', error);
        res.status(500).json({ error: 'Failed to upload image' });
    }
});

// Webhook for Incoming Messages
router.post('/webhook/receive', async (req, res) => {
    try {
        const { From, Body, MessageSid, NumMedia } = req.body;
        const db = getDatabase();

        console.log('📥 Webhook Inbound:', { From, Body, NumMedia });

        const mediaUrls = [];
        const numMedia = parseInt(NumMedia) || 0;
        for (let i = 0; i < numMedia; i++) {
            const url = req.body[`MediaUrl${i}`];
            if (url) mediaUrls.push(url);
        }

        const cleanPhone = From.replace(/\D/g, '');
        const searchPhone = (cleanPhone.length === 11 && cleanPhone.startsWith('1'))
            ? cleanPhone.substring(1)
            : cleanPhone;

        const convResult = await db.query(
            `SELECT id, business_name FROM conversations
             WHERE regexp_replace(lead_phone, '\\D', '', 'g') LIKE '%' || $1
             ORDER BY last_activity DESC LIMIT 1`,
            [searchPhone]
        );

        if (convResult.rows.length === 0) return res.status(200).send('No conversation found');
        const conversation = convResult.rows[0];

        const mediaUrlValue = mediaUrls.length > 1 ? JSON.stringify(mediaUrls) : (mediaUrls[0] || null);

        const msgResult = await db.query(`
            INSERT INTO messages (
                conversation_id, content, direction, message_type,
                sent_by, twilio_sid, media_url, timestamp, status
            )
            VALUES ($1, $2, 'inbound', $3, 'lead', $4, $5, NOW(), 'delivered')
            RETURNING *
        `, [
            conversation.id,
            Body || '',
            mediaUrls.length > 0 ? 'mms' : 'sms',
            MessageSid,
            mediaUrlValue
        ]);

        const newMessage = msgResult.rows[0];

        await db.query(`
            UPDATE conversations
            SET state = 'INTERESTED', current_step = 'INTERESTED', last_activity = NOW()
            WHERE id = $1
        `, [conversation.id]);

        console.log('🔴 BACKEND EMIT: new_message (inbound)', { conversation_id: conversation.id, message_id: newMessage.id });
        if (global.io) {
            global.io.emit('new_message', {
                conversation_id: conversation.id,
                message: newMessage,
                business_name: conversation.business_name
            });
        }

        res.set('Content-Type', 'text/xml');
        res.send('<Response></Response>');

        // AI Logic
        if (processLeadWithAI) {
            (async () => {
                try {
                    console.log(`🤖 AI thinking for ${conversation.business_name}...`);
                    const aiResult = await processLeadWithAI(conversation.id, 'The user just replied. Read the history and respond naturally.');

                    if (aiResult.shouldReply && aiResult.content) {
                        const aiMsgResult = await db.query(`
                            INSERT INTO messages (conversation_id, content, direction, message_type, sent_by, status, timestamp)
                            VALUES ($1, $2, 'outbound', 'sms', 'ai', 'pending', NOW())
                            RETURNING *
                        `, [conversation.id, aiResult.content]);

                        const aiMessage = aiMsgResult.rows[0];

                        const twilio = require('twilio');
                        const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

                        const sentMsg = await client.messages.create({
                            body: aiResult.content,
                            from: process.env.TWILIO_PHONE_NUMBER,
                            to: From
                        });

                        await db.query('UPDATE messages SET status = \'sent\', twilio_sid = $1 WHERE id = $2', [sentMsg.sid, aiMessage.id]);

                        console.log('🔴 BACKEND EMIT: new_message (ai)', { conversation_id: conversation.id, message_id: aiMessage.id });
                        if (global.io) {
                            global.io.emit('new_message', {
                                conversation_id: conversation.id,
                                message: { ...aiMessage, status: 'sent', twilio_sid: sentMsg.sid }
                            });
                        }
                    }
                } catch (err) {
                    console.error('❌ AI Auto-Reply Failed:', err);
                }
            })();
        }

    } catch (error) {
        console.error('Webhook Error:', error);
        if (!res.headersSent) res.status(500).send(error.message);
    }
});

router.get('/:conversationId/count', async (req, res) => {
    try {
        const { conversationId } = req.params;
        const db = getDatabase();
        const actualId = await resolveConversationId(conversationId, db);
        if (!actualId) return res.status(404).json({ success: false, error: 'Conversation not found' });

        const result = await db.query('SELECT COUNT(*) as total FROM messages WHERE conversation_id = $1', [actualId]);

        res.json({
            success: true,
            conversation_id: actualId,
            message_count: parseInt(result.rows[0].total)
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
