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

// Helper: Clean Money
const cleanMoney = (val) => val ? parseFloat(val.replace(/[^0-9.]/g, '')) : null;

router.post('/upload', csvUpload.single('csvFile'), async (req, res) => {
    let importId = null;
    const errors = [];
    let importedCount = 0;

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
        await new Promise((resolve, reject) => {
            fs.createReadStream(req.file.path)
                .pipe(csvParser())
                .on('data', (row) => rows.push(row))
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
                const phone = getFuzzyValue(row, ['Phone', 'Phone Number', 'Mobile', 'Cell']);
                const email = getFuzzyValue(row, ['Email', 'Business Email']);

                if (!business_name && !phone) return;

                // Clean Dates
                const rawDob = getFuzzyValue(row, ['DOB', 'Date of Birth']);
                const rawStart = getFuzzyValue(row, ['Start Date', 'Business Start Date', 'Est. Date']);

                const dob = cleanDate(rawDob);
                const start_date = cleanDate(rawStart);

                // Clean Financials
                const annual_rev = cleanMoney(getFuzzyValue(row, ['Annual Revenue', 'Revenue', 'Sales']));
                const monthly_rev = cleanMoney(getFuzzyValue(row, ['Monthly Revenue'])) || (annual_rev ? annual_rev / 12 : 0);
                const requested = cleanMoney(getFuzzyValue(row, ['Requested Amount', 'Funding Amount', 'Funding']));

                const lead = {
                    id,
                    csv_import_id: importId,
                    business_name,
                    lead_phone: phone,
                    email: email,
                    us_state: getFuzzyValue(row, ['State', 'Business State', 'Province']),
                    city: getFuzzyValue(row, ['City', 'Business City']),
                    zip: getFuzzyValue(row, ['Zip', 'Zip Code']),
                    address: getFuzzyValue(row, ['Address', 'Business Address']),
                    first_name: getFuzzyValue(row, ['First Name', 'Owner First Name']),
                    last_name: getFuzzyValue(row, ['Last Name', 'Owner Last Name']),

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

        // 4. Bulk Insert
        const BATCH_SIZE = 500;

        for (let i = 0; i < validLeads.length; i += BATCH_SIZE) {
            const batch = validLeads.slice(i, i + BATCH_SIZE);

            // A. Insert into Conversations
            // FIXED: Removed csv_import_id - Schema Safe (10 params)
            const convValues = [];
            const convPlaceholders = [];

            batch.forEach((lead, idx) => {
                const offset = idx * 10;
                convPlaceholders.push(`($${offset+1}, $${offset+2}, $${offset+3}, $${offset+4}, $${offset+5}, $${offset+6}, $${offset+7}, $${offset+8}, $${offset+9}, $${offset+10}, NOW())`);

                convValues.push(
                    lead.id,
                    lead.business_name,
                    lead.lead_phone,
                    lead.email,
                    lead.us_state,
                    lead.address,
                    lead.city,
                    lead.zip,
                    lead.first_name,
                    lead.last_name
                );
            });

            if (batch.length > 0) {
                await db.query(`
                    INSERT INTO conversations (
                        id, business_name, lead_phone, email, us_state,
                        address, city, zip, first_name, last_name, created_at
                    ) VALUES ${convPlaceholders.join(', ')}
                    ON CONFLICT (lead_phone) DO NOTHING
                `, convValues);

                // B. Insert into Lead Details
                const detailValues = [];
                const detailPlaceholders = [];
                let dIdx = 0;

                batch.forEach((lead) => {
                    if (lead.tax_id || lead.ssn || lead.date_of_birth || lead.annual_revenue || lead.industry || lead.business_start_date) {
                        const offset = dIdx * 8;
                        detailPlaceholders.push(`($${offset+1}, $${offset+2}, $${offset+3}, $${offset+4}, $${offset+5}, $${offset+6}, $${offset+7}, $${offset+8}, NOW())`);

                        detailValues.push(
                            lead.id,
                            lead.annual_revenue,
                            lead.business_start_date,
                            lead.date_of_birth,
                            lead.tax_id,
                            lead.ssn,
                            lead.industry,
                            lead.requested_amount
                        );
                        dIdx++;
                    }
                });

                if (detailValues.length > 0) {
                    await db.query(`
                        INSERT INTO lead_details (
                            conversation_id, annual_revenue, business_start_date, date_of_birth,
                            tax_id_encrypted, ssn_encrypted, business_type, funding_amount, created_at
                        ) VALUES ${detailPlaceholders.join(', ')}
                        ON CONFLICT (conversation_id) DO UPDATE SET
                        tax_id_encrypted = EXCLUDED.tax_id_encrypted,
                        ssn_encrypted = EXCLUDED.ssn_encrypted,
                        annual_revenue = EXCLUDED.annual_revenue,
                        business_type = EXCLUDED.business_type,
                        funding_amount = EXCLUDED.funding_amount,
                        business_start_date = EXCLUDED.business_start_date,
                        date_of_birth = EXCLUDED.date_of_birth
                    `, detailValues);
                }

                importedCount += batch.length;
            }
        }

        // 5. Cleanup
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

        await db.query(`UPDATE csv_imports SET status = 'completed', imported_rows = $1 WHERE id = $2`, [importedCount, importId]);

        res.json({ success: true, import_id: importId, imported_count: importedCount, errors });

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
