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

// Upload and import CSV
router.post('/upload', csvUpload.single('file'), async (req, res) => {
    let importId = null;
    let importedCount = 0;
    let errorCount = 0;
    const errors = [];

    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No file uploaded'
            });
        }

        console.log('📁 CSV file uploaded:', req.file.originalname);

        const db = getDatabase();
        importId = uuidv4();

        // Create import record
        await db.query(`
            INSERT INTO csv_imports (id, filename, status, total_rows, imported_rows, error_rows, created_at)
            VALUES ($1, $2, 'processing', 0, 0, 0, NOW())
        `, [importId, req.file.originalname]);

        const filePath = req.file.path;
        const rows = [];

        // Parse CSV file
        await new Promise((resolve, reject) => {
            fs.createReadStream(filePath)
                .pipe(csvParser())
                .on('data', (row) => {
                    rows.push(row);
                })
                .on('end', () => {
                    console.log(`📊 CSV parsed: ${rows.length} rows found`);
                    resolve();
                })
                .on('error', (error) => {
                    console.error('Error parsing CSV:', error);
                    reject(error);
                });
        });

        // Update total rows
        await db.query(
            'UPDATE csv_imports SET total_rows = $1 WHERE id = $2',
            [rows.length, importId]
        );

        // Process each row
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];

            try {
                // Map CSV columns to database fields
                const conversationData = {
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
                    current_step: 'initial_contact',
                    state_status: 'NEW',
                    priority: row.priority || 'medium',
                    csv_import_id: importId
                };

                // Validate required fields
                if (!conversationData.business_name || !conversationData.lead_phone) {
                    throw new Error('Missing required fields: business_name or lead_phone');
                }

                // Insert conversation
                await db.query(`
                    INSERT INTO conversations (
                        id, business_name, lead_phone, lead_email, state,
                        business_address, industry, monthly_revenue,
                        time_in_business_months, credit_score, requested_amount,
                        current_step, state AS state_status, priority,
                        csv_import_id, created_at, last_activity
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW())
                `, [
                    conversationData.id,
                    conversationData.business_name,
                    conversationData.lead_phone,
                    conversationData.lead_email,
                    conversationData.state,
                    conversationData.business_address,
                    conversationData.industry,
                    conversationData.monthly_revenue,
                    conversationData.time_in_business_months,
                    conversationData.credit_score,
                    conversationData.requested_amount,
                    conversationData.current_step,
                    conversationData.state_status,
                    conversationData.priority,
                    importId
                ]);

                importedCount++;

                console.log(`✅ Row ${i + 1} imported: ${conversationData.business_name}`);

            } catch (error) {
                errorCount++;
                errors.push({
                    row: i + 1,
                    data: row,
                    error: error.message
                });
                console.error(`❌ Error importing row ${i + 1}:`, error.message);
            }
        }

        // Update import record with final counts
        await db.query(`
            UPDATE csv_imports
            SET
                status = $1,
                imported_rows = $2,
                error_rows = $3,
                errors = $4,
                completed_at = NOW()
            WHERE id = $5
        `, [
            errorCount > 0 ? 'completed_with_errors' : 'completed',
            importedCount,
            errorCount,
            JSON.stringify(errors),
            importId
        ]);

        // Delete the uploaded file
        fs.unlinkSync(filePath);

        // Emit WebSocket event
        if (global.io) {
            global.io.emit('csv_import_completed', {
                import_id: importId,
                imported_count: importedCount,
                error_count: errorCount
            });
        }

        console.log(`🎉 CSV import completed: ${importedCount} imported, ${errorCount} errors`);

        res.json({
            success: true,
            import_id: importId,
            total_rows: rows.length,
            imported_count: importedCount,
            error_count: errorCount,
            errors: errors.length > 0 ? errors.slice(0, 10) : [] // Return first 10 errors
        });

    } catch (error) {
        console.error('Error importing CSV:', error);

        // Update import record as failed
        if (importId) {
            const db = getDatabase();
            await db.query(`
                UPDATE csv_imports
                SET status = 'failed', errors = $1, completed_at = NOW()
                WHERE id = $2
            `, [JSON.stringify([{ error: error.message }]), importId]);
        }

        // Clean up file
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        res.status(500).json({
            success: false,
            error: error.message
        });
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
