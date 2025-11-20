// routes/documents.js - HANDLES: File uploads to S3 and downloads
// URLs like: /api/documents/upload, /api/documents/:conversationId

const express = require('express');
const router = express.Router();
const multer = require('multer');
const multerS3 = require('multer-s3');
const AWS = require('aws-sdk');
const { getDatabase } = require('../services/database');

// Configure AWS S3
const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || 'us-east-1'
});

const bucket = process.env.S3_DOCUMENTS_BUCKET;

console.log('🔧 S3 Document Storage Configuration:', {
    bucket: bucket,
    region: process.env.AWS_REGION,
    hasAccessKey: !!process.env.AWS_ACCESS_KEY_ID
});

// Configure multer to upload directly to S3
const upload = multer({
    storage: multerS3({
        s3: s3,
        bucket: bucket,
        metadata: function (req, file, cb) {
            cb(null, {
                fieldName: file.fieldname,
                originalName: file.originalname,
                uploadedAt: new Date().toISOString()
            });
        },
        key: function (req, file, cb) {
            // Generate unique filename with timestamp
            const timestamp = Date.now();
            const randomId = Math.round(Math.random() * 1E9);
            const sanitizedFilename = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
            const key = `documents/${timestamp}-${randomId}-${sanitizedFilename}`;
            cb(null, key);
        }
    }),
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB limit
    },
    fileFilter: (req, file, cb) => {
        // Accept all file types
        cb(null, true);
    }
});

