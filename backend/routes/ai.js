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
        console.log(`🤖 [AI Route] Request received for ID: ${conversationId}`);
        const db = getDatabase();
        let conversationContext = null;

        if (!query) {
            return res.status(400).json({ success: false, error: 'Query is required' });
        }

        if (conversationId && includeContext) {

            // 1. Basic Lead Info
            console.log('   🔍 [AI Route] Fetching Lead Details...');
            const convResult = await db.query(`
                SELECT c.*, ld.*
                FROM conversations c
                LEFT JOIN lead_details ld ON c.id = ld.conversation_id
                WHERE c.id = $1
            `, [conversationId]);

            if (convResult.rows.length > 0) {
                const conversation = convResult.rows[0];
                console.log(`   ✅ [AI Route] Found Lead: ${conversation.business_name || 'Unknown'}`);

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
                    console.log(`   💰 [AI Route] Found ${lenderResult.rows.length} Lender Offers`);
                } catch (e) { console.log('   ⚠️ Lender fetch error', e.message); }

                // Fetch valid lenders for AI to reference
                let lendersResult = { rows: [] };
                try {
                    lendersResult = await db.query(`SELECT name FROM lenders ORDER BY name`);
                    console.log(`   🏦 [AI Route] Found ${lendersResult.rows.length} lenders`);
                } catch (e) { console.log('   ⚠️ Lenders fetch error', e.message); }

                // 🟢 4. FETCH FCS / BANK ANALYSIS (NEW)
                let fcsResult = { rows: [] };
                try {
                    fcsResult = await db.query(`
                        SELECT * FROM fcs_analyses 
                        WHERE conversation_id = $1 
                        ORDER BY created_at DESC LIMIT 1
                    `, [conversationId]);
                    
                    if (fcsResult.rows.length > 0) {
                        console.log(`   🏦 [AI Route] ✅ FCS DATA FOUND:`);
                        console.log(`       - Revenue: ${fcsResult.rows[0].average_revenue}`);
                        console.log(`       - Neg Days: ${fcsResult.rows[0].total_negative_days}`);
                        console.log(`       - Deposits: ${fcsResult.rows[0].average_deposit_count}`);
                    } else {
                        console.log(`   🏦 [AI Route] ❌ NO FCS DATA FOUND in DB.`);
                    }

                } catch (e) { console.log('   ⚠️ FCS fetch error', e.message); }

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

                // 🎖️ 7. FETCH COMMANDER'S GAME PLAN (NEW)
                let strategyResult = { rows: [] };
                try {
                    strategyResult = await db.query(`
                        SELECT game_plan, lead_grade, strategy_type
                        FROM lead_strategy
                        WHERE conversation_id = $1
                    `, [conversationId]);

                    if (strategyResult.rows.length > 0) {
                        console.log(`   🎖️ [AI Route] ✅ COMMANDER STRATEGY FOUND:`);
                        console.log(`       - Grade: ${strategyResult.rows[0].lead_grade}`);
                        console.log(`       - Strategy: ${strategyResult.rows[0].strategy_type}`);
                    } else {
                        console.log(`   🎖️ [AI Route] ❌ NO COMMANDER STRATEGY YET.`);
                    }
                } catch (e) { console.log('   ⚠️ Strategy fetch error', e.message); }

                // 6. Pack it all up
                conversationContext = {
                    // Standard Info
                    display_id: conversation.display_id,
                    business_name: conversation.business_name,
                    monthly_revenue: conversation.monthly_revenue,
                    funding_amount: conversation.requested_amount,
                    
                    // Owner Names
                    first_name: conversation.first_name, 
                    last_name: conversation.last_name,

                    // Address mapping based on schema
                    address: conversation.business_address || conversation.address || 'N/A',
                    owner_address: conversation.owner_home_address,
                    owner_city: conversation.owner_home_city,
                    owner_state: conversation.owner_home_state,
                    owner_zip: conversation.owner_home_zip,

                    // Tax ID (encrypted)
                    tax_id: conversation.tax_id_encrypted ? '(Encrypted)' : 'N/A', 

                    // Credit & Industry
                    credit_range: conversation.credit_score, 
                    industry: conversation.business_type,

                    // Data Arrays
                    recent_messages: smsResult.rows,
                    lender_submissions: lenderResult.rows,
                    fcs: fcsResult.rows[0] || null,
                    chat_history: historyResult.rows.reverse(),

                    // 🎖️ COMMANDER'S GAME PLAN (NEW)
                    game_plan: strategyResult.rows[0]?.game_plan || null,
                    lead_grade: strategyResult.rows[0]?.lead_grade || null,
                    strategy_type: strategyResult.rows[0]?.strategy_type || null,

                    // Valid lenders for actions
                    valid_lenders: lendersResult.rows.map(l => l.name)
                };
                console.log('   📦 [AI Route] Context Package ready for Service.');
            }
        }

        const result = await aiService.generateResponse(query, conversationContext, req.user?.id || null);

        // Save the User/AI interaction to DB so memory builds up
        if (result.success) {
            try {
                // Detect the hidden auto-analysis prompt
                const isHiddenPrompt = query.includes("Analyze the database for this conversation");

                if (isHiddenPrompt) {
                    // Only save the AI response so it appears as the welcome message
                    await db.query(`
                        INSERT INTO ai_chat_messages (conversation_id, role, content, created_at)
                        VALUES ($1, 'assistant', $2, NOW())
                    `, [conversationId, result.response]);
                } else {
                    // Normal chat: save both user question and AI answer
                    await db.query(`
                        INSERT INTO ai_chat_messages (conversation_id, role, content, created_at)
                        VALUES ($1, 'user', $2, NOW()), ($1, 'assistant', $3, NOW())
                    `, [conversationId, query, result.response]);
                }
            } catch(e) {
                console.error("Error saving chat message:", e);
            }
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

// Execute AI-proposed database actions
router.post('/execute-action', async (req, res) => {
    const { action, table, data, conversationId } = req.body;
    const db = getDatabase();

    // Whitelist of allowed actions
    const ALLOWED_ACTIONS = {
        'insert_offer': { table: 'lender_submissions', type: 'insert' },
        'update_offer': { table: 'lender_submissions', type: 'update' },
        'update_deal': { table: 'conversations', type: 'update' },
        'append_note': { table: 'conversations', type: 'append' }
    };

    if (!ALLOWED_ACTIONS[action]) {
        return res.status(400).json({ success: false, error: 'Invalid action type' });
    }

    try {
        let result;

        switch (action) {
            case 'insert_offer': {
                // Validate lender exists (fuzzy match)
                const lenderCheck = await db.query(
                    `SELECT name FROM lenders WHERE LOWER(name) LIKE LOWER($1)`,
                    [`%${data.lender_name}%`]
                );

                if (lenderCheck.rows.length === 0) {
                    return res.status(400).json({ success: false, error: `Unknown lender: ${data.lender_name}` });
                }

                // Check for duplicate (fuzzy match)
                const dupCheck = await db.query(
                    `SELECT id FROM lender_submissions WHERE conversation_id = $1 AND LOWER(lender_name) LIKE LOWER($2)`,
                    [conversationId, `%${data.lender_name}%`]
                );

                if (dupCheck.rows.length > 0) {
                    return res.status(400).json({
                        success: false,
                        error: `Submission for ${data.lender_name} already exists. Use update instead.`
                    });
                }

                const { v4: uuidv4 } = require('uuid');
                await db.query(`
                    INSERT INTO lender_submissions (
                        id, conversation_id, lender_name, status,
                        offer_amount, factor_rate, term_length, term_unit, payment_frequency,
                        created_at, submitted_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
                `, [
                    uuidv4(),
                    conversationId,
                    lenderCheck.rows[0].name, // Use canonical name
                    data.status || 'OFFER',
                    data.offer_amount || null,
                    data.factor_rate || null,
                    data.term_length || null,
                    data.term_unit || null,
                    data.payment_frequency || null
                ]);

                result = { message: `Added ${lenderCheck.rows[0].name} offer: $${data.offer_amount?.toLocaleString() || 0}` };
                break;
            }

            case 'update_offer': {
                const updates = [];
                const values = [];
                let idx = 1;

                const allowedFields = ['offer_amount', 'factor_rate', 'term_length', 'term_unit', 'payment_frequency', 'status', 'decline_reason'];

                for (const [key, value] of Object.entries(data)) {
                    if (allowedFields.includes(key) && value !== undefined) {
                        updates.push(`${key} = $${idx}`);
                        values.push(value);
                        idx++;
                    }
                }

                if (updates.length === 0) {
                    return res.status(400).json({ success: false, error: 'No valid fields to update' });
                }

                values.push(conversationId, `%${data.lender_name}%`);

                const updateResult = await db.query(`
                    UPDATE lender_submissions
                    SET ${updates.join(', ')}, last_response_at = NOW()
                    WHERE conversation_id = $${idx} AND LOWER(lender_name) LIKE LOWER($${idx + 1})
                `, values);

                if (updateResult.rowCount === 0) {
                    return res.status(404).json({ success: false, error: `No submission found for ${data.lender_name}` });
                }

                result = { message: `Updated ${data.lender_name} offer` };
                break;
            }

            case 'update_deal': {
                const updates = [];
                const values = [];
                let idx = 1;

                const allowedFields = ['state', 'priority', 'funded_amount', 'funded_at', 'has_offer', 'disposition'];

                for (const [key, value] of Object.entries(data)) {
                    if (allowedFields.includes(key) && value !== undefined) {
                        updates.push(`${key} = $${idx}`);
                        values.push(value);
                        idx++;
                    }
                }

                if (updates.length === 0) {
                    return res.status(400).json({ success: false, error: 'No valid fields to update' });
                }

                values.push(conversationId);

                await db.query(`
                    UPDATE conversations
                    SET ${updates.join(', ')}, updated_at = NOW()
                    WHERE id = $${idx}
                `, values);

                result = { message: `Deal updated` };
                break;
            }

            case 'append_note': {
                await db.query(`
                    UPDATE conversations
                    SET notes = COALESCE(notes, '') || E'\n' || $1, updated_at = NOW()
                    WHERE id = $2
                `, [data.note, conversationId]);

                result = { message: `Note added` };
                break;
            }
        }

        // Emit refresh event
        if (global.io) {
            global.io.emit('refresh_lead_list', { conversationId });
        }

        res.json({ success: true, ...result });

    } catch (error) {
        console.error('Action execution error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
