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
    return name.toLowerCase()
        .replace(/[,.-]/g, "")
        .replace(/\b(llc|inc|corp|corporation|ltd|co|company|holdings|group|enterprises|services|solutions|consulting|partners|capital|funding|financial|management)\b/g, "")
        .replace(/\s+/g, ' ')
        .trim();
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

// Cleanup emails older than 7 days
async function cleanupOldEmails() {
    const db = getDatabase();
    try {
        const result = await db.query(`
            DELETE FROM processed_emails
            WHERE processed_at < NOW() - INTERVAL '7 days'
        `);
        if (result.rowCount > 0) {
            console.log(`[Cleanup] Deleted ${result.rowCount} old email records`);
        }
    } catch (err) {
        console.error('[Cleanup] Error:', err.message);
    }
}

async function startProcessor() {
    console.log('[Processor] Online...');

    // Cleanup old records on startup
    await cleanupOldEmails();

    // Then run weekly (every 7 days)
    setInterval(cleanupOldEmails, 7 * 24 * 60 * 60 * 1000);

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

    // Send full email body (up to 3000 chars) instead of just snippet
    const emailBody = (email.text || email.html || email.snippet || '')
        .replace(/<[^>]*>/g, ' ')  // Strip HTML tags
        .replace(/\s+/g, ' ')      // Normalize whitespace
        .substring(0, 3000)
        .trim();

    const extraction = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{
            role: "system",
            content: systemPrompt
        }, {
            role: "user",
            content: `Sender: "${email.from.name}" <${email.from.email}>\nSubject: "${email.subject}"\n\nFull Email Body:\n${emailBody}`
        }],
        response_format: { type: "json_object" }
    });

    const usage = extraction.usage;
    console.log(`      🎟️ [Tokens] Used: ${usage.total_tokens}`);

    const data = JSON.parse(extraction.choices[0].message.content);

    // Clean the extracted business name - strip out company patterns
    let businessName = data.business_name || "";
    businessName = businessName
        .replace(/JMS\s*GLOBAL\s*[:\-]?\s*/gi, '')
        .replace(/New Submission from\s*/gi, '')
        .trim();

    if (!businessName || businessName === "null") {
        console.log(`      ⚠️ [AI] Irrelevant or Spam (No Merchant Found). Skipping.`);
        return;
    }

    const emailNameClean = normalizeName(businessName);
    const candidates = await db.query(`SELECT id, business_name FROM conversations WHERE state NOT IN ('ARCHIVED', 'DEAD')`);

    let bestMatchId = null;
    let highestScore = 0;

    for (const lead of candidates.rows) {
        const leadNameClean = normalizeName(lead.business_name);

        // Check similarity for ALL candidates, not just includes matches
        const score = getSimilarity(emailNameClean, leadNameClean);

        // Also boost score if one contains the other
        const finalScore = score;

        if (finalScore > 0.85 && finalScore > highestScore) {
            highestScore = finalScore;
            bestMatchId = lead.id;
            console.log(`      🔍 Potential match: "${lead.business_name}" (score: ${finalScore.toFixed(2)})`);
        }
    }

    if (!bestMatchId) {
        console.log(`      ⚠️ [AI] No matching lead found for: "${businessName}"`);
        return;
    }

    console.log(`      ✅ MATCH: "${businessName}" -> Lead ${bestMatchId} (${data.category})`);

    const submissionCheck = await db.query(`
        SELECT id FROM lender_submissions
        WHERE conversation_id = $1 AND lender_name ILIKE $2
    `, [bestMatchId, `%${data.lender}%`]);

    // Build history log entry for this email
    const newLogEntry = {
        date: new Date().toISOString(),
        category: data.category,
        summary: data.summary,
        raw_snippet: email.snippet || ""
    };

    if (submissionCheck.rows.length > 0) {
        console.log(`      🔄 Updating history for ${data.lender}...`);

        await db.query(`
            UPDATE lender_submissions
            SET 
                status = CASE 
                    WHEN $1 = 'OTHER' THEN status
                    ELSE $1
                END,
                offer_amount = COALESCE($2, offer_amount),
                factor_rate = COALESCE($3, factor_rate),
                term_length = COALESCE($4, term_length),
                term_unit = COALESCE($5, term_unit),
                payment_frequency = COALESCE($6, payment_frequency),
                decline_reason = COALESCE($7, decline_reason),
                offer_details = jsonb_set(
                    COALESCE(offer_details, '{}'::jsonb),
                    '{history}',
                    (COALESCE(offer_details->'history', '[]'::jsonb) || $8::jsonb)
                ),
                raw_email_body = $10,
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
            JSON.stringify([newLogEntry]),
            submissionCheck.rows[0].id,
            email.snippet || ""
        ]);
    } else {
        console.log(`      ➕ Creating new record for ${data.lender}...`);

        const initialDetails = {
            history: [newLogEntry]
        };

        await db.query(`
            INSERT INTO lender_submissions (
                id, conversation_id, lender_name, status,
                offer_amount, factor_rate, term_length, term_unit, payment_frequency,
                decline_reason, offer_details, raw_email_body,
                submitted_at, last_response_at, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW(), NOW())
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
            JSON.stringify(initialDetails),
            email.snippet || ""
        ]);
    }

    if (data.category === 'OFFER') {
        await db.query(`UPDATE conversations SET has_offer = TRUE, last_activity = NOW() WHERE id = $1`, [bestMatchId]);
        if (global.io) {
            global.io.emit('refresh_lead_list', { conversationId: bestMatchId });
        }
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
