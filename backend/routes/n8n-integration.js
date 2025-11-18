// routes/n8n-integration.js - HANDLES: All n8n Sales Agent API endpoints
// URLs like: /api/n8n/conversations/:id/context, /api/n8n/batch-update

const express = require('express');
const router = express.Router();
const { getDatabase } = require('../services/database');

// ============================================================================
// GROUP 1: CONVERSATION CONTEXT & RETRIEVAL
// ============================================================================

// Get conversation context for n8n AI agent
// Supports both display_id (numeric like 100046) and UUID
router.get('/conversations/:conversationId/context', async (req, res) => {
    try {
        const { conversationId } = req.params;
        const db = getDatabase();

        // Check if numeric (display_id) or UUID
        const isNumeric = /^\d+$/.test(conversationId);

        console.log(`🔍 n8n context request - ID: ${conversationId}, Type: ${isNumeric ? 'display_id' : 'UUID'}`);

        // Query based on type
        let convResult;
        if (isNumeric) {
            // Use display_id
            convResult = await db.query(`
                SELECT c.*, ld.*
                FROM conversations c
                LEFT JOIN lead_details ld ON c.id = ld.conversation_id
                WHERE c.display_id = $1
            `, [parseInt(conversationId)]);
        } else {
            // Use UUID
            convResult = await db.query(`
                SELECT c.*, ld.*
                FROM conversations c
                LEFT JOIN lead_details ld ON c.id = ld.conversation_id
                WHERE c.id = $1
            `, [conversationId]);
        }

        if (convResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Conversation not found'
            });
        }

        const conversation = convResult.rows[0];
        const actualId = conversation.id; // Get the UUID for other queries

        // Get recent messages (last 20) - use UUID
        const messagesResult = await db.query(`
            SELECT * FROM messages
            WHERE conversation_id = $1
            ORDER BY timestamp DESC
            LIMIT 20
        `, [actualId]);

        // Get documents - use UUID
        const docsResult = await db.query(
            'SELECT * FROM documents WHERE conversation_id = $1',
            [actualId]
        );

        // Get FCS results (if available) - use UUID
        const fcsResult = await db.query(
            'SELECT * FROM fcs_results WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 1',
            [actualId]
        );

        // Get lender matches (if available) - use UUID
        const lendersResult = await db.query(
            'SELECT * FROM lender_matches WHERE conversation_id = $1 AND qualified = true',
            [actualId]
        );

        // Build context object
        const context = {
            conversation: conversation,
            messages: messagesResult.rows.reverse(), // Chronological order
            documents: docsResult.rows,
            fcs_results: fcsResult.rows.length > 0 ? fcsResult.rows[0] : null,
            qualified_lenders: lendersResult.rows,
            summary: {
                total_messages: messagesResult.rows.length,
                total_documents: docsResult.rows.length,
                has_fcs_results: fcsResult.rows.length > 0,
                qualified_lenders_count: lendersResult.rows.length
            }
        };

        console.log(`✅ Context retrieved for ${conversation.business_name || 'Unknown'} - ${messagesResult.rows.length} messages, ${docsResult.rows.length} documents`);

        res.json({
            success: true,
            context: context
        });

    } catch (error) {
        console.error('❌ Error fetching conversation context:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get conversation by phone number
router.get('/conversations/by-phone/:phone', async (req, res) => {
    try {
        const { phone } = req.params;
        const db = getDatabase();

        const result = await db.query(
            'SELECT * FROM conversations WHERE lead_phone = $1 ORDER BY created_at DESC LIMIT 1',
            [phone]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Conversation not found for this phone number'
            });
        }

        res.json({
            success: true,
            conversation: result.rows[0]
        });

    } catch (error) {
        console.error('Error fetching conversation by phone:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================================
// GROUP 2: CONVERSATION STATE MANAGEMENT
// ============================================================================

// Update conversation step
router.post('/conversations/:conversationId/update-step', async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { step, state, metadata } = req.body;
        const db = getDatabase();

        let updateFields = ['last_activity = NOW()'];
        let values = [];
        let paramIndex = 1;

        if (step) {
            updateFields.push(`current_step = $${paramIndex++}`);
            values.push(step);
        }

        if (state) {
            updateFields.push(`state = $${paramIndex++}`);
            values.push(state);
        }

        if (metadata) {
            updateFields.push(`metadata = metadata || $${paramIndex++}::jsonb`);
            values.push(JSON.stringify(metadata));
        }

        values.push(conversationId);

        await db.query(`
            UPDATE conversations
            SET ${updateFields.join(', ')}
            WHERE id = $${paramIndex}
        `, values);

        // Log action
        await db.query(`
            INSERT INTO agent_actions (conversation_id, action_type, action_details, performed_by)
            VALUES ($1, 'step_updated', $2, 'n8n_agent')
        `, [conversationId, JSON.stringify({ step, state, metadata })]);

        console.log(`📊 Conversation ${conversationId} updated: step=${step}, state=${state}`);

        // Emit WebSocket event
        if (global.io) {
            global.io.to(`conversation_${conversationId}`).emit('conversation_updated', {
                conversation_id: conversationId,
                step: step,
                state: state
            });
        }

        res.json({
            success: true,
            conversation_id: conversationId,
            updated_step: step,
            updated_state: state
        });

    } catch (error) {
        console.error('Error updating conversation step:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Update conversation priority
router.post('/conversations/:conversationId/update-priority', async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { priority } = req.body;
        const db = getDatabase();

        await db.query(`
            UPDATE conversations
            SET priority = $1, last_activity = NOW()
            WHERE id = $2
        `, [priority, conversationId]);

        console.log(`🎯 Conversation ${conversationId} priority updated to: ${priority}`);

        res.json({
            success: true,
            conversation_id: conversationId,
            new_priority: priority
        });

    } catch (error) {
        console.error('Error updating priority:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Mark conversation as dead/cold
router.post('/conversations/:conversationId/mark-dead', async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { reason, final_state = 'DEAD' } = req.body;
        const db = getDatabase();

        await db.query(`
            UPDATE conversations
            SET state = $1, current_step = 'marked_dead', metadata = metadata || $2::jsonb
            WHERE id = $3
        `, [
            final_state,
            JSON.stringify({ dead_reason: reason, marked_dead_at: new Date() }),
            conversationId
        ]);

        // Log action
        await db.query(`
            INSERT INTO agent_actions (conversation_id, action_type, action_details, performed_by)
            VALUES ($1, 'conversation_marked_dead', $2, 'n8n_agent')
        `, [conversationId, JSON.stringify({ reason, final_state })]);

        console.log(`💀 Conversation ${conversationId} marked as ${final_state}: ${reason}`);

        res.json({
            success: true,
            conversation_id: conversationId,
            final_state: final_state
        });

    } catch (error) {
        console.error('Error marking conversation dead:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================================
// GROUP 3: BATCH OPERATIONS
// ============================================================================

// Get leads needing action
router.get('/leads/pending', async (req, res) => {
    try {
        const { state, limit = 30, offset = 0 } = req.query;
        const db = getDatabase();

        let query = `
            SELECT
                c.id as conversation_id,
                c.business_name,
                c.lead_phone as phone,
                c.state,
                c.current_step,
                c.priority,
                c.last_activity,
                EXTRACT(EPOCH FROM (NOW() - c.last_activity)) / 60 as minutes_since_last_activity,
                (
                    SELECT content
                    FROM messages
                    WHERE conversation_id = c.id
                    ORDER BY timestamp DESC
                    LIMIT 1
                ) as last_message
            FROM conversations c
            WHERE 1=1
        `;

        const values = [];
        let paramIndex = 1;

        if (state) {
            query += ` AND c.state = $${paramIndex++}`;
            values.push(state);
        }

        query += ` ORDER BY c.priority DESC, c.last_activity DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
        values.push(parseInt(limit), parseInt(offset));

        const result = await db.query(query, values);

        const countResult = await db.query(
            `SELECT COUNT(*) as total FROM conversations WHERE state = $1`,
            [state || 'NEW']
        );

        res.json({
            success: true,
            leads: result.rows,
            total: parseInt(countResult.rows[0].total)
        });

    } catch (error) {
        console.error('Error fetching pending leads:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// FIXED: Batch update with SQL Injection protection
router.post('/batch-update', async (req, res) => {
    try {
        const { conversation_ids, updates } = req.body;
        const db = getDatabase();

        if (!Array.isArray(conversation_ids) || conversation_ids.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'conversation_ids must be a non-empty array'
            });
        }

        // 🛡️ SECURITY: Strict Allowlist of permitted columns
        const ALLOWED_COLUMNS = [
            'state',
            'current_step',
            'priority',
            'assigned_to',
            'lead_source',
            'next_follow_up'
        ];

        const fields = Object.keys(updates);
        const validFields = [];
        const values = [];
        let paramIndex = 1;

        // Validate every field against the allowlist
        for (const field of fields) {
            if (ALLOWED_COLUMNS.includes(field)) {
                validFields.push(`${field} = $${paramIndex}`); // Safe column name
                values.push(updates[field]);                   // Parameterized value
                paramIndex++;
            } else {
                console.warn(`⚠️ Blocked attempt to update unauthorized column: ${field}`);
            }
        }

        if (validFields.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No valid update fields provided'
            });
        }

        // Add the ID array as the final parameter
        values.push(conversation_ids);
        const idParamIndex = paramIndex;

        // Construct the query safely
        const query = `
            UPDATE conversations
            SET ${validFields.join(', ')}, last_activity = NOW()
            WHERE id = ANY($${idParamIndex}::uuid[])
        `;

        await db.query(query, values);

        console.log(`📦 Batch update: ${conversation_ids.length} conversations updated`);

        res.json({
            success: true,
            updated_count: conversation_ids.length,
            conversation_ids: conversation_ids
        });

    } catch (error) {
        console.error('Error batch updating conversations:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================================
// GROUP 4: JOB QUEUE MANAGEMENT
// ============================================================================

// Get next job from queue
router.get('/jobs/next', async (req, res) => {
    try {
        const { job_type } = req.query;
        const db = getDatabase();

        let query = `
            SELECT * FROM job_queue
            WHERE status = 'queued'
        `;

        const values = [];
        if (job_type) {
            query += ` AND job_type = $1`;
            values.push(job_type);
        }

        query += ` ORDER BY created_at ASC LIMIT 1`;

        const result = await db.query(query, values);

        if (result.rows.length === 0) {
            return res.json({
                success: true,
                job: null,
                message: 'No jobs in queue'
            });
        }

        const job = result.rows[0];

        // Mark job as processing
        await db.query(`
            UPDATE job_queue
            SET status = 'processing', started_at = NOW()
            WHERE id = $1
        `, [job.id]);

        res.json({
            success: true,
            job: job
        });

    } catch (error) {
        console.error('Error fetching next job:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Update job status
router.post('/jobs/:jobId/update', async (req, res) => {
    try {
        const { jobId } = req.params;
        const { status, result_data, error_message } = req.body;
        const db = getDatabase();

        let updateFields = ['last_updated = NOW()'];
        let values = [];
        let paramIndex = 1;

        if (status) {
            updateFields.push(`status = $${paramIndex++}`);
            values.push(status);

            if (status === 'completed') {
                updateFields.push(`completed_at = NOW()`);
            } else if (status === 'failed') {
                updateFields.push(`failed_at = NOW()`);
            }
        }

        if (result_data) {
            updateFields.push(`result_data = $${paramIndex++}::jsonb`);
            values.push(JSON.stringify(result_data));
        }

        if (error_message) {
            updateFields.push(`error_message = $${paramIndex++}`);
            values.push(error_message);
        }

        values.push(jobId);

        await db.query(`
            UPDATE job_queue
            SET ${updateFields.join(', ')}
            WHERE id = $${paramIndex}
        `, values);

        console.log(`✅ Job ${jobId} updated: status=${status}`);

        res.json({
            success: true,
            job_id: jobId,
            status: status
        });

    } catch (error) {
        console.error('Error updating job:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================================
// GROUP 5: AGENT ACTIONS & LOGGING
// ============================================================================

// Log agent action
router.post('/agent-actions/log', async (req, res) => {
    try {
        const { conversation_id, action_type, action_details, performed_by = 'n8n_agent' } = req.body;
        const db = getDatabase();

        const result = await db.query(`
            INSERT INTO agent_actions (conversation_id, action_type, action_details, performed_by, timestamp)
            VALUES ($1, $2, $3, $4, NOW())
            RETURNING *
        `, [conversation_id, action_type, JSON.stringify(action_details), performed_by]);

        res.json({
            success: true,
            action: result.rows[0]
        });

    } catch (error) {
        console.error('Error logging agent action:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get agent actions for a conversation
router.get('/agent-actions/:conversationId', async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { limit = 50 } = req.query;
        const db = getDatabase();

        const result = await db.query(`
            SELECT * FROM agent_actions
            WHERE conversation_id = $1
            ORDER BY timestamp DESC
            LIMIT $2
        `, [conversationId, parseInt(limit)]);

        res.json({
            success: true,
            actions: result.rows,
            total: result.rows.length
        });

    } catch (error) {
        console.error('Error fetching agent actions:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================================
// GROUP 6: WEBSOCKET EMIT ENDPOINT
// ============================================================================

// WebSocket emit endpoint (for n8n to trigger WebSocket events)
router.post('/websocket/emit', (req, res) => {
    try {
        const { event, data } = req.body;

        if (!event) {
            return res.status(400).json({
                success: false,
                error: 'event name is required'
            });
        }

        if (global.io) {
            global.io.emit(event, data);
            console.log(`🔔 WebSocket event emitted: ${event}`);
        }

        res.json({
            success: true,
            event: event,
            emitted: !!global.io
        });

    } catch (error) {
        console.error('Error emitting WebSocket event:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Test WebSocket endpoint for debugging
router.get('/test-websocket', (req, res) => {
    console.log('Testing WebSocket emission');
    console.log('Checking if io is available...');
    console.log('io available:', !!global.io);

    try {
        const testMessageData = {
            conversation_id: 'test-conversation',
            message: {
                id: 'test-message-123',
                content: 'This is a WebSocket test message from /test-websocket endpoint',
                direction: 'inbound',
                created_at: new Date().toISOString(),
                message_type: 'sms',
                sent_by: 'test-system'
            }
        };

        // Try emitting via io
        if (global.io) {
            global.io.emit('new_message', testMessageData);
            console.log('Test WebSocket event emitted via io');
        }

        res.json({
            success: true,
            message: 'WebSocket test message sent',
            io_available: !!global.io,
            connected_clients: global.io ? global.io.engine.clientsCount : 0,
            test_data: testMessageData
        });

    } catch (error) {
        console.error('WebSocket test failed:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            io_available: !!global.io
        });
    }
});

// ============================================================================
// GROUP 7: STATISTICS & ANALYTICS
// ============================================================================

// Get conversation statistics
router.get('/stats/conversations', async (req, res) => {
    try {
        const db = getDatabase();

        const stats = await db.query(`
            SELECT
                COUNT(*) as total_conversations,
                COUNT(*) FILTER (WHERE state = 'NEW') as new_count,
                COUNT(*) FILTER (WHERE state = 'ACTIVE') as active_count,
                COUNT(*) FILTER (WHERE state = 'QUALIFIED') as qualified_count,
                COUNT(*) FILTER (WHERE state = 'FUNDED') as funded_count,
                COUNT(*) FILTER (WHERE state = 'DEAD') as dead_count,
                AVG(EXTRACT(EPOCH FROM (NOW() - last_activity)) / 60) as avg_minutes_since_last_activity
            FROM conversations
        `);

        res.json({
            success: true,
            stats: stats.rows[0]
        });

    } catch (error) {
        console.error('Error fetching conversation stats:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
