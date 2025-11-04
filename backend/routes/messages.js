// routes/messages.js - HANDLES: Sending and receiving messages
// URLs like: /api/messages/:conversationId, /api/messages/send

const express = require('express');
const router = express.Router();
const { getDatabase } = require('../services/database');

// Get messages for a conversation
router.get('/:conversationId', async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { limit = 100, offset = 0 } = req.query;
        const db = getDatabase();

        const result = await db.query(`
            SELECT * FROM messages
            WHERE conversation_id = $1
            ORDER BY timestamp ASC
            LIMIT $2 OFFSET $3
        `, [conversationId, parseInt(limit), parseInt(offset)]);

        res.json({
            success: true,
            messages: result.rows,
            conversation_id: conversationId
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
        const { conversation_id, content, direction, message_type, sent_by } = req.body;
        const db = getDatabase();

        // Insert message into database
        const result = await db.query(`
            INSERT INTO messages (
                conversation_id, content, direction, message_type, sent_by, timestamp
            )
            VALUES ($1, $2, $3, $4, $5, NOW())
            RETURNING *
        `, [
            conversation_id,
            content,
            direction || 'outbound',
            message_type || 'sms',
            sent_by || 'system'
        ]);

        const newMessage = result.rows[0];

        // Emit WebSocket event for real-time update
        if (global.io) {
            global.io.to(`conversation_${conversation_id}`).emit('new_message', {
                conversation_id: conversation_id,
                message: newMessage
            });
            console.log(`📨 WebSocket event emitted for conversation ${conversation_id}`);
        }

        console.log(`✅ Message sent: ${newMessage.id}`);

        res.json({
            success: true,
            message: newMessage
        });

    } catch (error) {
        console.error('Error sending message:', error);
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

        const result = await db.query(
            'SELECT COUNT(*) as total FROM messages WHERE conversation_id = $1',
            [conversationId]
        );

        res.json({
            success: true,
            conversation_id: conversationId,
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
