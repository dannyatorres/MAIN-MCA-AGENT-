// routes/commander.js - HANDLES: AI Strategy Analysis
const express = require('express');
const router = express.Router();
const { analyzeAndStrategize, generateOffer, reStrategize } = require('../services/commanderService');

// Run strategy analysis
router.post('/:id/analyze', async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`COMMANDER: Running strategy analysis for ${id}...`);

        const gamePlan = await analyzeAndStrategize(id);

        if (!gamePlan) {
            return res.status(400).json({
                success: false,
                error: 'Analysis failed. Make sure FCS data exists for this lead.'
            });
        }

        res.json({ success: true, gamePlan });
    } catch (error) {
        console.error('Strategy Analysis Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Generate offer
router.post('/:id/offer', async (req, res) => {
    try {
        const { id } = req.params;
        const offer = await generateOffer(id);

        if (!offer) {
            return res.status(400).json({ success: false, error: 'Offer generation failed' });
        }

        res.json({ success: true, offer });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
