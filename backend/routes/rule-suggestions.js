// backend/routes/rule-suggestions.js
// API endpoints for viewing and managing AI-suggested lender rules

const express = require('express');
const router = express.Router();
const {
    getSuggestedRules,
    approveRule,
    rejectRule,
    analyzeDeclineById,
    analyzeDeclines
} = require('../services/ruleLearner');
const { getDatabase } = require('../services/database');
const { refreshProfiles, getProfiles } = require('../services/successPredictor');

// GET /api/rules/suggestions - Get all pending AI suggestions
router.get('/suggestions', async (req, res) => {
    try {
        const rules = await getSuggestedRules();
        res.json({ success: true, rules });
    } catch (err) {
        console.error('Error fetching suggested rules:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/rules/suggestions/:id/approve - Approve a suggested rule
router.post('/suggestions/:id/approve', async (req, res) => {
    try {
        const result = await approveRule(req.params.id);
        res.json(result);
    } catch (err) {
        console.error('Error approving rule:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/rules/suggestions/:id/reject - Reject/delete a suggested rule
router.post('/suggestions/:id/reject', async (req, res) => {
    try {
        const result = await rejectRule(req.params.id);
        res.json(result);
    } catch (err) {
        console.error('Error rejecting rule:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/rules/analyze/:submissionId - Manually trigger analysis of a specific decline
router.post('/analyze/:submissionId', async (req, res) => {
    try {
        const result = await analyzeDeclineById(req.params.submissionId);
        res.json(result);
    } catch (err) {
        console.error('Error analyzing decline:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/rules/analyze-all - Manually trigger analysis of all pending declines
router.post('/analyze-all', async (req, res) => {
    try {
        await analyzeDeclines();
        res.json({ success: true, message: 'Analysis triggered' });
    } catch (err) {
        console.error('Error triggering analysis:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/rules/all - Get all rules (active and suggested)
router.get('/all', async (req, res) => {
    try {
        const db = getDatabase();
        const result = await db.query(`
            SELECT * FROM lender_rules
            ORDER BY
                CASE WHEN is_active = FALSE THEN 0 ELSE 1 END,
                created_at DESC
        `);
        res.json({ success: true, rules: result.rows });
    } catch (err) {
        console.error('Error fetching rules:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/rules/create - Manually create a new rule
router.post('/create', async (req, res) => {
    try {
        const db = getDatabase();
        const {
            lender_name,
            rule_type,
            industry,
            state,
            condition_field,
            condition_operator,
            condition_value,
            decline_message
        } = req.body;

        // Find lender_id
        const lenderMatch = await db.query(`
            SELECT id FROM lenders
            WHERE LOWER(name) LIKE LOWER($1)
            LIMIT 1
        `, [`%${lender_name.split(' ')[0]}%`]);

        const lenderId = lenderMatch.rows.length > 0 ? lenderMatch.rows[0].id : null;

        const result = await db.query(`
            INSERT INTO lender_rules (
                lender_id, lender_name, rule_type, industry, state,
                condition_field, condition_operator, condition_value,
                decline_message, source, is_active
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'manual', TRUE)
            RETURNING *
        `, [
            lenderId,
            lender_name,
            rule_type,
            industry || null,
            state || null,
            condition_field || null,
            condition_operator || null,
            condition_value || null,
            decline_message
        ]);

        res.json({ success: true, rule: result.rows[0] });
    } catch (err) {
        console.error('Error creating rule:', err);
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/rules/:id - Delete a rule
router.delete('/:id', async (req, res) => {
    try {
        const db = getDatabase();
        await db.query('DELETE FROM lender_rules WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting rule:', err);
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/rules/:id/toggle - Toggle a rule active/inactive
router.put('/:id/toggle', async (req, res) => {
    try {
        const db = getDatabase();
        const result = await db.query(`
            UPDATE lender_rules
            SET is_active = NOT is_active
            WHERE id = $1
            RETURNING *
        `, [req.params.id]);

        res.json({ success: true, rule: result.rows[0] });
    } catch (err) {
        console.error('Error toggling rule:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/rules/profiles - See lender success profiles
router.get('/profiles', async (req, res) => {
    try {
        const profiles = await getProfiles();
        res.json({ success: true, profiles });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/rules/profiles/refresh - Force rebuild profiles
router.post('/profiles/refresh', async (req, res) => {
    try {
        const profiles = await refreshProfiles();
        res.json({ success: true, count: Object.keys(profiles).length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
