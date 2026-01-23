// backend/services/negotiatingAgent.js
// 💰 AGENT 3: NEGOTIATING AGENT
// Handles: OFFER_RECEIVED, NEGOTIATING states
// Goal: Present offers, handle objections, close the deal

const { OpenAI } = require('openai');
const { getDatabase } = require('./database');
const { trackUsage } = require('./usageTracker');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ==========================================
// STATES THIS AGENT OWNS
// ==========================================
const NEGOTIATING_STATES = ['OFFER_RECEIVED', 'NEGOTIATING'];

// ==========================================
// TOOLS FOR NEGOTIATING AGENT
// ==========================================
const NEGOTIATING_TOOLS = [
    {
        type: "function",
        function: {
            name: "present_offer",
            description: "Present a specific offer to the merchant. Call this when you're ready to share the numbers.",
            parameters: {
                type: "object",
                properties: {
                    lender_name: {
                        type: "string",
                        description: "Which lender's offer to present"
                    },
                    offer_amount: {
                        type: "number",
                        description: "The offer amount"
                    },
                    highlight: {
                        type: "string",
                        description: "What to emphasize (amount, term, payment, etc.)"
                    }
                },
                required: ["offer_amount"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "update_negotiation_status",
            description: "Update the negotiation status",
            parameters: {
                type: "object",
                properties: {
                    status: {
                        type: "string",
                        enum: ["NEGOTIATING", "VERBAL_ACCEPT", "CLOSED_WON", "CLOSED_LOST", "STALLED"],
                        description: "The negotiation status"
                    },
                    reason: {
                        type: "string",
                        description: "Reason for the status"
                    }
                },
                required: ["status"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "request_counter_offer",
            description: "If the merchant wants different terms, use this to log their counter and potentially get revised numbers",
            parameters: {
                type: "object",
                properties: {
                    requested_amount: {
                        type: "number",
                        description: "Amount they're asking for"
                    },
                    requested_payment: {
                        type: "number",
                        description: "Payment they want"
                    },
                    objection: {
                        type: "string",
                        description: "What they're objecting to"
                    }
                },
                required: ["objection"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "no_response_needed",
            description: "Call this when the lead's message doesn't need a response",
            parameters: { type: "object", properties: {} }
        }
    },
    {
        type: "function",
        function: {
            name: "escalate_to_human",
            description: "Call this if you need human help to close the deal or handle a complex objection",
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
            name: "send_contract",
            description: "Call this when the merchant verbally accepts and is ready to sign",
            parameters: {
                type: "object",
                properties: {
                    offer_id: {
                        type: "string",
                        description: "Which offer they accepted"
                    },
                    email: {
                        type: "string",
                        description: "Email to send contract to"
                    }
                },
                required: ["email"]
            }
        }
    }
];

// ==========================================
// LOAD PROMPT
// ==========================================
async function getNegotiatingPrompt(userId) {
    try {
        const promptPath = path.join(__dirname, '../prompts/negotiating_agent.md');
        
        let agentName = 'Dan Torres';
        if (userId) {
            const db = getDatabase();
            const result = await db.query('SELECT agent_name FROM users WHERE id = $1', [userId]);
            if (result.rows[0]?.agent_name) {
                agentName = result.rows[0].agent_name;
            }
        }

        if (fs.existsSync(promptPath)) {
            let prompt = fs.readFileSync(promptPath, 'utf8');
            prompt = prompt.replace(/\{\{AGENT_NAME\}\}/g, agentName);
            return prompt;
        }

        // Fallback prompt
        return `You are ${agentName}, closing a deal with a merchant.
You have offers from lenders. Present them confidently.
Handle objections about payment amounts, terms, etc.
Goal: Get them to say YES and sign.
Keep texts short and direct.`;

    } catch (err) {
        console.error('⚠️ Error loading negotiating prompt:', err.message);
        return 'You are a negotiating agent. Close the deal.';
    }
}

// ==========================================
// MAIN FUNCTION
// ==========================================
async function processMessage(conversationId, inboundMessage, systemInstruction = null) {
    const db = getDatabase();
    
    console.log(`\n💰 [NEGOTIATING AGENT] Processing message for ${conversationId}`);

    try {
        // =================================================================
        // 1. CHECK IF THIS AGENT SHOULD HANDLE THIS CONVERSATION
        // =================================================================
        const convRes = await db.query(`
            SELECT state, ai_enabled, created_by_user_id, assigned_user_id,
                   first_name, business_name, email, credit_score, has_offer
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
        const isNegotiatingState = NEGOTIATING_STATES.includes(currentState);
        const isManualCommand = systemInstruction && systemInstruction.length > 5;

        if (!isNegotiatingState && !isManualCommand) {
            console.log(`🚫 [NEGOTIATING AGENT] Not my state: ${currentState}`);
            return { shouldReply: false };
        }

        // =================================================================
        // 2. GATHER CONTEXT: OFFERS FROM LENDER_SUBMISSIONS
        // =================================================================
        const offersRes = await db.query(`
            SELECT 
                id, lender_name, status, offer_amount, factor_rate, 
                term_length, term_unit, payment_frequency,
                offer_details, last_response_at
            FROM lender_submissions
            WHERE conversation_id = $1 AND status = 'OFFER'
            ORDER BY offer_amount DESC
        `, [conversationId]);

        const offers = offersRes.rows;

        if (offers.length === 0 && !isManualCommand) {
            console.log('⚠️ No offers found - should not be in NEGOTIATING state');
            return { shouldReply: false };
        }

        // Calculate best offer details
        const bestOffer = offers[0] || {};
        
        // Calculate payment amount if not stored
        let paymentAmount = null;
        if (bestOffer.offer_amount && bestOffer.factor_rate && bestOffer.term_length) {
            const totalPayback = bestOffer.offer_amount * (bestOffer.factor_rate || 1.49);
            const payments = bestOffer.payment_frequency === 'daily' 
                ? bestOffer.term_length 
                : bestOffer.term_length * (bestOffer.term_unit === 'weeks' ? 5 : 21);
            paymentAmount = Math.round(totalPayback / payments);
        }

        // =================================================================
        // 3. GATHER CONTEXT: FCS DATA (for negotiation leverage)
        // =================================================================
        const fcsRes = await db.query(`
            SELECT average_revenue, average_daily_balance, withholding_percentage
            FROM fcs_analyses
            WHERE conversation_id = $1
            ORDER BY created_at DESC LIMIT 1
        `, [conversationId]);

        const fcsData = fcsRes.rows[0] || null;

        // =================================================================
        // 4. GATHER CONTEXT: STRATEGY (for negotiation boundaries)
        // =================================================================
        const strategyRes = await db.query(`
            SELECT game_plan, lead_grade, recommended_funding_max, recommended_payment
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
        // 6. CHECK FOR ACKNOWLEDGMENTS
        // =================================================================
        const lastInbound = inboundMessage?.toLowerCase().trim() || '';
        const simpleAcks = ['ok', 'okay', 'k', 'got it', 'cool', '👍', '👌'];

        // Don't stay silent for positive responses in negotiation - those might be accepts!
        const positiveResponses = ['yes', 'yeah', 'sure', 'lets do it', "let's do it", 'im in', "i'm in", 'deal', 'sounds good', 'perfect'];
        
        if (simpleAcks.includes(lastInbound) && !positiveResponses.some(p => lastInbound.includes(p))) {
            console.log('🤝 Simple acknowledgment - staying silent');
            return { shouldReply: false };
        }

        // =================================================================
        // 7. BUILD SYSTEM PROMPT WITH CONTEXT
        // =================================================================
        let systemPrompt = await getNegotiatingPrompt(usageUserId);

        // Add lead info
        systemPrompt += `\n\n## CURRENT LEAD\n`;
        systemPrompt += `- **Name:** ${conv.first_name || 'Unknown'}\n`;
        systemPrompt += `- **Business:** ${conv.business_name || 'Unknown'}\n`;
        systemPrompt += `- **Email:** ${conv.email || 'Not collected'}\n`;
        systemPrompt += `- **Credit Score:** ${conv.credit_score || 'Unknown'}\n`;

        // Add offers context
        systemPrompt += `\n## AVAILABLE OFFERS\n`;
        if (offers.length > 0) {
            offers.forEach((offer, i) => {
                systemPrompt += `\n### Offer ${i + 1}: ${offer.lender_name}\n`;
                systemPrompt += `- **Amount:** $${Number(offer.offer_amount).toLocaleString()}\n`;
                systemPrompt += `- **Factor Rate:** ${offer.factor_rate || 1.49}\n`;
                systemPrompt += `- **Term:** ${offer.term_length} ${offer.term_unit || 'weeks'}\n`;
                systemPrompt += `- **Payment:** ${offer.payment_frequency || 'weekly'}\n`;
                
                // Add calculated payment if available
                if (i === 0 && paymentAmount) {
                    systemPrompt += `- **Est. Payment:** $${paymentAmount.toLocaleString()}/day\n`;
                }
            });
        } else {
            systemPrompt += `No offers loaded yet.\n`;
        }

        // Add financial context for negotiation leverage
        if (fcsData) {
            systemPrompt += `\n## MERCHANT FINANCIALS (Use for negotiation)\n`;
            systemPrompt += `- **Monthly Revenue:** $${(fcsData.average_revenue || 0).toLocaleString()}\n`;
            systemPrompt += `- **Daily Balance:** $${(fcsData.average_daily_balance || 0).toLocaleString()}\n`;
            systemPrompt += `- **Current Withholding:** ${fcsData.withholding_percentage || 'Unknown'}%\n`;
        }

        // Add negotiation boundaries from strategy
        if (strategyMeta) {
            systemPrompt += `\n## NEGOTIATION BOUNDARIES\n`;
            systemPrompt += `- **Lead Grade:** ${strategyMeta.lead_grade || 'Unknown'}\n`;
            systemPrompt += `- **Max Recommended:** $${(strategyMeta.recommended_funding_max || 0).toLocaleString()}\n`;
            
            if (gamePlan?.nextPositionScenarios) {
                systemPrompt += `- **Conservative Floor:** $${gamePlan.nextPositionScenarios.conservative?.[0]?.funding?.toLocaleString() || 'N/A'}\n`;
                systemPrompt += `- **Aggressive Ceiling:** $${gamePlan.nextPositionScenarios.aggressive?.[0]?.funding?.toLocaleString() || 'N/A'}\n`;
            }
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
        console.log('🤖 [NEGOTIATING AGENT] Calling OpenAI...');

        const response = await openai.chat.completions.create({
            model: "gpt-5.2",
            messages: messages,
            tools: NEGOTIATING_TOOLS,
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
                metadata: { agent: 'negotiating' }
            });
        }

        const choice = response.choices[0];

        // =================================================================
        // 10. HANDLE TOOL CALLS
        // =================================================================
        if (choice.finish_reason === 'tool_calls' && choice.message.tool_calls) {
            for (const tool of choice.message.tool_calls) {
                console.log(`🔧 [NEGOTIATING AGENT] Tool called: ${tool.function.name}`);

                if (tool.function.name === 'no_response_needed') {
                    console.log('🤫 No response needed');
                    return { shouldReply: false };
                }

                if (tool.function.name === 'present_offer') {
                    const args = JSON.parse(tool.function.arguments);
                    console.log(`💵 Presenting offer: $${args.offer_amount}`);
                    
                    // Update state to NEGOTIATING if not already
                    await db.query(`UPDATE conversations SET state = 'NEGOTIATING' WHERE id = $1`, [conversationId]);
                }

                if (tool.function.name === 'update_negotiation_status') {
                    const args = JSON.parse(tool.function.arguments);
                    console.log(`📝 Negotiation status: ${args.status}`);
                    
                    const stateMap = {
                        'NEGOTIATING': 'NEGOTIATING',
                        'VERBAL_ACCEPT': 'VERBAL_ACCEPT',
                        'CLOSED_WON': 'CLOSED_WON',
                        'CLOSED_LOST': 'CLOSED_LOST',
                        'STALLED': 'HUMAN_REVIEW'
                    };
                    
                    const newState = stateMap[args.status] || 'NEGOTIATING';
                    await db.query(`UPDATE conversations SET state = $1 WHERE id = $2`, [newState, conversationId]);
                }

                if (tool.function.name === 'request_counter_offer') {
                    const args = JSON.parse(tool.function.arguments);
                    console.log(`🔄 Counter offer request: ${args.objection}`);
                    
                    // Log the counter for human review / ML training
                    await db.query(`
                        INSERT INTO ai_chat_messages (conversation_id, role, content, created_at)
                        VALUES ($1, 'system', $2, NOW())
                    `, [conversationId, `📊 Counter-offer: ${JSON.stringify(args)}`]);
                }

                if (tool.function.name === 'send_contract') {
                    const args = JSON.parse(tool.function.arguments);
                    console.log(`📄 Sending contract to ${args.email}`);
                    
                    await db.query(`UPDATE conversations SET state = 'VERBAL_ACCEPT' WHERE id = $1`, [conversationId]);
                    
                    // TODO: Trigger actual contract send
                    console.log(`📤 [TODO] Trigger contract generation and send`);
                }

                if (tool.function.name === 'escalate_to_human') {
                    const args = JSON.parse(tool.function.arguments);
                    console.log(`🚨 Escalating: ${args.reason}`);
                    await db.query(`UPDATE conversations SET state = 'HUMAN_REVIEW' WHERE id = $1`, [conversationId]);
                    return { 
                        shouldReply: true, 
                        content: "let me get my manager to take a look at this for you, one sec" 
                    };
                }
            }

            // Generate follow-up response after tool calls
            messages.push(choice.message);
            messages.push({
                role: "tool",
                tool_call_id: choice.message.tool_calls[0].id,
                content: "Done"
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

        console.log(`✅ [NEGOTIATING AGENT] Response: "${content.substring(0, 100)}..."`);
        return { shouldReply: true, content: content };

    } catch (err) {
        console.error('❌ [NEGOTIATING AGENT] Error:', err.message);
        console.error(err.stack);
        return { shouldReply: false };
    }
}

// ==========================================
// EXPORTS
// ==========================================
module.exports = {
    processMessage,
    NEGOTIATING_STATES
};
