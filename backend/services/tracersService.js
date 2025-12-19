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
        // ATTEMPT 1: SEARCH BY SSN
        // ==========================================
        const rawSsn = ssn ? ssn.replace(/\D/g, '') : '';

        if (rawSsn.length === 9) {
            const formattedSsn = `${rawSsn.slice(0,3)}-${rawSsn.slice(3,5)}-${rawSsn.slice(5)}`;
            console.log(`[Tracers] Attempt 1: Searching by SSN (${formattedSsn})...`);

            const payload = createPayload({
                FirstName: firstName || "",
                LastName: lastName || "",
                SSN: formattedSsn
            });

            // FIXED: "SocialSecurityNumbers" (No spaces) and added "AllowSearchBySsn"
            payload.Includes = [
                'Addresses',
                'PhoneNumbers',
                'EmailAddresses',
                'Akas',
                'SocialSecurityNumbers',
                'AllowSearchBySsn'
            ];
            payload.IncludeFullSsnValues = true;

            candidates = await callTracers(payload, "SSN_SEARCH");

            if (candidates.length > 0) searchMethod = 'SSN';
        }

        // ==========================================
        // ATTEMPT 2: FALLBACK (Name + Address)
        // ==========================================
        if (candidates.length === 0 && address && state) {
            console.log(`[Tracers] Fallback: Searching by Name + Address...`);

            const fullLine2 = `${city || ''} ${state || ''} ${zip || ''}`.trim();

            const payload = createPayload({
                FirstName: firstName || "",
                LastName: lastName || "",
                Addressline1: address || "",
                addressLine2: fullLine2
            });

            payload.Includes = ['Addresses', 'PhoneNumbers', 'EmailAddresses', 'Akas'];

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

/**
 * Helper to build the strict payload format required by the email support.
 */
function createPayload(overrides = {}) {
    const template = {
        "FirstName": "",
        "MiddleName": "",
        "LastName": "",
        "clientid": "",
        "Phone": "",
        "Email": "",
        "tahoeId": "",
        "DriverLicenseNumber": "",
        "Dob": "",
        "AgeRange": "",
        "SSN": "",
        "Addresses": [
            {
                "Addressline1": "",
                "addressLine2": ""
            }
        ],
        "Page": 1,
        "ResultsPerPage": "100"
    };

    if (overrides.SSN) template.SSN = overrides.SSN;
    if (overrides.FirstName) template.FirstName = overrides.FirstName;
    if (overrides.LastName) template.LastName = overrides.LastName;

    if (overrides.Addressline1 || overrides.addressLine2) {
        template.Addresses[0].Addressline1 = overrides.Addressline1 || "";
        template.Addresses[0].addressLine2 = overrides.addressLine2 || "";
    }

    return template;
}

// ------------------------------------------
// API CALLER
// ------------------------------------------
async function callTracers(payload, contextTag) {
    try {
        console.log(`[Payload for ${contextTag}]:`, JSON.stringify(payload));

        const response = await axios.post(TRACERS_URL, payload, {
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'galaxy-ap-name': AP_NAME,
                'galaxy-ap-password': AP_PASSWORD,
                'galaxy-search-type': 'Person',
                'galaxy-client-type': 'Api'
            }
        });

        const data = response.data;

        // Verify structure based on your logs
        if (!data.PersonSearchResults || data.PersonSearchResults.length === 0) {
            console.log(`[Tracers X-RAY] ${contextTag} returned 0 results.`);
            if (data.Warnings) console.log(`   WARNINGS:`, JSON.stringify(data.Warnings));
            if (data.Errors) console.log(`   ERRORS:`, JSON.stringify(data.Errors));
            return [];
        } else {
            console.log(`[Tracers] Success! Found ${data.PersonSearchResults.length} matches.`);
            return data.PersonSearchResults;
        }

    } catch (error) {
        if (error.response) {
            console.error(`[Tracers API Crash]: ${error.response.status}`);
            console.error(`   Server Response:`, JSON.stringify(error.response.data));
        } else {
            console.error(`[Tracers Network Error]:`, error.message);
        }
        return [];
    }
}

// ------------------------------------------
// RESPONSE PARSER (UPDATED FOR YOUR JSON)
// ------------------------------------------
function parseTracersResponse(person) {
    const clean = (str) => (str || '').trim();

    // 1. PHONE LOGIC
    // Use "PhoneOrder" or "LastReportedDate" to find the best phone.
    let mobile = null;
    if (person.PhoneNumbers && person.PhoneNumbers.length > 0) {
        // Try to find one marked "IsConnected": true, otherwise default to the first one
        const connected = person.PhoneNumbers.find(p => p.IsConnected === true);
        const bestPhone = connected || person.PhoneNumbers[0];
        mobile = bestPhone.PhoneNumber;
    }

    // 2. ADDRESS LOGIC
    // The JSON does NOT have AddressLine1. It has "FullAddress" or individual parts.
    let addr = null;
    let streetAddress = null;

    if (person.Addresses && person.Addresses.length > 0) {
        // Default to the first address (AddressOrder: 1)
        addr = person.Addresses[0];

        if (addr.FullAddress) {
            // Format: "3030 Main Way; Shingle Springs, CA 95682-8879"
            // Split by semicolon to extract the street part
            streetAddress = addr.FullAddress.split(';')[0];
        } else {
            // Fallback: Construct manually if FullAddress is missing
            streetAddress = [addr.HouseNumber, addr.StreetPreDirection, addr.StreetName, addr.StreetType, addr.Unit]
                .filter(Boolean).join(' ');
        }
    }

    return {
        phone: mobile ? mobile.replace(/\D/g, '') : null,
        address: clean(streetAddress),
        city: clean(addr?.City),
        state: clean(addr?.State),
        zip: clean(addr?.Zip)
    };
}

module.exports = { searchBySsn };
