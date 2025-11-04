// routes/documents.js - HANDLES: File uploads and downloads
// URLs like: /api/documents/upload, /api/documents/:conversationId

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getDatabase } = require('../services/database');

// Configure upload directory
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer storage
const storage = multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}-${file.originalname}`;
        cb(null, uniqueName);
    }
});

// Document upload configuration (allows any file type)
const documentUpload = multer({
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// Upload document
router.post('/upload', documentUpload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No file uploaded'
            });
        }

        const { conversation_id, document_type, notes } = req.body;
        const db = getDatabase();

        // Save document metadata to database
        const result = await db.query(`
            INSERT INTO documents (
                conversation_id, filename, original_filename,
                file_path, file_size, mime_type, document_type, notes, created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
            RETURNING *
        `, [
            conversation_id,
            req.file.filename,
            req.file.originalname,
            req.file.path,
            req.file.size,
            req.file.mimetype,
            document_type || 'other',
            notes || null
        ]);

        const document = result.rows[0];

        // Emit WebSocket event
        if (global.io) {
            global.io.to(`conversation_${conversation_id}`).emit('document_uploaded', {
                conversation_id: conversation_id,
                document: document
            });
            console.log(`📄 WebSocket event emitted for document upload`);
        }

        console.log(`✅ Document uploaded: ${document.id} - ${req.file.originalname}`);

        res.json({
            success: true,
            document: document,
            file_url: `/api/documents/download/${req.file.filename}`
        });

    } catch (error) {
        console.error('Error uploading document:', error);

        // Clean up file if database insert failed
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get documents for a conversation
router.get('/:conversationId', async (req, res) => {
    try {
        const { conversationId } = req.params;
        const db = getDatabase();

        const result = await db.query(`
            SELECT * FROM documents
            WHERE conversation_id = $1
            ORDER BY created_at DESC
        `, [conversationId]);

        res.json({
            success: true,
            documents: result.rows,
            conversation_id: conversationId
        });

    } catch (error) {
        console.error('Error fetching documents:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Download document
router.get('/download/:filename', (req, res) => {
    try {
        const { filename } = req.params;
        const filePath = path.join(uploadDir, filename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                success: false,
                error: 'File not found'
            });
        }

        res.download(filePath);

    } catch (error) {
        console.error('Error downloading document:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// View/stream document (for PDFs, images, etc.)
router.get('/view/:filename', (req, res) => {
    try {
        const { filename } = req.params;
        const filePath = path.join(uploadDir, filename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                success: false,
                error: 'File not found'
            });
        }

        // Send file for inline viewing
        res.sendFile(filePath);

    } catch (error) {
        console.error('Error viewing document:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Delete document
router.delete('/:documentId', async (req, res) => {
    try {
        const { documentId } = req.params;
        const db = getDatabase();

        // Get document info first
        const docResult = await db.query(
            'SELECT * FROM documents WHERE id = $1',
            [documentId]
        );

        if (docResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Document not found'
            });
        }

        const document = docResult.rows[0];

        // Delete file from filesystem
        if (fs.existsSync(document.file_path)) {
            fs.unlinkSync(document.file_path);
        }

        // Delete from database
        await db.query('DELETE FROM documents WHERE id = $1', [documentId]);

        // Emit WebSocket event
        if (global.io) {
            global.io.to(`conversation_${document.conversation_id}`).emit('document_deleted', {
                conversation_id: document.conversation_id,
                document_id: documentId
            });
        }

        console.log(`✅ Document deleted: ${documentId}`);

        res.json({
            success: true,
            deleted_document_id: documentId
        });

    } catch (error) {
        console.error('Error deleting document:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Verify PDF endpoint (for debugging)
router.get('/verify-pdf/:filename', (req, res) => {
    try {
        const { filename } = req.params;
        const filePath = path.join(uploadDir, filename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                success: false,
                error: 'File not found'
            });
        }

        // Read first few bytes to check if it's a valid PDF
        const buffer = fs.readFileSync(filePath);
        const header = buffer.toString('utf8', 0, 4);
        const isValidPDF = header === '%PDF';

        res.json({
            filename,
            size: buffer.length,
            isValidPDF,
            header: header,
            firstBytes: Array.from(buffer.slice(0, 10))
        });

    } catch (error) {
        console.error('Error verifying PDF:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
