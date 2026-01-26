// backend/services/agentRouter.js
// 🎯 AGENT ROUTER
// Central dispatcher that routes messages to the correct agent based on conversation state

const { getDatabase } = require('./database');
const aiAgent = require('./aiAgent');           // Agent 1: Pre-Vetter
const vettingAgent = require('./vettingAgent'); // Agent 2: Vetter
const negotiatingAgent = require('./negotiatingAgent'); // Agent 3: Negotiator

// ==========================================
// STATE OWNERSHIP MAP
// ==========================================
const STATE_OWNERSHIP = {
    // Agent 1: Pre-Vetter
    'NEW': 'PRE_VETTER',
    'REPLIED': 'PRE_VETTER',
    'REPLIED_NUDGE_1': 'PRE_VETTER',
    'REPLIED_NUDGE_2': 'PRE_VETTER',

    // Waiting for FCS/strategy (dispatcher handles)
    'PRE_VETTED': 'LOCKED',

    // Cold drip (dispatcher handles)
    'SENT_HOOK': 'LOCKED',
    'SENT_FU_1': 'LOCKED',
    'SENT_FU_2': 'LOCKED',
    'SENT_FU_3': 'LOCKED',
    'SENT_FU_4': 'LOCKED',

    // Agent 2: Vetter
    'HAIL_MARY': 'VETTER',
    'HAIL_MARY_FU_1': 'VETTER',
    'HAIL_MARY_FU_2': 'LOCKED',
    'HAIL_MARY_FINAL': 'LOCKED',
    'VETTING': 'VETTER',
    'VETTING_NUDGE_1': 'VETTER',
    'VETTING_NUDGE_2': 'VETTER',
    'SUBMITTED': 'VETTER',

    // Agent 3: Negotiator
    'OFFER_RECEIVED': 'NEGOTIATOR',
    'NEGOTIATING': 'NEGOTIATOR',

    // Terminal
    'VERBAL_ACCEPT': 'LOCKED',
    'CLOSED_WON': 'LOCKED',
    'CLOSED_LOST': 'LOCKED',
    'DEAD': 'LOCKED',
    'ARCHIVED': 'LOCKED'
};

// ==========================================
// MAIN ROUTER FUNCTION
// ==========================================
async function routeMessage(conversationId, inboundMessage, systemInstruction = null) {
    const db = getDatabase();

    try {
        // Get current state AND business name for logging
        const convRes = await db.query(`
            SELECT state, ai_enabled, has_offer, business_name, first_name
            FROM conversations 
            WHERE id = $1
        `, [conversationId]);

        if (!convRes.rows[0]) {
            console.log('❌ [ROUTER] Conversation not found');
            return { shouldReply: false, agent: null };
        }

        const { state, ai_enabled, has_offer, business_name, first_name } = convRes.rows[0];
        const leadName = business_name || first_name || 'Unknown';

        // Check if AI is globally disabled
        if (ai_enabled === false) {
            console.log(`⛔ [${leadName}] AI disabled`);
            return { shouldReply: false, agent: 'DISABLED' };
        }

        // Determine which agent owns this state
        const owner = STATE_OWNERSHIP[state] || 'LOCKED';
        console.log(`📋 [${leadName}] ${state} → ${owner}`);

        // Check for state/reality mismatches and auto-correct
        const correctedOwner = await checkAndCorrectState(conversationId, state, has_offer, db);
        const finalOwner = correctedOwner || owner;

        // Manual override - if systemInstruction provided, allow response
        const isManualCommand = systemInstruction && systemInstruction.length > 5;

        // Route to appropriate agent
        switch (finalOwner) {
            case 'PRE_VETTER':
                const preVetterResult = await aiAgent.processLeadWithAI(conversationId, systemInstruction);
                if (preVetterResult.content) {
                    console.log(`📤 [${leadName}] Sending: "${preVetterResult.content.substring(0, 60)}..."`);
                }
                return { ...preVetterResult, agent: 'PRE_VETTER' };

            case 'VETTER':
                const vetterResult = await vettingAgent.processMessage(conversationId, inboundMessage, systemInstruction);
                if (vetterResult.content) {
                    console.log(`📤 [${leadName}] Sending: "${vetterResult.content.substring(0, 60)}..."`);
                }
                return { ...vetterResult, agent: 'VETTER' };

            case 'NEGOTIATOR':
                const negotiatorResult = await negotiatingAgent.processMessage(conversationId, inboundMessage, systemInstruction);
                if (negotiatorResult.content) {
                    console.log(`📤 [${leadName}] Sending: "${negotiatorResult.content.substring(0, 60)}..."`);
                }
                return { ...negotiatorResult, agent: 'NEGOTIATOR' };

            case 'LOCKED':
                // Check if this is a cold drip state - NEVER override these
                const COLD_DRIP_STATES = ['SENT_HOOK', 'SENT_FU_1', 'SENT_FU_2', 'SENT_FU_3', 'SENT_FU_4'];

                if (COLD_DRIP_STATES.includes(state) && !isManualCommand) {
                    console.log(`❄️ [${leadName}] Waiting for dispatcher`);
                    return { shouldReply: false, agent: 'COLD_DRIP' };
                }

                if (COLD_DRIP_STATES.includes(state) && isManualCommand) {
                    const result = await aiAgent.processLeadWithAI(conversationId, systemInstruction);
                    if (result.content) {
                        console.log(`📤 [${leadName}] Sending: "${result.content.substring(0, 60)}..."`);
                    }
                    return { ...result, agent: 'PRE_VETTER' };
                }

                if (isManualCommand) {
                    // Manual command override - only for non-cold-drip locked states
                    console.log('🔓 [ROUTER] Manual override on locked state');
                    const manualResult = await vettingAgent.processMessage(conversationId, inboundMessage, systemInstruction);
                    return { ...manualResult, agent: 'MANUAL_OVERRIDE' };
                }

                console.log(`🔒 [${leadName}] Locked - no response`);
                return { shouldReply: false, agent: 'LOCKED' };

            default:
                console.log(`⚠️ [ROUTER] Unknown state owner: ${finalOwner}`);
                return { shouldReply: false, agent: 'UNKNOWN' };
        }

    } catch (err) {
        console.error('❌ [ROUTER] Error:', err.message);
        console.error(err.stack);
        return { shouldReply: false, agent: 'ERROR' };
    }
}

