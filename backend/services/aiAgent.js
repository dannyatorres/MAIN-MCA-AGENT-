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

// 📖 HELPER: Load ONLY the Master Strategy
function getGlobalPrompt() {
    try {
        const promptsDir = path.join(__dirname, '../prompts');
        const masterPath = path.join(promptsDir, 'strategy_master.md');
        
        if (fs.existsSync(masterPath)) {
            return fs.readFileSync(masterPath, 'utf8');
        } else {
            console.error("⚠️ strategy_master.md not found!");
            return "You are Dan Torres, an underwriter. Keep texts short.";
        }
    } catch (err) {
        console.error('⚠️ Error loading prompt file:', err.message);
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

        // A. THE HOOK
        if (systemInstruction.includes("Underwriter Hook")) {
            return { shouldReply: true, content: `Hi ${nameToUse} my name is Dan Torres I'm one of the underwriters at JMS Global. I'm currently going over the bank statements and the application you sent in and I wanted to make an offer. What's the best email to send the offer to?` };
        }

        // B. FOLLOW-UP 1
        if (systemInstruction.includes("Did you get funded already?")) {
            return { shouldReply: true, content: "Did you get funded already?" };
        }

        // C. FOLLOW-UP 2
        if (systemInstruction.includes("The money is expensive as is")) {
            return { shouldReply: true, content: "The money is expensive as is let me compete." };
        }

        // D. FOLLOW-UP 3
        if (systemInstruction.includes("should i close the file out?")) {
            return { shouldReply: true, content: "Hey just following up again, should i close the file out?" };
        }

        // E. FOLLOW-UP 4 (Next Day)
        if (systemInstruction.includes("any response would be appreciated")) {
            return { shouldReply: true, content: "hey any response would be appreciated here, close this out?" };
        }

        // 3. AI MODE (GPT-4o)
        console.log("🤖 AI MODE: Reading Master Strategy...");
        
        const history = await db.query(`SELECT direction, content FROM messages WHERE conversation_id = $1 ORDER BY timestamp ASC LIMIT 20`, [conversationId]);
        
        // Load the single master file
        const messages = [{ role: "system", content: getGlobalPrompt() }];
        
        history.rows.forEach(msg => {
            messages.push({ role: msg.direction === 'outbound' ? 'assistant' : 'user', content: msg.content });
        });

        // Call GPT-4o (The Frontman)
        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: messages,
            tools: TOOLS,
            tool_choice: "auto"
        });

        // Token usage logs
        if (completion.usage) {
            console.log(`      🎟️ [AI Agent] Token Usage Report:`);
            console.log(`          - Input (Prompt): ${completion.usage.prompt_tokens}`);
            console.log(`          - Output (Reply): ${completion.usage.completion_tokens}`);
            console.log(`          - Total Tokens:   ${completion.usage.total_tokens}`);
        }

        const aiMsg = completion.choices[0].message;
        let responseContent = aiMsg.content;

        // 4. HANDLE TOOLS
        if (aiMsg.tool_calls) {
            for (const tool of aiMsg.tool_calls) {
                
                if (tool.function.name === 'update_lead_status') {
                    const args = JSON.parse(tool.function.arguments);
                    await db.query("UPDATE conversations SET state = $1 WHERE id = $2", [args.status, conversationId]);
                }

                else if (tool.function.name === 'trigger_drive_sync') {
                    console.log(`📂 AI DECISION: Syncing Drive for "${businessName}"...`);
                    
                    // 1. Run Sync
                    syncDriveFiles(conversationId, businessName); 
                    
                    // 2. The Bridge Reply
                    responseContent = "Got it. While I finalize the numbers—just confirming, have you taken any new positions since you sent this application?";
                }

                else if (tool.function.name === 'consult_analyst') {
                    const args = JSON.parse(tool.function.arguments);
                    console.log(`🎓 HANDOFF: GPT-4o -> Gemini 2.5 Pro`);

                    // 1. Fetch FCS Data
                    const fcsRes = await db.query(`
                        SELECT average_revenue, total_negative_days 
                        FROM fcs_analyses WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 1
                    `, [conversationId]);

                    if (fcsRes.rows.length > 0) {
                        const fcs = fcsRes.rows[0];
                        const rev = Math.round(fcs.average_revenue || 0).toLocaleString();

                        // 2. GEMINI 2.5 PROMPTING
                        const analystPrompt = `
                            You are the Senior Analyst at JMS Global.
                            
                            DATA:
                            - Business: ${businessName}
                            - Revenue: $${rev}/mo
                            - Negatives: ${fcs.total_negative_days}
                            - User Credit: ${args.credit_score}
                            - Recent Funding: ${args.recent_funding}
                            
                            TASK:
                            Write the CLOSING text message.
                            - Mention revenue ($${rev}).
                            - Give a "Soft Offer" based on credit.
                            - End with: "I'm generating the PDF now."
                            - Keep it casual.
                        `;

                        try {
                             const result = await geminiModel.generateContent(analystPrompt);
                             responseContent = result.response.text().replace(/"/g, '').trim();
                        } catch (e) {
                             responseContent = "Got it. I'm finalizing the PDF offer now. I'll email it over in 5 minutes.";
                        }
                    } else {
                        responseContent = `Thanks. With a ${args.credit_score} score, I can work with this. I'm waiting for the bank analysis to finish. I'll email you in 5 minutes.`;
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
