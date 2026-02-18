const { getDatabase } = require('./database');
const { sendSMS } = require('./smsSender');
const { updateState } = require('./stateManager');

function formatName(name) {
    if (!name) return '';
    return name
        .toLowerCase()
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

const DRIP_TEMPLATES = [
    'Did you get funded already?',
    'The money is expensive as is let me compete.',
    'Hey just following up again, should i close the file out?',
    'Hey let me know if i should close this out'
];

async function sendAndAdvance(conversationId, content, nextState) {
    const db = getDatabase();
    await sendSMS(conversationId, content, 'drip');

    await db.query(
        'UPDATE conversations SET last_activity = NOW(), nudge_count = nudge_count + 1 WHERE id = $1',
        [conversationId]
    );

    if (nextState) {
        await updateState(conversationId, nextState, 'drip');
    }
    console.log(`📤 [${conversationId}] Template sent: "${content.substring(0, 50)}..."`);
}

let isDripRunning = false;

async function runDripLoop() {
    if (isDripRunning) return;
    isDripRunning = true;
    const db = getDatabase();

    const now = new Date();
    const estHour = parseInt(now.toLocaleString('en-US', {
        timeZone: 'America/New_York', hour: 'numeric', hour12: false
    }));
    if (estHour < 8 || estHour >= 22) { isDripRunning = false; return; }

    try {
        const newLeads = await db.query(`
            SELECT c.id, c.first_name, c.business_name,
                   u.agent_name,
                   u.service_settings->>'campaign_hook' AS campaign_hook
            FROM conversations c
            JOIN users u ON c.assigned_user_id = u.id
            WHERE c.state = 'NEW'
              AND c.ai_enabled != false
              AND (c.wait_until IS NULL OR c.wait_until < NOW())
              AND c.created_at < NOW() - INTERVAL '1 minute'
            LIMIT 100
        `);

        for (const lead of newLeads.rows) {
            const hook = lead.campaign_hook || "Hi {{first_name}}, my name is {{AGENT_NAME}}...";
            const content = hook
                .replace(/\{\{first_name\}\}/gi, formatName(lead.first_name) || 'there')
                .replace(/\{\{AGENT_NAME\}\}/gi, lead.agent_name || 'Dan Torres');

            await sendAndAdvance(lead.id, content, 'DRIP');
            await new Promise(r => setTimeout(r, 2000));
        }

        const dripLeads = await db.query(`
            SELECT c.id, c.business_name, c.nudge_count
            FROM conversations c
            LEFT JOIN LATERAL (
                SELECT direction FROM messages m
                WHERE m.conversation_id = c.id
                ORDER BY m.timestamp DESC LIMIT 1
            ) last_msg ON true
            WHERE c.state = 'DRIP'
              AND c.ai_enabled != false
              AND (c.wait_until IS NULL OR c.wait_until < NOW())
              AND c.last_activity > NOW() - INTERVAL '3 days'
              AND last_msg.direction = 'outbound'
              AND c.nudge_count < 4
              AND c.last_activity < NOW() - CASE
                  WHEN c.nudge_count = 0 THEN INTERVAL '15 minutes'
                  WHEN c.nudge_count = 1 THEN INTERVAL '30 minutes'
                  WHEN c.nudge_count = 2 THEN INTERVAL '1 hour'
                  ELSE INTERVAL '4 hours'
              END
            LIMIT 100
        `);

        for (const lead of dripLeads.rows) {
            await sendAndAdvance(lead.id, DRIP_TEMPLATES[lead.nudge_count], null);
            await new Promise(r => setTimeout(r, 2000));
        }
    } catch (err) {
        console.error('🔥 Drip loop error:', err.message);
    } finally {
        isDripRunning = false;
    }
}

let loopInterval = null;
function startDripLoop(intervalMs = 30000) {
    console.log(`📨 Drip loop started — every ${intervalMs / 1000}s`);

    async function tick() {
        await runDripLoop();
        setTimeout(tick, intervalMs);
    }

    tick();
}

function stopDripLoop() {
    if (loopInterval) { clearInterval(loopInterval); loopInterval = null; }
}

module.exports = { DRIP_TEMPLATES, runDripLoop, startDripLoop, stopDripLoop, sendAndAdvance };
