// routes/lenders.js - HANDLES: Lender qualification and matching
// URLs like: /api/lenders/qualify/:conversationId, /api/lenders/matches/:conversationId

const express = require('express');
const router = express.Router();
const { getDatabase } = require('../services/database');
const { v4: uuidv4 } = require('uuid');

// Helper to convert empty strings to NULL for numeric fields
const toNum = (val) => (val === '' || val === undefined || val === null) ? null : val;

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

// Import tool - serves HTML page for CSV import (MUST be before /:lenderId route)
router.get('/import-tool', (req, res) => {
    res.send(`<!DOCTYPE html><html><head><title>Import</title></head><body>
<h1>Lender CSV Import</h1>
<input type="file" id="f" accept=".csv"><br><br>
<button onclick="run()">Import</button>
<pre id="r"></pre>
<script>
async function run(){
    const file=document.getElementById('f').files[0];
    if(!file)return alert('Select CSV');
    document.getElementById('r').textContent='Processing...';
    const text=await file.text();
    const lines=text.split('\\n'),headers=lines[0].split(',').map(h=>h.trim().replace(/^"|"$/g,'')),data=[];
    for(let i=1;i<lines.length;i++){
        if(!lines[i].trim())continue;
        const row={};let field='',idx=0,inQ=false;
        for(let c of lines[i]){
            if(c==='"')inQ=!inQ;
            else if(c===','&&!inQ){row[headers[idx++]]=field.trim();field='';}
            else field+=c;
        }
        row[headers[idx]]=field.trim();
        data.push(row);
    }
    const res=await fetch('/api/lenders/import-csv',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lenders:data})});
    document.getElementById('r').textContent=JSON.stringify(await res.json(),null,2);
}
</script></body></html>`);
});

