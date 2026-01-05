// backend/services/outcomeTracker.js
// Runs periodically to update training data with outcomes

const { getDatabase } = require('./database');

async function updateTrainingOutcomes() {
    const db = getDatabase();
    console.log('📊 Updating training outcomes...');

    try {
        const pendingRecords = await db.query(`
            SELECT rt.id, rt.conversation_id, rt.message_id, rt.human_response_timestamp
            FROM response_training rt
            WHERE rt.human_response_timestamp < NOW() - INTERVAL '1 hour'
            AND (rt.outcome_updated_at IS NULL OR rt.outcome_updated_at < NOW() - INTERVAL '24 hours')
            LIMIT 100
        `);

        console.log(`📋 Found ${pendingRecords.rows.length} records to update`);

        for (const record of pendingRecords.rows) {
            await updateSingleOutcome(db, record);
        }

        console.log('✅ Outcome update complete');
        return { updated: pendingRecords.rows.length };

    } catch (err) {
        console.error('❌ Outcome update failed:', err.message);
        return { error: err.message };
    }
}

async function updateSingleOutcome(db, record) {
    const { id, conversation_id, human_response_timestamp } = record;

    try {
        const responseCheck = await db.query(`
            SELECT timestamp FROM messages
            WHERE conversation_id = $1 
            AND direction = 'inbound'
            AND timestamp > $2
            ORDER BY timestamp ASC LIMIT 1
        `, [conversation_id, human_response_timestamp]);

        const didRespond = responseCheck.rows.length > 0;
        const responseTime = didRespond
            ? Math.round((new Date(responseCheck.rows[0].timestamp) - new Date(human_response_timestamp)) / 1000)
            : null;

        const docsCheck = await db.query(`
            SELECT id FROM documents 
            WHERE conversation_id = $1
            LIMIT 1
        `, [conversation_id]);

        const hasDocs = docsCheck.rows.length > 0;

        const convCheck = await db.query(`
            SELECT state, has_offer FROM conversations 
            WHERE id = $1
        `, [conversation_id]);

        const convState = convCheck.rows[0]?.state;
        const hasOffer = convCheck.rows[0]?.has_offer;

        let outcome = 'PENDING';
        if (convState === 'FUNDED') outcome = 'FUNDED';
        else if (convState === 'DEAD' || convState === 'ARCHIVED') outcome = 'DEAD';
        else if (hasOffer) outcome = 'HAS_OFFER';

        await db.query(`
            UPDATE response_training SET
                did_lead_respond = $1,
                response_time_seconds = $2,
                led_to_docs = $3,
                led_to_funding = $4,
                conversation_outcome = $5,
                outcome_updated_at = NOW()
            WHERE id = $6
        `, [
            didRespond,
            responseTime,
            hasDocs,
            outcome === 'FUNDED',
            outcome,
            id
        ]);

    } catch (err) {
        console.error(`Failed to update outcome for record ${id}:`, err.message);
    }
}

module.exports = { updateTrainingOutcomes, updateSingleOutcome };
