// backend/services/aiMatcher.js
const OpenAI = require('openai');
require('dotenv').config();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

async function pickBestMatch(csvName, csvAddress, candidates) {
    try {
        const simplifiedCandidates = candidates.map((c, index) => ({
            id: index,
            name: `${c.FirstName} ${c.LastName}`,
            aliases: c.Akas || c.Aliases || [],
            age: c.Age,
            address: c.Addresses?.[0]?.AddressLine1 || 'N/A',
            state: c.Addresses?.[0]?.State || 'N/A'
        }));

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: `You are a Data Verification Expert.
                    Your job is to match a "Target Person" from a messy CSV to a list of "Search Results".

                    RULES:
                    1. Account for nicknames (John = Jonathan, Bill = William).
                    2. Account for name swaps (Ahmad Hussain = Hussain Ahmad).
                    3. Account for typos (Dwyane = Dwayne).
                    4. If the CSV name is a business name (e.g., "ABC LLC"), look for the Registered Agent or Owner in the results.
                    5. Return ONLY the ID of the best match. If none match, return -1.`
                },
                {
                    role: "user",
                    content: `TARGET: "${csvName}" (Located in: ${csvAddress || 'Unknown'})

                    CANDIDATES:
                    ${JSON.stringify(simplifiedCandidates, null, 2)}

                    Which ID is the correct person? Return JSON: {"matchId": number, "reason": "string"}`
                }
            ],
            response_format: { type: "json_object" },
            temperature: 0
        });

        const result = JSON.parse(response.choices[0].message.content);

        if (result.matchId !== -1) {
            const matchedName = simplifiedCandidates[result.matchId]?.name || 'Unknown';
            console.log(`[AI] Matching "${csvName}" → Best match: "${matchedName}" (${result.reason})`);
            return candidates[result.matchId];
        } else {
            console.log(`[AI] Matching "${csvName}" → No match found`);
            return null;
        }

    } catch (error) {
        console.error("[AI Error]:", error.message);
        return candidates[0];
    }
}

module.exports = { pickBestMatch };
