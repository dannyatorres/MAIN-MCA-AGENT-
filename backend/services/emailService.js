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

    // ✅ UPDATE: Accepts 'lenderName', sends wider "Report Style" email
    async sendLenderSubmission(lenderName, lenderEmail, businessData, documents = [], ccEmail = null) {
        if (!this.transporter) {
            throw new Error('Email service not configured or failed to initialize');
        }

        // ✅ FIXED SUBJECT: Includes JMS GLOBAL branding
        const subject = `New Submission from JMS GLOBAL : ${businessData.businessName}`;

        // Process documents
        const validAttachments = [];
        for (const doc of documents) {
            if (doc.content) {
                validAttachments.push({
                    filename: doc.filename || doc.name || 'document.pdf',
                    content: doc.content,
                    contentType: doc.contentType || 'application/pdf'
                });
            } else if (doc.s3_url || doc.file_path || doc.path || doc.url) {
                validAttachments.push({
                    filename: doc.filename || doc.name || 'document.pdf',
                    path: doc.s3_url || doc.file_path || doc.path || doc.url,
                    contentType: doc.contentType || 'application/pdf'
                });
            }
        }

        const htmlContent = this.generateLenderEmailHtml(lenderName, businessData, documents);
        const textContent = this.generateLenderEmailText(lenderName, businessData, documents);

        const mailOptions = {
            from: process.env.EMAIL_FROM || getEnvVar('EMAIL_USER'),
            to: lenderEmail,
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

    // ✅ NEW LAYOUT: 1000px Width + 2-Column Data Grid
    generateLenderEmailHtml(lenderName, businessData, documents) {
        // Helper to format currency/nulls
        const fmt = (val, isCurrency) => {
            if (!val || val === 'N/A' || val === 'null') return '-';
            return isCurrency ? `${Number(val).toLocaleString()}` : val;
        };

        const documentsHtml = documents.length > 0
            ? `<div class="section-title">Attached Documents</div>
               <div class="docs-grid">
                  ${documents.map(doc => `<div class="doc-item">📄 ${doc.filename || doc.name}</div>`).join('')}
               </div>`
            : '';

        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <style>
                    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f0f2f5; margin: 0; padding: 0; }

                    /* ✅ WIDER CONTAINER (1000px) for "Full Page" feel */
                    .email-wrapper { width: 100%; background-color: #f0f2f5; padding: 40px 0; }
                    .container { max-width: 1000px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }

                    /* HEADER */
                    .header { background: #1e293b; color: white; padding: 40px 50px; border-bottom: 4px solid #3b82f6; }
                    .header h1 { margin: 0; font-size: 32px; font-weight: 800; letter-spacing: 0.5px; }
                    .header p { margin: 8px 0 0 0; opacity: 0.8; font-size: 14px; text-transform: uppercase; letter-spacing: 2px; }

                    /* CONTENT */
                    .content { padding: 50px; }
                    .greeting { font-size: 18px; color: #1e293b; font-weight: 700; margin-bottom: 20px; }
                    .intro { font-size: 16px; line-height: 1.6; color: #475569; margin-bottom: 40px; max-width: 800px; }

                    /* ✅ 2-COLUMN DATA GRID (Uses Table for Email Compatibility) */
                    .data-table { width: 100%; border-collapse: collapse; margin-bottom: 40px; }
                    .data-table td { width: 50%; padding: 15px 20px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
                    .data-table tr:last-child td { border-bottom: none; }

                    .label { display: block; font-size: 12px; text-transform: uppercase; color: #94a3b8; font-weight: 700; margin-bottom: 5px; letter-spacing: 0.5px; }
                    .value { display: block; font-size: 16px; color: #0f172a; font-weight: 500; }

                    /* DOCUMENT SECTION */
                    .section-title { font-size: 14px; font-weight: 700; color: #1e293b; text-transform: uppercase; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 20px; }
                    .docs-grid { display: block; }
                    .doc-item { background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px 16px; margin-bottom: 8px; border-radius: 6px; color: #334155; font-size: 14px; font-weight: 500; }

                    /* FOOTER */
                    .footer { background: #1e293b; padding: 30px; text-align: center; color: #94a3b8; font-size: 13px; }
                </style>
            </head>
            <body>
                <div class="email-wrapper">
                    <div class="container">
                        <div class="header">
                            <h1>JMS GLOBAL</h1>
                            <p>Deal Submission</p>
                        </div>

                        <div class="content">
                            <div class="greeting">Dear ${lenderName},</div>
                            <p class="intro">
                                We are submitting the following file for your review. The merchant below has been pre-qualified against your specific lending criteria.
                            </p>

                            <table class="data-table">
                                <tr>
                                    <td>
                                        <span class="label">Business Name</span>
                                        <span class="value">${fmt(businessData.businessName)}</span>
                                    </td>
                                    <td>
                                        <span class="label">Industry</span>
                                        <span class="value">${fmt(businessData.industry)}</span>
                                    </td>
                                </tr>
                                <tr>
                                    <td>
                                        <span class="label">Monthly Revenue</span>
                                        <span class="value">${fmt(businessData.monthlyRevenue, true)}</span>
                                    </td>
                                    <td>
                                        <span class="label">State</span>
                                        <span class="value">${fmt(businessData.state)}</span>
                                    </td>
                                </tr>
                                <tr>
                                    <td>
                                        <span class="label">FICO Score</span>
                                        <span class="value">${fmt(businessData.fico)}</span>
                                    </td>
                                    <td>
                                        <span class="label">Time in Business</span>
                                        <span class="value">${businessData.tib ? businessData.tib + ' Months' : '-'}</span>
                                    </td>
                                </tr>
                                <tr>
                                    <td>
                                        <span class="label">Requested Position</span>
                                        <span class="value">${fmt(businessData.position)}</span>
                                    </td>
                                    <td>
                                        <span class="label">Negative Days</span>
                                        <span class="value">${fmt(businessData.negativeDays)}</span>
                                    </td>
                                </tr>
                            </table>

                            ${documentsHtml}

                            <p class="intro" style="margin-top: 40px; margin-bottom: 0;">
                                We look forward to your offer.
                            </p>
                        </div>

                        <div class="footer">
                            &copy; ${new Date().getFullYear()} JMS GLOBAL. All rights reserved.<br>
                            Confidential Submission.
                        </div>
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

Please review the file below for funding consideration.

BUSINESS PROFILE
----------------
Business Name:      ${businessData.businessName}
Industry:           ${businessData.industry}
Revenue:            ${businessData.monthlyRevenue}
State:              ${businessData.state}
FICO:               ${businessData.fico}
Position:           ${businessData.position}

DOCUMENTS
---------
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
