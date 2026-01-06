const axios = require('axios');
require('dotenv').config();

const API_KEY = process.env.OPENCORPORATES_API_KEY;
const BASE_URL = 'https://api.opencorporates.com/v0.4';

async function lookupBusinessStartDate(companyName, state) {
    if (!companyName || !state) return null;

    try {
        // Convert state to jurisdiction code (e.g., "TX" -> "us_tx")
        const jurisdictionCode = `us_${state.toLowerCase()}`;

        const response = await axios.get(`${BASE_URL}/companies/search`, {
            params: {
                q: companyName,
                jurisdiction_code: jurisdictionCode,
                api_token: API_KEY,
                per_page: 5
            }
        });

        const companies = response.data?.results?.companies || [];

        if (companies.length === 0) return null;

        // Return best match
        const match = companies[0].company;

        return {
            incorporationDate: match.incorporation_date,  // "2018-08-16"
            status: match.current_status,
            companyNumber: match.company_number,
            officialName: match.name,
            registryUrl: match.registry_url
        };

    } catch (error) {
        console.error('[OpenCorporates] Error:', error.message);
        return null;
    }
}

module.exports = { lookupBusinessStartDate };
