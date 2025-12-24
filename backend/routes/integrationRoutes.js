// backend/routes/integrationRoutes.js
const express = require('express');
const router = express.Router();
const { syncDriveFiles } = require('../services/driveService');

// In-memory job tracking (use Redis in production for multi-server)
const jobs = new Map();

// POST /api/integrations/drive/sync - Start the job
router.post('/drive/sync', async (req, res) => {
    const { conversationId, businessName } = req.body;

    if (!conversationId || !businessName) {
        return res.status(400).json({ success: false, error: "Missing conversationId or businessName" });
    }

    // Generate unique job ID
    const jobId = `${conversationId}-${Date.now()}`;

    // Initialize job status
    jobs.set(jobId, {
        status: 'processing',
        conversationId,
        businessName,
        startedAt: new Date(),
        progress: 'Starting sync...',
        result: null,
        error: null
    });

    // Return immediately with job ID
    res.json({ success: true, jobId, status: 'processing' });

    // Process in background (don't await)
    processSync(jobId, conversationId, businessName);
});

// GET /api/integrations/drive/sync/status/:jobId - Check job status
router.get('/drive/sync/status/:jobId', (req, res) => {
    const { jobId } = req.params;
    const job = jobs.get(jobId);

    if (!job) {
        return res.status(404).json({ success: false, error: 'Job not found' });
    }

    res.json({
        success: true,
        jobId,
        status: job.status,
        progress: job.progress,
        result: job.result,
        error: job.error
    });

    // Clean up completed jobs after client fetches result
    if (job.status === 'completed' || job.status === 'failed') {
        setTimeout(() => jobs.delete(jobId), 60000); // Clean up after 1 minute
    }
});

// Background processor
async function processSync(jobId, conversationId, businessName) {
    const job = jobs.get(jobId);

    try {
        console.log(`☁️ Sync Job ${jobId} started for: ${businessName}`);

        job.progress = 'Searching Drive and downloading files...';

        const result = await syncDriveFiles(conversationId, businessName);

        job.status = 'completed';
        job.progress = 'Complete';
        job.result = result;

        console.log(`✅ Sync Job ${jobId} completed`);

    } catch (err) {
        console.error(`❌ Sync Job ${jobId} failed:`, err);
        job.status = 'failed';
        job.error = err.message;
    }
}

module.exports = router;
