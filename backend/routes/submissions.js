// routes/submissions.js - HANDLES: Lender submissions & qualifications
const express = require('express');
const router = express.Router();
const { getDatabase } = require('../services/database');
const EmailService = require('../services/emailService');
const { updateState } = require('../services/stateManager');
const successPredictor = require('../services/successPredictor');
const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

const emailService = new EmailService();

const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || 'us-east-1'
});

// Send to lenders
router.post('/:id/send', async (req, res) => {
    try {
        const { id: conversationId } = req.params;
        const { selectedLenders, businessData, documents } = req.body;

        console.log(`🚀 FAST-SEND: Processing batch for ${selectedLenders?.length} lenders...`);

        if (!selectedLenders || selectedLenders.length === 0) {
            return res.status(400).json({ success: false, error: 'No lenders selected' });
        }

        const db = getDatabase();

        // Fetch lead criteria for success prediction
        const leadRes = await db.query(`
            SELECT industry_type, us_state, monthly_revenue, credit_score, business_start_date
            FROM conversations WHERE id = $1
        `, [conversationId]);

        const lead = leadRes.rows[0] || {};

        // Calculate TIB from business_start_date (handle null)
        let tib = 0;
        if (lead.business_start_date) {
            const startDate = new Date(lead.business_start_date);
            if (!isNaN(startDate.getTime())) {
                const today = new Date();
                tib = Math.floor((today - startDate) / (1000 * 60 * 60 * 24 * 30));
            }
        }

        const leadCriteria = {
            industry: lead.industry_type || null,
            state: lead.us_state || null,
            monthlyRevenue: lead.monthly_revenue || 0,
            fico: lead.credit_score || 0,
            tib: tib
        };

        // Predict success for all selected lenders and sort
        let rankedLenders = selectedLenders;
        try {
            const predictions = await successPredictor.predictSuccessForAll(selectedLenders, leadCriteria);
            rankedLenders = predictions;
            console.log(`📊 SMART RANKING: Sorted ${predictions.length} lenders by predicted success rate`);
        } catch (predErr) {
            console.warn('⚠️ Success prediction failed, using original order:', predErr.message);
        }

        // Pre-download documents from S3
        const fileAttachments = [];
        if (documents && documents.length > 0) {
            console.log(`📥 Downloading ${documents.length} documents from S3...`);
            const docIds = documents.map(d => d.id);
            const docResult = await db.query(
                `SELECT * FROM documents WHERE id = ANY($1::uuid[])`,
                [docIds]
            );

            const downloadPromises = docResult.rows.map(async (doc) => {
                if (!doc.s3_key) return null;
                try {
                    const s3Obj = await s3.getObject({
                        Bucket: process.env.S3_DOCUMENTS_BUCKET,
                        Key: doc.s3_key
                    }).promise();
                    return {
                        filename: doc.original_filename,
                        content: s3Obj.Body,
                        contentType: doc.mime_type || 'application/pdf'
                    };
                } catch (err) {
                    console.error(`❌ S3 Download Failed [${doc.original_filename}]:`, err.message);
                    return null;
                }
            });

            const results = await Promise.all(downloadPromises);
            fileAttachments.push(...results.filter(f => f !== null));
        }

        // Parallel submission
        const submissionPromises = rankedLenders.map(async (lenderData) => {
            const lenderName = lenderData.name || lenderData.lender_name;
            let lenderEmail = lenderData.email;
            let lenderCC = lenderData.cc_email || null;
            const submissionId = uuidv4();

            try {
                if (!lenderName) throw new Error('Missing lender name');

                // Find lender in DB
                let lenderId = null;
                const lenderResult = await db.query(
                    `SELECT id, email, cc_email FROM lenders
                     WHERE LOWER(TRIM(name)) ILIKE '%' || LOWER(TRIM($1)) || '%'
                        OR LOWER(TRIM($1)) ILIKE '%' || LOWER(TRIM(name)) || '%'
                     LIMIT 1`,
                    [lenderName]
                );

                if (lenderResult.rows.length > 0) {
                    const dbLender = lenderResult.rows[0];
                    lenderId = dbLender.id;
                    if (!lenderEmail || !lenderEmail.includes('@')) lenderEmail = dbLender.email;
                    if (!lenderCC && dbLender.cc_email) lenderCC = dbLender.cc_email;
                }

                if (!lenderEmail || !lenderEmail.includes('@')) {
                    throw new Error(`No valid email address found for ${lenderName}`);
                }

                // Create DB Record
                await db.query(`
                    INSERT INTO lender_submissions (
                        id, conversation_id, lender_id, lender_name, status,
                        submitted_at, custom_message, message, created_at
                    ) VALUES ($1, $2, $3, $4, 'processing', NOW(), $5, $5, NOW())
                `, [submissionId, conversationId, lenderId, lenderName, businessData?.customMessage || null]);

                // Send Email
                const emailResult = await emailService.sendLenderSubmission(
                    lenderName, lenderEmail, businessData, fileAttachments, lenderCC
                );

                if (emailResult.success) {
                    await db.query('UPDATE lender_submissions SET status = $1 WHERE id = $2', ['sent', submissionId]);
                    return { status: 'fulfilled', lenderName, emailSent: true };
                } else {
                    throw new Error(emailResult.error || 'Email service failed');
                }

            } catch (error) {
                console.error(`❌ Failed to send to ${lenderName}:`, error.message);
                if (submissionId) {
                    try { await db.query('UPDATE lender_submissions SET status = $1 WHERE id = $2', ['failed', submissionId]); } catch (e) {}
                }
                return { status: 'rejected', lenderName, reason: error.message };
            }
        });

        const results = await Promise.all(submissionPromises);
        const successful = results.filter(r => r.status === 'fulfilled');
        const failed = results.filter(r => r.status === 'rejected').map(r => ({
            lender: r.lenderName,
            error: r.reason
        }));

        console.log(`🏁 Batch Complete: ${successful.length} sent, ${failed.length} failed.`);

        // Update state to SUBMITTED after successful batch send
        if (successful.length > 0) {
            await updateState(conversationId, 'SUBMITTED', 'submissions');
            console.log(`📝 State updated to SUBMITTED for conversation ${conversationId}`);
        }

        res.json({
            success: true,
            results: { successful, failed, total: rankedLenders.length }
        });

    } catch (error) {
        console.error('❌ Critical Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Save qualification results
router.post('/:id/qualifications/save', async (req, res) => {
    try {
        const { id: conversationId } = req.params;
        const { results, criteria } = req.body;
        const db = getDatabase();

        console.log(`💾 Saving lender qualifications for conversation: ${conversationId}`);

        const recordId = uuidv4();

        await db.query('DELETE FROM lender_qualifications WHERE conversation_id = $1', [conversationId]);

        await db.query(`
            INSERT INTO lender_qualifications (
                id, conversation_id, qualification_data, criteria_used, qualified_lenders, created_at
            )
            VALUES ($1, $2, $3, $4, $5, NOW())
        `, [
            recordId, conversationId,
            JSON.stringify(results), JSON.stringify(criteria),
            JSON.stringify(results.qualified || [])
        ]);

        console.log('✅ Qualification results saved to database');

        await db.query('UPDATE conversations SET last_activity = NOW() WHERE id = $1', [conversationId]);

        res.json({ success: true });
    } catch (error) {
        console.error('❌ Error saving lender qualifications:', error);
        res.status(500).json({ error: 'Failed to save results' });
    }
});

// Get qualification results
router.get('/:id/qualifications', async (req, res) => {
    try {
        const { id } = req.params;
        const db = getDatabase();

        const result = await db.query(`
            SELECT * FROM lender_qualifications
            WHERE conversation_id = $1
            ORDER BY created_at DESC
            LIMIT 1
        `, [id]);

        if (result.rows.length === 0) {
            return res.json({ success: false, message: 'No qualification data found' });
        }

        res.json({
            success: true,
            data: result.rows[0].qualification_data,
            criteria: result.rows[0].criteria_used
        });
    } catch (error) {
        console.error('❌ Error fetching lender qualifications:', error);
        res.status(500).json({ error: 'Failed to fetch results' });
    }
});

module.exports = router;
