// backend/services/aiAgent.js
const { OpenAI } = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { getDatabase } = require('./database');
const { trackUsage } = require('./usageTracker');
const { syncDriveFiles } = require('./driveService');
const commanderService = require('./commanderService');
const { updateState } = require('./stateManager');
const { logAIDecision } = require('./aiDecisionLogger');
const { storeMessage, getConversationContext, getSimilarPatterns } = require('./memoryService');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

function cleanToolLeaks(content) {
    if (!content) return content;
    
    // Reject if it's raw JSON/function calls
    if (content.trim().startsWith('{') || content.includes('recipient_name') || content.includes('"function"')) {
        console.log('⚠️ Response was raw JSON, rejecting');
        return null;
    }
    
    // Remove internal reasoning/notes that leaked
    content = content
        .replace(/Consult note:.*?(?=\s{2}|$)/gi, '')
        .replace(/Internal:.*?(?=\s{2}|$)/gi, '')
        .replace(/Note to self:.*?(?=\s{2}|$)/gi, '')
        .replace(/Thinking:.*?(?=\s{2}|$)/gi, '')
        .replace(/Strategy:.*?(?=\s{2}|$)/gi, '')
        .replace(/\(Calling\s+\w+[^)]*\)/gi, '')
        .replace(/\w+_\w+\s+(tool\s+)?invoked\.?/gi, '')
        .replace(/\{"status"\s*:\s*"[^"]*"[^}]*\}/gi, '')
        .replace(/\{"[^"]*"[^}]*\}/gi, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    // If mostly cleaned away, return null
    if (!content || content.trim().length === 0) {
        return null;
    }

    return content;
}

function generateReasoning(toolsCalled, leadMessage, currentState, stateAfter) {
    const reasons = [];
    
    if (toolsCalled.includes('trigger_drive_sync')) {
        reasons.push('Email received - triggering Drive sync');
    }
    if (toolsCalled.includes('consult_analyst')) {
        reasons.push('All qualifying info collected (email, credit score, funding status) - handing off to analyst');
    }
    if (toolsCalled.includes('update_lead_status')) {
        reasons.push('Lead requested opt-out or marked for review - updating status');
    }
    
    if (currentState !== stateAfter) {
        reasons.push(`State changed: ${currentState} → ${stateAfter}`);
    }
    
    if (toolsCalled.length === 0) {
        reasons.push('Continuing qualification conversation');
    }
    
    return reasons.join('. ') || 'Standard response';
}

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
async function trackResponseForTraining(conversationId, leadMessage, humanResponse, responseSource, leadName = 'Unknown') {
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

        console.log(`📊 [${leadName}] Saved: ${responseSource}`);
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
            description: "CRITICAL: Call this IMMEDIATELY with status='DEAD' if the user says 'stop', 'not interested', 'unsubscribe', 'remove me', or 'wrong number'. This shuts off the auto-nudge system.",
            parameters: {
                type: "object",
                properties: {
                    status: {
                        type: "string",
                        enum: ["DEAD", "HUMAN_REVIEW"],
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
            description: "Call this ONLY when you have ALL THREE: 1. Email, 2. Credit Score, 3. Confirmed NO new funding this month OR if they have new funding, they've already sent the MTD statement. NEVER call this if they said they got funded recently but haven't sent MTD yet. Always ask about new loans BEFORE asking for credit score.",
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

async function getPromptForPhase(userId, currentState) {
    const basePath = path.join(__dirname, '../prompts/sales_agent/base.md');
    const phasePath = path.join(__dirname, `../prompts/sales_agent/phase_${currentState.toLowerCase()}.md`);

    let prompt = fs.readFileSync(basePath, 'utf8');

    if (fs.existsSync(phasePath)) {
        prompt += '\n\n---\n\n' + fs.readFileSync(phasePath, 'utf8');
    }

    // Replace placeholders
    const db = getDatabase();
    const result = await db.query('SELECT agent_name, email FROM users WHERE id = $1', [userId]);
    const agentName = result.rows[0]?.agent_name || 'Dan Torres';
    const agentEmail = result.rows[0]?.email || 'mike@jmsglobal.biz';

    prompt = prompt.replace(/\{\{AGENT_NAME\}\}/g, agentName);
    prompt = prompt.replace(/\{\{AGENT_EMAIL\}\}/g, agentEmail);
    prompt = prompt.replace(/\{\{PHASE\}\}/g, currentState);

    return prompt;
}

// 📖 HELPER: Load Rebuttals
async function getRebuttalsPrompt() {
    try {
        const rebuttalsPath = path.join(__dirname, '../prompts/rebuttals.md');

        if (fs.existsSync(rebuttalsPath)) {
            console.log('✅ Loaded: rebuttals.md');
            return fs.readFileSync(rebuttalsPath, 'utf8');
        }

        console.log('⚠️ Missing: rebuttals.md');
        return '';
    } catch (err) {
        console.error('⚠️ Error loading rebuttals:', err.message);
        return '';
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

    try {
        // Get lead info FIRST for logging
        const leadRes = await db.query(`
            SELECT first_name, business_name, state, email
            FROM conversations WHERE id = $1
        `, [conversationId]);

        const lead = leadRes.rows[0];
        const leadName = lead?.business_name || lead?.first_name || 'Unknown';

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
            console.log(`⛔ [${leadName}] AI manually disabled`);
            return { shouldReply: false };
        }

        // =================================================================
        // 🚨 LAYER 1: MISSION ACCOMPLISHED CHECK (Status Lock)
        // If the lead is already in a "Human" stage, DO NOT REPLY.
        // =================================================================
        const currentState = settingsRes.rows[0]?.state;
        console.log(`\n========== AI AGENT: ${leadName} ==========`); 
        console.log(`📥 Instruction: "${(systemInstruction || 'none').substring(0, 80)}..."`);
        console.log(`📋 Current State: ${currentState}`);

        // Add any statuses here where you want the AI to be completely dead
        const RESTRICTED_STATES = [
            'HUMAN_REVIEW', 'FCS_COMPLETE',
            'STRATEGIZED', 'HOT_LEAD', 'VETTING', 'SUBMITTED',  // Agent 2's territory
            'OFFER_RECEIVED', 'NEGOTIATING',  // Agent 3's territory
            // Cold drip - dispatcher owns these, AI stays out
            'SENT_HOOK', 'SENT_FU_1', 'SENT_FU_2', 'SENT_FU_3', 'SENT_FU_4'
        ];

        // If it's a manual command (systemInstruction has value), we ignore the lock.
        // If it's autonomous (systemInstruction is empty/null), we respect the lock.
        const isManualCommand = systemInstruction && systemInstruction.length > 5;

        if (RESTRICTED_STATES.includes(currentState) && !isManualCommand) {
            console.log(`🔒 BLOCKED: State ${currentState} is restricted`);
            await logAIDecision({
                conversationId,
                businessName: leadName,
                agent: 'pre_vetter',
                instruction: systemInstruction,
                stateBefore: currentState,
                actionTaken: 'blocked',
                blockReason: `State ${currentState} is restricted`
            });
            console.log(`========== END AI AGENT ==========\n`);
            return { shouldReply: false };
        }

        // =================================================================
        // 🚨 LAYER 2: HUMAN INTERRUPTION CHECK
        // If a HUMAN sent a message recently AND lead hasn't replied yet, do not disturb.
        // =================================================================
        if (!isManualCommand) {
            const lastMessages = await db.query(`
                SELECT timestamp, sent_by, direction
                FROM messages
                WHERE conversation_id = $1
                ORDER BY timestamp DESC LIMIT 2
            `, [conversationId]);

            if (lastMessages.rows.length >= 2) {
                const lastMsg = lastMessages.rows[0];      // Most recent
                const prevMsg = lastMessages.rows[1];      // Second most recent

                // Only pause if: human sent last outbound AND lead hasn't replied yet
                if (prevMsg.sent_by === 'user' && prevMsg.direction === 'outbound' && lastMsg.direction === 'outbound') {
                    const timeDiff = (new Date() - new Date(prevMsg.timestamp)) / 1000 / 60;
                    if (timeDiff < 15) {
                        console.log(`⏱️ PAUSED: Human active ${Math.round(timeDiff)}m ago, waiting for lead reply`);
                        console.log(`========== END AI AGENT ==========\n`);
                        return { shouldReply: false };
                    }
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
        const rawName = lead?.first_name || lead?.business_name || "there";
        const nameToUse = formatName(rawName);
        const businessName = lead?.business_name || "Unknown Business";

        // 2. TEMPLATE MODE (The "Free" Drip Campaign)
        // Checks instructions from index.js and returns text instantly.
        // Get agent name for templates
        let agentName = 'Dan Torres'; // default
        let agentEmail = 'docs@jmsglobal.com'; // fallback
        if (usageUserId) {
            const agentRes = await db.query('SELECT agent_name, email FROM users WHERE id = $1', [usageUserId]);
            if (agentRes.rows[0]?.agent_name) {
                agentName = agentRes.rows[0].agent_name;
            }
            if (agentRes.rows[0]?.email) {
                agentEmail = agentRes.rows[0].email;
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
                await trackResponseForTraining(conversationId, systemInstruction, content, 'TEMPLATE_HOOK', leadName);
                return { shouldReply: true, content };
            }
            if (systemInstruction.includes("Did you get funded already?")) {
                const content = "Did you get funded already?";
                await trackResponseForTraining(conversationId, systemInstruction, content, 'TEMPLATE_FUNDED', leadName);
                return { shouldReply: true, content };
            }
            if (systemInstruction.includes("The money is expensive as is")) {
                const content = "The money is expensive as is let me compete.";
                await trackResponseForTraining(conversationId, systemInstruction, content, 'TEMPLATE_COMPETE', leadName);
                return { shouldReply: true, content };
            }
            if (systemInstruction.includes("should i close the file out?")) {
                const content = "Hey just following up again, should i close the file out?";
                await trackResponseForTraining(conversationId, systemInstruction, content, 'TEMPLATE_CLOSE1', leadName);
                return { shouldReply: true, content };
            }
            if (systemInstruction.includes("any response would be appreciated")) {
                const content = "hey any response would be appreciated here, close this out?";
                await trackResponseForTraining(conversationId, systemInstruction, content, 'TEMPLATE_CLOSE2', leadName);
                return { shouldReply: true, content };
            }
            if (systemInstruction.includes("closing out the file")) {
                const content = "Hey just wanted to follow up again, will be closing out the file if i dont hear a response today, ty";
                await trackResponseForTraining(conversationId, systemInstruction, content, 'TEMPLATE_CLOSE3', leadName);
                return { shouldReply: true, content };
            }
        } else if (isDripCampaign && lastMsg && lastMsg.direction === 'inbound') {
            console.log('📬 Drip skipped - lead has responded, switching to AI mode');
        }

        // 🟢 F. THE HAIL MARY (Ballpark Offer)
        if (systemInstruction.includes("Generate Ballpark Offer")) {
            console.log(`🏈 AI MODE: Generating Ballpark Offer (Hail Mary)...`);

            // Check if we have strategy
            const strategyRes = await db.query(`
                SELECT game_plan, lead_grade FROM lead_strategy
                WHERE conversation_id = $1
            `, [conversationId]);

            let offerText = "";
            const strategy = strategyRes.rows[0];

            if (strategy?.game_plan) {
                let gamePlan = strategy.game_plan;
                if (typeof gamePlan === 'string') {
                    gamePlan = JSON.parse(gamePlan);
                }

                const prompt = `
                    You are ${agentName}. This client has ghosted you.

                    CONTEXT:
                    - Lead Grade: ${strategy.lead_grade || 'Unknown'}
                    - Your Approach: ${gamePlan.approach || 'Standard'}

                    TASK:
                    Write a short text to wake them up. Keep it vague but compelling.
                    - Mention you looked over their file/statements and liked what you saw
                    - Say you wanted to make an offer before closing the file
                    - Ask if they want you to send the numbers or close it out

                    RULES:
                    - Do NOT mention specific dollar amounts
                    - Do NOT mention specific revenue numbers
                    - Do NOT introduce yourself by name (they already know you)
                    - Keep it under 160 characters if possible
                    - Sound human, not salesy
                `;

                try {
                    const result = await geminiModel.generateContent(prompt);
                    offerText = result.response.text().replace(/"/g, '').trim();
                } catch (e) {
                    offerText = "hey looked over your file again, numbers look solid. want me to send over an offer or should i close it out?";
                }
            } else {
                offerText = "hey i havent heard back — still interested or should i close the file out?";
            }

            await trackResponseForTraining(conversationId, systemInstruction, offerText, 'BALLPARK_OFFER', leadName);
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

        const leadGrade = strategyRes.rows[0]?.lead_grade || null;
        if (strategyRes.rows[0]) {
            gamePlan = strategyRes.rows[0].game_plan;
            if (typeof gamePlan === 'string') {
                try {
                    gamePlan = JSON.parse(gamePlan);
                } catch (e) {
                    console.error(`⚠️ Invalid gamePlan JSON for ${conversationId}:`, e.message);
                    gamePlan = null;
                }
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
        // 4. BUILD CONVERSATION HISTORY - Get LATEST 20, then reverse for chronological order
        const historyRes = await db.query(`
            SELECT direction, content FROM messages
            WHERE conversation_id = $1
            ORDER BY timestamp DESC LIMIT 20
        `, [conversationId]);

        // Reverse to get chronological order (oldest first)
        const history = { rows: historyRes.rows.reverse() };

        // 4b. CHECK FOR HANDOFF ACKNOWLEDGMENT - Stay silent
        // Use the full history (last 20) to find the absolute last outbound/inbound
        const lastOutbounds = history.rows.filter(m => m.direction === 'outbound');
        const lastInbounds = history.rows.filter(m => m.direction === 'inbound');

        const lastOutbound = lastOutbounds.slice(-1)[0]?.content?.toLowerCase() || '';
        const lastInbound = lastInbounds.slice(-1)[0]?.content?.toLowerCase().trim() || '';
        const userMessageForMemory = lastInbounds.slice(-1)[0]?.content || '';

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
            await updateState(conversationId, 'DEAD', 'ai_agent');
            return {
                shouldReply: true,
                content: "understood, ill close it out. if anything changes down the line feel free to reach back out"
            };
        }

        // 5. BUILD SYSTEM PROMPT
        let systemPrompt = await getPromptForPhase(usageUserId, currentState);
        systemPrompt += `\n\n## 📧 YOUR EMAIL\nIf the merchant asks where to send documents, give them: ${agentEmail}\n`;
        systemPrompt += `\n## ⚠️ CRITICAL RULES\n- If lead says \"what?\", \"I don't understand\", \"what are you talking about\" → APOLOGIZE and explain simply\n- If lead says \"why are you repeating yourself\" → APOLOGIZE, acknowledge the issue, and change approach\n- NEVER start with \"depends on\" twice in a row\n- Before responding, mentally check: \"Did I already say this?\"\n`;
        systemPrompt += `\n## 💪 FIGHT FOR THE DEAL\nWhen lead says \"going with another broker\" or \"found someone else\":\n- \"wait what are they offering? let me see if i can beat it\"\n- \"hold on - what numbers they give you? dont sign anything yet\"\n- \"who you going with? i can probably match or beat it\"\n\nWhen lead says \"not interested\":\n- \"what happened?\"\n- \"you get funded already?\"\n- \"what changed?\"\n\nWhen lead goes quiet after seeing numbers:\n- \"too high?\"\n- \"what payment works better?\"\n- \"talk to me\"\n\nRULES:\n- Short punchy texts. No fluff.\n- Never say \"no worries\" or \"feel free to reach out\" on first objection\n- Sound like a real person, not a bot\n- Match their energy\n- One question at a time\n- Lowercase is fine\n`;
        systemPrompt += `\n## ⚠️ NEVER INCLUDE IN YOUR RESPONSE:\n- Internal notes or thinking (\"Consult note:\", \"Strategy:\", \"Note to self:\")\n- Reasoning about what to say\n- References to tools or functions\n- Anything the lead shouldn't see\n\nYour response goes DIRECTLY to the lead via SMS. Only include the actual message.\n`;

        // Long-term memory (conversation + global patterns)
        const longTermContext = userMessageForMemory
            ? await getConversationContext(conversationId, userMessageForMemory, 5)
            : [];
        const winningPatterns = userMessageForMemory
            ? await getSimilarPatterns(userMessageForMemory, { outcome: 'funded', direction: 'outbound' }, 3)
            : [];

        if (longTermContext.length > 0) {
            systemPrompt += `\n\n## 🧠 EARLIER IN THIS CONVERSATION\n`;
            longTermContext.forEach(c => {
                systemPrompt += `- [${c.direction}]: ${c.content.substring(0, 100)}...\n`;
            });
        }

        if (winningPatterns.length > 0) {
            systemPrompt += `\n\n## 🏆 WHAT WORKED WITH SIMILAR LEADS\n`;
            winningPatterns.forEach(p => {
                systemPrompt += `- ${p.content.substring(0, 150)}...\n`;
            });
        }

        // Load rebuttals playbook
        const rebuttals = await getRebuttalsPrompt();
        if (rebuttals) {
            systemPrompt += `\n\n---\n\n${rebuttals}`;
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

        // Inject current state so AI knows how to behave
        systemPrompt += `\n\n---\n\n## 📋 CURRENT STATE: ${currentState}\n`;
        if (systemInstruction) {
            systemPrompt += `**Instruction:** ${systemInstruction}\n`;
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
        console.log(`🧠 Calling OpenAI with ${messages.length} messages...`);
        console.log(`🛠️ Tools available: ${availableTools.map(t => t.function.name).join(', ')}`);
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
        const toolsCalled = aiMsg.tool_calls?.map(t => t.function.name) || [];
        let stateAfter = currentState;
        console.log(`🔍 First pass raw:`, JSON.stringify(aiMsg));

        const lastMsgRes = await db.query(`
            SELECT content FROM messages
            WHERE conversation_id = $1 AND direction = 'inbound'
            ORDER BY timestamp DESC LIMIT 1
        `, [conversationId]);
        const userMessage = lastMsgRes.rows[0]?.content || 'N/A';

        // 6. HANDLE TOOLS & RE-THINK
        if (aiMsg.tool_calls) {
            const toolNames = toolsCalled.join(', ');
            console.log(`🔧 TOOL CALLS: ${toolNames}`);
            for (const tool of aiMsg.tool_calls) {
                console.log(`   └─ ${tool.function.name}: ${tool.function.arguments}`);
            }

            const stateBeforeRes = await db.query(
                'SELECT state FROM conversations WHERE id = $1',
                [conversationId]
            );
            const stateBefore = stateBeforeRes.rows[0]?.state || null;
            stateAfter = stateBefore || currentState;

            // Add the AI's tool decision to history
            messages.push(aiMsg);

            for (const tool of aiMsg.tool_calls) {
                let toolResult = "";

                if (tool.function.name === 'update_lead_status') {
                    const args = JSON.parse(tool.function.arguments);
                    await updateState(conversationId, args.status, 'ai_agent');
                    stateAfter = args.status;
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
                    if (['QUALIFIED', 'SUBMITTED', 'CLOSING', 'FUNDED'].includes(currentState)) {
                        console.log(`⏭️ Skipping drive sync - already in state: ${currentState}`);
                        toolResult = "Documents already synced. No need to sync again.";
                    } else {
                        console.log(`📂 [${leadName}] Syncing Drive...`);
                        syncDriveFiles(conversationId, businessName, usageUserId);
                        toolResult = "Drive sync started in background.";
                    }
                }

                else if (tool.function.name === 'consult_analyst') {
                    console.log(`🎓 [${leadName}] Handing off to human`);

                    // ✅ HANDOFF: Move to QUALIFIED (FCS should be ready by now)
                    await updateState(conversationId, 'QUALIFIED', 'ai_agent');
                    stateAfter = 'QUALIFIED';
                    console.log(`✅ [${leadName}] Qualified → QUALIFIED`);

                    // Simple handoff message - NO offer, NO numbers
                    toolResult = "Tell the lead: 'give me a few minutes to run the numbers and ill text you back shortly'";
                }

                else if (tool.function.name === 'generate_offer') {
                    console.log(`💰 AI DECISION: Generating formal offer...`);
                    const offer = await commanderService.generateOffer(conversationId);
                    if (offer) {
                        toolResult = `OFFER READY: ${(offer.offer_amount ?? 0).toLocaleString()} at ${offer.factor_rate ?? 'N/A'} factor rate. Term: ${offer.term ?? 'N/A'} ${offer.term_unit ?? ''}. Payment: ${(offer.payment_amount ?? 0).toLocaleString()} ${offer.payment_frequency ?? ''}.

Send this message to the lead: "${offer.pitch_message}"`;
                    } else {
                        toolResult = "Offer generation failed. Tell the lead you're finalizing numbers and will text back in a few minutes.";
                    }
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
            responseContent = cleanToolLeaks(responseContent);
            if (!responseContent || responseContent.trim() === '' || responseContent.includes('recipient_name')) {
                console.log('⚠️ Invalid response format after cleaning');
                responseContent = null;
            }
        }

        // Force a response if AI returned nothing
        if (!responseContent || responseContent.trim() === '') {
            console.log(`⚠️ AI returned empty - forcing fallback response`);
            responseContent = "got it, give me one sec";
        }

        console.log(`✅ AI Response: "${responseContent.substring(0, 80)}..."`);
        console.log(`========== END AI AGENT ==========\n`);
        // 📊 TRACK AI MODE RESPONSE
        await trackResponseForTraining(conversationId, userMessage, responseContent, 'AI_MODE', leadName);

        const reasoning = systemInstruction || generateReasoning(toolsCalled, userMessage, currentState, stateAfter);
        await logAIDecision({
            conversationId,
            businessName: leadName,
            agent: 'pre_vetter',
            leadMessage: userMessage,
            instruction: reasoning,
            stateBefore: currentState,
            stateAfter,
            toolsCalled,
            aiResponse: responseContent,
            actionTaken: 'responded',
            tokensUsed: completion.usage?.total_tokens
        });

        // Store outbound message in vector memory
        try {
            await storeMessage(conversationId, responseContent, {
                direction: 'outbound',
                state: currentState,
                lead_grade: leadGrade
            });
        } catch (err) {
            console.error('⚠️ Memory store failed (outbound):', err.message);
        }

        return { shouldReply: true, content: responseContent };

    } catch (err) {
        console.error("🔥 AI Agent Error:", err);
        return { error: err.message };
    }
}

module.exports = { processLeadWithAI, trackResponseForTraining };
