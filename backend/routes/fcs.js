// routes/fcs.js - HANDLES: FCS Trigger & Status

const express = require('express');
const router = express.Router();
const { getDatabase } = require('../services/database');
const fcsService = require('../services/fcsService'); // <--- CRITICAL IMPORT

// FCS Request Deduplication
const recentFCSRequests = new Map();

// 1. TRIGGER ROUTE (Updated to actually RUN the process)
router.post('/trigger/:conversationId', async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { businessName } = req.body;
        const db = getDatabase();

        // Check for recent FCS request (prevent duplicates)
        const lastRequestTime = recentFCSRequests.get(conversationId);
        if (lastRequestTime && (Date.now() - lastRequestTime) < 5 * 60 * 1000) {
            console.log(`⚠️ FCS request for ${conversationId} was triggered recently, skipping duplicate`);
            return res.json({ success: true, status: 'skipped', message: 'FCS request already in progress' });
        }
        recentFCSRequests.set(conversationId, Date.now());

        // 1. Get conversation data
        const convResult = await db.query('SELECT * FROM conversations WHERE id = $1', [conversationId]);
        if (convResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Conversation not found' });
        }
        const conversation = convResult.rows[0];

        // 2. Insert into Job Queue (Record keeping)
        const jobResult = await db.query(`
            INSERT INTO job_queue (job_type, conversation_id, input_data, status, created_at)
            VALUES ('fcs_analysis', $1, $2, 'queued', NOW())
            RETURNING id
        `, [
            conversationId,
            JSON.stringify({
                businessName: businessName || conversation.business_name,
                revenue: conversation.monthly_revenue
            })
        ]);

        console.log(`🎯 FCS queued. Job ID: ${jobResult.rows[0].id}. STARTING PROCESSING NOW...`);

        // 3. CRITICAL FIX: Trigger the Service Immediately!
        // We do NOT await this, so the frontend gets a response instantly while this runs in background
        fcsService.generateAndSaveFCS(conversationId, businessName || conversation.business_name, db)
            .then(result => {
                console.log(`✅ Background FCS Generation Complete. Analysis ID: ${result.analysisId}`);
                
                // Update the Job Queue status to completed
                db.query(`UPDATE job_queue SET status = 'completed', completed_at = NOW() WHERE id = $1`, [jobResult.rows[0].id]);
            })
            .catch(err => {
                console.error('❌ Background FCS Generation Failed:', err.message);
                
                // Update the Job Queue status to failed
                db.query(`UPDATE job_queue SET status = 'failed', error_message = $1 WHERE id = $2`, [err.message, jobResult.rows[0].id]);
            });

        // 4. Respond to Frontend
        res.json({
            success: true,
            job_id: jobResult.rows[0].id,
            status: 'queued',
            message: 'FCS analysis started'
        });

    } catch (error) {
        console.error('Error triggering FCS:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 2. GENERATE ROUTE (Manual generation with document selection)
router.post('/generate', async (req, res) => {
    const { conversationId, businessName, documentIds } = req.body;

    if (!conversationId || !businessName) {
        return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    try {
        console.log(`📊 Manual FCS generation for: ${businessName}`);
        console.log(`📄 Document IDs: ${documentIds?.join(', ') || 'all'}`);

        const db = getDatabase();

        // Call FCS service with optional document filter
        const result = await fcsService.generateAndSaveFCS(
            conversationId,
            businessName,
            db,
            documentIds // Pass the filter
        );

        res.json({ success: true, analysisId: result.analysisId });

    } catch (err) {
        console.error('FCS Generation Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 3. STATUS ROUTE (Required for the loading spinner to know when to stop)
router.get('/status/:conversationId', async (req, res) => {
    try {
        const { conversationId } = req.params;
        const db = getDatabase();

        // Check the fcs_analyses table (where fcsService saves the result)
        const result = await db.query(`
            SELECT status, error_message 
            FROM fcs_analyses 
            WHERE conversation_id = $1 
            ORDER BY created_at DESC LIMIT 1
        `, [conversationId]);

        if (result.rows.length === 0) {
            // Check job queue as fallback
            const jobResult = await db.query(`
                SELECT status FROM job_queue 
                WHERE conversation_id = $1 AND job_type = 'fcs_analysis' 
                ORDER BY created_at DESC LIMIT 1
            `, [conversationId]);

            if (jobResult.rows.length > 0) {
                return res.json({ success: true, status: jobResult.rows[0].status });
            }

            return res.json({ success: true, status: 'not_started' });
        }

        const analysis = result.rows[0];
        
        res.json({
            success: true,
            status: analysis.status, // 'processing', 'completed', 'failed'
            error: analysis.error_message
        });

    } catch (error) {
        console.error('Error checking FCS status:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 3. RESULTS ROUTE (Fetch the final report)
router.get('/results/:conversationId', async (req, res) => {
    try {
        const { conversationId } = req.params;
        const db = getDatabase();

        const result = await db.query(
            'SELECT * FROM fcs_analyses WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 1',
            [conversationId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'No FCS results found' });
        }

        res.json({
            success: true,
            analysis: result.rows[0]
        });

    } catch (error) {
        console.error('Error fetching FCS results:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;