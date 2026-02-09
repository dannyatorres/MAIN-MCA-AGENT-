// services/dailyAgent.js
// 📊 Daily Operations Agent - builds end-of-day timeline and report

const { getDatabase } = require('./database');
const { GoogleGenerativeAI } = require('@google/generative-ai');

function getEtDateString(date = new Date()) {
    const fmt = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    return fmt.format(date); // YYYY-MM-DD
}

function getEtNow() {
    return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
}

function msUntilNextEt(hour = 22, minute = 0) {
    const nowEt = getEtNow();
    const next = new Date(nowEt);
    next.setHours(hour, minute, 0, 0);
    if (next <= nowEt) next.setDate(next.getDate() + 1);
    return next - nowEt;
}

async function safeQuery(db, sql, params, label) {
    try {
        const res = await db.query(sql, params);
        return res.rows || [];
    } catch (err) {
        console.warn(`⚠️ DailyAgent query failed (${label}):`, err.message);
        return [];
    }
}

async function buildDailyTimeline(db, dateStr) {
    const events = [];

    // Messages sent/received
    const messages = await safeQuery(db, `
        SELECT 
            m.conversation_id,
            c.business_name,
            c.assigned_user_id,
            COALESCE(u.agent_name, u.name) as broker,
            m.timestamp as event_time,
            'MESSAGE' as event_type,
            m.direction,
            LEFT(m.content, 200) as detail,
            c.state as current_state
        FROM messages m
        JOIN conversations c ON m.conversation_id = c.id
        LEFT JOIN users u ON c.assigned_user_id = u.id
        WHERE (m.timestamp AT TIME ZONE 'America/New_York')::date = $1
    `, [dateStr], 'messages');
    events.push(...messages);

    // State changes (state_history)
    const stateChanges = await safeQuery(db, `
        SELECT
            sh.conversation_id,
            c.business_name,
            c.assigned_user_id,
            COALESCE(u.agent_name, u.name) as broker,
            sh.changed_at as event_time,
            'STATE_CHANGE' as event_type,
            sh.changed_by as direction,
            (sh.old_state || ' → ' || sh.new_state) as detail,
            sh.new_state as current_state
        FROM state_history sh
        JOIN conversations c ON sh.conversation_id = c.id
        LEFT JOIN users u ON c.assigned_user_id = u.id
        WHERE (sh.created_at AT TIME ZONE 'America/New_York')::date = $1
    `, [dateStr], 'state_history');
    events.push(...stateChanges);

    // Lender submissions sent
    const submissions = await safeQuery(db, `
        SELECT
            ls.conversation_id,
            c.business_name,
            c.assigned_user_id,
            COALESCE(u.agent_name, u.name) as broker,
            ls.submitted_at as event_time,
            'SUBMISSION' as event_type,
            'outbound' as direction,
            'Submitted to ' || ls.lender_name || ' [' || ls.status || ']' as detail,
            c.state as current_state
        FROM lender_submissions ls
        JOIN conversations c ON ls.conversation_id = c.id
        LEFT JOIN users u ON c.assigned_user_id = u.id
        WHERE (ls.submitted_at AT TIME ZONE 'America/New_York')::date = $1
    `, [dateStr], 'lender_submissions');
    events.push(...submissions);

    // Lender responses
    const responses = await safeQuery(db, `
        SELECT
            ls.conversation_id,
            c.business_name,
            c.assigned_user_id,
            COALESCE(u.agent_name, u.name) as broker,
            ls.last_response_at as event_time,
            'LENDER_RESPONSE' as event_type,
            ls.status as direction,
            ls.lender_name || ': ' || ls.status ||
                CASE WHEN ls.offer_amount IS NOT NULL 
                     THEN ' $' || ls.offer_amount::text 
                     ELSE '' END ||
                CASE WHEN ls.decline_reason IS NOT NULL 
                     THEN ' - ' || ls.decline_reason 
                     ELSE '' END as detail,
            c.state as current_state
        FROM lender_submissions ls
        JOIN conversations c ON ls.conversation_id = c.id
        LEFT JOIN users u ON c.assigned_user_id = u.id
        WHERE (ls.last_response_at AT TIME ZONE 'America/New_York')::date = $1
          AND ls.status IN ('OFFER', 'DECLINE', 'DECLINED', 'STIP', 'FUNDED')
    `, [dateStr], 'lender_responses');
    events.push(...responses);

    // FCS reports generated
    const fcsEvents = await safeQuery(db, `
        SELECT
            fa.conversation_id,
            c.business_name,
            c.assigned_user_id,
            COALESCE(u.agent_name, u.name) as broker,
            fa.completed_at as event_time,
            'FCS_COMPLETE' as event_type,
            'system' as direction,
            'FCS: $' || COALESCE(fa.average_revenue::text, '?') || '/mo rev, ' || 
                COALESCE(fa.total_negative_days::text, '?') || ' neg days' as detail,
            c.state as current_state
        FROM fcs_analyses fa
        JOIN conversations c ON fa.conversation_id = c.id
        LEFT JOIN users u ON c.assigned_user_id = u.id
        WHERE (fa.completed_at AT TIME ZONE 'America/New_York')::date = $1
    `, [dateStr], 'fcs');
    events.push(...fcsEvents);

    // Commander strategies created
    const strategyEvents = await safeQuery(db, `
        SELECT
            ls.conversation_id,
            c.business_name,
            c.assigned_user_id,
            COALESCE(u.agent_name, u.name) as broker,
            ls.created_at as event_time,
            'STRATEGY' as event_type,
            'system' as direction,
            'Commander strategy created' as detail,
            c.state as current_state
        FROM lead_strategy ls
        JOIN conversations c ON ls.conversation_id = c.id
        LEFT JOIN users u ON c.assigned_user_id = u.id
        WHERE (ls.created_at AT TIME ZONE 'America/New_York')::date = $1
    `, [dateStr], 'lead_strategy');
    events.push(...strategyEvents);

    // Notes (email processor notes)
    const notes = await safeQuery(db, `
        SELECT
            n.conversation_id,
            c.business_name,
            c.assigned_user_id,
            COALESCE(u.agent_name, u.name) as broker,
            n.created_at as event_time,
            'NOTE' as event_type,
            COALESCE(n.source, 'system') as direction,
            LEFT(n.content, 200) as detail,
            c.state as current_state
        FROM notes n
        JOIN conversations c ON n.conversation_id = c.id
        LEFT JOIN users u ON c.assigned_user_id = u.id
        WHERE (n.created_at AT TIME ZONE 'America/New_York')::date = $1
    `, [dateStr], 'notes');
    events.push(...notes);

    // AI decisions
    const aiDecisions = await safeQuery(db, `
        SELECT
            ad.conversation_id,
            c.business_name,
            c.assigned_user_id,
            COALESCE(u.agent_name, u.name) as broker,
            ad.created_at as event_time,
            'AI_DECISION' as event_type,
            ad.agent as direction,
            LEFT(COALESCE(ad.action_taken, ad.response_sent, ad.ai_reasoning, ''), 200) as detail,
            c.state as current_state
        FROM ai_decisions ad
        JOIN conversations c ON ad.conversation_id = c.id
        LEFT JOIN users u ON c.assigned_user_id = u.id
        WHERE (ad.created_at AT TIME ZONE 'America/New_York')::date = $1
    `, [dateStr], 'ai_decisions');
    events.push(...aiDecisions);

    // New leads created
    const newLeads = await safeQuery(db, `
        SELECT
            c.id as conversation_id,
            c.business_name,
            c.assigned_user_id,
            COALESCE(u.agent_name, u.name) as broker,
            c.created_at as event_time,
            'NEW_LEAD' as event_type,
            'system' as direction,
            'New lead created' as detail,
            c.state as current_state
        FROM conversations c
        LEFT JOIN users u ON c.assigned_user_id = u.id
        WHERE (c.created_at AT TIME ZONE 'America/New_York')::date = $1
    `, [dateStr], 'new_leads');
    events.push(...newLeads);

    // Sort by time asc
    events.sort((a, b) => new Date(a.event_time) - new Date(b.event_time));

    return events;
}

