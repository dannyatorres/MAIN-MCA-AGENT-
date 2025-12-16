// backend/services/processorAgent.js
const GmailInboxService = require('./gmailInboxService');
const { getDatabase } = require('./database');
const { OpenAI } = require('openai');
require('dotenv').config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const gmail = new GmailInboxService();

// ⚡ SETTINGS
const CHECK_INTERVAL = 2 * 60 * 1000; // Check every 2 minutes
// We search for general keywords to avoid processing "Lunch Special" emails
const SEARCH_QUERY = 'subject:(Offer OR Decline OR Stipulations OR Submission OR Funding OR Approval) is:unread';

async function startProcessor() {
    console.log('👩‍💼 Processor Agent: Online (AI Extraction Mode)...');
    await runCheck();
    setInterval(runCheck, CHECK_INTERVAL);
}

async function runCheck() {
    try {
        const emails = await gmail.searchEmails(SEARCH_QUERY); // Free Filter
        if (!emails || emails.length === 0) return;

        console.log(`📨 Processor: Found ${emails.length} potential deal emails.`);

        for (const email of emails) {
            await processEmail(email);
        }
    } catch (err) {
        console.error('❌ Processor Loop Error:', err.message);
    }
}

async function processEmail(email) {
    const db = getDatabase();

    // 1. ASK AI TO READ THE LINE (Cheap & Accurate)
    // We give it the subject and snippet and ask: "Who is this for?"
    // This handles nuances like "Re: Update on Danny's Trucking" perfectly.
    const extraction = await openai.chat.completions.create({
        model: "gpt-4o-mini", // The cheap "Reader" model
        messages: [{
            role: "system",
            content: `
            You are a Data Extractor for a Merchant Cash Advance broker.
            Analyze the email metadata.

            Task:
            1. Extract the **Business Name** (The merchant seeking funding).
            2. Extract the **Lender Name** (Who sent the email).
            3. Classify the **Category**: 'OFFER', 'DECLINE', 'STIPS', 'SUBMISSION', or 'OTHER'.

            Return JSON: { "business_name": string | null, "lender": string, "category": string, "summary": string }
            `
        }, {
            role: "user",
            content: `Sender: "${email.from.name}" <${email.from.email}>\nSubject: "${email.subject}"\nSnippet: "${email.snippet}"`
        }],
        response_format: { type: "json_object" }
    });

    const data = JSON.parse(extraction.choices[0].message.content);

    if (!data.business_name) {
        console.log(`⏩ IGNORE: AI couldn't find a business name in [${email.subject}]`);
        return;
    }

    const cleanName = data.business_name.toLowerCase().replace(/[,.-]/g, "").trim();

    // 2. CHECK DATABASE (Is this MY deal?)
    // We fuzzy match the extracted name against your active leads.
    // This ensures we don't alert you about "Bob's Bakery" if Bob isn't your client.
    const res = await db.query(`
        SELECT id, business_name FROM conversations
        WHERE lower(business_name) LIKE $1
        AND state NOT IN ('ARCHIVED', 'DEAD')
        LIMIT 1
    `, [`%${cleanName.split(' ')[0]}%`]); // Match first word for broad search

    // (Note: You can use the full Fuzzy Logic function from before here if you want extra precision)
    // For simplicity, this SQL 'LIKE' checks if your DB has a company starting with the same name.

    if (res.rows.length === 0) {
        console.log(`⏩ IGNORE: "${data.business_name}" is not in your CRM.`);
        return;
    }

    const leadId = res.rows[0].id;

    // 3. INJECT INTO CONTEXT
    // It's your lead! Save the AI's summary to the chat.
    console.log(`✅ MATCH: Email for "${data.business_name}" -> Lead ID ${leadId}`);

    const systemNote = `📩 **INBOX ALERT:** Received ${data.category} from ${data.lender}.\nSummary: ${data.summary}`;

    await db.query(`
        INSERT INTO messages (conversation_id, direction, content, timestamp)
        VALUES ($1, 'system', $2, NOW())
    `, [leadId, systemNote]);

    // Optional: Send Notification to Dashboard
    if (global.io) {
        global.io.emit('notification', {
            type: data.category === 'OFFER' ? 'success' : 'info',
            title: `New ${data.category}`,
            message: `${data.lender} sent update for ${data.business_name}`
        });
    }

    // Mark as read so we don't re-process
    // await gmail.markAsRead(email.id);
}

module.exports = { startProcessor };
