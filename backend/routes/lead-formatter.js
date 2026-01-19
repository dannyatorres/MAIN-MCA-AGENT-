/**
 * Lead Formatter Backend Route
 * Place this file in: routes/lead-formatter.js
 *
 * PROTECTED BUSINESS LOGIC - Format detection, normalization, and file generation
 *
 * Add to your Express app:
 *   const leadFormatterRoutes = require('./routes/lead-formatter');
 *   app.use('/api/formatter', leadFormatterRoutes);
 */

const express = require('express');
const router = express.Router();
const Papa = require('papaparse');

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS (PROTECTED)
// ═══════════════════════════════════════════════════════════════

function formatPhoneNumber(phone) {
    if (!phone) return '';
    const cleaned = String(phone).replace(/\D/g, '');

    if (cleaned.length === 11 && cleaned.startsWith('1')) {
        return cleaned.substring(1);
    }

    if (cleaned.length === 10) {
        return cleaned;
    }

    return cleaned;
}

function formatSSN(ssn) {
    if (!ssn) return '';
    const cleaned = String(ssn).replace(/\D/g, '');

    if (cleaned.length === 9) {
        return cleaned.substring(0, 3) + '-' +
               cleaned.substring(3, 5) + '-' +
               cleaned.substring(5);
    }

    return ssn;
}

function formatDate(dateStr) {
    if (!dateStr || String(dateStr).trim() === '') return '';

    dateStr = String(dateStr);

    // Check if it's in DD-MM-YYYY or DD/MM/YYYY format (day first)
    const ddmmyyyyPattern = /^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/;
    const match = dateStr.match(ddmmyyyyPattern);

    if (match) {
        const day = match[1];
        const month = match[2];
        const year = match[3];

        const dayNum = parseInt(day);
        const monthNum = parseInt(month);

        if (dayNum > 12) {
            // Definitely DD/MM/YYYY format
            return `${month.padStart(2, '0')}/${day.padStart(2, '0')}/${year}`;
        } else if (monthNum > 12) {
            // Definitely MM/DD/YYYY format (already correct)
            return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
        } else {
            // Ambiguous case - assume DD/MM/YYYY if dash, swap
            if (dateStr.includes('-')) {
                return `${month.padStart(2, '0')}/${day.padStart(2, '0')}/${year}`;
            } else {
                return `${month.padStart(2, '0')}/${day.padStart(2, '0')}/${year}`;
            }
        }
    }

    // Try parsing as a date
    const date = new Date(dateStr);

    if (isNaN(date.getTime())) return dateStr;

    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const year = date.getFullYear();

    return `${month}/${day}/${year}`;
}

