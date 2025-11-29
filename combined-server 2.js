// Combined Server - Backend with Database + Frontend serving
// This combines the full backend functionality with frontend serving on port 8082

// Working MCA Command Center Server - Minimal version with CSV import
console.log('Starting Combined MCA Server with Database...');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const csvParser = require('csv-parser');
const { v4: uuidv4 } = require('uuid');
// const fcsService = require('./backend/services/fcsService'); // Lazy load to avoid startup hang
// const lenderMatcher = require('./backend/services/lender-matcher'); // Lazy load to avoid startup hang
require('dotenv').config();

// Email service - will be loaded on first use
let emailService = null;
function getEmailService() {
    if (!emailService) {
        const EmailService = require('./backend/services/emailService');
        emailService = new EmailService();
        console.log('Email service initialized');
    }
    return emailService;
}

// Twilio SMS Configuration
let twilioClient = null;
function getTwilioClient() {
    if (!twilioClient && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
        const twilio = require('twilio');
        twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        console.log('Twilio client initialized');
    }
    return twilioClient;
}

// Database will be loaded on demand
console.log('Database will be loaded on first API request...');
let db = null;

function getDatabase() {
    if (!db) {
        try {
            const dbModule = require('./backend/database/db');
            db = dbModule.getInstance();
            console.log('Database module loaded');
        } catch (error) {
            console.log('Database loading failed:', error.message);
            throw error;
        }
    }
    return db;
}

// Express app setup
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
        credentials: true
    }
});

const PORT = 8082; // Different port for combined server

