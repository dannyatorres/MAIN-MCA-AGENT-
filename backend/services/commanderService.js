// backend/services/commanderService.js
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { getDatabase } = require('./database');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const commander = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

// ==========================================
// HELPER FUNCTIONS
// ==========================================

function calculateWithholding(positions, revenue) {
    let totalWithhold = 0.0;
    const breakdown = [];

    for (const pos of positions) {
        if (pos.status === 'active' || pos.status === 'Active') {
            const dailyRate = pos.frequency === 'weekly' ? pos.amount / 5 : pos.amount;
            const monthlyPayment = dailyRate * 21;
            const withholdPct = revenue > 0 ? (monthlyPayment / revenue) * 100 : 0;
            totalWithhold += withholdPct;

            breakdown.push({
                lender: pos.lender,
                payment: pos.amount,
                frequency: pos.frequency,
                dailyRate: Math.round(dailyRate * 100) / 100,
                monthlyPayment: Math.round(monthlyPayment * 100) / 100,
                withholdPct: Math.round(withholdPct * 100) / 100
            });
        }
    }

    return {
        totalWithhold: Math.round(totalWithhold * 100) / 100,
        breakdown: breakdown
    };
}

function parseTermRange(rangeStr) {
    if (!rangeStr) return null;
    const match = rangeStr.match(/(\d+)-(\d+)\s+(days|weeks)/);
    if (match) {
        return { min: parseInt(match[1]), max: parseInt(match[2]), unit: match[3] };
    }
    return null;
}

