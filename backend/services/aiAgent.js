// backend/services/aiAgent.js
const { OpenAI } = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { getDatabase } = require('./database');
const { syncDriveFiles } = require('./driveService');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

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
                        description: "The new status."
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
            description: "Call this immediately when you get an EMAIL address.",
            parameters: { type: "object", properties: {} } 
        }
    },
    {
        type: "function",
        function: {
            name: "consult_analyst",
            description: "Call this ONLY when you have: 1. Email, 2. Funding Status, 3. Credit Score.",
            parameters: { 
                type: "object", 
                properties: {
                    credit_score: { type: "string", description: "The user's stated credit score" },
                    recent_funding: { type: "string", description: "Details on any new positions (or 'None')" }
                },
                required: ["credit_score", "recent_funding"]
            } 
        }
    }
];

// 📖 HELPER: Load Persona + Strategy
function getGlobalPrompt() {
    try {
        const promptsDir = path.join(__dirname, '../prompts');
        const personaPath = path.join(promptsDir, 'persona.md');
        const strategyPath = path.join(promptsDir, 'strategy_logic.md');
        
        let combinedPrompt = "";

        if (fs.existsSync(personaPath)) {
            combinedPrompt += fs.readFileSync(personaPath, 'utf8') + "\n\n";
        } else {
            combinedPrompt += "You are Dan Torres, an underwriter. Keep texts short.\n\n";
        }

        if (fs.existsSync(strategyPath)) {
            combinedPrompt += fs.readFileSync(strategyPath, 'utf8');
        }

        return combinedPrompt;

    } catch (err) {
        console.error('⚠️ Error loading prompt files:', err.message);
        return "You are Dan Torres. Keep texts short.";
    }
}

async function processLeadWithAI(conversationId, systemInstruction) {
    const db = getDatabase();
    console.log(`🧠 AI Agent Processing Lead: ${conversationId}`);

    try {
        // 1. GET LEAD DETAILS 
        const leadRes = await db.query("SELECT first_name, business_name FROM conversations WHERE id = $1", [conversationId]);
        const lead = leadRes.rows[0];
        const nameToUse = lead?.first_name || lead?.business_name || "there";
        const businessName = lead?.business_name || "Unknown Business";

        // 2. TEMPLATE MODE (The "Free" Drip Campaign)
        // Checks instructions from index.js and returns text instantly.
        if (systemInstruction.includes("Underwriter Hook")) {
            return { shouldReply: true, content: `Hi ${nameToUse} my name is Dan Torres I'm one of the underwriters at JMS Global. I'm currently going over the bank statements and the application you sent in and I wanted to make an offer. What's the best email to send the offer to?` };
        }
        if (systemInstruction.includes("Did you get funded already?")) {
            return { shouldReply: true, content: "Did you get funded already?" };
        }
        if (systemInstruction.includes("The money is expensive as is")) {
            return { shouldReply: true, content: "The money is expensive as is let me compete." };
        }
        if (systemInstruction.includes("should i close the file out?")) {
            return { shouldReply: true, content: "Hey just following up again, should i close the file out?" };
        }
        if (systemInstruction.includes("any response would be appreciated")) {
            return { shouldReply: true, content: "hey any response would be appreciated here, close this out?" };
        }

        // 3. AI MODE (GPT-4o)
        console.log("🤖 AI MODE: Reading Strategy...");
        
        const history = await db.query(`SELECT direction, content FROM messages WHERE conversation_id = $1 ORDER BY timestamp ASC LIMIT 20`, [conversationId]);
        
        // Build the Message Chain
        let messages = [{ role: "system", content: getGlobalPrompt() }];
        
        history.rows.forEach(msg => {
            messages.push({ role: msg.direction === 'outbound' ? 'assistant' : 'user', content: msg.content });
        });

        // --- FIRST PASS (Decide what to do) ---
        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: messages,
            tools: TOOLS,
            tool_choice: "auto"
        });

        const aiMsg = completion.choices[0].message;
        let responseContent = aiMsg.content;

        // 4. HANDLE TOOLS & RE-THINK
        if (aiMsg.tool_calls) {
            
            // Add the AI's tool decision to history
            messages.push(aiMsg);

            for (const tool of aiMsg.tool_calls) {
                let toolResult = "";

                if (tool.function.name === 'update_lead_status') {
                    const args = JSON.parse(tool.function.arguments);
                    await db.query("UPDATE conversations SET state = $1 WHERE id = $2", [args.status, conversationId]);
                    toolResult = `Status updated to ${args.status}.`;
                }

                else if (tool.function.name === 'trigger_drive_sync') {
                    console.log(`📂 AI DECISION: Syncing Drive for "${businessName}"...`);
                    syncDriveFiles(conversationId, businessName); 
                    toolResult = "Drive sync started in background.";
                }

                else if (tool.function.name === 'consult_analyst') {
                    const args = JSON.parse(tool.function.arguments);
                    console.log(`🎓 HANDOFF: GPT-4o -> Gemini 2.5 Pro`);

                    const fcsRes = await db.query(`SELECT average_revenue, total_negative_days FROM fcs_analyses WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 1`, [conversationId]);

                    if (fcsRes.rows.length > 0) {
                        const fcs = fcsRes.rows[0];
                        const rev = Math.round(fcs.average_revenue || 0).toLocaleString();

                        const analystPrompt = `
                            You are the Senior Analyst at JMS Global.
                            DATA: Revenue: $${rev}/mo, Negatives: ${fcs.total_negative_days}, Credit: ${args.credit_score}, Funding: ${args.recent_funding}
                            TASK: Write the CLOSING text message. Mention revenue. Give a "Soft Offer". End with: "I'm generating the PDF now."
                        `;
                        try {
                             const result = await geminiModel.generateContent(analystPrompt);
                             toolResult = result.response.text().replace(/"/g, '').trim();
                        } catch (e) {
                             toolResult = "Got it. I'm finalizing the PDF offer now.";
                        }
                    } else {
                        toolResult = `Analysis pending. Tell user you will email them in 5 mins.`;
                    }
                }

                messages.push({
                    role: "tool",
                    tool_call_id: tool.id,
                    content: toolResult
                });
            }

            // --- SECOND PASS (Generate the Final Reply with Context) ---
            const secondPass = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: messages
            });

            responseContent = secondPass.choices[0].message.content;
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
