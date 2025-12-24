// backend/routes/integrationRoutes.js
const express = require('express');
const router = express.Router();
const { syncDriveFiles } = require('../services/driveService');

// POST /api/integrations/drive/sync
router.post('/drive/sync', async (req, res) => {
    const { conversationId, businessName } = req.body;

    if (!conversationId || !businessName) {
        return res.status(400).json({ success: false, error: "Missing conversationId or businessName" });
    }

    try {
        console.log(`☁️ Sync Request for: ${businessName} (${conversationId})`);

        // This service handles the heavy lifting:
        // 1. Search Drive -> 2. Download -> 3. Run FCS -> 4. Run Strategy
        const result = await syncDriveFiles(conversationId, businessName);

        res.json(result);
    } catch (err) {
        console.error("Sync Route Error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