async function buildDailyStats(db, dateStr) {
    const overview = (await safeQuery(db, `
        SELECT
            (SELECT COUNT(*) FROM conversations WHERE (created_at AT TIME ZONE 'America/New_York')::date = $1) as new_leads,
            (SELECT COUNT(*) FROM messages WHERE direction = 'outbound' AND (timestamp AT TIME ZONE 'America/New_York')::date = $1) as msgs_sent,
            (SELECT COUNT(*) FROM messages WHERE direction = 'inbound' AND (timestamp AT TIME ZONE 'America/New_York')::date = $1) as msgs_received,
            (SELECT COUNT(*) FROM lender_submissions WHERE (submitted_at AT TIME ZONE 'America/New_York')::date = $1) as submissions_sent,
            (SELECT COUNT(*) FROM lender_submissions WHERE (last_response_at AT TIME ZONE 'America/New_York')::date = $1 AND status = 'OFFER') as offers_received,
            (SELECT COUNT(*) FROM lender_submissions WHERE (last_response_at AT TIME ZONE 'America/New_York')::date = $1 AND status IN ('DECLINE', 'DECLINED')) as declines_received,
            (SELECT COUNT(*) FROM fcs_analyses WHERE (completed_at AT TIME ZONE 'America/New_York')::date = $1) as fcs_generated,
            (SELECT COUNT(DISTINCT conversation_id) FROM messages WHERE (timestamp AT TIME ZONE 'America/New_York')::date = $1 AND direction = 'inbound') as active_leads
    `, [dateStr], 'overview_stats'))[0] || {};

    const brokers = await safeQuery(db, `
        SELECT 
            COALESCE(u.agent_name, u.name) as broker,
            COUNT(DISTINCT m.conversation_id) FILTER (WHERE m.direction = 'inbound') as leads_engaged,
            COUNT(*) FILTER (WHERE m.direction = 'outbound') as msgs_sent,
            COUNT(DISTINCT ls.id) as submissions
        FROM users u
        LEFT JOIN conversations c ON c.assigned_user_id = u.id
        LEFT JOIN messages m ON m.conversation_id = c.id AND (m.timestamp AT TIME ZONE 'America/New_York')::date = $1
        LEFT JOIN lender_submissions ls ON ls.conversation_id = c.id AND (ls.submitted_at AT TIME ZONE 'America/New_York')::date = $1
        WHERE u.role != 'admin'
        GROUP BY COALESCE(u.agent_name, u.name)
        HAVING COUNT(m.id) > 0
    `, [dateStr], 'broker_stats');

    return { overview, brokers };
}

