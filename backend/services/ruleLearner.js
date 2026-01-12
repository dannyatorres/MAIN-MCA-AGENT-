// backend/services/ruleLearner.js
// AI-powered rule suggestion system that learns from lender declines

const { getDatabase } = require('./database');
const Anthropic = require('@anthropic-ai/sdk');
const { v4: uuidv4 } = require('uuid');
const { trackUsage } = require('./usageTracker');

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
});

// How often to run the analysis (default: every 30 minutes)
const ANALYSIS_INTERVAL = 30 * 60 * 1000;

async function startRuleLearner() {
    console.log('[RuleLearner] 🧠 Service starting...');

    // Run immediately on startup
    await analyzeDeclines();

    // Then run periodically
    setInterval(analyzeDeclines, ANALYSIS_INTERVAL);
}

async function analyzeDeclines() {
    const db = getDatabase();

    try {
        console.log('[RuleLearner] 🔍 Checking for unanalyzed declines...');

        // Get declines that haven't been analyzed yet
        const declines = await db.query(`
            SELECT
                ls.id,
                ls.lender_name,
                ls.decline_reason,
                ls.raw_email_body,
                ls.conversation_id,
                c.business_name,
                c.industry_type as industry,
                c.us_state,
                c.monthly_revenue,
                c.credit_score as fico_score,
                c.business_start_date as time_in_business
            FROM lender_submissions ls
            LEFT JOIN conversations c ON ls.conversation_id = c.id
            WHERE ls.status IN ('DECLINE', 'DECLINED')
              AND (ls.rule_analyzed = FALSE OR ls.rule_analyzed IS NULL)
              AND ls.decline_reason IS NOT NULL
              AND ls.decline_reason != ''
            ORDER BY ls.created_at DESC
            LIMIT 10
        `);

        if (declines.rows.length === 0) {
            console.log('[RuleLearner] ✅ No new declines to analyze');
            return;
        }

        console.log(`[RuleLearner] 📋 Found ${declines.rows.length} declines to analyze`);

        for (const decline of declines.rows) {
            await analyzeDecline(db, decline);
        }

    } catch (err) {
        console.error('[RuleLearner] ❌ Error:', err.message);
    }
}

async function analyzeDecline(db, decline) {
    console.log(`[RuleLearner] 🤖 Analyzing decline from ${decline.lender_name}...`);

    try {
        // Check if we already have a similar rule
        const existingRule = await db.query(`
            SELECT id FROM lender_rules
            WHERE LOWER(lender_name) LIKE LOWER($1)
            LIMIT 1
        `, [`%${decline.lender_name.split(' ')[0]}%`]);

        const prompt = `You are an MCA (Merchant Cash Advance) underwriting expert. Analyze this lender decline and determine if we should create a rule to avoid similar declines in the future.

LENDER: ${decline.lender_name}
DECLINE REASON: ${decline.decline_reason}
${decline.raw_email_body ? `EMAIL BODY: ${decline.raw_email_body.substring(0, 1500)}` : ''}

DEAL CRITERIA:
- Business: ${decline.business_name || 'Unknown'}
- Industry: ${decline.industry || 'Unknown'}
- State: ${decline.us_state || 'Unknown'}
- Monthly Revenue: ${decline.monthly_revenue || 'Unknown'}
- FICO Score: ${decline.fico_score || 'Unknown'}
- Time in Business: ${decline.time_in_business || 'Unknown'} months

EXISTING RULES FOR THIS LENDER: ${existingRule.rows.length > 0 ? 'Yes, has some rules' : 'No existing rules'}

Based on this decline, should we create a rule? Common patterns:
- Industry restrictions (e.g., "no trucking", "no pawn shops")
- State restrictions (e.g., "no California")
- Minimum requirements (e.g., "needs 24 months TIB", "needs $100k revenue")
- Position restrictions (e.g., "1st position only")

Respond with JSON only:
{
    "should_create_rule": true/false,
    "confidence": 0.0-1.0,
    "rule_type": "industry_block|state_block|minimum_requirement|position_restriction|other",
    "industry": "industry name if applicable, else null",
    "state": "state code if applicable, else null",
    "condition_field": "tib|revenue|fico|position if applicable, else null",
    "condition_operator": "min|max if applicable, else null",
    "condition_value": "numeric value if applicable, else null",
    "decline_message": "Short message explaining why deals would be declined",
    "reasoning": "Your reasoning for this suggestion"
}

If the decline seems like a one-off or you can't determine a clear pattern, set should_create_rule to false.`;

        const response = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 500,
            messages: [{ role: 'user', content: prompt }]
        });

        // Track usage (background system process)
        if (response.usage) {
            await trackUsage({
                userId: null,
                conversationId: decline.conversation_id,
                type: 'llm_call',
                service: 'anthropic',
                model: 'claude-haiku',
                inputTokens: response.usage.input_tokens,
                outputTokens: response.usage.output_tokens,
                metadata: { function: 'ruleLearner' }
            });
        }

        const responseText = response.content[0].text.trim();
        console.log(`[RuleLearner] 📝 AI Response: ${responseText.substring(0, 200)}...`);

        // Parse JSON response
        let analysis;
        try {
            // Handle potential markdown code blocks
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            analysis = JSON.parse(jsonMatch ? jsonMatch[0] : responseText);
        } catch (parseErr) {
            console.error('[RuleLearner] ⚠️ Failed to parse AI response:', parseErr.message);
            await markAnalyzed(db, decline.id);
            return;
        }

        console.log(`[RuleLearner] 🎯 AI Analysis:`, {
            should_create: analysis.should_create_rule,
            confidence: analysis.confidence,
            type: analysis.rule_type,
            reasoning: analysis.reasoning?.substring(0, 100)
        });

        // Only create rule if confident
        if (analysis.should_create_rule && analysis.confidence >= 0.7) {
            await createSuggestedRule(db, decline, analysis);
        } else {
            console.log(`[RuleLearner] ⏭️ Skipping - confidence too low or no rule needed`);
        }

        // Mark as analyzed
        await markAnalyzed(db, decline.id);

    } catch (err) {
        console.error(`[RuleLearner] ❌ Error analyzing decline:`, err.message);
        // Still mark as analyzed to avoid infinite retries
        await markAnalyzed(db, decline.id);
    }
}

