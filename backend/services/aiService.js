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

            // D. Documents on file
            if (context.documents && context.documents.length > 0) {
                systemPrompt += `\n\n=== 📎 DOCUMENTS ON FILE ===`;
                context.documents.forEach(doc => {
                    systemPrompt += `\n- ${doc.filename} (${doc.document_type || 'unknown type'})`;
                });
            }

            // E. Already submitted to
            if (context.existing_submissions && context.existing_submissions.length > 0) {
                systemPrompt += `\n\n=== 📤 ALREADY SUBMITTED TO ===`;
                context.existing_submissions.forEach(sub => {
                    systemPrompt += `\n- ${sub.lender_name}: ${sub.status} (${sub.submitted_at ? new Date(sub.submitted_at).toLocaleDateString() : 'unknown date'})`;
                });
            }
        }

        // 🔧 DATABASE ACTION INSTRUCTIONS
        systemPrompt += `\n\n=== 🔧 DATABASE ACTIONS ===
You can propose database actions when the user asks to add, update, or change data.
When proposing an action, respond with ONLY valid JSON (no markdown, no backticks).

**SMART PARSING:**
If the user pastes an offer email or says "put this in" / "add this" / "log this", extract the data automatically:
- Look for: Funding Amount, Sell Rate/Factor, Term, Payment Frequency, Weekly/Daily Payment
- Match the lender name from the email signature, sender, or context
- Propose an insert_offer with all extracted fields

Example: User pastes "Funding Amount $70,000.00 Sell Rate 1.34 Term 56 Weeks Weekly Payment $1,675.00" from Newport
→ You respond with insert_offer containing all those details

Available actions:

1. insert_offer - Add new lender submission
{"message": "I'll add the Newport offer: $70k at 1.34 for 56 weeks.", "action": {"action": "insert_offer", "data": {"lender_name": "Newport Business Capital", "offer_amount": 70000, "status": "OFFER", "factor_rate": 1.34, "term_length": 56, "term_unit": "weeks", "payment_frequency": "weekly"}, "confirm_text": "Add Newport offer: $70,000, 1.34 factor, 56 weeks, weekly?"}}

2. update_offer - Update existing lender submission
{"message": "I'll update that.", "action": {"action": "update_offer", "data": {"lender_name": "...", "offer_amount": 55000, "status": "OFFER"}, "confirm_text": "Update [Lender] to $55,000?"}}

3. update_deal - Update the conversation/deal
{"message": "I'll mark this as funded.", "action": {"action": "update_deal", "data": {"state": "FUNDED", "funded_amount": 50000}, "confirm_text": "Mark deal as FUNDED for $50,000?"}}
Valid states: NEW, CONTACTED, DOCS_IN, OFFER_RECEIVED, CONTRACTED, FUNDED, DEAD, ARCHIVED

4. append_note - Add a note (use ONLY for general notes, NOT for offer data)
{"message": "I'll add that note.", "action": {"action": "append_note", "data": {"note": "Client prefers weekly payments"}, "confirm_text": "Add note: Client prefers weekly payments?"}}

5. insert_bank_rule - Add new bank parsing rules
{"message": "I'll add rules for Chase.", "action": {"action": "insert_bank_rule", "data": {"bank_name": "Chase", "aliases": ["CHASE", "JPMORGAN CHASE"], "neg_days_source": "daily_balance_table", "neg_days_location": "bottom of statement", "neg_days_extract_rule": "Extract Daily Ending Balance table only", "intraday_warning": false, "token_cost": "low", "notes": "Clean format"}, "confirm_text": "Add bank rule for Chase?\\n- Neg days: daily balance table (bottom)\\n- Token cost: low"}}

6. update_bank_rule - Modify existing bank rules  
{"message": "I'll update the Chase rules.", "action": {"action": "update_bank_rule", "data": {"bank_name": "Chase", "neg_days_location": "page 2"}, "confirm_text": "Update Chase: neg days location to page 2?"}}

BANK RULE FIELDS:
- bank_name: Required, the display name
- aliases: Array of strings to match in OCR text ["CHASE", "JPMORGAN"]
- neg_days_source: "daily_balance_table" | "transaction_list" | "balance_summary"
- neg_days_location: Where to find it ("bottom of statement", "first page", etc.)
- neg_days_extract_rule: Instructions for what to extract
- intraday_warning: true if bank shows intraday negatives that may recover
- revenue_source: Usually "transaction_list"
- token_cost: "low" | "medium" | "high" based on how much text needed
- notes: Any special handling instructions

RULES:
- If user pastes offer details → use insert_offer or update_offer, NOT append_note
- If a lender submission already exists for that lender, use update_offer
- For general notes/reminders that aren't offer data → use append_note
- The confirm_text should clearly show all the data being saved
- Extract ALL available fields: amount, factor_rate, term_length, term_unit, payment_frequency

7. submit_deal - Run qualification and submit to matching lenders
WHEN USER SAYS: "submit this deal", "sub this", "send it out", "send to lenders"

BEFORE proposing submit_deal, you MUST present a READINESS CHECKLIST:

📋 SUBMISSION READINESS CHECK
Use ✅ or ❌ for each:
- Business Name
- Monthly Revenue (required for qualification)
- Credit Score / FICO (required for qualification)
- Industry (required for qualification)
- State (required for qualification)
- Position (required for qualification - check FCS position_count or ask)
- Bank Statements uploaded
- Application uploaded
- FCS Analysis done
- Already submitted to (list any)

RULES:
- If ANY critical field is missing (revenue, credit, industry, state, position) → show the checklist with ❌ on missing items, tell user what you need, do NOT propose the action
- If no documents uploaded → block submission, tell user to upload docs first
- If FCS not done → warn that qualification may be less accurate but allow
- If already submitted to some lenders → note them so user knows
- If ALL checks pass → propose the action with confirm
- NEVER skip the checklist unless user explicitly says "skip the check" or "just send it"

Example with missing data (respond as plain text, NOT json):
"Here's where we stand on submitting Joe's Pizza:

✅ Business: Joe's Pizza
✅ Revenue: $45,000/mo
❌ Credit Score: missing
✅ Industry: Restaurant
✅ State: NY
✅ Position: 2nd
✅ Documents: 3 files uploaded
✅ FCS: Complete

I need the credit score before I can run qualification. What's the FICO?"

Example when ready (respond as JSON action):
{"message": "Joe's Pizza is ready to go:\\n\\n✅ Revenue: $45K | FICO: 680 | Restaurant | NY | 2nd pos\\n✅ 3 docs attached | FCS complete\\n\\nI'll run qualification and send to all matching lenders.", "action": {"action": "submit_deal", "data": {"criteria": {"requestedPosition": 2, "monthlyRevenue": 45000, "fico": 680, "state": "NY", "industry": "Restaurant", "depositsPerMonth": 35, "negativeDays": 2}}, "confirm_text": "Run qualification and submit to all matching lenders for Joe's Pizza?"}}

If user wants specific lenders only:
{"message": "Sending to just those 3.", "action": {"action": "submit_deal", "data": {"criteria": {"requestedPosition": 2, "monthlyRevenue": 45000, "fico": 680, "state": "NY", "industry": "Restaurant"}, "lender_names": ["Rapid Capital", "Fox Business", "Pinnacle Capital"]}, "confirm_text": "Submit to Rapid Capital, Fox Business, and Pinnacle Capital?"}}

CRITERIA FIELD MAPPING (pull from context above):
- requestedPosition → FCS position_count + 1 (next position) or ask user
- monthlyRevenue → Monthly Revenue from business details or FCS average_revenue
- fico → Credit Score from business details
- state → extract from Business Address (2-letter code)
- industry → Industry from business details
- depositsPerMonth → FCS average_deposit_count (optional)
- negativeDays → FCS total_negative_days (optional)
- isSoleProp → ask if unclear (optional)
- isNonProfit → ask if unclear (optional)
- hasMercuryBank → from FCS if available (optional)
- withholding → from Commander withholding_analysis if available (optional)
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
            max_tokens: 800
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
