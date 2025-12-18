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

    // ✅ UPDATE: Now accepts 'lenderName' as the 1st argument
    async sendLenderSubmission(lenderName, lenderEmail, businessData, documents = [], ccEmail = null) {
        if (!this.transporter) {
            throw new Error('Email service not configured or failed to initialize');
        }

        // Subject Line: Clean and professional
        const subject = `New Submission: ${businessData.businessName} - Deal Submission`;

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

        // Generate Content with Dynamic Lender Name
        const htmlContent = this.generateLenderEmailHtml(lenderName, businessData, documents);
        const textContent = this.generateLenderEmailText(lenderName, businessData, documents);

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
            console.log(`Email sent successfully to ${lenderName} (${lenderEmail})`);
            return { success: true, messageId: result.messageId };
        } catch (error) {
            console.error(`Failed to send email to ${lenderName}:`, error);
            throw error;
        }
    }

    // ✅ NEW LAYOUT & VERBIAGE
    generateLenderEmailHtml(lenderName, businessData, documents) {
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
            ? `<div class="docs-section">
                <h3>Attached Documents</h3>
                <ul>${documents.map(doc => `<li>${doc.filename || doc.name}</li>`).join('')}</ul>
               </div>`
            : '';

        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <style>
                    body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #333; background-color: #f4f4f4; margin: 0; padding: 20px; }
                    /* ✅ FIX: Wider Container (850px) */
                    .container { max-width: 850px; margin: 0 auto; background: #ffffff; border-radius: 4px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }

                    /* ✅ FIX: Header Branding - JMS GLOBAL */
                    .header { background: #1e293b; color: white; padding: 35px 40px; }
                    .header h1 { margin: 0; font-size: 28px; font-weight: 700; letter-spacing: 1px; }
                    .header p { margin: 5px 0 0 0; font-size: 14px; color: #94a3b8; text-transform: uppercase; letter-spacing: 1.5px; }

                    .content { padding: 40px; }
                    .greeting { font-size: 16px; margin-bottom: 20px; color: #1e293b; font-weight: 600; }
                    .intro { font-size: 15px; line-height: 1.6; color: #475569; margin-bottom: 30px; }

                    /* Data Box */
                    .business-info-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 25px; margin-bottom: 30px; }
                    .info-row { display: flex; margin-bottom: 12px; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px; }
                    .info-row:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
                    .label { width: 180px; font-weight: 600; color: #64748b; font-size: 14px; }
                    .value { font-weight: 500; color: #0f172a; font-size: 15px; }

                    .docs-section h3 { font-size: 16px; color: #1e293b; margin-bottom: 15px; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; display: inline-block; }
                    .docs-section ul { list-style: none; padding: 0; }
                    .docs-section li { background: #f1f5f9; padding: 10px 15px; margin-bottom: 8px; border-radius: 4px; font-size: 14px; color: #334155; display: flex; align-items: center; }
                    .docs-section li:before { content: "📄"; margin-right: 10px; }

                    .footer { background: #f8fafc; padding: 25px 40px; border-top: 1px solid #e2e8f0; font-size: 13px; color: #64748b; text-align: center; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>JMS GLOBAL</h1>
                        <p>Deal Submission</p>
                    </div>

                    <div class="content">
                        <div class="greeting">Dear ${lenderName},</div>

                        <p class="intro">
                            Please review the file below for funding consideration. This merchant has been pre-qualified against your specific lending parameters and matches your current buy box.
                        </p>

                        <div class="business-info-box">
                            ${renderRow('Business Name', businessData.businessName)}
                            ${renderRow('Industry', businessData.industry)}
                            ${renderRow('State', businessData.state)}
                            ${renderRow('Monthly Revenue', businessData.monthlyRevenue, true)}
                            ${renderRow('FICO Score', businessData.fico)}
                            ${renderRow('Time in Business', businessData.tib ? businessData.tib + ' months' : null)}
                            ${renderRow('Requested Position', businessData.position)}
                            ${renderRow('Negative Days', businessData.negativeDays)}
                        </div>

                        ${documentsHtml}

                        <p class="intro" style="margin-top: 30px; margin-bottom: 0;">
                            We look forward to your offer.
                        </p>
                    </div>

                    <div class="footer">
                        &copy; ${new Date().getFullYear()} JMS GLOBAL. All rights reserved.<br>
                        Confidential Submission.
                    </div>
                </div>
            </body>
            </html>
        `;
    }

    generateLenderEmailText(lenderName, businessData, documents) {
        return `
JMS GLOBAL | Deal Submission

Dear ${lenderName},

Please review the file below for funding consideration. This merchant has been pre-qualified against your specific lending parameters.

BUSINESS OVERVIEW
-----------------
Business Name: ${businessData.businessName}
Revenue: ${businessData.monthlyRevenue}
Industry: ${businessData.industry}
State: ${businessData.state}

DOCUMENTS ATTACHED
------------------
${documents.map(d => `- ${d.filename || d.name}`).join('\n')}

We look forward to your offer.

Best regards,
JMS GLOBAL
        `;
    }

    async sendBulkLenderSubmissions(lenders, businessData, documents = []) {
        const results = [];
        const errors = [];

        for (const lender of lenders) {
            try {
                // ✅ UPDATE: Pass lenderName as 1st argument, then email, then cc_email
                const result = await this.sendLenderSubmission(
                    lender.name || lender.lender_name,
                    lender.email,
                    businessData,
                    documents,
                    lender.cc_email
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
