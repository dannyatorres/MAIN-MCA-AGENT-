// backend/services/tracersService.js
const axios = require('axios');
const aiMatcher = require('./aiMatcher');
require('dotenv').config();

const TRACERS_URL = 'https://api.galaxysearchapi.com/PersonSearch';
const AP_NAME = process.env.TRACERS_AP_NAME;
const AP_PASSWORD = process.env.TRACERS_AP_PASSWORD;

async function searchBySsn(ssn, firstName, lastName, address = null, state = null) {
    try {
        // 1. CLEAN THE SSN (Remove dashes)
        const cleanSsn = ssn ? ssn.replace(/\D/g, '') : '';

        // 2. BUILD PAYLOAD
        let payload = {
            Includes: ['Addresses', 'PhoneNumbers', 'EmailAddresses', 'Aliases'],
            ResultsPerPage: 5
        };

        // STRATEGY: Send SSN ONLY for the search (Safest method)
        if (cleanSsn.length === 9) {
            payload.Ssn = cleanSsn;
            // We intentionally do NOT send names to Tracers to prevent 400 errors
        }
        else if (address && state) {
            payload.AddressLine1 = address;
            payload.State = state;
            if (firstName) payload.FirstName = firstName;
            if (lastName) payload.LastName = lastName;
        } else {
            return { success: false, error: 'Skipped: No valid SSN or Address' };
        }

        // 3. EXECUTE SEARCH
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

        // 4. THE AI JUDGE (Verification)
        // Even if we searched by SSN, we want to ensure the name matches your CSV.
        // This catches cases where the SSN might belong to a spouse or partner.
        let bestMatch = null;
        const targetName = `${firstName} ${lastName}`;

        if (firstName && lastName) {
             // We have a name from CSV, so let's ask AI to confirm the SSN result matches it
             bestMatch = await aiMatcher.pickBestMatch(targetName, address, candidates);
        } else {
             // No name in CSV? Trust the SSN result blindly.
             bestMatch = candidates[0];
        }

        if (!bestMatch) return { success: false, error: `AI Mismatch: SSN found result, but name didn't match "${targetName}"` };

        return { success: true, match: parseTracersResponse(bestMatch) };

    } catch (error) {
        if (error.response) {
            console.error(`[Tracers API Error]:`, JSON.stringify(error.response.data));
        } else {
            console.error(`[Tracers Error]:`, error.message);
        }
        return { success: false, error: error.message };
    }
}

function parseTracersResponse(person) {
    const clean = (str) => (str || '').trim();

    // Get Best Mobile
    let mobile = null;
    if (person.MobilePhones?.length) {
        // Look for 'Current' or 'Mobile' tags
        mobile = person.MobilePhones.find(p => p.LastSeenDate?.includes('Current'))?.PhoneNumber || person.MobilePhones[0].PhoneNumber;
    }

    // Get Best Address
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
