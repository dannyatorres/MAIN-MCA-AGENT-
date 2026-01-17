// qualification.js - Lender Qualification Route
const express = require('express');
const router = express.Router();
const Anthropic = require('@anthropic-ai/sdk');

// Adjust this import to match your database setup
const { getDatabase } = require('../services/database');
const { predictSuccessForAll } = require('../services/successPredictor');

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
});

// ============================================
// AI INDUSTRY CLASSIFICATION
// ============================================

async function classifyIndustry(inputIndustry) {
    const input = inputIndustry.toLowerCase().trim();
    console.log(`\n🔍 ========== AI CLASSIFICATION ==========`);
    console.log(`📥 Input: "${input}"`);

    const prompt = `Classify this business industry into ONE canonical category.

Input: "${inputIndustry}"

Categories:
pawn, trucking, construction, auto sales, auto repair, real estate, finance, cannabis, vape, adult entertainment, gambling, restaurant, retail, medical, staffing, law firm, salon, gym, daycare, church, non-profit, gas station, towing, moving, landscaping, hvac, plumbing, electrical, roofing, cleaning, food truck, bar, hotel, manufacturing, wholesale, ecommerce, technology, consulting, marketing, security, parking, transportation, automotive services, other

Rules:
1. Pick the MOST SPECIFIC category that fits
2. "other" is valid - use it when nothing fits well
3. Do NOT force unrelated matches (e.g., "valet parking" is NOT "real estate")
4. Service businesses without a specific category → "other"
5. TRADES ARE NOT CONSTRUCTION - hvac, plumbing, electrical, roofing, flooring, and similar skilled trades must be classified as their specific trade category, NEVER as "construction"
6. "construction" is ONLY for general contractors, builders, framing, demolition, or companies with "construction" in the name

Respond with ONLY the category name, nothing else.`;

    try {
        console.log(`🤖 Calling Claude Haiku 4.5...`);
        const startTime = Date.now();

        const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-5-20250929',
            max_tokens: 50,
            messages: [{ role: 'user', content: prompt }]
        });

        const endTime = Date.now();
        const result = response.content[0].text.trim().toLowerCase();

        console.log(`📤 AI Response: "${response.content[0].text}"`);
        console.log(`🎯 Cleaned result: "${result}"`);
        console.log(`⏱️  Response time: ${endTime - startTime}ms`);
        console.log(`📊 Token usage:`);
        console.log(`   - Input tokens: ${response.usage.input_tokens}`);
        console.log(`   - Output tokens: ${response.usage.output_tokens}`);
        console.log(`   - Total tokens: ${response.usage.input_tokens + response.usage.output_tokens}`);
        console.log(`💰 Estimated cost: $${((response.usage.input_tokens * 0.00025 + response.usage.output_tokens * 0.00125) / 1000).toFixed(6)}`);
        console.log(`🔍 ==========================================\n`);

        return result;
    } catch (error) {
        console.error(`❌ AI classification error:`, error.message);
        console.error(`❌ Full error:`, error);
        console.log(`🔍 ==========================================\n`);
        return input;
    }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function normalizeState(state) {
    if (!state) return '';
    const stateMap = {
        'alabama': 'al', 'alaska': 'ak', 'arizona': 'az', 'arkansas': 'ar',
        'california': 'ca', 'colorado': 'co', 'connecticut': 'ct', 'delaware': 'de',
        'florida': 'fl', 'georgia': 'ga', 'hawaii': 'hi', 'idaho': 'id',
        'illinois': 'il', 'indiana': 'in', 'iowa': 'ia', 'kansas': 'ks',
        'kentucky': 'ky', 'louisiana': 'la', 'maine': 'me', 'maryland': 'md',
        'massachusetts': 'ma', 'michigan': 'mi', 'minnesota': 'mn', 'mississippi': 'ms',
        'missouri': 'mo', 'montana': 'mt', 'nebraska': 'ne', 'nevada': 'nv',
        'new hampshire': 'nh', 'new jersey': 'nj', 'new mexico': 'nm', 'new york': 'ny',
        'north carolina': 'nc', 'north dakota': 'nd', 'ohio': 'oh', 'oklahoma': 'ok',
        'oregon': 'or', 'pennsylvania': 'pa', 'rhode island': 'ri', 'south carolina': 'sc',
        'south dakota': 'sd', 'tennessee': 'tn', 'texas': 'tx', 'utah': 'ut',
        'vermont': 'vt', 'virginia': 'va', 'washington': 'wa', 'west virginia': 'wv',
        'wisconsin': 'wi', 'wyoming': 'wy', 'district of columbia': 'dc'
    };
    const lower = state.toLowerCase().trim();
    return stateMap[lower] || lower;
}