function generateScenariosFromGuidance(guidance, currentWithholdPct, revenue, lastPosition) {
    if (!guidance || !revenue || revenue <= 0) return null;

    const isDaily = guidance.paymentFrequency === 'daily';
    const termUnit = isDaily ? 'days' : 'weeks';

    const weeklyTerms = [4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44, 46, 48, 50, 52];
    const dailyTerms = [30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 100, 110, 120, 130, 140, 150, 160, 180];
    const approvedTerms = isDaily ? dailyTerms : weeklyTerms;
    const factor = 1.49;

    const generateTierScenarios = (tierName, targetWithholdAddition, customGuidance = null) => {
        const guidanceToUse = customGuidance || guidance;

        if (!guidanceToUse.termRanges || !guidanceToUse.amountRanges) return [];

        const termRange = parseTermRange(guidanceToUse.termRanges[tierName]);
        const amountRange = guidanceToUse.amountRanges[tierName];

        if (!termRange || !amountRange) return [];

        const scenarios = [];
        const validTerms = approvedTerms.filter(t => t >= termRange.min && t <= termRange.max);

        let maxAmount = amountRange.max || 50000;
        let maxTerm = validTerms.length > 0 ? Math.max(...validTerms) : 52;

        if (lastPosition) {
            maxAmount = Math.min(maxAmount, lastPosition.funding || maxAmount);
            let lastPositionMaxTerm = (lastPosition.term || 52) * 0.5;
            if (lastPosition.termUnit !== termUnit) {
                if (lastPosition.termUnit === 'weeks' && termUnit === 'days') lastPositionMaxTerm *= 5;
                else if (lastPosition.termUnit === 'days' && termUnit === 'weeks') lastPositionMaxTerm /= 5;
            }
            maxTerm = Math.min(maxTerm, Math.floor(lastPositionMaxTerm));
        }

        const finalValidTerms = validTerms.filter(t => t <= maxTerm);
        if (finalValidTerms.length === 0) return [];

        const minAmount = amountRange.min || 5000;

        for (let amount = minAmount; amount <= maxAmount; amount += 5000) {
            for (const term of finalValidTerms) {
                const totalPayback = amount * factor;
                const payment = totalPayback / term;
                const monthlyPayment = isDaily ? payment * 21 : payment * 4.33;
                const actualWithholdAddition = (monthlyPayment / revenue) * 100;

                // Loosened tolerance to 15% to ensure scenarios generate
                if (Math.abs(actualWithholdAddition - targetWithholdAddition) <= 15) {
                    scenarios.push({
                        funding: amount,
                        term: term,
                        termUnit: termUnit,
                        payment: Math.round(payment),
                        frequency: guidance.paymentFrequency,
                        factor: factor.toFixed(2),
                        totalPayback: Math.round(totalPayback),
                        withholdAddition: Math.round(actualWithholdAddition * 10) / 10,
                        newTotalWithhold: Math.round((currentWithholdPct + actualWithholdAddition) * 10) / 10
                    });
                }
            }
        }

        scenarios.sort((a, b) => Math.abs(a.withholdAddition - targetWithholdAddition) - Math.abs(b.withholdAddition - targetWithholdAddition));
        return scenarios.slice(0, 4);
    };

    const recWithhold = guidance.recommendedWithholdingAddition || 10;
    const conservative = generateTierScenarios('conservative', recWithhold);
    const moderate = generateTierScenarios('moderate', recWithhold);
    const aggressive = generateTierScenarios('aggressive', recWithhold);

    let bestCase = [];
    if (guidance.bestCaseGuidance) {
        const bestWithhold = guidance.bestCaseGuidance.withholdingAddition || 10;
        const bcCon = generateTierScenarios('conservative', bestWithhold, guidance.bestCaseGuidance);
        const bcMod = generateTierScenarios('moderate', bestWithhold, guidance.bestCaseGuidance);
        const bcAgg = generateTierScenarios('aggressive', bestWithhold, guidance.bestCaseGuidance);
        bestCase = [...bcCon, ...bcMod, ...bcAgg].sort((a, b) =>
            Math.abs(a.withholdAddition - bestWithhold) - Math.abs(b.withholdAddition - bestWithhold)
        ).slice(0, 6);
    }

    const addReasoning = (list, tier) => list.map(s => ({
        ...s,
        reasoning: `${tier} - ${s.funding.toLocaleString()} @ ${s.term} ${s.termUnit}. Adds ${s.withholdAddition}% withholding.`
    }));

    return {
        guidance: {
            recommendedWithholdingAddition: guidance.recommendedWithholdingAddition,
            reasoning: guidance.reasoning,
            paymentFrequency: guidance.paymentFrequency,
            frequencyReasoning: guidance.frequencyReasoning
        },
        lastPosition: lastPosition,
        currentWithholding: currentWithholdPct,
        targetAddition: recWithhold,
        targetTotal: currentWithholdPct + recWithhold,
        paymentCapacity: Math.round(((recWithhold / 100) * revenue / (isDaily ? 21 : 4.33)) * 100) / 100,

        conservative: addReasoning(conservative, 'Conservative'),
        moderate: addReasoning(moderate, 'Moderate'),
        aggressive: addReasoning(aggressive, 'Aggressive'),
        bestCase: addReasoning(bestCase, 'Best Case'),
        considerations: (guidance.riskConsiderations || []).map(p => ({ category: "Risk", points: [p] }))
    };
}

// ==========================================
// PROMPT LOADING
// ==========================================

function loadPrompt(filename) {
    try {
        const promptPath = path.join(__dirname, '../prompts/commander', filename);
        if (fs.existsSync(promptPath)) {
            console.log(`Commander loaded: ${filename}`);
            return fs.readFileSync(promptPath, 'utf8');
        } else {
            console.error(`Missing prompt file: ${filename}`);
            return null;
        }
    } catch (err) {
        console.error(`Error loading ${filename}:`, err.message);
        return null;
    }
}

function injectVariables(template, variables) {
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
        const regex = new RegExp(`{{${key}}}`, 'g');
        result = result.replace(regex, value ?? 'Unknown');
    }
    return result;
}

// ==========================================
// MAIN STRATEGY FUNCTION
// ==========================================

