// services/fcsService.js - FIXED: Uses Service Account Client strictly

const fs = require('fs').promises;
const path = require('path');
const AWS = require('aws-sdk');
const { DocumentProcessorServiceClient } = require('@google-cloud/documentai');
const OpenAI = require('openai');
const { PDFDocument } = require('pdf-lib');

// Load environment variables
require('dotenv').config();

class FCSService {
    constructor() {
        // Initialize AWS S3
        this.s3 = new AWS.S3({
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            region: process.env.AWS_REGION
        });
        
        // Lazy initialization flags
        this.openai = null;
        this.documentAI = null;
        this.isOpenAIInitialized = false;
        this.isDocumentAIInitialized = false;
    }

    async initializeOpenAI() {
        if (this.isOpenAIInitialized) return;
        try {
            this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
            console.log(`✅ OpenAI initialized`);
            this.isOpenAIInitialized = true;
        } catch (error) {
            console.error('❌ OpenAI initialization failed:', error);
        }
    }
    
    async initializeDocumentAI() {
        if (this.isDocumentAIInitialized) return;

        console.log('🔄 Initializing Document AI...');

        try {
            // CRITICAL: Force REST transport to avoid gRPC issues on Railway
            process.env.GOOGLE_CLOUD_USE_REST = 'true';

            // Use the JSON key from Railway Variable
            if (process.env.GOOGLE_CREDENTIALS_JSON) {
                console.log('🔑 Using inline credentials from GOOGLE_CREDENTIALS_JSON');
                const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);

                this.documentAI = new DocumentProcessorServiceClient({
                    credentials: credentials,
                    projectId: process.env.GOOGLE_PROJECT_ID,
                    fallback: 'rest' // Explicitly fallback to REST
                });
            } else {
                throw new Error('Missing GOOGLE_CREDENTIALS_JSON variable');
            }

            // Processor Configuration
            this.projectId = process.env.GOOGLE_PROJECT_ID;
            this.location = process.env.DOCUMENT_AI_LOCATION || 'us'; // e.g. 'us' or 'eu'
            this.processorId = process.env.DOCUMENT_AI_PROCESSOR_ID; 
            
            // Construct the full resource name
            this.processorName = `projects/${this.projectId}/locations/${this.location}/processors/${this.processorId}`;

            this.isDocumentAIInitialized = true;
            console.log(`✅ Document AI initialized: ${this.processorName}`);
        } catch (error) {
            console.error('❌ Document AI initialization failed:', error.message);
            this.documentAI = null;
        }
    }

    // --- MAIN EXTRACTION METHOD (FIXED) ---
    async extractTextFromDocumentSync(document, documentBuffer = null) {
        try {
            console.log(`🔄 Processing document: ${document.filename || document.original_name}`);
            
            if (!documentBuffer) documentBuffer = await this.getDocumentBuffer(document);
            
            // Ensure client is ready
            await this.initializeDocumentAI();
            if (!this.documentAI) throw new Error('Document AI client not initialized');

            // Build Request
            const request = {
                name: this.processorName,
                rawDocument: {
                    content: documentBuffer.toString('base64'),
                    mimeType: 'application/pdf'
                },
                // Use fieldMask to only request text (saves bandwidth/time)
                fieldMask: { paths: ['text'] } 
            };

            console.log('🚀 Sending request to Document AI (Service Account)...');
            
            // Run the request
            const [result] = await this.documentAI.processDocument(request);

            if (!result || !result.document || !result.document.text) {
                throw new Error('Document AI returned no text');
            }

            const text = result.document.text;
            console.log(`✅ Extracted ${text.length} characters successfully`);
            
            // Debug: Print first 100 chars to verify it's not an error message
            console.log('📝 Text Preview:', text.substring(0, 100).replace(/\n/g, ' '));

            return text;

        } catch (error) {
            console.error('❌ Document AI Failure:', error.message);
            
            // Fallback: pdf-parse (for digital PDFs only)
            console.log('⚠️ Falling back to simple PDF parse...');
            try {
                const pdfParse = require('pdf-parse');
                const data = await pdfParse(documentBuffer);
                if (data.text && data.text.length > 50) {
                    console.log(`✅ Fallback extracted ${data.text.length} chars`);
                    return data.text;
                }
            } catch (e) { console.error('Fallback failed:', e.message); }

            // Return error string only if ALL methods fail
            return `PROCESSING ERROR: Could not extract text from ${document.filename}. Error: ${error.message}`;
        }
    }

    // --- REMAINING METHODS (Keep Logic Same) ---

    async generateAndSaveFCS(conversationId, businessName, db) {
        let analysisId = null;
        try {
            console.log(`\n🔵 Starting FCS generation for: ${businessName}`);

            // 1. Create Record
            const createResult = await db.query(`
                INSERT INTO fcs_analyses (conversation_id, status, created_at) 
                VALUES ($1, 'processing', NOW())
                ON CONFLICT (conversation_id) DO UPDATE SET status = 'processing', created_at = NOW()
                RETURNING id
            `, [conversationId]);
            analysisId = createResult.rows[0].id;

            // 2. Fetch Docs
            const docsResult = await db.query(`
                SELECT id, original_filename, s3_bucket, s3_key 
                FROM documents WHERE conversation_id = $1
            `, [conversationId]);
            
            if (docsResult.rows.length === 0) throw new Error('No documents found');
            const documents = docsResult.rows.map(d => ({ ...d, filename: d.original_filename }));

            // 3. Extract Text
            const extractedData = [];
            for (const doc of documents) {
                try {
                    const buffer = await this.getDocumentBuffer(doc);
                    const text = await this.extractTextFromDocumentSync(doc, buffer);
                    
                    // Filter out error messages so they don't confuse AI
                    if (!text.startsWith('PROCESSING ERROR')) {
                        extractedData.push({ filename: doc.filename, text });
                    }
                } catch (e) {
                    console.error(`Skipping doc ${doc.filename}:`, e.message);
                }
            }

            if (extractedData.length === 0) throw new Error('No text extracted from any documents');

            // 4. Generate Analysis
            console.log('🤖 Sending to Gemini/OpenAI...');
            const fcsAnalysis = await this.generateFCSAnalysisWithGemini(extractedData, businessName);

            // 5. Save
            const metadata = this.parseFCSMetadata(fcsAnalysis);
            await db.query(`
                UPDATE fcs_analyses SET 
                    fcs_report = $1, status = 'completed', completed_at = NOW(),
                    average_revenue = $2, state = $3, industry = $4
                WHERE id = $5
            `, [fcsAnalysis, metadata.averageRevenue, metadata.state, metadata.industry, analysisId]);

            console.log(`✅ FCS Complete! Analysis ID: ${analysisId}`);
            return { success: true, analysisId };

        } catch (error) {
            console.error('❌ FCS Failed:', error.message);
            if (analysisId) {
                await db.query(`UPDATE fcs_analyses SET status = 'failed', error_message = $1 WHERE id = $2`, [error.message, analysisId]);
            }
            throw error;
        }
    }

    async getDocumentBuffer(document) {
        if (document.s3_key) {
            const data = await this.s3.getObject({
                Bucket: document.s3_bucket || process.env.S3_DOCUMENTS_BUCKET,
                Key: document.s3_key
            }).promise();
            return data.Body;
        }
        throw new Error('Missing S3 key');
    }

    async generateFCSAnalysisWithGemini(extractedData, businessName) {
        await this.initializeOpenAI();
        const allText = extractedData.map(d => `=== ${d.filename} ===\n${d.text.substring(0, 15000)}`).join('\n\n');
        
        // Use the exact prompt you had before (condensed here for brevity)
        const prompt = `
            You are an MCA Underwriter. Analyze these bank statements for: ${businessName}.
            EXTRACTED_BUSINESS_NAME: [Name]
            
            Create a File Control Sheet (FCS).
            
            Bank Data:
            ${allText}
            
            Output strictly in Markdown. NO asterisks.
        `;

        const completion = await this.openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.2
        });

        return completion.choices[0].message.content;
    }

    parseFCSMetadata(report) {
        // Simple regex parsers
        const rev = report.match(/Average (?:True )?Revenue:\s*\$?([\d,]+)/i);
        const state = report.match(/State:\s*([A-Z]{2})/i);
        const ind = report.match(/Industry:\s*(.+)/i);
        return {
            averageRevenue: rev ? parseFloat(rev[1].replace(/,/g, '')) : 0,
            state: state ? state[1] : null,
            industry: ind ? ind[1].trim() : null
        };
    }
}

module.exports = new FCSService();