// Middleware
app.use(cors({
    origin: '*',
    credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// IMPORTANT: Serve frontend static files FIRST
app.use(express.static(path.join(__dirname, 'frontend')));

// Conversations API endpoint (with real database)
app.get('/api/conversations', async (req, res) => {
    let database;
    try {
        database = getDatabase();
    } catch (error) {
        return res.status(500).json({ error: 'Database not available: ' + error.message });
    }

    try {
        const result = await database.query(`
            SELECT id, lead_phone, business_name, first_name, last_name,
                   state, current_step, priority, last_activity, created_at,
                   CASE
                       WHEN state = 'NEW' THEN 1
                       WHEN state = 'INTERESTED' THEN 2
                       WHEN state = 'QUALIFIED' THEN 3
                       WHEN state = 'FUNDED' THEN 4
                       ELSE 0
                   END as state_order
            FROM conversations
            ORDER BY state_order ASC, priority DESC, last_activity DESC
        `);

        console.log('GET /api/conversations - serving database data:', result.rows.length, 'conversations');
        res.json(result.rows);
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ error: 'Failed to fetch conversations' });
    }
});

// Stats API endpoint (with real database)
app.get('/api/stats', async (req, res) => {
    let database;
    try {
        database = getDatabase();
    } catch (error) {
        return res.status(500).json({ error: 'Database not available: ' + error.message });
    }

    try {
        const result = await database.query(`
            SELECT
                COUNT(*) as total_conversations,
                COUNT(CASE WHEN state = 'NEW' THEN 1 END) as new_leads,
                COUNT(CASE WHEN state = 'QUALIFIED' THEN 1 END) as qualified,
                COUNT(CASE WHEN state = 'FUNDED' THEN 1 END) as funded
            FROM conversations
        `);

        const stats = result.rows[0];
        const response = {
            totalConversations: parseInt(stats.total_conversations),
            newLeads: parseInt(stats.new_leads),
            qualified: parseInt(stats.qualified),
            funded: parseInt(stats.funded)
        };

        console.log('GET /api/stats - serving database stats');
        res.json(response);
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({
            totalConversations: 0,
            newLeads: 0,
            qualified: 0,
            funded: 0
        });
    }
});

// Individual conversation endpoint (with real database)
app.get('/api/conversations/:id', async (req, res) => {
    let database;
    try {
        database = getDatabase();
    } catch (error) {
        return res.status(500).json({ error: 'Database not available: ' + error.message });
    }

    try {
        const { id } = req.params;
        console.log('Getting conversation details for ID:', id);

        const result = await database.query(`
            SELECT * FROM conversations WHERE id = $1
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Conversation not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ error: 'Failed to fetch conversation' });
    }
});

// Documents API endpoints
app.get('/api/conversations/:id/documents', async (req, res) => {
    let database;
    try {
        database = getDatabase();
    } catch (error) {
        return res.status(500).json({ error: 'Database not available: ' + error.message });
    }

    try {
        const { id } = req.params;
        console.log('Getting documents for conversation ID:', id);

        const result = await database.query(`
            SELECT * FROM documents WHERE conversation_id = $1 ORDER BY created_at DESC
        `, [id]);

        res.json({
            success: true,
            documents: result.rows
        });
    } catch (error) {
        console.error('Database error fetching documents:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch documents',
            documents: []
        });
    }
});

// Document upload endpoint
app.post('/api/conversations/:id/documents/upload', async (req, res) => {
    res.status(400).json({
        success: false,
        error: 'Document upload functionality is not available in this version. Please use the full backend server for document uploads.'
    });
});

// Document download endpoint
app.get('/api/conversations/:conversationId/documents/:documentId/download', async (req, res) => {
    let database;
    try {
        database = getDatabase();
    } catch (error) {
        return res.status(500).json({ success: false, error: 'Database not available: ' + error.message });
    }

    try {
        const { conversationId, documentId } = req.params;

        console.log('Download request for document:', { conversationId, documentId });

        const result = await database.query(`
            SELECT * FROM documents WHERE id = $1 AND conversation_id = $2
        `, [documentId, conversationId]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Document not found'
            });
        }

        const document = result.rows[0];

        // Since the actual file doesn't exist, return an error message
        res.status(404).json({
            success: false,
            error: 'File not found on server',
            message: `The file "${document.original_filename}" is not available for download. The file may have been moved or deleted from storage.`
        });
    } catch (error) {
        console.error('Database error in download:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to process download request'
        });
    }
});

// Direct file serving endpoint (for PDF viewing)
app.get('/api/conversations/:conversationId/documents/:documentId/file', async (req, res) => {
    let database;
    try {
        database = getDatabase();
    } catch (error) {
        return res.status(500).json({ success: false, error: 'Database not available: ' + error.message });
    }

    try {
        const { conversationId, documentId } = req.params;

        console.log('Direct file request for document:', { conversationId, documentId });

        const result = await database.query(`
            SELECT * FROM documents WHERE id = $1 AND conversation_id = $2
        `, [documentId, conversationId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Document not found' });
        }

        const document = result.rows[0];

        // First, check if we have an S3 URL
        if (document.s3_url && document.s3_url.trim() !== '') {
            console.log('Redirecting to S3 URL:', document.s3_url);
            // Redirect to the S3 URL directly
            return res.redirect(document.s3_url);
        }

        // If no S3 URL, try to construct one from s3_key
        if (document.s3_key && document.s3_key.trim() !== '') {
            console.log('Constructing S3 URL from key:', document.s3_key);
            // Construct S3 URL from key using environment variables
            const s3BucketName = process.env.S3_DOCUMENTS_BUCKET || 'mca-command-center-documents';
            const s3Region = process.env.AWS_REGION || 'us-east-2';
            const s3Url = `https://${s3BucketName}.s3.${s3Region}.amazonaws.com/${document.s3_key}`;

            console.log('Redirecting to constructed S3 URL:', s3Url);
            return res.redirect(s3Url);
        }

        // Fall back to local file system search
        console.log('No S3 URL/key found, searching local filesystem');
        const uploadsPath = path.join(__dirname, 'backend', 'uploads');
        const possiblePaths = [
            path.join(uploadsPath, document.filename),
            path.join(uploadsPath, document.original_filename),
            path.join(__dirname, 'uploads', document.filename),
            path.join(__dirname, 'uploads', document.original_filename)
        ];

        let filePath = null;
        for (const testPath of possiblePaths) {
            if (fs.existsSync(testPath)) {
                filePath = testPath;
                break;
            }
        }

        if (filePath) {
            // File exists locally, serve it directly
            const mimeType = document.original_filename.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream';

            res.setHeader('Content-Type', mimeType);
            res.setHeader('Content-Disposition', `inline; filename="${document.original_filename}"`);

            return res.sendFile(filePath);
        } else {
            // File doesn't exist anywhere, return 404
            return res.status(404).json({
                success: false,
                error: 'File not found',
                message: `The file "${document.original_filename}" is not available. It may have been moved or deleted from storage.`
            });
        }
    } catch (error) {
        console.error('Database error in file serve:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to serve file'
        });
    }
});

