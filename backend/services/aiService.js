// services/aiService.js - OpenAI Integration Service
const OpenAI = require('openai');
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

/**
 * Generates a response from OpenAI based on the user query and conversation context.
 */
const generateResponse = async (query, context) => {
    // 1. Safety Check
    if (!isConfigured()) {
        console.warn('⚠️ OpenAI API Key is missing or invalid.');
        return {
            success: false,
            error: 'AI Service is not configured. Please add OPENAI_API_KEY to your .env file.'
        };
    }

    try {
        // 2. Build the "System Brain" (The Prompt)
        let systemPrompt = `You are an expert Merchant Cash Advance (MCA) underwriter assistant.
Your goal is to help the broker (user) close deals, analyze offers, and communicate with merchants.

CRITICAL INSTRUCTIONS:
- Lenders often reply with short, informal emails (e.g., "10k 70 days" or "Declined due to balances").
- You must interpret these informal notes clearly for the user.
- If the lender name is unknown or generic, just refer to them as "a lender".
- Be concise, professional, and data-driven.`;

        // 3. Inject the Database Data
        if (context) {
            systemPrompt += `\n\n=== CURRENT DEAL DETAILS ===`;
            if (context.business_name) systemPrompt += `\nBusiness: ${context.business_name}`;
            if (context.monthly_revenue) systemPrompt += `\nRevenue: ${context.monthly_revenue}`;
            if (context.credit_range) systemPrompt += `\nFICO: ${context.credit_range}`;
            if (context.funding_amount) systemPrompt += `\nRequested: ${context.funding_amount}`;

            // --- INJECT THE OFFERS (Even the messy ones) ---
            if (context.lender_submissions && context.lender_submissions.length > 0) {
                systemPrompt += `\n\n=== 💰 LENDER ACTIVITY (Database Records) ===`;
                context.lender_submissions.forEach(sub => {
                    // Handle "Unknown" or missing names gracefully
                    const lenderName = sub.lender_name || "Unknown Lender";

                    systemPrompt += `\n-------------------`;
                    systemPrompt += `\nLender: ${lenderName}`;
                    systemPrompt += `\nStatus: ${sub.status}`;

                    // If we have an offer amount, show it. If not, check if the "raw email" had clues.
                    if (sub.offer_amount) {
                        systemPrompt += `\nOffer Details: ${sub.offer_amount}`;
                    } else if (sub.raw_email_body) {
                        // Sometimes the offer is buried in the body if parsing failed
                        systemPrompt += `\n(Note from Email: "${sub.raw_email_body.substring(0, 100)}...")`;
                    }

                    if (sub.decline_reason) systemPrompt += `\nReason: ${sub.decline_reason}`;
                    systemPrompt += `\nDate: ${sub.date}`;
                });
            } else {
                 systemPrompt += `\n\n(No lender activity recorded in database yet)`;
            }

            // --- INJECT CHAT HISTORY ---
            if (context.recent_messages && context.recent_messages.length > 0) {
                 systemPrompt += `\n\n=== RECENT SMS HISTORY (Last 10 msgs) ===`;
                 // Reverse to show chronological order
                 const history = [...context.recent_messages].reverse();
                 history.forEach(msg => {
                    const sender = msg.direction === 'outbound' ? 'Broker (Us)' : 'Merchant (Lead)';
                    systemPrompt += `\n${sender}: "${msg.content}"`;
                 });
            }
        }

        console.log('🤖 Sending prompt to OpenAI...');

        // 4. Call OpenAI
        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: query }
            ],
            temperature: 0.7,
            max_tokens: 600,
        });

        // 5. Return Result
        return {
            success: true,
            response: completion.choices[0].message.content,
            usage: completion.usage
        };

    } catch (error) {
        console.error("❌ OpenAI API Error:", error.message);
        return { success: false, error: error.message };
    }
};

module.exports = {
    isConfigured,
    getConfiguration,
    generateResponse
};
