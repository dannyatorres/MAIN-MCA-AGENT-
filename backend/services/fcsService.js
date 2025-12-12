// services/fcsService.js - FIXED: Uses Service Account Client strictly

const fs = require('fs').promises;
const path = require('path');
const AWS = require('aws-sdk');
const { DocumentProcessorServiceClient } = require('@google-cloud/documentai');
const { GoogleGenerativeAI } = require('@google/generative-ai');
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
        this.isGeminiInitialized = false;
        this.isDocumentAIInitialized = false;
        this.openAIModel = process.env.OPENAI_MODEL || 'gpt-4.1';
        this.geminiModel = process.env.GEMINI_MODEL || 'gemini-3-pro-preview-11-2025';
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

                // 🛡️ SMART CHECK: If it doesn't start with '{', it's Base64. Decode it.
                if (!rawEnv.startsWith('{')) {
                    console.log('🔑 Detected Base64 credentials - Decoding...');
                    const buffer = Buffer.from(rawEnv, 'base64');
                    rawEnv = buffer.toString('utf-8');
                }

                console.log('🔑 Parsing credentials JSON...');
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

            // 5. Parse Metadata
            const metadata = this.parseFCSMetadata(fcsAnalysis);

            // 6. 🆕 Calculate Withholding using the helper
            const withholdingPct = calculateWithholding(fcsAnalysis, metadata.averageRevenue);
            console.log(`🧮 Calculated Withholding: ${withholdingPct}%`);

            // 7. Save to Database
            await db.query(`
                UPDATE fcs_analyses SET
                    fcs_report = $1, status = 'completed', completed_at = NOW(),
                    average_revenue = $2, state = $3, industry = $4,
                    withholding_percentage = $5
                WHERE id = $6
            `, [fcsAnalysis, metadata.averageRevenue, metadata.state, metadata.industry, withholdingPct, analysisId]);

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
        await this.initializeGemini();
        await this.initializeOpenAI(); // fallback if Gemini unavailable
        
        // Prepare the data
        // Truncate individual files to avoid context limits, but keep enough for analysis
        const allText = extractedData.map(d => `=== ${d.filename} ===\n${d.text.substring(0, 25000)}`).join('\n\n');
        const statementCount = extractedData.length;
        
        // --- UPDATED PROMPT (Your Exact n8n Logic) ---
        const prompt = `
            First, carefully identify and extract the actual business name from the bank statements. Look for:
            1. Business name at the top of statements
            2. Account holder name fields
            3. Look for "DBA" or "d/b/a" designations in the statements
            4. Company names in transaction descriptions
            5. Any recurring business entity names

            If you find a DBA designation, include it in the extracted name.
            Examples:
            - "Danny Torres Inc DBA Project Capital"
            - "ABC Corp DBA Quick Services"
            - "John Smith DBA Smith's Auto Repair"

            MULTIPLE ACCOUNTS HANDLING:
            If the bank statements contain multiple accounts (checking, savings, credit cards, etc.):
            1. Create Monthly Financial Summary tables for ALL accounts back-to-back at the top
            Format:
            CHECKING ACCOUNT ...1234
            Month Year  Deposits: $amount  Revenue: $amount  Neg Days: #  End Bal: $amount  #Dep: #
            [rows for checking]

            SAVINGS ACCOUNT ...5678
            Month Year  Deposits: $amount  Revenue: $amount  Neg Days: #  End Bal: $amount  #Dep: #
            [rows for savings]

            2. After all tables, provide the analysis sections (Revenue Deductions, Items for Review, MCA Deposits, etc.) for each account separately
            3. Label each analysis section clearly:
            === CHECKING ACCOUNT ...1234 ANALYSIS ===
            1a. Revenue Deductions
            [deductions for this account]
            ...
            === SAVINGS ACCOUNT ...5678 ANALYSIS ===
            [repeat all sections for next account]

            4. Create a separate summary block for each account at the end
            If only one account exists, proceed normally without mentioning multiple accounts.

            OUTPUT FORMAT:
            You MUST start your response with:
            EXTRACTED_BUSINESS_NAME: [Exact Business Name including DBA if present]

            If you cannot find a clear business name in the statements, use:
            EXTRACTED_BUSINESS_NAME: ${businessName}

            Then provide the File Control Sheet analysis below.

            You are an expert MCA (Merchant Cash Advance) underwriter specializing in detailed financial analysis. Create a comprehensive File Control Sheet (FCS) for the business identified above covering ${statementCount} months of bank statements.

            Combined Bank Statement Data (${statementCount} statements):
            ${allText}

            Output Workflow
            - Return a clean File-Control-Sheet (FCS) inside one triple-backtick code block.
            - DO NOT use any asterisks anywhere in the report - not for emphasis, not for bullet points, not for any formatting

            Underwriting Section Breakdown

            Monthly Financial Summary
            Use consistent column spacing to ensure headers align vertically:
            Month Year  Deposits: $amount  Revenue: $amount  Neg Days: #  End Bal: $amount  #Dep: #

            Example with proper column alignment:
            Jul 2025   Deposits: $10,955   Revenue: $10,955   Neg Days: 6   End Bal: $8,887    #Dep: 3
            Jun 2025   Deposits: $4,196    Revenue: $4,196    Neg Days: 7   End Bal: -$2,053   #Dep: 12
            May 2025   Deposits: $7,940    Revenue: $7,940    Neg Days: 0   End Bal: $14       #Dep: 9

            CRITICAL: Each column header (Deposits:, Revenue:, Neg Days:, End Bal:, #Dep:) must start at the same character position on every line. Use spaces to pad shorter values so columns align vertically.

            Negative Days Extraction Rules
            - A negative day = when account's END-OF-DAY balance is below $0.00
            - One day = Maximum one negative day count (even if balance goes negative multiple times that day)
            - Data source priority:
              1. Use "Daily Balance" or "Summary of Daily Balances" section if available (most reliable)
              2. If no daily balance section: use the LAST transaction balance of each day
            - CRITICAL: Report "N/A" when:
              • Daily balances are unclear or ambiguous
              • Cannot determine definitive end-of-day balances
              • Multiple transactions without clear ending balances
              • Gaps in dates make tracking impossible
              • Would require making assumptions about balances
            - Never hallucinate or estimate negative days - use "N/A" rather than guess
            - Count weekends/holidays as negative if they remain negative throughout
            - Only count if ending balance < $0.00 (balance of exactly $0.00 is NOT negative)

            True Revenue Rules - SIMPLIFIED DECISION TREE
            (Use the logic: Exclude MCA/Lender deposits, Exclude explicitly labeled non-revenue, Exclude internal transfers. Include large unlabeled wires in "Items for Review" but count as revenue.)

            ZELLE/PEER-TO-PEER REVENUE SHORTCUT:
            If Zelle/Venmo/CashApp represents the majority of deposits (>80%):
            - Count all peer-to-peer deposits as revenue (unless clearly personal/loan related)
            - DO NOT list each individual Zelle transaction
            - Instead, add a summary note after Monthly Financial Summary.

            1a. Revenue Deductions
            IMPORTANT: This section is ONLY for deposits that were EXCLUDED from the revenue calculation.
            Format - Break down by month for clarity:
            March 2025:
            - $10,000 on 3/5 (Zelle Transfer - Owner Name)
            Always include the exact transaction description/memo in parentheses.

            Items for Review (Large Deposits Included in Revenue)
            PURPOSE: Flag large, unusual deposits that were INCLUDED in revenue but lack clear business context.
            Format:
            October 2025:
            - $31,525.00 on 10/10 (Wire Transfer Ref Number = 005938) - Included in revenue but could be owner injection/loan proceeds

            MCA Deposits
            PURPOSE: List all MCA funding deposits found in the statements.
            Format:
            - $50,250.00 on 09/17/2025 (Fedwire Credit Via: Bankunited N.A/267090594 B/O: Stage Advance LLC)

            Recurring MCA Payments (CRITICAL - List ALL Active Positions)
            MANDATORY: You MUST list EVERY active MCA position.
            Format:
            Position 1: [Lender Name] - $[amount] [frequency]
            Last pull: [MM/DD/YY] - Status: [Active / Stopped / Paid off]

            Recent MCA Activity Analysis (Renewal Detection)
            PURPOSE: Cross-reference MCA deposits with payment patterns.
            Format for positions WITH payments:
            - [Lender Name]: $[amount] funded [date] | Payments: $[amount] [frequency] (Last pull: [date]) - [STATUS FLAG]
              Reason: [Explain why this status was assigned]

            Observations (3–5 concise notes)
            Focus on cash flow, overdrafts, stacking, and anomalies.
            DO NOT use asterisks.

            End-of-Report Summary
            Finish with a compact profile block titled "${statementCount}-Month Summary":
            
            ${statementCount}-Month Summary
            - Business Name: [Extracted Name]
            - Position (ASSUME NEXT): e.g. 2 active → Looking for 3rd
            - Industry: [verify from statements]
            - Time in Business: [estimate from statements]
            - Average Deposits: [calculate from ${statementCount} months]
            - Average True Revenue: [calculate from ${statementCount} months]
            - Negative Days: [total across included months]
            - Average Negative Days: [total ÷ ${statementCount}]
            - Average Number of Deposits: [across included months]
            - Average Bank Balance: [across included months]
            - State: (example NY)
            - Positions: [list all active lender names with payment amounts]
            - Last MCA Deposit: [Amount] on [Date] from [Lender Name] OR "None found"

            CONSISTENCY CHECK: The positions listed here MUST match EXACTLY what appears in the "Recurring MCA Payments" section.
            
            FORMATTING REMINDER: DO NOT USE ASTERISKS ANYWHERE IN THE REPORT.
        `;

        // Prefer Gemini
        if (this.gemini) {
            try {
                const model = this.gemini.getGenerativeModel({ model: this.geminiModel });
                const result = await model.generateContent(prompt);
                const fcsAnalysis =
                    (result?.response && typeof result.response.text === 'function' && result.response.text()) ||
                    (result?.response?.candidates || [])
                        .map(c => (c.content?.parts || []).map(p => p.text || '').join('\n'))
                        .find(t => t && t.trim());
                if (fcsAnalysis) {
                    console.log('🤖 Generated via Gemini');
                    return fcsAnalysis;
                }
            } catch (err) {
                console.error('Gemini generation failed, falling back to OpenAI:', err.message);
            }
        }

        console.log('🤖 Sending to OpenAI...');

        const completion = await this.openai.chat.completions.create({
            model: this.openAIModel,
            messages: [{ role: "user", content: prompt }],
            temperature: 0.1 // Lower temperature for more consistent formatting
        });

        const fcsAnalysis = completion.choices[0].message.content;

        // --- Log for debugging ---
        console.log('\n=============================');
        console.log('📄 GENERATED FCS REPORT:');
        console.log('=============================');
        console.log(fcsAnalysis);
        console.log('=============================\n');

        return fcsAnalysis;
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

