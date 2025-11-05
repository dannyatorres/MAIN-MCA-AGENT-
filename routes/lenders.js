// routes/lenders.js - HANDLES: Lender qualification and matching
// URLs like: /api/lenders/qualify/:conversationId, /api/lenders/matches/:conversationId

const express = require('express');
const router = express.Router();
const { getDatabase } = require('../services/database');
const { v4: uuidv4 } = require('uuid');

// Get all lenders (main endpoint for lender management UI)
router.get('/', async (req, res) => {
    try {
        const db = getDatabase();
        const result = await db.query(`
            SELECT * FROM lenders
            ORDER BY created_at DESC
        `);

        console.log(`📋 Fetched ${result.rows.length} lenders`);

        // Return just the array (matching original format)
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching lenders:', error);
        res.status(500).json({
            error: 'Failed to fetch lenders',
            details: error.message
        });
    }
});

// Create new lender
router.post('/', async (req, res) => {
    try {
        const {
            name,
            email,
            phone,
            company,
            min_amount,
            max_amount,
            industries,
            states,
            credit_score_min,
            time_in_business_min,
            notes
        } = req.body;

        if (!name || !email) {
            return res.status(400).json({ error: 'Name and email are required' });
        }

        const db = getDatabase();
        const lenderId = uuidv4();

        const result = await db.query(`
            INSERT INTO lenders (
                id, name, email, phone, company, min_amount, max_amount,
                industries, states, credit_score_min, time_in_business_min, notes,
                created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW()
            ) RETURNING *
        `, [
            lenderId, name, email, phone, company, min_amount, max_amount,
            JSON.stringify(industries || []), JSON.stringify(states || []),
            credit_score_min, time_in_business_min, notes
        ]);

        console.log(`✅ Lender created: ${name}`);

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error creating lender:', error);
        res.status(500).json({
            error: 'Failed to create lender',
            details: error.message
        });
    }
});

// Update lender
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            name,
            email,
            phone,
            company,
            min_amount,
            max_amount,
            industries,
            states,
            credit_score_min,
            time_in_business_min,
            notes
        } = req.body;

        if (!name || !email) {
            return res.status(400).json({ error: 'Name and email are required' });
        }

        const db = getDatabase();
        const result = await db.query(`
            UPDATE lenders SET
                name = $2,
                email = $3,
                phone = $4,
                company = $5,
                min_amount = $6,
                max_amount = $7,
                industries = $8,
                states = $9,
                credit_score_min = $10,
                time_in_business_min = $11,
                notes = $12,
                updated_at = NOW()
            WHERE id = $1
            RETURNING *
        `, [
            id, name, email, phone, company, min_amount, max_amount,
            JSON.stringify(industries || []), JSON.stringify(states || []),
            credit_score_min, time_in_business_min, notes
        ]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Lender not found' });
        }

        console.log(`✅ Lender updated: ${name}`);

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error updating lender:', error);
        res.status(500).json({
            error: 'Failed to update lender',
            details: error.message
        });
    }
});

