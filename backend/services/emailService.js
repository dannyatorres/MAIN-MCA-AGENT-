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

class EmailService {
    constructor() {
        this.transporter = null;
        this.initializeTransporter();
    }

    async initializeTransporter() {
        if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
            console.warn('Email credentials not configured. Email functionality will be disabled.');
            return;
        }

        try {
            this.transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_PASSWORD
                }
            });

            // Verify connection
            await this.transporter.verify();
            console.log('Email service initialized successfully');
        } catch (error) {
            console.error('Failed to initialize email service:', error.message);
            this.transporter = null;
        }
    }

    async sendLenderSubmission(lenderEmail, businessData, documents = []) {
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
            from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
            to: lenderEmail,
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
        const documentsHtml = documents.length > 0 
            ? `
                <h3>Attached Documents:</h3>
                <ul>
                    ${documents.map(doc => `<li>${doc.filename || doc.name || 'Document'} (${doc.type || doc.mimeType || 'PDF'})</li>`).join('')}
                </ul>
            `
            : '<p><em>No documents attached</em></p>';

        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>New MCA Application</title>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .header { background: #2c3e50; color: white; padding: 20px; text-align: center; }
                    .content { padding: 20px; }
                    .business-info { background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 15px 0; }
                    .info-row { display: flex; justify-content: space-between; margin: 8px 0; }
                    .label { font-weight: bold; color: #2c3e50; }
                    .footer { background: #ecf0f1; padding: 15px; text-align: center; font-size: 12px; color: #7f8c8d; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>New MCA Application Submission</h1>
                </div>
                
                <div class="content">
                    <p>Dear Lender,</p>
                    
                    <p>We have a new Merchant Cash Advance application that matches your lending criteria. Please find the business details below:</p>
                    
                    <div class="business-info">
                        <h2>Business Information</h2>
                        <div class="info-row">
                            <span class="label">Business Name:</span>
                            <span>${businessData.businessName || 'N/A'}</span>
                        </div>
                        <div class="info-row">
                            <span class="label">Industry:</span>
                            <span>${businessData.industry || 'N/A'}</span>
                        </div>
                        <div class="info-row">
                            <span class="label">State:</span>
                            <span>${businessData.state || 'N/A'}</span>
                        </div>
                        <div class="info-row">
                            <span class="label">Monthly Revenue:</span>
                            <span>$${businessData.monthlyRevenue ? businessData.monthlyRevenue.toLocaleString() : 'N/A'}</span>
                        </div>
                        <div class="info-row">
                            <span class="label">FICO Score:</span>
                            <span>${businessData.fico || 'N/A'}</span>
                        </div>
                        <div class="info-row">
                            <span class="label">Time in Business:</span>
                            <span>${businessData.tib ? businessData.tib + ' months' : 'N/A'}</span>
                        </div>
                        <div class="info-row">
                            <span class="label">Requested Position:</span>
                            <span>${businessData.position || businessData.requestedPosition || 'N/A'}</span>
                        </div>
                        <div class="info-row">
                            <span class="label">Negative Days:</span>
                            <span>${businessData.negativeDays !== undefined ? businessData.negativeDays : 'N/A'}</span>
                        </div>
                    </div>
                    
                    ${documentsHtml}
                    
                    <p>This application has been pre-qualified based on your lending criteria. Please review the attached documentation and let us know if you would like to proceed with an offer.</p>
                    
                    <p>Best regards,<br>
                    <strong>MCA Command Center</strong></p>
                </div>
                
                <div class="footer">
                    <p>This email was sent from MCA Command Center automated system.</p>
                </div>
            </body>
            </html>
        `;
    }

    generateLenderEmailText(businessData, documents) {
        const documentsText = documents.length > 0 
            ? `\nAttached Documents:\n${documents.map(doc => `- ${doc.filename || doc.name || 'Document'} (${doc.type || doc.mimeType || 'PDF'})`).join('\n')}\n`
            : '\nNo documents attached\n';

        return `
NEW MCA APPLICATION SUBMISSION

Dear Lender,

We have a new Merchant Cash Advance application that matches your lending criteria. Please find the business details below:

BUSINESS INFORMATION:
- Business Name: ${businessData.businessName || 'N/A'}
- Industry: ${businessData.industry || 'N/A'}
- State: ${businessData.state || 'N/A'}
- Monthly Revenue: $${businessData.monthlyRevenue ? businessData.monthlyRevenue.toLocaleString() : 'N/A'}
- FICO Score: ${businessData.fico || 'N/A'}
- Time in Business: ${businessData.tib ? businessData.tib + ' months' : 'N/A'}
- Requested Position: ${businessData.position || businessData.requestedPosition || 'N/A'}
- Negative Days: ${businessData.negativeDays !== undefined ? businessData.negativeDays : 'N/A'}
${documentsText}
This application has been pre-qualified based on your lending criteria. Please review the attached documentation and let us know if you would like to proceed with an offer.

Best regards,
MCA Command Center

---
This email was sent from MCA Command Center automated system.
        `;
    }

    async sendBulkLenderSubmissions(lenders, businessData, documents = []) {
        const results = [];
        const errors = [];

        for (const lender of lenders) {
            try {
                const result = await this.sendLenderSubmission(lender.email, businessData, documents);
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
}

module.exports = EmailService;