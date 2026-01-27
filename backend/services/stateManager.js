// services/stateManager.js
const { getDatabase } = require('./database');

async function updateState(conversationId, newState, changedBy, reason = null) {
    const db = getDatabase();

    const current = await db.query(
        'SELECT state, business_name FROM conversations WHERE id = $1',
        [conversationId]
    );

    const oldState = current.rows[0]?.state;
    const businessName = current.rows[0]?.business_name || 'Unknown';

    // Don't log if state isn't changing
    if (oldState === newState) {
        console.log(`📊 [${businessName}] State unchanged: ${oldState} (${changedBy})`);
        return;
    }

    await db.query(
        'INSERT INTO state_history (conversation_id, old_state, new_state, changed_by) VALUES ($1, $2, $3, $4)',
        [conversationId, oldState, newState, changedBy]
    );

    await db.query(
        'UPDATE conversations SET state = $1, last_activity = NOW() WHERE id = $2',
        [newState, conversationId]
    );

    console.log(`📊 [${businessName}] ${oldState} → ${newState} (${changedBy})${reason ? ` | ${reason}` : ''}`);
}

module.exports = { updateState };