async function createSuggestedRule(db, decline, analysis) {
    try {
        // Check for duplicate rule
        const duplicate = await db.query(`
            SELECT id FROM lender_rules
            WHERE LOWER(lender_name) LIKE LOWER($1)
              AND rule_type = $2
              AND (industry = $3 OR ($3 IS NULL AND industry IS NULL))
              AND (state = $4 OR ($4 IS NULL AND state IS NULL))
        `, [
            `%${decline.lender_name.split(' ')[0]}%`,
            analysis.rule_type,
            analysis.industry,
            analysis.state
        ]);

        if (duplicate.rows.length > 0) {
            console.log(`[RuleLearner] ⚠️ Similar rule already exists, skipping`);
            return;
        }

        // Get lender_id if we can match
        const lenderMatch = await db.query(`
            SELECT id FROM lenders
            WHERE LOWER(name) LIKE LOWER($1)
            LIMIT 1
        `, [`%${decline.lender_name.split(' ')[0]}%`]);

        const lenderId = lenderMatch.rows.length > 0 ? lenderMatch.rows[0].id : null;

        // Insert suggested rule
        await db.query(`
            INSERT INTO lender_rules (
                id, lender_id, lender_name, rule_type, industry, state,
                condition_field, condition_operator, condition_value,
                decline_message, source, is_active, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'ai_suggested', FALSE, NOW())
        `, [
            uuidv4(),
            lenderId,
            decline.lender_name,
            analysis.rule_type,
            analysis.industry || null,
            analysis.state || null,
            analysis.condition_field || null,
            analysis.condition_operator || null,
            analysis.condition_value || null,
            analysis.decline_message
        ]);

        console.log(`[RuleLearner] ✅ Created suggested rule: ${decline.lender_name} - ${analysis.rule_type}`);
        console.log(`[RuleLearner] 💡 Reason: ${analysis.decline_message}`);

    } catch (err) {
        console.error(`[RuleLearner] ❌ Error creating rule:`, err.message);
    }
}

async function markAnalyzed(db, submissionId) {
    await db.query(`
        UPDATE lender_submissions
        SET rule_analyzed = TRUE
        WHERE id = $1
    `, [submissionId]);
}

// Manual trigger for testing
async function analyzeDeclineById(submissionId) {
    const db = getDatabase();

    const result = await db.query(`
        SELECT
            ls.id,
            ls.lender_name,
            ls.decline_reason,
            ls.raw_email_body,
            ls.conversation_id,
            c.business_name,
            c.industry,
            c.us_state,
            c.monthly_revenue,
            c.fico_score,
            c.time_in_business
        FROM lender_submissions ls
        LEFT JOIN conversations c ON ls.conversation_id = c.id
        WHERE ls.id = $1
    `, [submissionId]);

    if (result.rows.length === 0) {
        return { error: 'Submission not found' };
    }

    await analyzeDecline(db, result.rows[0]);
    return { success: true };
}

// Get pending suggested rules for approval
async function getSuggestedRules() {
    const db = getDatabase();

    const result = await db.query(`
        SELECT * FROM lender_rules
        WHERE source = 'ai_suggested' AND is_active = FALSE
        ORDER BY created_at DESC
    `);

    return result.rows;
}

// Approve a suggested rule
async function approveRule(ruleId) {
    const db = getDatabase();

    await db.query(`
        UPDATE lender_rules
        SET is_active = TRUE, source = 'ai_applied'
        WHERE id = $1
    `, [ruleId]);

    return { success: true };
}

// Reject/delete a suggested rule
async function rejectRule(ruleId) {
    const db = getDatabase();

    await db.query(`
        DELETE FROM lender_rules WHERE id = $1
    `, [ruleId]);

    return { success: true };
}

module.exports = {
    startRuleLearner,
    analyzeDeclines,
    analyzeDeclineById,
    getSuggestedRules,
    approveRule,
    rejectRule
};
