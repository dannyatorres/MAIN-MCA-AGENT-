// services/aiDecisionLogger.js
const { getDatabase } = require('./database');

async function logAIDecision({
    conversationId,
    agent,
    leadMessage,
    reasoning,
    toolsUsed = [],
    actionTaken,
    responseSent = null,
    stateBefore = null,
    stateAfter = null,
    tokensUsed = null
}) {
    const db = getDatabase();
    
    try {
        await db.query(`
            INSERT INTO ai_decisions (
                conversation_id, agent, lead_message, ai_reasoning,
                tools_used, action_taken, response_sent,
                state_before, state_after, tokens_used
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [
            conversationId,
            agent,
            leadMessage,
            reasoning,
            toolsUsed,
            actionTaken,
            responseSent,
            stateBefore,
            stateAfter,
            tokensUsed
        ]);
    } catch (err) {
        console.error('Failed to log AI decision:', err.message);
    }
}

module.exports = { logAIDecision };
