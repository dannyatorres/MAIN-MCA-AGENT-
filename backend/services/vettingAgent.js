// backend/services/vettingAgent.js
// 🔍 AGENT 2: VETTING AGENT
// Handles: PRE_VETTED, VETTING, SUBMITTED states
// Goal: Clarify deal details, validate merchant expectations, auto-submit when ready

const { OpenAI } = require('openai');
const { getDatabase } = require('./database');
const { trackUsage } = require('./usageTracker');
const { updateState } = require('./stateManager');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ==========================================
// STATES THIS AGENT OWNS
// ==========================================
const VETTING_STATES = ['PRE_VETTED', 'VETTING', 'HAIL_MARY', 'HAIL_MARY_FU_1'];
const STALL_STATES = ['SUBMITTED']; // Can respond but only to stall
const PRE_VETTED_STALL_MESSAGES = [
    "running numbers now, will text shortly",
    "give me a few mins, pulling numbers",
    "one sec, checking the numbers"
];

// ==========================================
// TOOLS FOR VETTING AGENT
// ==========================================
const VETTING_TOOLS = [
    {
        type: "function",
        function: {
            name: "update_vetting_status",
            description: "Update the lead status based on vetting results",
            parameters: {
                type: "object",
                properties: {
                    status: {
                        type: "string",
                        enum: ["VETTING", "READY_TO_SUBMIT", "NEEDS_MORE_INFO", "DEAD"],
                        description: "The vetting status"
                    },
                    reason: {
                        type: "string",
                        description: "Reason for the status update"
                    }
                },
                required: ["status"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "submit_to_lenders",
            description: "Call this when vetting is complete and you're confident the deal is ready. This will submit to lenders automatically.",
            parameters: {
                type: "object",
                properties: {
                    confirmed_amount: {
                        type: "number",
                        description: "The funding amount the merchant confirmed they want"
                    },
                    notes: {
                        type: "string",
                        description: "Any notes about the deal"
                    }
                },
                required: ["confirmed_amount"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "no_response_needed",
            description: "Call this when the lead's message doesn't need a response (acknowledgments like 'ok', 'thanks', etc.)",
            parameters: { type: "object", properties: {} }
        }
    },
    {
        type: "function",
        function: {
            name: "escalate_to_human",
            description: "Call this if something seems off or you need human review",
            parameters: {
                type: "object",
                properties: {
                    reason: {
                        type: "string",
                        description: "Why you're escalating"
                    }
                },
                required: ["reason"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "request_documents",
            description: "Call this when FCS shows documents are missing or outdated (coverage gap between last statement and today). Ask merchant to send updated bank statements.",
            parameters: {
                type: "object",
                properties: {
                    documents_needed: {
                        type: "array",
                        items: { type: "string" },
                        description: "List of documents needed (e.g., 'January statement', 'February statement')"
                    }
                },
                required: ["documents_needed"]
            }
        }
    }
];

// ==========================================
// LOAD PROMPT
// ==========================================
async function getVettingPrompt(userId) {
    try {
        const promptPath = path.join(__dirname, '../prompts/vetting_agent.md');
        
        let agentName = 'Dan Torres';
        let agentEmail = 'mike@jmsglobal.biz';
        if (userId) {
            const db = getDatabase();
            const result = await db.query('SELECT agent_name, email FROM users WHERE id = $1', [userId]);
            if (result.rows[0]?.agent_name) {
                agentName = result.rows[0].agent_name;
            }
            if (result.rows[0]?.email) {
                agentEmail = result.rows[0].email;
            }
        }

        if (fs.existsSync(promptPath)) {
            let prompt = fs.readFileSync(promptPath, 'utf8');
            prompt = prompt.replace(/\{\{AGENT_NAME\}\}/g, agentName);
            prompt = prompt.replace(/\{\{AGENT_EMAIL\}\}/g, agentEmail);
            return prompt;
        }

        // Fallback prompt
        return `You are ${agentName}, continuing the conversation with a merchant. 
You've already qualified them. Now you're clarifying deal details before submitting to lenders.
Keep texts short and casual. One question at a time.`;

    } catch (err) {
        console.error('⚠️ Error loading vetting prompt:', err.message);
        return 'You are a vetting agent. Clarify deal details before submission.';
    }
}

// ==========================================
// MAIN FUNCTION
// ==========================================
async function processMessage(conversationId, inboundMessage, systemInstruction = null) {
    const db = getDatabase();
    
    console.log(`\n🔍 [VETTING AGENT] Processing message for ${conversationId}`);

    try {
        // =================================================================
        // 1. CHECK IF THIS AGENT SHOULD HANDLE THIS CONVERSATION
        // =================================================================
        const convRes = await db.query(`
            SELECT state, ai_enabled, created_by_user_id, assigned_user_id,
                   first_name, business_name, email, credit_score
            FROM conversations 
            WHERE id = $1
        `, [conversationId]);

        if (!convRes.rows[0]) {
            console.log('❌ Conversation not found');
            return { shouldReply: false };
        }

        const conv = convRes.rows[0];
        const currentState = conv.state;
        const usageUserId = conv.assigned_user_id || conv.created_by_user_id || null;

        // Check if AI is disabled
        if (conv.ai_enabled === false) {
            console.log('⛔ AI disabled for this conversation');
            return { shouldReply: false };
        }

        // Check if this agent owns this state
        const isVettingState = VETTING_STATES.includes(currentState);
        const isStallState = STALL_STATES.includes(currentState);
        const isManualCommand = systemInstruction && systemInstruction.length > 5;

        if (!isVettingState && !isStallState && !isManualCommand) {
            console.log(`🚫 [VETTING AGENT] Not my state: ${currentState}`);
            return { shouldReply: false };
        }

        // =================================================================
        // 2. GATHER CONTEXT: COMMANDER STRATEGY
        // =================================================================
        const strategyRes = await db.query(`
            SELECT game_plan, lead_grade, strategy_type, recommended_funding_max,
                   recommended_term, recommended_payment
            FROM lead_strategy
            WHERE conversation_id = $1
        `, [conversationId]);

        let gamePlan = null;
        let strategyMeta = null;

        if (strategyRes.rows[0]) {
            strategyMeta = strategyRes.rows[0];
            gamePlan = strategyRes.rows[0].game_plan;
            if (typeof gamePlan === 'string') {
                gamePlan = JSON.parse(gamePlan);
            }
            console.log(`🎖️ Strategy Loaded: Grade ${strategyMeta.lead_grade} | ${strategyMeta.strategy_type}`);
        }
        if (!strategyRes.rows[0] && currentState === 'PRE_VETTED' && !isManualCommand) {
            console.log('⏳ [VETTING AGENT] Strategy not ready - stalling response');
            const stallMessage = PRE_VETTED_STALL_MESSAGES[Math.floor(Math.random() * PRE_VETTED_STALL_MESSAGES.length)];
            return {
                shouldReply: true,
                content: stallMessage
            };
        }

        // =================================================================
        // 4. GATHER CONTEXT: LENDER SUBMISSIONS (for stall mode)
        // =================================================================
        const submissionsRes = await db.query(`
            SELECT lender_name, status, offer_amount, submitted_at, last_response_at
            FROM lender_submissions
            WHERE conversation_id = $1
            ORDER BY submitted_at DESC
        `, [conversationId]);

        const submissions = submissionsRes.rows;
        const pendingSubmissions = submissions.filter(s => s.status === 'sent');
        const hasOffers = submissions.some(s => s.status === 'OFFER');

        // If offers exist, this should go to negotiating agent
        if (hasOffers && !isManualCommand) {
            console.log('📨 Offers exist - should be handled by Negotiating Agent');
            // Update state to trigger negotiating agent
            await updateState(conversationId, 'OFFER_RECEIVED', 'vetter');
            return { shouldReply: false };
        }

        // =================================================================
        // 5. GATHER CONTEXT: CONVERSATION HISTORY
        // =================================================================
        const historyRes = await db.query(`
            SELECT direction, content, timestamp 
            FROM messages
            WHERE conversation_id = $1
            ORDER BY timestamp ASC 
            LIMIT 30
        `, [conversationId]);

        const history = historyRes.rows;

        // =================================================================
        // 6. CHECK FOR ACKNOWLEDGMENTS (stay silent)
        // =================================================================
        const lastInbound = inboundMessage?.toLowerCase().trim() || '';
        const acknowledgments = ['thanks', 'thank you', 'ty', 'ok', 'okay', 'k', 'got it', 
                                  'sounds good', 'cool', 'great', 'perfect', 'awesome', '👍', '👌'];

        if (acknowledgments.some(ack => lastInbound === ack || lastInbound === ack + '!' || lastInbound === ack + '.')) {
            console.log('🤝 Acknowledgment detected - staying silent');
            return { shouldReply: false };
        }

        // =================================================================
        // 7. BUILD SYSTEM PROMPT WITH CONTEXT
        // =================================================================
        let systemPrompt = await getVettingPrompt(usageUserId);

        // Add lead info
        systemPrompt += `\n\n## CURRENT LEAD INFO\n`;
        systemPrompt += `- **Name:** ${conv.first_name || 'Unknown'}\n`;
        systemPrompt += `- **Business:** ${conv.business_name || 'Unknown'}\n`;
        systemPrompt += `- **Email:** ${conv.email || 'Not collected'}\n`;
        systemPrompt += `- **Credit Score:** ${conv.credit_score || 'Unknown'}\n`;
        systemPrompt += `- **Current State:** ${currentState}\n`;

        // Add current date context
        systemPrompt += `\n## CURRENT DATE\n`;
        systemPrompt += `- **Today:** ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}\n`;

        // Add strategy context if available
        if (gamePlan) {
            systemPrompt += `\n## COMMANDER STRATEGY\n`;
            systemPrompt += `- **Lead Grade:** ${strategyMeta.lead_grade || 'Unknown'}\n`;
            systemPrompt += `- **Strategy Type:** ${strategyMeta.strategy_type || 'STANDARD'}\n`;
            systemPrompt += `- **Recommended Max Funding:** $${(strategyMeta.recommended_funding_max || 0).toLocaleString()}\n`;
            systemPrompt += `- **Recommended Term:** ${strategyMeta.recommended_term || 'Unknown'} weeks\n`;
            
            if (gamePlan.offer_range) {
                systemPrompt += `- **Offer Range:** $${gamePlan.offer_range.min?.toLocaleString()} - $${gamePlan.offer_range.max?.toLocaleString()}\n`;
            }
            if (gamePlan.stacking_assessment) {
                systemPrompt += `- **Current Position:** ${gamePlan.stacking_assessment.current_positions || 0}\n`;
                systemPrompt += `- **Next Position Would Be:** ${gamePlan.stacking_assessment.next_position_number || 1}\n`;
            }
            if (gamePlan.key_risks && gamePlan.key_risks.length > 0) {
                systemPrompt += `- **Key Risks:** ${gamePlan.key_risks.join(', ')}\n`;
            }
        }

        // Add stall mode context if SUBMITTED
        if (isStallState) {
            systemPrompt += `\n## STALL MODE ACTIVE\n`;
            systemPrompt += `The deal has been submitted to ${pendingSubmissions.length} lender(s). `;
            systemPrompt += `We're waiting for responses. If the merchant asks for updates, stall naturally:\n`;
            systemPrompt += `- "still waiting on final numbers, should know soon"\n`;
            systemPrompt += `- "they're reviewing it now, ill let you know as soon as i hear back"\n`;
            systemPrompt += `- "should have something for you shortly"\n`;
        }

        // Add manual instruction if provided
        if (systemInstruction) {
            systemPrompt += `\n## SPECIAL INSTRUCTION\n${systemInstruction}\n`;
        }

        // =================================================================
        // 8. BUILD MESSAGES FOR OPENAI
        // =================================================================
        const messages = [{ role: "system", content: systemPrompt }];

        // Add conversation history
        for (const msg of history) {
            messages.push({
                role: msg.direction === 'inbound' ? 'user' : 'assistant',
                content: msg.content
            });
        }

        // Add current message if not already in history
        if (inboundMessage && !history.some(m => m.content === inboundMessage)) {
            messages.push({ role: "user", content: inboundMessage });
        }

        // =================================================================
        // 9. CALL OPENAI
        // =================================================================
        console.log('🤖 [VETTING AGENT] Calling OpenAI...');

        const response = await openai.chat.completions.create({
            model: "gpt-5.2",
            messages: messages,
            tools: VETTING_TOOLS,
            tool_choice: "auto"
        });

        // Track usage
        if (response.usage) {
            await trackUsage({
                userId: usageUserId,
                conversationId,
                type: 'llm_call',
                service: 'openai',
                model: response.model || 'gpt-4o-mini',
                inputTokens: response.usage.prompt_tokens,
                outputTokens: response.usage.completion_tokens,
                metadata: { agent: 'vetting' }
            });
        }

        const choice = response.choices[0];

        // =================================================================
        // 10. HANDLE TOOL CALLS
        // =================================================================
        if (choice.finish_reason === 'tool_calls' && choice.message.tool_calls) {
            let toolResult = "Done";

            for (const tool of choice.message.tool_calls) {
                console.log(`🔧 [VETTING AGENT] Tool called: ${tool.function.name}`);

                if (tool.function.name === 'no_response_needed') {
                    console.log('🤫 No response needed');
                    return { shouldReply: false };
                }

                if (tool.function.name === 'update_vetting_status') {
                    const args = JSON.parse(tool.function.arguments);
                    console.log(`📝 Vetting status: ${args.status} - ${args.reason || ''}`);
                    
                    if (args.status === 'VETTING') {
                        await updateState(conversationId, 'VETTING', 'vetter');
                    } else if (args.status === 'DEAD') {
                        await updateState(conversationId, 'DEAD', 'vetter');
                    }
                }

                if (tool.function.name === 'submit_to_lenders') {
                    const args = JSON.parse(tool.function.arguments);
                    console.log(`🚀 Ready to submit! Amount: $${args.confirmed_amount}`);
                    
                    // Update state to SUBMITTED
                    await updateState(conversationId, 'SUBMITTED', 'vetter');
                    
                    // TODO: Trigger actual submission via submissions.js route
                    // For now, just log it - you'll wire this up to your submission flow
                    console.log(`📤 [TODO] Trigger lender submission for $${args.confirmed_amount}`);
                }

                if (tool.function.name === 'escalate_to_human') {
                    const args = JSON.parse(tool.function.arguments);
                    console.log(`🚨 Escalating to human: ${args.reason}`);
                    await updateState(conversationId, 'HUMAN_REVIEW', 'vetter');
                    return {
                        shouldReply: true,
                        content: "let me have my manager take a look at this, one sec"
                    };
                }

                if (tool.function.name === 'request_documents') {
                    const args = JSON.parse(tool.function.arguments);
                    console.log(`📄 Requesting documents: ${args.documents_needed.join(', ')}`);

                    // Get user's email to tell merchant where to send
                    const userRes = await db.query(`
                        SELECT u.email FROM users u
                        JOIN conversations c ON c.assigned_user_id = u.id OR c.created_by_user_id = u.id
                        WHERE c.id = $1 LIMIT 1
                    `, [conversationId]);

                    const sendToEmail = userRes.rows[0]?.email || null;

                    // Store tool result for follow-up
                    if (sendToEmail) {
                        toolResult = `Ask merchant to send: ${args.documents_needed.join(', ')}. Email to: ${sendToEmail}`;
                    } else {
                        toolResult = `Ask merchant to send: ${args.documents_needed.join(', ')}. Ask them for email to send docs to.`;
                    }
                }
            }

            // Generate follow-up response after tool calls
            messages.push(choice.message);
            messages.push({
                role: "tool",
                tool_call_id: choice.message.tool_calls[0].id,
                content: toolResult
            });

            const followUp = await openai.chat.completions.create({
                model: "gpt-5.2",
                messages: messages
            });

            const finalContent = followUp.choices[0]?.message?.content;
            if (finalContent) {
                return { shouldReply: true, content: finalContent };
            }
        }

        // =================================================================
        // 11. RETURN RESPONSE
        // =================================================================
        const content = choice.message?.content;

        if (!content || content.trim() === '') {
            console.log('⚠️ Empty response from OpenAI');
            return { shouldReply: false };
        }

        console.log(`✅ [VETTING AGENT] Response: "${content.substring(0, 100)}..."`);
        return { shouldReply: true, content: content };

    } catch (err) {
        console.error('❌ [VETTING AGENT] Error:', err.message);
        console.error(err.stack);
        return { shouldReply: false };
    }
}

// ==========================================
// EXPORTS
// ==========================================
module.exports = {
    processMessage,
    VETTING_STATES,
    STALL_STATES
};
