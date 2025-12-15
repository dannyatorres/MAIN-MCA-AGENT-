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
    console.log(`🧠 Processing Lead ID: ${conversationId}`);

    try {
        // 1. GET LEAD DETAILS (Fetching Name for the Template)
        // We try to find a real person's name first.
        const leadRes = await db.query(
            "SELECT first_name, business_name FROM conversations WHERE id = $1",
            [conversationId]
        );

        const lead = leadRes.rows[0];
        // Logic: Use First Name ("Belinda") -> fallback to Business ("JMS Global") -> fallback to "there"
        const nameToUse = lead?.first_name || lead?.business_name || "there";

        // 2. CHECK: IS THIS THE "HOOK"? (The Template Strategy)
        // If the instruction mentions the 'Underwriter Hook', we SKIP OpenAI.
        if (systemInstruction.includes("Underwriter Hook")) {
            console.log(`⚡ TEMPLATE MODE: Sending Dan Torres Script to ${nameToUse}`);

            // --- 📝 YOUR EXACT SCRIPT IS HERE 📝 ---
            const exactTemplate = `Hi ${nameToUse} my name is Dan Torres I'm one of the underwriters at JMS Global. I'm currently going over the bank statements and the application you sent in and I wanted to make an offer. What's the best email to send the offer to?`;
            // ---------------------------------------

            return { shouldReply: true, content: exactTemplate };
        }

        // ============================================================
        // 🤖 AI MODE (Only used for replies/conversations)
        // ============================================================

        console.log("🤖 AI MODE: Generating smart reply...");

        // 1. Get History
        const history = await db.query(`
            SELECT direction, content FROM messages
            WHERE conversation_id = $1
            ORDER BY timestamp ASC
            LIMIT 20
        `, [conversationId]);

        const messages = [];

        // 2. Add System Instruction
        messages.push({
            role: "system",
            content: `${systemInstruction} \n\nIMPORTANT: Keep it short (under 160 chars). You are chatting via SMS.`
        });

        // 3. Add Conversation History
        history.rows.forEach(msg => {
            messages.push({
                role: msg.direction === 'outbound' ? 'assistant' : 'user',
                content: msg.content
            });
        });

        // 4. Call OpenAI (Only for replies)
        const completion = await openai.chat.completions.create({
            model: "gpt-4-turbo",
            messages: messages,
            tools: TOOLS,
            tool_choice: "auto"
        });

        const aiMsg = completion.choices[0].message;

        // Handle Tool Calls (Status Updates)
        if (aiMsg.tool_calls) {
            for (const tool of aiMsg.tool_calls) {
                if (tool.function.name === 'update_lead_status') {
                    const args = JSON.parse(tool.function.arguments);
                    console.log(`🔄 AI Moving Lead -> ${args.status}`);
                    await db.query("UPDATE conversations SET state = $1 WHERE id = $2", [args.status, conversationId]);
                    if (args.status === 'DEAD') return { shouldReply: false };
                }
            }
        }

        // Handle Text Reply
        if (aiMsg.content) {
            return { shouldReply: true, content: aiMsg.content };
        }

        return { shouldReply: false };

    } catch (err) {
        console.error("🔥 Service Error:", err);
        return { error: err.message };
    }
}

module.exports = { processLeadWithAI };
