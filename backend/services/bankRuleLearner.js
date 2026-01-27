// services/bankRuleLearner.js
// Shadow system - learns bank patterns without affecting current FCS flow

const { getDatabase } = require('./database');

// Common bank patterns (regex)
const KNOWN_PATTERNS = [
    { pattern: /chase|jpmorgan/i, name: 'Chase' },
    { pattern: /wells\s*fargo/i, name: 'Wells Fargo' },
    { pattern: /bank of america|bofa/i, name: 'Bank of America' },
    { pattern: /citizens\s*bank/i, name: 'Citizens Bank' },
    { pattern: /td\s*bank/i, name: 'TD Bank' },
    { pattern: /pnc\s*bank/i, name: 'PNC Bank' },
    { pattern: /us\s*bank/i, name: 'US Bank' },
    { pattern: /capital\s*one/i, name: 'Capital One' },
    { pattern: /truist/i, name: 'Truist' },
    { pattern: /santander/i, name: 'Santander' },
    { pattern: /huntington/i, name: 'Huntington' },
    { pattern: /regions\s*bank/i, name: 'Regions Bank' },
    { pattern: /fifth\s*third/i, name: 'Fifth Third' },
    { pattern: /key\s*bank/i, name: 'KeyBank' },
    { pattern: /m&t\s*bank/i, name: 'M&T Bank' },
    { pattern: /navy\s*federal/i, name: 'Navy Federal' },
    { pattern: /usaa/i, name: 'USAA' }
];

function identifyBank(ocrText) {
    // Check first 2000 chars (bank name is always at top)
    const header = ocrText.substring(0, 2000);

    for (const { pattern, name } of KNOWN_PATTERNS) {
        if (pattern.test(header)) {
            return name;
        }
    }

    return 'Unknown';
}

async function learnFromStatement(ocrText, conversationId = null) {
    try {
        const db = getDatabase();
        const bankName = identifyBank(ocrText);

        console.log(`🔍 [Shadow] Identified bank: ${bankName}`);

        if (bankName === 'Unknown') {
            // Queue for manual review with sample text
            await db.query(`
                INSERT INTO pending_bank_rules (bank_name, sample_text, conversation_id, detected_at, status)
                VALUES ('Unknown - ' || $1, $2, $3, NOW(), 'pending')
                ON CONFLICT DO NOTHING
            `, [
                Date.now(), // unique suffix
                ocrText.substring(0, 3000), // sample for review
                conversationId
            ]);

            console.log(`🆕 [Shadow] Unknown bank queued for review`);
            return { known: false, bank: 'Unknown', queued: true };
        }

        // Check if we have rules for this bank
        const existing = await db.query(
            `SELECT * FROM bank_rules WHERE bank_name = $1 OR $1 = ANY(aliases)`,
            [bankName]
        );

        if (existing.rows.length > 0) {
            console.log(`✅ [Shadow] Known bank with rules: ${bankName}`);
            return { known: true, bank: bankName, rules: existing.rows[0] };
        } else {
            // Bank identified but no rules yet
            await db.query(`
                INSERT INTO pending_bank_rules (bank_name, sample_text, conversation_id, detected_at, status)
                VALUES ($1, $2, $3, NOW(), 'pending')
                ON CONFLICT (bank_name) DO UPDATE SET 
                    sample_text = EXCLUDED.sample_text,
                    detected_at = NOW()
            `, [
                bankName,
                ocrText.substring(0, 3000),
                conversationId
            ]);

            console.log(`🆕 [Shadow] Bank identified but no rules: ${bankName} - queued`);
            return { known: false, bank: bankName, queued: true };
        }

    } catch (err) {
        console.error('[Shadow] Bank learner error:', err.message);
        return { error: err.message };
    }
}

async function getPendingBanks() {
    const db = getDatabase();
    const result = await db.query(
        `SELECT bank_name, detected_at, sample_text FROM pending_bank_rules WHERE status = 'pending' ORDER BY detected_at DESC`
    );
    return result.rows;
}

async function getBankRules(bankName) {
    const db = getDatabase();
    const result = await db.query(
        `SELECT * FROM bank_rules WHERE bank_name = $1 OR $1 = ANY(aliases)`,
        [bankName]
    );
    return result.rows[0] || null;
}

module.exports = {
    identifyBank,
    learnFromStatement,
    getPendingBanks,
    getBankRules
};
