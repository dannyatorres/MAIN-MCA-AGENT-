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

// --- FIX 1: Add Context Helpers ---
async function getLeadFacts(conversationId) {
    const db = getDatabase();
    const res = await db.query('SELECT fact_key, fact_value FROM lead_facts WHERE conversation_id = $1', [conversationId]);
    const facts = {};
    res.rows.forEach(r => facts[r.fact_key] = r.fact_value);
    return facts;
}

async function saveExtractedFacts(conversationId, extracted) {
    if (!extracted) return;
    const db = getDatabase();
    for (const [key, value] of Object.entries(extracted)) {
        if (value && value !== 'null' && value !== 'unknown') {
            await db.query(`
                INSERT INTO lead_facts (conversation_id, fact_key, fact_value, collected_at)
                VALUES ($1, $2, $3, NOW())
                ON CONFLICT (conversation_id, fact_key) 
                DO UPDATE SET fact_value = $3, collected_at = NOW()
            `, [conversationId, key, value]);
            console.log(`💾 Saved Fact [${conversationId}]: ${key} = ${value}`);
        }
    }
}

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
        .replace(/\([^)]*(?:consult_analyst|update_lead_status|trigger_drive_sync|generate_offer|no_response_needed)[^)]*\)/gi, '')
        .replace(/\(\s*(?:Calling|Triggered|Called|Invoking|Running|Using)\s+\w+[^)]*\)/gi, '')
        .replace(/\(\s*\w+_\w+[^)]*\)/gi, '')
        .replace(/^(?:Calling|Triggered|Called|Invoking)\s+\w+.*$/gim, '')
        .replace(/\w+_\w+\s+(?:tool\s+)?(?:invoked|called|triggered)\.?/gi, '')
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

