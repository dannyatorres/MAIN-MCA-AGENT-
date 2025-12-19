// backend/services/tracersService.js
const axios = require('axios');
const aiMatcher = require('./aiMatcher');
require('dotenv').config();

const TRACERS_URL = 'https://api.galaxysearchapi.com/PersonSearch';
const AP_NAME = process.env.TRACERS_AP_NAME;
const AP_PASSWORD = process.env.TRACERS_AP_PASSWORD;

async function searchBySsn(ssn, firstName, lastName, address = null, city = null, state = null, zip = null) {
    try {
        let candidates = [];
        let searchMethod = '';

        // ==========================================
        // ATTEMPT 1: SEARCH BY SSN (Formatted ###-##-####)
        // ==========================================
        const rawSsn = ssn ? ssn.replace(/\D/g, '') : '';
        if (rawSsn.length === 9) {
            // FIX 1: Format SSN with dashes as per Docs (###-##-####)
            const formattedSsn = `${rawSsn.slice(0,3)}-${rawSsn.slice(3,5)}-${rawSsn.slice(5)}`;

            console.log(`[Tracers] Attempt 1: Searching by SSN (${formattedSsn})...`);

            candidates = await callTracers({
                Ssn: formattedSsn, // Docs require dashes
                Includes: [
                    'Addresses', 'PhoneNumbers', 'EmailAddresses', 'Akas',
                    'AllowSearchBySsn' // Valid flag per your error logs
                ],
                ResultsPerPage: 5
            }, "SSN_SEARCH");

            if (candidates.length > 0) {
                console.log(`   > SSN Search Successful. Found ${candidates.length} candidates.`);
                searchMethod = 'SSN';
            }
        }

        // ==========================================
        // ATTEMPT 2: FALLBACK (Formatted Address Array)
        // ==========================================
        if (candidates.length === 0 && address && state) {
            console.log(`[Tracers] Fallback: Searching by Name + Address...`);

            // FIX 2: Structure Address as an Array per Docs
            // Docs say: AddressLine2 = "State or City and State Or Zip"
            const fullLine2 = `${city || ''} ${state || ''} ${zip || ''}`.trim();

            let payload = {
                FirstName: firstName,
                LastName: lastName,
                Addresses: [
                    {
                        AddressLine1: address,
                        AddressLine2: fullLine2 // "City State Zip" combined
                    }
                ],
                Includes: ['Addresses', 'PhoneNumbers', 'EmailAddresses', 'Akas'],
                ResultsPerPage: 5
            };

            candidates = await callTracers(payload, "ADDRESS_SEARCH");
            if (candidates.length > 0) searchMethod = 'ADDRESS';
        }

        // ==========================================
        // AI VERIFICATION
        // ==========================================
        if (candidates.length === 0) {
            return { success: false, error: 'No results found (SSN or Name/Address)' };
        }

        let bestMatch = null;
        const targetName = `${firstName} ${lastName}`;

        if (searchMethod === 'SSN') {
            if (firstName) {
                const aiCheck = await aiMatcher.pickBestMatch(targetName, address, candidates);
                bestMatch = aiCheck || candidates[0];
            } else {
                bestMatch = candidates[0];
            }
        } else {
            bestMatch = await aiMatcher.pickBestMatch(targetName, address, candidates);
        }

        if (!bestMatch) return { success: false, error: `AI Mismatch: Candidates found but didn't match "${targetName}"` };

        return { success: true, match: parseTracersResponse(bestMatch) };

    } catch (error) {
        console.error(`[Tracers Logic Error]:`, error.message);
        return { success: false, error: error.message };
    }
}

// ------------------------------------------
// API CALLER (With X-Ray Logging)
// ------------------------------------------
async function callTracers(payload, contextTag) {
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

        const data = response.data;

        if (!data.PersonSearchResults || data.PersonSearchResults.length === 0) {
            console.log(`[Tracers X-RAY] ${contextTag} returned 0 results.`);

            // Log any warnings (e.g., "Invalid SSN format" or "Permission Denied")
            if (data.Warnings && data.Warnings.length > 0) console.log(`   API WARNINGS:`, JSON.stringify(data.Warnings));
            if (data.Errors && data.Errors.length > 0) console.log(`   API ERRORS:`, JSON.stringify(data.Errors));
            if (data.Error) console.log(`   API ERROR OBJ:`, JSON.stringify(data.Error));
        }

        return data.PersonSearchResults || [];

    } catch (error) {
        if (error.response) {
            console.error(`[Tracers API Crash]: ${error.response.status}`);
            console.error(`   Payload sent:`, JSON.stringify(payload));
            console.error(`   Server Response:`, JSON.stringify(error.response.data));
        } else {
            console.error(`[Tracers Network Error]:`, error.message);
        }
        return [];
    }
}

function parseTracersResponse(person) {
    const clean = (str) => (str || '').trim();
    let mobile = null;
    if (person.MobilePhones?.length) {
        mobile = person.MobilePhones.find(p => p.LastSeenDate?.includes('Current'))?.PhoneNumber || person.MobilePhones[0].PhoneNumber;
    }
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
