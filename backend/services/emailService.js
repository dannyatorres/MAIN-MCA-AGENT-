const nodemailer = require('nodemailer');
const path = require('path');

// Try to find .env file in project root
const rootPath = path.resolve(__dirname, '../../.env');
const backendPath = path.resolve(__dirname, '../.env');
const currentPath = path.resolve('.env');

// Try different locations for .env file
if (require('fs').existsSync(rootPath)) {
    require('dotenv').config({ path: rootPath });
} else if (require('fs').existsSync(backendPath)) {
    require('dotenv').config({ path: backendPath });
} else if (require('fs').existsSync(currentPath)) {
    require('dotenv').config({ path: currentPath });
} else {
    require('dotenv').config(); // Default behavior
}

// 🛡️ HELPER: Smartly decodes Base64 variables or returns raw text
const getEnvVar = (key) => {
    const value = process.env[key];
    if (!value) return null;

    // 1. If it looks like a raw Refresh Token (starts with 1//), return it raw
    if (value.startsWith('1//')) return value.trim();

    // 2. If it looks like a raw Client ID (ends with .com), return it raw
    if (value.endsWith('.com')) return value.trim();

    // 3. Otherwise, try to auto-detect Base64
    try {
        // Try to decode
        const decoded = Buffer.from(value, 'base64').toString('utf8');

        // Validation: If decoded string looks like clean text (no weird symbols), use it
        // This regex checks for standard printable characters
        if (/^[\x20-\x7E]*$/.test(decoded)) {
            return decoded.trim();
        }
        return value.trim(); // Fallback to raw if decode looked weird
    } catch (e) {
        return value.trim();
    }
};

class EmailService {
    constructor() {
        this.transporter = null;
        this.initializeTransporter();
    }

    async initializeTransporter() {
        // Use the helper to get clean credentials
        const user = getEnvVar('EMAIL_USER');
        const clientId = getEnvVar('GMAIL_CLIENT_ID');
        const clientSecret = getEnvVar('GMAIL_CLIENT_SECRET');
        const refreshToken = getEnvVar('GMAIL_REFRESH_TOKEN');

        // --- 🚨 Check ONLY for OAuth Credentials 🚨 ---
        if (!user || !clientId || !clientSecret || !refreshToken) {
            console.error('❌ FATAL ERROR: OAuth credentials missing.');
            console.error('   Please ensure EMAIL_USER, GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET,');
            console.error('   and GMAIL_REFRESH_TOKEN are all set correctly (Base64 is fine).');
            this.transporter = null;
            return;
        }

        try {
            // Configuration is strictly OAuth2
            const authConfig = {
                type: 'OAuth2',
                user: user,
                clientId: clientId,
                clientSecret: clientSecret,
                refreshToken: refreshToken
            };

            // ✅ Configuration with High-Speed Pooling
            this.transporter = nodemailer.createTransport({
                service: 'gmail',
                pool: true,
                maxConnections: 5,
                rateLimit: 10,
                auth: authConfig
            });

            // Verify connection
            await this.transporter.verify();
            console.log('🚀 High-Speed Email Service Ready (OAuth2 ONLY Mode)');
        } catch (error) {
            console.error('❌ Failed to initialize email service:', error.message);
            // This will now catch "Invalid Grant" or similar errors if the token is bad
            this.transporter = null;
        }
    }

