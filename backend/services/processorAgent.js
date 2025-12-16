// backend/services/processorAgent.js
const GmailInboxService = require('./gmailInboxService');
const { getDatabase } = require('./database');
const { OpenAI } = require('openai');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const gmail = new GmailInboxService();

// ⚡ SETTINGS
const CHECK_INTERVAL = 2 * 60 * 1000; // Check every 2 minutes
const KEYWORDS_REGEX = /(Offer|Decline|Stipulations|Submission|Funding|Approval)/i;

// 🛠️ HELPER: Standardize Name
function normalizeName(name) {
    if (!name) return "";
    return name.toLowerCase().replace(/[,.-]/g, "").replace(/\b(llc|inc|corp|corporation|ltd|co|company)\b/g, "").trim();
}

// 🛠️ HELPER: Fuzzy Match Score
function getSimilarity(s1, s2) {
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;
    if (longer.length === 0) return 1.0;
    const costs = new Array();
    for (let i = 0; i <= longer.length; i++) {
        let lastValue = i;
        for (let j = 0; j <= shorter.length; j++) {
            if (i == 0) costs[j] = j;
            else if (j > 0) {
                let newValue = costs[j - 1];
                if (longer.charAt(i - 1) != shorter.charAt(j - 1))
                    newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                costs[j - 1] = lastValue;
                lastValue = newValue;
            }
        }
        if (i > 0) costs[shorter.length] = lastValue;
    }
    return (longer.length - costs[shorter.length]) / parseFloat(longer.length);
}

async function startProcessor() {
    console.log('👩‍💼 Processor Agent: Online (Smart Ledger Mode)...');
    // Start the first run immediately
    runCheck();
}

async function runCheck() {
    // Loop Tracking Variable to prevent duplicates if accidentally called
    if (global.isProcessorRunning) {
        console.log('⚠️ Processor overlapped. Skipping this cycle.');
        return;
    }
    global.isProcessorRunning = true;

    const db = getDatabase();
    try {
        // 1. FETCH RECENT EMAILS (Read AND Unread)
        // We look at the last 50 emails. The DB prevents duplicates, so this is safe.
        const recentEmails = await gmail.fetchEmails({ limit: 50 });

        if (!recentEmails || recentEmails.length === 0) return;

        // 2. FILTER: Keyword + LEDGER CHECK
        const newEmails = [];

        for (const email of recentEmails) {
            // A. Keyword Check (Fastest)
            if (!KEYWORDS_REGEX.test(email.subject || "")) continue;

            // B. Database Ledger Check (The Safety Valve)
            // We check if this specific Message ID is already in our table
            const exists = await db.query(
                'SELECT 1 FROM processed_emails WHERE message_id = $1',
                [email.id]
            );

            if (exists.rows.length === 0) {
                newEmails.push(email);
            }
        }

        if (newEmails.length === 0) {
            // console.log(`💤 Checked ${recentEmails.length} emails. No new deal updates.`);
            return;
        }

        console.log(`📨 Processor: found ${newEmails.length} NEW relevant emails.`);

        for (const email of newEmails) {
            await processEmail(email, db); // Pass DB to save connection time
        }
    } catch (err) {
        console.error('❌ Processor Loop Error:', err.message);
    } finally {
        // Schedule the NEXT run only after this one finishes
        global.isProcessorRunning = false;
        console.log(`💤 Sleeping for ${CHECK_INTERVAL / 1000} seconds...`);
        setTimeout(runCheck, CHECK_INTERVAL);
    }
}

async function processEmail(email, db) {
    // 🛡️ DOUBLE CHECK (Concurrency Safety)
    try {
        await db.query('INSERT INTO processed_emails (message_id) VALUES ($1)', [email.id]);
    } catch (err) {
        // If insert fails (duplicate key), it means another thread just processed it. Skip.
        return;
    }

    // --- FROM HERE, IT IS EXACTLY THE SAME AS BEFORE ---

    const extraction = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{
            role: "system",
            content: `
            Analyze this MCA email. Extract:
            1. Business Name (Merchant)
            2. Lender Name (Sender)
            3. Category: 'OFFER', 'DECLINE', 'STIPS', 'OTHER'
            4. Offer Details: Amount (number), Factor Rate (decimal), Term (months), Decline Reason (string).

            Return JSON:
            {
                "business_name": string,
                "lender": string,
                "category": "OFFER"|"DECLINE"|"STIPS"|"OTHER",
                "offer_amount": number|null,
                "factor_rate": number|null,
                "term_months": number|null,
                "decline_reason": string|null,
                "summary": string
            }
            `
        }, {
            role: "user",
            content: `Sender: "${email.from.name}"\nSubject: "${email.subject}"\nSnippet: "${email.snippet}"`
        }],
        response_format: { type: "json_object" }
    });

    const data = JSON.parse(extraction.choices[0].message.content);

    if (!data.business_name) return;

    const emailNameClean = normalizeName(data.business_name);

    const candidates = await db.query(`
        SELECT id, business_name FROM conversations
        WHERE lower(business_name) LIKE $1
        AND state NOT IN ('ARCHIVED', 'DEAD')
    `, [`${emailNameClean.charAt(0)}%`]);

    let bestMatchId = null;
    let highestScore = 0;

    for (const lead of candidates.rows) {
        const score = getSimilarity(emailNameClean, normalizeName(lead.business_name));
        if (score > 0.85 && score > highestScore) {
            highestScore = score;
            bestMatchId = lead.id;
        }
    }

    if (!bestMatchId) return;

    console.log(`✅ MATCH: "${data.business_name}" -> Lead ${bestMatchId} (${data.category})`);

    const submissionCheck = await db.query(`
        SELECT id FROM lender_submissions
        WHERE conversation_id = $1 AND lender_name ILIKE $2
    `, [bestMatchId, `%${data.lender}%`]);

    if (submissionCheck.rows.length > 0) {
        await db.query(`
            UPDATE lender_submissions
            SET status = $1,
                offer_amount = COALESCE($2, offer_amount),
                factor_rate = COALESCE($3, factor_rate),
                term_months = COALESCE($4, term_months),
                decline_reason = COALESCE($5, decline_reason),
                last_response_at = NOW()
            WHERE id = $6
        `, [data.category, data.offer_amount, data.factor_rate, data.term_months, data.decline_reason, submissionCheck.rows[0].id]);
    } else {
        await db.query(`
            INSERT INTO lender_submissions (
                id, conversation_id, lender_name, status,
                offer_amount, factor_rate, term_months, decline_reason,
                submitted_at, last_response_at, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW(), NOW())
        `, [uuidv4(), bestMatchId, data.lender || 'Unknown Lender', data.category, data.offer_amount, data.factor_rate, data.term_months, data.decline_reason]);
    }

    if (data.category === 'OFFER') {
        await db.query(`UPDATE conversations SET has_offer = TRUE, last_activity = NOW() WHERE id = $1`, [bestMatchId]);
        if (global.io) global.io.emit('refresh_lead_list');
    }

    const systemNote = `📩 **INBOX UPDATE:** ${data.lender} - ${data.category}\n${data.summary}`;
    await db.query(`INSERT INTO messages (conversation_id, direction, content, timestamp) VALUES ($1, 'system', $2, NOW())`, [bestMatchId, systemNote]);
}

module.exports = { startProcessor };
