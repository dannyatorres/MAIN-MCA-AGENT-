// backend/services/tracersService.js
const axios = require('axios');
const aiMatcher = require('./aiMatcher');
require('dotenv').config();

const TRACERS_URL = 'https://api.galaxysearchapi.com/PersonSearch';
const AP_NAME = process.env.TRACERS_AP_NAME;
const AP_PASSWORD = process.env.TRACERS_AP_PASSWORD;

async function searchBySsn(ssn, firstName, lastName, address = null, city = null, state = null, zip = null) {
    try {
        const cleanSsn = ssn ? ssn.replace(/\D/g, '') : '';
        let candidates = [];
        let searchMethod = '';

        // ==========================================
        // ATTEMPT 1: SEARCH BY SSN (The Priority)
        // ==========================================
        if (cleanSsn.length === 9) {
            console.log(`[Tracers] Attempt 1: Searching by SSN (${cleanSsn})...`);

            candidates = await callTracers({
                Ssn: cleanSsn,
                // CRITICAL FIX: The "Magic Key" to unlock SSN search
                Includes: [
                    'Addresses',
                    'PhoneNumbers',
                    'EmailAddresses',
                    'Akas',
                    'AllowSearchBySsn'
                ],
                ResultsPerPage: 5
            });

            if (candidates.length > 0) {
                console.log(`   > SSN Search Successful. Found ${candidates.length} candidates.`);
                searchMethod = 'SSN';
            } else {
                console.log(`   > SSN Search returned 0 results (Check permissions with Tracers support).`);
            }
        }

        // ==========================================
        // ATTEMPT 2: FALLBACK (Only if SSN fails)
        // ==========================================
        if (candidates.length === 0 && address && state) {
            console.log(`[Tracers] Fallback: Searching by Name + Address...`);
            let searchPayload = {
                FirstName: firstName,
                LastName: lastName,
                AddressLine1: address,
                State: state,
                Includes: ['Addresses', 'PhoneNumbers', 'EmailAddresses', 'Akas'],
                ResultsPerPage: 5
            };
            if (city) searchPayload.City = city;
            if (zip) searchPayload.Zip = zip;

            candidates = await callTracers(searchPayload);
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
            // If SSN match found, we trust it.
            // We check with AI just to log if the name is weird.
            if (firstName) {
                const aiCheck = await aiMatcher.pickBestMatch(targetName, address, candidates);
                bestMatch = aiCheck || candidates[0];
            } else {
                bestMatch = candidates[0];
            }
        } else {
            // Address match requires strict AI check
            bestMatch = await aiMatcher.pickBestMatch(targetName, address, candidates);
        }

        if (!bestMatch) return { success: false, error: `AI Mismatch: Candidates found but didn't match "${targetName}"` };

        return { success: true, match: parseTracersResponse(bestMatch) };

    } catch (error) {
        console.error(`[Tracers Logic Error]:`, error.message);
        return { success: false, error: error.message };
    }
}

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
            console.error(`[Tracers API Error]: ${error.response.status}`, JSON.stringify(error.response.data));
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
