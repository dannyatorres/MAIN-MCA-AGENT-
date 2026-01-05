// backend/services/successPredictor.js
// Predicts lender success rates based on historical outcomes

const { getDatabase } = require('./database');

// Cache profiles to avoid constant DB queries
let lenderProfiles = {};
let lastProfileUpdate = 0;
const CACHE_DURATION = 60 * 60 * 1000; // Refresh every hour

async function buildLenderProfiles() {
    const db = getDatabase();
    console.log('[SuccessPredictor] 📊 Building lender profiles...');

    const result = await db.query(`
        SELECT
            ls.lender_name,
            ls.status,
            ls.total_daily_withhold,
            ls.position,
            c.industry_type as industry,
            c.us_state,
            c.monthly_revenue,
            c.credit_score as fico_score,
            c.business_start_date
        FROM lender_submissions ls
        JOIN conversations c ON ls.conversation_id = c.id
        WHERE ls.status IN ('APPROVED', 'OFFER', 'DECLINED', 'FUNDED')
    `);

    const profiles = {};

    for (const row of result.rows) {
        const lender = row.lender_name?.toLowerCase();
        if (!lender) continue;

        if (!profiles[lender]) {
            profiles[lender] = {
                total: 0,
                approved: 0,
                declined: 0,
                industries: {},
                states: {},
                avgApprovedRevenue: [],
                avgApprovedFico: [],
                avgApprovedTib: [],
                avgDeclinedRevenue: [],
                avgDeclinedFico: [],
                avgDeclinedTib: [],
                avgApprovedWithhold: [],
                avgDeclinedWithhold: [],
                avgApprovedPositionCount: [],
                avgDeclinedPositionCount: []
            };
        }

        const p = profiles[lender];
        p.total++;

        const isApproved = ['APPROVED', 'OFFER', 'FUNDED'].includes(row.status);
        if (isApproved) {
            p.approved++;
        } else {
            p.declined++;
        }

        // Track by industry
        const industry = (row.industry || 'unknown').toLowerCase();
        if (!p.industries[industry]) {
            p.industries[industry] = { total: 0, approved: 0 };
        }
        p.industries[industry].total++;
        if (isApproved) p.industries[industry].approved++;

        // Track by state
        const state = (row.us_state || 'unknown').toLowerCase();
        if (!p.states[state]) {
            p.states[state] = { total: 0, approved: 0 };
        }
        p.states[state].total++;
        if (isApproved) p.states[state].approved++;

        const tibMonths = row.business_start_date
            ? Math.floor((Date.now() - new Date(row.business_start_date).getTime()) / (1000 * 60 * 60 * 24 * 30))
            : null;

        // Track metrics for approved vs declined
        if (isApproved) {
            if (row.monthly_revenue) p.avgApprovedRevenue.push(parseFloat(row.monthly_revenue));
            if (row.fico_score) p.avgApprovedFico.push(parseInt(row.fico_score));
            if (tibMonths) p.avgApprovedTib.push(tibMonths);
            if (row.total_daily_withhold) p.avgApprovedWithhold.push(parseFloat(row.total_daily_withhold));
            if (row.position) p.avgApprovedPositionCount.push(Math.max(0, parseInt(row.position) - 1));
        } else {
            if (row.monthly_revenue) p.avgDeclinedRevenue.push(parseFloat(row.monthly_revenue));
            if (row.fico_score) p.avgDeclinedFico.push(parseInt(row.fico_score));
            if (tibMonths) p.avgDeclinedTib.push(tibMonths);
            if (row.total_daily_withhold) p.avgDeclinedWithhold.push(parseFloat(row.total_daily_withhold));
            if (row.position) p.avgDeclinedPositionCount.push(Math.max(0, parseInt(row.position) - 1));
        }
    }

    // Calculate averages
    for (const lender of Object.keys(profiles)) {
        const p = profiles[lender];
        p.overallSuccessRate = p.total > 0 ? p.approved / p.total : 0;
        p.avgApprovedRevenue = average(p.avgApprovedRevenue);
        p.avgApprovedFico = average(p.avgApprovedFico);
        p.avgApprovedTib = average(p.avgApprovedTib);
        p.avgDeclinedRevenue = average(p.avgDeclinedRevenue);
        p.avgDeclinedFico = average(p.avgDeclinedFico);
        p.avgDeclinedTib = average(p.avgDeclinedTib);
        p.avgApprovedWithhold = average(p.avgApprovedWithhold);
        p.avgDeclinedWithhold = average(p.avgDeclinedWithhold);
        p.avgApprovedPositionCount = average(p.avgApprovedPositionCount);
        p.avgDeclinedPositionCount = average(p.avgDeclinedPositionCount);
    }

    lenderProfiles = profiles;
    lastProfileUpdate = Date.now();

    console.log(`[SuccessPredictor] ✅ Built profiles for ${Object.keys(profiles).length} lenders`);
    return profiles;
}

function average(arr) {
    if (!arr || arr.length === 0) return null;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}

async function getProfiles() {
    if (Date.now() - lastProfileUpdate > CACHE_DURATION || Object.keys(lenderProfiles).length === 0) {
        await buildLenderProfiles();
    }
    return lenderProfiles;
}

