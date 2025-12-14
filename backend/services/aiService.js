const { OpenAI } = require('openai');
const { getDatabase } = require('./database');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { syncDriveFiles } = require('./driveService'); // <--- Import it

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 🛠️ HELPER: Load Markdown Files
function loadPrompt(filename) {
    try {
        return fs.readFileSync(path.join(__dirname, '../prompts', filename), 'utf8');
    } catch (err) {
        console.error(`❌ Error loading prompt ${filename}:`, err);
        return ""; // Fail safe
    }
}

const TOOLS = [
    {
        type: "function",
        function: {
            name: "update_lead_email",
            description: "Saves the user's email address and updates their status.",
            parameters: {
                type: "object",
                properties: {
                    email: { type: "string", description: "The email address provided by the user." },
                    status: { type: "string", enum: ["FCS_QUEUE", "INTERESTED"], description: "Move to FCS Queue" }
                },
                required: ["email"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "update_lead_status",
            description: "Updates the lead's status/stage in the CRM.",
            parameters: {
                type: "object",
                properties: {
                    status: {
                        type: "string",
                        enum: ["INTERESTED", "QUALIFIED", "FCS_RUNNING", "NEGOTIATING", "DEAD", "ARCHIVED"],
                        description: "The new status to move the lead to."
                    }
                },
                required: ["status"]
            }
        }
    }
];

async function processLeadWithAI(conversationId, systemInstruction) {
    const db = getDatabase();
    console.log(`🧠 AI Loading Full Context for Lead: ${conversationId}`);

    try {
        // 1. FETCH ALL DATA IN PARALLEL (Messages + Lead Details + FCS)
        const [historyRes, leadRes, fcsRes] = await Promise.all([
            // A. Chat History
            db.query(`
                SELECT direction, content FROM messages 
                WHERE conversation_id = $1 ORDER BY timestamp ASC LIMIT 20
            `, [conversationId]),
            
            // B. Lead Details (Revenue, Funding Amount, etc.)
            db.query(`
                SELECT c.business_name, c.us_state, c.first_name,
                       ld.annual_revenue, ld.funding_amount, ld.business_type, ld.business_start_date
                FROM conversations c
                LEFT JOIN lead_details ld ON c.id = ld.conversation_id
                WHERE c.id = $1
            `, [conversationId]),

            // C. FCS Report (Bank Analysis)
            db.query(`
                SELECT average_revenue, average_deposits, total_negative_days, fcs_report
                FROM fcs_analyses 
                WHERE conversation_id = $1 
                ORDER BY created_at DESC LIMIT 1
            `, [conversationId])
        ]);

        // 2. BUILD THE "FACT SHEET"
        // This creates a cheat sheet the AI reads before talking
        const lead = leadRes.rows[0] || {};
        const fcs = fcsRes.rows[0] || null;

        let factSheet = `
        # LEAD INTELLIGENCE
        - **Business Name:** ${lead.business_name || "Unknown"}
        - **Location:** ${lead.us_state || "Unknown"}
        - **Industry:** ${lead.business_type || "Unknown"}
        - **Self-Reported Revenue:** ${lead.annual_revenue ? '$' + lead.annual_revenue : "Unknown"}
        - **Requested Amount:** ${lead.funding_amount ? '$' + lead.funding_amount : "Unknown"}
        `;

        if (fcs) {
            factSheet += `
            # BANK ANALYSIS (FCS REPORT)
            - **Verified Avg Revenue:** $${fcs.average_revenue || 0}
            - **Verified Avg Deposits:** $${fcs.average_deposits || 0}
            - **Negative Days:** ${fcs.total_negative_days || 0} (Risk Factor)
            - **Analyst Notes:** ${fcs.fcs_report || "None"}
            `;
        } else {
            factSheet += `\n# BANK ANALYSIS\n- No bank statements analyzed yet. Goal: Get them to upload statements.`;
        }

        // 3. BUILD THE AI PROMPT
        const messages = [];

        // A. Load Persona
        messages.push({ role: "system", content: loadPrompt('persona.md') });

        // B. Inject The Fact Sheet (THIS IS NEW)
        messages.push({ role: "system", content: `SYSTEM DATA:\n${factSheet}` });

        // C. Decide Strategy (History vs New)
        if (historyRes.rows.length > 0) {
            console.log("📜 Strategy: Contextual Reply");
            messages.push({ role: "system", content: loadPrompt('strategy_history.md') });
            
            // Add real chat history
            historyRes.rows.forEach(msg => {
                messages.push({
                    role: msg.direction === 'outbound' ? 'assistant' : 'user',
                    content: msg.content
                });
            });
        } else {
            console.log("🆕 Strategy: Cold Outreach");
            // Load the template
            let strategy = loadPrompt('strategy_new.md');

            // Inject Real Name (Get this from your leadRes query earlier)
            const firstName = leadRes.rows[0]?.first_name || "there";
            strategy = strategy.replace('{{first_name}}', firstName);

            messages.push({ role: "system", content: strategy });
            messages.push({ role: "system", content: `TRIGGER: ${systemInstruction}` });
        }

        // 4. ASK OPENAI
        const completion = await openai.chat.completions.create({
            model: "gpt-4-turbo",
            messages: messages,
            tools: TOOLS,
            tool_choice: "auto"
        });

        const aiMsg = completion.choices[0].message;

        // 5. EXECUTE TOOLS (Status Updates)
        if (aiMsg.tool_calls) {
            for (const tool of aiMsg.tool_calls) {
                if (tool.function.name === 'update_lead_status') {
                    const args = JSON.parse(tool.function.arguments);
                    await db.query("UPDATE conversations SET state = $1 WHERE id = $2", [args.status, conversationId]);
                    if (args.status === 'DEAD') return { shouldReply: false };
                }
                if (tool.function.name === 'update_lead_email') {
                    const args = JSON.parse(tool.function.arguments);
                    
                    // 1. Save Email
                    await db.query(`UPDATE conversations SET email = $1, state = 'FCS_QUEUE' WHERE id = $2`, 
                        [args.email, conversationId]);

                    // 2. TRIGGER DRIVE SYNC (Fire and Forget)
                    // We don't await this because it might take 30 seconds to download files.
                    // Let the AI reply to the user immediately while the files download in background.
                    
                    // Fetch business name first
                    const convData = await db.query("SELECT business_name FROM conversations WHERE id = $1", [conversationId]);
                    const bizName = convData.rows[0]?.business_name;

                    if (bizName) {
                        console.log("🚀 Triggering Background Drive Sync...");
                        syncDriveFiles(conversationId, bizName)
                            .then(res => console.log("Background Sync Result:", res))
                            .catch(err => console.error("Background Sync Failed:", err));
                    }
                }
            }
        }

        // 6. RETURN REPLY
        if (aiMsg.content) return { shouldReply: true, content: aiMsg.content };
        return { shouldReply: false };

    } catch (err) {
        console.error("🔥 AI Context Error:", err);
        return { error: err.message };
    }
}

module.exports = { processLeadWithAI };