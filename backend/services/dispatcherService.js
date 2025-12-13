const { OpenAI } = require('openai');
const { getDatabase } = require('./database');
require('dotenv').config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 🛠️ TOOLS: This is how the AI interacts with your CRM
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

    try {
        // 1. GET HISTORY (Context)
        // We pull the last 15 messages so the AI knows the full story
        const history = await db.query(`
            SELECT direction, content FROM messages
            WHERE conversation_id = $1
            ORDER BY timestamp ASC
            LIMIT 15
        `, [conversationId]);

        const messages = history.rows.map(msg => ({
            role: msg.direction === 'outbound' ? 'assistant' : 'user',
            content: msg.content
        }));

        // Add the Dispatcher's specific instruction (e.g., "This lead is new...")
        messages.push({ role: "system", content: systemInstruction });

        console.log(`📚 Loaded ${history.rows.length} messages for context`);

        // 2. CONSULT OPENAI
        const completion = await openai.chat.completions.create({
            model: "gpt-4-turbo", // Smartest model for reasoning
            messages: messages,
            tools: TOOLS,
            tool_choice: "auto"
        });

        const aiMsg = completion.choices[0].message;

        console.log('🧠 AI Response:', {
            hasContent: !!aiMsg.content,
            hasToolCalls: !!aiMsg.tool_calls
        });

        // 3. EXECUTE TOOLS (If AI wants to change status)
        if (aiMsg.tool_calls) {
            for (const tool of aiMsg.tool_calls) {
                if (tool.function.name === 'update_lead_status') {
                    const args = JSON.parse(tool.function.arguments);
                    console.log(`🔄 AI Moving Lead ${conversationId} -> ${args.status}`);

                    await db.query("UPDATE conversations SET state = $1 WHERE id = $2", [args.status, conversationId]);

                    // If moving to DEAD, we might want to stop generating a reply
                    if (args.status === 'DEAD') return { shouldReply: false };
                }
            }
        }

        // 4. RETURN REPLY (If AI wrote text)
        if (aiMsg.content) {
            console.log(`💬 AI Generated Reply: "${aiMsg.content.substring(0, 100)}..."`);
            return { shouldReply: true, content: aiMsg.content };
        }

        return { shouldReply: false };

    } catch (err) {
        console.error("🔥 AI Service Error:", err.message);
        return { error: err.message };
    }
}

module.exports = { processLeadWithAI };
