// backend/services/commanderService.js
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { getDatabase } = require('./database');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const commander = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

// ==========================================
// HELPER FUNCTIONS (The "Calculator")
// ==========================================

function calculateWithholding(positions, revenue) {
    let totalWithhold = 0.0;
    const breakdown = [];

    for (const pos of positions) {
        if (pos.status === 'active') {
            const dailyRate = pos.frequency === 'weekly' ? pos.amount / 5 : pos.amount;
            const monthlyPayment = dailyRate * 21;
            const withholdPct = (monthlyPayment / revenue) * 100;
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
    // Parse "30-60 days" or "12-20 weeks"
    const match = rangeStr.match(/(\d+)-(\d+)\s+(days|weeks)/);
    if (match) {
        return { min: parseInt(match[1]), max: parseInt(match[2]), unit: match[3] };
    }
    return null;
}

function generateScenariosFromGuidance(guidance, currentWithholdPct, revenue, lastPosition) {
    if (!guidance) return null;

    const isDaily = guidance.paymentFrequency === 'daily';
    const termUnit = isDaily ? 'days' : 'weeks';

    // Approved Terms Logic
    const weeklyTerms = [4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44, 46, 48, 50, 52];
    const dailyTerms = [30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 100, 110, 120, 130, 140, 150, 160, 180];
    const approvedTerms = isDaily ? dailyTerms : weeklyTerms;
    const factor = 1.49; // Standard base factor

    const generateTierScenarios = (tierName, targetWithholdAddition, customGuidance = null) => {
        const guidanceToUse = customGuidance || guidance;
        const termRange = parseTermRange(guidanceToUse.termRanges[tierName]);
        const amountRange = guidanceToUse.amountRanges[tierName];

        if (!termRange || !amountRange) return [];

        const scenarios = [];
        const validTerms = approvedTerms.filter(t => t >= termRange.min && t <= termRange.max);

        // --- LAST POSITION CAP LOGIC ---
        let maxAmount = amountRange.max;
        let maxTerm = Math.max(...validTerms);

        if (lastPosition) {
            maxAmount = Math.min(maxAmount, lastPosition.funding);
            // 50% Rule logic
            let lastPositionMaxTerm = lastPosition.term * 0.5;
            if (lastPosition.termUnit !== termUnit) {
                if (lastPosition.termUnit === 'weeks' && termUnit === 'days') lastPositionMaxTerm *= 5;
                else if (lastPosition.termUnit === 'days' && termUnit === 'weeks') lastPositionMaxTerm /= 5;
            }
            maxTerm = Math.min(maxTerm, Math.floor(lastPositionMaxTerm));
        }

        const finalValidTerms = validTerms.filter(t => t <= maxTerm);

        // Generate Scenarios
        for (let amount = amountRange.min; amount <= maxAmount; amount += 5000) {
            for (const term of finalValidTerms) {
                const totalPayback = amount * factor;
                const payment = totalPayback / term;
                const monthlyPayment = isDaily ? payment * 21 : payment * 4.33;
                const actualWithholdAddition = (monthlyPayment / revenue) * 100;

                // Only keep if within 3% tolerance of target
                if (Math.abs(actualWithholdAddition - targetWithholdAddition) <= 3) {
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

        // Sort closest to target withholding
        scenarios.sort((a, b) => Math.abs(a.withholdAddition - targetWithholdAddition) - Math.abs(b.withholdAddition - targetWithholdAddition));
        return scenarios.slice(0, 4); // Top 4
    };

    // Run generations
    const recWithhold = guidance.recommendedWithholdingAddition;
    const conservative = generateTierScenarios('conservative', recWithhold);
    const moderate = generateTierScenarios('moderate', recWithhold);
    const aggressive = generateTierScenarios('aggressive', recWithhold);

    // Best Case Logic
    let bestCase = [];
    if (guidance.bestCaseGuidance) {
        const bestWithhold = guidance.bestCaseGuidance.withholdingAddition;
        const bcCon = generateTierScenarios('conservative', bestWithhold, guidance.bestCaseGuidance);
        const bcMod = generateTierScenarios('moderate', bestWithhold, guidance.bestCaseGuidance);
        const bcAgg = generateTierScenarios('aggressive', bestWithhold, guidance.bestCaseGuidance);
        bestCase = [...bcCon, ...bcMod, ...bcAgg].sort((a, b) => Math.abs(a.withholdAddition - bestWithhold) - Math.abs(b.withholdAddition - bestWithhold)).slice(0, 6);
    }

    // Reasoning Helper
    const addReasoning = (list, tier, target) => list.map(s => ({
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

        conservative: addReasoning(conservative, 'Conservative', recWithhold),
        moderate: addReasoning(moderate, 'Moderate', recWithhold),
        aggressive: addReasoning(aggressive, 'Aggressive', recWithhold),
        bestCase: addReasoning(bestCase, 'Best Case', 10),
        considerations: (guidance.riskConsiderations || []).map(p => ({ category: "Risk", points: [p] }))
    };
}

function analyzeLastPosition(deposit, payment, frequency) {
    if (!deposit || !payment) return { scenarios: [] };

    // Simple reverse engineer for "Last Position Analysis" display
    // Logic from python script simplified for brevity
    const depositAmt = deposit.amount;
    const scenarios = [];

    // Placeholder if not fully ported, but the Main Loop below handles the crucial parts

    return { scenarios: [] };
}


// ==========================================
// MAIN FUNCTIONS
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

// MAIN STRATEGY FUNCTION
async function analyzeAndStrategize(conversationId) {
    const db = getDatabase();
    console.log(`COMMANDER: Analyzing lead ${conversationId}...`);

    try {
        // 1. Fetch Data
        const fcsRes = await db.query(`SELECT * FROM fcs_analyses WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 1`, [conversationId]);

        if (!fcsRes.rows[0]) {
            console.log('COMMANDER: No FCS data yet');
            return null;
        }

        const fcs = fcsRes.rows[0];
        const fcsReport = fcs.fcs_report || "No text report available.";

        // 2. Load Prompt
        const template = loadPrompt('strategy_analysis.md');
        if (!template) return null;

        const prompt = injectVariables(template, {
            fcs_report: fcsReport
        });

        // 3. Run AI
        const result = await commander.generateContent(prompt);
        let responseText = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        const data = JSON.parse(responseText);

        // 4. RUN THE CALCULATOR (Post-Processing)

        // 4a. Calculate Withholding
        const activePositions = (data.mcaPositions || []).filter(p => p.status === 'active' || p.status === 'Active');
        const withholdingData = calculateWithholding(activePositions, data.avgRevenue);

        // 4b. Prepare Last Position Data for Scenarios
        let lastPositionForScenarios = null;
        if (data.lastPositionAnalysis && data.lastPositionAnalysis.scenarios && data.lastPositionAnalysis.scenarios.length > 0) {
            const mostLikely = data.lastPositionAnalysis.scenarios[0];
            lastPositionForScenarios = {
                funding: mostLikely.originalFunding,
                term: mostLikely.term,
                termUnit: mostLikely.termUnit
            };
        }

        // 4c. Generate Next Position Scenarios (The Table Data)
        let nextPositionScenarios = null;
        if (data.nextPositionGuidance) {
            nextPositionScenarios = generateScenariosFromGuidance(
                data.nextPositionGuidance,
                withholdingData.totalWithhold,
                data.avgRevenue,
                lastPositionForScenarios
            );
        }

        // 5. Construct Final Game Plan Object
        const gamePlan = {
            businessOverview: {
                name: data.businessName,
                industry: data.industry,
                state: data.state,
                currentPositions: data.currentPositionCount,
                nextPosition: data.nextPosition,
                avgRevenue: data.avgRevenue,
                avgBankBalance: data.avgBankBalance,
                negativeDays: data.negativeDays
            },
            withholding: withholdingData,
            revenueTrend: data.revenueTrend,
            lastPositionAnalysis: data.lastPositionAnalysis,
            nextPositionScenarios: nextPositionScenarios,

            // Standard fields for the Dashboard list view
            lead_grade: data.avgRevenue > 40000 ? "A" : (data.avgRevenue > 25000 ? "B" : "C"),
            strategy_type: data.revenueTrend?.direction === 'upward' ? "PURSUE_HARD" : "STANDARD",
            offer_range: {
                min: nextPositionScenarios?.conservative?.[0]?.funding || 0,
                max: nextPositionScenarios?.aggressive?.[0]?.funding || 0
            }
        };

        console.log(`COMMANDER VERDICT:`);
        console.log(`   Grade: ${gamePlan.lead_grade}`);
        console.log(`   Strategy: ${gamePlan.strategy_type}`);
        console.log(`   Offer Range: ${gamePlan.offer_range.min.toLocaleString()} - ${gamePlan.offer_range.max.toLocaleString()}`);

        // 6. Save to DB
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

        // 7. Update State
        let newState = 'STRATEGIZED';
        if (gamePlan.strategy_type === 'DEAD') newState = 'DEAD';
        if (gamePlan.strategy_type === 'PURSUE_HARD') newState = 'HOT_LEAD';

        await db.query(`UPDATE conversations SET state = $1 WHERE id = $2`, [newState, conversationId]);

        return gamePlan;

    } catch (err) {
        console.error('COMMANDER ERROR:', err.message);
        return null;
    }
}

// GENERATE OFFER - Called when lead says "ok let's see what you got"
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

        console.log(`OFFER GENERATED: ${offer.offer_amount.toLocaleString()} @ ${offer.factor_rate}`);

        // Save offer to strategy table
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

// RE-STRATEGIZE - Called when situation changes
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
