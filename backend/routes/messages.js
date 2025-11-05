// routes/messages.js - HANDLES: Sending and receiving messages
// URLs like: /api/messages/:conversationId, /api/messages/send

const express = require('express');
const router = express.Router();
const { getDatabase } = require('../services/database');

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
                    'UPDATE messages SET status = $1, external_id = $2 WHERE id = $3',
                    ['sent', twilioMessage.sid, newMessage.id]
                );

                newMessage.status = 'sent';
                newMessage.external_id = twilioMessage.sid;

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

        // Emit WebSocket event for real-time update
        if (global.io) {
            global.io.to(`conversation_${actualConversationId}`).emit('new_message', {
                conversation_id: actualConversationId,
                message: newMessage
            });
            console.log(`📨 WebSocket event emitted for conversation ${actualConversationId}`);
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
        const { From, To, Body, MessageSid } = req.body;
        const db = getDatabase();

        console.log('📥 Incoming webhook message:', { From, To, Body });

        // Find conversation by phone number
        const convResult = await db.query(
            'SELECT id FROM conversations WHERE lead_phone = $1 LIMIT 1',
            [From]
        );

        if (convResult.rows.length === 0) {
            console.log('⚠️ No conversation found for phone:', From);
            return res.status(404).json({
                success: false,
                error: 'Conversation not found'
            });
        }

        const conversationId = convResult.rows[0].id;

        // Insert incoming message
        const msgResult = await db.query(`
            INSERT INTO messages (
                conversation_id, content, direction, message_type,
                sent_by, external_id, timestamp
            )
            VALUES ($1, $2, 'inbound', 'sms', 'lead', $3, NOW())
            RETURNING *
        `, [conversationId, Body, MessageSid]);

        const newMessage = msgResult.rows[0];

        // Update conversation last_activity
        await db.query(
            'UPDATE conversations SET last_activity = NOW() WHERE id = $1',
            [conversationId]
        );

        // Emit WebSocket event
        if (global.io) {
            global.io.to(`conversation_${conversationId}`).emit('new_message', {
                conversation_id: conversationId,
                message: newMessage
            });
            console.log(`📨 WebSocket event emitted for incoming message`);
        }

        console.log(`✅ Incoming message saved: ${newMessage.id}`);

        res.json({
            success: true,
            message: newMessage
        });

    } catch (error) {
        console.error('Error processing webhook:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
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

module.exports = router;
