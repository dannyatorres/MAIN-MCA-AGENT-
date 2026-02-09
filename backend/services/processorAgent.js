// backend/services/processorAgent.js
// 🛡️ ROBUST VERSION - Auto-restarts on crash

const GmailInboxService = require('./gmailInboxService');
const { getDatabase } = require('./database');
const { trackUsage } = require('./usageTracker');
const { updateState } = require('./stateManager');
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
        .replace(/\([^)]*\)/g, "")
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

async function forwardEmailToUser(email, userEmail, businessName, category, lenderName) {
    if (!userEmail || !email.id) return;
    
    try {
        const categoryLabel = { 'OFFER': 'OFFER', 'DECLINE': 'DECLINE', 'STIP': 'STIP', 'OTHER': 'FYI' };
        const prefix = `[${categoryLabel[category] || 'FYI'} - ${businessName}]`;

        await gmail.forwardEmail(email.id, userEmail, prefix);
        console.log(`      📤 Forwarded to ${userEmail}`);
    } catch (err) {
        console.error(`      ⚠️ Failed to forward email: ${err.message}`);
    }
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
    const knownSingleWordLenders = ['sapphire', 'libertas', 'rowan', 'loot', 'nexi', 'lendr', 'credibly', 'clearline', 'capitalize', 'cashable', 'meged', 'torro'];

    if (words.length <= 3 && !companyKeywords.test(extractedLender) && !knownSingleWordLenders.includes(extractedLender.toLowerCase())) {
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

    try {
        const recentEmails = await gmail.fetchEmails({ limit: 15 });

        if (!recentEmails || recentEmails.length === 0) {
            console.log('   💤 No new emails.');
        } else {
            const newEmails = [];

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
            }
        }

        global.isProcessorRunning = false;
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
    } catch (err) {
        if (err.code === '23505') {
            return;
        }
        console.error(`❌ [DB] Failed to mark email processed: ${err.message}`);
        return;
    }

    console.log(`   🤖 [AI] Analyzing email: "${email.subject}"...`);

    const systemPrompt = getSystemPrompt();
    const senderName = email.from?.name || 'Unknown';
    const senderEmail = email.from?.email || 'unknown@unknown.com';

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

    // Build dynamic lender list from DB and inject into prompt
    const lenderList = await db.query('SELECT name FROM lenders ORDER BY name');
    const lenderNames = lenderList.rows
        .map(r => r.name.replace(/\s*\([^)]*\)/g, ''))
        .join('\n- ');
    const dynamicPrompt = systemPrompt.replace(
        /\*\*KNOWN LENDERS REFERENCE \(Priority List\):\*\*[\s\S]*?\*\*CRITICAL DATA SOURCE RULES:\*\*/,
        `**KNOWN LENDERS REFERENCE (Priority List):**\n- ${lenderNames}\n\n**CRITICAL DATA SOURCE RULES:**`
    );

    let extraction;
    try {
        extraction = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{
                role: "system",
                content: dynamicPrompt
            }, {
                role: "user",
                content: `Sender: "${senderName}" <${senderEmail}>\nSubject: "${email.subject}"\n\nFull Email Body:\n${emailBody}`
            }],
            response_format: { type: "json_object" }
        });
    } catch (aiErr) {
        console.error(`❌ [OpenAI] API call failed: ${aiErr.message}`);
        return;
    }

    // Track usage (system process - no specific user)
    if (extraction.usage) {
        await trackUsage({
            userId: null,
            conversationId: null,
            type: 'llm_call',
            service: 'openai',
            model: 'gpt-4o-mini',
            inputTokens: extraction.usage.prompt_tokens,
            outputTokens: extraction.usage.completion_tokens,
            metadata: { function: 'processorAgent' }
        });
    }

    const usage = extraction.usage;
    console.log(`      🎟️ [Tokens] Input: ${usage.prompt_tokens} | Output: ${usage.completion_tokens} | Total: ${usage.total_tokens}`);

    let data;
    try {
        data = JSON.parse(extraction.choices[0].message.content);
    } catch (parseErr) {
        console.error(`❌ [AI] Failed to parse response: ${parseErr.message}`);
        console.error(`   Raw content: ${extraction.choices[0].message.content?.substring(0, 200)}`);
        return;
    }

    // Normalize status - treat APPROVED same as OFFER
    if (data.category === 'APPROVED') {
        data.category = 'OFFER';
    }

    // Clean the extracted business name - strip out company patterns
    let businessName = data.business_name || "";
    businessName = businessName
        .replace(/JMS\s*GLOBAL\s*[:\-]?\s*/gi, '')
        .replace(/New Submission from\s*/gi, '')
        .trim();

    // Fallback: extract name from subject if AI couldn't find it
    if (!businessName || businessName === "null") {
        const subjectMatch = (email.subject || '')
            .replace(/^Re:\s*/i, '')
            .replace(/^Fwd?:\s*/i, '')
            .replace(/New Submission from\s*/gi, '')
            .replace(/JMS\s*GLOBAL\s*[:\-]?\s*/gi, '')
            .trim();
        if (subjectMatch && subjectMatch.length > 2) {
            businessName = subjectMatch;
            console.log(`      �� Fallback: extracted "${businessName}" from subject line`);
        }
    }

    if (!businessName || businessName === "null" || data.category === "IGNORE") {
        console.log(`      ⏭️ [AI] Skipping: ${data.category === 'IGNORE' ? 'Status update' : 'No merchant found'}`);
        return;
    }

    const emailNameClean = normalizeName(businessName);
    const candidates = await db.query(`
        SELECT id, business_name, first_name, last_name, dba_name
        FROM conversations 
        WHERE state NOT IN ('ARCHIVED', 'DEAD')
    `);

    let bestMatchId = null;
    let highestScore = 0;

    for (const lead of candidates.rows) {
        const leadNameClean = normalizeName(lead.business_name);
        const ownerNameClean = normalizeName(
            [lead.first_name, lead.last_name].filter(Boolean).join(' ')
        );

        // Check against both business name and owner name
        const bizScore = getSimilarity(emailNameClean, leadNameClean);
        const ownerScore = ownerNameClean ? getSimilarity(emailNameClean, ownerNameClean) : 0;
        const dbaClean = normalizeName(lead.dba_name);
        const dbaScore = dbaClean ? getSimilarity(emailNameClean, dbaClean) : 0;
        const finalScore = Math.max(bizScore, ownerScore, dbaScore);

        if (finalScore > 0.85 && finalScore > highestScore) {
            highestScore = finalScore;
            bestMatchId = lead.id;
            const matchedOn = dbaScore >= bizScore && dbaScore >= ownerScore ? 'dba' : bizScore >= ownerScore ? 'business' : 'owner';
            console.log(`      🔍 Potential match: "${lead.business_name}" [${matchedOn}] (score: ${finalScore.toFixed(2)})`);
        }
    }

    if (!bestMatchId) {
        console.log(`      ⚠️ [AI] No matching lead found for: "${businessName}"`);
        return;
    }

    console.log(`      ✅ MATCH: "${businessName}" -> Lead ${bestMatchId} (${data.category})`);

    // Get assigned user's email for forwarding
    const userResult = await db.query(`
        SELECT u.email FROM users u
        JOIN conversations c ON c.assigned_user_id = u.id
        WHERE c.id = $1
    `, [bestMatchId]);
    const assignedUserEmail = userResult.rows[0]?.email;

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
        await updateState(bestMatchId, 'OFFER_RECEIVED', 'email_processor');

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
            global.io.emit('conversation_badge_update', {
                conversationId: bestMatchId,
                type: 'offer',
                has_offer: true,
                last_activity: new Date().toISOString(),
                preview: `New offer from ${validatedLender}`
            });
        }
    }

    // Build detailed note content
    let noteContent = `📩 **${validatedLender}** — ${data.category}\n`;

    if (data.summary) {
        noteContent += `\n${data.summary}\n`;
    }

    if (data.category === 'OFFER') {
        if (data.offer_amount) noteContent += `\n💰 Amount: $${Number(data.offer_amount).toLocaleString()}`;
        if (data.factor_rate) noteContent += `\n📊 Factor: ${data.factor_rate}`;
        if (data.term_length) noteContent += `\n📅 Term: ${data.term_length} ${data.term_unit || 'months'}`;
        if (data.payment_frequency) noteContent += `\n💳 Frequency: ${data.payment_frequency}`;
    }

    if (data.category === 'DECLINE' && data.decline_reason) {
        noteContent += `\n❌ Reason: ${data.decline_reason}`;
    }

    // Include snippet of actual email (trimmed)
    const snippet = (email.snippet || '').substring(0, 300).trim();
    if (snippet) {
        noteContent += `\n\n---\n_"${snippet}${snippet.length >= 300 ? '...' : ''}"_`;
    }

    const systemNote = noteContent;

    // 🟢 Also write to notes table
    try {
        const noteResult = await db.query(`
            INSERT INTO notes (conversation_id, content, created_by, source)
            VALUES ($1, $2, NULL, 'email_processor')
            RETURNING *
        `, [bestMatchId, systemNote]);

        // Emit websocket event so Notes tab updates in real-time
        if (global.io && noteResult.rows[0]) {
            const note = noteResult.rows[0];
            note.created_by_name = 'Inbox Bot';
            global.io.to(`conversation_${bestMatchId}`).emit('new_note', {
                conversationId: bestMatchId,
                note
            });
            console.log(`      📝 Note emitted via websocket`);
        }
    } catch (err) {
        console.error('      ⚠️ Failed to create note:', err.message);
    }

    // Forward to assigned user
    await forwardEmailToUser(email, assignedUserEmail, data.business_name, data.category, validatedLender);

    console.log(`      ✅ [Database] Saved results for: "${email.subject}"`);
}

module.exports = { startProcessor };
