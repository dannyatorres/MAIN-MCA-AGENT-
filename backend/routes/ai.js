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
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('🤖 [AI CHAT] REQUEST RECEIVED');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('Time:', new Date().toISOString());

    // 🛡️ SECURITY FIX: Mask sensitive headers in logs
    const safeHeaders = { ...req.headers };
    if (safeHeaders.authorization) safeHeaders.authorization = '[REDACTED]';
    if (safeHeaders.cookie) safeHeaders.cookie = '[REDACTED]';
    console.log('Headers:', safeHeaders);

    console.log('Body:', JSON.stringify(req.body, null, 2));
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');

    // Add CORS headers explicitly
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    const startTime = Date.now();

    try {
        const { conversationId, query, includeContext = true } = req.body;

        console.log('🔍 Parsed request body:', {
            conversationId,
            query: query?.substring(0, 50),
            includeContext,
            fullBody: JSON.stringify(req.body)
        });

        console.log('🤖 [AI CHAT] Route handler called:', {
            conversationId,
            hasQuery: !!query,
            queryLength: query?.length,
            includeContext
        });

        if (!query) {
            console.log('❌ [AI CHAT] No query provided');
            return res.status(400).json({
                success: false,
                error: 'Query is required'
            });
        }

        console.log('🤖 [AI CHAT] Processing request:', { conversationId, query: query.substring(0, 50) + '...' });

        const db = getDatabase();
        let conversationContext = null;

        // Build comprehensive context if conversation ID provided
        if (conversationId && includeContext) {
            console.log('📊 Building conversation context...');

            // Get conversation details
            const convResult = await db.query(`
                SELECT c.*, ld.*
                FROM conversations c
                LEFT JOIN lead_details ld ON c.id = ld.conversation_id
                WHERE c.id = $1
            `, [conversationId]);

            if (convResult.rows.length > 0) {
                const conversation = convResult.rows[0];

                // Get recent messages (limit to last 20 for context)
                const messagesResult = await db.query(`
                    SELECT content, direction, timestamp, sent_by, message_type
                    FROM messages
                    WHERE conversation_id = $1
                    ORDER BY timestamp DESC
                    LIMIT 20
                `, [conversationId]);

                // Count outbound messages
                const outboundCountResult = await db.query(`
                    SELECT COUNT(*) as count
                    FROM messages
                    WHERE conversation_id = $1 AND direction = 'outbound'
                `, [conversationId]);

                // Get last outbound message time
                const lastOutboundResult = await db.query(`
                    SELECT MAX(timestamp) as last_time
                    FROM messages
                    WHERE conversation_id = $1 AND direction = 'outbound'
                `, [conversationId]);

                // Get documents (with error handling for missing table)
                let docsResult = { rows: [] };
                try {
                    docsResult = await db.query(`
                        SELECT *
                        FROM documents
                        WHERE conversation_id = $1
                        ORDER BY created_at DESC
                    `, [conversationId]);
                } catch (err) {
                    console.log('📄 Documents table not available:', err.message);
                }

                // Get FCS report if available (with error handling)
                let fcsResult = { rows: [] };
                try {
                    // ✅ FIX: Query 'fcs_analyses' (the correct table) instead of 'fcs_reports'
                    // We map 'fcs_report' to 'report_content' so the rest of the logic works unchanged.
                    fcsResult = await db.query(`
                        SELECT
                            fcs_report as report_content,
                            completed_at as generated_at,
                            extracted_business_name as business_name,
                            statement_count
                        FROM fcs_analyses
                        WHERE conversation_id = $1 AND status = 'completed'
                        ORDER BY completed_at DESC
                        LIMIT 1
                    `, [conversationId]);

                    // Fallback: If no analysis found, check for legacy 'fcs_results' data
                    if (fcsResult.rows.length === 0) {
                        try {
                            const legacyResult = await db.query(`
                                SELECT analysis_notes as report_content, created_at as generated_at
                                FROM fcs_results
                                WHERE conversation_id = $1
                                ORDER BY created_at DESC LIMIT 1
                            `, [conversationId]);

                            if (legacyResult.rows.length > 0) {
                                fcsResult = legacyResult;
                                console.log('📊 Found legacy FCS data in fcs_results');
                            }
                        } catch (legacyError) {
                            // Ignore legacy table errors
                        }
                    }
                } catch (err) {
                    console.log('📊 FCS table lookup error:', err.message);
                }

                // Get lender submissions (with error handling)
                let lenderResult = { rows: [] };
                try {
                    lenderResult = await db.query(`
                        SELECT l.name as lender_name, ls.status, ls.submitted_at as date
                        FROM lender_submissions ls
                        JOIN lenders l ON ls.lender_id = l.id
                        WHERE ls.conversation_id = $1
                        ORDER BY ls.submitted_at DESC
                    `, [conversationId]);
                } catch (err) {
                    console.log('🏦 Lender submissions table not available:', err.message);
                }

                // Build context object
                conversationContext = {
                    user_query: query,
                    business_name: conversation.business_name,
                    lead_phone: conversation.lead_phone,
                    email: conversation.lead_email,
                    industry: conversation.industry || conversation.business_type,
                    state: conversation.state,
                    stage: conversation.current_step,
                    monthly_revenue: conversation.monthly_revenue,
                    time_in_business: conversation.time_in_business_months ? `${conversation.time_in_business_months} months` : null,
                    funding_amount: conversation.requested_amount,
                    credit_range: conversation.credit_score,
                    has_application: !!conversation.application_completed,
                    documents_count: docsResult.rows.length,
                    bank_statements_count: 0, // Will be calculated from actual filenames if needed
                    has_tax_returns: false,
                    has_id: false,
                    has_voided_check: false,
                    has_fcs: fcsResult.rows.length > 0,
                    fcs_report: fcsResult.rows.length > 0 ? {
                        generated_at: fcsResult.rows[0].generated_at,
                        business_name: fcsResult.rows[0].business_name,
                        statement_count: fcsResult.rows[0].statement_count,
                        report_content: fcsResult.rows[0].report_content
                    } : null,
                    recent_messages: messagesResult.rows.map(m => ({
                        content: m.content,
                        direction: m.direction,
                        timestamp: m.timestamp,
                        sent_by: m.sent_by
                    })),
                    outbound_message_count: parseInt(outboundCountResult.rows[0].count) || 0,
                    last_outbound_time: lastOutboundResult.rows[0]?.last_time || null,
                    lender_submissions: lenderResult.rows,
                    days_in_pipeline: conversation.created_at ?
                        Math.floor((Date.now() - new Date(conversation.created_at)) / (1000 * 60 * 60 * 24)) : 0
                };

                console.log('✅ Context built:', {
                    messages: conversationContext.recent_messages.length,
                    documents: docsResult.rows.length,
                    has_fcs: conversationContext.has_fcs,
                    outbound_count: conversationContext.outbound_message_count
                });
            }
        }

        // Set timeout for AI request (30 seconds)
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('AI request timeout after 30 seconds')), 30000);
        });

        // Call AI service
        console.log('🚀 [AI CHAT] Calling aiService.generateResponse()...');
        console.log('📋 [AI CHAT] Context summary:', {
            hasContext: !!conversationContext,
            businessName: conversationContext?.business_name,
            messagesCount: conversationContext?.recent_messages?.length
        });

        const aiPromise = aiService.generateResponse(query, conversationContext);

        // Race between AI call and timeout
        const result = await Promise.race([aiPromise, timeoutPromise]);

        console.log('📥 [AI CHAT] AI Service returned:', {
            success: result.success,
            hasResponse: !!result.response,
            hasFallback: !!result.fallback,
            error: result.error,
            responseLength: (result.response || result.fallback)?.length
        });

        const responseTime = Date.now() - startTime;

        // Save AI conversation to database (with error handling)
        if (conversationId) {
            try {
                // Save user message
                await db.query(`
                    INSERT INTO ai_chat_messages (
                        conversation_id, role, content, created_at
                    )
                    VALUES ($1, $2, $3, NOW())
                `, [conversationId, 'user', query]);

                // Save AI response
                await db.query(`
                    INSERT INTO ai_chat_messages (
                        conversation_id, role, content,
                        ai_model, ai_tokens_used, ai_response_time_ms,
                        ai_context_used, created_at
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
                `, [
                    conversationId,
                    'assistant',
                    result.response || result.fallback,
                    'gpt-4o',
                    result.usage?.total_tokens || 0,
                    responseTime,
                    !!conversationContext
                ]);

                console.log('💾 AI messages saved to database');
            } catch (err) {
                console.log('💾 Could not save AI message to database:', err.message);
            }
        }

        console.log(`✅ AI Response generated in ${responseTime}ms`);

        const responsePayload = {
            success: result.success,
            response: result.response || result.fallback,
            responseTime: responseTime,
            usage: result.usage,
            error: result.error || null
        };

        console.log('📤 [AI CHAT] Sending response to frontend:', {
            success: responsePayload.success,
            responseLength: responsePayload.response?.length,
            hasError: !!responsePayload.error,
            responsePreview: responsePayload.response?.substring(0, 100)
        });

        res.json(responsePayload);

    } catch (error) {
        const responseTime = Date.now() - startTime;
        console.error('❌ AI Chat Error:', error.message);

        // Provide helpful fallback responses for different error types
        let fallbackResponse = 'I apologize, but I encountered an error. ';

        if (error.message.includes('timeout')) {
            fallbackResponse = 'The AI service is taking too long to respond. Please try again with a shorter question.';
        } else if (error.message.includes('API key')) {
            fallbackResponse = 'The AI service is not configured. Please contact your administrator to set up the OpenAI API key.';
        } else if (error.message.includes('quota')) {
            fallbackResponse = 'The AI service has reached its usage limit. Please contact your administrator.';
        } else {
            fallbackResponse = 'I encountered an error while processing your request. Please try again.';
        }

        // Return 200 with error details so frontend can display fallback
        res.json({
            success: false,
            error: error.message,
            response: fallbackResponse,
            responseTime: responseTime
        });
    }
});