async function predictSuccess(lenderName, criteria) {
    const profiles = await getProfiles();
    const lenderKey = lenderName.toLowerCase();

    // Try to find matching profile (fuzzy match on first word)
    let profile = profiles[lenderKey];
    if (!profile) {
        const firstWord = lenderKey.split(' ')[0];
        for (const key of Object.keys(profiles)) {
            if (key.includes(firstWord) || firstWord.includes(key.split(' ')[0])) {
                profile = profiles[key];
                break;
            }
        }
    }

    // No history for this lender
    if (!profile || profile.total < 3) {
        return {
            successRate: null,
            confidence: 'none',
            reason: 'Not enough historical data'
        };
    }

    let score = profile.overallSuccessRate;
    let factors = [];

    // Adjust by industry
    const industry = (criteria.industry || '').toLowerCase();
    if (industry && profile.industries[industry]) {
        const indData = profile.industries[industry];
        if (indData.total >= 2) {
            const indRate = indData.approved / indData.total;
            score = (score + indRate) / 2; // Blend overall with industry-specific
            factors.push(`${industry}: ${Math.round(indRate * 100)}% historical`);
        }
    }

    // Adjust by state
    const state = (criteria.state || '').toLowerCase();
    if (state && profile.states[state]) {
        const stateData = profile.states[state];
        if (stateData.total >= 2) {
            const stateRate = stateData.approved / stateData.total;
            score = (score + stateRate) / 2;
            factors.push(`${state.toUpperCase()}: ${Math.round(stateRate * 100)}% historical`);
        }
    }

    // Adjust by revenue comparison to approved deals
    if (criteria.monthlyRevenue && profile.avgApprovedRevenue) {
        const rev = parseFloat(criteria.monthlyRevenue);
        if (rev >= profile.avgApprovedRevenue) {
            score += 0.05; // Boost for above-average revenue
            factors.push('Revenue above avg approved');
        } else if (profile.avgDeclinedRevenue && rev <= profile.avgDeclinedRevenue) {
            score -= 0.1; // Penalty for below declined average
            factors.push('Revenue below avg declined');
        }
    }

    // Adjust by FICO comparison
    if (criteria.fico && profile.avgApprovedFico) {
        const fico = parseInt(criteria.fico);
        if (fico >= profile.avgApprovedFico) {
            score += 0.05;
            factors.push('FICO above avg approved');
        } else if (profile.avgDeclinedFico && fico <= profile.avgDeclinedFico) {
            score -= 0.1;
            factors.push('FICO below avg declined');
        }
    }

    // Adjust by TIB comparison
    if (criteria.tib && profile.avgApprovedTib) {
        const tib = parseInt(criteria.tib);
        if (tib >= profile.avgApprovedTib) {
            score += 0.05;
            factors.push('TIB above avg approved');
        } else if (profile.avgDeclinedTib && tib <= profile.avgDeclinedTib) {
            score -= 0.1;
            factors.push('TIB below avg declined');
        }
    }

    // Adjust by daily withhold
    if (criteria.totalDailyWithhold && profile.avgApprovedWithhold) {
        const withhold = parseFloat(criteria.totalDailyWithhold);
        if (withhold <= profile.avgApprovedWithhold) {
            score += 0.05;
            factors.push('Daily withhold at/below avg approved');
        } else if (profile.avgDeclinedWithhold && withhold >= profile.avgDeclinedWithhold) {
            score -= 0.1;
            factors.push('Daily withhold above avg declined');
        }
    }

    // Adjust by existing position count
    if (criteria.existingPositions && profile.avgApprovedPositionCount) {
        const posCount = parseInt(criteria.existingPositions);
        if (posCount <= profile.avgApprovedPositionCount) {
            score += 0.05;
            factors.push('Position count at/below avg approved');
        } else if (profile.avgDeclinedPositionCount && posCount >= profile.avgDeclinedPositionCount) {
            score -= 0.1;
            factors.push('Position count above avg declined');
        }
    }

    // Clamp between 0 and 1
    score = Math.max(0, Math.min(1, score));

    // Confidence based on data points
    let confidence = 'low';
    if (profile.total >= 10) confidence = 'medium';
    if (profile.total >= 25) confidence = 'high';

    return {
        successRate: Math.round(score * 100),
        confidence,
        dataPoints: profile.total,
        factors,
        raw: {
            overallRate: Math.round(profile.overallSuccessRate * 100),
            approved: profile.approved,
            declined: profile.declined
        }
    };
}

// Bulk predict for qualification results
async function predictSuccessForAll(qualifiedLenders, criteria) {
    const results = [];

    for (const lender of qualifiedLenders) {
        const lenderName = lender['Lender Name'] || lender.name;
        const prediction = await predictSuccess(lenderName, criteria);

        results.push({
            ...lender,
            prediction
        });
    }

    // Sort by success rate (nulls at end)
    results.sort((a, b) => {
        const aRate = a.prediction.successRate ?? -1;
        const bRate = b.prediction.successRate ?? -1;
        return bRate - aRate;
    });

    return results;
}

// Force refresh profiles
async function refreshProfiles() {
    lastProfileUpdate = 0;
    return await buildLenderProfiles();
}

module.exports = {
    buildLenderProfiles,
    predictSuccess,
    predictSuccessForAll,
    refreshProfiles,
    getProfiles
};
