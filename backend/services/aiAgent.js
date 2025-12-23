// backend/services/aiAgent.js
const { OpenAI } = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { getDatabase } = require('./database');
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

// 📖 HELPER: Load Persona + Strategy
function getGlobalPrompt() {
    try {
        const promptsDir = path.join(__dirname, '../prompts');
        
        // List of strategy files to load (in order)
        const strategyFiles = [
            'persona.md',              // Optional: identity/tone
            'strategy_objectives.md',  // What we're trying to accomplish
            'strategy_vetting.md',     // How to collect info
            'strategy_objections.md',  // Handling pushback
            'strategy_engagement.md'   // Reading the conversation
        ];
        
        let combinedPrompt = "";

        for (const filename of strategyFiles) {
            const filePath = path.join(promptsDir, filename);
            if (fs.existsSync(filePath)) {
                combinedPrompt += fs.readFileSync(filePath, 'utf8') + "\n\n---\n\n";
                console.log(`✅ Loaded: ${filename}`);
            } else {
                console.log(`⚠️ Missing: ${filename}`);
            }
        }

        // Fallback if no files found
        if (!combinedPrompt) {
            combinedPrompt = "You are Dan Torres, an underwriter at JMS Global. Keep texts short and professional.";
        }

        return combinedPrompt;

    } catch (err) {
        console.error('⚠️ Error loading prompt files:', err.message);
        return "You are Dan Torres. Keep texts short.";
    }
}

async function processLeadWithAI(conversationId, systemInstruction) {
    const db = getDatabase();
    console.log(`🧠 AI Agent Processing Lead: ${conversationId}`);

    try {
        // =================================================================
        // 🚨 LAYER 1: MISSION ACCOMPLISHED CHECK (Status Lock)
        // If the lead is already in a "Human" stage, DO NOT REPLY.
        // =================================================================
        const statusCheck = await db.query(`SELECT state FROM conversations WHERE id = $1`, [conversationId]);
        const currentState = statusCheck.rows[0]?.state;

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
                SELECT timestamp, sender_type
                FROM messages
                WHERE conversation_id = $1 AND direction = 'outbound'
                ORDER BY timestamp DESC LIMIT 1
            `, [conversationId]);

            if (lastOutbound.rows.length > 0) {
                const lastMsg = lastOutbound.rows[0];
                const timeDiff = (new Date() - new Date(lastMsg.timestamp)) / 1000 / 60; // Minutes

                // If HUMAN sent the last message less than 15 mins ago -> SLEEP
                if (lastMsg.sender_type === 'user' && timeDiff < 15) {
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
        if (systemInstruction.includes("Underwriter Hook")) {
            const content = `Hi ${nameToUse} my name is Dan Torres I'm one of the underwriters at JMS Global. I'm currently going over the bank statements and the application you sent in and I wanted to make an offer. What's the best email to send the offer to?`;
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

        // 4. BUILD CONVERSATION HISTORY
        const history = await db.query(`
            SELECT direction, content FROM messages
            WHERE conversation_id = $1
            ORDER BY timestamp ASC LIMIT 20
        `, [conversationId]);

        // 5. BUILD SYSTEM PROMPT
        let systemPrompt = getGlobalPrompt();

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

        // Build the Message Chain
        let messages = [{ role: "system", content: systemPrompt }];

        history.rows.forEach(msg => {
            messages.push({ role: msg.direction === 'outbound' ? 'assistant' : 'user', content: msg.content });
        });

        // --- FIRST PASS (Decide what to do) ---
        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: messages,
            tools: availableTools, // Use filtered tools list (Layer 3)
            tool_choice: "auto"
        });

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
                        syncDriveFiles(conversationId, businessName);
                        toolResult = "Drive sync started in background.";
                    }
                }

                else if (tool.function.name === 'consult_analyst') {
                    const args = JSON.parse(tool.function.arguments);
                    console.log(`🎓 HANDOFF: GPT-4o -> Gemini 2.5 Pro`);

                    // 🔒 LOCK: Update status to HUMAN_REVIEW so AI stops replying after this
                    await db.query("UPDATE conversations SET state = 'HUMAN_REVIEW' WHERE id = $1", [conversationId]);
                    console.log(`🔒 Lead locked to HUMAN_REVIEW - AI will stop autonomous replies`);

                    const fcsRes = await db.query(`
                        SELECT average_revenue, total_negative_days
                        FROM fcs_analyses
                        WHERE conversation_id = $1
                        ORDER BY created_at DESC LIMIT 1
                    `, [conversationId]);

                    if (fcsRes.rows.length > 0) {
                        const fcs = fcsRes.rows[0];
                        const rev = Math.round(fcs.average_revenue || 0).toLocaleString();

                        const analystPrompt = `
                            You are the Senior Analyst at JMS Global.
                            DATA: Revenue: ${rev}/mo, Negatives: ${fcs.total_negative_days}, Credit: ${args.credit_score}, Funding: ${args.recent_funding}
                            TASK: Write the CLOSING text message. Mention revenue. Give a "Soft Offer". End with: "I'm generating the PDF now."
                        `;
                        try {
                             const result = await geminiModel.generateContent(analystPrompt);
                             toolResult = result.response.text().replace(/"/g, '').trim();
                        } catch (e) {
                             toolResult = "Got it. I'm finalizing the PDF offer now.";
                        }
                    } else {
                        toolResult = `Analysis pending. Tell user you will email them in 5 mins.`;
                    }
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
                model: "gpt-4o",
                messages: messages
            });

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