// Quick ping test (no OpenAI call)
router.post('/ping', async (req, res) => {
    console.log('🏓 [AI PING] Received ping request');
    const { query, conversationId } = req.body;

    res.json({
        success: true,
        response: `Pong! I received your message: "${query?.substring(0, 50)}..." for conversation ${conversationId}. OpenAI would be called here.`,
        test: true,
        timestamp: Date.now()
    });
});

// Test AI connection
router.get('/test', async (req, res) => {
    try {
        console.log('🧪 Testing AI connection...');

        if (!aiService.isConfigured()) {
            return res.json({
                success: false,
                configured: false,
                message: 'OpenAI API key not configured. Please add OPENAI_API_KEY to your .env file.'
            });
        }

        // Simple test query
        const result = await aiService.generateResponse(
            'Say "AI service is working" in exactly those words.',
            null
        );

        console.log('✅ AI Test Result:', result.success ? 'Working' : 'Failed');

        res.json({
            success: result.success,
            configured: true,
            response: result.response || result.fallback,
            error: result.error || null
        });

    } catch (error) {
        console.error('❌ AI Test Error:', error.message);
        res.json({
            success: false,
            configured: aiService.isConfigured(),
            error: error.message
        });
    }
});

// Get AI conversation history for a conversation
router.get('/messages/:conversationId', async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { limit = 50, offset = 0 } = req.query;
        const db = getDatabase();

        console.log('📜 Getting AI message history for:', conversationId);

        const result = await db.query(`
            SELECT id, role, content, ai_model, ai_tokens_used,
                   ai_response_time_ms, ai_context_used, created_at
            FROM ai_chat_messages
            WHERE conversation_id = $1
            ORDER BY created_at ASC
            LIMIT $2 OFFSET $3
        `, [conversationId, parseInt(limit), parseInt(offset)]);

        console.log(`✅ Found ${result.rows.length} AI messages`);

        res.json({
            success: true,
            messages: result.rows
        });

    } catch (error) {
        console.error('❌ Error fetching AI messages:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get AI configuration status
router.get('/status', (req, res) => {
    const config = aiService.getConfiguration();

    res.json({
        success: true,
        configured: config.hasApiKey,
        model: config.model,
        maxTokens: config.maxTokens,
        temperature: config.temperature,
        status: config.hasApiKey ? 'Ready' : 'Not Configured'
    });
});

// Get AI chat history for a conversation (from ai_chat_messages table)
router.get('/chat/:conversationId', async (req, res) => {
    try {
        const { conversationId } = req.params;
        const db = getDatabase();

        console.log('📜 Getting AI chat history for:', conversationId);

        const result = await db.query(`
            SELECT
                id,
                role,
                content,
                created_at,
                ai_model,
                ai_tokens_used
            FROM ai_chat_messages
            WHERE conversation_id = $1
            ORDER BY created_at ASC
        `, [conversationId]);

        console.log(`✅ Found ${result.rows.length} AI chat messages`);

        res.json({
            success: true,
            messages: result.rows
        });
    } catch (error) {
        console.error('❌ Error fetching AI chat history:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Save AI chat message (to ai_chat_messages table)
router.post('/chat/:conversationId/messages', async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { role, content, ai_model, ai_tokens_used, ai_response_time_ms } = req.body;

        if (!role || !content) {
            return res.status(400).json({
                success: false,
                error: 'Role and content are required'
            });
        }

        if (!['user', 'assistant'].includes(role)) {
            return res.status(400).json({
                success: false,
                error: 'Role must be either "user" or "assistant"'
            });
        }

        const db = getDatabase();

        const result = await db.query(`
            INSERT INTO ai_chat_messages
            (conversation_id, role, content, ai_model, ai_tokens_used, ai_response_time_ms)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id, created_at
        `, [conversationId, role, content, ai_model || null, ai_tokens_used || null, ai_response_time_ms || null]);

        console.log(`💬 Saved AI chat message: ${role} - ${content.substring(0, 50)}...`);

        res.json({
            success: true,
            message: {
                id: result.rows[0].id,
                created_at: result.rows[0].created_at,
                conversation_id: conversationId,
                role: role,
                content: content
            }
        });
    } catch (error) {
        console.error('❌ Error saving AI chat message:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
