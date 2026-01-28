// routes/messages.js - FIXED: Sending Logic & SQL Syntax
const express = require('express');
const router = express.Router();
const { getDatabase } = require('../services/database');
const { trackResponseForTraining } = require('../services/aiAgent');
const { routeMessage } = require('../services/agentRouter');
const { updateState } = require('../services/stateManager');
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

        const { lead_phone, business_name } = convResult.rows[0];
        console.log(`📤 [${business_name}] ${sent_by || 'user'}: "${(content || '').substring(0, 50)}..."`);
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
                console.log(`✅ [${business_name}] Sent (${sent_by || 'user'})`);

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

        // DEDUP: Check if we already processed this message
        const dupCheck = await db.query(
            `SELECT 1 FROM messages WHERE twilio_sid = $1`,
            [MessageSid]
        );
        if (dupCheck.rows.length > 0) {
            console.log(`⏭️ Duplicate webhook ignored: ${MessageSid}`);
            res.set('Content-Type', 'text/xml');
            return res.send('<Response></Response>');
        }

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
            `SELECT id, business_name, assigned_user_id, state FROM conversations
             WHERE regexp_replace(lead_phone, '\\D', '', 'g') LIKE '%' || $1
             ORDER BY last_activity DESC LIMIT 1`,
            [searchPhone]
        );

        if (convResult.rows.length === 0) return res.status(200).send('No conversation found');
        const conversation = convResult.rows[0];

        // Check lock AFTER getting conversation, but BEFORE AI logic (not here)
        // Lock check moved to AI logic block below

        const mediaUrlValue = mediaUrls.length > 1 ? JSON.stringify(mediaUrls) : (mediaUrls[0] || null);

        const msgResult = await db.query(`
            INSERT INTO messages (
                conversation_id, content, direction, message_type,
                sent_by, twilio_sid, media_url, timestamp, status
            )
            VALUES ($1, $2, 'inbound', $3, 'lead', $4, $5, NOW(), 'delivered')
            ON CONFLICT (twilio_sid) DO NOTHING
            RETURNING *
        `, [
            conversation.id,
            Body || '',
            mediaUrls.length > 0 ? 'mms' : 'sms',
            MessageSid,
            mediaUrlValue
        ]);

        // If duplicate, skip everything
        if (msgResult.rows.length === 0) {
            console.log(`⏭️ Duplicate webhook ignored: ${MessageSid}`);
            res.set('Content-Type', 'text/xml');
            return res.send('<Response></Response>');
        }

        const newMessage = msgResult.rows[0];

        // RESPOND TO TWILIO IMMEDIATELY
        res.set('Content-Type', 'text/xml');
        res.send('<Response></Response>');

        // Everything else runs AFTER response is sent
        setImmediate(async () => {
            let lockSet = false;
            try {
                // Track inbound SMS usage
                const segmentCount = Math.ceil((Body || '').length / 160);
                await trackUsage({
                    userId: conversation.assigned_user_id,
                    conversationId: conversation.id,
                    type: 'sms_inbound',
                    service: 'twilio',
                    segments: segmentCount
                });

                const currentState = conversation.state;
                const RESURRECTION_STATES = ['NEW', 'SENT_HOOK', 'SENT_FU_1', 'SENT_FU_2', 'SENT_FU_3', 'SENT_FU_4', 'DEAD'];

                if (RESURRECTION_STATES.includes(currentState)) {
                    await updateState(conversation.id, 'REPLIED', 'webhook');
                } else {
                    // Just update last_activity, no state change
                    await db.query('UPDATE conversations SET last_activity = NOW() WHERE id = $1', [conversation.id]);
                }

                if (global.io) {
                    global.io.emit('new_message', {
                        conversation_id: conversation.id,
                        message: newMessage,
                        business_name: conversation.business_name
                    });
                }

                // AI Logic - Route through agentRouter
                if (routeMessage) {
                    const lockCheck = await db.query(`
                        SELECT 1 FROM conversations 
                        WHERE id = $1 AND ai_processing = true
                    `, [conversation.id]);

                    if (lockCheck.rows.length > 0) {
                        console.log(`🔒 [${conversation.business_name}] AI already processing - skipping`);
                        return;
                    }

                    // Set lock before AI processing
                    await db.query(`UPDATE conversations SET ai_processing = true WHERE id = $1`, [conversation.id]);
                    lockSet = true;

                    // Check if last message was already from us - don't double-send
                    const lastMsgCheck = await db.query(`
                        SELECT direction FROM messages 
                        WHERE conversation_id = $1 
                        ORDER BY timestamp DESC LIMIT 1
                    `, [conversation.id]);

                    if (lastMsgCheck.rows[0]?.direction === 'outbound') {
                        console.log(`⏭️ [${conversation.business_name}] Last msg was outbound - skipping`);
                        return;
                    }

                    // Random delay 30-60 seconds
                    const delay = Math.floor(Math.random() * 30000) + 30000;
                    console.log(`🤖 [${conversation.business_name}] AI processing (${Math.round(delay / 1000)}s delay)...`);
                    await new Promise(r => setTimeout(r, delay));

                    const aiResult = await routeMessage(conversation.id, 'The user just replied. Read the history and respond naturally.');

                    if (aiResult.shouldReply && aiResult.content) {
                        let messageToSend = aiResult.content;

                        // Safety filter - remove any leaked tool text
                        messageToSend = messageToSend
                            .replace(/\(Calling\s+\w+[^)]*\)/gi, '')
                            .replace(/\w+_\w+\s+(tool\s+)?invoked\.?/gi, '')
                            .replace(/\{"status"\s*:\s*"[^"]*"[^}]*\}/gi, '')
                            .trim();

                        if (!messageToSend || messageToSend.length < 3) {
                            console.log(`⏭️ [${conversation.business_name}] Filtered to empty - skipping`);
                            return;
                        }

                        // If AI returned multiple messages (split by double newline), only send first
                        if (messageToSend.includes('\n\n')) {
                            messageToSend = messageToSend.split('\n\n')[0].trim();
                            console.log(`✂️ [${conversation.business_name}] Trimmed multi-message to first only`);
                        }

                        const aiMsgResult = await db.query(`
                            INSERT INTO messages (conversation_id, content, direction, message_type, sent_by, status, timestamp)
                            VALUES ($1, $2, 'outbound', 'sms', 'ai', 'pending', NOW())
                            RETURNING *
                        `, [conversation.id, messageToSend]);

                        const aiMessage = aiMsgResult.rows[0];

                        const twilio = require('twilio');
                        const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

                        const sentMsg = await client.messages.create({
                            body: messageToSend,
                            from: process.env.TWILIO_PHONE_NUMBER,
                            to: From
                        });

                        await db.query('UPDATE messages SET status = \'sent\', twilio_sid = $1 WHERE id = $2', [sentMsg.sid, aiMessage.id]);

                        const aiSegmentCount = Math.max(1, Math.ceil((messageToSend || '').length / 160));
                        await trackUsage({
                            userId: conversation.assigned_user_id,
                            conversationId: conversation.id,
                            type: 'sms_outbound',
                            service: 'twilio',
                            segments: aiSegmentCount,
                            metadata: { source: 'ai_auto_reply' }
                        });

                        console.log(`✅ [${conversation.business_name}] AI sent: "${messageToSend.substring(0, 50)}..."`);
                        if (global.io) {
                            global.io.emit('new_message', {
                                conversation_id: conversation.id,
                                message: { ...aiMessage, status: 'sent', twilio_sid: sentMsg.sid }
                            });
                        }
                    }
                }
            } catch (err) {
                console.error('❌ Post-webhook error:', err);
            } finally {
                if (lockSet) {
                    await db.query(`UPDATE conversations SET ai_processing = false WHERE id = $1`, [conversation.id]);
                }
            }
        });

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
