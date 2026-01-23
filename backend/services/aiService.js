// services/aiService.js - OpenAI Integration Service
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const { trackUsage } = require('./usageTracker');
require('dotenv').config();

// Initialize OpenAI
// If the key is missing, we initialize nicely so the server doesn't crash on startup
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || 'dummy-key',
});

const isConfigured = () => {
    return process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.startsWith('sk-');
};

const getConfiguration = () => ({
    hasApiKey: isConfigured(),
    model: 'gpt-4o',
    maxTokens: 500,
    temperature: 0.7
});

// 🟢 NEW: Helper to load the Markdown prompt
function getSystemPrompt() {
    try {
        const promptPath = path.join(__dirname, '../prompts/chat-assistant.md');
        return fs.readFileSync(promptPath, 'utf8');
    } catch (err) {
        console.error('❌ Could not load chat prompt:', err.message);
        // Fallback if file is missing
        return `You are an expert MCA underwriter assistant. Use the provided context to answer questions.`;
    }
}

/**
 * Generates a response from OpenAI based on the user query and conversation context.
 */
const generateResponse = async (query, context, userId = null) => {
    if (!isConfigured()) return { success: false, error: 'AI Key Missing' };

    try {
        // 1. Load Base Instructions from MD File
        let systemPrompt = getSystemPrompt();

        if (context) {
            // Log what the AI Service actually sees
            console.log('   🧠 [AI Service] Received Context:');
            console.log(`       - Business: ${context.business_name}`);
            console.log(`       - Has FCS? ${context.fcs ? 'YES' : 'NO'}`);
            if (context.fcs) {
                 console.log(`       - FCS ADB: ${context.fcs.average_daily_balance}`);
            }

            // 🟢 1. FULL LEAD DETAILS (Added Credit, Industry, Owner, etc.)
            systemPrompt += `\n\n=== 🏢 BUSINESS & OWNER DETAILS ===`;
            systemPrompt += `\nBusiness Name: ${context.business_name || 'Unknown'}`;
            systemPrompt += `\nOwner Name: ${context.first_name || ''} ${context.last_name || ''}`.trim();
            systemPrompt += `\nBusiness Address: ${context.address || 'N/A'}`;
            if (context.owner_city) {
                systemPrompt += `\nOwner Location: ${context.owner_city}, ${context.owner_state || ''} ${context.owner_zip || ''}`.trim();
            }
            systemPrompt += `\nIndustry: ${context.industry || 'Unknown'}`;
            systemPrompt += `\nCredit Score: ${context.credit_range || 'N/A'}`;
            const monthlyRevenue = context.monthly_revenue || (context.annual_revenue ? (context.annual_revenue / 12).toFixed(0) : null);
            systemPrompt += `\nMonthly Revenue: ${monthlyRevenue || 'N/A'}`;
            systemPrompt += `\nRequested Amount: ${context.funding_amount || 'N/A'}`;

            // A. COMMANDER'S GAME PLAN (Strategy)
            if (context.game_plan) {
                const gp = context.game_plan;
                systemPrompt += `\n\n=== 🎖️ COMMANDER'S STRATEGY ===`;
                systemPrompt += `\nLead Grade: ${gp.lead_grade || 'Not graded'}`;
                systemPrompt += `\nStrategy Type: ${gp.strategy_type || 'N/A'}`;
                systemPrompt += `\nApproach: ${gp.approach || 'N/A'}`;

                if (gp.offer_range) {
                    systemPrompt += `\nOffer Range: ${gp.offer_range.min?.toLocaleString() || '?'} - ${gp.offer_range.max?.toLocaleString() || '?'}`;
                }

                if (gp.talking_points && gp.talking_points.length > 0) {
                    systemPrompt += `\nTalking Points:`;
                    gp.talking_points.forEach(point => {
                        systemPrompt += `\n  • ${point}`;
                    });
                }

                if (gp.objection_strategy) {
                    systemPrompt += `\nObjection Handling: ${gp.objection_strategy}`;
                }

                if (gp.urgency_angle) {
                    systemPrompt += `\nUrgency Angle: ${gp.urgency_angle}`;
                }

                if (gp.stacking_assessment) {
                    systemPrompt += `\nStacking: ${gp.stacking_assessment.stacking_notes || 'N/A'}`;
                }

                if (gp.withholding_analysis) {
                    systemPrompt += `\nCurrent Withholding: ${gp.withholding_analysis.current_withholding_pct || '?'}%`;
                    systemPrompt += `\nRecommended Addition: ${gp.withholding_analysis.recommended_addition_pct || '?'}%`;
                }

                if (gp.next_position_guidance) {
                    const npg = gp.next_position_guidance;
                    systemPrompt += `\n\nNext Position Guidance:`;
                    systemPrompt += `\n  Payment Frequency: ${npg.payment_frequency || 'N/A'}`;
                    if (npg.amount_ranges) {
                        systemPrompt += `\n  Conservative: ${npg.amount_ranges.conservative?.min?.toLocaleString() || '?'} - ${npg.amount_ranges.conservative?.max?.toLocaleString() || '?'}`;
                        systemPrompt += `\n  Moderate: ${npg.amount_ranges.moderate?.min?.toLocaleString() || '?'} - ${npg.amount_ranges.moderate?.max?.toLocaleString() || '?'}`;
                        systemPrompt += `\n  Aggressive: ${npg.amount_ranges.aggressive?.min?.toLocaleString() || '?'} - ${npg.amount_ranges.aggressive?.max?.toLocaleString() || '?'}`;
                    }
                }

                if (gp.lender_notes) {
                    systemPrompt += `\nLender Strategy: ${gp.lender_notes}`;
                }

                if (gp.red_flags && gp.red_flags.length > 0) {
                    systemPrompt += `\nRed Flags:`;
                    gp.red_flags.forEach(flag => {
                        systemPrompt += `\n  ⚠️ ${flag}`;
                    });
                }

                if (gp.risk_considerations && gp.risk_considerations.length > 0) {
                    systemPrompt += `\nRisk Considerations:`;
                    gp.risk_considerations.forEach(risk => {
                        systemPrompt += `\n  • ${risk}`;
                    });
                }
            } else {
                systemPrompt += `\n\n(No Commander strategy available yet - FCS may not have run)`;
            }

            // B. FCS / Bank Analysis Data
            if (context.fcs) {
                const fcs = context.fcs;
                systemPrompt += `\n\n=== 🏦 BANK ANALYSIS (FCS) ===`;
                
                // 1. Core Financials (Specific Metrics)
                systemPrompt += `\nMonthly Revenue: $${fcs.average_revenue || '0'}`;
                systemPrompt += `\nAvg Daily Balance (ADB): $${fcs.average_daily_balance || '0'}`;
                systemPrompt += `\nAvg Deposit Count: ${fcs.average_deposit_count || '0'}`;
                systemPrompt += `\nAvg Deposit Volume: $${fcs.average_deposits || '0'}`;
                systemPrompt += `\nNegative Days: ${fcs.total_negative_days || '0'}`;
                systemPrompt += `\nRecency (Statement Count): ${fcs.statement_count || '0'} Months`;
                systemPrompt += `\nExisting Positions: ${fcs.position_count || '0'}`;
                systemPrompt += `\nLast MCA Date: ${fcs.last_mca_deposit_date || 'None Detected'}`;
                systemPrompt += `\nTime in Business: ${fcs.time_in_business_text || 'Unknown'}`;

                // 2. 🟢 THE FULL RAW REPORT (UNLEASHED)
                // We inject the ENTIRE text blob so the AI can read specific notes, 
                // fraud alerts, and nuanced details from the parser.
                if (fcs.fcs_report) {
                    systemPrompt += `\n\n--- 📄 FULL ANALYST REPORT ---\n${fcs.fcs_report}`;
                }

            } else {
                systemPrompt += `\n\n(No Bank Analysis/FCS available yet)`;
            }

            // C. Lender Offers
            if (context.lender_submissions && context.lender_submissions.length > 0) {
                systemPrompt += `\n\n=== 💰 LENDER OFFERS ===`;
                context.lender_submissions.forEach(sub => {
                    // 1. Basic Info
                    systemPrompt += `\n- Lender: ${sub.lender_name}`;
                    systemPrompt += ` | Status: ${sub.status}`;
                    if (sub.offer_amount) systemPrompt += ` | Amount: $${sub.offer_amount}`;

                    // 2. 🟢 EXTRACT DETAILS (The "Days" & "Factor" Fix)
                    if (sub.offer_details) {
                        const d = sub.offer_details;
                        
                        // Explicitly look for common terms
                        if (d.term || d.days || d.length) systemPrompt += ` | Term: ${d.term || d.days || d.length}`;
                        if (d.factor || d.factor_rate || d.buy_rate) systemPrompt += ` | Factor: ${d.factor || d.factor_rate || d.buy_rate}`;
                        if (d.payment || d.daily_payment || d.weekly_payment) systemPrompt += ` | Pmt: ${d.payment || d.daily_payment || d.weekly_payment}`;
                        if (d.position) systemPrompt += ` | Position: ${d.position}`;
                        
                        // Safety: If we missed anything specific, check for other keys (excluding big arrays)
                        Object.keys(d).forEach(key => {
                            if (!['history', 'raw_body', 'term', 'days', 'factor', 'payment'].includes(key) && typeof d[key] !== 'object') {
                                systemPrompt += ` | ${key}: ${d[key]}`;
                            }
                        });
                    }

                    // 3. Raw Context (The Fallback)
                    if (sub.raw_email_body) {
                        systemPrompt += `\n  (Email Snippet: "${sub.raw_email_body.substring(0, 300).replace(/\s+/g, ' ')}...")`;
                    }
                    
                    // 4. History (Latest Update)
                    if (sub.offer_details && sub.offer_details.history) {
                         const history = sub.offer_details.history;
                         const lastLog = history[history.length - 1];
                         if (lastLog) systemPrompt += `\n  (Latest Note: ${lastLog.summary})`;
                    }
                });
            }
        }

        // 🔧 DATABASE ACTION INSTRUCTIONS
        systemPrompt += `\n\n=== 🔧 DATABASE ACTIONS ===
You can propose database actions when the user asks to add, update, or change data.
When proposing an action, respond with ONLY valid JSON (no markdown, no backticks).

Available actions:

1. insert_offer - Add new lender submission
{"message": "I'll add that offer.", "action": {"action": "insert_offer", "data": {"lender_name": "...", "offer_amount": 50000, "status": "OFFER", "factor_rate": 1.35, "term_length": 6, "term_unit": "months", "payment_frequency": "daily"}, "confirm_text": "Add $50,000 offer from [Lender]?"}}

2. update_offer - Update existing lender submission
{"message": "I'll update that.", "action": {"action": "update_offer", "data": {"lender_name": "...", "offer_amount": 55000, "status": "OFFER"}, "confirm_text": "Update [Lender] to $55,000?"}}

3. update_deal - Update the conversation/deal
{"message": "I'll mark this as funded.", "action": {"action": "update_deal", "data": {"state": "FUNDED", "funded_amount": 50000}, "confirm_text": "Mark deal as FUNDED for $50,000?"}}
Valid states: NEW, CONTACTED, DOCS_IN, OFFER_RECEIVED, CONTRACTED, FUNDED, DEAD, ARCHIVED

4. append_note - Add a note
{"message": "I'll add that note.", "action": {"action": "append_note", "data": {"note": "Client prefers weekly payments"}, "confirm_text": "Add note: Client prefers weekly payments?"}}

RULES:
- Only propose an action if the user EXPLICITLY asks to add/update/change something
- If a lender submission already exists, use update_offer not insert_offer
- For normal questions, respond with plain text (no JSON)
- The confirm_text should clearly describe what will happen
`;

        // Add list of valid lenders with fuzzy matching instructions
        if (context.valid_lenders && context.valid_lenders.length > 0) {
            systemPrompt += `\n\nVALID LENDERS (only use these exact names in actions):\n${context.valid_lenders.join(', ')}`;
            systemPrompt += `\n
LENDER NAME MATCHING RULES:
1. If user's lender name EXACTLY matches a valid lender → use it
2. If it's an OBVIOUS typo (e.g., "Pinnakle" → "Pinnacle", "Rapit" → "Rapid") → auto-correct and mention it
   Example: "I'll add the offer from **Pinnacle Capital** (corrected from 'Pinnakle')."
3. If MULTIPLE lenders could match (e.g., "Pinnacle" matches "Pinnacle Capital" AND "Pinnacle Business Funding") → ask which one
   Example: "I found multiple matches for 'Pinnacle'. Did you mean Pinnacle Capital or Pinnacle Business Funding?"
4. If NO close match exists → ask for clarification and list similar-sounding options if any
   Example: "I don't recognize 'ABC Lending'. Here are some similar lenders: [list]. Or did you mean something else?"
5. NEVER propose an action with a lender name that isn't in the valid list
`;
        }

        // 🟢 4. CHAT HISTORY (Memory)
        const messages = [{ role: "system", content: systemPrompt }];
        
        if (context && context.chat_history) {
            context.chat_history.forEach(msg => {
                if (['user', 'assistant'].includes(msg.role)) {
                    messages.push({ role: msg.role, content: msg.content });
                }
            });
        }

        messages.push({ role: "user", content: query });

        // 4. Call OpenAI
        console.log('   🧠 [AI Service] Sending request to OpenAI (Model: gpt-4o-mini)...');
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: messages,
            temperature: 0.3,
            max_tokens: 500
        });

        // Track usage
        if (completion.usage) {
            await trackUsage({
                userId: userId,
                conversationId: context?.conversation_id || null,
                type: 'llm_call',
                service: 'openai',
                model: 'gpt-4o-mini',
                inputTokens: completion.usage.prompt_tokens,
                outputTokens: completion.usage.completion_tokens,
                metadata: { function: 'aiService' }
            });
        }

        // 🟢 NEW: Token Logging
        const usage = completion.usage;
        if (usage) {
            console.log(`      🎟️ [AI Service] Token Usage:`);
            console.log(`          - Input (Context): ${usage.prompt_tokens}`);
            console.log(`          - Output (Answer): ${usage.completion_tokens}`);
            console.log(`          - Total Cost:      ${usage.total_tokens} tokens`);
        }

        const responseText = completion.choices[0].message.content;

        // Check if response contains a JSON action
        let parsedResponse = { success: true, response: responseText };

        try {
            // Find JSON object anywhere in the response
            const jsonMatch = responseText.match(/\{[\s\S]*"action"[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                if (parsed.action && parsed.message) {
                    parsedResponse = {
                        success: true,
                        response: parsed.message,
                        action: parsed.action
                    };
                    console.log(`   🔧 [AI Service] Action detected: ${parsed.action.action}`);
                }
            }
        } catch (e) {
            // Not valid JSON, treat as normal text response
            console.log('   ⚠️ [AI Service] Could not parse action JSON:', e.message);
        }

        return {
            ...parsedResponse,
            usage: usage
        };

    } catch (error) {
        return { success: false, error: error.message };
    }
};

module.exports = {
    isConfigured,
    getConfiguration,
    generateResponse
};
