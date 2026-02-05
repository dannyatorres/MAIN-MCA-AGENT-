// backend/services/tracersService.js
const axios = require('axios');
const aiMatcher = require('./aiMatcher');
const { trackUsage } = require('./usageTracker');
const pool = require('../db');
require('dotenv').config();

const TRACERS_URL = 'https://api.galaxysearchapi.com/PersonSearch';
const AP_NAME = process.env.TRACERS_AP_NAME;
const AP_PASSWORD = process.env.TRACERS_AP_PASSWORD;

async function getCachedResult(cacheKey) {
    const { rows } = await pool.query(
        `SELECT result FROM tracers_cache WHERE cache_key = $1 AND created_at > NOW() - INTERVAL '7 days'`,
        [cacheKey]
    );
    return rows.length > 0 ? rows[0].result : null;
}

async function cacheResult(cacheKey, result) {
    await pool.query(
        `INSERT INTO tracers_cache (cache_key, result) VALUES ($1, $2)
         ON CONFLICT (cache_key) DO UPDATE SET result = $2, created_at = NOW()`,
        [cacheKey, JSON.stringify(result)]
    );
}

async function searchBySsn(ssn, firstName, lastName, address = null, city = null, state = null, zip = null, userId = null) {
    try {
        let candidates = [];
        let searchMethod = '';

        // ATTEMPT 1: SEARCH BY SSN ONLY (Force Loose Search)
        const rawSsn = ssn ? ssn.replace(/\D/g, '') : '';

        // Build cache key from inputs
        const cacheKey = `${rawSsn}|${(firstName||'').toLowerCase()}|${(lastName||'').toLowerCase()}|${(address||'').toLowerCase()}|${(state||'').toLowerCase()}`;

        // Check cache first
        const cached = await getCachedResult(cacheKey);
        if (cached) {
            console.log(`[Tracers] Cache hit for ${firstName} ${lastName}`);
            return { success: true, match: cached };
        }

        if (rawSsn.length === 9) {
            const payload = createPayload({
                FirstName: "",
                LastName: "",
                SSN: rawSsn
            });

            candidates = await callTracers(payload);
            if (candidates.length > 0) {
                searchMethod = 'SSN';
                // Track usage
                await trackUsage({
                    userId: userId,
                    conversationId: null,
                    type: 'skip_trace',
                    service: 'tracers',
                    segments: 1,
                    metadata: { method: 'SSN' }
                });
            }
        }

        // ATTEMPT 2: FALLBACK (Name + Address)
        if (candidates.length === 0 && address && state) {
            const fullLine2 = `${city || ''} ${state || ''} ${zip || ''}`.trim();

            const payload = createPayload({
                FirstName: firstName || "",
                LastName: lastName || "",
                Addressline1: address || "",
                addressLine2: fullLine2
            });

            candidates = await callTracers(payload);
            if (candidates.length > 0) {
                searchMethod = 'ADDRESS';
                // Track usage
                await trackUsage({
                    userId: userId,
                    conversationId: null,
                    type: 'skip_trace',
                    service: 'tracers',
                    segments: 1,
                    metadata: { method: 'ADDRESS' }
                });
            }
        }

        // AI VERIFICATION
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

        const parsed = parseTracersResponse(bestMatch);
        await cacheResult(cacheKey, parsed);
        return { success: true, match: parsed };

    } catch (error) {
        return { success: false, error: error.message };
    }
}

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

    if (overrides.SSN !== undefined) template.SSN = overrides.SSN;
    if (overrides.FirstName !== undefined) template.FirstName = overrides.FirstName;
    if (overrides.LastName !== undefined) template.LastName = overrides.LastName;

    if (overrides.Addressline1 || overrides.addressLine2) {
        template.Addresses[0].Addressline1 = overrides.Addressline1 || "";
        template.Addresses[0].addressLine2 = overrides.addressLine2 || "";
    }

    return template;
}

async function callTracers(payload) {
    try {
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

        if (data.persons?.length > 0) {
            console.log(`[Tracers] Found ${data.persons.length} candidate(s)`);
        }

        if (!data.persons || data.persons.length === 0) {
            return [];
        }

        return data.persons;

    } catch (error) {
        console.error(`[Lookup Error]:`, error.message);
        return [];
    }
}

function parsePartialDob(dobValue, age) {
    // Estimate from age if no DOB
    if (!dobValue && age) {
        const estimatedYear = new Date().getFullYear() - age;
        return `01/01/${estimatedYear}`;
    }

    if (!dobValue) return null;

    const str = dobValue.toString().trim();

    // Already MM/DD/YYYY format
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) {
        return str;
    }

    // Month + Year: "Nov 1925"
    const monthYearMatch = str.match(/^([A-Za-z]+)\s+(\d{4})$/);
    if (monthYearMatch) {
        const months = {
            jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
            jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
        };
        const monthNum = months[monthYearMatch[1].toLowerCase().substring(0, 3)];
        if (monthNum) return `${monthNum}/01/${monthYearMatch[2]}`;
    }

    // Year only: "1925"
    if (/^\d{4}$/.test(str)) {
        return `01/01/${str}`;
    }

    return str;
}

function parseTracersResponse(person) {
    // 1. Get best phone (wireless preferred, must be connected)
    let mobile = null;
    if (person.phoneNumbers && person.phoneNumbers.length > 0) {
        // Prefer wireless + connected
        const wireless = person.phoneNumbers.find(p => p.phoneType === 'Wireless' && p.isConnected);
        const connected = person.phoneNumbers.find(p => p.isConnected);
        const bestPhone = wireless || connected || person.phoneNumbers[0];
        mobile = bestPhone.phoneNumber;
    }

    // 2. Get current address (addressOrder: 1 is most current)
    let addr = null;
    let streetAddress = null;

    if (person.addresses && person.addresses.length > 0) {
        addr = person.addresses[0]; // Already sorted by addressOrder

        if (addr.fullAddress) {
            // "107 Covert Ave; Elmont, NY 11003-1115" → "107 Covert Ave"
            streetAddress = addr.fullAddress.split(';')[0];
        } else {
            streetAddress = [addr.houseNumber, addr.streetPreDirection, addr.streetName, addr.streetType, addr.unit]
                .filter(Boolean).join(' ');
        }
    }

    return {
        phone: mobile ? mobile.replace(/\D/g, '') : null,
        address: streetAddress?.trim() || null,
        city: addr?.city || null,
        state: addr?.state || null,
        zip: addr?.zip || null,
        dob: parsePartialDob(person.dob, person.age) || null
    };
}

module.exports = { searchBySsn };
