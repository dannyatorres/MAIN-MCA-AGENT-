// backend/services/commanderService.js
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { getDatabase } = require('./database');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const commander = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

// 📖 LOAD PROMPT FROM MD FILE
function loadPrompt(filename) {
    try {
        const promptPath = path.join(__dirname, '../prompts/commander', filename);
        if (fs.existsSync(promptPath)) {
            console.log(`✅ Commander loaded: ${filename}`);
            return fs.readFileSync(promptPath, 'utf8');
        } else {
            console.error(`❌ Missing prompt file: ${filename}`);
            return null;
        }
    } catch (err) {
        console.error(`❌ Error loading ${filename}:`, err.message);
        return null;
    }
}

// 🔧 INJECT VARIABLES INTO PROMPT
function injectVariables(template, variables) {
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
        const regex = new RegExp(`{{${key}}}`, 'g');
        result = result.replace(regex, value ?? 'Unknown');
    }
    return result;
}

// 🧠 MAIN STRATEGY FUNCTION - Called after FCS completes
async function analyzeAndStrategize(conversationId) {
    const db = getDatabase();
    console.log(`🧠 COMMANDER: Analyzing lead ${conversationId}...`);

    try {
        // 1. Gather all intel
        const fcsRes = await db.query(`
            SELECT * FROM fcs_analyses
            WHERE conversation_id = $1
            ORDER BY created_at DESC LIMIT 1
        `, [conversationId]);

        const leadRes = await db.query(`
            SELECT * FROM conversations WHERE id = $1
        `, [conversationId]);

        const messagesRes = await db.query(`
            SELECT content, direction FROM messages
            WHERE conversation_id = $1
            ORDER BY timestamp DESC LIMIT 10
        `, [conversationId]);

        if (!fcsRes.rows[0]) {
            console.log('⚠️ COMMANDER: No FCS data yet');
            return null;
        }

        const fcs = fcsRes.rows[0];
        const lead = leadRes.rows[0];
        const recentMessages = messagesRes.rows.reverse();

        // 2. Load and populate the prompt template
        const template = loadPrompt('strategy_analysis.md');
        if (!template) return null;

        const conversationHistory = recentMessages
            .map(m => `${m.direction === 'inbound' ? 'LEAD' : 'AGENT'}: ${m.content}`)
            .join('\n');

        const prompt = injectVariables(template, {
            // Financial Data
            monthly_revenue: Math.round(fcs.average_revenue || 0).toLocaleString(),
            average_deposits: Math.round(fcs.average_deposits || fcs.average_revenue || 0).toLocaleString(),
            daily_balance: Math.round(fcs.average_daily_balance || 0).toLocaleString(),
            negative_days: fcs.total_negative_days || 0,
            average_negative_days: fcs.average_negative_days || 0,
            deposit_count: fcs.average_deposit_count || 'Unknown',

            // MCA & Risk Data
            withholding_percentage: fcs.withholding_percentage || 'Unknown',
            last_mca_deposit: fcs.last_mca_deposit_date || 'None detected',
            position_count: fcs.position_count || 'Unknown',

            // Business Info
            extracted_business_name: fcs.extracted_business_name || lead.business_name || 'Unknown',
            industry: fcs.industry || 'Unknown',
            state: fcs.state || 'Unknown',
            time_in_business: fcs.time_in_business_text || 'Unknown',

            // Lead Info
            first_name: lead.first_name || '',
            last_name: lead.last_name || '',
            credit_score: lead.credit_score || 'Unknown',
            recent_funding: lead.recent_funding || 'None mentioned',
            requested_amount: lead.requested_amount || 'Not specified',

            // Full FCS Report
            fcs_report: fcs.fcs_report || 'No detailed report available',

            // Conversation
            conversation_history: conversationHistory
        });

        // 3. Run Commander
        const result = await commander.generateContent(prompt);
        const responseText = result.response.text()
            .replace(/```json/g, '')
            .replace(/```/g, '')
            .trim();

        const gamePlan = JSON.parse(responseText);

        console.log(`🎖️ COMMANDER VERDICT:`);
        console.log(`   Grade: ${gamePlan.lead_grade}`);
        console.log(`   Strategy: ${gamePlan.strategy_type}`);
        console.log(`   Offer Range: ${gamePlan.offer_range.min.toLocaleString()} - ${gamePlan.offer_range.max.toLocaleString()}`);

        // 4. Save the strategy to DB
        await db.query(`
            INSERT INTO lead_strategy (conversation_id, lead_grade, strategy_type, game_plan)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (conversation_id)
            DO UPDATE SET
                lead_grade = $2,
                strategy_type = $3,
                game_plan = $4,
                updated_at = NOW()
        `, [conversationId, gamePlan.lead_grade, gamePlan.strategy_type, JSON.stringify(gamePlan)]);

        // 5. Update lead state based on grade
        let newState = 'STRATEGIZED';
        if (gamePlan.strategy_type === 'DEAD') newState = 'DEAD';
        if (gamePlan.strategy_type === 'PURSUE_HARD') newState = 'HOT_LEAD';

        await db.query(`UPDATE conversations SET state = $1 WHERE id = $2`, [newState, conversationId]);

        return gamePlan;

    } catch (err) {
        console.error('❌ COMMANDER ERROR:', err.message);
        return null;
    }
}

