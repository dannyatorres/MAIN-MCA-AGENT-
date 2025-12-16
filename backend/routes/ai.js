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
        const db = getDatabase();
        let conversationContext = null;

        if (!query) {
            return res.status(400).json({ success: false, error: 'Query is required' });
        }

        console.log(`🤖 [AI CHAT] Processing for ID: ${conversationId}`);

        if (conversationId && includeContext) {

            // 1. Basic Lead Info
            const convResult = await db.query(`
                SELECT c.*, ld.*
                FROM conversations c
                LEFT JOIN lead_details ld ON c.id = ld.conversation_id
                WHERE c.id = $1
            `, [conversationId]);

            if (convResult.rows.length > 0) {
                const conversation = convResult.rows[0];

                // 2. SMS History (Existing)
                const smsResult = await db.query(`
                    SELECT content, direction, timestamp, sent_by
                    FROM messages
                    WHERE conversation_id = $1
                    ORDER BY timestamp DESC LIMIT 15
                `, [conversationId]);

                // 3. Lender Offers (Existing)
                let lenderResult = { rows: [] };
                try {
                    lenderResult = await db.query(`
                        SELECT lender_name, status, offer_amount, decline_reason, raw_email_body, offer_details
                        FROM lender_submissions
                        WHERE conversation_id = $1 ORDER BY created_at DESC
                    `, [conversationId]);
                } catch (e) { console.log('Lender fetch error', e.message); }

                // 🟢 4. FETCH FCS / BANK ANALYSIS (NEW)
                let fcsResult = { rows: [] };
                try {
                    fcsResult = await db.query(`
                        SELECT * FROM fcs_analyses 
                        WHERE conversation_id = $1 
                        ORDER BY created_at DESC LIMIT 1
                    `, [conversationId]);
                } catch (e) { console.log('FCS fetch error', e.message); }

                // 🟢 5. FETCH AI CHAT HISTORY (NEW)
                let historyResult = { rows: [] };
                try {
                    historyResult = await db.query(`
                        SELECT role, content 
                        FROM ai_chat_messages 
                        WHERE conversation_id = $1 
                        ORDER BY created_at DESC LIMIT 10
                    `, [conversationId]);
                } catch (e) { console.log('History fetch error', e.message); }

                // 6. Pack it all up
                conversationContext = {
                    business_name: conversation.business_name,
                    first_name: conversation.first_name,
                    last_name: conversation.last_name,
                    business_type: conversation.business_type,
                    credit_score: conversation.credit_score,
                    monthly_revenue: conversation.monthly_revenue,
                    funding_amount: conversation.requested_amount,
                    annual_revenue: conversation.annual_revenue,
                    us_state: conversation.us_state,
                    recent_messages: smsResult.rows,
                    lender_submissions: lenderResult.rows,
                    fcs: fcsResult.rows[0] || null,
                    chat_history: historyResult.rows.reverse()
                };
            }
        }

        const result = await aiService.generateResponse(query, conversationContext);

        // Save the User/AI interaction to DB so memory builds up
        if(result.success) {
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
