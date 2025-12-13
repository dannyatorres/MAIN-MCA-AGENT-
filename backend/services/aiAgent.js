// backend/services/aiAgent.js
const { OpenAI } = require('openai');
const { getDatabase } = require('./database');
require('dotenv').config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 🛠️ DEFINE TOOLS (The "Arms" of the Agent)
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
            name: "stop_outreach",
            description: "Call this if the user says STOP, UNSUBSCRIBE, or is hostile.",
            parameters: { type: "object", properties: {} } // No params needed
        }
    }
];

async function runAgentForLead(leadId, systemInstruction) {
    const db = getDatabase();

    console.log(`🤖 AI Agent Processing Lead ${leadId}...`);

    try {
        // 1. FETCH CONTEXT (The Memory)
        // Get the last 10 messages so the AI knows what's going on
        const historyResult = await db.query(`
            SELECT content, direction, timestamp FROM messages
            WHERE conversation_id = $1
            ORDER BY timestamp ASC
            LIMIT 10
        `, [leadId]);

        const messages = historyResult.rows.map(msg => ({
            role: msg.direction === 'outbound' ? 'assistant' : 'user',
            content: msg.content
        }));

        // Add the "Boss's Orders" (Dispatcher Instruction)
        messages.unshift({ role: "system", content: systemInstruction });

        console.log(`📚 Loaded ${historyResult.rows.length} messages for context`);

        // 2. THE THINKING LOOP (Call OpenAI)
        const completion = await openai.chat.completions.create({
            model: "gpt-4-turbo", // or "gpt-4o"
            messages: messages,
            tools: TOOLS,
            tool_choice: "auto"
        });

        const responseMessage = completion.choices[0].message;

        console.log('🧠 AI Response:', {
            hasContent: !!responseMessage.content,
            hasToolCalls: !!responseMessage.tool_calls,
            toolCount: responseMessage.tool_calls?.length || 0
        });

        // 3. CHECK FOR TOOLS (Did AI want to update status?)
        if (responseMessage.tool_calls) {
            for (const toolCall of responseMessage.tool_calls) {
                const fnName = toolCall.function.name;
                const args = JSON.parse(toolCall.function.arguments);

                if (fnName === 'update_lead_status') {
                    console.log(`📝 AI Moving Lead ${leadId} to ${args.status}`);
                    await db.query("UPDATE conversations SET state = $1 WHERE id = $2", [args.status, leadId]);
                }

                if (fnName === 'stop_outreach') {
                    console.log(`🛑 AI Stopping outreach for ${leadId}`);
                    await db.query("UPDATE conversations SET state = 'DEAD' WHERE id = $1", [leadId]);
                    return { success: true, action: "stopped", lead_id: leadId };
                }
            }
        }

        // 4. RETURN REPLY (If AI wrote a message)
        if (responseMessage.content) {
            console.log(`💬 AI Generated Reply: "${responseMessage.content.substring(0, 100)}..."`);

            return {
                success: true,
                reply: responseMessage.content,
                lead_id: leadId,
                tokens_used: completion.usage?.total_tokens || 0
            };
        }

        return { success: true, action: "no_reply_needed", lead_id: leadId };

    } catch (err) {
        console.error("🔥 AI Brain Error:", err.message);
        return { success: false, error: err.message, lead_id: leadId };
    }
}

module.exports = { runAgentForLead };