function industryMatches(merchantIndustry, targetIndustry) {
    if (!merchantIndustry || !targetIndustry) return false;
    const m = merchantIndustry.toLowerCase().trim();
    const t = targetIndustry.toLowerCase().trim();
    return m.includes(t) || t.includes(m);
}

function isIndustryType(merchantIndustry, keywords) {
    const m = merchantIndustry.toLowerCase().trim();
    return keywords.some(k => m.includes(k) || k.includes(m));
}

async function getCanonicalIndustries(db, inputIndustry) {
    const input = inputIndustry.toLowerCase().trim();
    console.log(`📚 Looking up canonical industries for: "${input}"`);

    // Check for exact match first
    const result = await db.query(
        `SELECT canonical_industries FROM industry_mappings
         WHERE LOWER(input_term) = $1`,
        [input]
    );

    if (result.rows.length > 0) {
        console.log(`✅ Exact match found:`, result.rows[0].canonical_industries);
        return result.rows[0].canonical_industries;
    }

    // Check for partial match
    const partialResult = await db.query(
        `SELECT input_term, canonical_industries FROM industry_mappings
         WHERE LOWER(input_term) LIKE $1 OR $2 LIKE '%' || LOWER(input_term) || '%'
         LIMIT 1`,
        [`%${input}%`, input]
    );

    if (partialResult.rows.length > 0) {
        console.log(`✅ Partial match found: "${partialResult.rows[0].input_term}" →`, partialResult.rows[0].canonical_industries);
        return partialResult.rows[0].canonical_industries;
    }

    console.log(`⚠️ No mapping found for "${input}", using original`);
    return [input];
}

// ============================================
// CHECK FUNCTIONS (from lenders table)
// ============================================

function checkPositionRestrictions(lender, criteria) {
    const posMin = parseFloat(lender.pos_min);
    const posMax = parseFloat(lender.pos_max);

    if (isNaN(posMin) || isNaN(posMax)) {
        return 'Position - Invalid position data';
    }

    if (criteria.requestedPosition < posMin || criteria.requestedPosition > posMax) {
        return `Position - Accepts positions ${posMin}-${posMax} only`;
    }
    return null;
}

function checkStateRestrictions(lender, criteria) {
    const stateRestrictions = (lender.state_restrictions || '').toLowerCase();
    if (!stateRestrictions) return null;

    const merchantState = normalizeState(criteria.state);
    const restrictionsList = stateRestrictions.split(/[,;|\s]+/).map(s => s.trim()).filter(s => s.length > 0);

    for (const restriction of restrictionsList) {
        const restrictionNorm = normalizeState(restriction);
        if (merchantState === restrictionNorm || merchantState === restriction) {
            return `State - Not accepted in ${criteria.state}`;
        }
    }
    return null;
}

function checkIndustryRestrictions(lender, criteria, canonicalIndustries) {
    const prohibited = (lender.prohibited_industries || '').toLowerCase();
    if (!prohibited) return null;

    const prohibitedList = prohibited.split(/[,;]+/).map(i => i.trim()).filter(i => i);

    // Check ALL canonical industries against prohibited list
    for (const industry of canonicalIndustries) {
        for (const prohibitedIndustry of prohibitedList) {
            if (industryMatches(industry, prohibitedIndustry)) {
                return `Industry - ${prohibitedIndustry} not accepted`;
            }
        }
    }
    return null;
}

function checkMinimumRequirements(lender, criteria) {
    const minTib = parseFloat(lender.min_tib_months);
    if (!isNaN(minTib) && criteria.tib < minTib) {
        return `TIB - Min ${minTib} months`;
    }

    const minRevenue = parseFloat(lender.min_monthly_revenue);
    if (!isNaN(minRevenue) && criteria.monthlyRevenue < minRevenue) {
        return `Revenue - Min ${minRevenue.toLocaleString()}`;
    }

    const minFico = parseFloat(lender.min_fico);
    if (!isNaN(minFico) && criteria.fico < (minFico - 20)) {
        return `FICO - Min ${minFico} (with 20pt tolerance)`;
    }

    return null;
}

