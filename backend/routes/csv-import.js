// routes/csv-import.js - FINAL VERSION: Date Fix + Schema Fix
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const csvParser = require('csv-parser');
const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../services/database');

// Configure upload directory
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer
const storage = multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${Math.round(Math.random() * 1E9)}-${file.originalname}`);
    }
});

const csvUpload = multer({ storage: storage });

// Helper: Normalize string for fuzzy matching
const normalize = (str) => str ? str.toString().toLowerCase().replace(/[\s_\-]/g, '') : '';

// Helper: Fuzzy Match Value
const getFuzzyValue = (row, possibleHeaders) => {
    const rowHeaders = Object.keys(row);
    const normalizedRowHeaders = rowHeaders.map(h => ({ original: h, normalized: normalize(h) }));

    for (const target of possibleHeaders) {
        const normalizedTarget = normalize(target);
        const match = normalizedRowHeaders.find(h => h.normalized === normalizedTarget);
        if (match && row[match.original]) {
            return row[match.original].toString().trim();
        }
    }
    return null;
};

// Helper: Clean Date to YYYY-MM-DD
const cleanDate = (val) => {
    if (!val) return null;
    const date = new Date(val);
    if (isNaN(date.getTime())) return null;
    return date.toISOString().split('T')[0];
};

// Helper: Clean State Code (strips punctuation, enforces 2 chars)
const cleanStateCode = (val) => {
    if (!val) return null;
    return val.toString().replace(/[^a-zA-Z]/g, '').substring(0, 2).toUpperCase();
};

// Helper: Clean Money
const cleanMoney = (val) => val ? parseFloat(val.replace(/[^0-9.]/g, '')) : null;

router.post('/upload', csvUpload.single('csvFile'), async (req, res) => {
    let importId = null;
    const errors = [];
    let importedCount = 0;
    let skippedNoPhone = 0;
    let skippedDuplicate = 0;

    try {
        if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });

        console.log(`📂 Processing CSV: ${req.file.originalname}`);
        const db = getDatabase();
        importId = uuidv4();

        // 1. Create import record
        await db.query(`
            INSERT INTO csv_imports (
                id, filename, original_filename, status,
                total_rows, imported_rows, error_rows,
                column_mapping, created_at
            )
            VALUES ($1, $2, $3, 'processing', 0, 0, 0, '{}', NOW())
        `, [importId, req.file.filename, req.file.originalname]);

        // 2. Parse CSV
        const rows = [];
        let headersLogged = false;
        await new Promise((resolve, reject) => {
            fs.createReadStream(req.file.path)
                .pipe(csvParser())
                .on('data', (row) => {
                    // --- DEBUG LOG START ---
                    if (!headersLogged) {
                        console.log('🔍 STEP 3 (Server): Headers Received by Backend:', Object.keys(row));
                        headersLogged = true;
                    }
                    // --- DEBUG LOG END ---
                    rows.push(row);
                })
                .on('end', resolve)
                .on('error', reject);
        });

        console.log(`📊 CSV Loaded: ${rows.length} rows found.`);

        // 3. Map Data
        const validLeads = [];

        rows.forEach((row, index) => {
            try {
                const id = uuidv4();

                // Basic Info
                const business_name = getFuzzyValue(row, ['Company Name', 'Company', 'Business', 'Legal Name']);
                const phone = getFuzzyValue(row, ['Phone', 'Phone Number', 'Mobile', 'Cell', 'Verified Mobile']);
                const email = getFuzzyValue(row, ['Email', 'Business Email']);

                // FIXED: Strictly require a phone number.
                // If phone is missing, skip this row immediately to prevent crashing.
                if (!phone) {
                    skippedNoPhone++;
                    console.log(`⏭️ Row ${index + 1}: Skipped - no phone number`);
                    return;
                }

                // Clean Dates
                const rawDob = getFuzzyValue(row, ['DOB', 'Date of Birth']);
                const rawStart = getFuzzyValue(row, ['Start Date', 'Business Start Date', 'Est. Date']);

                const dob = cleanDate(rawDob);
                const start_date = cleanDate(rawStart);

                // Clean Financials
                const annual_rev = cleanMoney(getFuzzyValue(row, ['Annual Revenue', 'Revenue', 'Sales']));
                const monthly_rev = cleanMoney(getFuzzyValue(row, ['Monthly Revenue'])) || (annual_rev ? annual_rev / 12 : 0);
                const requested = cleanMoney(getFuzzyValue(row, ['Requested Amount', 'Funding Amount', 'Funding']));

                // --- DEBUG LOG START ---
                if (index === 0) {
                    const debugAddress = getFuzzyValue(row, ['Home Address', 'Owner Home Address', 'Owner 1 Address']);
                    console.log('🔍 STEP 4 (Server): Lookup for Owner Address:');
                    console.log('   - Row Keys available:', Object.keys(row));
                    console.log('   - Value found:', debugAddress);
                }
                // --- DEBUG LOG END ---

                const lead = {
                    id,
                    csv_import_id: importId,
                    business_name,
                    lead_phone: phone,
                    email: email,
                    us_state: cleanStateCode(getFuzzyValue(row, ['State', 'Business State', 'Province'])),
                    city: getFuzzyValue(row, ['City', 'Business City']),
                    zip: getFuzzyValue(row, ['Zip', 'Zip Code']),
                    address: getFuzzyValue(row, ['Address', 'Business Address']),
                    first_name: getFuzzyValue(row, ['First Name', 'Owner First Name']),
                    last_name: getFuzzyValue(row, ['Last Name', 'Owner Last Name']),

                    // Home Address (from Background Verification)
                    // CHANGED: Added 'Owner 1' variations to the list of accepted keys
                    owner_home_address: getFuzzyValue(row, ['Home Address', 'Owner Home Address', 'Owner 1 Address']),
                    owner_home_city: getFuzzyValue(row, ['Home City', 'Owner Home City', 'Owner 1 City']),
                    owner_home_state: cleanStateCode(getFuzzyValue(row, ['Home State', 'Owner Home State', 'Owner 1 State'])),
                    owner_home_zip: getFuzzyValue(row, ['Home Zip', 'Owner Home Zip', 'Owner 1 Zip']),

                    // Details
                    industry: getFuzzyValue(row, ['Industry', 'Business Type']),
                    annual_revenue: annual_rev,
                    requested_amount: requested,

                    // Sensitive
                    tax_id: getFuzzyValue(row, ['Tax ID', 'TaxID', 'EIN']),
                    ssn: getFuzzyValue(row, ['SSN', 'Social Security']),
                    date_of_birth: dob,
                    business_start_date: start_date
                };

                validLeads.push(lead);
            } catch (err) {
                errors.push({ row: index + 1, error: err.message });
            }
        });

        console.log(`📊 Mapping Summary:`);
        console.log(`   - Total rows in CSV: ${rows.length}`);
        console.log(`   - Valid leads mapped: ${validLeads.length}`);
        console.log(`   - Skipped (no phone): ${skippedNoPhone}`);
        console.log(`   - Mapping errors: ${errors.length}`);
        if (errors.length > 0) {
            console.log(`   - Error details:`, errors);
        }

        // 4. Bulk Insert
        const BATCH_SIZE = 500;

        for (let i = 0; i < validLeads.length; i += BATCH_SIZE) {
            const batch = validLeads.slice(i, i + BATCH_SIZE);

            const convValues = [];
            const convPlaceholders = [];

            batch.forEach((lead, idx) => {
                // We are now inserting 23 values per row (was 21) + NOW()
                // Make sure this placeholder count matches the number of variables pushed below
                const offset = idx * 23;

                // Generates ($1, $2, ... $23, NOW())
                const placeholderStr = Array.from({length: 23}, (_, k) => `$${offset + k + 1}`).join(', ');
                convPlaceholders.push(`(${placeholderStr}, NOW())`);

                convValues.push(
                    // 1-5: Basic
                    lead.id,
                    lead.business_name,
                    lead.lead_phone,
                    lead.email,
                    lead.us_state,

                    // 6-8: Business Address
                    lead.address,
                    lead.city,
                    lead.zip,

                    // 9-10: Owner Name
                    lead.first_name,
                    lead.last_name,

                    // 11-14: Owner Address
                    lead.owner_home_address || null,
                    lead.owner_home_city || null,
                    lead.owner_home_state || null,
                    lead.owner_home_zip || null,

                    // 15-21: CONSOLIDATED DETAILS (These were missing!)
                    lead.annual_revenue || null,
                    lead.business_start_date || null,
                    lead.date_of_birth || null,
                    lead.tax_id || null,
                    lead.ssn || null,
                    lead.industry || null,
                    lead.requested_amount || null,

                    // 22-23: User tracking
                    req.user?.id || null,
                    req.user?.id || null
                );
            });

            if (batch.length > 0) {
                const query = `
                    INSERT INTO conversations (
                        id, business_name, lead_phone, email, us_state,
                        address, city, zip, first_name, last_name,
                        owner_home_address, owner_home_city, owner_home_state, owner_home_zip,

                        -- Newly Added Columns:
                        annual_revenue, business_start_date, date_of_birth,
                        tax_id, ssn, industry_type, funding_amount,

                        -- User tracking:
                        created_by_user_id, assigned_user_id,

                        created_at
                    ) VALUES ${convPlaceholders.join(', ')}
                    ON CONFLICT (lead_phone)
                    DO UPDATE SET
                        business_name = COALESCE(EXCLUDED.business_name, conversations.business_name),
                        email = COALESCE(EXCLUDED.email, conversations.email),

                        -- Update Address Info
                        owner_home_address = COALESCE(EXCLUDED.owner_home_address, conversations.owner_home_address),
                        owner_home_city = COALESCE(EXCLUDED.owner_home_city, conversations.owner_home_city),
                        owner_home_state = COALESCE(EXCLUDED.owner_home_state, conversations.owner_home_state),
                        owner_home_zip = COALESCE(EXCLUDED.owner_home_zip, conversations.owner_home_zip),

                        -- Update Financials/Meta
                        annual_revenue = COALESCE(EXCLUDED.annual_revenue, conversations.annual_revenue),
                        tax_id = COALESCE(EXCLUDED.tax_id, conversations.tax_id),
                        ssn = COALESCE(EXCLUDED.ssn, conversations.ssn),
                        date_of_birth = COALESCE(EXCLUDED.date_of_birth, conversations.date_of_birth),

                        last_activity = NOW()
                `;

                const result = await db.query(query + ' RETURNING (xmax = 0) AS inserted', convValues);
                const inserted = result.rows.filter(r => r.inserted).length;
                const updated = result.rows.length - inserted;
                importedCount += batch.length;
                skippedDuplicate += updated;
                console.log(`📥 Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${inserted} new, ${updated} updated (duplicates)`);
            }
        }

        // 5. Cleanup
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

        await db.query(`UPDATE csv_imports SET status = 'completed', imported_rows = $1 WHERE id = $2`, [importedCount, importId]);

        console.log(`✅ Import Complete:`);
        console.log(`   - CSV rows: ${rows.length}`);
        console.log(`   - Skipped (no phone): ${skippedNoPhone}`);
        console.log(`   - Skipped (duplicates): ${skippedDuplicate}`);
        console.log(`   - New records created: ${importedCount - skippedDuplicate}`);
        console.log(`   - Records updated: ${skippedDuplicate}`);

        res.json({
            success: true,
            import_id: importId,
            imported_count: importedCount,
            skipped_no_phone: skippedNoPhone,
            duplicates_updated: skippedDuplicate,
            new_records: importedCount - skippedDuplicate,
            errors
        });

    } catch (error) {
        console.error('❌ Import Error:', error);
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get import history
router.get('/history', async (req, res) => {
    try {
        const { limit = 20, offset = 0 } = req.query;
        const db = getDatabase();

        const result = await db.query(`
            SELECT * FROM csv_imports
            ORDER BY created_at DESC
            LIMIT $1 OFFSET $2
        `, [parseInt(limit), parseInt(offset)]);

        const countResult = await db.query('SELECT COUNT(*) as total FROM csv_imports');

        res.json({
            success: true,
            imports: result.rows,
            total: parseInt(countResult.rows[0].total)
        });

    } catch (error) {
        console.error('Error fetching import history:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get single import details
router.get('/:importId', async (req, res) => {
    try {
        const { importId } = req.params;
        const db = getDatabase();

        const result = await db.query(
            'SELECT * FROM csv_imports WHERE id = $1',
            [importId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Import not found'
            });
        }

        res.json({
            success: true,
            import: result.rows[0]
        });

    } catch (error) {
        console.error('Error fetching import details:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get conversations from a specific import
router.get('/:importId/conversations', async (req, res) => {
    try {
        const { importId } = req.params;
        const db = getDatabase();

        const result = await db.query(
            'SELECT * FROM conversations WHERE csv_import_id = $1 ORDER BY created_at DESC',
            [importId]
        );

        res.json({
            success: true,
            conversations: result.rows,
            total: result.rows.length
        });

    } catch (error) {
        console.error('Error fetching import conversations:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