// Delete lender
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const db = getDatabase();

        const result = await db.query(`
            DELETE FROM lenders WHERE id = $1 RETURNING name
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Lender not found' });
        }

        console.log(`✅ Lender deleted: ${result.rows[0].name}`);

        res.json({
            success: true,
            message: `Lender "${result.rows[0].name}" deleted successfully`
        });
    } catch (error) {
        console.error('Error deleting lender:', error);
        res.status(500).json({
            error: 'Failed to delete lender',
            details: error.message
        });
    }
});

// Trigger lender qualification
router.post('/qualify/:conversationId', async (req, res) => {
    try {
        const { conversationId } = req.params;
        const db = getDatabase();

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

        // Check if we have FCS results
        const fcsResult = await db.query(
            'SELECT * FROM fcs_results WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 1',
            [conversationId]
        );

        if (fcsResult.rows.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'FCS analysis must be completed before lender qualification'
            });
        }

        // Create job in queue for n8n to process
        const jobResult = await db.query(`
            INSERT INTO job_queue (job_type, conversation_id, input_data, status, created_at)
            VALUES ('lender_qualification', $1, $2, 'queued', NOW())
            RETURNING id
        `, [
            conversationId,
            JSON.stringify({
                conversation: conversation,
                fcs_results: fcsResult.rows[0]
            })
        ]);

        console.log(`🎯 Lender qualification queued for conversation ${conversationId}, job ID: ${jobResult.rows[0].id}`);

        // Emit WebSocket event
        if (global.io) {
            global.io.to(`conversation_${conversationId}`).emit('lender_qualification_triggered', {
                conversation_id: conversationId,
                job_id: jobResult.rows[0].id,
                status: 'queued'
            });
        }

        res.json({
            success: true,
            job_id: jobResult.rows[0].id,
            status: 'queued',
            message: 'Lender qualification will be processed by n8n worker'
        });

    } catch (error) {
        console.error('Error triggering lender qualification:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get qualified lenders (matches)
router.get('/matches/:conversationId', async (req, res) => {
    try {
        const { conversationId } = req.params;
        const db = getDatabase();

        const result = await db.query(`
            SELECT * FROM lender_matches
            WHERE conversation_id = $1 AND qualified = true
            ORDER BY tier ASC, match_score DESC
        `, [conversationId]);

        res.json({
            success: true,
            qualified_lenders: result.rows,
            total_qualified: result.rows.length
        });

    } catch (error) {
        console.error('Error fetching lender matches:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get all lender matches (including non-qualified)
router.get('/matches/:conversationId/all', async (req, res) => {
    try {
        const { conversationId } = req.params;
        const db = getDatabase();

        const result = await db.query(`
            SELECT * FROM lender_matches
            WHERE conversation_id = $1
            ORDER BY qualified DESC, tier ASC, match_score DESC
        `, [conversationId]);

        res.json({
            success: true,
            lender_matches: result.rows,
            total: result.rows.length
        });

    } catch (error) {
        console.error('Error fetching all lender matches:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Save lender match (called by n8n after processing)
router.post('/matches', async (req, res) => {
    try {
        const {
            conversation_id,
            lender_name,
            lender_id,
            qualified,
            match_score,
            tier,
            reason,
            requirements_met,
            requirements_failed
        } = req.body;

        const db = getDatabase();

        // Insert lender match
        const result = await db.query(`
            INSERT INTO lender_matches (
                conversation_id,
                lender_name,
                lender_id,
                qualified,
                match_score,
                tier,
                reason,
                requirements_met,
                requirements_failed,
                created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
            RETURNING *
        `, [
            conversation_id,
            lender_name,
            lender_id,
            qualified,
            match_score || 0,
            tier || 'C',
            reason,
            JSON.stringify(requirements_met || []),
            JSON.stringify(requirements_failed || [])
        ]);

        const lenderMatch = result.rows[0];

        console.log(`✅ Lender match saved: ${lender_name} for conversation ${conversation_id} (qualified: ${qualified})`);

        res.json({
            success: true,
            lender_match: lenderMatch
        });

    } catch (error) {
        console.error('Error saving lender match:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Mark lender qualification as completed (called by n8n)
router.post('/qualification-complete/:conversationId', async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { total_qualified, top_lender } = req.body;
        const db = getDatabase();

        // Update conversation
        await db.query(`
            UPDATE conversations
            SET
                current_step = 'lender_qualification_completed',
                metadata = metadata || $1,
                last_activity = NOW()
            WHERE id = $2
        `, [
            JSON.stringify({
                lender_qualification_completed_at: new Date(),
                total_qualified_lenders: total_qualified,
                top_lender: top_lender
            }),
            conversationId
        ]);

        // Mark job as completed
        await db.query(`
            UPDATE job_queue
            SET status = 'completed', completed_at = NOW()
            WHERE conversation_id = $1 AND job_type = 'lender_qualification' AND status = 'processing'
        `, [conversationId]);

        // Emit WebSocket event
        if (global.io) {
            global.io.to(`conversation_${conversationId}`).emit('lender_qualification_completed', {
                conversation_id: conversationId,
                total_qualified: total_qualified
            });
            console.log(`📊 Lender qualification WebSocket event emitted for ${conversationId}`);
        }

        console.log(`✅ Lender qualification completed for ${conversationId}: ${total_qualified} lenders qualified`);

        res.json({
            success: true,
            conversation_id: conversationId,
            total_qualified: total_qualified
        });

    } catch (error) {
        console.error('Error marking lender qualification complete:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get all available lenders (master lender list)
router.get('/available', async (req, res) => {
    try {
        const db = getDatabase();

        const result = await db.query(`
            SELECT * FROM lenders
            ORDER BY id ASC
        `);

        res.json({
            success: true,
            lenders: result.rows,
            total: result.rows.length
        });

    } catch (error) {
        console.error('Error fetching available lenders:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get single lender details
router.get('/:lenderId', async (req, res) => {
    try {
        const { lenderId } = req.params;
        const db = getDatabase();

        const result = await db.query(
            'SELECT * FROM lenders WHERE id = $1',
            [lenderId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Lender not found'
            });
        }

        res.json({
            success: true,
            lender: result.rows[0]
        });

    } catch (error) {
        console.error('Error fetching lender:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
