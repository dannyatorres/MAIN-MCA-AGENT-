const { OpenAI } = require('openai');
const { getDatabase } = require('./database');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

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
    console.log(`🧠 AI Loading Brain for Lead: ${conversationId}`);

    try {
        // 1. GET HISTORY
        const history = await db.query(`
            SELECT direction, content FROM messages 
            WHERE conversation_id = $1 
            ORDER BY timestamp ASC
            LIMIT 20
        `, [conversationId]);

        // 2. BUILD THE CONTEXT
        const messages = [];

        // A. LOAD CORE PERSONA (Always First)
        messages.push({ 
            role: "system", 
            content: loadPrompt('persona.md') 
        });

        // B. DECIDE STRATEGY (New vs. Old)
        if (history.rows.length > 0) {
            // --- SCENARIO: HISTORY EXISTS ---
            console.log("📜 Strategy: History detected.");
            
            // Load the 'History Strategy' file
            messages.push({ 
                role: "system", 
                content: loadPrompt('strategy_history.md') 
            });

            // Add the actual history messages
            history.rows.forEach(msg => {
                messages.push({
                    role: msg.direction === 'outbound' ? 'assistant' : 'user',
                    content: msg.content
                });
            });

        } else {
            // --- SCENARIO: NEW LEAD ---
            console.log("🆕 Strategy: New Lead.");

            // Load the 'New Lead Strategy' file
            messages.push({ 
                role: "system", 
                content: loadPrompt('strategy_new.md') 
            });

            // Add the specific trigger instruction (e.g. "This lead came from Facebook")
            messages.push({ 
                role: "system", 
                content: `SPECIFIC TASK: ${systemInstruction}` 
            });
        }

        // 3. ASK OPENAI
        const completion = await openai.chat.completions.create({
            model: "gpt-4-turbo",
            messages: messages,
            tools: TOOLS,
            tool_choice: "auto"
        });

        const aiMsg = completion.choices[0].message;

        // 4. EXECUTE TOOLS
        if (aiMsg.tool_calls) {
            for (const tool of aiMsg.tool_calls) {
                if (tool.function.name === 'update_lead_status') {
                    const args = JSON.parse(tool.function.arguments);
                    console.log(`🔄 Status Change: ${args.status}`);
                    await db.query("UPDATE conversations SET state = $1 WHERE id = $2", [args.status, conversationId]);
                    if (args.status === 'DEAD') return { shouldReply: false };
                }
            }
        }

        // 5. RETURN REPLY
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