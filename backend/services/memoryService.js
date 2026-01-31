const { Pinecone } = require('@pinecone-database/pinecone');
const { OpenAI } = require('openai');
require('dotenv').config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const index = pinecone.index('mca-files');

// Store a message with embedding
async function storeMessage(conversationId, content, metadata = {}) {
    try {
        const embedding = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: content
        });

        // Build metadata, excluding null/undefined values
        const meta = {
            conversation_id: conversationId,
            content: content.substring(0, 1000),
            timestamp: Date.now()
        };

        if (metadata.direction) meta.direction = metadata.direction;
        if (metadata.state) meta.state = metadata.state;
        if (metadata.lead_grade) meta.lead_grade = metadata.lead_grade;
        if (metadata.outcome) meta.outcome = metadata.outcome;

        await index.upsert([{
            id: `${conversationId}-${Date.now()}`,
            values: embedding.data[0].embedding,
            metadata: meta
        }]);

        console.log(`🧠 Pinecone: Stored ${metadata.direction || 'unknown'} message (${content.substring(0, 30)}...)`);
        return true;
    } catch (err) {
        console.error('⚠️ Pinecone store failed:', err.message);
        return false;
    }
}

// Get relevant context from THIS conversation (long-term memory)
async function getConversationContext(conversationId, currentMessage, limit = 5) {
    try {
        const embedding = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: currentMessage
        });

        const results = await index.query({
            vector: embedding.data[0].embedding,
            topK: limit,
            includeMetadata: true,
            filter: { conversation_id: { $eq: conversationId } }
        });

        const relevant = results.matches.filter(m => m.score > 0.7);
        console.log(`🧠 Pinecone: Retrieved ${relevant.length}/${results.matches.length} relevant messages`);

        return relevant.map(m => ({
            content: m.metadata.content,
            direction: m.metadata.direction,
            score: m.score
        }));
    } catch (err) {
        console.error('⚠️ Pinecone retrieval failed:', err.message);
        return [];
    }
}

// Get similar patterns from ALL conversations (learning)
async function getSimilarPatterns(currentMessage, filters = {}, limit = 5) {
    try {
        const embedding = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: currentMessage
        });

        const queryFilter = {};
        if (filters.outcome) queryFilter.outcome = { $eq: filters.outcome };
        if (filters.lead_grade) queryFilter.lead_grade = { $eq: filters.lead_grade };
        if (filters.direction) queryFilter.direction = { $eq: filters.direction };

        const results = await index.query({
            vector: embedding.data[0].embedding,
            topK: limit,
            includeMetadata: true,
            filter: Object.keys(queryFilter).length > 0 ? queryFilter : undefined
        });

        return results.matches
            .filter(m => m.score > 0.75)
            .map(m => ({
                content: m.metadata.content,
                direction: m.metadata.direction,
                outcome: m.metadata.outcome,
                score: m.score
            }));
    } catch (err) {
        console.error('⚠️ Pattern retrieval failed:', err.message);
        return [];
    }
}

// Mark conversation outcome (for learning)
async function markOutcome(conversationId, outcome) {
    try {
        const results = await index.query({
            vector: new Array(1536).fill(0),
            topK: 100,
            includeMetadata: true,
            filter: { conversation_id: { $eq: conversationId } }
        });

        const updates = results.matches.map(m => ({
            id: m.id,
            values: m.values,
            metadata: { ...m.metadata, outcome }
        }));

        if (updates.length > 0) {
            await index.upsert(updates);
        }

        console.log(`✅ Marked ${updates.length} vectors as: ${outcome}`);
        return true;
    } catch (err) {
        console.error('⚠️ Outcome marking failed:', err.message);
        return false;
    }
}

// Cleanup old dead leads (run weekly)
async function pruneOldVectors(daysOld = 90) {
    try {
        const cutoff = Date.now() - (daysOld * 24 * 60 * 60 * 1000);

        await index.deleteMany({
            filter: {
                outcome: { $eq: 'dead' },
                timestamp: { $lt: cutoff }
            }
        });

        console.log(`🧹 Pruned vectors older than ${daysOld} days`);
        return true;
    } catch (err) {
        console.error('⚠️ Prune failed:', err.message);
        return false;
    }
}

module.exports = {
    storeMessage,
    getConversationContext,
    getSimilarPatterns,
    markOutcome,
    pruneOldVectors
};
