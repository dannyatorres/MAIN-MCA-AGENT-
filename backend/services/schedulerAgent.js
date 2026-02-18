// backend/services/schedulerAgent.js
const { getDatabase } = require('./database');
const { updateState } = require('./stateManager');
const { sendSMS } = require('./smsSender');
const { processLeadWithAI, isAckMessage } = require('./salesAgent');

let isAIRunning = false;

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
            WHERE c.state IN ('DRIP', 'ACTIVE', 'PITCH_READY')
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
            const lock = await db.query(
                'UPDATE conversations SET ai_processing = true WHERE id = $1 AND ai_processing = false RETURNING id',
                [lead.id]
            );
            if (lock.rowCount === 0) {
                console.log(`⏭️ [${lead.business_name}] Already processing — skipping`);
                continue;
            }

            if (isAckMessage(lead.last_content) && lead.state === 'DRIP') {
                console.log(`😴 [${lead.business_name}] Ack in DRIP — skipping GPT`);
                await db.query(
                    `UPDATE conversations SET last_processed_msg_id = $1, last_activity = NOW(), nudge_count = 0 WHERE id = $2`,
                    [lead.latest_msg_id, lead.id]
                );
                await db.query('UPDATE conversations SET ai_processing = false WHERE id = $1', [lead.id]);
                continue;
            }

            await db.query(
                'UPDATE conversations SET last_processed_msg_id = $1 WHERE id = $2',
                [lead.latest_msg_id, lead.id]
            );

            const result = await processLeadWithAI(lead.id, '');
            replyResults.push({ lead, result });
            await db.query('UPDATE conversations SET ai_processing = false WHERE id = $1', [lead.id]);
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
                await db.query('UPDATE conversations SET last_activity = NOW() WHERE id = $1', [lead.id]);
            }

            if (['DRIP', 'NEW'].includes(lead.state) && result.shouldReply) {
                await updateState(lead.id, 'ACTIVE', 'ai_agent');
            }
        }

        const processedIds = replies.rows.map(l => l.id);

        const nudges = await db.query(`
            SELECT c.id, c.state, c.business_name, c.nudge_count,
                   latest.direction AS last_direction
            FROM conversations c
            JOIN LATERAL (
                SELECT direction FROM messages m
                WHERE m.conversation_id = c.id
                ORDER BY m.timestamp DESC LIMIT 1
            ) latest ON true
            WHERE c.state IN ('ACTIVE')
              AND c.ai_enabled != false
              AND c.last_activity > NOW() - INTERVAL '3 days'
              AND EXISTS (
                  SELECT 1 FROM messages m
                  WHERE m.conversation_id = c.id
                    AND m.direction = 'inbound'
                    AND m.timestamp > NOW() - INTERVAL '3 days'
              )
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
              )
            ORDER BY c.last_activity ASC
            LIMIT 50
        `);

        const nudgeRows = nudges.rows.filter(lead => !processedIds.includes(lead.id));
        console.log(`⏰ NUDGE LOOP — ${nudgeRows.length} leads queued`);

        for (const lead of nudgeRows) {
            const lock = await db.query(
                'UPDATE conversations SET ai_processing = true WHERE id = $1 AND ai_processing = false RETURNING id',
                [lead.id]
            );
            if (lock.rowCount === 0) {
                console.log(`⏭️ [${lead.business_name}] Already processing — skipping`);
                continue;
            }

            const result = await processLeadWithAI(lead.id, '');
            if (result.shouldReply && result.content) {
                await sendSMS(lead.id, result.content, 'ai');
                await db.query(
                    'UPDATE conversations SET nudge_count = nudge_count + 1 WHERE id = $1',
                    [lead.id]
                );
            } else {
                console.log(`😴 [${lead.business_name}] Nudge suppressed — no response needed`);
            }
            await db.query('UPDATE conversations SET ai_processing = false WHERE id = $1', [lead.id]);
            await new Promise(r => setTimeout(r, 2000));
        }

    } catch (err) {
        console.error('🔥 AI loop error:', err.message);
    } finally {
        isAIRunning = false;
    }
}

let loopTimeout = null;
function startAgentLoop(intervalMs = 60000) {
    console.log(`🤖 AI loop started — every ${intervalMs / 1000}s`);

    async function tick() {
        await runAgentLoop();
        loopTimeout = setTimeout(tick, intervalMs);
    }

    tick();
}

function stopAgentLoop() {
    if (loopTimeout) { clearTimeout(loopTimeout); loopTimeout = null; }
}

module.exports = { runAgentLoop, startAgentLoop, stopAgentLoop };
