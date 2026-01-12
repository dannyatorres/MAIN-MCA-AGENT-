// services/usageTracker.js
const { getDatabase } = require('./database');

// Your markup (1.5 = 50% markup)
const MARKUP = 1.5;

// Cost per unit (update with your actual costs)
const COSTS = {
    sms_outbound: 0.0113,    // $0.0083 + $0.003 carrier fee
    sms_inbound: 0.0113,     // $0.0083 + $0.003 carrier fee
    mms_outbound: 0.02,
    skip_trace: { cost: 0.25, billable: 0.30 },
    'gpt-4o': { input: 0.005 / 1000, output: 0.015 / 1000 },
    'gpt-4o-mini': { input: 0.00015 / 1000, output: 0.0006 / 1000 },
    'gpt-4-turbo': { input: 0.01 / 1000, output: 0.03 / 1000 },
    'gemini-2.5-pro': { input: 0.00125 / 1000, output: 0.005 / 1000 },
    'gemini-3-pro': { input: 0.00125 / 1000, output: 0.005 / 1000 },
    'claude-haiku': { input: 0.00025 / 1000, output: 0.00125 / 1000 }
};

async function trackUsage({ userId, conversationId, type, service, model, inputTokens, outputTokens, segments, metadata }) {
    const db = getDatabase();

    let costActual = 0;
    let costBillable = null;
    let totalTokens = null;

    // Calculate cost
    if (type.includes('sms') || type.includes('mms')) {
        const rate = COSTS[type] || 0.01;
        costActual = (segments || 1) * rate;
    } else if (type && COSTS[type]) {
        if (typeof COSTS[type] === 'number') {
            costActual = (segments || 1) * COSTS[type];
        } else if (COSTS[type].cost !== undefined) {
            // Custom pricing (like skip_trace)
            costActual = (segments || 1) * COSTS[type].cost;
            costBillable = (segments || 1) * COSTS[type].billable;
        }
    } else if (model && COSTS[model]) {
        const rates = COSTS[model];
        costActual = (inputTokens || 0) * rates.input + (outputTokens || 0) * rates.output;
        totalTokens = (inputTokens || 0) + (outputTokens || 0);
    }

    if (costBillable === null) {
        costBillable = costActual * MARKUP;
    }

    try {
        await db.query(`
            INSERT INTO usage_logs (user_id, conversation_id, usage_type, service, model, input_tokens, output_tokens, total_tokens, segments, cost_actual, cost_billable, metadata)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `, [userId, conversationId, type, service, model, inputTokens, outputTokens, totalTokens, segments, costActual, costBillable, metadata ? JSON.stringify(metadata) : null]);
    } catch (e) {
        console.error('Failed to track usage:', e);
    }
}

async function getUserUsageSummary(userId, startDate, endDate) {
    const db = getDatabase();

    const result = await db.query(`
        SELECT 
            usage_type,
            service,
            model,
            COUNT(*) as count,
            SUM(total_tokens) as total_tokens,
            SUM(segments) as total_segments,
            SUM(cost_actual) as total_cost_actual,
            SUM(cost_billable) as total_cost_billable
        FROM usage_logs
        WHERE user_id = $1
          AND created_at >= $2
          AND created_at < $3
        GROUP BY usage_type, service, model
        ORDER BY total_cost_billable DESC
    `, [userId, startDate, endDate]);

    return result.rows;
}

async function getAllUsageSummary(startDate, endDate) {
    const db = getDatabase();

    const result = await db.query(`
        SELECT 
            u.name as user_name,
            u.email,
            ul.user_id,
            COUNT(*) as total_calls,
            SUM(ul.total_tokens) as total_tokens,
            SUM(ul.segments) as total_sms_segments,
            SUM(ul.cost_actual) as total_cost_actual,
            SUM(ul.cost_billable) as total_cost_billable
        FROM usage_logs ul
        JOIN users u ON ul.user_id = u.id
        WHERE ul.created_at >= $1
          AND ul.created_at < $2
        GROUP BY ul.user_id, u.name, u.email
        ORDER BY total_cost_billable DESC
    `, [startDate, endDate]);

    return result.rows;
}

async function getDetailedUsage(startDate, endDate, userId = null) {
    const db = getDatabase();

    let query = `
        SELECT 
            ul.*,
            u.name as user_name,
            c.business_name
        FROM usage_logs ul
        LEFT JOIN users u ON ul.user_id = u.id
        LEFT JOIN conversations c ON ul.conversation_id = c.id
        WHERE ul.created_at >= $1 AND ul.created_at < $2
    `;

    const params = [startDate, endDate];

    if (userId) {
        query += ` AND ul.user_id = $3`;
        params.push(userId);
    }

    query += ` ORDER BY ul.created_at DESC LIMIT 500`;

    const result = await db.query(query, params);
    return result.rows;
}

module.exports = { trackUsage, getUserUsageSummary, getAllUsageSummary, getDetailedUsage, COSTS, MARKUP };
