// backend/services/processorAgent.js
// 🛡️ ROBUST VERSION - Auto-restarts on crash

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
const ERROR_RESTART_DELAY = 15 * 1000; // If crash, wait 15 seconds then retry

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

// Validate and match lender name against actual lenders table
async function matchToRealLender(extractedLender, db) {
    if (!extractedLender || extractedLender === 'Unknown Lender') return null;

    const normalizedExtracted = normalizeName(extractedLender);

    const lendersResult = await db.query('SELECT name FROM lenders');
    const lenders = lendersResult.rows;

    let bestMatch = null;
    let bestScore = 0;

    for (const lender of lenders) {
        const normalizedLender = normalizeName(lender.name);

        if (normalizedExtracted === normalizedLender) {
            return lender.name;
        }

        const score = getSimilarity(normalizedExtracted, normalizedLender);
        if (score > bestScore) {
            bestScore = score;
            bestMatch = lender.name;
        }
    }

    if (bestScore >= 0.75) {
        console.log(`      🔄 Lender name corrected: "${extractedLender}" -> "${bestMatch}" (${(bestScore * 100).toFixed(0)}%)`);
        return bestMatch;
    }

    const words = extractedLender.trim().split(/\s+/);
    const companyKeywords = /capital|funding|fund|advance|financial|lending|credit|money|cash|business|merchant|express|velocity|fast|quick/i;

    if (words.length <= 3 && !companyKeywords.test(extractedLender)) {
        console.log(`      ⚠️ Rejected person name as lender: "${extractedLender}"`);
        return null;
    }

    console.log(`      ⚠️ Unknown lender (no match found): "${extractedLender}"`);
    return null;
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

// 🛡️ SUPERVISOR: This ensures the loop never dies
async function startProcessor() {
    console.log('🛡️ [Processor Supervisor] Starting...');

    // Cleanup old records on startup
    await cleanupOldEmails();

    // Run weekly cleanup
    setInterval(cleanupOldEmails, 7 * 24 * 60 * 60 * 1000);

    // Start the first cycle
    runCheck();
}

async function runCheck() {
    if (global.isProcessorRunning) {
        console.log('⚠️ [Processor] Previous cycle still running. Skipping overlap.');
        return;
    }
    global.isProcessorRunning = true;

    const db = getDatabase();
    console.log(`\n🔍 [Processor] Checking inbox at ${new Date().toLocaleTimeString()}...`);

    try {
        const recentEmails = await gmail.fetchEmails({ limit: 15 });

        if (!recentEmails || recentEmails.length === 0) {
            console.log('   📭 No emails found in inbox.');
        } else {
            const newEmails = [];
            console.log(`   📬 Fetched ${recentEmails.length} emails. Checking against DB...`);

            for (const email of recentEmails) {
                const exists = await db.query('SELECT 1 FROM processed_emails WHERE message_id = $1 OR thread_id = $2', [email.id, email.threadId]);

                if (exists.rows.length === 0) {
                    console.log(`      ✨ NEW: "${email.subject || '(No Subject)'}"`);
                    newEmails.push(email);
                }
            }

            if (newEmails.length > 0) {
                console.log(`   🚀 Processing ${newEmails.length} new email(s) with AI...`);
                for (const email of newEmails) {
                    await processEmail(email, db);
                }
            } else {
                console.log(`   ✅ All ${recentEmails.length} emails already processed. No AI calls needed.`);
            }
        }

        global.isProcessorRunning = false;
        console.log(`   💤 Next check in ${CHECK_INTERVAL / 1000 / 60} minutes.\n`);
        setTimeout(runCheck, CHECK_INTERVAL);

    } catch (err) {
        console.error(`❌ [Processor] CRASHED: ${err.message}`);
        console.error(`🛡️ [Supervisor] Restarting in ${ERROR_RESTART_DELAY / 1000} seconds...`);
        global.isProcessorRunning = false;
        setTimeout(runCheck, ERROR_RESTART_DELAY);
    }
}

async function processEmail(email, db) {
    try {
        await db.query('INSERT INTO processed_emails (message_id, thread_id) VALUES ($1, $2)', [email.id, email.threadId]);
    } catch (err) { return; }

    console.log(`   🤖 [AI] Analyzing email: "${email.subject}"...`);

    const systemPrompt = getSystemPrompt();

    // Send full email body (up to 3000 chars) instead of just snippet
    let emailBody = (email.text || email.html || email.snippet || '')
        .replace(/<[^>]*>/g, ' ')  // Strip HTML tags
        .replace(/\s+/g, ' ')      // Normalize whitespace
        .trim();

    // Strip quoted replies to prevent duplicate parsing
    emailBody = emailBody
        .replace(/On\s+\w+\s+\d+,?\s+\d{4}.*?wrote:[\s\S]*/i, '')
        .replace(/From:.*?Sent:[\s\S]*/i, '')
        .replace(/-{3,}\s*Original Message\s*-{3,}[\s\S]*/i, '')
        .replace(/>{1,}\s*.*/g, '')
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
    console.log(`      🎟️ [Tokens] Input: ${usage.prompt_tokens} | Output: ${usage.completion_tokens} | Total: ${usage.total_tokens}`);

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

    const validatedLender = await matchToRealLender(data.lender, db);

    if (!validatedLender) {
        console.log(`      ⚠️ Skipping - could not match lender: "${data.lender}"`);
        return;
    }

    const submissionCheck = await db.query(`
        SELECT id FROM lender_submissions
        WHERE conversation_id = $1 AND LOWER(lender_name) = LOWER($2)
    `, [bestMatchId, validatedLender]);

    // Build history log entry for this email
    const newLogEntry = {
        date: new Date().toISOString(),
        category: data.category,
        summary: data.summary,
        raw_snippet: email.snippet || ""
    };

    if (submissionCheck.rows.length > 0) {
        console.log(`      🔄 Updating history for ${validatedLender}...`);

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
        console.log(`      ➕ Creating new record for ${validatedLender}...`);

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
            validatedLender,
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

        // Record offer comparison for ML training
        try {
            // Get the submission ID we just created/updated
            const submissionRes = await db.query(`
                SELECT id FROM lender_submissions
                WHERE conversation_id = $1 AND LOWER(lender_name) = LOWER($2)
            `, [bestMatchId, validatedLender]);

            const submissionId = submissionRes.rows[0]?.id;

            // Get strategy predictions
            const strategyRes = await db.query(`
                SELECT id, recommended_funding_max, recommended_term, recommended_payment
                FROM lead_strategy WHERE conversation_id = $1
            `, [bestMatchId]);

            const strategy = strategyRes.rows[0];

            if (strategy) {
                const predictedFunding = strategy.recommended_funding_max || 0;
                const actualFunding = data.offer_amount || 0;
                const fundingVariance = actualFunding - predictedFunding;
                const fundingVariancePct = predictedFunding > 0
                    ? ((fundingVariance / predictedFunding) * 100).toFixed(2)
                    : 0;

                await db.query(`
                    INSERT INTO offer_comparisons (
                        conversation_id, strategy_id, lender_submission_id, lender_name,
                        predicted_funding, predicted_term, predicted_payment, predicted_factor,
                        actual_funding, actual_term, actual_payment, actual_factor,
                        funding_variance, funding_variance_pct
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, 1.49, $8, $9, $10, $11, $12, $13)
                `, [
                    bestMatchId,
                    strategy.id,
                    submissionId,
                    validatedLender,
                    predictedFunding,
                    strategy.recommended_term || 0,
                    strategy.recommended_payment || 0,
                    actualFunding,
                    data.term_length || 0,
                    data.payment_amount || 0,
                    data.factor_rate || 0,
                    fundingVariance,
                    fundingVariancePct
                ]);

                console.log(`      📊 Recorded comparison: Predicted $${predictedFunding} vs Actual $${actualFunding} (${fundingVariancePct}% variance)`);
            }
        } catch (compareErr) {
            console.error(`      ⚠️ Failed to record comparison: ${compareErr.message}`);
        }

        if (global.io) {
            console.log('🔴 BACKEND EMIT: refresh_lead_list', { conversation_id: bestMatchId });
            global.io.emit('refresh_lead_list', { conversationId: bestMatchId });
        }
    }

    const systemNote = `📩 **INBOX UPDATE (${validatedLender}):** ${data.summary}`;

    // 🟢 Write to AI Chat - check for EXACT duplicate (same lender + same summary)
    try {
        const recentNote = await db.query(`
            SELECT 1 FROM ai_chat_messages 
            WHERE conversation_id = $1 
              AND content = $2
              AND created_at > NOW() - INTERVAL '24 hours'
            LIMIT 1
        `, [bestMatchId, systemNote]);

        if (recentNote.rows.length === 0) {
            await db.query(`
                INSERT INTO ai_chat_messages (conversation_id, role, content, created_at)
                VALUES ($1, 'assistant', $2, NOW())
            `, [bestMatchId, systemNote]);
        } else {
            console.log(`      ⏭️ Skipping duplicate AI note (exact match)`);
        }
    } catch (err) {
        console.error('      ⚠️ [AI] Failed to log to assistant history:', err.message);
    }

    console.log(`      ✅ [Database] Saved results for: "${email.subject}"`);
}

module.exports = { startProcessor };
