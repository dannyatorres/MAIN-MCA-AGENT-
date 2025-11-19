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

// Upload and import CSV (Optimized - Bulk Insert into TWO Tables)
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

        // 1. Create import record
        await db.query(`
            INSERT INTO csv_imports (id, filename, status, total_rows, imported_rows, error_rows, created_at)
            VALUES ($1, $2, 'processing', 0, 0, 0, NOW())
        `, [importId, req.file.originalname]);

        // 2. Parse CSV into memory
        const rows = [];
        await new Promise((resolve, reject) => {
            fs.createReadStream(req.file.path)
                .pipe(csvParser())
                .on('data', (row) => rows.push(row))
                .on('end', resolve)
                .on('error', reject);
        });

        // Update total rows count
        await db.query('UPDATE csv_imports SET total_rows = $1 WHERE id = $2', [rows.length, importId]);

        // 3. Prepare data arrays
        const validLeads = [];

        rows.forEach((row, index) => {
            try {
                const id = uuidv4(); // Generate ID here so we can use it for both tables

                // Helper to find value case-insensitively
                const getVal = (keys) => {
                    for (const key of keys) {
                        if (row[key]) return row[key].trim();
                        // Case-insensitive check
                        const found = Object.keys(row).find(k => k.toLowerCase() === key.toLowerCase());
                        if (found && row[found]) return row[found].trim();
                    }
                    return null;
                };

                // Map Conversation Fields (Basic Info)
                const lead = {
                    id: id,
                    business_name: getVal(['Business Name', 'Company', 'Legal Name', 'BusinessName']),
                    lead_phone: getVal(['Phone', 'Cell', 'Mobile', 'Lead Phone', 'Cell Phone']),
                    lead_email: getVal(['Email', 'Business Email', 'Lead Email']),
                    us_state: getVal(['State', 'Business State', 'US State']),
                    business_address: getVal(['Address', 'Business Address', 'Street']),
                    city: getVal(['City', 'Business City']),
                    zip: getVal(['Zip', 'Zip Code', 'Postal Code']),
                    industry: getVal(['Industry', 'Business Type', 'Industry Type']),
                    monthly_revenue: parseFloat(getVal(['Monthly Revenue', 'Revenue', 'Sales'])?.replace(/[^0-9.]/g, '') || 0) || null,
                    time_in_business_months: parseInt(getVal(['Time In Business', 'Months in Business'])?.replace(/\D/g, '') || 0) || null,
                    credit_score: parseInt(getVal(['Credit Score', 'FICO', 'Credit'])?.replace(/\D/g, '') || 0) || null,
                    requested_amount: parseFloat(getVal(['Requested Amount', 'Funding Amount', 'Amount'])?.replace(/[^0-9.]/g, '') || 0) || null,
                    priority: 'medium',

                    // Extended Details (For lead_details table)
                    annual_revenue: parseFloat(getVal(['Annual Revenue', 'Annual Sales'])?.replace(/[^0-9.]/g, '') || 0) || null,
                    tax_id: getVal(['Tax ID', 'EIN', 'Federal Tax ID', 'FEIN']),
                    ssn: getVal(['SSN', 'Social Security', 'Owner SSN']),
                    date_of_birth: getVal(['DOB', 'Date of Birth', 'Owner DOB']),
                    business_start_date: getVal(['Start Date', 'Business Start Date', 'Established']),

                    // Owner Info (Can be mapped to conversation or lead_details)
                    first_name: getVal(['First Name', 'Owner First Name', 'Owner Name']),
                    last_name: getVal(['Last Name', 'Owner Last Name']),

                    csv_import_id: importId
                };

                // Split "Owner Name" if provided as one field
                if (!lead.last_name && lead.first_name && lead.first_name.includes(' ')) {
                    const parts = lead.first_name.split(' ');
                    lead.last_name = parts.pop();
                    lead.first_name = parts.join(' ');
                }

                // Validation
                if (!lead.business_name || !lead.lead_phone) {
                    throw new Error('Missing required fields: Business Name or Phone');
                }

                validLeads.push(lead);
            } catch (err) {
                errors.push({ row: index + 1, error: err.message, data: row });
            }
        });

        // 4. Execute Bulk Insert (Batched)
        const BATCH_SIZE = 500;

        for (let i = 0; i < validLeads.length; i += BATCH_SIZE) {
            const batch = validLeads.slice(i, i + BATCH_SIZE);

            // --- INSERT CONVERSATIONS ---
            const convValues = [];
            const convPlaceholders = [];

            batch.forEach((lead, idx) => {
                const offset = idx * 18;
                convPlaceholders.push(`(
                    $${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5},
                    $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10},
                    $${offset + 11}, 'initial_contact', 'NEW', $${offset + 12}, $${offset + 13},
                    $${offset + 14}, $${offset + 15}, $${offset + 16}, $${offset + 17}, $${offset + 18},
                    NOW(), NOW()
                )`);

                convValues.push(
                    lead.id, lead.business_name, lead.lead_phone, lead.lead_email, lead.us_state,
                    lead.business_address, lead.city, lead.zip, // Added City/Zip
                    lead.industry, lead.monthly_revenue, lead.time_in_business_months,
                    lead.credit_score, lead.requested_amount, lead.priority, lead.csv_import_id,
                    lead.first_name, lead.last_name, // Added Owner Names
                    lead.business_name, lead.lead_phone
                );
            });

            if (batch.length > 0) {
                const convQuery = `
                    INSERT INTO conversations (
                        id, business_name, lead_phone, lead_email, us_state,
                        address, city, zip,
                        industry, monthly_revenue, time_in_business_months,
                        credit_score, requested_amount, current_step, state, priority,
                        csv_import_id, first_name, last_name,
                        display_name, contact, created_at, last_activity
                    )
                    VALUES ${convPlaceholders.join(', ')}
                    ON CONFLICT (lead_phone) DO NOTHING
                `;

                await db.query(convQuery, convValues);

                // --- INSERT LEAD DETAILS (Linked by ID) ---
                const detailValues = [];
                const detailPlaceholders = [];
                let insertedCount = 0;

                batch.forEach((lead, idx) => {
                    const offset = idx * 8;
                    detailPlaceholders.push(`(
                        $${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4},
                        $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, NOW()
                    )`);

                    detailValues.push(
                        lead.id, // conversation_id
                        lead.annual_revenue,
                        lead.business_start_date,
                        lead.date_of_birth,
                        lead.tax_id, // tax_id_encrypted
                        lead.ssn,    // ssn_encrypted
                        lead.industry, // business_type
                        lead.requested_amount // funding_amount
                    );
                    insertedCount++;
                });

                if (insertedCount > 0) {
                    const detailQuery = `
                        INSERT INTO lead_details (
                            conversation_id, annual_revenue, business_start_date, date_of_birth,
                            tax_id_encrypted, ssn_encrypted, business_type, funding_amount, created_at
                        )
                        VALUES ${detailPlaceholders.join(', ')}
                        ON CONFLICT (conversation_id) DO NOTHING
                    `;
                    await db.query(detailQuery, detailValues);
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
