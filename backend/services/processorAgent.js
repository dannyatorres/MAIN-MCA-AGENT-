// backend/services/processorAgent.js
const GmailInboxService = require('./gmailInboxService');
const { getDatabase } = require('./database');
const { OpenAI } = require('openai');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const gmail = new GmailInboxService();

// ⚡ SETTINGS
const CHECK_INTERVAL = 2 * 60 * 1000; // Check every 2 minutes

// 🟢 LOAD PROMPT HELPER
function getSystemPrompt() {
    try {
        const promptPath = path.join(__dirname, '../prompts/email-analysis.md');
        return fs.readFileSync(promptPath, 'utf8');
    } catch (err) {
        console.error('❌ Could not load prompt file:', err.message);
        return `You are an expert MCA underwriter assistant. Analyze this email and return JSON with business_name, lender, category, offer_amount, etc.`;
    }
}

function normalizeName(name) {
    if (!name) return "";
    return name.toLowerCase().replace(/[,.-]/g, "").replace(/\b(llc|inc|corp|corporation|ltd|co|company)\b/g, "").trim();
}

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
    runCheck();
}

async function runCheck() {
    if (global.isProcessorRunning) {
        console.log('⚠️ [Processor] Overlap detected. Skipping this cycle.');
        return;
    }
    global.isProcessorRunning = true;

    const db = getDatabase();
    console.log(`🔍 [Processor] Starting check at ${new Date().toLocaleTimeString()}...`);

    try {
        // Fetch latest emails
        const recentEmails = await gmail.fetchEmails({ limit: 15 });

        if (!recentEmails || recentEmails.length === 0) {
             console.log('   💤 [Processor] Inbox is empty or connection failed.');
             return;
        }

        const newEmails = [];
        console.log(`   📬 Fetched ${recentEmails.length} emails. Checking DB for duplicates...`);

        for (const email of recentEmails) {
            const exists = await db.query('SELECT 1 FROM processed_emails WHERE message_id = $1', [email.id]);
            
            if (exists.rows.length === 0) {
                console.log(`      ✨ NEW EMAIL FOUND: "${email.subject || '(No Subject)'}"`);
                newEmails.push(email);
            } else {
                // console.log(`      ⏭️  Skipped (Old): "${email.subject}"`);
            }
        }

        if (newEmails.length === 0) {
            console.log('   🗑️ [Processor] No new emails found this cycle.');
            return;
        }

        console.log(`   🚀 Sending ${newEmails.length} new emails to AI...`);

        for (const email of newEmails) {
            await processEmail(email, db);
        }
    } catch (err) {
        console.error('❌ Processor Loop Error:', err.message);
    } finally {
        global.isProcessorRunning = false;
        console.log(`💤 [Processor] Done. Sleeping for ${CHECK_INTERVAL / 1000} seconds...`);
        setTimeout(runCheck, CHECK_INTERVAL);
    }
}

async function processEmail(email, db) {
    try {
        await db.query('INSERT INTO processed_emails (message_id) VALUES ($1)', [email.id]);
    } catch (err) { return; }

    console.log(`   🤖 [AI] Analyzing email: "${email.subject}"...`);

    const systemPrompt = getSystemPrompt();

    const extraction = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{
            role: "system",
            content: systemPrompt
        }, {
            role: "user",
            content: `Sender: "${email.from.name}" <${email.from.email}>\nSubject: "${email.subject}"\nBody Snippet: "${email.snippet}"`
        }],
        response_format: { type: "json_object" }
    });

    const usage = extraction.usage;
    console.log(`      🎟️ [Tokens] Used: ${usage.total_tokens}`);

    const data = JSON.parse(extraction.choices[0].message.content);

    if (!data.business_name || data.business_name === "null") {
        console.log(`      ⚠️ [AI] Irrelevant or Spam (No Merchant Found). Skipping.`);
        return;
    }

    const emailNameClean = normalizeName(data.business_name);
    const candidates = await db.query(`SELECT id, business_name FROM conversations WHERE state NOT IN ('ARCHIVED', 'DEAD')`);

    let bestMatchId = null;
    let highestScore = 0;

    for (const lead of candidates.rows) {
        const leadNameClean = normalizeName(lead.business_name);
        if (leadNameClean.includes(emailNameClean) || emailNameClean.includes(leadNameClean)) {
            const score = getSimilarity(emailNameClean, leadNameClean);
            if (score > 0.65 && score > highestScore) {
                highestScore = score;
                bestMatchId = lead.id;
            }
        }
    }

    if (!bestMatchId) {
        console.log(`      ⚠️ [AI] No matching lead found for: "${data.business_name}"`);
        return;
    }

    console.log(`      ✅ MATCH: "${data.business_name}" -> Lead ${bestMatchId} (${data.category})`);

    const submissionCheck = await db.query(`
        SELECT id FROM lender_submissions
        WHERE conversation_id = $1 AND lender_name ILIKE $2
    `, [bestMatchId, `%${data.lender}%`]);

    const offerDetailsJson = {
        ai_summary: data.summary,
        parsed_at: new Date().toISOString()
    };

    if (submissionCheck.rows.length > 0) {
        await db.query(`
            UPDATE lender_submissions
            SET status = $1,
                offer_amount = COALESCE($2, offer_amount),
                factor_rate = COALESCE($3, factor_rate),
                term_length = COALESCE($4, term_length),
                term_unit = COALESCE($5, term_unit),
                payment_frequency = COALESCE($6, payment_frequency),
                decline_reason = COALESCE($7, decline_reason),
                offer_details = offer_details || $8::jsonb,
                last_response_at = NOW()
            WHERE id = $9
        `, [
            data.category,
            data.offer_amount,
            data.factor_rate,
            data.term_length,
            data.term_unit,
            data.payment_frequency,
            data.decline_reason,
            JSON.stringify(offerDetailsJson),
            submissionCheck.rows[0].id
        ]);
    } else {
        await db.query(`
            INSERT INTO lender_submissions (
                id, conversation_id, lender_name, status,
                offer_amount, factor_rate, term_length, term_unit, payment_frequency,
                decline_reason, offer_details,
                submitted_at, last_response_at, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW(), NOW())
        `, [
            uuidv4(),
            bestMatchId,
            data.lender || 'Unknown Lender',
            data.category,
            data.offer_amount,
            data.factor_rate,
            data.term_length,
            data.term_unit,
            data.payment_frequency,
            data.decline_reason,
            JSON.stringify(offerDetailsJson)
        ]);
    }

    if (data.category === 'OFFER') {
        await db.query(`UPDATE conversations SET has_offer = TRUE, last_activity = NOW() WHERE id = $1`, [bestMatchId]);
        if (global.io) global.io.emit('refresh_lead_list');
    }

    const systemNote = `📩 **INBOX UPDATE (${data.lender}):** ${data.summary}`;

    // 🟢 Write to AI Chat (Assistant)
    try {
        await db.query(`
            INSERT INTO ai_chat_messages (conversation_id, role, content, created_at)
            VALUES ($1, 'assistant', $2, NOW())
        `, [bestMatchId, systemNote]);
    } catch (err) {
        console.error('      ⚠️ [AI] Failed to log to assistant history:', err.message);
    }

    console.log(`      ✅ [Database] Saved results for: "${email.subject}"`);
}

module.exports = { startProcessor };
