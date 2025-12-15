// backend/services/dispatcherService.js
const { OpenAI } = require('openai');
const { getDatabase } = require('./database');
require('dotenv').config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
    }
];

async function processLeadWithAI(conversationId, systemInstruction) {
    const db = getDatabase();
    console.log(`🧠 AI Agent waking up for Lead ID: ${conversationId}`);

    // 1. LOG THE INSTRUCTION (The Rules)
    console.log("🧠 [DEBUG] SYSTEM INSTRUCTION:", systemInstruction);

    try {
        // 1. GET HISTORY (Context)
        const history = await db.query(`
            SELECT direction, content FROM messages
            WHERE conversation_id = $1
            ORDER BY timestamp ASC
            LIMIT 20
        `, [conversationId]);

        // 2. CONSTRUCT THE CONTEXT
        const messages = [];

        // A. The "Persona" (Base setting)
        // If no specific instruction is passed, default to a helpful assistant.
        // Otherwise, rely entirely on the systemInstruction below.
        if (!systemInstruction) {
            messages.push({
                role: "system",
                content: "You are a helpful assistant."
            });
        } else {
            // 1. Always add the Specific Strategy FIRST (Dan Torres)
            messages.push({ role: "system", content: systemInstruction });
        }

        // 2. Then add the History
        if (history.rows.length > 0) {
            history.rows.forEach(msg => {
                messages.push({
                    role: msg.direction === 'outbound' ? 'assistant' : 'user',
                    content: msg.content
                });
            });

            // Add a reminder to look at the history
            messages.push({
                role: "system",
                content: "SYSTEM NOTE: The user has replied previously. Read the history above. Do NOT re-introduce yourself."
            });
        }

        // 2. LOG THE HISTORY (What the AI sees)
        console.log("📜 [DEBUG] CHAT HISTORY SENT TO AI:", JSON.stringify(messages, null, 2));

        // 3. CALL OPENAI
        const completion = await openai.chat.completions.create({
            model: "gpt-4-turbo",
            messages: messages,
            tools: TOOLS,
            tool_choice: "auto"
        });

        const aiMsg = completion.choices[0].message;

        // 4. LOG THE RESULT (The raw thought)
        console.log("💡 [DEBUG] RAW AI REPLY:", aiMsg.content);
        if (aiMsg.tool_calls) {
            console.log("🔧 [DEBUG] TOOL CALLS:", JSON.stringify(aiMsg.tool_calls, null, 2));
        }

        // 5. EXECUTE TOOLS
        if (aiMsg.tool_calls) {
            for (const tool of aiMsg.tool_calls) {
                if (tool.function.name === 'update_lead_status') {
                    const args = JSON.parse(tool.function.arguments);
                    console.log(`🔄 AI Moving Lead ${conversationId} -> ${args.status}`);
                    await db.query("UPDATE conversations SET state = $1 WHERE id = $2", [args.status, conversationId]);
                    if (args.status === 'DEAD') return { shouldReply: false };
                }
            }
        }

        // 6. RETURN REPLY
        if (aiMsg.content) {
            return { shouldReply: true, content: aiMsg.content };
        }

        return { shouldReply: false };

    } catch (err) {
        console.error("🔥 AI Service Error:", err);
        return { error: err.message };
    }
}

module.exports = { processLeadWithAI };
