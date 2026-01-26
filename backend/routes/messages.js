// routes/messages.js - FIXED: Sending Logic & SQL Syntax
const express = require('express');
const router = express.Router();
const { getDatabase } = require('../services/database');
const { trackResponseForTraining } = require('../services/aiAgent');
const { routeMessage } = require('../services/agentRouter');
const { trackUsage } = require('../services/usageTracker');
const multer = require('multer');
const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const { canAccessConversation, requireConversationAccess, requireModifyPermission } = require('../middleware/dataAccess');

async function getAIHypothetical(conversationId, leadMessage) {
    try {
        const db = getDatabase();

        // Get FCS + Strategy context
        const fcsRes = await db.query(`
            SELECT average_revenue, withholding_percentage, positions
            FROM fcs_analyses WHERE conversation_id = $1
            ORDER BY created_at DESC LIMIT 1
        `, [conversationId]);

        const stratRes = await db.query(`
            SELECT game_plan, lead_grade FROM lead_strategy 
            WHERE conversation_id = $1
        `, [conversationId]);

        const fcs = fcsRes.rows[0];
        const strategy = stratRes.rows[0];
        let gamePlan = strategy?.game_plan || null;
        if (typeof gamePlan === 'string') {
            try { gamePlan = JSON.parse(gamePlan); } catch (e) { gamePlan = null; }
        }

        let context = 'You are a sales rep. Write a short SMS reply (1-2 sentences max).';

        if (fcs || strategy) {
            context += '\n\nCONTEXT:';
            if (fcs?.average_revenue) context += `\nRevenue: $${Math.round(fcs.average_revenue).toLocaleString()}`;
            if (fcs?.withholding_percentage) context += `\nWithholding: ${fcs.withholding_percentage}%`;
            if (strategy?.lead_grade) context += `\nLead Grade: ${strategy.lead_grade}`;
            if (gamePlan?.offer_range) {
                context += `\nOffer Range: $${gamePlan.offer_range.min.toLocaleString()} - $${gamePlan.offer_range.max.toLocaleString()}`;
            }
        }

        const openai = require('openai');
        const client = new openai.OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        const response = await client.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: 'You are a sales rep. Write a short SMS reply (1-2 sentences max).' },
                { role: 'user', content: leadMessage }
            ],
            max_tokens: 100
        });

        return response.choices[0]?.message?.content || null;
    } catch (err) {
        console.error('AI hypothetical failed:', err.message);
        return null;
    }
}

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
router.get('/:conversationId', requireConversationAccess('conversationId'), async (req, res) => {
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
router.post('/send', requireModifyPermission, async (req, res) => {
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

        // Verify user has access to this conversation
        const hasAccess = await canAccessConversation(actualConversationId, req.user);
        if (!hasAccess) {
            return res.status(403).json({ success: false, error: 'Access denied to this conversation' });
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

        // Insert message into database FIRST (with user tracking)
        const result = await db.query(`
            INSERT INTO messages (
                conversation_id, content, direction, message_type,
                sent_by, timestamp, status, media_url, sent_by_user_id
            )
            VALUES ($1, $2, $3, $4, $5, NOW(), 'pending', $6, $7)
            RETURNING *
        `, [
            actualConversationId,
            content || '',
            direction,
            type,
            sent_by || 'system',
            media_url || null,
            req.user?.id || null
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

                const segmentCount = Math.max(1, Math.ceil((content || '').length / 160));
                await trackUsage({
                    userId: req.user?.id,
                    conversationId: actualConversationId,
                    type: media_url ? 'mms_outbound' : 'sms_outbound',
                    service: 'twilio',
                    segments: segmentCount
                });
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

                    // NEW: Capture what AI would have said (using cheap model)
                    const aiHypothetical = await getAIHypothetical(actualConversationId, leadMessage);
                    if (aiHypothetical) {
                        const fcsRes = await db.query(`
                            SELECT average_revenue FROM fcs_analyses 
                            WHERE conversation_id = $1 
                            ORDER BY created_at DESC LIMIT 1
                        `, [actualConversationId]);

                        const stratRes = await db.query(`
                            SELECT lead_grade, game_plan FROM lead_strategy 
                            WHERE conversation_id = $1
                        `, [actualConversationId]);

                        let offerRange = null;
                        const rawGamePlan = stratRes.rows[0]?.game_plan;
                        if (rawGamePlan && typeof rawGamePlan === 'string') {
                            try {
                                offerRange = JSON.parse(rawGamePlan)?.offer_range || null;
                            } catch (e) {
                                offerRange = null;
                            }
                        } else {
                            offerRange = rawGamePlan?.offer_range || null;
                        }

                        await db.query(`
                            UPDATE response_training
                            SET ai_would_have_said = $1,
                                lead_grade = $2,
                                monthly_revenue = $3,
                                offer_range = $4
                            WHERE conversation_id = $5
                              AND human_response = $6
                              AND ai_would_have_said IS NULL
                        `, [
                            aiHypothetical,
                            stratRes.rows[0]?.lead_grade,
                            fcsRes.rows[0]?.average_revenue,
                            JSON.stringify(offerRange || null),
                            actualConversationId,
                            content
                        ]);
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

// S3 Upload Route (for MMS attachments)
router.post('/upload', requireModifyPermission, upload.single('file'), async (req, res) => {
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
            `SELECT id, business_name, assigned_user_id FROM conversations
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

        // Track inbound SMS usage
        const segmentCount = Math.ceil((Body || '').length / 160);
        await trackUsage({
            userId: conversation.assigned_user_id,
            conversationId: conversation.id,
            type: 'sms_inbound',
            service: 'twilio',
            segments: segmentCount
        });

        await db.query(`
            UPDATE conversations
            SET state = CASE 
                    WHEN state IN ('NEW', 'SENT_HOOK', 'SENT_FU_1', 'SENT_FU_2', 'SENT_FU_3', 'SENT_FU_4') 
                    THEN 'REPLIED'
                    ELSE state
                END,
                last_activity = NOW()
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

        // AI Logic - Route through agentRouter
        if (routeMessage) {
            (async () => {
                try {
                    console.log(`🤖 AI thinking for ${conversation.business_name}...`);
                    const aiResult = await routeMessage(conversation.id, 'The user just replied. Read the history and respond naturally.');

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

                        const aiSegmentCount = Math.max(1, Math.ceil((aiResult.content || '').length / 160));
                        await trackUsage({
                            userId: conversation.assigned_user_id,
                            conversationId: conversation.id,
                            type: 'sms_outbound',
                            service: 'twilio',
                            segments: aiSegmentCount,
                            metadata: { source: 'ai_auto_reply' }
                        });

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

router.get('/:conversationId/count', requireConversationAccess('conversationId'), async (req, res) => {
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

// Proxy download for external images (bypasses CORS)
router.get('/proxy-download', requireConversationAccess(), async (req, res) => {
    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'URL required' });
    }

    try {
        const https = require('https');
        const http = require('http');
        const protocol = url.startsWith('https') ? https : http;

        protocol.get(url, (response) => {
            if (response.statusCode !== 200) {
                return res.status(response.statusCode).json({ error: 'Failed to fetch image' });
            }

            const contentType = response.headers['content-type'] || 'application/octet-stream';
            const filename = `image_${Date.now()}.jpg`;

            res.setHeader('Content-Type', contentType);
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

            response.pipe(res);
        }).on('error', (err) => {
            console.error('Proxy download error:', err);
            res.status(500).json({ error: 'Download failed' });
        });
    } catch (error) {
        console.error('Proxy download error:', error);
        res.status(500).json({ error: 'Download failed' });
    }
});

module.exports = router;
