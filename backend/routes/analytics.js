// routes/analytics.js - HANDLES: Offer comparison & accuracy tracking
const express = require('express');
const router = express.Router();
const { getDatabase } = require('../services/database');

// Record actual offer (compare to prediction)
router.post('/record-offer/:conversationId', async (req, res) => {
    try {
        const { conversationId } = req.params;
        const {
            lenderSubmissionId, lenderName, actualFunding, actualTerm,
            actualPayment, actualFactor, wasAccepted, wasFunded
        } = req.body;

        const db = getDatabase();

        const strategyRes = await db.query(`
            SELECT id, recommended_funding_max, recommended_term, recommended_payment
            FROM lead_strategy WHERE conversation_id = $1
        `, [conversationId]);

        const strategy = strategyRes.rows[0];
        const strategyId = strategy?.id || null;
        const predictedFunding = strategy?.recommended_funding_max || 0;
        const fundingVariance = actualFunding - predictedFunding;
        const fundingVariancePct = predictedFunding > 0
            ? ((fundingVariance / predictedFunding) * 100).toFixed(2)
            : 0;

        await db.query(`
            INSERT INTO offer_comparisons (
                conversation_id, strategy_id, lender_submission_id, lender_name,
                predicted_funding, predicted_term, predicted_payment, predicted_factor,
                actual_funding, actual_term, actual_payment, actual_factor,
                funding_variance, funding_variance_pct, was_accepted, was_funded
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, 1.49, $8, $9, $10, $11, $12, $13, $14, $15)
        `, [
            conversationId, strategyId, lenderSubmissionId || null, lenderName || 'Unknown',
            predictedFunding, strategy?.recommended_term || 0, strategy?.recommended_payment || 0,
            actualFunding, actualTerm, actualPayment, actualFactor,
            fundingVariance, fundingVariancePct, wasAccepted || false, wasFunded || false
        ]);

        console.log(`📊 Offer recorded: ${actualFunding} from ${lenderName} (${fundingVariancePct}% variance)`);
        res.json({ success: true, variance: fundingVariancePct });
    } catch (error) {
        console.error('Error recording offer:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get accuracy stats
router.get('/strategy-accuracy', async (req, res) => {
    try {
        const db = getDatabase();
        const result = await db.query(`SELECT * FROM strategy_accuracy_report LIMIT 12`);
        res.json({ success: true, data: result.rows });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
