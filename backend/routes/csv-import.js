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

        // 4. Process Leads with Deduplication + Exclusivity
        const EXCLUSIVITY_DAYS = 14;
        const rejections = [];
        const toInsert = [];
        const toUpdate = [];

        // --- BATCH DEDUP: Fetch all existing leads in 2 queries instead of 1 per lead ---
        const allPhones = validLeads.map(l => l.lead_phone).filter(Boolean);
        const allTaxIds = validLeads.map(l => l.tax_id).filter(Boolean);

        // Lookup by phone
        const phoneMap = new Map();
        if (allPhones.length > 0) {
            const phoneResult = await db.query(`
                SELECT c.id, c.lead_phone, c.tax_id, c.business_name, c.assigned_user_id, 
                       c.display_id, c.exclusivity_expires_at, c.state,
                       u.name as assigned_user_name
                FROM conversations c
                LEFT JOIN users u ON c.assigned_user_id = u.id
                WHERE c.lead_phone = ANY($1)
            `, [allPhones]);
            for (const row of phoneResult.rows) {
                phoneMap.set(row.lead_phone, row);
            }
        }

        // Lookup by tax_id
        const taxIdMap = new Map();
        if (allTaxIds.length > 0) {
            const taxResult = await db.query(`
                SELECT c.id, c.lead_phone, c.tax_id, c.business_name, c.assigned_user_id, 
                       c.display_id, c.exclusivity_expires_at, c.state,
                       u.name as assigned_user_name
                FROM conversations c
                LEFT JOIN users u ON c.assigned_user_id = u.id
                WHERE c.tax_id = ANY($1) AND c.tax_id != ''
            `, [allTaxIds]);
            for (const row of taxResult.rows) {
                taxIdMap.set(row.tax_id, row);
            }
        }

        // Classify leads using the maps
        for (const lead of validLeads) {
            const existing = phoneMap.get(lead.lead_phone) || 
                            (lead.tax_id ? taxIdMap.get(lead.tax_id) : null);

            if (existing) {
                const isOwnLead = existing.assigned_user_id === req.user?.id;

                if (!isOwnLead) {
                    // NEVER allow a CSV import to reassign another user's lead
                    rejections.push({
                        row: validLeads.indexOf(lead) + 1,
                        phone: lead.lead_phone,
                        business_name: lead.business_name,
                        reason: `Already assigned to ${existing.assigned_user_name || 'another user'} (CID# ${existing.display_id})`,
                        matched_by: existing.lead_phone === lead.lead_phone ? 'phone' : 'EIN'
                    });
                    continue;
                }

                // Own lead — enrich with new CSV data only
                toUpdate.push({ lead, existingId: existing.id, claim: false });
            } else {
                toInsert.push(lead);
            }
        }

        // --- BATCH INSERT in chunks of 50 ---
        const BATCH_SIZE = 50;
        for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
            const batch = toInsert.slice(i, i + BATCH_SIZE);
            const values = [];
            const params = [];
            let paramIndex = 1;

            for (const lead of batch) {
                const start = paramIndex;
                values.push(`($${start}, $${start+1}, $${start+2}, $${start+3}, $${start+4}, $${start+5}, $${start+6}, $${start+7}, $${start+8}, $${start+9}, $${start+10}, $${start+11}, $${start+12}, $${start+13}, $${start+14}, $${start+15}, $${start+16}, $${start+17}, $${start+18}, $${start+19}, $${start+20}, $${start+21}, $${start+22}, NOW() + INTERVAL '${EXCLUSIVITY_DAYS} days', NOW())`);
                params.push(
                    lead.id, lead.business_name, lead.lead_phone, lead.email, lead.us_state,
                    lead.address, lead.city, lead.zip, lead.first_name, lead.last_name,
                    lead.owner_home_address, lead.owner_home_city, lead.owner_home_state, lead.owner_home_zip,
                    lead.annual_revenue, lead.business_start_date, lead.date_of_birth,
                    lead.tax_id, lead.ssn, lead.industry, lead.requested_amount,
                    req.user?.id, req.user?.id
                );
                paramIndex += 23;
            }

            await db.query(`
                INSERT INTO conversations (
                    id, business_name, lead_phone, email, us_state,
                    address, city, zip, first_name, last_name,
                    owner_home_address, owner_home_city, owner_home_state, owner_home_zip,
                    annual_revenue, business_start_date, date_of_birth,
                    tax_id, ssn, industry_type, funding_amount,
                    created_by_user_id, assigned_user_id,
                    exclusivity_expires_at, created_at
                ) VALUES ${values.join(', ')}
            `, params);

            importedCount += batch.length;
        }

        // Process updates
        for (const { lead, existingId, claim } of toUpdate) {
            if (claim) {
                await db.query(`
                    UPDATE conversations SET
                        assigned_user_id = $2,
                        business_name = COALESCE($3, business_name),
                        email = COALESCE($4, email),
                        owner_home_address = COALESCE($5, owner_home_address),
                        owner_home_city = COALESCE($6, owner_home_city),
                        owner_home_state = COALESCE($7, owner_home_state),
                        owner_home_zip = COALESCE($8, owner_home_zip),
                        annual_revenue = COALESCE($9, annual_revenue),
                        tax_id = COALESCE($10, tax_id),
                        last_activity = NOW()
                    WHERE id = $1
                `, [
                    existingId, req.user?.id,
                    lead.business_name, lead.email,
                    lead.owner_home_address, lead.owner_home_city, lead.owner_home_state, lead.owner_home_zip,
                    lead.annual_revenue, lead.tax_id
                ]);
            } else {
                await db.query(`
                    UPDATE conversations SET
                        business_name = COALESCE($2, business_name),
                        email = COALESCE($3, email),
                        owner_home_address = COALESCE($4, owner_home_address),
                        owner_home_city = COALESCE($5, owner_home_city),
                        owner_home_state = COALESCE($6, owner_home_state),
                        owner_home_zip = COALESCE($7, owner_home_zip),
                        annual_revenue = COALESCE($8, annual_revenue),
                        tax_id = COALESCE($9, tax_id),
                        last_activity = NOW()
                    WHERE id = $1
                `, [
                    existingId,
                    lead.business_name, lead.email,
                    lead.owner_home_address, lead.owner_home_city, lead.owner_home_state, lead.owner_home_zip,
                    lead.annual_revenue, lead.tax_id
                ]);
            }
            skippedDuplicate++;
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
            new_records: toInsert.length,
            rejected_count: rejections.length,
            rejections: rejections,
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