/**
 * 🧮 HELPER: Calculate Withholding % from Position Text
 * Logic:
 * 1. Find "Positions" section
 * 2. Extract "$X Daily" or "$Y Weekly"
 * 3. Convert to Monthly (Daily * 21)
 * 4. Divide by Revenue
 */
function calculateWithholding(fcsReportText, monthlyRevenue) {
    if (!fcsReportText || !monthlyRevenue || monthlyRevenue === 0) return 0;

    // 1. Find the "Positions" section (stops at next newline or end of string)
    // Matches: "Positions: OnDeck $500 daily, Forward $200 weekly"
    const positionsMatch = fcsReportText.match(/Positions:\s*(.+?)(?:\n|$)/i);

    // If no positions found or explicitly says "None", return 0
    if (!positionsMatch || /none|n\/a/i.test(positionsMatch[1])) return 0;

    const positionsText = positionsMatch[1];

    // 2. Regex to find amounts and frequency
    // Matches: "$500.00 daily" or "500 weekly"
    const regex = /(?:[\$])?([\d,]+\.?\d*)\s*(daily|weekly)/gi;
    const matches = [...positionsText.matchAll(regex)];

    let totalMonthlyPayment = 0;

    matches.forEach(match => {
        // match[1] = Amount (e.g. "500")
        // match[2] = Frequency (e.g. "daily")
        const amount = parseFloat(match[1].replace(/,/g, ''));
        const frequency = match[2].toLowerCase();

        if (!isNaN(amount) && amount > 0) {
            // Weekly / 5 = Daily
            const dailyRate = frequency === 'weekly' ? amount / 5 : amount;
            // Daily * 21 = Monthly
            const monthlyPayment = dailyRate * 21;

            totalMonthlyPayment += monthlyPayment;
        }
    });

    // 3. Calculate % of Revenue
    return ((totalMonthlyPayment / monthlyRevenue) * 100).toFixed(2);
}

module.exports = new FCSService();
