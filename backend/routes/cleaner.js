// backend/routes/cleaner.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const csvParser = require('csv-parser');
const tracersService = require('../services/tracersService');

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({ dest: uploadDir });

router.post('/process-file', upload.single('csvFile'), async (req, res) => {
    console.log(`[Laundromat] Processing file: ${req.file?.originalname}`);

    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const results = [];
    const rows = [];

    try {
        // 1. Read CSV
        await new Promise((resolve, reject) => {
            fs.createReadStream(req.file.path)
                .pipe(csvParser())
                .on('data', (r) => rows.push(r))
                .on('end', resolve)
                .on('error', reject);
        });

        console.log(`[Laundromat] Found ${rows.length} rows`);

        // 2. Process Rows
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const keys = Object.keys(row);

            // Find columns
            const ssnKey = keys.find(k => k.match(/ssn|social/i));
            const nameKey = keys.find(k => k.match(/owner|first/i));
            const addrKey = keys.find(k => k.match(/address/i));
            const stateKey = keys.find(k => k.match(/state/i));

            let cleanRow = {
                ...row,
                'Verified Mobile': '',
                'Home Address': '',
                'Home City': '',
                'Home State': '',
                'Home Zip': ''
            };

            // Call Service
            if (ssnKey || nameKey) {
                const result = await tracersService.searchBySsn(
                    row[ssnKey],
                    (row[nameKey] || '').split(' ')[0],
                    (row[nameKey] || '').split(' ').slice(1).join(' '),
                    row[addrKey],
                    row[stateKey]
                );

                if (result.success && result.match) {
                    cleanRow['Verified Mobile'] = result.match.phone || '';
                    cleanRow['Home Address'] = result.match.address || '';
                    cleanRow['Home City'] = result.match.city || '';
                    cleanRow['Home State'] = result.match.state || '';
                    cleanRow['Home Zip'] = result.match.zip || '';
                }
            }
            results.push(cleanRow);

            // STEALTH MODE: Random delay between 5 to 7 seconds every row
            // This prevents the server from blocking us.
            const randomDelay = Math.floor(Math.random() * (7000 - 5000 + 1) + 5000);
            await new Promise(r => setTimeout(r, randomDelay));
        }

        // 3. Download CSV
        const headers = Object.keys(results[0]);
        const csvContent = [
            headers.join(','),
            ...results.map(row => headers.map(h => `"${(row[h] || '').toString().replace(/"/g, '""')}"`).join(','))
        ].join('\n');

        // Cleanup
        fs.unlinkSync(req.file.path);

        res.header('Content-Type', 'text/csv');
        res.attachment(`CLEANED_${req.file.originalname}`);
        res.send(csvContent);

    } catch (error) {
        console.error('[Laundromat] Error:', error);
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
