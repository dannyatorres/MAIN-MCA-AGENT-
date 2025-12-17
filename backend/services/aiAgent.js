// backend/services/aiAgent.js
// FORMERLY: dispatcherService.js
// HANDLES: All AI Logic, "Dan Torres" Templates, and Drive Syncing

const { OpenAI } = require('openai');
const { getDatabase } = require('./database');
const { syncDriveFiles } = require('./driveService'); // ✅ Connected to Drive
require('dotenv').config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 🛠️ TOOLS (The capabilities of your agent)
const TOOLS = [
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
    },
    {
        type: "function",
        function: {
            name: "trigger_drive_sync",
            description: "Checks Google Drive for documents matching this business name.",
            parameters: { type: "object", properties: {} } 
        }
    }
];

// 🧠 THE MAIN FUNCTION
async function processLeadWithAI(conversationId, systemInstruction) {
    const db = getDatabase();
    console.log(`🧠 AI Agent Processing Lead: ${conversationId}`);

    try {
        // 1. GET LEAD DETAILS 
        const leadRes = await db.query(
            "SELECT first_name, business_name FROM conversations WHERE id = $1",
            [conversationId]
        );

        const lead = leadRes.rows[0];
        const nameToUse = lead?.first_name || lead?.business_name || "there";
        const businessName = lead?.business_name || "Unknown Business";

        // 2. TEMPLATE MODE: "Underwriter Hook"
        if (systemInstruction.includes("Underwriter Hook")) {
            console.log(`⚡ TEMPLATE MODE: Sending Dan Torres Script to ${nameToUse}`);
            
            // Auto-check Drive in background
            syncDriveFiles(conversationId, businessName).catch(e => console.error("Background sync err:", e.message));

            const exactTemplate = `Hi ${nameToUse} my name is Dan Torres I'm one of the underwriters at JMS Global. I'm currently going over the bank statements and the application you sent in and I wanted to make an offer. What's the best email to send the offer to?`;
            return { shouldReply: true, content: exactTemplate };
        }

        // 3. AI MODE (Thinking)
        console.log("🤖 AI MODE: Analyzing history...");

        const history = await db.query(`
            SELECT direction, content FROM messages
            WHERE conversation_id = $1
            ORDER BY timestamp ASC
            LIMIT 20
        `, [conversationId]);

        const messages = [];

        messages.push({
            role: "system",
            content: `${systemInstruction} 
            
            RULES:
            1. If the user mentions sending docs, checking for files, or asks if you got them, CALL the 'trigger_drive_sync' tool.
            2. Keep replies short (under 160 chars).`
        });

        history.rows.forEach(msg => {
            messages.push({
                role: msg.direction === 'outbound' ? 'assistant' : 'user',
                content: msg.content
            });
        });

        const completion = await openai.chat.completions.create({
            model: "gpt-4-turbo",
            messages: messages,
            tools: TOOLS,
            tool_choice: "auto"
        });

        const aiMsg = completion.choices[0].message;
        let responseContent = aiMsg.content;

        // 4. HANDLE TOOLS
        if (aiMsg.tool_calls) {
            for (const tool of aiMsg.tool_calls) {
                
                // A. STATUS UPDATE
                if (tool.function.name === 'update_lead_status') {
                    const args = JSON.parse(tool.function.arguments);
                    console.log(`🔄 AI Moving Lead -> ${args.status}`);
                    await db.query("UPDATE conversations SET state = $1 WHERE id = $2", [args.status, conversationId]);
                    if (args.status === 'DEAD') return { shouldReply: false };
                }

                // B. DRIVE SYNC
                else if (tool.function.name === 'trigger_drive_sync') {
                    console.log(`📂 AI decided to check Google Drive for "${businessName}"...`);
                    
                    const syncResult = await syncDriveFiles(conversationId, businessName);
                    
                    if (syncResult.success && syncResult.count > 0) {
                        responseContent = "I just found the documents! I'll review them and get back to you shortly.";
                    } else {
                        responseContent = "I'm checking the folder now but don't see them yet. Did you upload them recently?";
                    }
                }
            }
        }

        if (responseContent) {
            return { shouldReply: true, content: responseContent };
        }

        return { shouldReply: false };

    } catch (err) {
        console.error("🔥 AI Agent Error:", err);
        return { error: err.message };
    }
}

module.exports = { processLeadWithAI };
