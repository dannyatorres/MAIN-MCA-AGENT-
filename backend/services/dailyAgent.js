// services/dailyAgent.js
// 📊 Daily Operations Agent - builds end-of-day timeline and report

const { getDatabase } = require('./database');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');

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
        WHERE (m.timestamp AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York')::date = $1
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
        WHERE (sh.changed_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York')::date = $1
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
        WHERE (ls.submitted_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York')::date = $1
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
        WHERE (ls.last_response_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York')::date = $1
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
        WHERE (fa.completed_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York')::date = $1
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
        WHERE (ls.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York')::date = $1
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
        WHERE (n.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York')::date = $1
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
        WHERE (ad.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York')::date = $1
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
        WHERE (c.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York')::date = $1
    `, [dateStr], 'new_leads');
    events.push(...newLeads);

    // Sort by time asc
    events.sort((a, b) => new Date(a.event_time) - new Date(b.event_time));

    return events;
}

async function buildDailyStats(db, dateStr) {
    const overview = (await safeQuery(db, `
        SELECT
            (SELECT COUNT(*) FROM conversations WHERE (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York')::date = $1) as new_leads,
            (SELECT COUNT(*) FROM messages WHERE direction = 'outbound' AND (timestamp AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York')::date = $1) as msgs_sent,
            (SELECT COUNT(*) FROM messages WHERE direction = 'inbound' AND (timestamp AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York')::date = $1) as msgs_received,
            (SELECT COUNT(*) FROM lender_submissions WHERE (submitted_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York')::date = $1) as submissions_sent,
            (SELECT COUNT(*) FROM lender_submissions WHERE (last_response_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York')::date = $1 AND status = 'OFFER') as offers_received,
            (SELECT COUNT(*) FROM lender_submissions WHERE (last_response_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York')::date = $1 AND status IN ('DECLINE', 'DECLINED')) as declines_received,
            (SELECT COUNT(*) FROM fcs_analyses WHERE (completed_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York')::date = $1) as fcs_generated,
            (SELECT COUNT(DISTINCT conversation_id) FROM messages WHERE (timestamp AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York')::date = $1 AND direction = 'inbound') as active_leads
    `, [dateStr], 'overview_stats'))[0] || {};

    const brokers = await safeQuery(db, `
        SELECT 
            COALESCE(u.agent_name, u.name) as broker,
            COUNT(DISTINCT m.conversation_id) FILTER (WHERE m.direction = 'inbound') as leads_engaged,
            COUNT(*) FILTER (WHERE m.direction = 'outbound') as msgs_sent,
            COUNT(DISTINCT ls.id) as submissions
        FROM users u
        LEFT JOIN conversations c ON c.assigned_user_id = u.id
        LEFT JOIN messages m ON m.conversation_id = c.id AND (m.timestamp AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York')::date = $1
        LEFT JOIN lender_submissions ls ON ls.conversation_id = c.id AND (ls.submitted_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York')::date = $1
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

    let promptTemplate;
    try {
        promptTemplate = fs.readFileSync(path.join(__dirname, '../prompts/daily-report-prompt.md'), 'utf8');
    } catch (err) {
        console.error('❌ Could not load daily-report-prompt.md:', err.message);
        return 'Failed to load prompt template.';
    }

    const prompt = promptTemplate
        .replace('{{DATE}}', dateStr)
        .replace('{{STATS}}', JSON.stringify(stats, null, 2))
        .replace('{{TIMELINE}}', JSON.stringify(byConversation, null, 2));

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-pro' });
    const result = await model.generateContent(prompt);
    const report = result.response.text();
    // Token usage logging
    const usage = result.response.usageMetadata;
    if (usage) {
        console.log(`📊 Daily Report Tokens — Input: ${usage.promptTokenCount?.toLocaleString() || '?'} | Output: ${usage.candidatesTokenCount?.toLocaleString() || '?'} | Total: ${usage.totalTokenCount?.toLocaleString() || '?'}`);
    }

    await db.query(`
        INSERT INTO daily_reports (date, report, stats, created_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (date) DO UPDATE 
        SET report = EXCLUDED.report, stats = EXCLUDED.stats, created_at = NOW()
    `, [dateStr, report, JSON.stringify(stats)]);

    return report;
}

// ============================================
// BROKER ACTION BRIEFING (for brokers)
// ============================================

async function buildBrokerActionBriefing(db, userId, dateStr = null) {
    const targetDate = dateStr || getEtDateString();
    const isToday = (targetDate === getEtDateString());

    // For "now" calculations, use end-of-day if historical, or actual now if today
    const referenceTime = isToday
        ? new Date()
        : new Date(targetDate + 'T23:59:59-05:00');

    const twoDaysBeforeRef = new Date(referenceTime - 2 * 24 * 60 * 60 * 1000).toISOString();
    const oneHourBeforeRef = new Date(referenceTime - 60 * 60 * 1000).toISOString();
    const threeDaysBeforeRef = new Date(referenceTime - 3 * 24 * 60 * 60 * 1000).toISOString();

    // 🔴 Unanswered inbounds (last inbound > 1hr ago, no outbound after it)
    const unanswered = await safeQuery(db, `
        WITH last_inbound AS (
            SELECT m.conversation_id, MAX(m.timestamp) as last_in
            FROM messages m
            JOIN conversations c ON m.conversation_id = c.id
            WHERE m.direction = 'inbound'
              AND c.assigned_user_id = $1
              AND c.state NOT IN ('DEAD', 'FUNDED', 'DNC')
            GROUP BY m.conversation_id
        ),
        last_outbound AS (
            SELECT m.conversation_id, MAX(m.timestamp) as last_out
            FROM messages m
            JOIN conversations c ON m.conversation_id = c.id
            WHERE m.direction = 'outbound'
              AND c.assigned_user_id = $1
            GROUP BY m.conversation_id
        )
        SELECT 
            li.conversation_id,
            c.business_name,
            c.state,
            c.phone,
            li.last_in,
            lo.last_out,
            EXTRACT(EPOCH FROM ($3::timestamp - li.last_in)) / 3600 as hours_waiting
        FROM last_inbound li
        JOIN conversations c ON li.conversation_id = c.id
        LEFT JOIN last_outbound lo ON li.conversation_id = lo.conversation_id
        WHERE (lo.last_out IS NULL OR lo.last_out < li.last_in)
          AND li.last_in < $2
        ORDER BY li.last_in ASC
    `, [userId, oneHourBeforeRef, referenceTime.toISOString()], 'unanswered');

    // 🟡 Stale leads (stuck in same state 3+ days, still active)
    const stale = await safeQuery(db, `
        WITH latest_state AS (
            SELECT DISTINCT ON (conversation_id) 
                conversation_id, new_state, changed_at
            FROM state_history
            ORDER BY conversation_id, changed_at DESC
        )
        SELECT 
            c.id as conversation_id,
            c.business_name,
            c.state,
            ls.changed_at as state_since,
            EXTRACT(EPOCH FROM ($2::timestamp - ls.changed_at)) / 86400 as days_in_state
        FROM conversations c
        JOIN latest_state ls ON c.id = ls.conversation_id
        WHERE c.assigned_user_id = $1
          AND c.state NOT IN ('DEAD', 'FUNDED', 'DNC', 'NEW')
          AND ls.changed_at < $3
        ORDER BY ls.changed_at ASC
    `, [userId, referenceTime.toISOString(), threeDaysBeforeRef], 'stale');

    // 🔴 Cold leads (no activity in 2+ days)
    const cold = await safeQuery(db, `
        WITH last_activity AS (
            SELECT conversation_id, MAX(timestamp) as last_msg
            FROM messages
            GROUP BY conversation_id
        )
        SELECT 
            c.id as conversation_id,
            c.business_name,
            c.state,
            la.last_msg,
            EXTRACT(EPOCH FROM ($3::timestamp - la.last_msg)) / 86400 as days_silent
        FROM conversations c
        JOIN last_activity la ON c.id = la.conversation_id
        WHERE c.assigned_user_id = $1
          AND c.state NOT IN ('DEAD', 'FUNDED', 'DNC')
          AND la.last_msg < $2
        ORDER BY la.last_msg ASC
    `, [userId, twoDaysBeforeRef, referenceTime.toISOString()], 'cold');

    // 🟢 Offers awaiting follow-up
    const pendingOffers = await safeQuery(db, `
        SELECT 
            ls.conversation_id,
            c.business_name,
            c.state,
            ls.lender_name,
            ls.offer_amount,
            ls.last_response_at,
            EXTRACT(EPOCH FROM (NOW() - ls.last_response_at)) / 3600 as hours_since_offer
        FROM lender_submissions ls
        JOIN conversations c ON ls.conversation_id = c.id
        WHERE c.assigned_user_id = $1
          AND ls.status = 'OFFER'
          AND c.state NOT IN ('FUNDED', 'DEAD', 'DNC')
        ORDER BY ls.last_response_at ASC
    `, [userId], 'pending_offers');

    // 📋 Pipeline summary by state
    const pipeline = await safeQuery(db, `
        SELECT state, COUNT(*) as count
        FROM conversations
        WHERE assigned_user_id = $1
          AND state NOT IN ('DEAD', 'DNC')
        GROUP BY state
        ORDER BY count DESC
    `, [userId], 'pipeline');

    // 📊 State-prioritized lead details (everything except DRIP gets full detail)
    const detailedLeads = await safeQuery(db, `
        WITH last_msg AS (
            SELECT conversation_id, 
                   MAX(timestamp) as last_activity,
                   MAX(timestamp) FILTER (WHERE direction = 'inbound') as last_inbound,
                   MAX(timestamp) FILTER (WHERE direction = 'outbound') as last_outbound
            FROM messages
            GROUP BY conversation_id
        )
        SELECT 
            c.id as conversation_id,
            c.business_name,
            c.state,
            c.phone,
            lm.last_activity,
            lm.last_inbound,
            lm.last_outbound,
            EXTRACT(EPOCH FROM ($3::timestamp - COALESCE(lm.last_activity, c.created_at))) / 3600 as hours_since_activity,
            CASE WHEN fa.id IS NOT NULL THEN true ELSE false END as has_fcs,
            fa.average_revenue as fcs_revenue,
            fa.total_negative_days as fcs_neg_days
        FROM conversations c
        LEFT JOIN last_msg lm ON c.id = lm.conversation_id
        LEFT JOIN LATERAL (
            SELECT id, average_revenue, total_negative_days 
            FROM fcs_analyses WHERE conversation_id = c.id 
            ORDER BY completed_at DESC LIMIT 1
        ) fa ON true
        WHERE c.assigned_user_id = $1
          AND c.state NOT IN ('DEAD', 'DNC', 'FUNDED')
          AND (
            c.state = 'DRIP' 
            OR (lm.last_activity AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York')::date <= $2::date
            OR (c.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York')::date <= $2::date
          )
        ORDER BY 
            CASE c.state 
                WHEN 'OFFER' THEN 1
                WHEN 'PITCH-READY' THEN 2
                WHEN 'QUALIFIED' THEN 3
                WHEN 'ACTIVE' THEN 4
                WHEN 'DRIP' THEN 5
                ELSE 3
            END,
            lm.last_activity DESC NULLS LAST
    `, [userId, targetDate, referenceTime.toISOString()], 'detailed_leads');

    // Split DRIP (just count) vs priority states (full detail)
    const dripLeads = detailedLeads.filter(l => l.state === 'DRIP');
    const priorityLeads = detailedLeads.filter(l => l.state !== 'DRIP');

    // Today's activity snapshot
    const todayActivity = await safeQuery(db, `
        SELECT 
            COUNT(*) FILTER (WHERE m.direction = 'outbound') as msgs_sent,
            COUNT(*) FILTER (WHERE m.direction = 'inbound') as msgs_received,
            COUNT(DISTINCT m.conversation_id) as leads_touched
        FROM messages m
        JOIN conversations c ON m.conversation_id = c.id
        WHERE c.assigned_user_id = $1
          AND (m.timestamp AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York')::date = $2
    `, [userId, targetDate], 'today_activity');

    // Pending doc collection leads
    const pendingDocs = await safeQuery(db, `
        SELECT 
            c.id as conversation_id,
            c.business_name,
            c.state
        FROM conversations c
        WHERE c.assigned_user_id = $1
          AND c.state IN ('VETTING', 'DOC_COLLECTION', 'DOCS_NEEDED')
          AND NOT EXISTS (
              SELECT 1 FROM fcs_analyses fa WHERE fa.conversation_id = c.id
          )
    `, [userId], 'pending_docs');

    return {
        date: targetDate,
        isToday,
        unanswered,
        stale,
        cold,
        pendingOffers,
        pendingDocs,
        pipeline,
        priorityLeads,
        dripCount: dripLeads.length,
        todayActivity: todayActivity[0] || {},
        generated_at: referenceTime.toISOString()
    };
}


// ============================================
// OWNER PERFORMANCE ANALYTICS (for Danny)
// ============================================

async function buildOwnerBrokerAnalytics(db, userId, startDate, endDate) {
    
    // Volume metrics
    const volume = (await safeQuery(db, `
        SELECT 
            COUNT(*) FILTER (WHERE m.direction = 'outbound') as msgs_sent,
            COUNT(*) FILTER (WHERE m.direction = 'inbound') as msgs_received,
            COUNT(DISTINCT m.conversation_id) FILTER (WHERE m.direction = 'outbound') as leads_worked,
            COUNT(DISTINCT m.conversation_id) FILTER (WHERE m.direction = 'inbound') as leads_engaged
        FROM messages m
        JOIN conversations c ON m.conversation_id = c.id
        WHERE c.assigned_user_id = $1
          AND (m.timestamp AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York')::date BETWEEN $2 AND $3
    `, [userId, startDate, endDate], 'volume'))[0] || {};

    // Average response time
    const responseTime = (await safeQuery(db, `
        WITH inbound_msgs AS (
            SELECT m.conversation_id, m.timestamp as in_time,
                   LEAD(m.timestamp) OVER (PARTITION BY m.conversation_id ORDER BY m.timestamp) as next_msg_time
            FROM messages m
            JOIN conversations c ON m.conversation_id = c.id
            WHERE c.assigned_user_id = $1
              AND m.direction = 'inbound'
              AND (m.timestamp AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York')::date BETWEEN $2 AND $3
        ),
        first_response AS (
            SELECT im.conversation_id, im.in_time,
                   MIN(m2.timestamp) as response_time
            FROM inbound_msgs im
            JOIN messages m2 ON m2.conversation_id = im.conversation_id
                AND m2.direction = 'outbound'
                AND m2.timestamp > im.in_time
                AND m2.timestamp < im.in_time + INTERVAL '24 hours'
            GROUP BY im.conversation_id, im.in_time
        )
        SELECT 
            AVG(EXTRACT(EPOCH FROM (response_time - in_time))) / 60 as avg_response_minutes,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (response_time - in_time)) / 60) as median_response_minutes,
            COUNT(*) as responses_measured,
            COUNT(*) FILTER (WHERE EXTRACT(EPOCH FROM (response_time - in_time)) < 3600) as under_1hr,
            COUNT(*) FILTER (WHERE EXTRACT(EPOCH FROM (response_time - in_time)) >= 3600) as over_1hr
        FROM first_response
    `, [userId, startDate, endDate], 'response_time'))[0] || {};

    // Conversion funnel
    const funnel = await safeQuery(db, `
        WITH period_changes AS (
            SELECT conversation_id, old_state, new_state
            FROM state_history sh
            JOIN conversations c ON sh.conversation_id = c.id
            WHERE c.assigned_user_id = $1
              AND (sh.changed_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York')::date BETWEEN $2 AND $3
        )
        SELECT 
            old_state || ' → ' || new_state as transition,
            COUNT(*) as count
        FROM period_changes
        GROUP BY old_state, new_state
        ORDER BY count DESC
    `, [userId, startDate, endDate], 'funnel');

    // Submissions & outcomes
    const submissions = (await safeQuery(db, `
        SELECT 
            COUNT(*) as total_submitted,
            COUNT(*) FILTER (WHERE ls.status = 'OFFER') as offers,
            COUNT(*) FILTER (WHERE ls.status IN ('DECLINE', 'DECLINED')) as declines,
            COUNT(*) FILTER (WHERE ls.status = 'FUNDED') as funded,
            COUNT(*) FILTER (WHERE ls.status = 'STIP') as stips,
            COALESCE(SUM(ls.offer_amount) FILTER (WHERE ls.status = 'OFFER'), 0) as total_offer_amount,
            COALESCE(SUM(ls.offer_amount) FILTER (WHERE ls.status = 'FUNDED'), 0) as total_funded_amount,
            ROUND(COUNT(*) FILTER (WHERE ls.status = 'OFFER')::numeric / NULLIF(COUNT(*), 0) * 100, 1) as offer_rate_pct
        FROM lender_submissions ls
        JOIN conversations c ON ls.conversation_id = c.id
        WHERE c.assigned_user_id = $1
          AND (ls.submitted_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York')::date BETWEEN $2 AND $3
    `, [userId, startDate, endDate], 'submissions'))[0] || {};

    // Decline reason breakdown
    const declineReasons = await safeQuery(db, `
        SELECT ls.decline_reason, COUNT(*) as count
        FROM lender_submissions ls
        JOIN conversations c ON ls.conversation_id = c.id
        WHERE c.assigned_user_id = $1
          AND ls.status IN ('DECLINE', 'DECLINED')
          AND ls.decline_reason IS NOT NULL
          AND (ls.last_response_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York')::date BETWEEN $2 AND $3
        GROUP BY ls.decline_reason
        ORDER BY count DESC
    `, [userId, startDate, endDate], 'decline_reasons');

    // Active hours distribution
    const activeHours = await safeQuery(db, `
        SELECT 
            EXTRACT(HOUR FROM (m.timestamp AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York')) as hour_et,
            COUNT(*) as msg_count
        FROM messages m
        JOIN conversations c ON m.conversation_id = c.id
        WHERE c.assigned_user_id = $1
          AND m.direction = 'outbound'
          AND (m.timestamp AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York')::date BETWEEN $2 AND $3
        GROUP BY EXTRACT(HOUR FROM (m.timestamp AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York'))
        ORDER BY hour_et
    `, [userId, startDate, endDate], 'active_hours');

    // Team averages for comparison
    const teamAvg = (await safeQuery(db, `
        WITH broker_stats AS (
            SELECT 
                c.assigned_user_id,
                COUNT(*) FILTER (WHERE m.direction = 'outbound') as msgs_sent,
                COUNT(DISTINCT m.conversation_id) as leads_worked
            FROM messages m
            JOIN conversations c ON m.conversation_id = c.id
            JOIN users u ON c.assigned_user_id = u.id
            WHERE u.role != 'admin'
              AND (m.timestamp AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York')::date BETWEEN $1 AND $2
            GROUP BY c.assigned_user_id
        )
        SELECT 
            AVG(msgs_sent) as avg_msgs_sent,
            AVG(leads_worked) as avg_leads_worked
        FROM broker_stats
    `, [startDate, endDate], 'team_avg'))[0] || {};

    // Current pipeline snapshot
    const pipeline = await safeQuery(db, `
        SELECT state, COUNT(*) as count
        FROM conversations
        WHERE assigned_user_id = $1
          AND state NOT IN ('DEAD', 'DNC')
        GROUP BY state
        ORDER BY count DESC
    `, [userId], 'pipeline');

    // AI vs human message ratio
    const aiRatio = (await safeQuery(db, `
        SELECT 
            COUNT(*) FILTER (WHERE m.sender_type = 'ai' OR m.is_ai = true) as ai_sent,
            COUNT(*) FILTER (WHERE m.sender_type != 'ai' AND (m.is_ai IS NULL OR m.is_ai = false) AND m.direction = 'outbound') as human_sent
        FROM messages m
        JOIN conversations c ON m.conversation_id = c.id
        WHERE c.assigned_user_id = $1
          AND m.direction = 'outbound'
          AND (m.timestamp AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York')::date BETWEEN $2 AND $3
    `, [userId, startDate, endDate], 'ai_ratio'))[0] || {};

    return {
        volume,
        responseTime,
        funnel,
        submissions,
        declineReasons,
        activeHours,
        teamAvg,
        pipeline,
        aiRatio,
        period: { start: startDate, end: endDate }
    };
}


// ============================================
// NARRATIVE GENERATORS
// ============================================

async function generateBrokerBriefing(userId, dateStr = null) {
    const db = getDatabase();
    const data = await buildBrokerActionBriefing(db, userId, dateStr);

    const broker = (await safeQuery(db, `
        SELECT COALESCE(agent_name, name) as name FROM users WHERE id = $1
    `, [userId], 'broker_name'))[0];

    let promptTemplate;
    try {
        promptTemplate = fs.readFileSync(path.join(__dirname, '../prompts/broker-briefing-prompt.md'), 'utf8');
    } catch (err) {
        console.error('❌ Could not load broker-briefing-prompt.md:', err.message);
        return { data, narrative: 'Failed to load prompt template.' };
    }

    const prompt = promptTemplate
        .replace('{{BROKER_NAME}}', broker?.name || 'Broker')
        .replace('{{DATE}}', data.date || getEtDateString())
        .replace('{{DATA}}', JSON.stringify(data, null, 2));

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-pro' });
    const result = await model.generateContent(prompt);
    const narrative = result.response.text();

    const usage = result.response.usageMetadata;
    if (usage) {
        console.log(`📊 Broker Briefing Tokens — Input: ${usage.promptTokenCount?.toLocaleString() || '?'} | Output: ${usage.candidatesTokenCount?.toLocaleString() || '?'}`);
    }

    return { data, narrative };
}

async function generateOwnerAnalytics(userId, startDate, endDate) {
    const db = getDatabase();
    const data = await buildOwnerBrokerAnalytics(db, userId, startDate, endDate);

    const broker = (await safeQuery(db, `
        SELECT COALESCE(agent_name, name) as name FROM users WHERE id = $1
    `, [userId], 'broker_name'))[0];

    let promptTemplate;
    try {
        promptTemplate = fs.readFileSync(path.join(__dirname, '../prompts/owner-analytics-prompt.md'), 'utf8');
    } catch (err) {
        console.error('❌ Could not load owner-analytics-prompt.md:', err.message);
        return { data, narrative: 'Failed to load prompt template.' };
    }

    const prompt = promptTemplate
        .replace('{{BROKER_NAME}}', broker?.name || 'Broker')
        .replace('{{START_DATE}}', startDate)
        .replace('{{END_DATE}}', endDate)
        .replace('{{DATA}}', JSON.stringify(data, null, 2));

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-pro' });
    const result = await model.generateContent(prompt);
    const narrative = result.response.text();

    const usage = result.response.usageMetadata;
    if (usage) {
        console.log(`📊 Owner Analytics Tokens — Input: ${usage.promptTokenCount?.toLocaleString() || '?'} | Output: ${usage.candidatesTokenCount?.toLocaleString() || '?'}`);
    }

    return { data, narrative };
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
    scheduleDailyAgent,
    buildBrokerActionBriefing,
    buildOwnerBrokerAnalytics,
    generateBrokerBriefing,
    generateOwnerAnalytics
};