// Get pending rule suggestions
router.get('/rule-suggestions', async (req, res) => {
    try {
        const db = getDatabase();
        const result = await db.query(`
            SELECT * FROM lender_rules
            WHERE source = 'ai_suggested' AND is_active = FALSE
            ORDER BY created_at DESC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching rule suggestions:', error);
        res.status(500).json({ error: error.message });
    }
});

// Approve a rule suggestion
router.post('/rule-suggestions/:ruleId/approve', async (req, res) => {
    try {
        const { ruleId } = req.params;
        const db = getDatabase();

        const ruleResult = await db.query('SELECT * FROM lender_rules WHERE id = $1', [ruleId]);
        if (ruleResult.rows.length === 0) {
            return res.status(404).json({ error: 'Rule not found' });
        }

        const rule = ruleResult.rows[0];

        await db.query(`
            UPDATE lender_rules 
            SET is_active = TRUE, source = 'ai_applied' 
            WHERE id = $1
        `, [ruleId]);

        if (rule.lender_id) {
            if (rule.rule_type === 'industry_block' && rule.industry) {
                await db.query(`
                    UPDATE lenders 
                    SET prohibited_industries = CASE 
                        WHEN prohibited_industries IS NULL OR prohibited_industries = '' 
                        THEN $2
                        ELSE prohibited_industries || ', ' || $2
                    END
                    WHERE id = $1
                `, [rule.lender_id, rule.industry]);
            }

            if (rule.rule_type === 'state_block' && rule.state) {
                await db.query(`
                    UPDATE lenders 
                    SET state_restrictions = CASE 
                        WHEN state_restrictions IS NULL OR state_restrictions = '' 
                        THEN $2
                        ELSE state_restrictions || ', ' || $2
                    END
                    WHERE id = $1
                `, [rule.lender_id, rule.state]);
            }
        }

        console.log(`✅ Rule approved: ${rule.lender_name} - ${rule.rule_type}`);
        res.json({ success: true });
    } catch (error) {
        console.error('Error approving rule:', error);
        res.status(500).json({ error: error.message });
    }
});

// Reject a rule suggestion
router.post('/rule-suggestions/:ruleId/reject', async (req, res) => {
    try {
        const { ruleId } = req.params;
        const db = getDatabase();

        await db.query('DELETE FROM lender_rules WHERE id = $1', [ruleId]);

        console.log(`❌ Rule rejected: ${ruleId}`);
        res.json({ success: true });
    } catch (error) {
        console.error('Error rejecting rule:', error);
        res.status(500).json({ error: error.message });
    }
});

// Create new lender
router.post('/', async (req, res) => {
    try {
        const {
            name, email, cc_email, phone, company,
            min_amount, max_amount,
            industries, states,
            credit_score_min, time_in_business_min,
            notes
        } = req.body;

        console.log('📝 CREATING LENDER:', { name, email, cc_email });

        if (!name || !email) {
            return res.status(400).json({ error: 'Name and email are required' });
        }

        const db = getDatabase();
        const lenderId = uuidv4();

        // SANITIZED: Use toNum() helper on all numeric fields
        const result = await db.query(`
            INSERT INTO lenders (
                id, name, email, cc_email, phone, company, min_amount, max_amount,
                industries, states, credit_score_min, time_in_business_min, notes,
                created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW()
            ) RETURNING *
        `, [
            lenderId,
            name,
            email,
            cc_email || null,
            phone,
            company,
            toNum(min_amount),
            toNum(max_amount),
            JSON.stringify(industries || []),
            JSON.stringify(states || []),
            toNum(credit_score_min),
            toNum(time_in_business_min),
            notes
        ]);

        console.log(`✅ Lender created: ${name}`);
        res.status(201).json(result.rows[0]);

    } catch (error) {
        console.error('Error creating lender:', error);
        res.status(500).json({ error: 'Failed to create lender', details: error.message });
    }
});

// Update lender
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            name, email, cc_email, phone, company,
            min_amount, max_amount,
            industries, states,
            credit_score_min, time_in_business_min,
            notes
        } = req.body;

        console.log(`📝 UPDATING LENDER [${id}]:`, { name, cc_email });

        if (!name || !email) {
            return res.status(400).json({ error: 'Name and email are required' });
        }

        const db = getDatabase();

        // SANITIZED: Use toNum() helper here too
        const result = await db.query(`
            UPDATE lenders SET
                name = $2,
                email = $3,
                cc_email = $4,
                phone = $5,
                company = $6,
                min_amount = $7,
                max_amount = $8,
                industries = $9,
                states = $10,
                credit_score_min = $11,
                time_in_business_min = $12,
                notes = $13,
                updated_at = NOW()
            WHERE id = $1
            RETURNING *
        `, [
            id,
            name,
            email,
            cc_email || null,
            phone,
            company,
            toNum(min_amount),
            toNum(max_amount),
            JSON.stringify(industries || []),
            JSON.stringify(states || []),
            toNum(credit_score_min),
            toNum(time_in_business_min),
            notes
        ]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Lender not found' });
        }

        console.log(`✅ Lender updated: ${name}`);
        res.json(result.rows[0]);

    } catch (error) {
        console.error('Error updating lender:', error);
        res.status(500).json({ error: 'Failed to update lender', details: error.message });
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

// Get submission history for a conversation
router.get('/submissions/:conversationId', async (req, res) => {
    try {
        const { conversationId } = req.params;
        const db = getDatabase();

        const result = await db.query(`
            SELECT lender_name, status, offer_amount, factor_rate,
                   decline_reason, submitted_at, last_response_at
            FROM lender_submissions
            WHERE conversation_id = $1
            ORDER BY submitted_at DESC
        `, [conversationId]);

        res.json({ success: true, submissions: result.rows });
    } catch (error) {
        console.error('Error fetching submissions:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get lender by name (for email lookup fallback)
router.get('/by-name/:name', async (req, res) => {
    try {
        const { name } = req.params;
        const db = getDatabase();

        const result = await db.query(
            `SELECT id, name, email, cc_email FROM lenders WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) LIMIT 1`,
            [name]
        );

        if (result.rows.length === 0) {
            return res.json({ success: false, email: null });
        }

        res.json({
            success: true,
            email: result.rows[0].email,
            cc_email: result.rows[0].cc_email
        });

    } catch (error) {
        console.error('Error fetching lender by name:', error);
        res.status(500).json({ success: false, error: error.message });
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

// ===========================================
// LOG LENDER RESPONSE - Manual response entry
// ===========================================

router.post('/log-response', async (req, res) => {
    try {
        const db = getDatabase();
        const {
            conversation_id,
            lender_name,
            status,
            position,
            // New offer
            offer_amount,
            factor_rate,
            term_length,
            term_unit,
            payment_frequency,
            // Previous position
            prev_amount,
            prev_factor_rate,
            prev_term_length,
            prev_term_unit,
            prev_payment_frequency,
            total_daily_withhold,
            days_into_stack,
            // Decline
            decline_reason
        } = req.body;

        if (!conversation_id || !lender_name || !status) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Capture snapshot
        let snapshot = null;
        try {
            const convResult = await db.query(`
                SELECT industry_type, us_state, monthly_revenue, credit_score, business_start_date, business_name
                FROM conversations WHERE id = $1
            `, [conversation_id]);

            if (convResult.rows.length > 0) {
                const conv = convResult.rows[0];
                snapshot = {
                    industry: conv.industry_type,
                    state: conv.us_state,
                    monthly_revenue: parseFloat(conv.monthly_revenue) || null,
                    fico: parseInt(conv.credit_score) || null,
                    position: position || null,
                    total_daily_withhold: total_daily_withhold || null,
                    days_into_stack: days_into_stack || null,
                    prev_amount: prev_amount || null,
                    captured_at: new Date().toISOString()
                };
            }
        } catch (err) {
            console.error('Error capturing snapshot:', err.message);
        }

        // Check if exists
        const existing = await db.query(`
            SELECT id FROM lender_submissions
            WHERE conversation_id = $1 AND LOWER(lender_name) = LOWER($2)
        `, [conversation_id, lender_name]);

        if (existing.rows.length > 0) {
            await db.query(`
                UPDATE lender_submissions SET
                    status = $1,
                    position = COALESCE($2, position),
                    offer_amount = COALESCE($3, offer_amount),
                    factor_rate = COALESCE($4, factor_rate),
                    term_length = COALESCE($5, term_length),
                    term_unit = COALESCE($6, term_unit),
                    payment_frequency = COALESCE($7, payment_frequency),
                    prev_amount = COALESCE($8, prev_amount),
                    prev_factor_rate = COALESCE($9, prev_factor_rate),
                    prev_term_length = COALESCE($10, prev_term_length),
                    prev_term_unit = COALESCE($11, prev_term_unit),
                    prev_payment_frequency = COALESCE($12, prev_payment_frequency),
                    total_daily_withhold = COALESCE($13, total_daily_withhold),
                    days_into_stack = COALESCE($14, days_into_stack),
                    decline_reason = COALESCE($15, decline_reason),
                    snapshot = COALESCE(snapshot, $16),
                    last_response_at = NOW()
                WHERE id = $17
            `, [
                status,
                position || null,
                offer_amount || null,
                factor_rate || null,
                term_length || null,
                term_unit || null,
                payment_frequency || null,
                prev_amount || null,
                prev_factor_rate || null,
                prev_term_length || null,
                prev_term_unit || null,
                prev_payment_frequency || null,
                total_daily_withhold || null,
                days_into_stack || null,
                decline_reason || null,
                snapshot ? JSON.stringify(snapshot) : null,
                existing.rows[0].id
            ]);

            console.log(`✅ Updated lender response: ${lender_name} -> ${status}`);
            res.json({ success: true, updated: true });
        } else {
            await db.query(`
                INSERT INTO lender_submissions (
                    id, conversation_id, lender_name, status, position,
                    offer_amount, factor_rate, term_length, term_unit, payment_frequency,
                    prev_amount, prev_factor_rate, prev_term_length, prev_term_unit, prev_payment_frequency,
                    total_daily_withhold, days_into_stack, decline_reason, snapshot,
                    submitted_at, last_response_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW(), NOW())
            `, [
                uuidv4(),
                conversation_id,
                lender_name,
                status,
                position || null,
                offer_amount || null,
                factor_rate || null,
                term_length || null,
                term_unit || null,
                payment_frequency || null,
                prev_amount || null,
                prev_factor_rate || null,
                prev_term_length || null,
                prev_term_unit || null,
                prev_payment_frequency || null,
                total_daily_withhold || null,
                days_into_stack || null,
                decline_reason || null,
                snapshot ? JSON.stringify(snapshot) : null
            ]);

            console.log(`✅ Created lender response: ${lender_name} -> ${status}`);
            res.json({ success: true, created: true });
        }

        // Update conversation based on status
        if (['OFFER', 'APPROVED'].includes(status)) {
            await db.query(`
                UPDATE conversations SET has_offer = TRUE, last_activity = NOW()
                WHERE id = $1
            `, [conversation_id]);
        }

        if (status === 'FUNDED') {
            await db.query(`
                UPDATE conversations SET 
                    has_offer = TRUE, 
                    state = 'FUNDED',
                    last_activity = NOW()
                WHERE id = $1
            `, [conversation_id]);
            console.log(`🎉 Deal FUNDED: ${conversation_id}`);
        }

    } catch (err) {
        console.error('Error logging response:', err);
        res.status(500).json({ error: err.message });
    }
});

// ===========================================
// CSV IMPORT ROUTE - One-time migration
// ===========================================

// Import CSV data and merge with existing lenders
router.post('/import-csv', async (req, res) => {
    try {
        const { lenders: csvLenders } = req.body;

        if (!csvLenders || !Array.isArray(csvLenders)) {
            return res.status(400).json({ error: 'Expected { lenders: [...] } array' });
        }

        const db = getDatabase();
        const results = {
            matched: [],
            notFound: [],
            errors: []
        };

        // Get all existing lenders
        const existingResult = await db.query('SELECT id, name FROM lenders');
        const existingLenders = existingResult.rows;

        // Helper: normalize name for matching
        const normalize = (name) => {
            return (name || '')
                .toLowerCase()
                .replace(/[^a-z0-9]/g, '') // remove special chars
                .trim();
        };

        // Build lookup map
        const lenderMap = new Map();
        existingLenders.forEach(l => {
            lenderMap.set(normalize(l.name), l);
        });

        // Process each CSV row
        for (const csv of csvLenders) {
            const csvName = csv['Lender Name'] || csv.lender_name || csv.name;
            if (!csvName) continue;

            const normalizedCsvName = normalize(csvName);

            // Try exact match first
            let match = lenderMap.get(normalizedCsvName);

            // Try fuzzy match if no exact match
            if (!match) {
                for (const [key, lender] of lenderMap) {
                    if (key.includes(normalizedCsvName) || normalizedCsvName.includes(key)) {
                        match = lender;
                        break;
                    }
                }
            }

            if (match) {
                try {
                    // Update with CSV data
                    await db.query(`
                        UPDATE lenders SET
                            min_tib_months = $2,
                            min_monthly_revenue = $3,
                            min_fico = $4,
                            state_restrictions = $5,
                            prohibited_industries = $6,
                            preferred_industries = $7,
                            other_requirements = $8,
                            position_info = $9,
                            pos_min = $10,
                            pos_max = $11,
                            tier = $12,
                            industry_position_restrictions = $13,
                            accepts_mercury = $14,
                            min_deposits = $15,
                            max_negative_days = $16,
                            accepts_nonprofit = $17,
                            max_withhold = $18,
                            updated_at = NOW()
                        WHERE id = $1
                    `, [
                        match.id,
                        toNum(csv['Min_TIB_Months'] || csv.min_tib_months),
                        toNum(csv['Min_Monthly_Revenue'] || csv.min_monthly_revenue),
                        toNum(csv['Min_FICO'] || csv.min_fico),
                        csv['State_Restrictions'] || csv.state_restrictions || null,
                        csv['Prohibited_Industries'] || csv.prohibited_industries || null,
                        csv['Preferred_Industries'] || csv.preferred_industries || null,
                        csv['Other_Key_Requirements'] || csv.other_requirements || null,
                        csv['Position_Info'] || csv.position_info || null,
                        toNum(csv['pos_min'] || csv.pos_min),
                        toNum(csv['pos_max'] || csv.pos_max),
                        csv['Tier'] || csv.tier || null,
                        csv['Industry_Position_Restrictions'] || csv.industry_position_restrictions || null,
                        (csv['Accepts Mercury Statements'] || csv.accepts_mercury || '').toString().toLowerCase() === 'yes' ||
                        (csv['Accepts Mercury Statements'] || csv.accepts_mercury || '').toString().toLowerCase() === 'y',
                        toNum(csv['minDeposits'] || csv.min_deposits),
                        toNum(csv['negativeDays'] || csv.max_negative_days),
                        (csv['Accepts_NonProfit'] || csv.accepts_nonprofit || '').toString().toLowerCase() === 'yes' ||
                        (csv['Accepts_NonProfit'] || csv.accepts_nonprofit || '').toString().toLowerCase() === 'y',
                        toNum(csv['Max_Withhold'] || csv.max_withhold)
                    ]);

                    results.matched.push({
                        csvName: csvName,
                        dbName: match.name,
                        dbId: match.id
                    });
                } catch (err) {
                    results.errors.push({
                        csvName: csvName,
                        error: err.message
                    });
                }
            } else {
                results.notFound.push({
                    csvName: csvName,
                    normalized: normalizedCsvName
                });
            }
        }

        console.log(`📊 CSV Import: ${results.matched.length} matched, ${results.notFound.length} not found, ${results.errors.length} errors`);

        res.json({
            success: true,
            summary: {
                total: csvLenders.length,
                matched: results.matched.length,
                notFound: results.notFound.length,
                errors: results.errors.length
            },
            matched: results.matched,
            notFound: results.notFound,
            errors: results.errors
        });

    } catch (error) {
        console.error('Error importing CSV:', error);
        res.status(500).json({ error: 'Failed to import CSV', details: error.message });
    }
});

module.exports = router;