function checkMercuryBank(lender, criteria) {
    if (!criteria.hasMercuryBank) return null;

    if (lender.accepts_mercury === false) {
        return 'Bank Statements - Mercury Bank not accepted';
    }
    return null;
}

function checkNonProfit(lender, criteria) {
    if (!criteria.isNonProfit) return null;

    if (lender.accepts_nonprofit !== true) {
        return 'Non-Profit - Not accepted';
    }
    return null;
}

function checkSoleProp(lender, criteria) {
    if (!criteria.isSoleProp) return null;

    const requirements = (lender.other_requirements || '').toLowerCase();
    const prohibited = (lender.prohibited_industries || '').toLowerCase();
    const allText = requirements + ' ' + prohibited;

    if (allText.includes('no sole prop') || allText.includes('corp only') || allText.includes('sole props')) {
        return 'Sole Prop - Not accepted';
    }
    return null;
}

function checkWithholdRestrictions(lender, criteria) {
    const maxWithhold = parseFloat(lender.max_withhold);
    if (isNaN(maxWithhold) || maxWithhold === 0) return null;

    let proposedWithhold = parseFloat(String(criteria.withholding || '').replace('%', ''));
    if (isNaN(proposedWithhold)) return null;

    if (proposedWithhold > maxWithhold) {
        return `Withhold - Proposed ${proposedWithhold}% exceeds max ${maxWithhold}%`;
    }
    return null;
}

function checkBankingRequirements(lender, criteria) {
    const minDeposits = parseFloat(lender.min_deposits);
    const maxNegDays = parseFloat(lender.max_negative_days);

    if (!isNaN(minDeposits) && criteria.depositsPerMonth && criteria.depositsPerMonth < minDeposits) {
        return `Banking - Requires ${minDeposits}+ deposits per month`;
    }

    if (!isNaN(maxNegDays) && criteria.negativeDays && criteria.negativeDays > maxNegDays) {
        return `Banking - Max ${maxNegDays} negative days allowed`;
    }

    return null;
}

function checkPreferredIndustry(lender, criteria) {
    const preferredIndustries = (lender.preferred_industries || '').toLowerCase();
    if (!preferredIndustries) return false;

    const merchantIndustry = criteria.industry.toLowerCase().trim();
    const classifiedIndustry = criteria.classifiedIndustry || merchantIndustry;
    const preferredList = preferredIndustries.split(',').map(i => i.trim());

    for (const preferred of preferredList) {
        // Check both original and AI-classified industry
        if (industryMatches(merchantIndustry, preferred) ||
            industryMatches(classifiedIndustry, preferred)) {
            return true;
        }
    }
    return false;
}

// ============================================
// CHECK LENDER RULES (from lender_rules table)
// ============================================

