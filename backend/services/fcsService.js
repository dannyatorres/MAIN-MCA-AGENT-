// services/fcsService.js - FIXED: Output Cleaner Added

const fs = require('fs').promises;
const path = require('path');
const AWS = require('aws-sdk');
const { DocumentProcessorServiceClient } = require('@google-cloud/documentai');
const { GoogleGenerativeAI } = require('@google/generative-ai');
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
        this.documentAI = null;
        this.gemini = null;
        this.isGeminiInitialized = false;
        this.isDocumentAIInitialized = false;

        // Gemini Configuration
        this.geminiModel = process.env.GEMINI_MODEL || 'gemini-3-pro-preview';
    }

    async initializeGemini() {
        if (this.isGeminiInitialized) return;
        try {
            if (!process.env.GEMINI_API_KEY) {
                throw new Error('GEMINI_API_KEY not configured');
            }
            this.gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
            this.isGeminiInitialized = true;
            console.log(`✅ Gemini initialized (${this.geminiModel})`);
        } catch (error) {
            console.error('❌ Gemini initialization failed:', error.message);
            this.gemini = null;
        }
    }

    async initializeDocumentAI() {
        if (this.isDocumentAIInitialized) return;

        console.log('🔄 Initializing Document AI...');

        try {
            process.env.GOOGLE_CLOUD_USE_REST = 'true';
            let credentials;

            if (process.env.GOOGLE_CREDENTIALS_JSON) {
                let rawEnv = process.env.GOOGLE_CREDENTIALS_JSON.trim();
                if (!rawEnv.startsWith('{')) {
                    const buffer = Buffer.from(rawEnv, 'base64');
                    rawEnv = buffer.toString('utf-8');
                }
                credentials = JSON.parse(rawEnv);

                this.documentAI = new DocumentProcessorServiceClient({
                    credentials: credentials,
                    projectId: process.env.GOOGLE_PROJECT_ID,
                    fallback: 'rest'
                });
            } else {
                throw new Error('Missing GOOGLE_CREDENTIALS_JSON variable');
            }

            this.projectId = process.env.GOOGLE_PROJECT_ID;
            this.location = process.env.DOCUMENT_AI_LOCATION || 'us';
            this.processorId = process.env.DOCUMENT_AI_PROCESSOR_ID;
            this.processorName = `projects/${this.projectId}/locations/${this.location}/processors/${this.processorId}`;

            this.isDocumentAIInitialized = true;
            console.log(`✅ Document AI initialized: ${this.processorName}`);
        } catch (error) {
            console.error('❌ Document AI initialization failed:', error.message);
            this.documentAI = null;
        }
    }

    // --- MAIN EXTRACTION METHOD ---
    async extractTextFromDocumentSync(document, documentBuffer = null) {
        try {
            console.log(`🔄 Processing document: ${document.filename || document.original_name}`);

            if (!documentBuffer) documentBuffer = await this.getDocumentBuffer(document);

            await this.initializeDocumentAI();
            if (!this.documentAI) throw new Error('Document AI client not initialized');

            const request = {
                name: this.processorName,
                rawDocument: {
                    content: documentBuffer.toString('base64'),
                    mimeType: 'application/pdf'
                },
                fieldMask: { paths: ['text'] },
                processOptions: {
                    individualPageSelector: {
                        pages: Array.from({ length: 30 }, (_, i) => i + 1)
                    },
                    ocrConfig: {
                        enableImageQualityScores: false,
                        enableSymbol: false,
                        enableNativePdfParsing: true,
                        computeStyleInfo: false
                    }
                },
                skipHumanReview: true
            };

            const [result] = await this.documentAI.processDocument(request);

            if (!result || !result.document || !result.document.text) {
                throw new Error('Document AI returned no text');
            }

            const text = result.document.text;
            return text;

        } catch (error) {
            console.error('❌ Document AI Failure:', error.message);
            // Simple fallback
            try {
                const pdfParse = require('pdf-parse');
                const data = await pdfParse(documentBuffer);
                if (data.text && data.text.length > 50) return data.text;
            } catch (e) { console.error('Fallback failed:', e.message); }

            return `PROCESSING ERROR: Could not extract text from ${document.filename}. Error: ${error.message}`;
        }
    }

    async generateAndSaveFCS(conversationId, businessName, db) {
        let analysisId = null;
        try {
            console.log(`\n🔵 Starting FCS generation for: ${businessName}`);

            const createResult = await db.query(`
                INSERT INTO fcs_analyses (conversation_id, status, created_at)
                VALUES ($1, 'processing', NOW())
                ON CONFLICT (conversation_id) DO UPDATE SET status = 'processing', created_at = NOW()
                RETURNING id
            `, [conversationId]);
            analysisId = createResult.rows[0].id;

            const docsResult = await db.query(`
                SELECT id, original_filename, s3_bucket, s3_key
                FROM documents WHERE conversation_id = $1
            `, [conversationId]);

            if (docsResult.rows.length === 0) throw new Error('No documents found');
            const documents = docsResult.rows.map(d => ({ ...d, filename: d.original_filename }));

            const extractedData = [];
            for (const doc of documents) {
                try {
                    const buffer = await this.getDocumentBuffer(doc);
                    const text = await this.extractTextFromDocumentSync(doc, buffer);
                    if (!text.startsWith('PROCESSING ERROR')) {
                        extractedData.push({ filename: doc.filename, text });
                    }
                } catch (e) {
                    console.error(`Skipping doc ${doc.filename}:`, e.message);
                }
            }

            if (extractedData.length === 0) throw new Error('No text extracted from any documents');

            // 4. Generate Analysis (GEMINI ONLY)
            const fcsAnalysisRaw = await this.generateFCSAnalysis(extractedData, businessName);

            // 🧹 CLEANER: Remove markdown artifacts and echo lines
            const fcsAnalysis = this.cleanGeminiOutput(fcsAnalysisRaw);

            // 5. Extract Metrics
            const averageRevenue = extractMoneyValue(fcsAnalysis, 'Average True Revenue') || extractMoneyValue(fcsAnalysis, 'Revenue');
            const avgBalance = extractMoneyValue(fcsAnalysis, 'Average Bank Balance');
            const depositCount = extractNumberValue(fcsAnalysis, 'Average Number of Deposits');
            const negDays = extractNumberValue(fcsAnalysis, 'Negative Days');
            const avgNegDays = parseFloat(extractStringValue(fcsAnalysis, 'Average Negative Days') || '0');
            const tibText = extractStringValue(fcsAnalysis, 'Time in Business');
            const lastMca = extractStringValue(fcsAnalysis, 'Last MCA Deposit');
            const state = extractStringValue(fcsAnalysis, 'State');
            const industry = extractStringValue(fcsAnalysis, 'Industry');
            const withholdingPct = calculateWithholding(fcsAnalysis, averageRevenue);

            // 6. Save
            await db.query(`
                UPDATE fcs_analyses SET
                    fcs_report = $1,
                    status = 'completed',
                    average_revenue = $2,
                    state = $3,
                    industry = $4,
                    total_negative_days = $5,
                    average_negative_days = $6,
                    average_daily_balance = $7,
                    average_deposit_count = $8,
                    time_in_business_text = $9,
                    last_mca_deposit_date = $10,
                    withholding_percentage = $11,
                    completed_at = NOW()
                WHERE id = $12
            `, [
                fcsAnalysis, averageRevenue, state, industry, negDays, avgNegDays,
                avgBalance, depositCount, tibText, lastMca, withholdingPct, analysisId
            ]);

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

    async generateFCSAnalysis(extractedData, businessName) {
        await this.initializeGemini();

        const allText = extractedData.map(d => `=== ${d.filename} ===\n${d.text.substring(0, 25000)}`).join('\n\n');

        let promptTemplate;
        try {
            const promptPath = path.join(__dirname, '../prompts/fcs_prompt.md');
            promptTemplate = await fs.readFile(promptPath, 'utf8');
        } catch (err) {
            console.error('❌ Could not load prompt file:', err.message);
            throw new Error('Prompt file missing');
        }

        const prompt = promptTemplate
            .replace(/{{BUSINESS_NAME}}/g, businessName)
            .replace(/{{STATEMENT_COUNT}}/g, extractedData.length)
            .replace(/{{BANK_DATA}}/g, allText);

        try {
            console.log('🤖 Sending to Gemini...');
            const model = this.gemini.getGenerativeModel({ model: this.geminiModel });
            const result = await model.generateContent(prompt);
            const responseText = result.response.text();

            console.log('✅ Gemini Response Received');
            return responseText;
        } catch (err) {
            console.error('❌ Gemini Generation Failed:', err.message);
            throw new Error(`Gemini Error: ${err.message}`);
        }
    }

    // 🧹 CLEANER: Removes markdown, artifacts, AND extra vertical space
    cleanGeminiOutput(text) {
        if (!text) return '';

        let clean = text;

        // 1. Remove Markdown code block syntax (```text, ```markdown, ```)
        clean = clean.replace(/^```[a-z]*\n?/im, '').replace(/```$/im, '');

        // 2. Remove the specific "text" label if it appears alone at start
        clean = clean.replace(/^text\s*$/im, '');

        // 3. Remove the echoed header instructions
        clean = clean.replace(/Month Year\s+Deposits:.*#Dep:\s*#/gi, '');

        // 4. ⚡ TOP TRIM: Forcefully remove ALL whitespace from the very start
        // This kills the giant gap at the top
        clean = clean.replace(/^\s+/, '');

        // 5. GAP CRUSHER: Replace 3+ newlines with just 2 (Standardizes spacing elsewhere)
        clean = clean.replace(/\n{3,}/g, '\n\n');

        return clean.trim();
    }
}

/** 🛠️ HELPER FUNCTIONS */

function extractMoneyValue(text, label) {
    if (!text) return 0;
    const regex = new RegExp(`${label}:\\s*\\$?([\\d,]+\\.?\\d*)`, 'i');
    const match = text.match(regex);
    return match ? parseFloat(match[1].replace(/,/g, '')) : 0;
}

function extractNumberValue(text, label) {
    if (!text) return 0;
    const regex = new RegExp(`${label}:\\s*([\\d]+)`, 'i');
    const match = text.match(regex);
    return match ? parseInt(match[1], 10) : 0;
}

function extractStringValue(text, label) {
    if (!text) return null;
    const regex = new RegExp(`${label}:\\s*(.+?)(?:\\n|$)`, 'i');
    const match = text.match(regex);
    return match ? match[1].trim() : null;
}

function calculateWithholding(fcsReportText, monthlyRevenue) {
    if (!fcsReportText || !monthlyRevenue || monthlyRevenue === 0) return 0;
    const positionsMatch = fcsReportText.match(/Positions:\s*(.+?)(?:\n|$)/i);
    if (!positionsMatch || /none|n\/a/i.test(positionsMatch[1])) return 0;

    const positionsText = positionsMatch[1];
    const regex = /(?:[\$])?([\d,]+\.?\d*)\s*(daily|weekly)/gi;
    const matches = [...positionsText.matchAll(regex)];

    let totalMonthlyPayment = 0;
    matches.forEach(match => {
        const amount = parseFloat(match[1].replace(/,/g, ''));
        const frequency = match[2].toLowerCase();
        if (!isNaN(amount) && amount > 0) {
            const dailyRate = frequency === 'weekly' ? amount / 5 : amount;
            totalMonthlyPayment += dailyRate * 21;
        }
    });

    return ((totalMonthlyPayment / monthlyRevenue) * 100).toFixed(2);
}

module.exports = new FCSService();
