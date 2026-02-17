// backend/services/aiAgent.js
const { OpenAI } = require('openai');
const { getDatabase } = require('./database');
const { trackUsage } = require('./usageTracker');
const { syncDriveFiles } = require('./driveService');
const commanderService = require('./commanderService');
const { updateState } = require('./stateManager');
const { logAIDecision } = require('./aiDecisionLogger');
const { sendSMS } = require('./smsSender');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Lead fact helpers
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

let isAIRunning = false;

function isAckMessage(text) {
    if (!text) return false;
    const msg = String(text).trim().toLowerCase();
    const acks = new Set([
        'ok', 'okay', 'thanks', 'thank you', 'got it', 'sounds good', 'cool', 'k', 'ty', 'thx',
        'appreciate it', 'will do', '👍', '👌', '🙏', '✅'
    ]);
    return acks.has(msg);
}

async function runAgentLoop() {
    if (isAIRunning) {
        console.log('⭕ AI loop still running — skipping');
        return;
    }
    isAIRunning = true;

    const db = getDatabase();
    const now = new Date();
    const estHour = parseInt(now.toLocaleString('en-US', {
        timeZone: 'America/New_York', hour: 'numeric', hour12: false
    }));
    if (estHour < 8 || estHour >= 22) { isAIRunning = false; return; }

    try {
        const replies = await db.query(`
            SELECT c.id, c.state, c.business_name, c.nudge_count,
                   c.last_processed_msg_id,
                   latest.id AS latest_msg_id,
                   latest.direction AS last_direction,
                   latest.content AS last_content
            FROM conversations c
            JOIN LATERAL (
                SELECT id, direction, content FROM messages m
                WHERE m.conversation_id = c.id
                ORDER BY m.timestamp DESC LIMIT 1
            ) latest ON true
            WHERE c.state IN ('DRIP', 'ACTIVE', 'PITCH_READY', 'CLOSING')
              AND c.ai_enabled != false
              AND c.last_activity > NOW() - INTERVAL '3 days'
              AND c.last_activity < NOW() - INTERVAL '2 minutes'
              AND latest.direction = 'inbound'
              AND (c.last_processed_msg_id IS NULL OR c.last_processed_msg_id != latest.id)
            ORDER BY c.last_activity ASC
            LIMIT 50
        `);

        console.log(`🤖 AI LOOP — ${replies.rows.length} inbound replies, checking nudges next...`);

        const replyResults = [];
        for (const lead of replies.rows) {
            if (isAckMessage(lead.last_content) && lead.state === 'DRIP') {
                console.log(`😴 [${lead.business_name}] Ack in DRIP — skipping GPT`);
                await db.query(
                    `UPDATE conversations SET last_processed_msg_id = $1, last_activity = NOW(), nudge_count = 0 WHERE id = $2`,
                    [lead.latest_msg_id, lead.id]
                );
                continue;
            }

            await db.query(
                'UPDATE conversations SET last_processed_msg_id = $1 WHERE id = $2',
                [lead.latest_msg_id, lead.id]
            );

            const result = await processLeadWithAI(lead.id, '');
            replyResults.push({ lead, result });
            await new Promise(r => setTimeout(r, 2000));
        }

        for (const { lead, result } of replyResults) {
            if (result.shouldReply && result.content) {
                const humanDelay = 30000 + Math.floor(Math.random() * 60000);
                console.log(`⏳ [${lead.business_name}] Waiting ${Math.round(humanDelay/1000)}s...`);
                await new Promise(r => setTimeout(r, humanDelay));

                const fresh = await db.query(`
                    SELECT id FROM messages
                    WHERE conversation_id = $1 AND direction = 'inbound'
                      AND id != $2
                    ORDER BY timestamp DESC LIMIT 1
                `, [lead.id, lead.latest_msg_id]);

                if (fresh.rows.length > 0 && fresh.rows[0].id !== lead.latest_msg_id) {
                    console.log(`🔄 [${lead.business_name}] New message arrived — skipping stale response`);
                    continue;
                }

                await sendSMS(lead.id, result.content, 'ai');
            }

            if (['DRIP', 'NEW'].includes(lead.state) && result.shouldReply) {
                await updateState(lead.id, 'ACTIVE', 'ai_agent');
            }
        }

        const nudges = await db.query(`
            SELECT c.id, c.state, c.business_name, c.nudge_count,
                   latest.direction AS last_direction
            FROM conversations c
            JOIN LATERAL (
                SELECT direction FROM messages m
                WHERE m.conversation_id = c.id
                ORDER BY m.timestamp DESC LIMIT 1
            ) latest ON true
            WHERE c.state IN ('ACTIVE', 'PITCH_READY', 'CLOSING')
              AND c.ai_enabled != false
              AND c.last_activity > NOW() - INTERVAL '3 days'
              AND EXISTS (
                  SELECT 1 FROM messages m
                  WHERE m.conversation_id = c.id
                    AND m.direction = 'inbound'
                    AND m.timestamp > NOW() - INTERVAL '3 days'
              )
              AND (
                  c.state = 'PITCH_READY'
                  OR
                  (latest.direction = 'outbound'
                   AND c.nudge_count < 6
                   AND c.last_activity < NOW() - make_interval(
                       secs := CASE c.nudge_count
                           WHEN 0 THEN 900
                           WHEN 1 THEN 1800
                           WHEN 2 THEN 3600
                           WHEN 3 THEN 14400
                           WHEN 4 THEN 28800
                           ELSE 86400
                       END
                   ))
              )
            ORDER BY c.last_activity ASC
            LIMIT 50
        `);

        for (const lead of nudges.rows) {
            const result = await processLeadWithAI(lead.id, '');
            if (result.shouldReply && result.content) {
                await sendSMS(lead.id, result.content, 'ai');
            }
            await db.query(
                'UPDATE conversations SET nudge_count = nudge_count + 1 WHERE id = $1',
                [lead.id]
            );
            await new Promise(r => setTimeout(r, 2000));
        }

    } catch (err) {
        console.error('🔥 AI loop error:', err.message);
    } finally {
        isAIRunning = false;
    }
}

