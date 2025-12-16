// routes/ai.js - HANDLES: AI chat and intelligent assistance
// URLs like: /api/ai/chat, /api/ai/status

const express = require('express');
const router = express.Router();
const { getDatabase } = require('../services/database');
const aiService = require('../services/aiService');

// Handle OPTIONS preflight for CORS
router.options('/chat', (req, res) => {
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.sendStatus(200);
});

// Main AI chat endpoint with conversation context
router.post('/chat', async (req, res) => {
    // Add CORS headers
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');

    try {
        const { conversationId, query, includeContext = true } = req.body;

        if (!query) {
            return res.status(400).json({ success: false, error: 'Query is required' });
        }

        console.log(`🤖 [AI CHAT] Processing for ID: ${conversationId}`);

        const db = getDatabase();
        let conversationContext = null;

        // Build comprehensive context
        if (conversationId && includeContext) {

            // 1. Get Conversation Data
            const convResult = await db.query(`
                SELECT c.*, ld.*
                FROM conversations c
                LEFT JOIN lead_details ld ON c.id = ld.conversation_id
                WHERE c.id = $1
            `, [conversationId]);

            if (convResult.rows.length > 0) {
                const conversation = convResult.rows[0];

                // 2. Get Messages
                const messagesResult = await db.query(`
                    SELECT content, direction, timestamp, sent_by
                    FROM messages
                    WHERE conversation_id = $1
                    ORDER BY timestamp DESC
                    LIMIT 20
                `, [conversationId]);

                // 3. Get Lender Submissions (ROBUST VERSION)
                // We do NOT join the 'lenders' table anymore. We just trust the submissions table.
                let lenderResult = { rows: [] };
                try {
                    lenderResult = await db.query(`
                        SELECT
                            lender_name,
                            status,
                            offer_amount,
                            decline_reason,
                            raw_email_body,
                            created_at as date
                        FROM lender_submissions
                        WHERE conversation_id = $1
                        ORDER BY created_at DESC
                    `, [conversationId]);
                } catch (err) {
                    console.warn('⚠️ Could not fetch lender submissions (table might be missing):', err.message);
                }

                // 4. Build Context Object
                conversationContext = {
                    business_name: conversation.business_name,
                    monthly_revenue: conversation.monthly_revenue,
                    credit_range: conversation.credit_score,
                    funding_amount: conversation.requested_amount,
                    recent_messages: messagesResult.rows,
                    lender_submissions: lenderResult.rows // Raw data, even if messy
                };

                console.log(`📊 Context Built: found ${lenderResult.rows.length} offers/declines.`);
            }
        }

        // Call AI Service
        const result = await aiService.generateResponse(query, conversationContext);

        // Log & Respond
        if(result.success) {
            // Optional: Save history to DB
            try {
                await db.query(`
                    INSERT INTO ai_chat_messages (conversation_id, role, content, created_at)
                    VALUES ($1, 'user', $2, NOW()), ($1, 'assistant', $3, NOW())
                `, [conversationId, query, result.response]);
            } catch(e) { /* ignore */ }
        }

        res.json(result);

    } catch (error) {
        console.error('❌ AI Chat Critical Error:', error);
        res.json({
            success: false,
            error: error.message,
            response: "I encountered a system error. Please check the logs."
        });
    }
});

// Helper Routes
router.get('/messages/:conversationId', async (req, res) => {
    try {
        const db = getDatabase();
        const result = await db.query(`SELECT * FROM ai_chat_messages WHERE conversation_id = $1 ORDER BY created_at ASC`, [req.params.conversationId]);
        res.json({ success: true, messages: result.rows });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/chat/:conversationId', async (req, res) => {
    try {
        const db = getDatabase();
        const result = await db.query(`SELECT * FROM ai_chat_messages WHERE conversation_id = $1 ORDER BY created_at ASC`, [req.params.conversationId]);
        res.json({ success: true, messages: result.rows });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/chat/:conversationId/messages', async (req, res) => { res.json({ success: true }); });

module.exports = router;