async function generateDailyReport(dateStr) {
    const db = getDatabase();
    const timeline = await buildDailyTimeline(db, dateStr);
    const stats = await buildDailyStats(db, dateStr);

    const byConversation = {};
    for (const event of timeline) {
        const id = event.conversation_id;
        if (!byConversation[id]) {
            byConversation[id] = {
                business_name: event.business_name,
                broker: event.broker,
                current_state: event.current_state,
                events: []
            };
        }
        byConversation[id].events.push({
            time: event.event_time,
            type: event.event_type,
            direction: event.direction,
            detail: event.detail
        });
    }

    const prompt = `You are the operations analyst for JMS Global, an MCA brokerage. 
Analyze today's activity and produce a daily operations report.

## DATE
${dateStr}

## TODAY'S STATS
${JSON.stringify(stats, null, 2)}

## FULL TIMELINE BY DEAL
${JSON.stringify(byConversation, null, 2)}

## REPORT REQUIREMENTS
1. Executive Summary — 3-4 sentences on the day overall
2. Deal Highlights — Which deals moved forward? Any offers? Any funded?
3. Pipeline Issues — Leads that went cold, stuck in a state too long, or need attention tomorrow
4. Broker Performance — Who was active, response times, conversion
5. Action Items for Tomorrow — Specific follow-ups needed, leads to re-engage
6. Offer Analysis — Compare any offers received to what Commander predicted

Be specific with names, numbers, and times. This is an internal ops report, not a marketing piece.`;

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-pro' });
    const result = await model.generateContent(prompt);
    const report = result.response.text();

    await db.query(`
        INSERT INTO daily_reports (date, report, stats, created_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (date) DO UPDATE 
        SET report = EXCLUDED.report, stats = EXCLUDED.stats, created_at = NOW()
    `, [dateStr, report, JSON.stringify(stats)]);

    return report;
}

async function runDailyAgent(dateStr = null) {
    const db = getDatabase();
    const date = dateStr || getEtDateString();

    console.log(`📊 Daily Agent running for ${date}...`);

    const report = await generateDailyReport(date);

    console.log(`✅ Daily report generated for ${date}`);

    return report;
}

function scheduleDailyAgent() {
    const scheduleNext = () => {
        const delay = msUntilNextEt(22, 0);
        const mins = Math.round(delay / 60000);
        console.log(`📅 Daily Agent scheduled in ~${mins} minutes (10pm ET).`);
        setTimeout(async () => {
            try {
                await runDailyAgent();
            } catch (err) {
                console.error('❌ Daily Agent failed:', err.message);
            }
            scheduleNext();
        }, delay);
    };

    scheduleNext();
}

module.exports = {
    buildDailyTimeline,
    buildDailyStats,
    generateDailyReport,
    runDailyAgent,
    scheduleDailyAgent
};
