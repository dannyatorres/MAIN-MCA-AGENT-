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

        // A. The "Persona" (Always first)
        messages.push({
            role: "system",
            content: "You are Alex, a helpful funding specialist for MC Agent. Keep texts short (under 160 chars), friendly, and direct. Do not use 'Dear' or formal salutations. Your goal is to get them to apply for funding."
        });

        // B. Add the History
        if (history.rows.length > 0) {
            history.rows.forEach(msg => {
                messages.push({
                    role: msg.direction === 'outbound' ? 'assistant' : 'user',
                    content: msg.content
                });
            });

            // 🧠 SMART FIX: If history exists, override the "New Lead" instruction
            // This prevents the AI from saying "Hi, I'm Alex" to someone you've already talked to.
            console.log("📜 History detected. Switching to 'Contextual Reply' mode.");
            messages.push({
                role: "system",
                content: "SYSTEM NOTE: The user has not replied recently. Read the conversation history above and send a relevant, natural follow-up message. Do NOT re-introduce yourself if you have already spoken."
            });
        } else {
            // C. No History? Use the Dispatcher's original instruction (e.g., "Send Intro")
            console.log("🆕 No history found. Using 'New Lead' instruction.");
            messages.push({ role: "system", content: systemInstruction });
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
