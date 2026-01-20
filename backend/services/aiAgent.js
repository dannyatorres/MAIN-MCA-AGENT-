// backend/services/aiAgent.js
const { OpenAI } = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { getDatabase } = require('./database');
const { trackUsage } = require('./usageTracker');
const { syncDriveFiles } = require('./driveService');
const commanderService = require('./commanderService');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

// Format name to Title Case (SABRINA → Sabrina)
function formatName(name) {
    if (!name) return '';
    return name
        .toLowerCase()
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

// 📊 TRAINING DATA TRACKER
async function trackResponseForTraining(conversationId, leadMessage, humanResponse, responseSource) {
    const db = getDatabase();

    try {
        // Fetch Commander's game plan
        const strategyRes = await db.query(`
            SELECT game_plan, lead_grade, strategy_type FROM lead_strategy WHERE conversation_id = $1
        `, [conversationId]);

        const strategy = strategyRes.rows[0];

        await db.query(`
            INSERT INTO response_training (
                conversation_id,
                lead_message,
                lead_message_timestamp,
                commander_suggestion,
                commander_grade,
                commander_strategy,
                human_response,
                human_response_timestamp,
                response_source
            ) VALUES ($1, $2, NOW(), $3, $4, $5, $6, NOW(), $7)
        `, [
            conversationId,
            leadMessage,
            strategy?.game_plan || null,
            strategy?.lead_grade || null,
            strategy?.strategy_type || null,
            humanResponse,
            responseSource
        ]);

        console.log(`📊 Training data saved: ${responseSource}`);
    } catch (err) {
        console.error('⚠️ Training tracking failed:', err.message);
    }
}

// 🛠️ BASE TOOLS - MODIFIED: Removed 'generate_offer' from the default list
const BASE_TOOLS = [
    {
        type: "function",
        function: {
            name: "update_lead_status",
            description: "Updates the lead's status/stage in the CRM.",
            parameters: {
                type: "object",
                properties: {
                    status: {
                        type: "string",
                        enum: ["INTERESTED", "QUALIFIED", "FCS_RUNNING", "NEGOTIATING", "DEAD", "ARCHIVED", "HUMAN_REVIEW"],
                        description: "The new status."
                    }
                },
                required: ["status"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "trigger_drive_sync",
            description: "Call this immediately when you get an EMAIL address.",
            parameters: { type: "object", properties: {} }
        }
    },
    {
        type: "function",
        function: {
            name: "consult_analyst",
            description: "Call this ONLY when you have: 1. Email, 2. Funding Status, 3. Credit Score. This will notify the human underwriter.",
            parameters: {
                type: "object",
                properties: {
                    credit_score: { type: "string", description: "The user's stated credit score" },
                    recent_funding: { type: "string", description: "Details on any new positions (or 'None')" }
                },
                required: ["credit_score", "recent_funding"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "no_response_needed",
            description: "Call this when the lead's message doesn't need a response. Use when they say: 'ok', 'sounds good', 'cool', 'thanks', 'got it', 'k', 'okay', 'alright', 'perfect', 'great', 'sure', 'yep', 'yes', 'no problem'. DO NOT respond to these - just stay silent and wait.",
            parameters: { type: "object", properties: {} }
        }
    }
];

// 📖 HELPER: Load Persona + Strategy (now with dynamic agent name)
async function getGlobalPrompt(userId) {
    try {
        const promptPath = path.join(__dirname, '../prompts/dan_torres.md');

        // Get user's agent name
        let agentName = 'Dan Torres'; // default
        if (userId) {
            const db = getDatabase();
            const result = await db.query('SELECT agent_name FROM users WHERE id = $1', [userId]);
            if (result.rows[0]?.agent_name) {
                agentName = result.rows[0].agent_name;
            }
        }

        if (fs.existsSync(promptPath)) {
            console.log(`✅ Loaded: dan_torres.md (Agent: ${agentName})`);
            let prompt = fs.readFileSync(promptPath, 'utf8');

            // Replace placeholders
            prompt = prompt.replace(/\{\{AGENT_NAME\}\}/g, agentName);
            prompt = prompt.replace(/\{\{AGENT_NAME_LOWER\}\}/g, agentName.toLowerCase());

            return prompt;
        }

        console.log('⚠️ Missing: dan_torres.md');
        return `You are ${agentName}, an underwriter at JMS Global. Keep texts short and professional.`;

    } catch (err) {
        console.error('⚠️ Error loading prompt:', err.message);
        return 'You are an underwriter. Keep texts short.';
    }
}

async function getLearnedCorrections(leadGrade, revenueRange) {
    const db = getDatabase();
    try {
        const result = await db.query(`
            SELECT lead_message, ai_would_have_said, human_response
            FROM response_training
            WHERE ai_would_have_said IS NOT NULL
              AND human_response IS NOT NULL
              AND response_source = 'HUMAN_MANUAL'
              AND (lead_grade = $1 OR lead_grade IS NULL)
            ORDER BY 
                CASE WHEN lead_grade = $1 THEN 0 ELSE 1 END,
                created_at DESC
            LIMIT 10
        `, [leadGrade]);
        return result.rows;
    } catch (err) {
        console.error('Failed to load corrections:', err.message);
        return [];
    }
}

async function processLeadWithAI(conversationId, systemInstruction) {
    systemInstruction = systemInstruction || '';
    const db = getDatabase();
    console.log(`🧠 AI Agent Processing Lead: ${conversationId}`);

    try {
        // =================================================================
        // 🚨 LAYER 0: THE MANUAL MASTER SWITCH
        // =================================================================
        const settingsRes = await db.query(
            'SELECT ai_enabled, state, created_by_user_id, assigned_user_id FROM conversations WHERE id = $1',
            [conversationId]
        );
        const usageUserId = settingsRes.rows[0]?.assigned_user_id || settingsRes.rows[0]?.created_by_user_id || null;

        // If the switch is explicitly OFF, stop everything.
        if (settingsRes.rows.length > 0 && settingsRes.rows[0].ai_enabled === false) {
            console.log(`⛔ AI MANUALLY DISABLED for Conversation ${conversationId}`);
            return { shouldReply: false };
        }

        // =================================================================
        // 🚨 LAYER 1: MISSION ACCOMPLISHED CHECK (Status Lock)
        // If the lead is already in a "Human" stage, DO NOT REPLY.
        // =================================================================
        const currentState = settingsRes.rows[0]?.state;

        // Add any statuses here where you want the AI to be completely dead
        const RESTRICTED_STATES = ['HUMAN_REVIEW', 'OFFER_SENT', 'NEGOTIATING', 'FCS_COMPLETE'];

        // If it's a manual command (systemInstruction has value), we ignore the lock.
        // If it's autonomous (systemInstruction is empty/null), we respect the lock.
        const isManualCommand = systemInstruction && systemInstruction.length > 5;

        if (RESTRICTED_STATES.includes(currentState) && !isManualCommand) {
            console.log(`🔒 AI BLOCKED: Lead is in '${currentState}'. Waiting for human.`);
            return { shouldReply: false };
        }

        // =================================================================
        // 🚨 LAYER 2: HUMAN INTERRUPTION CHECK (The 15-Minute Timer)
        // If a HUMAN sent a message recently, do not disturb.
        // =================================================================
        if (!isManualCommand) {
            const lastOutbound = await db.query(`
                SELECT timestamp, sent_by
                FROM messages
                WHERE conversation_id = $1 AND direction = 'outbound'
                ORDER BY timestamp DESC LIMIT 1
            `, [conversationId]);

            if (lastOutbound.rows.length > 0) {
                const lastMsg = lastOutbound.rows[0];
                const timeDiff = (new Date() - new Date(lastMsg.timestamp)) / 1000 / 60; // Minutes

                // If HUMAN sent the last message less than 15 mins ago -> SLEEP
                if (lastMsg.sent_by === 'user' && timeDiff < 15) {
                    console.log(`⏱️ AI PAUSED: Human replied ${Math.round(timeDiff)} mins ago. Backing off.`);
                    return { shouldReply: false };
                }
            }
        }

        // =================================================================
        // 🚨 LAYER 3: OFFER TOOL SECURITY
        // Only inject the 'generate_offer' tool if explicitly authorized
        // =================================================================
        let availableTools = [...BASE_TOOLS];

        // Only allow offer generation if YOU clicked a button that puts "Generate Offer" in the instructions
        if (systemInstruction && systemInstruction.includes("Generate Offer")) {
            availableTools.push({
                type: "function",
                function: {
                    name: "generate_offer",
                    description: "Generates the formal offer PDF and pitch.",
                    parameters: { type: "object", properties: {} }
                }
            });
        }

        // 1. GET LEAD DETAILS (simple - for templates)
        const leadRes = await db.query(`
            SELECT first_name, business_name, state, email
            FROM conversations
            WHERE id = $1
        `, [conversationId]);

        const lead = leadRes.rows[0];
        const rawName = lead?.first_name || lead?.business_name || "there";
        const nameToUse = formatName(rawName);
        const businessName = lead?.business_name || "Unknown Business";

        // 2. TEMPLATE MODE (The "Free" Drip Campaign)
        // Checks instructions from index.js and returns text instantly.
        // Get agent name for templates
        let agentName = 'Dan Torres'; // default
        if (usageUserId) {
            const agentRes = await db.query('SELECT agent_name FROM users WHERE id = $1', [usageUserId]);
            if (agentRes.rows[0]?.agent_name) {
                agentName = agentRes.rows[0].agent_name;
            }
        }

        // =================================================================
        // 🚨 LAYER 2B: DRIP CAMPAIGN CONTEXT CHECK
        // Before sending any drip/template message, check if lead responded
        // =================================================================
        const recentHistory = await db.query(`
            SELECT direction, content FROM messages
            WHERE conversation_id = $1
            ORDER BY timestamp DESC LIMIT 1
        `, [conversationId]);
        
        const lastMsg = recentHistory.rows[0];
        const isDripCampaign = systemInstruction.includes("Did you get funded") || 
                               systemInstruction.includes("money is expensive") ||
                               systemInstruction.includes("close the file") ||
                               systemInstruction.includes("any response would be appreciated");
        
        // Only use templates if lead hasn't responded yet
        if (!isDripCampaign || !lastMsg || lastMsg.direction === 'outbound') {
            if (systemInstruction.includes("Underwriter Hook")) {
                const content = `Hi ${nameToUse} my name is ${agentName} I'm one of the underwriters at JMS Global. I'm currently going over the bank statements and the application you sent in and I wanted to make an offer. What's the best email to send the offer to?`;
                await trackResponseForTraining(conversationId, systemInstruction, content, 'TEMPLATE_HOOK');
                return { shouldReply: true, content };
            }
            if (systemInstruction.includes("Did you get funded already?")) {
                const content = "Did you get funded already?";
                await trackResponseForTraining(conversationId, systemInstruction, content, 'TEMPLATE_FUNDED');
                return { shouldReply: true, content };
            }
            if (systemInstruction.includes("The money is expensive as is")) {
                const content = "The money is expensive as is let me compete.";
                await trackResponseForTraining(conversationId, systemInstruction, content, 'TEMPLATE_COMPETE');
                return { shouldReply: true, content };
            }
            if (systemInstruction.includes("should i close the file out?")) {
                const content = "Hey just following up again, should i close the file out?";
                await trackResponseForTraining(conversationId, systemInstruction, content, 'TEMPLATE_CLOSE1');
                return { shouldReply: true, content };
            }
            if (systemInstruction.includes("any response would be appreciated")) {
                const content = "hey any response would be appreciated here, close this out?";
                await trackResponseForTraining(conversationId, systemInstruction, content, 'TEMPLATE_CLOSE2');
                return { shouldReply: true, content };
            }
            if (systemInstruction.includes("closing out the file")) {
                const content = "Hey just wanted to follow up again, will be closing out the file if i dont hear a response today, ty";
                await trackResponseForTraining(conversationId, systemInstruction, content, 'TEMPLATE_CLOSE3');
                return { shouldReply: true, content };
            }
        } else if (isDripCampaign && lastMsg && lastMsg.direction === 'inbound') {
            console.log('📬 Drip skipped - lead has responded, switching to AI mode');
        }

        // 🟢 F. THE HAIL MARY (Ballpark Offer)
        if (systemInstruction.includes("Generate Ballpark Offer")) {
            console.log(`🏈 AI MODE: Generating Gemini Ballpark Offer (Hail Mary)...`);

            const fcsRes = await db.query(`
                SELECT average_revenue, average_daily_balance
                FROM fcs_analyses WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 1
            `, [conversationId]);

            let offerText = "";

            if (fcsRes.rows.length > 0) {
                const fcs = fcsRes.rows[0];
                const revenueNum = Math.round(fcs.average_revenue || 0);
                const rev = revenueNum.toLocaleString();
                const blindOffer = Math.round(revenueNum * 0.8).toLocaleString();

                const prompt = `
                    You are Dan Torres. This client has ghosted you.

                    DATA:
                    - Their Monthly Revenue: ${rev}

                    TASK:
                    Write a text to wake them up.
                    - State clearly: "I haven't heard back, but looking at the statements, I see about ${rev} in revenue."
                    - Make a BLIND OFFER: "I can probably get you ${blindOffer} landed today if we move now."
                    - End with: "Want me to lock that in?"

                    Keep it short and punchy.
                `;

                try {
                    const result = await geminiModel.generateContent(prompt);
                    offerText = result.response.text().replace(/"/g, '').trim();
                } catch (e) {
                    offerText = `I haven't heard back, but looking at the ${rev} revenue, I can probably get you funded today. Do you want me to finalize the offer?`;
                }
            } else {
                offerText = "I haven't heard back—I'm assuming you found capital elsewhere? I'll go ahead and close the file.";
            }

            // 📊 TRACK BALLPARK OFFER
            await trackResponseForTraining(conversationId, systemInstruction, offerText, 'BALLPARK_OFFER');

            return { shouldReply: true, content: offerText };
        }

        // 3. AI MODE (GPT-4o) - Only runs if no template matched
        console.log("🤖 AI MODE: Reading Strategy...");

        // 3.5 GET COMMANDER'S GAME PLAN (only needed for AI mode)
        let gamePlan = null;
        const strategyRes = await db.query(`
            SELECT game_plan, lead_grade, strategy_type
            FROM lead_strategy
            WHERE conversation_id = $1
        `, [conversationId]);

        if (strategyRes.rows[0]) {
            gamePlan = strategyRes.rows[0].game_plan;
            if (typeof gamePlan === 'string') {
                gamePlan = JSON.parse(gamePlan);
            }
            console.log(`🎖️ Commander Orders Loaded: Grade ${strategyRes.rows[0].lead_grade} | ${strategyRes.rows[0].strategy_type}`);
        } else {
            console.log(`📋 No Commander strategy yet - using default prompts`);
        }

        const fcsRes = { rows: [] }; // Disabled - fix column names later

        const fcsData = fcsRes.rows[0] || null;

        // Get active offers for this conversation
        const offersRes = await db.query(`
            SELECT lender_name, offer_amount, factor_rate, term_length, term_unit, payment_frequency
            FROM lender_submissions
            WHERE conversation_id = $1 AND status = 'OFFER'
            ORDER BY offer_amount DESC
        `, [conversationId]);

        const offers = offersRes.rows;

        // 4. BUILD CONVERSATION HISTORY
        const history = await db.query(`
            SELECT direction, content FROM messages
            WHERE conversation_id = $1
            ORDER BY timestamp ASC LIMIT 20
        `, [conversationId]);

        // 4b. CHECK FOR HANDOFF ACKNOWLEDGMENT - Stay silent
        // Use the full history (last 20) to find the absolute last outbound/inbound
        const lastOutbounds = history.rows.filter(m => m.direction === 'outbound');
        const lastInbounds = history.rows.filter(m => m.direction === 'inbound');

        const lastOutbound = lastOutbounds.slice(-1)[0]?.content?.toLowerCase() || '';
        const lastInbound = lastInbounds.slice(-1)[0]?.content?.toLowerCase().trim() || '';

        const handoffPhrases = ['give me a few minutes', 'text you back shortly', 'get back to you', 'finalize the numbers', 'run the numbers'];
        const acknowledgments = ['thanks', 'thank you', 'ty', 'ok', 'okay', 'k', 'got it', 'sounds good', 'cool', 'great', 'perfect', 'awesome', 'sent', 'done', '👍', '👌'];

        const weHandedOff = handoffPhrases.some(phrase => lastOutbound.includes(phrase));
        const theyAcknowledged = acknowledgments.some(ack => lastInbound === ack || lastInbound === ack + '!' || lastInbound === ack + '.');

        if (weHandedOff && theyAcknowledged) {
            console.log('🤝 Handoff acknowledged, staying silent for human takeover');
            return { shouldReply: false };
        }

        // =================================================================
        // 🚨 LAYER 4D: CLOSE FILE CONFIRMATION CHECK
        // If we asked to close and they said yes, stop immediately
        // =================================================================
        const weAskedToClose = lastOutbound.includes('close the file') || lastOutbound.includes('close it out');
        const theySaidYes = ['yes', 'yeah', 'sure', 'go ahead', 'yes!'].includes(lastInbound);

        if (weAskedToClose && theySaidYes) {
            console.log('📁 Lead confirmed file close - marking as dead');
            await db.query("UPDATE conversations SET state = 'DEAD' WHERE id = $1", [conversationId]);
            return {
                shouldReply: true,
                content: "understood, ill close it out. if anything changes down the line feel free to reach back out"
            };
        }

        // 5. BUILD SYSTEM PROMPT
        let systemPrompt = await getGlobalPrompt(usageUserId);

        // Check if this conversation has active offers - use negotiation mode
        const hasActiveOffer = await db.query(`
            SELECT 1 FROM lender_submissions
            WHERE conversation_id = $1 AND status = 'OFFER'
            LIMIT 1
        `, [conversationId]);

        if (hasActiveOffer.rows.length > 0) {
            try {
                const negotiationPath = path.join(__dirname, '../prompts/offer_negotiation.md');
                if (fs.existsSync(negotiationPath)) {
                    const negotiationPrompt = fs.readFileSync(negotiationPath, 'utf8');
                    systemPrompt += `\n\n---\n\n${negotiationPrompt}`;
                    console.log('Loaded negotiation mode for active offer');
                }
            } catch (err) {
                console.error('Failed to load negotiation prompt:', err.message);
            }
        }

        // NEW: Inject learned corrections
        const corrections = await getLearnedCorrections(gamePlan?.lead_grade || null, null);
        if (corrections.length > 0) {
            systemPrompt += `\n\n---\n\n## 🎓 LEARNED CORRECTIONS (Follow these patterns)\n`;
            corrections.forEach(c => {
                systemPrompt += `\nWhen lead says: "${c.lead_message.substring(0, 50)}..."\n`;
                systemPrompt += `❌ Don't say: "${c.ai_would_have_said.substring(0, 50)}..."\n`;
                systemPrompt += `✅ Instead say: "${c.human_response.substring(0, 50)}..."\n`;
            });
        }

        // Inject Commander's orders if available
        if (gamePlan) {
            systemPrompt += `\n\n---\n\n## 🎖️ COMMANDER'S ORDERS\n`;
            systemPrompt += `**Lead Grade:** ${gamePlan.lead_grade}\n`;
            systemPrompt += `**Strategy:** ${gamePlan.strategy_type}\n\n`;
            systemPrompt += `**Your Approach:** ${gamePlan.approach}\n\n`;

            if (gamePlan.talking_points && gamePlan.talking_points.length > 0) {
                systemPrompt += `**Talking Points:**\n`;
                gamePlan.talking_points.forEach(point => {
                    systemPrompt += `- ${point}\n`;
                });
                systemPrompt += `\n`;
            }

            if (gamePlan.offer_range) {
                systemPrompt += `**Offer Range:** ${gamePlan.offer_range.min.toLocaleString()} - ${gamePlan.offer_range.max.toLocaleString()}\n\n`;
                systemPrompt += `**Target Offer:** Start around the middle. Fish first: "What amount would actually help?"\n`;
                systemPrompt += `**If they want more:** Go up to max, but ask what they need it for.\n`;
                systemPrompt += `**If they want less:** Great, shorter term = faster close.\n\n`;
            }

            if (gamePlan.objection_strategy) {
                systemPrompt += `**If They Push Back:** ${gamePlan.objection_strategy}\n\n`;
            }

            if (gamePlan.urgency_angle) {
                systemPrompt += `**Urgency Angle:** ${gamePlan.urgency_angle}\n\n`;
            }

            if (gamePlan.next_action) {
                systemPrompt += `**Your Next Move:** ${gamePlan.next_action}\n`;
            }

            if (gamePlan.stacking_assessment) {
                systemPrompt += `\n**Stacking Info:** ${gamePlan.stacking_assessment.stacking_notes}\n`;
            }

            if (gamePlan.lender_notes) {
                systemPrompt += `**Lender Strategy:** ${gamePlan.lender_notes}\n`;
            }
        }

        if (fcsData) {
            systemPrompt += `\n\n---\n\n## 📊 FINANCIAL CONTEXT (Use this to negotiate)\n`;
            systemPrompt += `**Monthly Revenue:** $${Math.round(fcsData.average_revenue || 0).toLocaleString()}\n`;
            systemPrompt += `**Daily Balance:** $${Math.round(fcsData.average_daily_balance || 0).toLocaleString()}\n`;
            systemPrompt += `**Current Withholding:** ${fcsData.withholding_percentage || 'Unknown'}%\n`;
            systemPrompt += `**Negative Days:** ${fcsData.total_negative_days || 0}\n`;

            if (fcsData.positions && fcsData.positions.length > 0) {
                systemPrompt += `**Existing Positions:** ${fcsData.positions.length} active\n`;
            }

            systemPrompt += `\n**Summary:** ${fcsData.analysis_summary || 'No summary'}\n`;
        }

        if (offers && offers.length > 0) {
            systemPrompt += `\n\n---\n\n## 💰 ACTIVE OFFERS (Use for negotiation)\n`;
            offers.forEach(o => {
                systemPrompt += `- **${o.lender_name}**: $${Number(o.offer_amount).toLocaleString()}`;
                if (o.factor_rate) systemPrompt += ` @ ${o.factor_rate} factor`;
                if (o.term_length) systemPrompt += `, ${o.term_length} ${o.term_unit || 'days'}`;
                if (o.payment_frequency) systemPrompt += ` (${o.payment_frequency})`;
                systemPrompt += `\n`;
            });
            systemPrompt += `\n**Negotiation:** You can adjust terms within reason. If they push back, offer longer term or lower amount. Goal is to close the deal.\n`;
        }

        // Build the Message Chain
        let messages = [{ role: "system", content: systemPrompt }];

        history.rows.forEach(msg => {
            let role;

            if (msg.direction === 'outbound' || msg.direction === 'system') {
                role = 'assistant';
            } else if (msg.direction === 'inbound') {
                role = 'user';
            } else {
                return;
            }

            messages.push({ role: role, content: msg.content });
        });

        // --- FIRST PASS (Decide what to do) ---
        const completion = await openai.chat.completions.create({
            model: "gpt-5-mini",
            messages: messages,
            tools: availableTools, // Use filtered tools list (Layer 3)
            tool_choice: "auto"
        });

        if (completion.usage) {
            await trackUsage({
                userId: usageUserId,
                conversationId,
                type: 'llm_call',
                service: 'openai',
                model: completion.model || 'gpt-5-mini',
                inputTokens: completion.usage.prompt_tokens,
                outputTokens: completion.usage.completion_tokens,
                metadata: { pass: 'first' }
            });
        }

        const aiMsg = completion.choices[0].message;
        let responseContent = aiMsg.content;

        // 6. HANDLE TOOLS & RE-THINK
        if (aiMsg.tool_calls) {

            // Add the AI's tool decision to history
            messages.push(aiMsg);

            for (const tool of aiMsg.tool_calls) {
                let toolResult = "";

                if (tool.function.name === 'update_lead_status') {
                    const args = JSON.parse(tool.function.arguments);
                    await db.query("UPDATE conversations SET state = $1 WHERE id = $2", [args.status, conversationId]);
                    toolResult = `Status updated to ${args.status}.`;
                }

                else if (tool.function.name === 'trigger_drive_sync') {
                    // Check if already synced
                    const stateCheck = await db.query(
                        `SELECT state FROM conversations WHERE id = $1`,
                        [conversationId]
                    );

                    const currentState = stateCheck.rows[0]?.state;

                    // Don't re-sync if already past this stage
                    if (['FCS_READY', 'FCS_COMPLETE', 'STRATEGIZED', 'HOT_LEAD', 'OFFER_READY'].includes(currentState)) {
                        console.log(`⏭️ Skipping drive sync - already in state: ${currentState}`);
                        toolResult = "Documents already synced. No need to sync again.";
                    } else {
                        console.log(`📂 AI DECISION: Syncing Drive for "${businessName}"...`);
                        syncDriveFiles(conversationId, businessName, usageUserId);
                        toolResult = "Drive sync started in background.";
                    }
                }

                else if (tool.function.name === 'consult_analyst') {
                    const args = JSON.parse(tool.function.arguments);
                    console.log(`🎓 HANDOFF: Collected all info - passing to human`);

                    // 🔒 LOCK: Update status to HUMAN_REVIEW so AI stops replying
                    await db.query("UPDATE conversations SET state = 'HUMAN_REVIEW' WHERE id = $1", [conversationId]);
                    console.log(`🔒 Lead locked to HUMAN_REVIEW - AI will stop autonomous replies`);

                    // Simple handoff message - NO offer, NO numbers
                    toolResult = "Tell the lead: 'give me a few minutes to run the numbers and ill text you back shortly'";
                }

                else if (tool.function.name === 'generate_offer') {
                    console.log(`💰 AI DECISION: Generating formal offer...`);
                    const offer = await commanderService.generateOffer(conversationId);
                    if (offer) {
                        toolResult = `OFFER READY: ${offer.offer_amount.toLocaleString()} at ${offer.factor_rate} factor rate. Term: ${offer.term} ${offer.term_unit}. Payment: ${offer.payment_amount} ${offer.payment_frequency}.

Send this message to the lead: "${offer.pitch_message}"`;
                    } else {
                        toolResult = "Offer generation failed. Tell the lead you're finalizing numbers and will text back in a few minutes.";
                    }
                }

                else if (tool.function.name === 'no_response_needed') {
                    console.log(`🤫 AI DECISION: No response needed - staying silent`);
                    return { shouldReply: false };
                }

                messages.push({
                    role: "tool",
                    tool_call_id: tool.id,
                    content: toolResult
                });
            }

            // --- SECOND PASS (Generate the Final Reply with Context) ---
            const secondPass = await openai.chat.completions.create({
                model: "gpt-5-mini",
                messages: messages
            });

            if (secondPass.usage) {
                await trackUsage({
                    userId: usageUserId,
                    conversationId,
                    type: 'llm_call',
                    service: 'openai',
                    model: secondPass.model || 'gpt-5-mini',
                    inputTokens: secondPass.usage.prompt_tokens,
                    outputTokens: secondPass.usage.completion_tokens,
                    metadata: { pass: 'second' }
                });
            }

            responseContent = secondPass.choices[0].message.content;
        }

        if (responseContent) {
            // 📊 TRACK AI MODE RESPONSE
            const lastMsgRes = await db.query(`
                SELECT content FROM messages
                WHERE conversation_id = $1 AND direction = 'inbound'
                ORDER BY timestamp DESC LIMIT 1
            `, [conversationId]);
            const userMessage = lastMsgRes.rows[0]?.content || 'N/A';

            await trackResponseForTraining(conversationId, userMessage, responseContent, 'AI_MODE');

            return { shouldReply: true, content: responseContent };
        }
        return { shouldReply: false };

    } catch (err) {
        console.error("🔥 AI Agent Error:", err);
        return { error: err.message };
    }
}

module.exports = { processLeadWithAI, trackResponseForTraining };