    // ✅ FIX: Add ccEmail as the 4th argument (default to null)
    async sendLenderSubmission(lenderEmail, businessData, documents = [], ccEmail = null) {
        if (!this.transporter) {
            throw new Error('Email service not configured or failed to initialize');
        }

        const subject = `New MCA Application - ${businessData.businessName}`;

        // Process documents - they can either be file buffers (new format) or URLs (old format)
        const validAttachments = [];
        const invalidDocuments = [];

        for (const doc of documents) {
            // Debug log each document being processed
            console.log('📎 Processing document for attachment:', {
                name: doc.name,
                filename: doc.filename,
                type: doc.type || doc.mimeType || doc.contentType,
                hasContent: !!doc.content,
                hasPath: !!(doc.s3_url || doc.file_path || doc.path || doc.url)
            });

            // New format: Document with actual file buffer content
            if (doc.content) {
                validAttachments.push({
                    filename: doc.filename || doc.name || doc.originalFilename || 'document.pdf',
                    content: doc.content, // Direct file buffer
                    contentType: doc.contentType || doc.type || doc.mimeType || 'application/pdf'
                });
                console.log(`✅ Using file buffer: ${doc.filename} (${doc.content.length} bytes)`);
            }
            // Old format: Document with path/URL to fetch
            else if (doc.s3_url || doc.file_path || doc.path || doc.url) {
                const docPath = doc.s3_url || doc.file_path || doc.path || doc.url;

                // Check if it's a test/mock URL that doesn't exist
                if (docPath.includes('example-bucket') || docPath.includes('/local/docs/')) {
                    console.warn(`⚠️ Skipping mock/test document: ${docPath}`);
                    invalidDocuments.push(doc);
                    continue;
                }

                // Add to valid attachments (Nodemailer will fetch the file)
                validAttachments.push({
                    filename: doc.filename || doc.name || doc.originalFilename || 'document.pdf',
                    path: docPath,
                    contentType: doc.type || doc.mimeType || 'application/pdf'
                });
                console.log(`✅ Using file path: ${docPath}`);
            } else {
                console.warn(`⚠️ Document missing both content and path: ${doc.name || doc.filename || 'unknown'}`);
                invalidDocuments.push(doc);
            }
        }

        console.log(`📎 Valid attachments: ${validAttachments.length}, Invalid: ${invalidDocuments.length}`);

        const htmlContent = this.generateLenderEmailHtml(businessData, documents);
        const textContent = this.generateLenderEmailText(businessData, documents);

        const mailOptions = {
            from: process.env.EMAIL_FROM || getEnvVar('EMAIL_USER'),
            to: lenderEmail,

            // ✅ FIX: Add the CC field here
            cc: ccEmail,

            subject: subject,
            text: textContent,
            html: htmlContent,
            attachments: validAttachments
        };

        try {
            const result = await this.transporter.sendMail(mailOptions);
            console.log(`Email sent successfully to ${lenderEmail}:`, result.messageId);

            let warningMessage = '';
            if (invalidDocuments.length > 0) {
                warningMessage = ` (${invalidDocuments.length} documents skipped due to invalid paths)`;
            }

            return {
                success: true,
                messageId: result.messageId,
                recipient: lenderEmail,
                // ✅ LOGGING: Useful to see if CC worked
                cc: ccEmail,
                attachmentsSkipped: invalidDocuments.length,
                warning: warningMessage
            };
        } catch (error) {
            console.error(`Failed to send email to ${lenderEmail}:`, error);

            // If it's an attachment-related error, try sending without attachments
            if (error.message.includes('Invalid status code') && validAttachments.length > 0) {
                console.warn(`🔄 Retrying email without attachments due to attachment error`);

                const fallbackMailOptions = {
                    ...mailOptions,
                    attachments: []
                };

                try {
                    const fallbackResult = await this.transporter.sendMail(fallbackMailOptions);
                    console.log(`Email sent successfully WITHOUT attachments to ${lenderEmail}:`, fallbackResult.messageId);
                    return {
                        success: true,
                        messageId: fallbackResult.messageId,
                        recipient: lenderEmail,
                        attachmentsSkipped: documents.length,
                        warning: ` (All ${documents.length} attachments skipped due to fetch errors)`
                    };
                } catch (fallbackError) {
                    console.error(`Failed to send fallback email to ${lenderEmail}:`, fallbackError);
                    throw new Error(`Email delivery failed even without attachments: ${fallbackError.message}`);
                }
            }

            throw new Error(`Email delivery failed: ${error.message}`);
        }
    }