// 💰 GENERATE OFFER - Called when lead says "ok let's see what you got"
async function generateOffer(conversationId) {
    const db = getDatabase();
    console.log(`💰 COMMANDER: Generating offer for ${conversationId}...`);

    try {
        const strategyRes = await db.query(`
            SELECT game_plan FROM lead_strategy WHERE conversation_id = $1
        `, [conversationId]);

        const fcsRes = await db.query(`
            SELECT * FROM fcs_analyses
            WHERE conversation_id = $1
            ORDER BY created_at DESC LIMIT 1
        `, [conversationId]);

        const leadRes = await db.query(`
            SELECT * FROM conversations WHERE id = $1
        `, [conversationId]);

        if (!strategyRes.rows[0] || !fcsRes.rows[0]) {
            console.log('⚠️ Missing strategy or FCS data');
            return null;
        }

        let gamePlan = strategyRes.rows[0].game_plan;
        if (typeof gamePlan === 'string') {
            gamePlan = JSON.parse(gamePlan);
        }

        const fcs = fcsRes.rows[0];
        const lead = leadRes.rows[0];

        // Load and populate the prompt template
        const template = loadPrompt('offer_generation.md');
        if (!template) return null;

        const prompt = injectVariables(template, {
            game_plan_json: JSON.stringify(gamePlan, null, 2),
            monthly_revenue: Math.round(fcs.average_revenue || 0).toLocaleString(),
            daily_balance: Math.round(fcs.average_daily_balance || 0).toLocaleString(),
            negative_days: fcs.total_negative_days || 0,
            withholding_percentage: fcs.withholding_percentage || 'Unknown',
            last_mca_deposit: fcs.last_mca_deposit_date || 'None',
            business_name: lead.business_name,
            industry: fcs.industry || 'Unknown',
            state: fcs.state || 'Unknown',
            credit_score: lead.credit_score || 'Unknown'
        });

        const result = await commander.generateContent(prompt);
        const responseText = result.response.text()
            .replace(/```json/g, '')
            .replace(/```/g, '')
            .trim();

        const offer = JSON.parse(responseText);

        console.log(`💰 OFFER GENERATED: ${offer.offer_amount.toLocaleString()} @ ${offer.factor_rate}`);

        // Save offer to strategy table
        await db.query(`
            UPDATE lead_strategy
            SET offer_amount = $1, offer_generated_at = NOW(), game_plan = game_plan || $2
            WHERE conversation_id = $3
        `, [offer.offer_amount, JSON.stringify({ offer_details: offer }), conversationId]);

        await db.query(`UPDATE conversations SET state = 'OFFER_READY' WHERE id = $1`, [conversationId]);

        return offer;

    } catch (err) {
        console.error('❌ OFFER GENERATION ERROR:', err.message);
        return null;
    }
}

// 🔄 RE-STRATEGIZE - Called when situation changes
async function reStrategize(conversationId, newContext) {
    const db = getDatabase();
    console.log(`🔄 COMMANDER: Re-evaluating strategy for ${conversationId}...`);

    try {
        const strategyRes = await db.query(`
            SELECT game_plan, lead_grade FROM lead_strategy WHERE conversation_id = $1
        `, [conversationId]);

        if (!strategyRes.rows[0]) {
            return await analyzeAndStrategize(conversationId);
        }

        let currentPlan = strategyRes.rows[0].game_plan;
        if (typeof currentPlan === 'string') {
            currentPlan = JSON.parse(currentPlan);
        }

        // Load and populate the prompt template
        const template = loadPrompt('restrategize.md');
        if (!template) return null;

        const prompt = injectVariables(template, {
            current_plan_json: JSON.stringify(currentPlan, null, 2),
            new_context: newContext
        });

        const result = await commander.generateContent(prompt);
        const responseText = result.response.text()
            .replace(/```json/g, '')
            .replace(/```/g, '')
            .trim();

        const update = JSON.parse(responseText);

        if (update.strategy_changed) {
            console.log(`🔄 STRATEGY UPDATED: ${update.reason}`);

            const updatedPlan = {
                ...currentPlan,
                approach: update.updated_approach,
                next_action: update.updated_next_action,
                last_update_reason: update.reason
            };

            await db.query(`
                UPDATE lead_strategy
                SET game_plan = $1, updated_at = NOW()
                WHERE conversation_id = $2
            `, [JSON.stringify(updatedPlan), conversationId]);

            return updatedPlan;
        }

        console.log(`✅ Strategy unchanged: ${update.reason}`);
        return currentPlan;

    } catch (err) {
        console.error('❌ RE-STRATEGIZE ERROR:', err.message);
        return null;
    }
}

module.exports = {
    analyzeAndStrategize,
    generateOffer,
    reStrategize
};
