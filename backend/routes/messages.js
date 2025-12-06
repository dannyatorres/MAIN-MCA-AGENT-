// routes/messages.js - HANDLES: Sending and receiving messages
// URLs like: /api/messages/:conversationId, /api/messages/send

const express = require('express');
const router = express.Router();
const { getDatabase } = require('../services/database');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure storage for MMS uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, '../../frontend/uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'image-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// Helper function to convert display_id to UUID if needed
async function resolveConversationId(conversationId, db) {
    // Check if it's numeric (display_id) or UUID
    const isNumeric = /^\d+$/.test(conversationId);

    if (isNumeric) {
        // Look up UUID from display_id
        const result = await db.query(
            'SELECT id FROM conversations WHERE display_id = $1',
            [parseInt(conversationId)]
        );

        if (result.rows.length === 0) {
            return null;
        }

        return result.rows[0].id;
    }

    // Already a UUID
    return conversationId;
}

// Get messages for a conversation
router.get('/:conversationId', async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { limit = 100, offset = 0 } = req.query;
        const db = getDatabase();

        // Convert display_id to UUID if needed
        const actualId = await resolveConversationId(conversationId, db);

        if (!actualId) {
            return res.status(404).json({
                success: false,
                error: 'Conversation not found'
            });
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
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Send a new message
router.post('/send', async (req, res) => {
    try {
        let { conversation_id, content, direction, message_type, sent_by } = req.body;
        const db = getDatabase();

        console.log('📤 Sending message:', { conversation_id, content });

        // Convert display_id to UUID if needed
        const actualConversationId = await resolveConversationId(conversation_id, db);

        if (!actualConversationId) {
            return res.status(404).json({
                success: false,
                error: 'Conversation not found'
            });
        }

        // Get conversation details to get phone number
        const convResult = await db.query(
            'SELECT lead_phone, business_name FROM conversations WHERE id = $1',
            [actualConversationId]
        );

        if (convResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Conversation not found'
            });
        }

        const { lead_phone, business_name } = convResult.rows[0];

        if (!lead_phone) {
            return res.status(400).json({
                success: false,
                error: 'No phone number found for this conversation'
            });
        }

        // Insert message into database FIRST
        const result = await db.query(`
            INSERT INTO messages (
                conversation_id, content, direction, message_type, sent_by, timestamp, status
            )
            VALUES ($1, $2, $3, $4, $5, NOW(), 'pending')
            RETURNING *
        `, [
            actualConversationId,
            content,
            direction || 'outbound',
            message_type || 'sms',
            sent_by || 'system'
        ]);

        const newMessage = result.rows[0];

        // ACTUALLY SEND VIA TWILIO (if outbound SMS)
        if (direction === 'outbound' && message_type === 'sms') {
            try {
                console.log(`📞 Sending SMS to ${lead_phone}...`);

                // Check if Twilio credentials exist
                if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
                    console.error('❌ Twilio credentials not configured!');

                    // Update message status to failed
                    await db.query(
                        'UPDATE messages SET status = $1 WHERE id = $2',
                        ['failed', newMessage.id]
                    );

                    return res.status(500).json({
                        success: false,
                        error: 'Twilio credentials not configured'
                    });
                }

                // Initialize Twilio client
                const twilio = require('twilio');
                const twilioClient = twilio(
                    process.env.TWILIO_ACCOUNT_SID,
                    process.env.TWILIO_AUTH_TOKEN
                );

                // Send SMS via Twilio
                const twilioMessage = await twilioClient.messages.create({
                    body: content,
                    from: process.env.TWILIO_PHONE_NUMBER,
                    to: lead_phone
                });

                console.log(`✅ SMS sent! SID: ${twilioMessage.sid}`);

                // Update message status to sent
                await db.query(
                    'UPDATE messages SET status = $1, twilio_sid = $2 WHERE id = $3',
                    ['sent', twilioMessage.sid, newMessage.id]
                );

                newMessage.status = 'sent';
                newMessage.twilio_sid = twilioMessage.sid;

            } catch (twilioError) {
                console.error('❌ Twilio error:', twilioError.message);

                // Update message status to failed
                await db.query(
                    'UPDATE messages SET status = $1 WHERE id = $2',
                    ['failed', newMessage.id]
                );

                return res.status(500).json({
                    success: false,
                    error: 'Failed to send SMS: ' + twilioError.message,
                    message: newMessage
                });
            }
        }

        // Update conversation last_activity
        await db.query(
            'UPDATE conversations SET last_activity = NOW() WHERE id = $1',
            [actualConversationId]
        );

        // Emit WebSocket event (BROADCAST TO ALL)
        if (global.io) {
            console.log(`📨 Broadcasting new_message to ALL clients`);
            global.io.emit('new_message', {
                conversation_id: actualConversationId,
                message: newMessage
            });
        }

        console.log(`✅ Message sent successfully: ${newMessage.id}`);

        res.json({
            success: true,
            message: newMessage
        });

    } catch (error) {
        console.error('❌ Error sending message:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Webhook endpoint to receive incoming messages (e.g., from Twilio)
router.post('/webhook/receive', async (req, res) => {
    try {
        // 1. Grab MediaUrl0 from Twilio (This is the picture!)
        const { From, To, Body, MessageSid, MediaUrl0 } = req.body;
        const db = getDatabase();

        console.log('📥 Incoming webhook message:', { From, To, Body, HasMedia: !!MediaUrl0 });

        // 2. NORMALIZE PHONE NUMBERS
        const cleanPhone = From.replace(/\D/g, '');
        const searchPhone = (cleanPhone.length === 11 && cleanPhone.startsWith('1'))
            ? cleanPhone.substring(1)
            : cleanPhone;

        console.log('🔍 Searching for phone match:', searchPhone);

        // 3. FIND CONVERSATION
        const convResult = await db.query(
            `SELECT id, business_name
             FROM conversations
             WHERE regexp_replace(lead_phone, '\\D', '', 'g') LIKE '%' || $1
             ORDER BY last_activity DESC
             LIMIT 1`,
            [searchPhone]
        );

        if (convResult.rows.length === 0) {
            console.log('⚠️ No conversation found for phone:', From);
            return res.status(200).send('No conversation found');
        }

        const conversation = convResult.rows[0];
        console.log(`✅ Found conversation: ${conversation.business_name} (${conversation.id})`);

        // 4. INSERT MESSAGE (With media_url for MMS!)
        const msgResult = await db.query(`
            INSERT INTO messages (
                conversation_id, content, direction, message_type,
                sent_by, twilio_sid, media_url, timestamp, status
            )
            VALUES ($1, $2, 'inbound', $3, 'lead', $4, $5, NOW(), 'delivered')
            RETURNING *
        `, [
            conversation.id,
            Body || '', // Handle case where body is empty but image exists
            MediaUrl0 ? 'mms' : 'sms', // Detect type
            MessageSid,
            MediaUrl0 || null // Save the image URL
        ]);

        const newMessage = msgResult.rows[0];

        // 5. UPDATE CONVERSATION ACTIVITY
        await db.query(
            'UPDATE conversations SET last_activity = NOW() WHERE id = $1',
            [conversation.id]
        );

        // 6. BROADCAST TO FRONTEND
        if (global.io) {
            console.log(`📨 Broadcasting new_message to ALL clients`);
            global.io.emit('new_message', {
                conversation_id: conversation.id,
                message: newMessage,
                business_name: conversation.business_name
            });
        }

        console.log(`✅ Incoming message saved: ${newMessage.id}`);

        // 7. REPLY TO TWILIO
        res.set('Content-Type', 'text/xml');
        res.send('<Response></Response>');

    } catch (error) {
        console.error('Error processing webhook:', error);
        res.status(500).send(error.message);
    }
});

// Get message count for a conversation
router.get('/:conversationId/count', async (req, res) => {
    try {
        const { conversationId } = req.params;
        const db = getDatabase();

        // Convert display_id to UUID if needed
        const actualId = await resolveConversationId(conversationId, db);

        if (!actualId) {
            return res.status(404).json({
                success: false,
                error: 'Conversation not found'
            });
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
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Handle File Uploads for MMS
router.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    // Return the URL that points to this file
    let baseUrl = 'http://localhost:3000';
    if (process.env.BASE_URL) {
        baseUrl = process.env.BASE_URL;
    } else if (process.env.RAILWAY_PUBLIC_DOMAIN) {
        baseUrl = `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
    }

    const fileUrl = `${baseUrl}/uploads/${req.file.filename}`;

    console.log('📸 File uploaded:', fileUrl);

    res.json({
        success: true,
        url: fileUrl
    });
});

module.exports = router;