// Document preview endpoint
app.get('/api/conversations/:conversationId/documents/:documentId/preview', async (req, res) => {
    let database;
    try {
        database = getDatabase();
    } catch (error) {
        return res.status(500).json({ success: false, error: 'Database not available: ' + error.message });
    }

    try {
        const { conversationId, documentId } = req.params;

        console.log('Preview request for document:', { conversationId, documentId });

        const result = await database.query(`
            SELECT * FROM documents WHERE id = $1 AND conversation_id = $2
        `, [documentId, conversationId]);

        if (result.rows.length === 0) {
            return res.status(404).send('<html><body><h1>Document not found</h1></body></html>');
        }

        const document = result.rows[0];

        // Return a preview page with document info
        const previewHtml = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Document Preview - ${document.original_filename}</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
                .preview-container { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                .document-info { margin-bottom: 20px; }
                .info-row { margin: 10px 0; }
                .label { font-weight: bold; color: #333; }
                .value { color: #666; }
                .file-icon { font-size: 48px; text-align: center; margin: 20px 0; }
                .error-message { background: #ffe6e6; padding: 15px; border-radius: 4px; color: #d63384; margin: 20px 0; }
            </style>
        </head>
        <body>
            <div class="preview-container">
                <h1>Document Preview</h1>
                <div class="file-icon">📄</div>
                <div class="document-info">
                    <div class="info-row">
                        <span class="label">Filename:</span>
                        <span class="value">${document.original_filename}</span>
                    </div>
                    <div class="info-row">
                        <span class="label">File Size:</span>
                        <span class="value">${(parseInt(document.file_size) / 1024).toFixed(1)} KB</span>
                    </div>
                    <div class="info-row">
                        <span class="label">Upload Date:</span>
                        <span class="value">${new Date(document.created_at).toLocaleString()}</span>
                    </div>
                    <div class="info-row">
                        <span class="label">Document Type:</span>
                        <span class="value">${document.document_type || 'Not specified'}</span>
                    </div>
                </div>
                <div class="error-message">
                    ⚠️ File content preview is not available. The document file is not stored on this server.
                </div>
            </div>
        </body>
        </html>
        `;

        res.setHeader('Content-Type', 'text/html');
        res.send(previewHtml);
    } catch (error) {
        console.error('Database error in preview:', error);
        res.status(500).send('<html><body><h1>Error loading document preview</h1></body></html>');
    }
});

// Document update endpoint
app.put('/api/conversations/:conversationId/documents/:documentId', async (req, res) => {
    let database;
    try {
        database = getDatabase();
    } catch (error) {
        return res.status(500).json({ success: false, error: 'Database not available: ' + error.message });
    }

    try {
        const { conversationId, documentId } = req.params;
        const { filename, documentType } = req.body;

        console.log('Updating document:', { conversationId, documentId, filename, documentType });

        const result = await database.query(`
            UPDATE documents
            SET original_filename = $1
            WHERE id = $2 AND conversation_id = $3
            RETURNING *
        `, [filename, documentId, conversationId]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Document not found'
            });
        }

        res.json({
            success: true,
            document: result.rows[0]
        });
    } catch (error) {
        console.error('Database error updating document:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update document'
        });
    }
});

// Document delete endpoint
app.delete('/api/conversations/:conversationId/documents/:documentId', async (req, res) => {
    let database;
    try {
        database = getDatabase();
    } catch (error) {
        return res.status(500).json({ success: false, error: 'Database not available: ' + error.message });
    }

    try {
        const { conversationId, documentId } = req.params;

        console.log('Delete request for document:', { conversationId, documentId });

        const result = await database.query(`
            DELETE FROM documents WHERE id = $1 AND conversation_id = $2 RETURNING *
        `, [documentId, conversationId]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Document not found'
            });
        }

        res.json({
            success: true,
            message: 'Document deleted successfully'
        });
    } catch (error) {
        console.error('Database error deleting document:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete document'
        });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date(),
        database: db ? 'connected' : 'not initialized'
    });
});

// Socket.io connection handlers
io.on('connection', (socket) => {
    console.log('✅ Client connected:', socket.id);

    // Join user room
    socket.on('join:user', (data) => {
        const { userId } = data;
        socket.join(`user:${userId}`);
        console.log(`User ${userId} joined their room`);
    });

    // Join conversation room
    socket.on('join:conversation', (data) => {
        const { conversationId } = data;
        socket.join(`conversation:${conversationId}`);
        console.log(`Socket ${socket.id} joined conversation:${conversationId}`);
    });

    // Leave conversation room
    socket.on('leave:conversation', (data) => {
        const { conversationId } = data;
        socket.leave(`conversation:${conversationId}`);
        console.log(`Socket ${socket.id} left conversation:${conversationId}`);
    });

    // Handle disconnect
    socket.on('disconnect', (reason) => {
        console.log('❌ Client disconnected:', socket.id, 'Reason:', reason);
    });

    // Handle errors
    socket.on('error', (error) => {
        console.error('Socket error:', error);
    });
});

// Catch-all for frontend routes (MUST be last)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'command-center.html'));
});

// Start server
server.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════════════╗
║                                                        ║
║   🚀 Combined Server with DB running on port ${PORT}     ║
║                                                        ║
║   Frontend: http://localhost:${PORT}/command-center.html ║
║   API:      http://localhost:${PORT}/api/conversations  ║
║   Health:   http://localhost:${PORT}/health             ║
║   Database: PostgreSQL AWS RDS                        ║
║                                                        ║
╚════════════════════════════════════════════════════════╝
    `);
});