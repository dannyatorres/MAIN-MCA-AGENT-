// routes/pdf.js - HANDLES: PDF generation & saving
const express = require('express');
const router = express.Router();
const { getDatabase } = require('../services/database');
const documentService = require('../services/documentService');
const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || 'us-east-1'
});

// Generate HTML Template (Reads app5.html and fills it with data)
router.post('/:id/generate-html', async (req, res) => {
    try {
        const { applicationData, ownerName } = req.body;
        const clientIp = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || '127.0.0.1';

        const html = documentService.generatePopulatedTemplate(applicationData, ownerName, clientIp);
        res.send(html);
    } catch (error) {
        console.error('❌ Error generating template:', error);
        res.status(500).json({ error: 'Failed to generate HTML template' });
    }
});

// Save Generated PDF to S3 and Database
router.post('/:id/save', async (req, res) => {
    try {
        const { conversationId, pdfBase64, filename, documentId } = req.body;
        const db = getDatabase();

        const buffer = Buffer.from(pdfBase64, 'base64');
        const s3Key = `generated/${conversationId}/${Date.now()}_${filename}`;

        await s3.putObject({
            Bucket: process.env.S3_DOCUMENTS_BUCKET,
            Key: s3Key,
            Body: buffer,
            ContentType: 'application/pdf'
        }).promise();

        const docId = documentId || uuidv4();
        await db.query(`
            INSERT INTO documents (
                id, conversation_id, s3_key, original_filename,
                mime_type, file_size, created_at
            )
            VALUES ($1, $2, $3, $4, 'application/pdf', $5, NOW())
        `, [docId, conversationId, s3Key, filename, buffer.length]);

        console.log(`✅ PDF Saved: ${filename}`);
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Error saving PDF:', error);
        res.status(500).json({ error: 'Failed to save PDF to S3/DB' });
    }
});

// Generate PDF using Puppeteer (Server-Side Rendering)
router.post('/:id/generate', async (req, res) => {
    try {
        const conversationId = req.params.id;
        const { applicationData, ownerName } = req.body;

        const getRandomIp = () => Array(4).fill(0).map(() => Math.floor(Math.random() * 256)).join('.');
        const clientIp = getRandomIp();
        console.log(`🎲 Generated Random IP for PDF: ${clientIp}`);

        const result = await documentService.generateLeadPDF(
            conversationId,
            applicationData,
            ownerName,
            clientIp
        );

        res.json({ success: true, message: 'PDF generated successfully', document: result });
    } catch (error) {
        console.error('❌ Puppeteer PDF Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
