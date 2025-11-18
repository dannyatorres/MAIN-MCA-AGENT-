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

// Upload and import CSV (Performance Optimized - Bulk Insert Strategy)
router.post('/upload', csvUpload.single('csvFile'), async (req, res) => {
    let importId = null;
    const errors = [];
    let importedCount = 0;

    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No file uploaded' });
        }

        console.log('📁 CSV file uploaded:', req.file.originalname);

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

        console.log(`📊 CSV parsed: ${rows.length} rows found`);

        // Update total rows count immediately
        await db.query('UPDATE csv_imports SET total_rows = $1 WHERE id = $2', [rows.length, importId]);

        // 3. Prepare data for Bulk Insert
        const validLeads = [];

        rows.forEach((row, index) => {
            try {
                // Map fields
                const lead = {
                    id: uuidv4(),
                    business_name: row.business_name || row['Business Name'] || row.BusinessName,
                    lead_phone: row.phone || row.lead_phone || row['Phone'] || row['Lead Phone'],
                    lead_email: row.email || row.lead_email || row['Email'] || row['Lead Email'],
                    state: row.state || row.State,
                    business_address: row.address || row.business_address || row['Business Address'],
                    industry: row.industry || row.Industry,
                    monthly_revenue: parseFloat(row.monthly_revenue || row['Monthly Revenue'] || 0) || null,
                    time_in_business_months: parseInt(row.time_in_business || row['Time In Business'] || 0) || null,
                    credit_score: parseInt(row.credit_score || row['Credit Score'] || 0) || null,
                    requested_amount: parseFloat(row.requested_amount || row['Requested Amount'] || 0) || null,
                    priority: row.priority || 'medium',
                    csv_import_id: importId
                };

                // Validation
                if (!lead.business_name || !lead.lead_phone) {
                    throw new Error('Missing required fields: business_name or lead_phone');
                }

                validLeads.push(lead);
            } catch (err) {
                errors.push({ row: index + 1, error: err.message, data: row });
            }
        });

        // 4. Execute Bulk Insert (Batched)
        // We insert in batches of 500 to avoid hitting SQL parameter limits (65,535 params max)
        const BATCH_SIZE = 500;

        for (let i = 0; i < validLeads.length; i += BATCH_SIZE) {
            const batch = validLeads.slice(i, i + BATCH_SIZE);
            const values = [];
            const valuePlaceholders = [];

            batch.forEach((lead, idx) => {
                const offset = idx * 15; // 15 columns per row
                valuePlaceholders.push(`(
                    $${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5},
                    $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10},
                    $${offset + 11}, 'initial_contact', 'NEW', $${offset + 12}, $${offset + 13},
                    $${offset + 14}, $${offset + 15}, NOW(), NOW()
                )`);

                values.push(
                    lead.id, lead.business_name, lead.lead_phone, lead.lead_email, lead.state,
                    lead.business_address, lead.industry, lead.monthly_revenue, lead.time_in_business_months,
                    lead.credit_score, lead.requested_amount, lead.priority, lead.csv_import_id,
                    lead.business_name, // display_name fallback
                    lead.lead_phone // fallback for contact field
                );
            });

            if (batch.length > 0) {
                const query = `
                    INSERT INTO conversations (
                        id, business_name, lead_phone, lead_email, state,
                        business_address, industry, monthly_revenue, time_in_business_months,
                        credit_score, requested_amount, current_step, state, priority,
                        csv_import_id, display_name, contact, created_at, last_activity
                    )
                    VALUES ${valuePlaceholders.join(', ')}
                `;

                await db.query(query, values);
                importedCount += batch.length;
                console.log(`✅ Batch inserted: ${batch.length} rows (Total: ${importedCount}/${validLeads.length})`);
            }
        }

        // 5. Final cleanup & status update
        fs.unlinkSync(req.file.path); // Delete temp file

        await db.query(`
            UPDATE csv_imports
            SET status = $1, imported_rows = $2, error_rows = $3, errors = $4, completed_at = NOW()
            WHERE id = $5
        `, [
            errors.length > 0 ? 'completed_with_errors' : 'completed',
            importedCount,
            errors.length,
            JSON.stringify(errors.slice(0, 100)), // Store first 100 errors only to save space
            importId
        ]);

        // Notify frontend via WebSocket
        if (global.io) {
            global.io.emit('csv_import_completed', {
                import_id: importId,
                imported_count: importedCount,
                error_count: errors.length
            });
        }

        console.log(`🎉 CSV import completed: ${importedCount} imported, ${errors.length} errors`);

        res.json({
            success: true,
            import_id: importId,
            total_rows: rows.length,
            imported_count: importedCount,
            error_count: errors.length,
            errors: errors.slice(0, 10)
        });

    } catch (error) {
        console.error('❌ Import Error:', error);
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

        if (importId) {
            const db = getDatabase();
            await db.query(`
                UPDATE csv_imports SET status = 'failed', errors = $1 WHERE id = $2
            `, [JSON.stringify([{ error: error.message }]), importId]);
        }

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