async function analyzeAndStrategize(conversationId) {
    const db = getDatabase();
    console.log(`COMMANDER: Analyzing lead ${conversationId}...`);

    try {
        // 1. Fetch FCS Data
        const fcsRes = await db.query(`
            SELECT * FROM fcs_analyses
            WHERE conversation_id = $1
            ORDER BY created_at DESC LIMIT 1
        `, [conversationId]);

        if (!fcsRes.rows[0]) {
            console.log('COMMANDER: No FCS data yet');
            return null;
        }

        const fcs = fcsRes.rows[0];
        const fcsReport = fcs.fcs_report || "No text report available.";

        // 1b. Fetch lead info for industry/state
        const leadRes = await db.query(`SELECT industry_type, us_state FROM conversations WHERE id = $1`, [conversationId]);
        const lead = leadRes.rows[0] || {};
        const leadIndustry = lead.industry_type || fcs.industry || null;
        const leadState = lead.us_state || fcs.state || null;

        // 1c. Query lender_rules for blocked lenders (THE FIX!)
        let blockedLendersText = '';
        if (leadIndustry || leadState) {
            const rulesRes = await db.query(`
                SELECT DISTINCT lender_name, rule_type, industry, state, decline_message
                FROM lender_rules
                WHERE is_active = TRUE
                  AND (
                    (rule_type = 'industry_block' AND LOWER(industry) = LOWER($1))
                    OR (rule_type = 'state_block' AND UPPER(state) = UPPER($2))
                  )
            `, [leadIndustry, leadState]);

            if (rulesRes.rows.length > 0) {
                blockedLendersText = '\n\n**LENDERS TO AVOID (Based on learned rules):**\n';
                for (const rule of rulesRes.rows) {
                    blockedLendersText += `- ${rule.lender_name}: ${rule.decline_message || rule.rule_type}\n`;
                }
                console.log(`COMMANDER: Found ${rulesRes.rows.length} blocked lenders for this lead`);
            }
        }

        // 2. Load Prompt
        const template = loadPrompt('strategy_analysis.md');
        if (!template) return null;

        const prompt = injectVariables(template, {
            fcs_report: fcsReport + blockedLendersText
        });

        // 3. Run AI
        console.log('COMMANDER: Calling Gemini API...');
        const result = await commander.generateContent(prompt);
        let responseText = result.response.text()
            .replace(/```json/g, '')
            .replace(/```/g, '')
            .trim();

        const data = JSON.parse(responseText);

        // Debug logging
        console.log('=== GEMINI PARSED DATA ===');
        console.log('avgRevenue:', data.avgRevenue);
        console.log('currentPositionCount:', data.currentPositionCount);
        console.log('mcaPositions:', data.mcaPositions?.length || 0);
        console.log('==========================');

        // 4. Calculate Withholding
        const activePositions = (data.mcaPositions || []).filter(p =>
            p.status === 'active' || p.status === 'Active'
        );
        const withholdingData = calculateWithholding(activePositions, data.avgRevenue || 0);

        // 5. Prepare Last Position Data
        let lastPositionForScenarios = null;
        if (data.lastPositionAnalysis?.scenarios?.length > 0) {
            const mostLikely = data.lastPositionAnalysis.scenarios[0];
            lastPositionForScenarios = {
                funding: mostLikely.originalFunding || mostLikely.funding,
                term: mostLikely.term,
                termUnit: mostLikely.termUnit
            };
        }

        // 6. Generate Scenarios
        let nextPositionScenarios = null;
        if (data.nextPositionGuidance) {
            nextPositionScenarios = generateScenariosFromGuidance(
                data.nextPositionGuidance,
                withholdingData.totalWithhold,
                data.avgRevenue || 0,
                lastPositionForScenarios
            );

            console.log('=== SCENARIO GENERATION ===');
            console.log('Conservative:', nextPositionScenarios?.conservative?.length || 0);
            console.log('Moderate:', nextPositionScenarios?.moderate?.length || 0);
            console.log('Aggressive:', nextPositionScenarios?.aggressive?.length || 0);
            console.log('===========================');
        }

        // 7. Build Game Plan Object - Pass through AI response + add computed fields
        const leadGrade = data.lead_grade || (data.avgRevenue > 40000 ? "A" : (data.avgRevenue > 25000 ? "B" : "C"));
        const strategyType = data.strategy_type || (data.revenueTrend?.direction === 'upward' ? "PURSUE_HARD" : "STANDARD");

        // Build gamePlan - pass through all AI fields + add computed data
        const gamePlan = {
            // Pass through all AI-generated fields
            ...data,

            // Override/ensure these are set correctly
            lead_grade: leadGrade,
            strategy_type: strategyType,

            // Add computed withholding data
            withholding: withholdingData,

            // Add generated scenarios
            nextPositionScenarios: nextPositionScenarios,

            // Ensure offer_range exists
            offer_range: data.offer_range || {
                min: nextPositionScenarios?.conservative?.[0]?.funding || 0,
                max: nextPositionScenarios?.aggressive?.[0]?.funding || nextPositionScenarios?.moderate?.[0]?.funding || 0
            },

            // Legacy businessOverview for backward compatibility
            businessOverview: {
                name: data.businessName || data.business_name,
                industry: data.industry,
                state: data.state,
                currentPositions: data.stacking_assessment?.current_positions || data.currentPositionCount || 0,
                nextPosition: data.stacking_assessment?.next_position_number || data.nextPosition,
                avgRevenue: data.revenue_trend?.floor_month?.amount || data.avgRevenue || 0,
                avgBankBalance: data.avgBankBalance || 0,
                negativeDays: data.negativeDays
            }
        };

        // Extract recommended values for analytics (from AI or computed)
        const recommendedFunding = data.recommended_funding || gamePlan.offer_range.max || 0;
        const recommendedTerm = data.recommended_term || nextPositionScenarios?.moderate?.[0]?.term || 24;
        const recommendedTermUnit = data.recommended_term_unit || nextPositionScenarios?.moderate?.[0]?.termUnit || 'weeks';
        const recommendedPayment = data.recommended_payment || nextPositionScenarios?.moderate?.[0]?.payment || 0;

        console.log(`COMMANDER VERDICT:`);
        console.log(`   Grade: ${gamePlan.lead_grade}`);
        console.log(`   Strategy: ${gamePlan.strategy_type}`);
        console.log(`   Offer Range: ${gamePlan.offer_range.min.toLocaleString()} - ${gamePlan.offer_range.max.toLocaleString()}`);

        // 8. SAVE TO DATABASE - Structured Data
        const strategyId = uuidv4();

        // Get lead offer for recommended fields
        const leadOffer = nextPositionScenarios?.moderate?.[0] ||
                          nextPositionScenarios?.conservative?.[0] ||
                          nextPositionScenarios?.aggressive?.[0];

        await db.query(`
            INSERT INTO lead_strategy (
                id, conversation_id, fcs_analysis_id, lead_grade, strategy_type, game_plan,
                raw_ai_response, avg_revenue, avg_balance, current_positions, total_withholding,
                recommended_funding_min, recommended_funding_max, recommended_payment,
                recommended_term, recommended_term_unit, analysis_version
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
            ON CONFLICT (conversation_id)
            DO UPDATE SET
                fcs_analysis_id = $3,
                lead_grade = $4,
                strategy_type = $5,
                game_plan = $6,
                raw_ai_response = $7,
                avg_revenue = $8,
                avg_balance = $9,
                current_positions = $10,
                total_withholding = $11,
                recommended_funding_min = $12,
                recommended_funding_max = $13,
                recommended_payment = $14,
                recommended_term = $15,
                recommended_term_unit = $16,
                updated_at = NOW()
            RETURNING id
        `, [
            strategyId,
            conversationId,
            fcs.id,
            gamePlan.lead_grade,
            gamePlan.strategy_type,
            JSON.stringify(gamePlan),
            JSON.stringify(data),
            data.revenue_trend?.floor_month?.amount || data.avgRevenue || 0,
            data.avgBankBalance || 0,
            data.stacking_assessment?.current_positions || data.currentPositionCount || 0,
            data.withholding_analysis?.current_withholding_pct || withholdingData.totalWithhold,
            gamePlan.offer_range.min,
            recommendedFunding,
            recommendedPayment,
            recommendedTerm,
            recommendedTermUnit,
            'v1'
        ]);

        // 9. Save Individual Scenarios
        // First delete old scenarios for this conversation
        await db.query(`DELETE FROM strategy_scenarios WHERE conversation_id = $1`, [conversationId]);

        const allScenarios = [
            ...(nextPositionScenarios?.conservative || []).map(s => ({...s, tier: 'conservative'})),
            ...(nextPositionScenarios?.moderate || []).map(s => ({...s, tier: 'moderate'})),
            ...(nextPositionScenarios?.aggressive || []).map(s => ({...s, tier: 'aggressive'})),
            ...(nextPositionScenarios?.bestCase || []).map(s => ({...s, tier: 'best_case'}))
        ];

        for (const scenario of allScenarios.slice(0, 12)) {
            await db.query(`
                INSERT INTO strategy_scenarios (
                    strategy_id, conversation_id, tier, funding_amount, term, term_unit,
                    payment_amount, payment_frequency, factor_rate, withhold_addition,
                    total_withhold, reasoning
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            `, [
                strategyId,
                conversationId,
                scenario.tier,
                scenario.funding,
                scenario.term,
                scenario.termUnit,
                scenario.payment,
                scenario.frequency,
                parseFloat(scenario.factor),
                scenario.withholdAddition,
                scenario.newTotalWithhold,
                scenario.reasoning
            ]);
        }

        console.log(`✅ Strategy saved with ${allScenarios.length} scenarios`);

        // 10. Update Conversation State
        let newState = 'STRATEGIZED';
        if (gamePlan.strategy_type === 'DEAD') newState = 'DEAD';
        if (gamePlan.strategy_type === 'PURSUE_HARD') newState = 'HOT_LEAD';

        await db.query(`UPDATE conversations SET state = $1 WHERE id = $2`, [newState, conversationId]);

        return gamePlan;

    } catch (err) {
        console.error('COMMANDER ERROR:', err.message);
        console.error(err.stack);
        return null;
    }
}