function checkLenderRules(rules, criteria) {
    const merchantIndustry = criteria.industry.toLowerCase().trim();
    const classifiedIndustry = criteria.classifiedIndustry || merchantIndustry;
    const merchantState = normalizeState(criteria.state);

    // Industry type detection (check both original and classified)
    const isTransportation = isIndustryType(merchantIndustry, ['trucking', 'transportation', 'logistics', 'freight']) ||
                             isIndustryType(classifiedIndustry, ['trucking', 'transportation', 'logistics', 'freight']);
    const isConstruction = isIndustryType(merchantIndustry, ['construction']) ||
                           isIndustryType(classifiedIndustry, ['construction']);
    const isAutoSales = isIndustryType(merchantIndustry, ['auto sales', 'car sales', 'vehicle sales', 'auto dealer', 'car dealer']) ||
                        isIndustryType(classifiedIndustry, ['auto sales', 'car sales', 'vehicle sales', 'auto dealer', 'car dealer']);
    const isAutoRepair = isIndustryType(merchantIndustry, ['auto repair', 'auto service', 'mechanic', 'automotive repair']) ||
                         isIndustryType(classifiedIndustry, ['auto repair', 'auto service', 'mechanic', 'automotive repair']);
    const isStaffing = isIndustryType(merchantIndustry, ['staffing', 'recruiting', 'recruitment', 'employment agency']) ||
                        isIndustryType(classifiedIndustry, ['staffing', 'recruiting', 'recruitment', 'employment agency']);
    const isLandscaping = isIndustryType(merchantIndustry, ['landscaping', 'lawn care', 'landscape']) ||
                          isIndustryType(classifiedIndustry, ['landscaping', 'lawn care', 'landscape']);
    const isHVAC = isIndustryType(merchantIndustry, ['hvac', 'plumbing', 'electrical', 'flooring', 'windows']) ||
                   isIndustryType(classifiedIndustry, ['hvac', 'plumbing', 'electrical', 'flooring', 'windows']);

    for (const rule of rules) {
        if (!rule.is_active) continue;

        const ruleIndustry = (rule.industry || '').toLowerCase();
        const ruleState = (rule.state || '').toLowerCase();

        // Check if rule applies to this industry
        let industryApplies = false;
        if (ruleIndustry) {
            if (ruleIndustry === 'trucking' || ruleIndustry === 'transportation') {
                industryApplies = isTransportation;
            } else if (ruleIndustry === 'construction') {
                industryApplies = isConstruction;
            } else if (ruleIndustry === 'auto sales') {
                industryApplies = isAutoSales;
            } else if (ruleIndustry === 'auto repair') {
                industryApplies = isAutoRepair;
            } else if (ruleIndustry === 'staffing') {
                industryApplies = isStaffing;
            } else if (ruleIndustry === 'landscaping') {
                industryApplies = isLandscaping;
            } else if (['hvac', 'plumbing', 'electrical', 'flooring', 'windows'].includes(ruleIndustry)) {
                industryApplies = isHVAC || industryMatches(merchantIndustry, ruleIndustry);
            } else {
                industryApplies = industryMatches(merchantIndustry, ruleIndustry);
            }
        }

        // Handle different rule types
        switch (rule.rule_type) {
            case 'state_industry_block':
                // Block specific industry in specific state
                if (industryApplies && ruleState && merchantState === ruleState) {
                    return rule.decline_message || `${ruleIndustry} not accepted in ${ruleState.toUpperCase()}`;
                }
                break;

            case 'industry_block':
                if (industryApplies) {
                    return rule.decline_message || `${ruleIndustry} not accepted`;
                }
                break;

            case 'sole_prop_state_block':
                // Block sole props in specific state
                if (criteria.isSoleProp && ruleState && merchantState === ruleState) {
                    return rule.decline_message || `Sole props not accepted in ${ruleState.toUpperCase()}`;
                }
                break;

            case 'state_requirement':
                // State-specific requirements
                if (ruleState && merchantState === ruleState) {
                    if (rule.condition_field === 'monthly_revenue' && rule.condition_operator === 'min') {
                        if (criteria.monthlyRevenue < rule.condition_value) {
                            return rule.decline_message || `${ruleState.toUpperCase()} requires ${rule.condition_value.toLocaleString()} min revenue`;
                        }
                    }
                }
                break;

            case 'industry_requirement':
                // Industry-specific requirements
                if (industryApplies) {
                    const field = rule.condition_field;
                    const op = rule.condition_operator;
                    const value = parseFloat(rule.condition_value);

                    if (field === 'monthly_revenue' && op === 'min' && criteria.monthlyRevenue < value) {
                        return rule.decline_message;
                    }
                    if (field === 'tib' && op === 'min' && criteria.tib < value) {
                        return rule.decline_message;
                    }
                    if (field === 'fico' && op === 'min' && criteria.fico < value) {
                        return rule.decline_message;
                    }
                    if (field === 'position' && op === 'max' && criteria.requestedPosition > value) {
                        return rule.decline_message;
                    }
                    if (field === 'position' && op === 'min' && criteria.requestedPosition < value) {
                        return rule.decline_message;
                    }
                }
                break;

            case 'industry_position':
                // Industry + position combo
                if (industryApplies) {
                    const op = rule.condition_operator;
                    const value = parseFloat(rule.condition_value);

                    if (op === 'min' && criteria.requestedPosition < value) {
                        return rule.decline_message;
                    }
                    if (op === 'max' && criteria.requestedPosition > value) {
                        return rule.decline_message;
                    }
                }
                break;

            case 'position_only':
                // Position-only restriction (like "2nd position only")
                if (rule.condition_operator === 'min' && criteria.requestedPosition < rule.condition_value) {
                    return rule.decline_message;
                }
                break;

            case 'position_requirement':
                // Position-specific requirement (like "1st position needs 575 FICO")
                if (rule.condition_field === 'fico' && criteria.requestedPosition === 1) {
                    if (rule.condition_operator === 'min' && criteria.fico < rule.condition_value) {
                        return rule.decline_message;
                    }
                }
                break;
        }
    }

    return null;
}

