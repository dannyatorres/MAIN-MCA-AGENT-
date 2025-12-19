// backend/services/tracersService.js
const axios = require('axios');
const aiMatcher = require('./aiMatcher');
require('dotenv').config();

const TRACERS_URL = 'https://api.galaxysearchapi.com/PersonSearch';
const AP_NAME = process.env.TRACERS_AP_NAME;
const AP_PASSWORD = process.env.TRACERS_AP_PASSWORD;

async function searchBySsn(ssn, firstName, lastName, address = null, state = null) {
    try {
        const cleanSsn = ssn ? ssn.replace(/\D/g, '') : '';
        let candidates = [];
        let searchMethod = '';

        // ==========================================
        // ATTEMPT 1: SEARCH BY SSN
        // ==========================================
        if (cleanSsn.length === 9) {
            console.log(`[Tracers] Attempt 1: Searching by SSN (${cleanSsn})...`);

            const ssnResults = await callTracers({
                Ssn: cleanSsn,
                // CRITICAL FIX: Added 'AllowSearchBySsn' permission flag
                Includes: [
                    'Addresses',
                    'PhoneNumbers',
                    'EmailAddresses',
                    'Akas',
                    'AllowSearchBySsn'
                ],
                ResultsPerPage: 5
            });

            if (ssnResults && ssnResults.length > 0) {
                console.log(`   > SSN Search Successful. Found ${ssnResults.length} candidates.`);
                candidates = ssnResults;
                searchMethod = 'SSN';
            } else {
                console.log(`   > SSN Search returned 0 results.`);
            }
        }

        // ==========================================
        // ATTEMPT 2: SEARCH BY NAME + ADDRESS (Fallback)
        // ==========================================
        if (candidates.length === 0 && address && state && firstName) {
            console.log(`[Tracers] Fallback: Searching by Name + Address...`);
            const addrResults = await callTracers({
                FirstName: firstName,
                LastName: lastName,
                AddressLine1: address,
                State: state,
                Includes: ['Addresses', 'PhoneNumbers', 'EmailAddresses', 'Akas'],
                ResultsPerPage: 5
            });

            if (addrResults && addrResults.length > 0) {
                candidates = addrResults;
                searchMethod = 'ADDRESS';
            }
        }

        // ==========================================
        // THE VERDICT (AI Judge)
        // ==========================================
        if (candidates.length === 0) {
            return { success: false, error: 'No results found (SSN or Name/Address)' };
        }

        let bestMatch = null;
        const targetName = `${firstName} ${lastName}`;

        if (searchMethod === 'SSN') {
            // If we found them by SSN, we trust it.
            // But we pass it to AI to log if the name is totally different (e.g. Spouse).
            if (firstName) {
                const aiCheck = await aiMatcher.pickBestMatch(targetName, address, candidates);
                // We prioritize the SSN match even if AI is unsure, because SSN is unique.
                bestMatch = aiCheck || candidates[0];
            } else {
                bestMatch = candidates[0];
            }
        } else {
            // If we searched by Address, we MUST use AI to confirm it's the right person.
            bestMatch = await aiMatcher.pickBestMatch(targetName, address, candidates);
        }

        if (!bestMatch) return { success: false, error: `AI Mismatch: Candidates found but didn't match "${targetName}"` };

        return { success: true, match: parseTracersResponse(bestMatch) };

    } catch (error) {
        console.error(`[Tracers Logic Error]:`, error.message);
        return { success: false, error: error.message };
    }
}

// Helper: Handles the API call and Error Logging
async function callTracers(payload) {
    try {
        const response = await axios.post(TRACERS_URL, payload, {
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'galaxy-ap-name': AP_NAME,
                'galaxy-ap-password': AP_PASSWORD,
                'galaxy-search-type': 'Person'
            }
        });
        return response.data?.PersonSearchResults || [];
    } catch (error) {
        if (error.response) {
            // Detailed API Error Log
            console.error(`[Tracers API Error]: ${error.response.status}`, JSON.stringify(error.response.data));
        } else {
            console.error(`[Tracers Network Error]:`, error.message);
        }
        return [];
    }
}

function parseTracersResponse(person) {
    const clean = (str) => (str || '').trim();

    // Get Best Mobile
    let mobile = null;
    if (person.MobilePhones?.length) {
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
