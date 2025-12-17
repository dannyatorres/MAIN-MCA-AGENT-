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

// 📖 HELPER: Load the Global Persona
function getGlobalPrompt() {
    try {
        const promptsDir = path.join(__dirname, '../prompts');
        const persona = fs.existsSync(path.join(promptsDir, 'persona.md')) ? fs.readFileSync(path.join(promptsDir, 'persona.md'), 'utf8') : "";
        const strategyNew = fs.existsSync(path.join(promptsDir, 'strategy_new.md')) ? fs.readFileSync(path.join(promptsDir, 'strategy_new.md'), 'utf8') : "";
        const strategyHistory = fs.existsSync(path.join(promptsDir, 'strategy_history.md')) ? fs.readFileSync(path.join(promptsDir, 'strategy_history.md'), 'utf8') : "";

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
        // (No OpenAI call here = 0 tokens used)
        if (systemInstruction.includes("Underwriter Hook")) {
            console.log(`⚡ TEMPLATE MODE: Sending Dan Torres Script to ${nameToUse}`);
            
            const exactTemplate = `Hi ${nameToUse} my name is Dan Torres I'm one of the underwriters at JMS Global. I'm currently going over the bank statements and the application you sent in and I wanted to make an offer. What's the best email to send the offer to?`;
            return { shouldReply: true, content: exactTemplate };
        }

        // 3. AI MODE (Thinking)
        console.log("🤖 AI MODE: Analyzing history...");

        const globalPersona = getGlobalPrompt();

        const history = await db.query(`
            SELECT direction, content FROM messages
            WHERE conversation_id = $1
            ORDER BY timestamp ASC
            LIMIT 20
        `, [conversationId]);

        const messages = [];

        messages.push({
            role: "system",
            content: `${globalPersona}
            
            CURRENT INSTRUCTION:
            ${systemInstruction}
            
            RULES:
            1. CRITICAL: If the message contains an EMAIL ADDRESS, you MUST use the function 'trigger_drive_sync' immediately.
            2. If they say they sent documents, also use 'trigger_drive_sync'.
            3. If no email or documents are mentioned, just answer the question.`
        });

        history.rows.forEach(msg => {
            messages.push({
                role: msg.direction === 'outbound' ? 'assistant' : 'user',
                content: msg.content
            });
        });

        // 🟢 CALL OPENAI (GPT-4o)
        // Using gpt-4o because it is the best at following tool-use instructions reliably.
        const completion = await openai.chat.completions.create({
            model: "gpt-4o", 
            messages: messages,
            tools: TOOLS,
            tool_choice: "auto"
        });

        // 🟢 LOG TOKEN USAGE (Shows "How much" it thought)
        const usage = completion.usage;
        if (usage) {
            console.log(`      🎟️ [AI Agent] Token Usage Report:`);
            console.log(`          - Input (Prompt): ${usage.prompt_tokens}`);
            console.log(`          - Output (Reply): ${usage.completion_tokens}`);
            console.log(`          - Total Tokens:   ${usage.total_tokens}`);
        }

        const aiMsg = completion.choices[0].message;
        let responseContent = aiMsg.content;

        // 4. HANDLE TOOLS (The Result of its Thinking)
        if (aiMsg.tool_calls) {
            for (const tool of aiMsg.tool_calls) {
                
                if (tool.function.name === 'update_lead_status') {
                    const args = JSON.parse(tool.function.arguments);
                    console.log(`🔄 AI DECISION: Moving Lead -> ${args.status}`); // <--- Decision Log
                    await db.query("UPDATE conversations SET state = $1 WHERE id = $2", [args.status, conversationId]);
                    if (args.status === 'DEAD') return { shouldReply: false };
                }

                else if (tool.function.name === 'trigger_drive_sync') {
                    console.log(`📂 AI DECISION: Check Google Drive for "${businessName}"...`); // <--- Decision Log
                    
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
