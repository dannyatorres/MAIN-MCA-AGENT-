// backend/routes/cleaner.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const csvParser = require('csv-parser');
const tracersService = require('../services/tracersService');

const upload = multer({ dest: 'uploads/' });

// Helper: Random pause to prevent timeouts/blocking
const randomPause = (min, max) => new Promise(resolve => {
    const time = Math.floor(Math.random() * (max - min + 1) + min);
    setTimeout(resolve, time);
});

router.post('/process-file', upload.single('csvFile'), async (req, res) => {
    console.log(`[Laundromat] Processing file: ${req.file.originalname}`);

    const results = [];
    const rows = [];

    await new Promise((resolve) => {
        fs.createReadStream(req.file.path)
            .pipe(csvParser())
            .on('data', (r) => rows.push(r))
            .on('end', resolve);
    });

    console.log(`Found ${rows.length} rows.`);

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const keys = Object.keys(row);

        // FIND KEYS
        const ssnKey = keys.find(k => k.match(/ssn|social/i));
        const nameKey = keys.find(k => k.match(/owner|first/i));
        const addrKey = keys.find(k => k.match(/address/i));
        const stateKey = keys.find(k => k.match(/state/i));

        // DEBUG LOG (Only for the first row to check columns)
        if (i === 0) {
            console.log(`[Row 1 Analysis]`);
            console.log(`   Keys Found: SSN='${ssnKey}', Name='${nameKey}', Addr='${addrKey}'`);
            console.log(`   Values: SSN='${row[ssnKey]}', Name='${row[nameKey]}'`);
        }

        let cleanRow = { ...row, 'Verified Mobile': '', 'Home Address': '', 'Home City': '', 'Home State': '', 'Home Zip': '' };

        if (ssnKey || nameKey) {
            const result = await tracersService.searchBySsn(
                row[ssnKey],
                (row[nameKey] || '').split(' ')[0],
                (row[nameKey] || '').split(' ').slice(1).join(' '),
                row[addrKey],
                row[stateKey]
            );

            // RESULT LOG
            if (result.success && result.match) {
                console.log(`   > Match found for row ${i}`);
                cleanRow['Verified Mobile'] = result.match.phone || '';
                cleanRow['Home Address'] = result.match.address || '';
                cleanRow['Home City'] = result.match.city || '';
                cleanRow['Home State'] = result.match.state || '';
                cleanRow['Home Zip'] = result.match.zip || '';
            } else {
                // Log WHY it failed
                console.log(`   > Row ${i} Skipped: ${result.error}`);
            }
        } else {
            console.log(`   > Row ${i} Skipped: Could not find SSN or Name columns.`);
        }

        results.push(cleanRow);

        // STEALTH DELAY (1-3 seconds)
        await randomPause(1000, 3000);
    }

    const headers = Object.keys(results[0]);
    const csvContent = [
        headers.join(','),
        ...results.map(row => headers.map(h => `"${(row[h]||'').toString().replace(/"/g,'""')}"`).join(','))
    ].join('\n');

    fs.unlinkSync(req.file.path);
    res.header('Content-Type', 'text/csv');
    res.attachment(`CLEANED_${req.file.originalname}`);
    res.send(csvContent);
});

module.exports = router;