// ==========================================
// GENERATE OFFER
// ==========================================

async function generateOffer(conversationId) {
    const db = getDatabase();
    console.log(`COMMANDER: Generating offer for ${conversationId}...`);

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
            console.log('Missing strategy or FCS data');
            return null;
        }

        let gamePlan = strategyRes.rows[0].game_plan;
        if (typeof gamePlan === 'string') {
            gamePlan = JSON.parse(gamePlan);
        }

        const fcs = fcsRes.rows[0];
        const lead = leadRes.rows[0];

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

        console.log(`OFFER GENERATED: ${offer.offer_amount.toLocaleString()} @ ${offer.factor_rate}`);

        await db.query(`
            UPDATE lead_strategy
            SET offer_amount = $1, offer_generated_at = NOW(), game_plan = game_plan || $2
            WHERE conversation_id = $3
        `, [offer.offer_amount, JSON.stringify({ offer_details: offer }), conversationId]);

        await db.query(`UPDATE conversations SET state = 'OFFER_READY' WHERE id = $1`, [conversationId]);

        return offer;

    } catch (err) {
        console.error('OFFER GENERATION ERROR:', err.message);
        return null;
    }
}

// ==========================================
// RE-STRATEGIZE
// ==========================================

async function reStrategize(conversationId, newContext) {
    const db = getDatabase();
    console.log(`COMMANDER: Re-evaluating strategy for ${conversationId}...`);

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
            console.log(`STRATEGY UPDATED: ${update.reason}`);

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

        console.log(`Strategy unchanged: ${update.reason}`);
        return currentPlan;

    } catch (err) {
        console.error('RE-STRATEGIZE ERROR:', err.message);
        return null;
    }
}

module.exports = {
    analyzeAndStrategize,
    generateOffer,
    reStrategize
};
