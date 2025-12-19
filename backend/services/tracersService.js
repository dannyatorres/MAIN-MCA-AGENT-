// backend/services/tracersService.js
const axios = require('axios');
const aiMatcher = require('./aiMatcher'); // Import the Judge
require('dotenv').config();

const TRACERS_URL = 'https://api.galaxysearchapi.com/PersonSearch';
const AP_NAME = process.env.TRACERS_AP_NAME;
const AP_PASSWORD = process.env.TRACERS_AP_PASSWORD;

async function searchBySsn(ssn, firstName, lastName, address = null, state = null) {
    try {
        let payload = {
            FirstName: firstName,
            LastName: lastName,
            Includes: ['Addresses', 'PhoneNumbers', 'EmailAddresses', 'Aliases'], // Ask for Aliases too
            ResultsPerPage: 5 // Get Top 5 for the AI to choose from
        };

        // PRIORITY 1: SSN Search
        if (ssn && ssn.replace(/\D/g, '').length === 9) {
            payload.Ssn = ssn.replace(/\D/g, '');
        }
        // PRIORITY 2: Address Fallback
        else if (address && state) {
            payload.AddressLine1 = address;
            payload.State = state;
        } else {
            return { success: false, error: 'Not enough data' };
        }

        // 1. Call Tracers
        const response = await axios.post(TRACERS_URL, payload, {
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'galaxy-ap-name': AP_NAME,
                'galaxy-ap-password': AP_PASSWORD,
                'galaxy-search-type': 'Person'
            }
        });

        const data = response.data;
        if (!data || !data.PersonSearchResults || data.PersonSearchResults.length === 0) {
            return { success: false, error: 'No results' };
        }

        const candidates = data.PersonSearchResults;

        // 2. THE AI HANDOFF
        // If we used SSN, we trust Tracers #1. If we used Name/Address, we ask AI.
        let bestMatch;
        if (payload.Ssn) {
            bestMatch = candidates[0]; // SSN is exact, no AI needed
        } else {
            // Fuzzy Match! Ask the Judge.
            const targetName = `${firstName} ${lastName}`;
            bestMatch = await aiMatcher.pickBestMatch(targetName, address, candidates);
        }

        if (!bestMatch) return { success: false, error: 'AI Verification Failed' };

        return { success: true, match: parseTracersResponse(bestMatch) };

    } catch (error) {
        console.error(`[Tracers] Error:`, error.message);
        return { success: false, error: error.message };
    }
}

function parseTracersResponse(person) {
    const clean = (str) => (str || '').trim();

    // Find Best Mobile
    let mobile = null;
    if (person.MobilePhones?.length) {
        mobile = person.MobilePhones.find(p => p.LastSeenDate?.includes('Current'))?.PhoneNumber || person.MobilePhones[0].PhoneNumber;
    }

    // Find Best Address
    let addr = null;
    if (person.Addresses?.length) {
        addr = person.Addresses.find(a => a.LastSeenDate?.includes('Current')) || person.Addresses[0];
    }

    return {
        phone: mobile ? mobile.replace(/\D/g, '') : null,
        address: clean(addr?.AddressLine1),
        city: clean(addr?.City),
        state: clean(addr?.State),
        zip: clean(addr?.Zip)
    };
}

module.exports = { searchBySsn };
