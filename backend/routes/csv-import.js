// routes/csv-import.js - HANDLES: Importing leads from CSV files
// URLs like: /api/csv-import/upload, /api/csv-import/history

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

// Configure multer storage for CSV files
const storage = multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}-${file.originalname}`;
        cb(null, uniqueName);
    }
});

// CSV file uploads only
const csvUpload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'text/csv' || file.originalname.toLowerCase().endsWith('.csv')) {
            cb(null, true);
        } else {
            cb(new Error('Only CSV files are allowed'));
        }
    },
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Upload and import CSV (Optimized for YOUR specific CSV structure)
router.post('/upload', csvUpload.single('csvFile'), async (req, res) => {
    let importId = null;
    const errors = [];
    let importedCount = 0;

    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No file uploaded' });
        }

        const db = getDatabase();
        importId = uuidv4();

        // 1. Create import record (Fixed: Added column_mapping to satisfy NOT NULL constraint)
        try {
            await db.query(`
                INSERT INTO csv_imports (
                    id, filename, original_filename, status,
                    total_rows, imported_rows, error_rows,
                    column_mapping, created_at
                )
                VALUES ($1, $2, $3, 'processing', 0, 0, 0, '{}', NOW())
            `, [importId, req.file.filename, req.file.originalname]);
        } catch (err) {
            // Auto-fix table if columns are missing (Fallback safety)
            if (err.message.includes('column')) {
                console.log('🔧 Applying schema fix for csv_imports...');
                await db.query(`
                    ALTER TABLE csv_imports
                    ADD COLUMN IF NOT EXISTS total_rows INTEGER DEFAULT 0,
                    ADD COLUMN IF NOT EXISTS imported_rows INTEGER DEFAULT 0,
                    ADD COLUMN IF NOT EXISTS error_rows INTEGER DEFAULT 0,
                    ADD COLUMN IF NOT EXISTS errors JSONB DEFAULT '[]'::jsonb,
                    ADD COLUMN IF NOT EXISTS column_mapping JSONB DEFAULT '{}'::jsonb,
                    ADD COLUMN IF NOT EXISTS original_filename VARCHAR(255);
                `);
                // Retry insert
                await db.query(`
                    INSERT INTO csv_imports (
                        id, filename, original_filename, status,
                        total_rows, imported_rows, error_rows,
                        column_mapping, created_at
                    )
                    VALUES ($1, $2, $3, 'processing', 0, 0, 0, '{}', NOW())
                `, [importId, req.file.filename, req.file.originalname]);
            } else {
                throw err;
            }
        }

        // 2. Parse CSV
        const rows = [];
        await new Promise((resolve, reject) => {
            fs.createReadStream(req.file.path)
                .pipe(csvParser())
                .on('data', (row) => rows.push(row))
                .on('end', resolve)
                .on('error', reject);
        });

        await db.query('UPDATE csv_imports SET total_rows = $1 WHERE id = $2', [rows.length, importId]);

        // 3. Map Data (Customized for YOUR CSV headers)
        const validLeads = [];

        rows.forEach((row, index) => {
            try {
                const id = uuidv4();

                // Robust getter that handles your specific CSV headers
                const getVal = (keys) => {
                    for (const key of keys) {
                        if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
                            return row[key].toString().trim();
                        }
                    }
                    return null;
                };

                // MAPPING LOGIC
                const lead = {
                    id: id,
                    // Your CSV uses "Company Name"
                    business_name: getVal(['Company Name', 'Company', 'Business Name', 'Legal Name']),
                    // Your CSV uses "Phone Number"
                    lead_phone: getVal(['Phone Number', 'Phone', 'Cell Phone', 'Mobile']),
                    email: getVal(['Email', 'Business Email']),
                    state: getVal(['State', 'Business State']),
                    address: getVal(['Address', 'Business Address']),
                    city: getVal(['City']),
                    zip: getVal(['Zip', 'Zip Code']),
                    industry: getVal(['Business Type', 'Industry']),

                    // Clean numeric values - Annual Revenue divided by 12 for monthly
                    monthly_revenue: parseFloat(getVal(['Annual Revenue'])?.replace(/[^0-9.]/g, '') || 0) / 12 || null,
                    credit_score: parseInt(getVal(['Credit Score', 'FICO'])?.replace(/\D/g, '') || 0) || null,

                    // Map "Funding" column to requested amount
                    requested_amount: parseFloat(getVal(['Funding', 'Requested Amount', 'Amount'])?.replace(/[^0-9.]/g, '') || 0) || null,

                    // Extended fields
                    annual_revenue: parseFloat(getVal(['Annual Revenue'])?.replace(/[^0-9.]/g, '') || 0) || null,
                    tax_id: getVal(['TaxID', 'Tax ID', 'EIN']), // Matches "TaxID"
                    ssn: getVal(['SSN', 'Social Security']),
                    date_of_birth: getVal(['DOB', 'Date of Birth']),
                    business_start_date: getVal(['Business Start Date', 'Start Date']),

                    first_name: getVal(['First Name']),
                    last_name: getVal(['Last Name']),

                    csv_import_id: importId
                };

                if (!lead.business_name || !lead.lead_phone) {
                    // Skip empty rows
                    return;
                }

                validLeads.push(lead);
            } catch (err) {
                errors.push({ row: index + 1, error: err.message });
            }
        });

        // 4. Bulk Insert
        const BATCH_SIZE = 500;

        for (let i = 0; i < validLeads.length; i += BATCH_SIZE) {
            const batch = validLeads.slice(i, i + BATCH_SIZE);

            // Insert Conversations
            const convValues = [];
            const convPlaceholders = [];

            batch.forEach((lead, idx) => {
                const offset = idx * 19;
                convPlaceholders.push(`(
                    $${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5},
                    $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10},
                    $${offset + 11}, $${offset + 12}, 'initial_contact', 'NEW', $${offset + 13},
                    $${offset + 14}, $${offset + 15}, $${offset + 16}, $${offset + 17}, $${offset + 18}, $${offset + 19},
                    NOW(), NOW()
                )`);

                convValues.push(
                    lead.id, lead.business_name, lead.lead_phone, lead.email, lead.state,
                    lead.address, lead.city, lead.zip, // Address fields
                    lead.industry, lead.monthly_revenue, 0, // time_in_business (default 0)
                    lead.credit_score, lead.requested_amount, lead.csv_import_id,
                    lead.first_name, lead.last_name, // Owner names
                    lead.business_name, lead.lead_phone, // display_name, contact
                    'medium' // priority
                );
            });

            if (batch.length > 0) {
                await db.query(`
                    INSERT INTO conversations (
                        id, business_name, lead_phone, lead_email, us_state,
                        address, city, zip,
                        industry, monthly_revenue, time_in_business_months,
                        credit_score, requested_amount, csv_import_id,
                        first_name, last_name,
                        display_name, contact, priority, created_at, last_activity
                    )
                    VALUES ${convPlaceholders.join(', ')}
                    ON CONFLICT (lead_phone) DO NOTHING
                `, convValues);

                // Insert Lead Details
                const detailValues = [];
                const detailPlaceholders = [];
                let dIdx = 0;

                batch.forEach((lead) => {
                    const offset = dIdx * 8;
                    detailPlaceholders.push(`(
                        $${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4},
                        $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, NOW()
                    )`);

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
                });

                if (detailValues.length > 0) {
                    await db.query(`
                        INSERT INTO lead_details (
                            conversation_id, annual_revenue, business_start_date, date_of_birth,
                            tax_id_encrypted, ssn_encrypted, business_type, funding_amount, created_at
                        )
                        VALUES ${detailPlaceholders.join(', ')}
                        ON CONFLICT (conversation_id) DO NOTHING
                    `, detailValues);
                }

                importedCount += batch.length;
                console.log(`✅ Batch processed: ${batch.length} rows`);
            }
        }

        // 5. Cleanup
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

        await db.query(`
            UPDATE csv_imports
            SET status = $1, imported_rows = $2, error_rows = $3, errors = $4, completed_at = NOW()
            WHERE id = $5
        `, [
            errors.length > 0 ? 'completed_with_errors' : 'completed',
            importedCount,
            errors.length,
            JSON.stringify(errors.slice(0, 100)),
            importId
        ]);

        if (global.io) {
            global.io.emit('csv_import_completed', {
                import_id: importId,
                imported_count: importedCount,
                error_count: errors.length
            });
        }

        res.json({
            success: true,
            import_id: importId,
            total_rows: rows.length,
            imported_count: importedCount,
            errors: errors.slice(0, 10)
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