// ============================================
// MAIN QUALIFICATION ROUTE
// ============================================

router.post('/qualify', async (req, res) => {
    try {
        const criteria = req.body;

        // Validate required fields
        if (!criteria.requestedPosition) {
            return res.status(400).json({ error: 'Missing required field: requestedPosition' });
        }

        const db = getDatabase();

        // Check for reverse consolidation mode - return only reverse lenders
        if (criteria.reverseConsolidation) {
            console.log('🔄 Reverse Consolidation mode - returning only reverse lenders');

            // Get reverse lenders (qualified)
            const reverseLendersResult = await db.query(`
                SELECT * FROM lenders
                WHERE does_reverse_consolidation = true
                ORDER BY tier, name
            `);

            // Get non-reverse lenders (non-qualified)
            const nonReverseLendersResult = await db.query(`
                SELECT name FROM lenders
                WHERE does_reverse_consolidation = false OR does_reverse_consolidation IS NULL
                ORDER BY name
            `);

            const reverseLenders = reverseLendersResult.rows.map(lender => ({
                ...lender,
                'Lender Name': lender.name,
                isPreferred: false
            }));

            const nonReverseLenders = nonReverseLendersResult.rows.map(lender => ({
                lender: lender.name,
                blockingRule: 'Does not offer reverse consolidation'
            }));

            return res.json({
                qualified: reverseLenders,
                nonQualified: nonReverseLenders,
                autoDropped: 0,
                summary: {
                    totalProcessed: reverseLenders.length + nonReverseLenders.length,
                    qualified: reverseLenders.length,
                    nonQualified: nonReverseLenders.length,
                    autoDropped: 0
                },
                criteria: criteria,
                mode: 'reverse_consolidation'
            });
        }

        // Classify industry with AI first
        let classifiedIndustry = criteria.industry ? criteria.industry.toLowerCase() : '';
        if (criteria.industry) {
            classifiedIndustry = await classifyIndustry(criteria.industry);
            console.log(`"${criteria.industry}" → AI classified as: "${classifiedIndustry}"`);
        }

        // Store both original and classified for matching
        criteria.originalIndustry = criteria.industry;
        criteria.classifiedIndustry = classifiedIndustry;

        // Get canonical industries for the input
        let canonicalIndustries = [criteria.industry ? criteria.industry.toLowerCase() : ''];
        if (criteria.industry) {
            canonicalIndustries = await getCanonicalIndustries(db, classifiedIndustry);
            // Also include the original input just in case
            canonicalIndustries.push(criteria.industry.toLowerCase());
        }

        // Log the full chain
        console.log(`\n========== INDUSTRY CLASSIFICATION ==========`);
        console.log(`Original input: "${criteria.industry}"`);
        console.log(`AI classified as: "${classifiedIndustry}"`);
        console.log(`Canonical industries:`, canonicalIndustries);
        console.log(`==============================================\n`);

        // Get all lenders
        const lendersResult = await db.query(`
            SELECT * FROM lenders
            WHERE name IS NOT NULL AND name != ''
        `);
        const lenders = lendersResult.rows;

        // Get all active rules
        const rulesResult = await db.query(`
            SELECT * FROM lender_rules WHERE is_active = true
        `);
        const allRules = rulesResult.rows;

        // Group rules by lender
        const rulesByLender = {};
        for (const rule of allRules) {
            const lenderName = (rule.lender_name || '').toLowerCase();
            if (!rulesByLender[lenderName]) {
                rulesByLender[lenderName] = [];
            }
            rulesByLender[lenderName].push(rule);
        }

        const qualifiedLenders = [];
        const nonQualifiedLenders = [];
        let autoDroppedCount = 0;

        for (const lender of lenders) {
            const lenderName = (lender.name || '').trim();
            if (!lenderName || lenderName.length < 2) {
                autoDroppedCount++;
                continue;
            }

            let blockingRule = null;

            // 1. Position check
            blockingRule = checkPositionRestrictions(lender, criteria);

            // 2. Get lender-specific rules and check them
            if (!blockingRule) {
                const lenderNameLower = lenderName.toLowerCase();
                const lenderRules = [];

                // Find matching rules (full name match, not just first word)
                for (const [ruleLenderName, rules] of Object.entries(rulesByLender)) {
                    if (lenderNameLower.includes(ruleLenderName) ||
                        ruleLenderName.includes(lenderNameLower)) {
                        lenderRules.push(...rules);
                    }
                }

                if (lenderRules.length > 0) {
                    blockingRule = checkLenderRules(lenderRules, criteria);
                }
            }

            // 3. State restrictions
            if (!blockingRule) blockingRule = checkStateRestrictions(lender, criteria);

            // 4. Sole prop check
            if (!blockingRule && criteria.isSoleProp) blockingRule = checkSoleProp(lender, criteria);

            // 5. Non-profit check
            if (!blockingRule && criteria.isNonProfit) blockingRule = checkNonProfit(lender, criteria);

            // 6. Mercury bank check
            if (!blockingRule) blockingRule = checkMercuryBank(lender, criteria);

            // 7. Industry restrictions
            if (!blockingRule) blockingRule = checkIndustryRestrictions(lender, criteria, canonicalIndustries);

            // 8. Minimum requirements
            if (!blockingRule) blockingRule = checkMinimumRequirements(lender, criteria);

            // 9. Banking requirements
            if (!blockingRule) blockingRule = checkBankingRequirements(lender, criteria);

            // 10. Withhold restrictions
            if (!blockingRule) blockingRule = checkWithholdRestrictions(lender, criteria);

            // Classify lender
            if (blockingRule) {
                nonQualifiedLenders.push({
                    lender: lenderName,
                    blockingRule: blockingRule
                });
            } else {
                const isPreferred = checkPreferredIndustry(lender, criteria);
                qualifiedLenders.push({
                    ...lender,
                    'Lender Name': lender.name,
                    isPreferred: isPreferred
                });
            }
        }

        // Sort qualified by tier first
        qualifiedLenders.sort((a, b) => {
            const tierOrder = { 'A': 1, 'B': 2, 'C': 3, 'D': 4 };
            const tierA = tierOrder[a.tier] || 999;
            const tierB = tierOrder[b.tier] || 999;
            if (tierA !== tierB) return tierA - tierB;
            if (a.isPreferred && !b.isPreferred) return -1;
            if (!a.isPreferred && b.isPreferred) return 1;
            return 0;
        });

        // Add success predictions (wrapped to prevent crash)
        let qualifiedWithPredictions = qualifiedLenders;
        try {
            qualifiedWithPredictions = await predictSuccessForAll(qualifiedLenders, criteria);
        } catch (predictionError) {
            console.error('[SuccessPredictor] Failed, continuing without predictions:', predictionError.message);
            qualifiedWithPredictions = qualifiedLenders.map((lender) => ({ ...lender, prediction: null }));
        }

        // Return results
        res.json({
            qualified: qualifiedWithPredictions,
            nonQualified: nonQualifiedLenders,
            autoDropped: autoDroppedCount,
            summary: {
                totalProcessed: lenders.length,
                qualified: qualifiedLenders.length,
                nonQualified: nonQualifiedLenders.length,
                autoDropped: autoDroppedCount
            },
            criteria: criteria
        });

    } catch (error) {
        console.error('Qualification error:', error);
        res.status(500).json({ error: 'Failed to qualify lenders', details: error.message });
    }
});

// GET /api/qualification/all-lenders - Get all lenders without qualification
router.get('/all-lenders', async (req, res) => {
    try {
        const db = getDatabase();

        const lendersResult = await db.query(`
            SELECT * FROM lenders
            WHERE name IS NOT NULL AND name != ''
            ORDER BY tier ASC, name ASC
        `);

        const allLenders = lendersResult.rows.map(lender => ({
            ...lender,
            'Lender Name': lender.name,
            isPreferred: false
        }));

        res.json({
            success: true,
            lenders: allLenders,
            count: allLenders.length
        });

    } catch (error) {
        console.error('Error fetching all lenders:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
