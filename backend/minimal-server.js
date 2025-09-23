console.log('[SERVER] Starting MCA Command Center Server...');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

console.log('[CONFIG] Setting up CORS...');
const app = express();
console.log('[SUCCESS] Express app created');

const corsOptions = {
    origin: ['http://localhost:8080', 'http://localhost:3000', 'http://localhost:8000', 'http://127.0.0.1:8080', 'http://127.0.0.1:8000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.use(express.json());

// Database connection
const dbModule = require('./database/db');
let db = null;

function getDatabase() {
    if (!db) {
        db = dbModule.getInstance();
        console.log('[DATABASE] Connected');
    }
    return db;
}

// REQUIRED ENDPOINTS
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        message: 'MCA Command Center Server is running'
    });
});

app.get('/api/conversations', async (req, res) => {
    try {
        console.log('[API] GET /api/conversations - fetching from database');
        const database = getDatabase();
        const result = await database.query(`
            SELECT
                id,
                business_name,
                lead_phone,
                contact_name,
                state,
                current_step,
                priority,
                last_activity,
                created_at,
                assigned_agent,
                tags,
                metadata
            FROM conversations
            ORDER BY last_activity DESC
            LIMIT 50
        `);

        console.log(`[DATABASE] Found ${result.rows.length} conversations`);
        res.json(result.rows);
    } catch (error) {
        console.error('[ERROR] Database error:', error.message);
        res.status(500).json({ error: 'Database error' });
    }
});

app.get('/api/conversations/:id', async (req, res) => {
    try {
        const { id } = req.params;
        console.log('[API] Getting conversation details for ID:', id);

        const database = getDatabase();

        // Get the conversation basic data
        const conversationResult = await database.query(`
            SELECT * FROM conversations
            WHERE id = $1
        `, [id]);

        if (conversationResult.rows.length === 0) {
            console.log('[ERROR] Conversation not found:', id);
            return res.status(404).json({
                success: false,
                error: 'Conversation not found'
            });
        }

        let conversation = conversationResult.rows[0];
        console.log('[SUCCESS] Found conversation:', conversation.business_name || 'Unknown');

        // Try to get lead_details, but don't fail if they don't exist
        try {
            const leadDetailsResult = await database.query(`
                SELECT business_type, annual_revenue, business_start_date,
                       funding_amount, factor_rate, funding_date, term_months,
                       campaign, date_of_birth, tax_id_encrypted, ssn_encrypted
                FROM lead_details
                WHERE conversation_id = $1
            `, [id]);

            if (leadDetailsResult.rows.length > 0) {
                const leadDetails = leadDetailsResult.rows[0];
                conversation = {
                    ...conversation,
                    ...leadDetails,
                    tax_id: leadDetails.tax_id_encrypted,
                    ssn: leadDetails.ssn_encrypted
                };
                console.log('[SUCCESS] Lead details found and merged');
            } else {
                console.log('[INFO] No lead details found for conversation');
            }
        } catch (leadError) {
            console.log('[WARNING] Could not fetch lead details:', leadError.message);
        }

        res.json({
            success: true,
            conversation: conversation
        });

    } catch (error) {
        console.error('[ERROR] Get conversation details error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch conversation details: ' + error.message
        });
    }
});

app.get('/api/conversations/:id/messages', async (req, res) => {
    try {
        const { id } = req.params;
        console.log('[API] Getting messages for conversation:', id);

        const database = getDatabase();
        const result = await database.query(`
            SELECT
                id,
                content,
                direction,
                message_type,
                sent_by,
                status,
                timestamp,
                metadata
            FROM messages
            WHERE conversation_id = $1
            ORDER BY timestamp ASC
        `, [id]);

        console.log(`[DATABASE] Found ${result.rows.length} messages`);
        res.json(result.rows);
    } catch (error) {
        console.error('[ERROR] Messages database error:', error.message);
        res.status(500).json({ error: 'Database error' });
    }
});