let loopInterval = null;
function startAgentLoop(intervalMs = 60000) {
    console.log(`🤖 AI loop started — every ${intervalMs / 1000}s`);

    async function tick() {
        await runAgentLoop();
        setTimeout(tick, intervalMs);
    }

    tick();
}

function stopAgentLoop() {
    if (loopInterval) { clearInterval(loopInterval); loopInterval = null; }
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

// 📖 HELPER: Load Persona + Strategy (now with dynamic agent name)
async function getPromptForPhase(userId, currentState, agentName, agentEmail) {
    const basePath = path.join(__dirname, '../prompts/sales_agent/base.md');
    const phasePath = path.join(__dirname, `../prompts/sales_agent/phase_${currentState.toLowerCase()}.md`);

    let prompt = fs.readFileSync(basePath, 'utf8');

    if (fs.existsSync(phasePath)) {
        prompt += '\n\n---\n\n' + fs.readFileSync(phasePath, 'utf8');
    }

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

async function getLearnedCorrections(leadGrade) {
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
        const leadRes = await db.query(`
            SELECT first_name, business_name, state, email, ai_enabled,
                   created_by_user_id, assigned_user_id
            FROM conversations WHERE id = $1
        `, [conversationId]);

        const lead = leadRes.rows[0];
        if (!lead) return { shouldReply: false };

        const leadName = lead.business_name || lead.first_name || 'Unknown';
        const currentState = lead.state;
        const usageUserId = lead.assigned_user_id || lead.created_by_user_id || null;

        if (lead.ai_enabled === false) {
            console.log(`⛔ [${leadName}] AI manually disabled`);
            return { shouldReply: false };
        }

        // =================================================================
        // 🚨 LAYER 1: MISSION ACCOMPLISHED CHECK (Status Lock)
        // If the lead is already in a "Human" stage, DO NOT REPLY.
        // =================================================================
        console.log(`\n========== AI AGENT: ${leadName} ==========`); 
        console.log(`📥 Instruction: "${(systemInstruction || 'none').substring(0, 80)}..."`);
        console.log(`📋 Current State: ${currentState}`);

        // Add any statuses here where you want the AI to be completely dead
        const RESTRICTED_STATES = [
            'HUMAN_REVIEW', 'FCS_COMPLETE',
            'STRATEGIZED', 'HOT_LEAD', 'VETTING', 'SUBMITTED',  // Agent 2's territory
            'OFFER_RECEIVED', 'NEGOTIATING'  // Agent 3's territory
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

        const businessName = lead?.business_name || "Unknown Business";

        // Get agent name/email
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

        const historyRes = await db.query(`
            SELECT direction, content, timestamp FROM messages
            WHERE conversation_id = $1
            ORDER BY timestamp DESC LIMIT 40
        `, [conversationId]);

        const strategyRes = await db.query(`
            SELECT game_plan, lead_grade, strategy_type
            FROM lead_strategy WHERE conversation_id = $1
        `, [conversationId]);
        let gamePlan = null;
        if (strategyRes.rows[0]) {
            gamePlan = strategyRes.rows[0].game_plan;
            if (typeof gamePlan === 'string') {
                try { gamePlan = JSON.parse(gamePlan); } catch (e) { gamePlan = null; }
            }
        }

        // AI MODE
        console.log("🤖 AI MODE: Reading Strategy...");

        if (strategyRes.rows[0]) {
            console.log(`🎖️ Commander Orders Loaded: Grade ${strategyRes.rows[0].lead_grade} | ${strategyRes.rows[0].strategy_type}`);
        } else {
            console.log(`📋 No Commander strategy yet - using default prompts`);
        }


        // Get active offers for this conversation
        const offersRes = await db.query(`
            SELECT lender_name, offer_amount, factor_rate, term_length, term_unit, payment_frequency
            FROM lender_submissions
            WHERE conversation_id = $1 AND status = 'OFFER'
            ORDER BY offer_amount DESC
        `, [conversationId]);

        const offers = offersRes.rows;

        // 4. BUILD CONVERSATION HISTORY - Get LATEST 40, then reverse for chronological order
        const history = { rows: [...historyRes.rows].reverse() };

        // 4b. CHECK FOR HANDOFF ACKNOWLEDGMENT - Stay silent
        // Find the last outbound/inbound from full history
        const lastOutbounds = history.rows.filter(m => m.direction === 'outbound');
        const lastInbounds = history.rows.filter(m => m.direction === 'inbound');

        const lastOutbound = lastOutbounds.slice(-1)[0]?.content?.toLowerCase() || '';
        const lastInbound = lastInbounds.slice(-1)[0]?.content?.toLowerCase().trim() || '';
        const userMessageForMemory = lastInbounds.slice(-1)[0]?.content || '';

        // =================================================================
        // 🚨 LAYER 4D: CLOSE FILE CONFIRMATION CHECK
        // If we asked to close and they said yes, stop immediately
        // =================================================================
        const closePatterns = [
            'should i close the file',
            'should i close it out',
            'close this out?',
            'closing out the file',
            'close the file out?'
        ];
        const weAskedToClose = closePatterns.some(p => lastOutbound.includes(p));
        const wasPitching = lastOutbound.match(/\d+k/) || lastOutbound.includes('offer') || lastOutbound.includes('work for you');
        const theySaidYes = ['yes', 'yeah', 'sure', 'go ahead', 'yes!', 'ok', 'okay', 'ok!'].includes(lastInbound);

        if (weAskedToClose && !wasPitching && theySaidYes) {
            console.log('📁 Lead confirmed file close - marking as dead');
            await updateState(conversationId, 'DEAD', 'ai_agent');
            return {
                shouldReply: true,
                content: "understood, ill close it out. if anything changes down the line feel free to reach back out"
            };
        }

        // 5. BUILD SYSTEM PROMPT
        let systemPrompt = await getPromptForPhase(usageUserId, currentState, agentName, agentEmail);
        // Inject temporal context FIRST (clock + statement logic)
        const temporalContext = buildTemporalContext(history.rows);
        systemPrompt = temporalContext + '\n\n' + systemPrompt;

        // Load rebuttals playbook
        const rebuttals = ['ACTIVE', 'DRIP', 'NEW', 'PITCH_READY'].includes(currentState)
            ? await getRebuttalsPrompt() : '';
        if (rebuttals) {
            systemPrompt += `\n\n---\n\n${rebuttals}`;
        }

        const corrections = ['ACTIVE', 'DRIP', 'PITCH_READY'].includes(currentState)
            ? await getLearnedCorrections(gamePlan?.lead_grade || null) : [];
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

            const strategyNote = gamePlan.no_viable_offer
                ? '\n⚠️ NO VIABLE OFFER RANGE - Do not quote any dollar amount. Play aloof and buy time for the broker.\n'
                : '';
            systemPrompt += strategyNote;

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

        // Checklist & output format
        const facts = await getLeadFacts(conversationId);

        const needsMTD = facts.recent_funding &&
            !['none', 'no', 'n/a', 'false'].includes(facts.recent_funding.toLowerCase()) &&
            !facts.mtd_received;

        const now = new Date();
        const dayOfMonth = now.getDate();
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastMonthName = lastMonth.toLocaleString('en-US', { month: 'long' });

        const statementsCurrentLine = facts.statements_current
            ? `- Latest Statements: ✅ ${facts.statements_current}`
            : dayOfMonth <= 7
                ? `- Latest Statements: ❌ (Ask if ${lastMonthName} statement has been generated yet)`
                : `- Latest Statements: ❌ (Ask them to send the ${lastMonthName} statement)`;

        const mtdStatusLine = needsMTD
            ? (facts.mtd_requested ? '- MTD Statement: ❌ (Requested, waiting for merchant)' : '- MTD Statement: ❌ (REQUIRED - they got funded, need MTD before qualifying)')
            : '';

        systemPrompt += `\n\n## 📝 CONFIRMED FACTS
        - Email: ${facts.email || 'NOT COLLECTED'}
        - Credit Score: ${facts.credit_score || 'NOT COLLECTED'}
        - Recent Funding: ${facts.recent_funding || 'NOT COLLECTED'}
        - Desired Amount: ${facts.desired_amount || 'NOT COLLECTED'}
        ${mtdStatusLine}
        ${statementsCurrentLine}
        ${needsMTD ? '⚠️ DO NOT qualify until MTD is received.' : ''}

        If something says NOT COLLECTED but the merchant said it in the conversation, extract it in extracted_facts.

        ## ⚙️ OUTPUT FORMAT
        Return Valid JSON ONLY. No markdown, no thinking.
        {
           "action": "respond" | "qualify" | "mark_dead" | "sync_drive" | "no_response" | "ready_to_submit",
           "message": "The exact SMS to send. Null if no_response.",
           "reason": "Why you chose this action",
           "extracted_facts": {
               "email": "their email if provided, else null",
               "credit_score": "score if mentioned, else null",
               "recent_funding": "yes or no if discussed, else null",
               "desired_amount": "amount they want if mentioned, else null",
               "statements_current": "month name if confirmed sent, else null",
               "mtd_sent": "true if confirmed, else null"
           }
        }
        
        ACTIONS:
        - "respond": Standard reply or question.
        - "qualify": You have enough info (email + funding status at minimum). Triggers analysis on their file. You stay in ACTIVE and come back with numbers.
        - "mark_dead": Lead said stop/remove/not interested/wrong person.
        - "sync_drive": Lead JUST provided email address.
        - "no_response": Lead sent a pure acknowledgment AND you have nothing pending to deliver. Examples: lead says "ok" after you said you'd follow up, lead sends a thumbs up after receiving info. IMPORTANT: If you are in PITCH_READY state or have an offer range to present, you MUST pitch — an "ok" or "thanks" from the lead means they're waiting on YOU. Do not go silent when you owe them a response.
        - "ready_to_submit": Lead accepted the pitch and is ready to move forward. Ask for docs and move to submission.
        `;

        
        // No atomic claim needed - single path per trigger type

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

        // --- OPENAI CALL ---
        const callStart = Date.now();
        console.log(`🧠 [${leadName}] Calling OpenAI (JSON Mode)...`);

        const completion = await openai.chat.completions.create({
            model: "gpt-5-mini",
            messages: messages,
            response_format: { type: "json_object" }
        });

        const callDuration = ((Date.now() - callStart) / 1000).toFixed(1);
        const tokens = completion.usage || {};
        const estimatedCost = ((tokens.prompt_tokens || 0) * 0.00000015 + (tokens.completion_tokens || 0) * 0.0000006).toFixed(4);

        console.log(`💰 [${leadName}] ${tokens.prompt_tokens} in / ${tokens.completion_tokens} out / ${tokens.total_tokens} total | ~$${estimatedCost} | ${callDuration}s`);

        if (completion.usage) {
            await trackUsage({
                userId: usageUserId,
                conversationId,
                type: 'llm_call',
                service: 'openai',
                model: 'gpt-5-mini',
                inputTokens: completion.usage.prompt_tokens,
                outputTokens: completion.usage.completion_tokens,
                metadata: { mode: 'json_agent', duration_ms: Date.now() - callStart }
            });
        }

        let decision;
        try {
            decision = JSON.parse(completion.choices[0].message.content);
        } catch (e) {
            console.error("JSON Parse Error:", completion.choices[0].message.content);
            decision = { action: "respond", message: "got it, give me one sec" };
        }

        if (decision.extracted_facts) {
            await saveExtractedFacts(conversationId, decision.extracted_facts);
        }

        console.log(`🤖 [${leadName}] Decision: ${decision.action?.toUpperCase() || 'RESPOND'} | Reason: ${decision.reason || 'N/A'}`);

        let responseContent = decision.message;
        let stateAfter = currentState;

        // Check no_response FIRST
        if (decision.action === 'no_response') {
            console.log(`😴 [${leadName}] NO_RESPONSE - $${estimatedCost} wasted (consider adding this pattern to ack check)`);
            await db.query('UPDATE conversations SET last_activity = NOW() WHERE id = $1', [conversationId]);
            return { shouldReply: false };
        }

        if (decision.action === 'mark_dead') {
            await updateState(conversationId, 'DEAD', 'ai_agent');
            stateAfter = 'DEAD';
        }
        else if (decision.action === 'ready_to_submit') {
            await updateState(conversationId, 'READY_TO_SUBMIT', 'ai_agent');
            await db.query('UPDATE conversations SET nudge_count = 0 WHERE id = $1', [conversationId]);
            stateAfter = 'READY_TO_SUBMIT';
            console.log(`🎯 [${leadName}] Accepted offer - READY_TO_SUBMIT`);
        }
        else if (decision.action === 'qualify') {
            const facts = await getLeadFacts(conversationId);
            const args = decision || {};

            if (!facts.email) {
                console.log(`🚫 [${leadName}] Tried to qualify without email - blocking`);
                responseContent = "whats the best email to send the offer to?";
            } else if (!['SUBMITTED', 'CLOSING', 'READY_TO_SUBMIT'].includes(currentState)) {
                // Stay in ACTIVE — Commander saves strategy, AI reads it next turn
                await db.query('UPDATE conversations SET nudge_count = 0 WHERE id = $1', [conversationId]);

                responseContent = "got it. give me a few minutes to run the numbers and ill text you back shortly";

                syncDriveFiles(conversationId, businessName, usageUserId);

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

            if (args.statements_current) {
                await saveExtractedFacts(conversationId, { statements_current: args.statements_current });
            }
        }
        else if (decision.action === 'sync_drive') {
            syncDriveFiles(conversationId, businessName, usageUserId);
            console.log("📂 Triggered Drive Sync");
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

        const isDuplicate = recentOutbound.rows.some(m =>
            m.content.toLowerCase().includes(responseContent.toLowerCase().substring(0, 30))
        );

        if (isDuplicate) {
            console.log(`🚫 Blocked duplicate message: "${responseContent.substring(0, 40)}..."`);
            await db.query('UPDATE conversations SET last_activity = NOW() WHERE id = $1', [conversationId]);
            return { shouldReply: false };
        }

        const userMessage = userMessageForMemory || 'N/A';

        await trackResponseForTraining(conversationId, userMessage, responseContent, 'AI_MODE', leadName);

        if (currentState === 'PITCH_READY') {
            await updateState(conversationId, 'ACTIVE', 'ai_agent');
            console.log(`🎯 [${leadName}] Pitched → back to ACTIVE`);
        }
        if (currentState === 'DRIP' || currentState === 'NEW') {
            await updateState(conversationId, 'ACTIVE', 'ai_agent');
            console.log(`📬 [${leadName}] ${currentState} → ACTIVE (lead replied)`);
        }

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

        return { shouldReply: true, content: responseContent };

    } catch (err) {
        console.error("🔥 AI Agent Error:", err);
        return { error: err.message };
    }
}

module.exports = { 
    processLeadWithAI, 
    trackResponseForTraining,
    startAgentLoop,
    stopAgentLoop,
    runAgentLoop
};
