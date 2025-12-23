// backend/routes/cleaner.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const csvParser = require('csv-parser');
const tracersService = require('../services/tracersService');

const upload = multer({ dest: 'uploads/' });

// Job storage
const jobs = {};

// Helper: Random pause
const randomPause = (min, max) => new Promise(resolve => {
    const time = Math.floor(Math.random() * (max - min + 1) + min);
    setTimeout(resolve, time);
});

// ============================================
// POST /process-file - Start async job
// ============================================
router.post('/process-file', upload.single('csvFile'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const jobId = `job_${Date.now()}`;

    jobs[jobId] = {
        status: 'processing',
        progress: 0,
        total: 0,
        completed: 0,
        fileName: req.file.originalname,
        outputPath: null,
        error: null
    };

    // Return immediately
    res.json({ success: true, jobId });

    // Process in background
    processFileAsync(jobId, req.file.path, req.file.originalname);
});

// ============================================
// GET /status/:jobId - Check progress
// ============================================
router.get('/status/:jobId', (req, res) => {
    const job = jobs[req.params.jobId];

    if (!job) {
        return res.status(404).json({ success: false, error: 'Job not found' });
    }

    res.json({
        success: true,
        status: job.status,
        progress: job.progress,
        total: job.total,
        completed: job.completed,
        error: job.error
    });
});

// ============================================
// GET /download/:jobId - Download result
// ============================================
router.get('/download/:jobId', (req, res) => {
    const job = jobs[req.params.jobId];

    if (!job || job.status !== 'complete') {
        return res.status(404).json({ success: false, error: 'File not ready' });
    }

    res.download(job.outputPath, `VERIFIED_${job.fileName}`, (err) => {
        if (!err) {
            // Cleanup after download
            setTimeout(() => {
                if (fs.existsSync(job.outputPath)) fs.unlinkSync(job.outputPath);
                delete jobs[req.params.jobId];
            }, 60000);
        }
    });
});

// ============================================
// Background processor
// ============================================
async function processFileAsync(jobId, filePath, originalName) {
    const job = jobs[jobId];
    const results = [];
    const rows = [];

    try {
        // 1. Read CSV
        await new Promise((resolve) => {
            fs.createReadStream(filePath)
                .pipe(csvParser())
                .on('data', (r) => rows.push(r))
                .on('end', resolve);
        });

        job.total = rows.length;
        console.log(`[Cleaner] Job ${jobId}: Starting ${originalName} (${rows.length} rows)`);

        // 2. Process each row
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const keys = Object.keys(row);

            const ssnKey = keys.find(k => k.match(/ssn|social/i));
            const nameKey = keys.find(k => k.match(/owner|first/i));
            const addrKey = keys.find(k => k.match(/address/i));
            const stateKey = keys.find(k => k.match(/state/i));

            let cleanRow = { ...row, 'Verified Mobile': '', 'Home Address': '', 'Home City': '', 'Home State': '', 'Home Zip': '' };

            if (ssnKey || nameKey) {
                try {
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
                        console.log(`[Row ${i}] ✅ ${row[nameKey]} → Phone: ${result.match.phone || 'N/A'} | ${result.match.address || 'N/A'}, ${result.match.city || ''} ${result.match.state || ''}`);
                    } else {
                        console.log(`[Row ${i}] ❌ ${row[nameKey]} → ${result.error || 'No match'}`);
                    }
                } catch (rowError) {
                    console.log(`[Row ${i}] ⚠️ ${row[nameKey]} → Error: ${rowError.message}`);
                    // Row continues with empty verified fields
                }
            }

            results.push(cleanRow);

            // Update progress
            job.completed = i + 1;
            job.progress = Math.round(((i + 1) / rows.length) * 100);

            await randomPause(300, 800);
        }

        // 3. Generate CSV
        const headers = Object.keys(results[0]);
        const csvContent = [
            headers.join(','),
            ...results.map(row => headers.map(h => `"${(row[h]||'').toString().replace(/"/g,'""')}"`).join(','))
        ].join('\n');

        // 4. Save output
        const outputPath = `uploads/verified_${jobId}.csv`;
        fs.writeFileSync(outputPath, csvContent);
        fs.unlinkSync(filePath);

        // 5. Mark complete
        job.status = 'complete';
        job.outputPath = outputPath;

        const successCount = results.filter(r => r['Verified Mobile'] || r['Home Address']).length;
        console.log(`[Cleaner] Job ${jobId}: Done - ${successCount}/${rows.length} enriched`);

    } catch (error) {
        console.error(`[Cleaner] Job ${jobId} Error:`, error.message);
        job.status = 'error';
        job.error = error.message;
    }
}

module.exports = router;