    generateLenderEmailHtml(businessData, documents) {
        // 🛠️ SMART HELPER: Hides empty rows & fixes "ARCHIVED" bug
        const renderRow = (label, value, isCurrency = false) => {
            if (!value || value === 'N/A' || value === 'ARCHIVED' || value === 'null') return '';

            const displayValue = isCurrency ? `${Number(value).toLocaleString()}` : value;

            return `
                <div class="info-row">
                    <span class="label">${label}:</span>
                    <span class="value">${displayValue}</span>
                </div>`;
        };

        const documentsHtml = documents.length > 0
            ? `
                <div class="docs-section">
                    <h3>📎 Attached Documents</h3>
                    <ul>
                        ${documents.map(doc => `<li>${doc.filename || doc.name || 'Document'}</li>`).join('')}
                    </ul>
                </div>`
            : '';

        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>New Deal Submission</title>
                <style>
                    body { font-family: 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f4f4f4; margin: 0; padding: 0; }
                    .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
                    .header { background: #1a1a1a; color: white; padding: 25px; text-align: center; }
                    .header h1 { margin: 0; font-size: 22px; font-weight: 600; letter-spacing: 1px; }
                    .content { padding: 30px; }
                    /* Cleaner box without the redundant "Business Info" header */
                    .business-info { background: #f8f9fa; padding: 20px; border-radius: 6px; margin: 20px 0; border: 1px solid #e9ecef; }
                    .info-row { display: flex; justify-content: space-between; margin-bottom: 12px; border-bottom: 1px solid #eee; padding-bottom: 8px; }
                    .info-row:last-child { border-bottom: none; margin-bottom: 0; }
                    .label { font-weight: 600; color: #555; font-size: 14px; }
                    .value { font-weight: 500; color: #000; font-size: 14px; }
                    .docs-section { margin-top: 25px; padding-top: 15px; border-top: 2px dashed #eee; }
                    .footer { background: #ecf0f1; padding: 15px; text-align: center; font-size: 12px; color: #7f8c8d; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>JMS GLOBAL</h1>
                    </div>

                    <div class="content">
                        <p><strong>New Submission:</strong></p>
                        <p>Please review the details below for a new opportunity.</p>

                        <div class="business-info">
                            ${renderRow('Business Name', businessData.businessName)}
                            ${renderRow('Industry', businessData.industry)}
                            ${renderRow('State', businessData.state)}
                            ${renderRow('Monthly Revenue', businessData.monthlyRevenue, true)}
                            ${renderRow('FICO Score', businessData.fico)}
                            ${renderRow('Time in Business', businessData.tib ? businessData.tib + ' months' : null)}
                            ${renderRow('Requested Position', businessData.position || businessData.requestedPosition)}
                            ${renderRow('Negative Days', businessData.negativeDays)}
                        </div>

                        ${documentsHtml}

                        <p>Let us know if you can provide an offer on this file.</p>

                        <p>Best regards,<br>
                        <strong>JMS GLOBAL Team</strong></p>
                    </div>

                    <div class="footer">
                        <p>Sent via JMS GLOBAL Systems</p>
                    </div>
                </div>
            </body>
            </html>
        `;
    }

    generateLenderEmailText(businessData, documents) {
        const documentsText = documents.length > 0
            ? `\nAttached Documents:\n${documents.map(doc => `- ${doc.filename || doc.name || 'Document'}`).join('\n')}\n`
            : '\n(No documents attached)\n';

        const field = (label, val) => (!val || val === 'N/A' || val === 'ARCHIVED') ? '' : `- ${label}: ${val}\n`;

        return `
NEW SUBMISSION - JMS GLOBAL

Please review the details below for a new opportunity.

${field('Business Name', businessData.businessName)}${field('Industry', businessData.industry)}${field('State', businessData.state)}${field('Monthly Revenue', businessData.monthlyRevenue ? '$' + businessData.monthlyRevenue.toLocaleString() : null)}${field('FICO Score', businessData.fico)}${field('Time in Business', businessData.tib ? businessData.tib + ' months' : null)}${field('Requested Position', businessData.position || businessData.requestedPosition)}${field('Negative Days', businessData.negativeDays)}
${documentsText}
Let us know if you can provide an offer on this file.

Best regards,
JMS GLOBAL Team
        `;
    }

    async sendBulkLenderSubmissions(lenders, businessData, documents = []) {
        const results = [];
        const errors = [];

        for (const lender of lenders) {
            try {
                // ✅ FIX: Pass 'lender.cc_email' as the 4th argument
                const result = await this.sendLenderSubmission(
                    lender.email,
                    businessData,
                    documents,
                    lender.cc_email // <--- Pass the CC data here!
                );

                results.push({
                    lender: lender.name,
                    email: lender.email,
                    ...result
                });
            } catch (error) {
                errors.push({
                    lender: lender.name,
                    email: lender.email,
                    error: error.message
                });
            }
        }

        return {
            successful: results,
            failed: errors,
            summary: {
                sent: results.length,
                failed: errors.length,
                total: lenders.length
            }
        };
    }

    async testEmailConfiguration() {
        if (!this.transporter) {
            return { success: false, error: 'Email service not configured' };
        }

        try {
            await this.transporter.verify();
            return { success: true, message: 'Email configuration is working' };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // Generic email sender for compose/reply flows
    async sendEmail({ to, subject, html, text, attachments }) {
        try {
            if (!this.transporter) {
                await this.initializeTransporter();
            }

            console.log(`📧 Sending email to ${to} with ${attachments ? attachments.length : 0} attachments`);

            const info = await this.transporter.sendMail({
                from: process.env.EMAIL_FROM || getEnvVar('EMAIL_USER'),
                to,
                subject,
                html: html || text,
                text: text || '',
                attachments: attachments || []
            });

            console.log(`✅ Email sent: ${info.messageId}`);
            return { success: true, messageId: info.messageId };
        } catch (error) {
            console.error('❌ Error sending email:', error);
            throw error;
        }
    }
}

module.exports = EmailService;