// ==========================================
// STATE CORRECTION LOGIC
// ==========================================
async function checkAndCorrectState(conversationId, currentState, hasOffer, db) {
    // Check if reality doesn't match state and auto-correct

    // Case 1: has_offer is true but state isn't OFFER_RECEIVED or NEGOTIATING
    if (hasOffer && !['OFFER_RECEIVED', 'NEGOTIATING', 'VERBAL_ACCEPT', 'CLOSED_WON', 'CLOSED_LOST'].includes(currentState)) {
        // Verify there's actually an offer in the database
        const offerCheck = await db.query(`
            SELECT 1 FROM lender_submissions 
            WHERE conversation_id = $1 AND status = 'OFFER' 
            LIMIT 1
        `, [conversationId]);

        if (offerCheck.rows.length > 0) {
            console.log('🔄 [ROUTER] Auto-correcting state: has_offer but state was ' + currentState);
            await db.query(`UPDATE conversations SET state = 'OFFER_RECEIVED' WHERE id = $1`, [conversationId]);
            return 'NEGOTIATOR';
        }
    }

    // Case 2: State is SUBMITTED but no pending submissions
    if (currentState === 'SUBMITTED') {
        const submissionCheck = await db.query(`
            SELECT status FROM lender_submissions 
            WHERE conversation_id = $1
        `, [conversationId]);

        const hasOffer = submissionCheck.rows.some(r => r.status === 'OFFER');
        if (hasOffer) {
            console.log('🔄 [ROUTER] Auto-correcting: SUBMITTED but offer exists');
            await db.query(`UPDATE conversations SET state = 'OFFER_RECEIVED', has_offer = TRUE WHERE id = $1`, [conversationId]);
            return 'NEGOTIATOR';
        }
    }

    return null; // No correction needed
}

// ==========================================
// HELPER: Get state info for debugging
// ==========================================
async function getConversationStateInfo(conversationId) {
    const db = getDatabase();

    const convRes = await db.query(`
        SELECT state, has_offer, ai_enabled, first_name, business_name
        FROM conversations WHERE id = $1
    `, [conversationId]);

    const strategyRes = await db.query(`
        SELECT lead_grade, strategy_type FROM lead_strategy WHERE conversation_id = $1
    `, [conversationId]);

    const offersRes = await db.query(`
        SELECT COUNT(*) as count FROM lender_submissions 
        WHERE conversation_id = $1 AND status = 'OFFER'
    `, [conversationId]);

    const submissionsRes = await db.query(`
        SELECT COUNT(*) as count FROM lender_submissions 
        WHERE conversation_id = $1 AND status = 'sent'
    `, [conversationId]);

    const conv = convRes.rows[0] || {};
    const strategy = strategyRes.rows[0] || {};

    return {
        state: conv.state,
        owner: STATE_OWNERSHIP[conv.state] || 'UNKNOWN',
        hasOffer: conv.has_offer,
        aiEnabled: conv.ai_enabled,
        leadName: conv.first_name,
        business: conv.business_name,
        strategyGrade: strategy.lead_grade,
        strategyType: strategy.strategy_type,
        offerCount: parseInt(offersRes.rows[0]?.count || 0),
        pendingSubmissions: parseInt(submissionsRes.rows[0]?.count || 0)
    };
}

// ==========================================
// EXPORTS
// ==========================================
module.exports = {
    routeMessage,
    getConversationStateInfo,
    STATE_OWNERSHIP
};