function formatNameToProperCase(name) {
    if (!name) return '';
    name = String(name).trim();
    if (!name) return '';
    return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

function getColumnValue(row, possibleNames) {
    for (let name of possibleNames) {
        for (let key in row) {
            if (key.toLowerCase().trim() === name.toLowerCase().trim()) {
                return row[key];
            }
        }
    }
    return '';
}

// ═══════════════════════════════════════════════════════════════
// FORMAT DETECTION (PROTECTED)
// ═══════════════════════════════════════════════════════════════

function detectFormat(headers) {
    const normalizedHeaders = headers.map(h => h.toLowerCase().trim());

    // Check for Braintrust2 format (TLO format)
    const braintrust2Columns = ['tlo phone 1', 'tlo email 1', 'business name', 'turnover'];
    const braintrust2Matches = braintrust2Columns.filter(col =>
        normalizedHeaders.includes(col)
    ).length;

    if (braintrust2Matches >= 2) {
        return 'braintrust2';
    }

    // Check for Braintrust format indicators
    const braintrustColumns = ['firstname', 'lastname', 'phone1', 'company'];
    const braintrustMatches = braintrustColumns.filter(col =>
        normalizedHeaders.includes(col)
    ).length;

    if (braintrustMatches >= 2) {
        return 'braintrust';
    }

    // Check for original format indicators
    const originalColumns = ['owner name'];
    const hasOriginalColumns = originalColumns.some(col =>
        normalizedHeaders.includes(col)
    );

    if (hasOriginalColumns) {
        return 'original';
    }

    // Default to original
    return 'original';
}

// ═══════════════════════════════════════════════════════════════
// NORMALIZATION FUNCTIONS (PROTECTED)
// ═══════════════════════════════════════════════════════════════

function normalizeDataFromBraintrust(data) {
    return data.filter(row => {
        const company = row['company'] || '';
        if (!company || company.match(/^\w+\s+\d+,\s+\d{4}$/)) {
            return false;
        }
        return true;
    }).map(row => {
        const rawPhone = row['phone1'] || row['phone2'] || row['phone3'] || row['phone4'] || row['phone5'] || '';
        const phone = formatPhoneNumber(rawPhone);

        const email = row['email'] || row['email2'] || row['email3'] || row['email4'] || '';

        let firstName = row['firstname'] || '';
        let lastName = row['lastname'] || '';

        if (firstName.includes(' ')) {
            const nameParts = firstName.trim().split(/\s+/);
            firstName = nameParts[0] || '';
            if (!lastName) {
                lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : '';
            }
        }

        return {
            'Owner Name': `${firstName} ${lastName}`.trim(),
            'First Name': firstName,
            'Last Name': lastName,
            'Phone Number': phone,
            'Mobile': phone,
            'Company Name': row['company'] || '',
            'Email': email,
            'Address': row['address1'] || '',
            'City': row['city'] || '',
            'State': row['state'] || '',
            'Zip': row['zip'] || '',
            'Monthly Revenue': row['revenue'] || '',
            'DOB': row['dob'] || '',
            'TaxID': row['ein'] || '',
            'SSN': row['ssn'] || '',
            'Business Start Date': row['yearsinbusiness'] || '',
            'Notes': row['notes'] || ''
        };
    });
}

function normalizeDataFromBraintrust2(data) {
    return data.filter(row => {
        const businessName = row['Business Name'] || '';
        if (!businessName || businessName.match(/^\w+\s+\d+,\s+\d{4}$/)) {
            return false;
        }
        return true;
    }).map(row => {
        const rawPhone1 = row['TLO Phone 1'] || '';
        const rawPhone2 = row['TLO Phone 2'] || '';
        const phone = formatPhoneNumber(rawPhone1) || formatPhoneNumber(rawPhone2);

        const email = row['TLO Email 1'] || row['TLO Email 2'] || '';

        const firstName = row['First Name'] || '';
        const lastName = row['Last Name'] || '';

        const businessAddress = row['Business Address Street,City,State,Zip'] || '';
        let address = '', city = '', state = '', zip = '';
        if (businessAddress) {
            const addressParts = businessAddress.split(',');
            address = addressParts[0] || '';
            city = addressParts[1] || '';
            state = addressParts[2] || '';
            zip = addressParts[3] || '';
        }

        return {
            'Owner Name': `${firstName} ${lastName}`.trim(),
            'First Name': firstName,
            'Last Name': lastName,
            'Phone Number': phone,
            'Mobile': phone,
            'Company Name': row['Business Name'] || '',
            'Email': email,
            'Address': address.trim(),
            'City': city.trim(),
            'State': state.trim(),
            'Zip': zip.trim(),
            'Monthly Revenue': row['Turnover'] || '',
            'DOB': row['DOB'] || '',
            'TaxID': row['EIN'] || '',
            'SSN': row['SSN'] || '',
            'Business Start Date': row['Business Start Date'] || '',
            'Notes': row['Notes'] || ''
        };
    });
}

function normalizeDataFromOriginal(data) {
    return data.map(row => {
        const ownerName = getColumnValue(row, ['Owner Name', 'owner name', 'OwnerName']) || '';
        const nameParts = ownerName.trim().split(/\s+/);
        const firstName = nameParts[0] || '';
        const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : '';

        const mobilePhone = formatPhoneNumber(getColumnValue(row, ['Mobile', 'mobile', 'Cell Phone', 'cell phone']) || '');
        const officePhone = formatPhoneNumber(getColumnValue(row, ['Phone Number', 'phone number', 'Phone', 'phone']) || '');
        const phone = mobilePhone || officePhone;

        return {
            'Owner Name': ownerName,
            'First Name': firstName,
            'Last Name': lastName,
            'Phone Number': phone,
            'Mobile': phone,
            'Company Name': getColumnValue(row, ['Company Name', 'company name', 'Company', 'company']) || '',
            'Email': getColumnValue(row, ['Email', 'email']) || '',
            'Address': getColumnValue(row, ['Address', 'address', 'Address1', 'address1']) || '',
            'City': getColumnValue(row, ['City', 'city']) || '',
            'State': getColumnValue(row, ['State', 'state']) || '',
            'Zip': getColumnValue(row, ['Zip', 'zip', 'Zip Code', 'zip code', 'zipcode']) || '',
            'Monthly Revenue': getColumnValue(row, ['Monthly Revenue', 'monthly revenue', 'Revenue', 'revenue']) || '',
            'DOB': getColumnValue(row, ['DOB', 'dob', 'Date of Birth', 'date of birth', 'DateOfBirth']) || '',
            'TaxID': getColumnValue(row, ['TaxID', 'taxid', 'Tax ID', 'tax id', 'EIN', 'ein']) || '',
            'SSN': getColumnValue(row, ['SSN', 'ssn', 'Social Security Number', 'social security number']) || '',
            'Business Start Date': getColumnValue(row, ['Business Start Date', 'business start date', 'Start Date', 'start date', 'BusinessStartDate']) || '',
            'Notes': getColumnValue(row, ['Notes', 'notes', 'Note', 'note']) || ''
        };
    });
}

// ═══════════════════════════════════════════════════════════════
// FILE GENERATION FUNCTIONS (PROTECTED)
// ═══════════════════════════════════════════════════════════════

function createCRMFile(normalizedData) {
    const crmHeaders = [
        'First Name', 'Last Name', 'Phone Number', 'Cell Phone',
        'Company Name', 'Email', 'Lead Source', 'Address',
        'City', 'State', 'Zip', 'Business Type', 'Annual Revenue',
        'Funding', 'Factor Rate', 'Funding Date', 'Term', 'Notes',
        'Campaign', 'TaxID', 'SSN', 'Business Start Date', 'DOB'
    ];

    const rows = [crmHeaders.join(',')];

    normalizedData.forEach((row) => {
        const firstName = row['First Name'] || '';
        const lastName = row['Last Name'] || '';
        const phone = row['Phone Number'] || '';

        const crmRow = [
            firstName,
            lastName,
            phone,
            phone,
            row['Company Name'] || '',
            row['Email'] || '',
            'WEB',
            row['Address'] || '',
            row['City'] || '',
            row['State'] || '',
            row['Zip'] || '',
            '',
            '',
            '',
            '',
            '',
            '',
            row['Monthly Revenue'] || '',
            '',
            row['TaxID'] || '',
            formatSSN(row['SSN'] || ''),
            formatDate(row['Business Start Date'] || ''),
            formatDate(row['DOB'] || '')
        ];

        rows.push(crmRow.map(val => `"${val}"`).join(','));
    });

    return rows.join('\n');
}

function createNameOnlyFile(normalizedData) {
    const rows = [];

    normalizedData.forEach(row => {
        const firstName = row['First Name'] || '';
        const formattedFirstName = formatNameToProperCase(firstName);
        const phone = row['Phone Number'] || '';

        if (formattedFirstName && phone && !/^\d+$/.test(formattedFirstName)) {
            rows.push(`${formattedFirstName},${phone}`);
        }
    });

    return rows.join('\n');
}

function createVonageFile(normalizedData) {
    const vonageHeaders = [
        'First Name', 'Last Name', 'Work Phone', 'Home Phone', 'Mobile Phone',
        'Work Email', 'Personal Email', 'Company Name', 'Title', 'Work Street',
        'Work City', 'Work State', 'Work ZIP', 'Work Country', 'Home Street',
        'Home city', 'Home State', 'Home ZIP', 'Home Country', 'Fax', 'Notes'
    ];

    const rows = [vonageHeaders.join(',')];

    normalizedData.forEach(row => {
        const firstName = row['First Name'] || '';
        const lastName = row['Last Name'] || '';
        const phone = row['Phone Number'] || '';

        const vonageRow = [
            firstName,
            lastName,
            phone,
            '',
            phone,
            row['Email'] || '',
            '',
            row['Company Name'] || '',
            '',
            row['Address'] || '',
            row['City'] || '',
            row['State'] || '',
            row['Zip'] || '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            row['Notes'] || row['Monthly Revenue'] || ''
        ];

        rows.push(vonageRow.map(val => `"${val}"`).join(','));
    });

    return rows.join('\n');
}

// ═══════════════════════════════════════════════════════════════
// API ENDPOINT
// ═══════════════════════════════════════════════════════════════

/**
 * POST /api/formatter/process
 *
 * Body: { csvData: "raw csv string" }
 *
 * Returns: {
 *   success: true,
 *   format: "braintrust" | "braintrust2" | "original",
 *   rowCount: number,
 *   files: {
 *     crm: "csv string",
 *     iphone: "csv string",
 *     vonage: "csv string"
 *   }
 * }
 */
router.post('/process', (req, res) => {
    try {
        const { csvData } = req.body;

        if (!csvData) {
            return res.status(400).json({
                success: false,
                error: 'No CSV data provided'
            });
        }

        // Parse CSV
        const result = Papa.parse(csvData, {
            header: true,
            skipEmptyLines: true,
            transformHeader: (header) => header.trim()
        });

        if (result.errors.length > 0) {
            console.warn('CSV parsing warnings:', result.errors);
        }

        const headers = result.meta.fields;
        const data = result.data;

        // Detect format
        const format = detectFormat(headers);
        console.log(`[Formatter] Detected format: ${format}, rows: ${data.length}`);

        // Normalize data based on format
        let normalizedData;
        if (format === 'braintrust2') {
            normalizedData = normalizeDataFromBraintrust2(data);
        } else if (format === 'braintrust') {
            normalizedData = normalizeDataFromBraintrust(data);
        } else {
            normalizedData = normalizeDataFromOriginal(data);
        }

        // Generate output files
        const crmFile = createCRMFile(normalizedData);
        const iphoneFile = createNameOnlyFile(normalizedData);
        const vonageFile = createVonageFile(normalizedData);

        res.json({
            success: true,
            format: format,
            rowCount: normalizedData.length,
            files: {
                crm: crmFile,
                iphone: iphoneFile,
                vonage: vonageFile
            }
        });

    } catch (error) {
        console.error('[Formatter] Error processing CSV:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to process CSV file'
        });
    }
});

module.exports = router;
