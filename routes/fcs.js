// routes/fcs.js - HANDLES: FCS analysis and results
// URLs like: /api/fcs/trigger/:conversationId, /api/fcs/results/:conversationId

const express = require('express');
const router = express.Router();
const { getDatabase } = require('../services/database');

// FCS Request Deduplication (prevent double-triggering)
const recentFCSRequests = new Map(); // conversationId -> timestamp

// Trigger FCS analysis
router.post('/trigger/:conversationId', async (req, res) => {
    try {
        const { conversationId } = req.params;
        const db = getDatabase();

        // Check for recent FCS request (prevent duplicates within 5 minutes)
        const lastRequestTime = recentFCSRequests.get(conversationId);
        if (lastRequestTime && (Date.now() - lastRequestTime) < 5 * 60 * 1000) {
            console.log(`⚠️ FCS request for ${conversationId} was triggered recently, skipping duplicate`);
            return res.json({
                success: true,
                status: 'skipped',
                message: 'FCS request already in progress'
            });
        }

        // Mark this request
        recentFCSRequests.set(conversationId, Date.now());

        // Get conversation data
        const convResult = await db.query(
            'SELECT * FROM conversations WHERE id = $1',
            [conversationId]
        );

        if (convResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Conversation not found'
            });
        }

        const conversation = convResult.rows[0];

        // Check if we have enough data to run FCS
        if (!conversation.monthly_revenue || !conversation.time_in_business_months) {
            return res.status(400).json({
                success: false,
                error: 'Insufficient data for FCS analysis. Need monthly_revenue and time_in_business_months.'
            });
        }

        // Create job in queue for n8n to process
        const jobResult = await db.query(`
            INSERT INTO job_queue (job_type, conversation_id, input_data, status, created_at)
            VALUES ('fcs_analysis', $1, $2, 'queued', NOW())
            RETURNING id
        `, [
            conversationId,
            JSON.stringify({
                monthly_revenue: conversation.monthly_revenue,
                time_in_business_months: conversation.time_in_business_months,
                credit_score: conversation.credit_score,
                industry: conversation.industry
            })
        ]);

        console.log(`🎯 FCS analysis queued for conversation ${conversationId}, job ID: ${jobResult.rows[0].id}`);

        // Emit WebSocket event
        if (global.io) {
            global.io.to(`conversation_${conversationId}`).emit('fcs_triggered', {
                conversation_id: conversationId,
                job_id: jobResult.rows[0].id,
                status: 'queued'
            });
        }

        res.json({
            success: true,
            job_id: jobResult.rows[0].id,
            status: 'queued',
            message: 'FCS analysis queued for processing'
        });

    } catch (error) {
        console.error('Error triggering FCS:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get FCS results for a conversation
router.get('/results/:conversationId', async (req, res) => {
    try {
        const { conversationId } = req.params;
        const db = getDatabase();

        const result = await db.query(
            'SELECT * FROM fcs_results WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 1',
            [conversationId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'No FCS results found for this conversation'
            });
        }

        res.json({
            success: true,
            fcs_results: result.rows[0]
        });

    } catch (error) {
        console.error('Error fetching FCS results:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get all FCS results history for a conversation
router.get('/results/:conversationId/history', async (req, res) => {
    try {
        const { conversationId } = req.params;
        const db = getDatabase();

        const result = await db.query(
            'SELECT * FROM fcs_results WHERE conversation_id = $1 ORDER BY created_at DESC',
            [conversationId]
        );

        res.json({
            success: true,
            fcs_results: result.rows,
            total: result.rows.length
        });

    } catch (error) {
        console.error('Error fetching FCS history:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Save FCS results (called by n8n after processing)
router.post('/results', async (req, res) => {
    try {
        const {
            conversation_id,
            max_funding_amount,
            recommended_term_months,
            estimated_payment,
            factor_rate,
            risk_tier,
            approval_probability,
            analysis_notes
        } = req.body;

        const db = getDatabase();

        // Insert FCS results
        const result = await db.query(`
            INSERT INTO fcs_results (
                conversation_id,
                max_funding_amount,
                recommended_term_months,
                estimated_payment,
                factor_rate,
                risk_tier,
                approval_probability,
                analysis_notes,
                created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
            RETURNING *
        `, [
            conversation_id,
            max_funding_amount,
            recommended_term_months,
            estimated_payment,
            factor_rate,
            risk_tier || 'C',
            approval_probability || 0.5,
            analysis_notes
        ]);

        const fcsResults = result.rows[0];

        // Update conversation with FCS completion
        await db.query(`
            UPDATE conversations
            SET
                current_step = 'fcs_completed',
                metadata = metadata || $1,
                last_activity = NOW()
            WHERE id = $2
        `, [
            JSON.stringify({ fcs_completed_at: new Date(), fcs_result_id: fcsResults.id }),
            conversation_id
        ]);

        // Mark job as completed
        await db.query(`
            UPDATE job_queue
            SET status = 'completed', completed_at = NOW(), result_data = $1
            WHERE conversation_id = $2 AND job_type = 'fcs_analysis' AND status = 'processing'
        `, [JSON.stringify(fcsResults), conversation_id]);

        // Emit WebSocket event
        if (global.io) {
            global.io.to(`conversation_${conversation_id}`).emit('fcs_completed', {
                conversation_id: conversation_id,
                fcs_results: fcsResults
            });
            console.log(`📊 FCS results WebSocket event emitted for ${conversation_id}`);
        }

        console.log(`✅ FCS results saved for conversation ${conversation_id}`);

        res.json({
            success: true,
            fcs_results: fcsResults
        });

    } catch (error) {
        console.error('Error saving FCS results:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Delete FCS results
router.delete('/results/:fcsResultId', async (req, res) => {
    try {
        const { fcsResultId } = req.params;
        const db = getDatabase();

        await db.query('DELETE FROM fcs_results WHERE id = $1', [fcsResultId]);

        console.log(`✅ FCS results deleted: ${fcsResultId}`);

        res.json({
            success: true,
            deleted_fcs_result_id: fcsResultId
        });

    } catch (error) {
        console.error('Error deleting FCS results:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get FCS job status
router.get('/job/:jobId', async (req, res) => {
    try {
        const { jobId } = req.params;
        const db = getDatabase();

        const result = await db.query(
            'SELECT * FROM job_queue WHERE id = $1',
            [jobId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Job not found'
            });
        }

        res.json({
            success: true,
            job: result.rows[0]
        });

    } catch (error) {
        console.error('Error fetching job status:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
