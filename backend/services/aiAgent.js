// backend/services/aiAgent.js
const { OpenAI } = require('openai');
const { getDatabase } = require('./database');
const { syncDriveFiles } = require('./driveService');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 🛠️ TOOLS
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

// 📖 HELPER: Load the Global Persona from Markdown
function getGlobalPrompt() {
    try {
        const promptsDir = path.join(__dirname, '../prompts');
        
        // 1. Load Persona (Who am I?)
        const personaPath = path.join(promptsDir, 'persona.md');
        const persona = fs.existsSync(personaPath) ? fs.readFileSync(personaPath, 'utf8') : "";

        // 2. Load New Lead Strategy (The Hook)
        const strategyNewPath = path.join(promptsDir, 'strategy_new.md');
        const strategyNew = fs.existsSync(strategyNewPath) ? fs.readFileSync(strategyNewPath, 'utf8') : "";

        // 3. Load History Strategy (How to reply)
        const strategyHistoryPath = path.join(promptsDir, 'strategy_history.md');
        const strategyHistory = fs.existsSync(strategyHistoryPath) ? fs.readFileSync(strategyHistoryPath, 'utf8') : "";

        // Combine them into one "Super Brain"
        return `${persona}\n\n${strategyNew}\n\n${strategyHistory}`;

    } catch (err) {
        console.error('⚠️ Error loading strategy files:', err.message);
        return "You are Dan Torres, an underwriter at JMS Global. Keep replies short.";
    }
}

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
        // We still keep this hardcoded check for speed, BUT we removed the auto-sync as requested
        if (systemInstruction.includes("Underwriter Hook")) {
            console.log(`⚡ TEMPLATE MODE: Sending Dan Torres Script to ${nameToUse}`);
            
            // Note: We use the exact text from your strategy_new.md here for safety
            const exactTemplate = `Hi ${nameToUse} my name is Dan Torres I'm one of the underwriters at JMS Global. I'm currently going over the bank statements and the application you sent in and I wanted to make an offer. What's the best email to send the offer to?`;
            return { shouldReply: true, content: exactTemplate };
        }

        // 3. AI MODE (Thinking)
        console.log("🤖 AI MODE: Analyzing history...");

        // ✅ A. LOAD THE NEW BRAIN (Reads MD files)
        const globalPersona = getGlobalPrompt();

        // B. Get Conversation History
        const history = await db.query(`
            SELECT direction, content FROM messages
            WHERE conversation_id = $1
            ORDER BY timestamp ASC
            LIMIT 20
        `, [conversationId]);

        const messages = [];

        // ✅ C. Combine Global Persona + Specific Instruction
        messages.push({
            role: "system",
            content: `${globalPersona}
            
            CURRENT INSTRUCTION FROM SCHEDULER:
            ${systemInstruction}
            
            RULES:
            1. If they provide an email, acknowledge it.
            2. If they mentioned they SENT documents (or ask you to check), ONLY THEN use 'trigger_drive_sync'.`
        });

        // D. Add History
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
                        responseContent = "I found the documents! I'll have the offer ready shortly.";
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