// 🕐 TEMPORAL CONTEXT ENGINE - Always-on date/time awareness
function buildTemporalContext(historyRows) {
    const now = new Date();
    const estNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const dayOfMonth = estNow.getDate();
    const dayOfWeek = estNow.toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'long' });
    const currentMonthName = estNow.toLocaleString('en-US', { timeZone: 'America/New_York', month: 'long' });
    const currentYear = estNow.getFullYear();
    const hour = estNow.getHours();

    const lastMonth = new Date(estNow.getFullYear(), estNow.getMonth() - 1, 1);
    const lastMonthName = lastMonth.toLocaleString('en-US', { timeZone: 'America/New_York', month: 'long' });
    const twoMonthsAgo = new Date(estNow.getFullYear(), estNow.getMonth() - 2, 1);
    const twoMonthsAgoName = twoMonthsAgo.toLocaleString('en-US', { timeZone: 'America/New_York', month: 'long' });

    // Figure out conversation duration
    let convoStartDate = null;
    let convoAge = '';
    if (historyRows && historyRows.length > 0) {
        const firstMsg = historyRows.find(m => m.timestamp);
        if (firstMsg?.timestamp) {
            convoStartDate = new Date(firstMsg.timestamp);
            const daysDiff = Math.floor((estNow - convoStartDate) / (1000 * 60 * 60 * 24));
            if (daysDiff === 0) convoAge = 'started today';
            else if (daysDiff === 1) convoAge = 'started yesterday';
            else convoAge = `started ${daysDiff} days ago`;
        }
    }

    // Business hours context
    let timeContext = '';
    if (hour < 8) timeContext = 'Before business hours - they may not respond immediately.';
    else if (hour >= 20) timeContext = 'After business hours - expect delayed responses.';
    else if (hour >= 17) timeContext = 'Late afternoon/evening - people are wrapping up work.';
    else timeContext = 'During business hours.';

    // Bank statement logic
    let statementGuidance = '';
    if (dayOfMonth <= 7) {
        statementGuidance = `CRITICAL: It is early ${currentMonthName}. The ${lastMonthName} full statement is likely NOT generated yet by banks. Ask for bank transactions from ${lastMonthName} 1st through ${lastMonthName} end, OR a month-to-date from ${currentMonthName} 1st through today. Do NOT ask for "${currentMonthName} statement" as a full statement - it doesnt exist yet. If you need recent activity say "transactions from the 1st till today".`;
    } else if (dayOfMonth <= 15) {
        statementGuidance = `The ${lastMonthName} full statement should be available now from most banks. Ask for the ${lastMonthName} statement if missing. MTD (${currentMonthName} 1st through today) only needed if they got new funding this month.`;
    } else {
        statementGuidance = `The ${lastMonthName} statement is definitely available. If missing from their file, ask for it. You can also request ${currentMonthName} MTD (1st through today) if it helps close the deal or lender needs recent activity.`;
    }

    return `## 🕐 TEMPORAL CONTEXT (READ THIS FIRST - THIS IS YOUR CLOCK)
RIGHT NOW: ${dayOfWeek}, ${currentMonthName} ${dayOfMonth}, ${currentYear} at ${estNow.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' })} EST
${timeContext}
${convoAge ? `This conversation ${convoAge}.` : ''}

STATEMENT RULES FOR TODAY:
${statementGuidance}

IMPORTANT DATE RULES:
- When you say "1st till today" you mean ${currentMonthName} 1st through ${currentMonthName} ${dayOfMonth}
- "${lastMonthName} statement" = the full month of ${lastMonthName} ${currentYear}
- "MTD" always means ${currentMonthName} 1st through today (${currentMonthName} ${dayOfMonth})
- NEVER ask for a month-to-date for a month that has already ended (e.g. dont say "${lastMonthName} MTD" - thats just the ${lastMonthName} statement)
- If lead already promised to send docs at a specific time, REMEMBER THAT and dont re-ask before that time passes
`;
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
async function getGlobalPrompt(userId, currentState) {
    try {
        const basePath = path.join(__dirname, '../prompts/sales_agent/base.md');

        const phaseMap = {
            'NEW': 'phase_active.md',
            'DRIP': 'phase_active.md',
            'ACTIVE': 'phase_active.md',
            'QUALIFIED': 'phase_qualified.md',
            'PITCH_READY': 'phase_pitch.md',
            'SUBMITTED': 'phase_submitted.md',
            'CLOSING': 'phase_closing.md'
        };

        const phaseFile = phaseMap[currentState] || 'phase_active.md';
        const phasePath = path.join(__dirname, `../prompts/sales_agent/${phaseFile}`);

        let agentName = 'Dan Torres';
        if (userId) {
            const db = getDatabase();
            const result = await db.query('SELECT agent_name FROM users WHERE id = $1', [userId]);
            if (result.rows[0]?.agent_name) {
                agentName = result.rows[0].agent_name;
            }
        }

        let prompt = '';

        if (fs.existsSync(basePath)) {
            prompt = fs.readFileSync(basePath, 'utf8');
        }

        if (fs.existsSync(phasePath)) {
            const phasePrompt = fs.readFileSync(phasePath, 'utf8');
            prompt += '\n\n' + phasePrompt;
        }

        if (!prompt) {
            console.log('⚠️ Missing prompt files');
            return `You are ${agentName}, an underwriter at JMS Global. Keep texts short and professional. NEVER narrate tool calls.`;
        }

        console.log(`✅ Loaded: base.md + ${phaseFile} (Agent: ${agentName})`);

        prompt = prompt.replace(/\{\{AGENT_NAME\}\}/g, agentName);
        prompt = prompt.replace(/\{\{PHASE\}\}/g, currentState || 'ACTIVE');

        return prompt;
    } catch (err) {
        console.error('⚠️ Error loading prompt:', err.message);
        return 'You are an underwriter at JMS Global. Keep texts short and professional. NEVER narrate tool calls.';
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
        // Remove consult_analyst if already qualified
        if (['QUALIFIED', 'SUBMITTED', 'CLOSING'].includes(currentState)) {
            availableTools = availableTools.filter(t => t.function.name !== 'consult_analyst');
        }

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
            SELECT direction, content, timestamp FROM messages
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

        // =================================================================
        // 🚨 LAYER 4E: PITCH ACCEPTANCE CHECK
        // =================================================================
        if (currentState === 'PITCH_READY') {
            const wePitched = /\b\d+k\b/.test(lastOutbound) ||
                (lastOutbound.includes('does') && lastOutbound.includes('work'));
            const theyAccepted = ['yes', 'yeah', 'sure', 'yep', 'that works', 'lets do it',
                'ok', 'sounds good', 'im down', 'yes!', 'absolutely']
                .some(phrase => lastInbound === phrase || lastInbound.startsWith(phrase));
            const theyWantAmount = /\b\d+\b/.test(lastInbound) &&
                (lastInbound.includes('would') || lastInbound.includes('help') ||
                    lastInbound.includes('need') || lastInbound.includes('best'));

            if (wePitched && (theyAccepted || theyWantAmount)) {
                console.log('✅ Lead accepted pitch - moving to CLOSING');
                await updateState(conversationId, 'CLOSING', 'ai_agent');
                await db.query('UPDATE conversations SET nudge_count = 0 WHERE id = $1', [conversationId]);
                systemInstruction = 'Lead accepted the offer amount. Confirm the number, express confidence, and ask them to send the required documents to close.';
            }
        }

        // 5. BUILD SYSTEM PROMPT
        let systemPrompt = await getPromptForPhase(usageUserId, currentState);
        systemPrompt += `\n\n## 📧 YOUR EMAIL\nIf the merchant asks where to send documents, give them: ${agentEmail}\n`;
        // Inject temporal context FIRST (clock + statement logic)
        const temporalContext = buildTemporalContext(history.rows);
        systemPrompt = temporalContext + '\n\n' + systemPrompt;
        systemPrompt += `\n## ⚠️ CRITICAL RULES\n- If lead says \"what?\", \"I don't understand\", \"what are you talking about\" → APOLOGIZE and explain simply\n- If lead says \"why are you repeating yourself\" → APOLOGIZE, acknowledge the issue, and change approach\n- NEVER start with \"depends on\" twice in a row\n- Before responding, mentally check: \"Did I already say this?\"\n`;
        systemPrompt += `\n## 💪 FIGHT FOR THE DEAL\nWhen lead says \"going with another broker\" or \"found someone else\":\n- \"wait what are they offering? let me see if i can beat it\"\n- \"hold on - what numbers they give you? dont sign anything yet\"\n- \"who you going with? i can probably match or beat it\"\n\nWhen lead says \"not interested\":\n- \"what happened?\"\n- \"you get funded already?\"\n- \"what changed?\"\n\nWhen lead goes quiet after seeing numbers:\n- \"too high?\"\n- \"what payment works better?\"\n- \"talk to me\"\n\nRULES:\n- Short punchy texts. No fluff.\n- Never say \"no worries\" or \"feel free to reach out\" on first objection\n- Sound like a real person, not a bot\n- Match their energy\n- One question at a time\n- Lowercase is fine\n`;
        systemPrompt += `\n## ⚠️ NEVER INCLUDE IN YOUR RESPONSE:\n- Internal notes or thinking (\"Consult note:\", \"Strategy:\", \"Note to self:\")\n- Reasoning about what to say\n- References to tools or functions\n- Anything the lead shouldn't see\n\nYour response goes DIRECTLY to the lead via SMS. Only include the actual message.\n`;
        systemPrompt += `\n## FORMATTING RULES (ALWAYS FOLLOW)\n- all lowercase only\n- no emojis ever\n- no special symbols like bullets or dashes\n- no dollar signs, just say \"20k\" or \"twenty thousand\"\n- keep messages under 160 characters\n- sound like a real person texting\n`;

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
                const pitchAmount = gamePlan.offer_range.aggressive || gamePlan.offer_range.max;
                const rounded = Math.round(pitchAmount / 1000) + 'k';
                systemPrompt += `**Pitch Amount: ${rounded}**\n`;
                systemPrompt += `Present this casually - "does ${rounded} work?" or "im looking at around ${rounded}, would that help?". You're gauging interest, not confirming an approval. Never give a range, just the single number.\n`;
                systemPrompt += `**If they want more:** "let me see what i can do, how much did you have in mind?"\n`;
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

            // MTD guidance from Commander
            if (gamePlan.mtd_strategy && gamePlan.mtd_strategy !== 'not_needed') {
                systemPrompt += `\n\n## 📄 DOCUMENT STATUS`;
                if (gamePlan.document_freshness?.latest_statement_month) {
                    systemPrompt += `\nLatest Statement: ${gamePlan.document_freshness.latest_statement_month}`;
                }
                if (gamePlan.document_freshness?.missing_months?.length > 0) {
                    systemPrompt += `\nMissing: ${gamePlan.document_freshness.missing_months.join(', ')}`;
                }
                systemPrompt += `\nMTD Strategy: ${gamePlan.mtd_strategy}`;
                if (gamePlan.mtd_message) {
                    systemPrompt += `\nHow to ask: "${gamePlan.mtd_message}"`;
                }
                systemPrompt += `\nReasoning: ${gamePlan.mtd_reasoning || 'See above'}`;
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

        // --- FIX 2: Inject Context Checklist & JSON Rules ---
        const facts = await getLeadFacts(conversationId);

        const needsMTD = facts.recent_funding &&
            !['none', 'no', 'n/a', 'false'].includes(facts.recent_funding.toLowerCase()) &&
            !facts.mtd_received;

        const mtdStatusLine = needsMTD
            ? (facts.mtd_requested ? '- MTD Statement: ❌ (Requested, waiting for merchant)' : '- MTD Statement: ❌ (REQUIRED - they got funded, need MTD before qualifying)')
            : '';

        systemPrompt += `\n\n## 📝 DATA CHECKLIST (Status: ${currentState})
        - Email: ${facts.email ? '✅ ' + facts.email : '❌ (Ask for this)'}
        - Credit Score: ${facts.credit_score ? '✅ ' + facts.credit_score : '❌ (Ask for this after Email)'}
        - Recent Funding: ${facts.recent_funding ? '✅ ' + facts.recent_funding : '❌ (Ask if they took new loans)'}
        ${mtdStatusLine}
        ${needsMTD ? '⚠️ CRITICAL: DO NOT set action to "qualify" until MTD is received.' : ''}
        
        ## ⚙️ OUTPUT FORMAT
        You must return Valid JSON ONLY. No markdown, no thinking text.
        Structure:
        {
           "action": "respond" | "qualify" | "mark_dead" | "sync_drive" | "no_response",
           "message": "The exact SMS to send (lowercase, casual, <160 chars). Null if no_response.",
           "reason": "Internal reasoning here"
        }
        
        ACTIONS:
        - "respond": Standard reply or question.
        - "qualify": You have ALL checks (Email + Credit + Funding + MTD if needed). Move to QUALIFIED.
        - "mark_dead": Lead said stop/remove/not interested.
        - "sync_drive": Lead JUST provided email address.
        - "no_response": Lead said "ok", "thanks", or acknowledged. No reply needed. (NOT if state is PITCH_READY)
        `;

        // State-specific behavior
        let stateBehavior = '';
        if (currentState === 'PITCH_READY') {
            stateBehavior = `
## 🎯 STATE: PITCH_READY
You MUST present an offer. Do NOT return no_response.
- You have the Commander strategy with offer range
- Lead is waiting for numbers
- Even if their last message was "ok" or acknowledgment, NOW is the time to pitch
- Use the offer_range from Commander's orders
`;
        } else if (currentState === 'QUALIFIED') {
            stateBehavior = `
## 📋 STATE: QUALIFIED  
Still processing. If waiting for MTD or documents, it's ok to wait.
`;
        } else if (currentState === 'ACTIVE') {
            stateBehavior = `
## 📋 STATE: ACTIVE
Collecting info. Follow the checklist - ask for missing items.
`;
        }

        systemPrompt += stateBehavior;

        // Skip AI call if just waiting for MTD
        if (currentState === 'QUALIFIED') {
            const waitingPhrases = ['later', 'will send', 'tonight', 'tomorrow', 'when i can', 'give me', 'few hours', 'after work'];

            if (waitingPhrases.some(p => lastInbound.includes(p))) {
                console.log(`⏸️ Lead said they'll send later - skipping AI call`);
                return { shouldReply: false };
            }
        }

        // Skip AI call for simple acknowledgments (save API costs)
        const ackPhrases = ['ok', 'okay', 'thanks', 'thank you', 'got it', 'sounds good',
            'cool', 'k', 'ty', 'thx', 'appreciate it', 'will do'];
        if (ackPhrases.includes(lastInbound) && currentState !== 'PITCH_READY') {
            console.log(`⏸️ Lead sent acknowledgment "${lastInbound}" - skipping AI call`);
            await db.query('UPDATE conversations SET last_activity = NOW() WHERE id = $1', [conversationId]);
            return { shouldReply: false };
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

            // Prepend timestamp so AI knows WHEN each message was sent
            let timestampPrefix = '';
            if (msg.timestamp) {
                const msgDate = new Date(msg.timestamp);
                timestampPrefix = `[${msgDate.toLocaleString('en-US', { 
                    timeZone: 'America/New_York',
                    month: 'short', 
                    day: 'numeric', 
                    hour: 'numeric', 
                    minute: '2-digit'
                })}] `;
            }

            messages.push({ role: role, content: timestampPrefix + msg.content });
        });

        // 🛡️ ALREADY-PROCESSED CHECK (skip if no new inbound since last AI call)
        const lastInboundMsg = await db.query(`
            SELECT id FROM messages 
            WHERE conversation_id = $1 AND direction = 'inbound'
            ORDER BY timestamp DESC LIMIT 1
        `, [conversationId]);
        const lastInboundMsgId = lastInboundMsg.rows[0]?.id || null;

        const processedCheck = await db.query(
            'SELECT last_processed_msg_id FROM conversations WHERE id = $1',
            [conversationId]
        );

        if (lastInboundMsgId && processedCheck.rows[0]?.last_processed_msg_id === lastInboundMsgId) {
            console.log(`⏭️ [${leadName}] Already processed last inbound - skipping AI call`);
            await db.query('UPDATE conversations SET last_activity = NOW() WHERE id = $1', [conversationId]);
            return { shouldReply: false };
        }

        // --- FIX 3: Execution Switchboard (Complete) ---
        console.log(`🧠 Calling OpenAI (JSON Mode)...`);

        const completion = await openai.chat.completions.create({
            model: "gpt-5-mini",
            messages: messages,
            response_format: { type: "json_object" }
        });

        const tokens = completion.usage || {};
        console.log(`💰 TOKENS [${leadName}]: ${tokens.prompt_tokens} in / ${tokens.completion_tokens} out / ${tokens.total_tokens} total`);

        if (completion.usage) {
            await trackUsage({
                userId: usageUserId,
                conversationId,
                type: 'llm_call',
                service: 'openai',
                model: 'gpt-5-mini',
                inputTokens: completion.usage.prompt_tokens,
                outputTokens: completion.usage.completion_tokens,
                metadata: { mode: 'json_agent' }
            });
        }

        let decision;
        try {
            decision = JSON.parse(completion.choices[0].message.content);
        } catch (e) {
            console.error("JSON Parse Error:", completion.choices[0].message.content);
            decision = { action: "respond", message: "got it, give me one sec" };
        }

        console.log(`🤖 AI Decision: ${decision.action?.toUpperCase() || 'RESPOND'} | Reason: ${decision.reason || 'N/A'}`);

        // Stamp so we don't reprocess this inbound message
        if (lastInboundMsgId) {
            await db.query('UPDATE conversations SET last_processed_msg_id = $1 WHERE id = $2',
                [lastInboundMsgId, conversationId]);
        }

        let responseContent = decision.message;
        let stateAfter = currentState;

        // Check no_response FIRST
        if (decision.action === 'no_response') {
            await db.query('UPDATE conversations SET last_activity = NOW() WHERE id = $1', [conversationId]);
            return { shouldReply: false };
        }

        if (decision.action === 'mark_dead') {
            await updateState(conversationId, 'DEAD', 'ai_agent');
            stateAfter = 'DEAD';
        }
        else if (decision.action === 'qualify') {
            if (!['QUALIFIED', 'SUBMITTED', 'CLOSING'].includes(currentState)) {
                await updateState(conversationId, 'QUALIFIED', 'ai_agent');
                await db.query('UPDATE conversations SET nudge_count = 0 WHERE id = $1', [conversationId]);
                stateAfter = 'QUALIFIED';

                responseContent = "got it. give me a few minutes to run the numbers and ill text you back shortly";

                const facts = await getLeadFacts(conversationId);
                if (facts.email) {
                    syncDriveFiles(conversationId, businessName, usageUserId);
                }

                const fcsCheck = await db.query(
                    "SELECT id FROM fcs_analyses WHERE conversation_id = $1 AND status = 'completed'",
                    [conversationId]
                );
                if (fcsCheck.rows.length > 0) {
                    console.log(`📊 FCS already exists - triggering Commander`);
                    commanderService.analyzeAndStrategize(conversationId)
                        .catch(err => console.error('Commander auto-trigger failed:', err.message));
                }
            }
        }
        else if (decision.action === 'sync_drive') {
            if (!['QUALIFIED', 'SUBMITTED', 'CLOSING', 'FUNDED'].includes(currentState)) {
                syncDriveFiles(conversationId, businessName, usageUserId);
                console.log("📂 Triggered Drive Sync");
            }
            // Ensure we continue the conversation
            if (!responseContent || responseContent === 'null') {
                responseContent = "got it. just confirming any new loans this month?";
            }
        }

        if (!responseContent || responseContent === 'null') {
            await db.query('UPDATE conversations SET last_activity = NOW() WHERE id = $1', [conversationId]);
            return { shouldReply: false };
        }

        const recentOutbound = await db.query(`
            SELECT content FROM messages 
            WHERE conversation_id = $1 AND direction = 'outbound'
            ORDER BY timestamp DESC LIMIT 5
        `, [conversationId]);

        if (currentState === 'PITCH_READY' && gamePlan?.offer_range) {
            const min = gamePlan.offer_range.min?.toLocaleString();
            const max = gamePlan.offer_range.max?.toLocaleString();

            const alreadyPitched = recentOutbound.rows.some(m => {
                const c = m.content.toLowerCase();
                return c.includes('$') || c.includes('offer') || c.includes('get you') 
                    || /does\s+\d+k\s+work/i.test(c)
                    || /\b\d+k\b/.test(c)
                    || c.includes('im looking at');
            });

            if (!alreadyPitched) {
                const pitchAmount = gamePlan.offer_range.aggressive || gamePlan.offer_range.max;
                const rounded = Math.round(pitchAmount / 1000) + 'k';
                console.log(`🎯 Forcing pitch - ${rounded}`);
                responseContent = `does ${rounded} work?`;
            }
        }

        const isDuplicate = recentOutbound.rows.some(m =>
            m.content.toLowerCase().includes(responseContent.toLowerCase().substring(0, 30))
        );

        if (isDuplicate) {
            console.log(`🚫 Blocked duplicate message: "${responseContent.substring(0, 40)}..."`);
            await db.query('UPDATE conversations SET last_activity = NOW() WHERE id = $1', [conversationId]);
            return { shouldReply: false };
        }

        const lastMsgRes = await db.query(`
            SELECT content FROM messages
            WHERE conversation_id = $1 AND direction = 'inbound'
            ORDER BY timestamp DESC LIMIT 1
        `, [conversationId]);
        const userMessage = lastMsgRes.rows[0]?.content || 'N/A';

        await trackResponseForTraining(conversationId, userMessage, responseContent, 'AI_MODE', leadName);

        await logAIDecision({
            conversationId,
            businessName: leadName,
            agent: 'pre_vetter',
            leadMessage: userMessage,
            instruction: systemInstruction,
            stateBefore: currentState,
            stateAfter,
            aiResponse: responseContent,
            actionTaken: decision.action,
            tokensUsed: completion.usage?.total_tokens
        });

        try {
            await storeMessage(conversationId, responseContent, {
                direction: 'outbound',
                state: currentState,
                lead_grade: leadGrade
            });
        } catch (err) {
            console.error('⚠️ Memory store failed:', err.message);
        }

        return { shouldReply: true, content: responseContent };

    } catch (err) {
        console.error("🔥 AI Agent Error:", err);
        return { error: err.message };
    }
}

module.exports = { processLeadWithAI, trackResponseForTraining };