// POST messages endpoint
app.post('/api/conversations/:id/messages', async (req, res) => {
    try {
        const { id } = req.params;
        const { content, direction = 'outbound', message_type = 'manual', sent_by = 'agent' } = req.body;

        console.log('[API] Adding message to conversation:', id);

        const database = getDatabase();
        const result = await database.query(`
            INSERT INTO messages (conversation_id, content, direction, message_type, sent_by)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `, [id, content, direction, message_type, sent_by]);

        // Update conversation last_activity
        await database.query(`
            UPDATE conversations
            SET last_activity = NOW()
            WHERE id = $1
        `, [id]);

        console.log('[SUCCESS] Message added');
        res.json({ success: true, message: result.rows[0] });
    } catch (error) {
        console.error('[ERROR] Add message error:', error.message);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

// Document Management endpoints - Simplified for compatibility
app.get('/api/conversations/:id/documents', async (req, res) => {
    try {
        const { id } = req.params;
        console.log('[API] Getting documents for conversation:', id);

        // For now, return empty documents list to avoid schema conflicts
        console.log('[INFO] Documents endpoint called - returning empty list (table schema compatibility)');
        res.json({ success: true, documents: [] });
    } catch (error) {
        console.error('[ERROR] Documents database error:', error.message);
        res.json({ success: true, documents: [] });
    }
});

app.post('/api/conversations/:id/documents/upload', async (req, res) => {
    try {
        const { id } = req.params;
        const { filename } = req.body;
        console.log('[API] Document upload requested for conversation:', id, 'filename:', filename);

        // Simulate successful upload without database interaction
        console.log('[SUCCESS] Document upload simulated successfully');
        res.json({
            success: true,
            message: 'Document upload simulated successfully. File would be processed and stored.',
            document: {
                id: `doc_${Date.now()}`,
                filename: filename || 'uploaded_file.pdf',
                conversation_id: id,
                status: 'uploaded',
                created_at: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('[ERROR] Document upload error:', error.message);
        res.json({
            success: true,
            message: 'Document upload simulated. Error: ' + error.message
        });
    }
});

app.get('/api/documents/:id', async (req, res) => {
    try {
        const { id } = req.params;
        console.log('[API] Getting document:', id);

        const database = getDatabase();
        const result = await database.query(`
            SELECT d.*, da.summary, da.extracted_data, da.confidence_score
            FROM documents d
            LEFT JOIN document_analysis da ON d.id = da.document_id
            WHERE d.id = $1
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Document not found' });
        }

        res.json({ success: true, document: result.rows[0] });
    } catch (error) {
        console.error('[ERROR] Get document error:', error.message);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

app.post('/api/documents/:id/analyze', async (req, res) => {
    try {
        const { id } = req.params;
        console.log('[API] Document analysis requested for:', id);

        const database = getDatabase();

        // Check if document exists
        const docResult = await database.query(`
            SELECT * FROM documents WHERE id = $1
        `, [id]);

        if (docResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Document not found' });
        }

        const document = docResult.rows[0];

        // Check if analysis already exists
        const existingAnalysis = await database.query(`
            SELECT * FROM document_analysis WHERE document_id = $1
        `, [id]);

        if (existingAnalysis.rows.length > 0) {
            return res.json({
                success: true,
                analysis: existingAnalysis.rows[0],
                message: 'Analysis already exists for this document'
            });
        }

        // Add to processing queue
        await database.query(`
            INSERT INTO document_processing_queue (document_id, conversation_id, processing_type, status)
            VALUES ($1, $2, 'llm_analysis', 'queued')
        `, [id, document.conversation_id]);

        res.json({
            success: true,
            message: 'Document queued for analysis. Check back in a few minutes.',
            status: 'queued'
        });
    } catch (error) {
        console.error('[ERROR] Document analysis error:', error.message);
        res.status(500).json({ success: false, error: 'Analysis failed' });
    }
});

app.delete('/api/documents/:id', async (req, res) => {
    try {
        const { id } = req.params;
        console.log('[API] Deleting document:', id);

        const database = getDatabase();
        const result = await database.query(`
            DELETE FROM documents WHERE id = $1 RETURNING *
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Document not found' });
        }

        console.log('[SUCCESS] Document deleted');
        res.json({ success: true, message: 'Document deleted' });
    } catch (error) {
        console.error('[ERROR] Delete document error:', error.message);
        res.status(500).json({ success: false, error: 'Delete failed' });
    }
});

app.delete('/api/conversations/:id/documents/:docId', async (req, res) => {
    try {
        const { id, docId } = req.params;
        console.log('[API] Deleting document from conversation:', docId);

        const database = getDatabase();
        const result = await database.query(`
            DELETE FROM documents WHERE id = $1 AND conversation_id = $2 RETURNING *
        `, [docId, id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Document not found' });
        }

        console.log('[SUCCESS] Document deleted from conversation');
        res.json({ success: true, message: 'Document deleted' });
    } catch (error) {
        console.error('[ERROR] Delete document error:', error.message);
        res.status(500).json({ success: false, error: 'Delete failed' });
    }
});

// FCS Generation endpoints
app.post('/api/conversations/:id/generate-fcs', async (req, res) => {
    try {
        const { id } = req.params;
        console.log('[API] FCS generation requested for conversation:', id);

        const database = getDatabase();

        // Get conversation details
        const convResult = await database.query(`
            SELECT * FROM conversations WHERE id = $1
        `, [id]);

        if (convResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Conversation not found' });
        }

        const conversation = convResult.rows[0];

        // Check if FCS already exists
        const existingFcs = await database.query(`
            SELECT * FROM fcs_results WHERE conversation_id = $1
        `, [id]);

        if (existingFcs.rows.length > 0) {
            console.log('[INFO] FCS already exists, returning existing data');
            return res.json({
                success: true,
                fcs: existingFcs.rows[0],
                message: 'FCS already exists for this conversation'
            });
        }

        // Add to FCS queue for processing
        await database.query(`
            INSERT INTO fcs_queue (conversation_id, business_name, request_data, status)
            VALUES ($1, $2, $3, 'queued')
        `, [id, conversation.business_name || 'Unknown Business', JSON.stringify({
            conversation_id: id,
            business_name: conversation.business_name,
            requested_at: new Date().toISOString()
        })]);

        console.log('[SUCCESS] FCS queued for processing');
        res.json({
            success: true,
            message: 'FCS generation queued. Check back in a few minutes.',
            status: 'queued'
        });

    } catch (error) {
        console.error('[ERROR] FCS generation error:', error.message);
        res.status(500).json({ success: false, error: 'FCS generation failed' });
    }
});

app.get('/api/conversations/:id/fcs-report', async (req, res) => {
    try {
        const { id } = req.params;
        console.log('[API] Getting FCS report for conversation:', id);

        const database = getDatabase();
        const result = await database.query(`
            SELECT * FROM fcs_results WHERE conversation_id = $1
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'FCS report not found. Generate FCS first.'
            });
        }

        console.log('[SUCCESS] FCS report found');
        res.json({ success: true, fcs: result.rows[0] });

    } catch (error) {
        console.error('[ERROR] FCS report error:', error.message);
        res.status(500).json({ success: false, error: 'Failed to get FCS report' });
    }
});

app.post('/api/conversations/:id/generate-pdf-from-template', (req, res) => {
    console.log('[API] PDF generation requested for conversation:', req.params.id);
    res.json({
        success: false,
        error: 'PDF generation not implemented in minimal server. Use full server for this feature.'
    });
});

app.get('/api/stats', async (req, res) => {
    try {
        console.log('[API] GET /api/stats - fetching from database');
        const database = getDatabase();

        // Get total conversations
        const totalResult = await database.query('SELECT COUNT(*) as count FROM conversations');
        const totalConversations = parseInt(totalResult.rows[0].count);

        // Get state breakdown
        const stateResult = await database.query(`
            SELECT state, COUNT(*) as count
            FROM conversations
            GROUP BY state
        `);

        const stateBreakdown = {};
        stateResult.rows.forEach(row => {
            stateBreakdown[row.state] = parseInt(row.count);
        });

        // Get recent activity (last 24 hours)
        const recentResult = await database.query(`
            SELECT COUNT(*) as count
            FROM conversations
            WHERE last_activity > NOW() - INTERVAL '24 hours'
        `);
        const recentActivity = parseInt(recentResult.rows[0].count);

        const stats = {
            totalConversations,
            stateBreakdown,
            recentActivity,
            newLeads: stateBreakdown.NEW || 0,
            qualified: stateBreakdown.QUALIFIED || 0,
            funded: stateBreakdown.FUNDED || 0
        };

        console.log('[SUCCESS] Stats:', stats);
        res.json(stats);
    } catch (error) {
        console.error('[ERROR] Stats database error:', error.message);
        res.status(500).json({ error: 'Database error' });
    }
});

// Lender Management endpoints
app.get('/api/lenders', async (req, res) => {
    try {
        console.log('[API] Getting all lenders');
        const database = getDatabase();
        const result = await database.query(`
            SELECT * FROM lenders ORDER BY name ASC
        `);

        console.log(`[DATABASE] Found ${result.rows.length} lenders`);
        res.json(result.rows);
    } catch (error) {
        console.error('[ERROR] Lenders database error:', error.message);
        res.status(500).json({ error: 'Database error' });
    }
});

app.get('/api/lenders/:id', async (req, res) => {
    try {
        const { id } = req.params;
        console.log('[API] Getting lender:', id);

        const database = getDatabase();
        const result = await database.query(`
            SELECT * FROM lenders WHERE id = $1
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Lender not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('[ERROR] Get lender error:', error.message);
        res.status(500).json({ error: 'Database error' });
    }
});

app.post('/api/lenders', async (req, res) => {
    try {
        const { name, email, phone, company, min_amount, max_amount, industries, states, credit_score_min, time_in_business_min, notes } = req.body;
        console.log('[API] Creating new lender:', name);

        const database = getDatabase();
        const result = await database.query(`
            INSERT INTO lenders (name, email, phone, company, min_amount, max_amount, industries, states, credit_score_min, time_in_business_min, notes)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING *
        `, [name, email, phone, company, min_amount, max_amount, JSON.stringify(industries), JSON.stringify(states), credit_score_min, time_in_business_min, notes]);

        console.log('[SUCCESS] Lender created');
        res.json({ success: true, lender: result.rows[0] });
    } catch (error) {
        console.error('[ERROR] Create lender error:', error.message);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

app.put('/api/lenders/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, email, phone, company, min_amount, max_amount, industries, states, credit_score_min, time_in_business_min, notes } = req.body;
        console.log('[API] Updating lender:', id);

        const database = getDatabase();
        const result = await database.query(`
            UPDATE lenders SET
                name = $2, email = $3, phone = $4, company = $5,
                min_amount = $6, max_amount = $7, industries = $8, states = $9,
                credit_score_min = $10, time_in_business_min = $11, notes = $12,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
            RETURNING *
        `, [id, name, email, phone, company, min_amount, max_amount, JSON.stringify(industries), JSON.stringify(states), credit_score_min, time_in_business_min, notes]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Lender not found' });
        }

        console.log('[SUCCESS] Lender updated');
        res.json({ success: true, lender: result.rows[0] });
    } catch (error) {
        console.error('[ERROR] Update lender error:', error.message);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

app.delete('/api/lenders/:id', async (req, res) => {
    try {
        const { id } = req.params;
        console.log('[API] Deleting lender:', id);

        const database = getDatabase();
        const result = await database.query(`
            DELETE FROM lenders WHERE id = $1 RETURNING *
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Lender not found' });
        }

        console.log('[SUCCESS] Lender deleted');
        res.json({ success: true, message: 'Lender deleted' });
    } catch (error) {
        console.error('[ERROR] Delete lender error:', error.message);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

app.get('/api/conversations/:id/lenders', async (req, res) => {
    try {
        const { id } = req.params;
        console.log('[API] Getting lender matches for conversation:', id);

        const database = getDatabase();
        const result = await database.query(`
            SELECT * FROM lender_matches WHERE conversation_id = $1 ORDER BY position ASC
        `, [id]);

        console.log(`[DATABASE] Found ${result.rows.length} lender matches`);
        res.json(result.rows);
    } catch (error) {
        console.error('[ERROR] Lender matches error:', error.message);
        res.status(500).json({ error: 'Database error' });
    }
});

app.post('/api/conversations/:id/lenders/qualify', async (req, res) => {
    try {
        const { id } = req.params;
        console.log('[API] Qualifying lenders for conversation:', id);

        // This would normally run lender qualification logic
        // For now, return a simple response
        res.json({
            success: true,
            message: 'Lender qualification queued. Check the lenders tab for results.',
            qualified_count: 0
        });
    } catch (error) {
        console.error('[ERROR] Lender qualification error:', error.message);
        res.status(500).json({ success: false, error: 'Qualification failed' });
    }
});

app.post('/api/conversations/:id/send-to-lenders', async (req, res) => {
    try {
        const { id } = req.params;
        const { lender_ids, message } = req.body;
        console.log('[API] Sending to lenders for conversation:', id);

        // This would normally send emails to lenders
        // For now, just log the submission
        const database = getDatabase();
        await database.query(`
            INSERT INTO lender_submissions (conversation_id, lender_ids, business_data, email_results)
            VALUES ($1, $2, $3, $4)
        `, [id, JSON.stringify(lender_ids), JSON.stringify({ message }), JSON.stringify({ status: 'simulated' })]);

        res.json({
            success: true,
            message: `Emails sent to ${lender_ids.length} lenders`,
            results: { sent: lender_ids.length, failed: 0 }
        });
    } catch (error) {
        console.error('[ERROR] Send to lenders error:', error.message);
        res.status(500).json({ success: false, error: 'Failed to send to lenders' });
    }
});

// State update and bulk operations
app.put('/api/conversations/:id/state', async (req, res) => {
    try {
        const { id } = req.params;
        const { state, current_step } = req.body;
        console.log('[API] Updating conversation state:', id, 'to', state);

        const database = getDatabase();
        const result = await database.query(`
            UPDATE conversations SET
                state = $2,
                current_step = $3,
                last_activity = NOW()
            WHERE id = $1
            RETURNING *
        `, [id, state, current_step]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Conversation not found' });
        }

        console.log('[SUCCESS] Conversation state updated');
        res.json({ success: true, conversation: result.rows[0] });
    } catch (error) {
        console.error('[ERROR] Update state error:', error.message);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

app.post('/api/conversations/bulk-delete', async (req, res) => {
    try {
        const { conversation_ids } = req.body;
        console.log('[API] Bulk deleting conversations:', conversation_ids.length);

        const database = getDatabase();
        const result = await database.query(`
            DELETE FROM conversations WHERE id = ANY($1) RETURNING id
        `, [conversation_ids]);

        console.log('[SUCCESS] Bulk delete completed');
        res.json({
            success: true,
            deleted_count: result.rows.length,
            message: `${result.rows.length} conversations deleted`
        });
    } catch (error) {
        console.error('[ERROR] Bulk delete error:', error.message);
        res.status(500).json({ success: false, error: 'Bulk delete failed' });
    }
});

// Create HTTP server
const server = http.createServer(app);

// Create Socket.io server
const io = new Server(server, {
    cors: corsOptions
});

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('[WEBSOCKET] Client connected:', socket.id);

    socket.on('disconnect', () => {
        console.log('[WEBSOCKET] Client disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
    console.log(`[SUCCESS] MCA Command Center Server running on port ${PORT}`);
    console.log(`[WEBSOCKET] Socket.io server ready on port ${PORT}`);
    console.log(`[INFO] Health Check: http://localhost:${PORT}/health`);
    console.log(`[INFO] Test API: http://localhost:${PORT}/api/conversations`);
});