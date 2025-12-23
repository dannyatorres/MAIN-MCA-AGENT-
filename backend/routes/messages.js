// routes/messages.js - HANDLES: Sending and receiving messages
// URLs like: /api/messages/:conversationId, /api/messages/send

const express = require('express');
const router = express.Router();
const { getDatabase } = require('../services/database');
const { processLeadWithAI } = require('../services/aiAgent');
const multer = require('multer');
const AWS = require('aws-sdk');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// 1. Configure AWS S3 (Same as conversations.js)
const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || 'us-east-1'
});

// 2. Configure Multer to use MEMORY (RAM) instead of Disk
// We hold the file in memory just long enough to upload to S3
const upload = multer({ storage: multer.memoryStorage() });

// Helper function to convert display_id to UUID if needed
async function resolveConversationId(conversationId, db) {
    const isNumeric = /^\d+$/.test(conversationId);
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

// Get messages for a conversation
router.get('/:conversationId', async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { limit = 100, offset = 0 } = req.query;
        const db = getDatabase();

        const actualId = await resolveConversationId(conversationId, db);

        if (!actualId) {
            return res.status(404).json({ success: false, error: 'Conversation not found' });
        }

        const result = await db.query(`
            SELECT * FROM messages
            WHERE conversation_id = $1
            ORDER BY timestamp ASC
            LIMIT $2 OFFSET $3
        `, [actualId, parseInt(limit), parseInt(offset)]);

        res.json({
            success: true,
            messages: result.rows,
            conversation_id: actualId
        });

    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Send a new message
router.post('/send', async (req, res) => {
    try {
        let { conversation_id, content, direction, message_type, sent_by, sender_type, media_url } = req.body;

        // If sent_by is missing, use sender_type (backwards compatibility with frontend)
        sent_by = sent_by || sender_type;

        const db = getDatabase();

        console.log('📤 Sending message:', { conversation_id, content, media_url });

        const actualConversationId = await resolveConversationId(conversation_id, db);

        if (!actualConversationId) {
            return res.status(404).json({ success: false, error: 'Conversation not found' });
        }

        // Get conversation details for phone number
        const convResult = await db.query(
            'SELECT lead_phone, business_name FROM conversations WHERE id = $1',
            [actualConversationId]
        );

        if (convResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Conversation not found' });
        }

        const { lead_phone } = convResult.rows[0];

        // Determine message type
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
            direction || 'outbound',
            type,
            sent_by || 'system',
            media_url || null
        ]);

        const newMessage = result.rows[0];

        // ACTUALLY SEND VIA TWILIO (if outbound)
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

                // Add Image URL if MMS
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

                // Don't crash the response, just log the error
                newMessage.status = 'failed';
            }
        }

        // Update conversation last_activity
        await db.query(
            'UPDATE conversations SET last_activity = NOW() WHERE id = $1',
            [actualConversationId]
        );

        // Emit WebSocket event
        if (global.io) {
            global.io.emit('new_message', {
                conversation_id: actualConversationId,
                message: newMessage
            });
        }

        res.json({ success: true, message: newMessage });

    } catch (error) {
        console.error('❌ Error sending message:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// S3 UPLOAD ROUTE (Railway + Twilio Compatible)
router.post('/upload', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    try {
        console.log('☁️ Uploading MMS to S3...');

        // Generate unique filename
        const filename = `mms/${Date.now()}_${uuidv4()}_${req.file.originalname.replace(/\s/g, '_')}`;

        // Upload to S3
        const uploadResult = await s3.upload({
            Bucket: process.env.S3_DOCUMENTS_BUCKET,
            Key: filename,
            Body: req.file.buffer,
            ContentType: req.file.mimetype
        }).promise();

        // Twilio needs a public URL
        const fileUrl = uploadResult.Location;

        console.log('✅ S3 Upload Success:', fileUrl);

        res.json({
            success: true,
            url: fileUrl
        });

    } catch (error) {
        console.error('❌ S3 Upload Error:', error);
        res.status(500).json({ error: 'Failed to upload image to storage' });
    }
});

// Webhook for Incoming Messages (UPDATED WITH AI AUTO-REPLY)
router.post('/webhook/receive', async (req, res) => {
    try {
        const { From, Body, MessageSid, MediaUrl0 } = req.body;
        const db = getDatabase();

        console.log('📥 Webhook Inbound:', { From, Body });

        // 1. Find the Conversation
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

        // 2. Save User's Message to DB
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
            MediaUrl0 ? 'mms' : 'sms',
            MessageSid,
            MediaUrl0 || null
        ]);

        const newMessage = msgResult.rows[0];

        // 3. Update Conversation & Notify Frontend
        await db.query('UPDATE conversations SET last_activity = NOW() WHERE id = $1', [conversation.id]);

        if (global.io) {
            global.io.emit('new_message', {
                conversation_id: conversation.id,
                message: newMessage,
                business_name: conversation.business_name
            });
        }

        // --- 🤖 AI AUTO-REPLY START ---
        // Acknowledge Twilio FIRST so it doesn't timeout while AI thinks
        res.set('Content-Type', 'text/xml');
        res.send('<Response></Response>');

        // Run AI Logic in Background
        (async () => {
            try {
                console.log(`🤖 AI thinking for ${conversation.business_name}...`);
                
                const aiResult = await processLeadWithAI(conversation.id, "The user just replied. Read the history and respond naturally.");

                if (aiResult.shouldReply && aiResult.content) {
                    console.log(`🗣️ AI generating reply: "${aiResult.content}"`);

                    // A. Insert AI Reply to DB
                    const aiMsgResult = await db.query(`
                        INSERT INTO messages (conversation_id, content, direction, message_type, sent_by, status, timestamp)
                        VALUES ($1, $2, 'outbound', 'sms', 'ai', 'pending', NOW())
                        RETURNING *
                    `, [conversation.id, aiResult.content]);
                    
                    const aiMessage = aiMsgResult.rows[0];

                    // B. Send via Twilio
                    const twilio = require('twilio');
                    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
                    
                    const sentMsg = await client.messages.create({
                        body: aiResult.content,
                        from: process.env.TWILIO_PHONE_NUMBER,
                        to: From
                    });

                    // C. Mark Sent in DB
                    await db.query("UPDATE messages SET status = 'sent', twilio_sid = $1 WHERE id = $2", [sentMsg.sid, aiMessage.id]);

                    // D. Notify Frontend of AI Reply
                    if (global.io) {
                        global.io.emit('new_message', {
                            conversation_id: conversation.id,
                            message: { ...aiMessage, status: 'sent', twilio_sid: sentMsg.sid }
                        });
                    }
                } else {
                    console.log('🤫 AI decided not to reply.');
                }
            } catch (err) {
                console.error("❌ AI Auto-Reply Failed:", err);
            }
        })();
        // --- 🤖 AI AUTO-REPLY END ---

    } catch (error) {
        console.error('Webhook Error:', error);
        if (!res.headersSent) res.status(500).send(error.message);
    }
});

// Get message count for a conversation
router.get('/:conversationId/count', async (req, res) => {
    try {
        const { conversationId } = req.params;
        const db = getDatabase();

        const actualId = await resolveConversationId(conversationId, db);

        if (!actualId) {
            return res.status(404).json({ success: false, error: 'Conversation not found' });
        }

        const result = await db.query(
            'SELECT COUNT(*) as total FROM messages WHERE conversation_id = $1',
            [actualId]
        );

        res.json({
            success: true,
            conversation_id: actualId,
            message_count: parseInt(result.rows[0].total)
        });

    } catch (error) {
        console.error('Error counting messages:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
