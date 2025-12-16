// services/aiService.js - OpenAI Integration Service
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Initialize OpenAI
// If the key is missing, we initialize nicely so the server doesn't crash on startup
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || 'dummy-key',
});

const isConfigured = () => {
    return process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.startsWith('sk-');
};

const getConfiguration = () => ({
    hasApiKey: isConfigured(),
    model: 'gpt-4o',
    maxTokens: 500,
    temperature: 0.7
});

// 🟢 NEW: Helper to load the Markdown prompt
function getSystemPrompt() {
    try {
        const promptPath = path.join(__dirname, '../prompts/chat-assistant.md');
        return fs.readFileSync(promptPath, 'utf8');
    } catch (err) {
        console.error('❌ Could not load chat prompt:', err.message);
        // Fallback if file is missing
        return `You are an expert MCA underwriter assistant. Use the provided context to answer questions.`;
    }
}

/**
 * Generates a response from OpenAI based on the user query and conversation context.
 */
const generateResponse = async (query, context) => {
    if (!isConfigured()) return { success: false, error: 'AI Key Missing' };

    try {
        // 1. Load Base Instructions from MD File
        let systemPrompt = getSystemPrompt();

        if (context) {
            // Log what the AI Service actually sees
            console.log('   🧠 [AI Service] Received Context:');
            console.log(`       - Business: ${context.business_name}`);
            console.log(`       - Has FCS? ${context.fcs ? 'YES' : 'NO'}`);
            if (context.fcs) {
                 console.log(`       - FCS ADB: ${context.fcs.average_daily_balance}`);
            }

            // 🟢 1. FULL LEAD DETAILS (Added Credit, Industry, Owner, etc.)
            systemPrompt += `\n\n=== 🏢 BUSINESS & OWNER DETAILS ===`;
            systemPrompt += `\nBusiness Name: ${context.business_name || 'Unknown'}`;
            systemPrompt += `\nOwner Name: ${context.first_name || ''} ${context.last_name || ''}`.trim();
            systemPrompt += `\nBusiness Address: ${context.address || 'N/A'}`;
            if (context.owner_city) {
                systemPrompt += `\nOwner Location: ${context.owner_city}, ${context.owner_state || ''} ${context.owner_zip || ''}`.trim();
            }
            systemPrompt += `\nIndustry: ${context.industry || 'Unknown'}`;
            systemPrompt += `\nCredit Score: ${context.credit_range || 'N/A'}`;
            const monthlyRevenue = context.monthly_revenue || (context.annual_revenue ? (context.annual_revenue / 12).toFixed(0) : null);
            systemPrompt += `\nMonthly Revenue: ${monthlyRevenue || 'N/A'}`;
            systemPrompt += `\nRequested Amount: ${context.funding_amount || 'N/A'}`;

            // 🟢 2. FCS DATA (Bank Analysis)
            if (context.fcs) {
                const fcs = context.fcs;
                systemPrompt += `\n\n=== 🏦 BANK ANALYSIS (FCS) ===`;
                systemPrompt += `\nAvg Daily Balance: ${fcs.average_daily_balance || 'N/A'}`;
                systemPrompt += `\nAvg Deposit Count: ${fcs.average_deposit_count || 'N/A'}`;
                systemPrompt += `\nNegative Days: ${fcs.total_negative_days || '0'}`;
                systemPrompt += `\nNSFs: ${fcs.total_nsfs || '0'}`;
                systemPrompt += `\nRecency: ${fcs.statement_months || 'N/A'}`;
            } else {
                systemPrompt += `\n\n(No Bank Analysis/FCS available yet)`;
            }

            // 🟢 3. LENDER OFFERS (With Email Body Context)
             if (context.lender_submissions && context.lender_submissions.length > 0) {
                systemPrompt += `\n\n=== 💰 LENDER OFFERS ===`;
                context.lender_submissions.forEach(sub => {
                    systemPrompt += `\n- Lender: ${sub.lender_name} | Status: ${sub.status}`;
                    if(sub.offer_amount) systemPrompt += ` | Offer: $${sub.offer_amount}`;
                    // Inject the email snippet so AI knows the "nuance"
                    if(sub.raw_email_body) systemPrompt += `\n  (Context: "${sub.raw_email_body.substring(0, 200)}...")`;
                    
                    // Inject history if exists
                    if (sub.offer_details && sub.offer_details.history) {
                         const history = sub.offer_details.history;
                         const lastLog = history[history.length - 1];
                         if(lastLog) systemPrompt += `\n  (Latest Update: ${lastLog.summary})`;
                    }
                });
            }
        }

        // 🟢 4. CHAT HISTORY (Memory)
        const messages = [{ role: "system", content: systemPrompt }];
        
        if (context && context.chat_history) {
            context.chat_history.forEach(msg => {
                if (['user', 'assistant'].includes(msg.role)) {
                    messages.push({ role: msg.role, content: msg.content });
                }
            });
        }

        messages.push({ role: "user", content: query });

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: messages,
            temperature: 0.7
        });

        return { success: true, response: completion.choices[0].message.content };

    } catch (error) {
        return { success: false, error: error.message };
    }
};

module.exports = {
    isConfigured,
    getConfiguration,
    generateResponse
};