// Upload document to S3
router.post('/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No file uploaded'
            });
        }

        const { conversation_id, document_type, notes } = req.body;
        const db = getDatabase();

        console.log('📤 S3 Upload Success:', {
            bucket: req.file.bucket,
            key: req.file.key,
            location: req.file.location,
            size: req.file.size
        });

        // Save document metadata to database
        const result = await db.query(`
            INSERT INTO documents (
                conversation_id,
                filename,
                original_filename,
                file_size,
                mime_type,
                file_extension,
                document_type,
                notes,
                s3_bucket,
                s3_key,
                s3_url,
                created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
            RETURNING *
        `, [
            conversation_id,
            req.file.key.split('/').pop(), // Just the filename
            req.file.originalname,
            req.file.size,
            req.file.mimetype,
            req.file.originalname.split('.').pop().toLowerCase(),
            document_type || 'Other',
            notes || null,
            req.file.bucket,
            req.file.key,
            req.file.location // Full S3 URL
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

        console.log(`✅ Document uploaded to S3: ${document.id} - ${req.file.originalname}`);
        console.log(`   S3 Location: ${req.file.location}`);

        res.json({
            success: true,
            document: document,
            s3_url: req.file.location
        });

    } catch (error) {
        console.error('Error uploading document:', error);

        // If database save failed but S3 upload succeeded, we should delete from S3
        if (req.file && req.file.key) {
            try {
                await s3.deleteObject({
                    Bucket: bucket,
                    Key: req.file.key
                }).promise();
                console.log('🗑️ Cleaned up S3 file after database error');
            } catch (s3Error) {
                console.error('Failed to cleanup S3 file:', s3Error);
            }
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

// Download document from S3 (generates pre-signed URL)
router.get('/download/:documentId', async (req, res) => {
    try {
        const { documentId } = req.params;
        const db = getDatabase();

        // Get document info from database
        const result = await db.query(
            'SELECT filename, original_filename, s3_key, s3_bucket, mime_type FROM documents WHERE id = $1',
            [documentId]
        );

        if (result.rows.length === 0) {
            return res.status(404).send('Document not found');
        }

        const doc = result.rows[0];

        if (!doc.s3_key) {
            return res.status(404).send('Document not found in S3');
        }

        // Prepare the Filename
        let downloadName = doc.filename || doc.original_filename || 'document.pdf';

        // FIX: Remove dangerous characters (like newlines/quotes) that break headers
        downloadName = downloadName.replace(/"/g, "'").replace(/[\r\n]/g, "");

        console.log('📥 Downloading document:', downloadName);

        // Set Headers - QUOTES ARE CRITICAL: filename="${downloadName}"
        res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
        res.setHeader('Content-Type', doc.mime_type || 'application/pdf');

        // Stream file from S3
        const s3Stream = s3.getObject({
            Bucket: doc.s3_bucket || process.env.S3_DOCUMENTS_BUCKET,
            Key: doc.s3_key
        }).createReadStream();

        // Handle Stream Errors
        s3Stream.on('error', (s3Err) => {
            console.error('❌ S3 Stream Error:', s3Err);
            if (!res.headersSent) {
                res.status(404).send('File not found in storage');
            }
        });

        // Pipe to response
        s3Stream.pipe(res);

    } catch (error) {
        console.error('❌ Download Route Error:', error);
        if (!res.headersSent) res.status(500).send('Server Error');
    }
});

// View/stream document from S3 (for inline viewing)
router.get('/view/:documentId', async (req, res) => {
    try {
        const { documentId } = req.params;
        const db = getDatabase();

        // Get document info from database
        const result = await db.query(
            'SELECT * FROM documents WHERE id = $1',
            [documentId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Document not found'
            });
        }

        const document = result.rows[0];

        // Generate pre-signed URL for viewing (expires in 1 hour)
        const url = s3.getSignedUrl('getObject', {
            Bucket: document.s3_bucket,
            Key: document.s3_key,
            Expires: 3600,
            ResponseContentDisposition: `inline; filename="${document.original_filename}"`
        });

        // Redirect to pre-signed URL
        res.redirect(url);

    } catch (error) {
        console.error('Error viewing document:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get direct S3 URL for a document (for internal use)
router.get('/s3-url/:documentId', async (req, res) => {
    try {
        const { documentId } = req.params;
        const db = getDatabase();

        const result = await db.query(
            'SELECT s3_bucket, s3_key, s3_url, original_filename FROM documents WHERE id = $1',
            [documentId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Document not found'
            });
        }

        const document = result.rows[0];

        // Generate temporary pre-signed URL (expires in 1 hour)
        const url = s3.getSignedUrl('getObject', {
            Bucket: document.s3_bucket,
            Key: document.s3_key,
            Expires: 3600
        });

        res.json({
            success: true,
            document_id: documentId,
            s3_url: url,
            original_filename: document.original_filename
        });

    } catch (error) {
        console.error('Error getting S3 URL:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Delete document from S3 and database
router.delete('/:documentId', async (req, res) => {
    try {
        const { documentId} = req.params;
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

        // Delete from S3
        try {
            await s3.deleteObject({
                Bucket: document.s3_bucket,
                Key: document.s3_key
            }).promise();
            console.log(`🗑️ Deleted from S3: ${document.s3_key}`);
        } catch (s3Error) {
            console.error('Error deleting from S3:', s3Error);
            // Continue with database deletion even if S3 fails
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

// Health check - verify S3 connection
router.get('/health/s3', async (req, res) => {
    try {
        // Try to list objects in the bucket to verify connection
        await s3.listObjectsV2({
            Bucket: bucket,
            MaxKeys: 1
        }).promise();

        res.json({
            success: true,
            message: 'S3 connection successful',
            bucket: bucket,
            region: process.env.AWS_REGION
        });
    } catch (error) {
        console.error('S3 health check failed:', error);
        res.status(500).json({
            success: false,
            error: 'S3 connection failed',
            details: error.message
        });
    }
});

// Verify PDF endpoint (for debugging) - downloads from S3 and checks
router.get('/verify-pdf/:documentId', async (req, res) => {
    try {
        const { documentId } = req.params;
        const db = getDatabase();

        const result = await db.query(
            'SELECT * FROM documents WHERE id = $1',
            [documentId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Document not found'
            });
        }

        const document = result.rows[0];

        // Get file from S3
        const s3Data = await s3.getObject({
            Bucket: document.s3_bucket,
            Key: document.s3_key
        }).promise();

        const buffer = s3Data.Body;
        const header = buffer.toString('utf8', 0, 4);
        const isValidPDF = header === '%PDF';

        res.json({
            filename: document.original_filename,
            s3_key: document.s3_key,
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
