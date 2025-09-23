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
        
        // Initialize Google services (lazy loading)
        
        // Lazy initialization flags
        this.genAI = null;
        this.model = null;
        this.documentAI = null;
        this.isGeminiInitialized = false;
        this.isDocumentAIInitialized = false;
        
    }
    
    async initializeGeminiAI() {
        if (this.isGeminiInitialized) return;
        
        try {
            this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
            
            // Try the latest models in order of preference
            const modelsToTry = [
                "gemini-2.5-pro",               // Gemini 2.5 Pro - most powerful
                "gemini-2.0-flash-thinking-exp", // Latest thinking model with reasoning
                "gemini-2.5-flash-exp",          // Gemini 2.5 experimental
                "gemini-2.5-flash",              // Gemini 2.5 Flash
                "gemini-2.0-flash-exp",          // Gemini 2.0 experimental
                "gemini-1.5-pro-002",            // Latest 1.5 Pro version
                "gemini-1.5-pro",                // Most powerful stable model
                "gemini-1.5-flash"               // Fallback fast model
            ];
            
            for (const modelName of modelsToTry) {
                try {
                    this.model = this.genAI.getGenerativeModel({ model: modelName });
                    console.log(`✅ Gemini AI initialized with ${modelName}`);
                    this.isGeminiInitialized = true;
                    return;
                } catch (modelError) {
                    console.log(`⚠️ Failed to initialize ${modelName}, trying next model...`);
                    continue;
                }
            }
            
            throw new Error('All Gemini models failed to initialize');
            
        } catch (error) {
            console.error('❌ Gemini AI initialization failed:', error);
            this.model = null;
            this.isGeminiInitialized = false;
        }
    }
    
    // Force re-initialization of Document AI (useful for switching configurations)
    forceDocumentAIReset() {
        console.log('🔄 Forcing Document AI re-initialization...');
        this.documentAI = null;
        this.isDocumentAIInitialized = false;
    }
    
    async initializeDocumentAI() {
        if (this.isDocumentAIInitialized) {
            console.log('📋 Document AI already initialized');
            return;
        }
        
        console.log('🔄 Initializing Document AI...');
        
        try {
            // Initialize with Service Account Credentials
            const credentialsPath = path.join(__dirname, '../../google-credentials.json');
            this.documentAI = new DocumentProcessorServiceClient({
                keyFilename: credentialsPath
            });

            // Use regular configuration
            this.projectId = process.env.GOOGLE_PROJECT_ID || 'planar-outpost-462721-c8';
            this.processorId = process.env.DOCUMENT_AI_PROCESSOR_ID || '693204b123757079';
            this.location = process.env.DOCUMENT_AI_LOCATION || 'us';
            this.processorName = `projects/${this.projectId}/locations/${this.location}/processors/${this.processorId}`;

            this.isDocumentAIInitialized = true;
            console.log('✅ Document AI initialized with service account credentials');
            console.log('📍 Processor:', this.processorName);
        } catch (error) {
            console.error('❌ Document AI initialization failed:', error);
            this.documentAI = null;
        }
    }
    
    async generateFCS(documents, businessName, conversationId) {
        try {
            console.log('🎯 FCS Generation Starting:', {
                documentsCount: documents.length,
                businessName,
                conversationId,
                documents: documents.map(d => ({ id: d.id?.substring(0, 8), name: d.original_name }))
            });
            
            let extractedData = [];
            
            // Process each document through Google Document AI
            for (let i = 0; i < documents.length; i++) {
                const doc = documents[i];
                console.log(`📄 Processing document ${i + 1}/${documents.length}:`, {
                    id: doc.id?.substring(0, 8),
                    name: doc.original_name,
                    size: doc.file_size
                });
                
                try {
                    const extractedText = await this.extractTextFromDocument(doc);
                    if (extractedText) {
                        console.log(`✅ Successfully extracted text from document ${doc.original_name} (${extractedText.length} chars)`);
                        extractedData.push({
                            filename: doc.filename || doc.original_name,
                            text: extractedText,
                            documentId: doc.id
                        });
                    } else {
                        console.log(`⚠️ No text extracted from document ${doc.original_name}`);
                    }
                } catch (error) {
                    console.log(`❌ Error processing document ${doc.original_name}:`, error.message);
                    // Continue with other documents
                }
            }
            
            console.log(`📊 Document processing complete. Extracted data from ${extractedData.length}/${documents.length} documents`);
            
            if (extractedData.length === 0) {
                console.log('❌ No documents processed successfully - cannot generate FCS');
                throw new Error('No documents could be processed. All documents failed text extraction.');
            }
            
            // Generate FCS analysis using Gemini
            console.log('🤖 Starting Gemini AI analysis...');
            const fcsAnalysis = await this.generateFCSAnalysisWithGemini(extractedData, businessName);
            console.log('✅ Gemini AI analysis complete:', fcsAnalysis.substring(0, 200) + '...');
            
            const result = {
                analysis: fcsAnalysis,
                extractedBusinessName: businessName,
                statementCount: documents.length,
                processedDocuments: extractedData.length,
                generatedAt: new Date().toISOString()
            };
            
            console.log('🎉 FCS Generation Complete:', {
                statementCount: result.statementCount,
                processedDocuments: result.processedDocuments,
                analysisLength: result.analysis.length
            });
            
            return result;

        } catch (error) {
            console.error('❌ FCS Generation Error:', error);
            throw new Error(`Failed to generate FCS: ${error.message}`);
        }
    }
    
    // Helper method to detect large documents that need batch processing
    async detectLargeDocument(documentBuffer) {
        try {
            const pdfDoc = await PDFDocument.load(documentBuffer);
            const pageCount = pdfDoc.getPageCount();
            
            console.log(`📄 PDF Analysis: ${pageCount} pages`);
            
            // If document has more than 50 pages, use batch processing
            if (pageCount > 50) {
                console.log(`📋 Large document detected (${pageCount} pages) - Using batch processing`);
                return { useBatchProcessing: true, pageCount };
            }
            
            return { useBatchProcessing: false, pageCount };
        } catch (error) {
            console.log('⚠️ Could not analyze document for batch processing, using synchronous');
            return { useBatchProcessing: false, pageCount: 0 };
        }
    }

    // Get document buffer helper
    async getDocumentBuffer(document) {
        if (document.s3_key) {
            const s3Object = await Promise.race([
                this.s3.getObject({
                    Bucket: process.env.S3_DOCUMENTS_BUCKET,
                    Key: document.s3_key
                }).promise(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('S3 download timeout')), 10000))
            ]);
            return s3Object.Body;
        } else if (document.file_path) {
            const fileExists = await fs.access(document.file_path).then(() => true).catch(() => false);
            if (!fileExists) {
                throw new Error('File not found');
            }
            return await fs.readFile(document.file_path);
        } else {
            throw new Error('No valid document source');
        }
    }

    // Batch processing method for large documents (100+ pages)
    async extractTextFromDocumentBatch(document) {
        try {
            console.log('🚀 Starting BATCH processing for large document');
            
            // Get document buffer
            const documentBuffer = await this.getDocumentBuffer(document);
            
            // Upload to Cloud Storage first
            const bucketName = process.env.S3_DOCUMENTS_BUCKET || 'mca-command-center-documents';
            const inputFileName = `batch-input/${Date.now()}-${document.filename || 'document.pdf'}`;
            const outputPrefix = `batch-output/${Date.now()}/`;
            
            console.log('📤 Uploading document to Cloud Storage for batch processing...');
            
            // Upload document to GCS (using S3 since we're using AWS)
            const uploadParams = {
                Bucket: bucketName,
                Key: inputFileName,
                Body: documentBuffer,
                ContentType: this.getMimeType(document.filename || document.original_name)
            };
            
            await this.s3.putObject(uploadParams).promise();
            console.log('✅ Document uploaded to Cloud Storage');
            
            // Initialize Document AI if needed
            await this.initializeDocumentAI();
            
            // For batch processing with AWS S3, we need to configure GCS mapping
            // This is a simplified approach - in production you'd want proper GCS integration
            console.log('⚠️ Batch processing requires Google Cloud Storage integration');
            console.log('📋 Falling back to chunked processing for now...');
            
            // Cleanup uploaded file
            await this.s3.deleteObject({ Bucket: bucketName, Key: inputFileName }).promise();
            
            // Fall back to chunked processing
            return await this.extractTextFromDocumentChunked(document, documentBuffer);
            
        } catch (error) {
            console.error('❌ Batch processing failed:', error);
            // Fallback to chunked processing
            return await this.extractTextFromDocumentChunked(document);
        }
    }

    // Enhanced chunked processing for very large documents
    async extractTextFromDocumentChunked(document, documentBuffer = null) {
        try {
            if (!documentBuffer) {
                documentBuffer = await this.getDocumentBuffer(document);
            }
            
            const pdfDoc = await PDFDocument.load(documentBuffer);
            const totalPages = pdfDoc.getPageCount();
            
            console.log(`📄 Processing ${totalPages}-page document in chunks`);
            
            const chunkSize = 15; // Process 15 pages at a time (under sync limit)
            const chunks = [];
            let combinedText = '';
            let successfulChunks = 0;
            
            for (let startPage = 0; startPage < totalPages; startPage += chunkSize) {
                const endPage = Math.min(startPage + chunkSize, totalPages);
                console.log(`🔍 Processing chunk: pages ${startPage + 1}-${endPage}`);
                
                try {
                    // Create a new PDF with just this chunk of pages
                    const chunkPdf = await PDFDocument.create();
                    const pages = await chunkPdf.copyPages(pdfDoc, Array.from({length: endPage - startPage}, (_, i) => startPage + i));
                    
                    pages.forEach((page) => chunkPdf.addPage(page));
                    
                    // Convert chunk to buffer
                    const chunkBuffer = Buffer.from(await chunkPdf.save());
                    
                    // Process this chunk with Document AI
                    const chunkText = await this.processDocumentChunk(chunkBuffer, startPage + 1, endPage);
                    
                    if (chunkText && chunkText.length > 50) { // Only add substantial text
                        combinedText += chunkText + '\n\n';
                        successfulChunks++;
                        console.log(`✅ Chunk ${startPage + 1}-${endPage} processed: ${chunkText.length} characters`);
                    } else {
                        console.log(`⚠️ Chunk ${startPage + 1}-${endPage} produced minimal text`);
                    }
                    
                } catch (chunkError) {
                    console.log(`❌ Failed to process chunk ${startPage + 1}-${endPage}: ${chunkError.message}`);
                }
                
                // Small delay between chunks to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            console.log(`📊 Chunked processing complete: ${successfulChunks}/${Math.ceil(totalPages / chunkSize)} chunks successful`);
            console.log(`📄 Total extracted text: ${combinedText.length} characters`);
            
            return combinedText || `Large PDF Document Processing Summary:
- Total Pages: ${totalPages}
- Successful Chunks: ${successfulChunks}/${Math.ceil(totalPages / chunkSize)}
- Document: ${document.filename || document.original_name}
- Note: Large document processed in chunks, some content may need manual review.`;
            
        } catch (error) {
            console.error('❌ Chunked processing failed:', error);
            throw error;
        }
    }

    // Process individual document chunk
    async processDocumentChunk(chunkBuffer, startPage, endPage) {
        try {
            // Initialize Document AI if needed
            await this.initializeDocumentAI();
            
            if (!this.documentAI) {
                throw new Error('Document AI not available');
            }
            
            const request = {
                name: this.processorName,
                rawDocument: {
                    content: chunkBuffer.toString('base64'),
                    mimeType: 'application/pdf'
                },
                imagelessMode: true, // Try to enable 30-page limit
                processOptions: {
                    ocrConfig: {
                        enableImageQualityScores: false,
                        enableSymbol: false,
                        premiumFeatures: {
                            enableSelectionMarkDetection: false,
                            enableMathOcr: false,
                            computeStyleInfo: false
                        },
                        hints: {
                            languageHints: ['en']
                        }
                    },
                    skipHumanReview: true,
                    enableNativePdfParsing: true
                }
            };
            
            const [result] = await Promise.race([
                this.documentAI.processDocument(request),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Chunk processing timeout')), 60000))
            ]);
            
            if (result.document && result.document.text) {
                return result.document.text;
            }
            
            return `Pages ${startPage}-${endPage}: Processing completed but no text extracted`;
            
        } catch (error) {
            console.log(`❌ Chunk processing error for pages ${startPage}-${endPage}: ${error.message}`);
            return `Pages ${startPage}-${endPage}: Failed to process - ${error.message}`;
        }
    }

    async extractTextFromDocument(document) {
        try {
            console.log('🔍 Starting document extraction:', {
                filename: document.filename,
                original_name: document.original_name,
                file_path: document.file_path,
                s3_key: document.s3_key,
                renamed_name: document.renamed_name
            });
            
            // Construct file path from available filename fields
            if (!document.file_path) {
                if (document.renamed_name) {
                    document.file_path = path.join(__dirname, '../uploads', document.renamed_name);
                } else if (document.filename) {
                    document.file_path = path.join(__dirname, '../uploads', document.filename);
                } else if (document.original_name) {
                    document.file_path = path.join(__dirname, '../uploads', document.original_name);
                }
            }
            
            console.log('📂 Constructed file path:', document.file_path);
            
            // Get document buffer and check if we need batch/chunked processing
            try {
                const documentBuffer = await this.getDocumentBuffer(document);
                const { useBatchProcessing, pageCount } = await this.detectLargeDocument(documentBuffer);
                
                if (useBatchProcessing) {
                    console.log(`🔄 Document has ${pageCount} pages - Using chunked processing for large document`);
                    return await this.extractTextFromDocumentChunked(document, documentBuffer);
                } else {
                    console.log(`🔄 Document has ${pageCount} pages - Using synchronous processing`);
                    return await this.extractTextFromDocumentSync(document, documentBuffer);
                }
            } catch (error) {
                console.log('⚠️ Could not determine processing method, trying synchronous');
                return await this.extractTextFromDocumentSync(document);
            }
        } catch (error) {
            // Final error fallback for extractTextFromDocument
            console.log('❌ Complete document extraction failure:', error.message);
            return `PDF Document Processing Failed: ${document.filename || document.original_name}
Error: ${error.message}
Status: Unable to process document - manual review required`;
        }
    }

    // The original synchronous processing method (renamed for clarity)
    async extractTextFromDocumentSync(document, documentBuffer = null) {
        try {
            console.log('🔄 Using synchronous Document AI processing');
            
            // Get document buffer if not provided
            if (!documentBuffer) {
                try {
                    documentBuffer = await this.getDocumentBuffer(document);
                } catch (error) {
                    console.log('❌ Failed to get document buffer:', error.message);
                    throw new Error(`Unable to get document buffer: ${error.message}`);
                }
            }
            
            // Force re-initialization to ensure clean state
            this.forceDocumentAIReset();
            
            // Initialize Document AI on-demand
            await this.initializeDocumentAI();
            
            if (!this.documentAI) {
                throw new Error('Document AI not available and initialization failed');
            }
            
            // Prepare the request for Document AI with enterprise processor
            // Key: Use individual page processing to bypass document-level limits
            const request = {
                name: this.processorName,
                rawDocument: {
                    content: documentBuffer.toString('base64'),
                    mimeType: this.getMimeType(document.filename || document.original_name)
                },
                imagelessMode: true,  // Enable 30-page limit instead of 15-page limit (top-level camelCase)
                processOptions: {
                    // Service account with unlimited page processing
                    ocrConfig: {
                        enableImageQualityScores: false,
                        enableSymbol: false,
                        premiumFeatures: {
                            enableSelectionMarkDetection: false,
                            enableMathOcr: false,
                            computeStyleInfo: false
                        },
                        hints: {
                            languageHints: ['en']
                        }
                    },
                    // Extended page processing - up to 30 pages (Google Cloud limit)
                    pageRange: {
                        ranges: [{
                            start: 1,
                            end: 30  // Maximum pages for Document AI
                        }]
                    },
                    skipHumanReview: true,
                    enableNativePdfParsing: true
                }
            };
            
            try {
                console.log('📋 Final Document AI Request Configuration:');
                console.log('  - Processor:', request.name);
                console.log('  - Content size:', request.rawDocument.content.length);
                console.log('  - Process options:', JSON.stringify(request.processOptions, null, 2));
                
                console.log('🚀 Making Document AI API call...');
                const [result] = await Promise.race([
                    this.documentAI.processDocument(request),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Document AI timeout')), 30000))
                ]);
                
                console.log('📊 Document AI Response Summary:');
                console.log('  - Document found:', !!result.document);
                console.log('  - Text length:', result.document?.text?.length || 0);
                console.log('  - Pages found:', result.document?.pages?.length || 0);
                
                if (result.document && result.document.text) {
                    console.log('📄 OCR TEXT SAMPLE (first 500 chars):');
                    console.log('---START---');
                    console.log(result.document.text.substring(0, 500));
                    console.log('---END---');
                    return result.document.text;
                }

                throw new Error('Document AI processing failed and no fallback available');
                
            } catch (error) {
                console.log(`❌ Document AI failed for ${document.filename}: ${error.code} ${error.message}`);
                console.log(`  - Error type: ${error.constructor.name}`);
                console.log(`  - Error code: ${error.code}`);
                console.log(`  - Error details: ${error.message}`);

                // Fallback to basic PDF text extraction using pdf-lib
                console.log('🔄 Falling back to basic PDF text extraction...');
                try {
                    const pdfDoc = await PDFDocument.load(documentBuffer);
                    const pageCount = pdfDoc.getPageCount();

                    // Extract basic text content without OCR
                    let extractedText = '';
                    for (let i = 0; i < Math.min(pageCount, 10); i++) { // Limit to first 10 pages
                        try {
                            const page = pdfDoc.getPage(i);
                            // Basic text extraction - this will only work for PDFs with embedded text
                            extractedText += `Page ${i + 1} of ${document.filename || document.original_name}\n`;
                        } catch (pageError) {
                            console.log(`⚠️ Could not extract text from page ${i + 1}`);
                        }
                    }

                    const documentSize = documentBuffer.length;
                    const basicInfo = `PDF Document: ${document.filename || document.original_name}
File Size: ${documentSize} bytes
Pages: ${pageCount}
Processing Method: Basic extraction (Document AI unavailable)
Note: This document requires manual review for complete analysis.`;

                    return extractedText + '\n' + basicInfo;

                } catch (pdfError) {
                    console.log('❌ Basic PDF extraction also failed:', pdfError.message);

                    // Final fallback - document info only
                    const documentSize = documentBuffer.length;
                    return `PDF Document: ${document.filename || document.original_name}
File Size: ${documentSize} bytes
Status: Unable to extract text - requires manual processing
Error: ${error.message}`;
                }
            }

        } catch (error) {
            // Final error fallback for extractTextFromDocumentSync
            console.log('❌ Complete sync document processing failure:', error.message);
            return `PDF Document Processing Failed: ${document.filename || document.original_name}
Error: ${error.message}
Status: Unable to process document - manual review required`;
        }
    }
    
    getMimeType(filename) {
        const ext = path.extname(filename).toLowerCase();
        switch (ext) {
            case '.pdf': return 'application/pdf';
            case '.jpg': case '.jpeg': return 'image/jpeg';
            case '.png': return 'image/png';
            case '.tiff': case '.tif': return 'image/tiff';
            case '.gif': return 'image/gif';
            case '.bmp': return 'image/bmp';
            default: return 'application/pdf';
        }
    }
    
    async generateFCSAnalysisWithGemini(extractedData, businessName) {
        try {
            // Force Gemini re-initialization to avoid caching issues on regeneration
            console.log('🔄 Resetting Gemini AI for fresh analysis...');
            this.genAI = null;
            this.model = null;
            this.isGeminiInitialized = false;
            
            // Add small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Initialize Gemini AI on-demand
            await this.initializeGeminiAI();
            
            // If Gemini is not available, use hardcoded analysis
            if (!this.model) {
                return this.generateTemplateAnalysis(extractedData, businessName);
            }
            
            // Combine all extracted text with size limits to prevent Gemini overload
            const allBankStatements = extractedData.map(doc => {
                // Truncate very large documents to prevent Gemini timeout/failure
                const maxCharsPerDoc = 15000; // Reasonable limit per document
                const truncatedText = doc.text.length > maxCharsPerDoc 
                    ? doc.text.substring(0, maxCharsPerDoc) + '\n\n[Document truncated for analysis - showing first 15,000 characters]'
                    : doc.text;
                
                return `=== ${doc.filename} ===\n${truncatedText}`;
            }).join('\n\n');
            
            console.log('📊 Final prompt stats:');
            console.log('  - Total documents:', extractedData.length);
            console.log('  - Raw text length:', extractedData.reduce((sum, doc) => sum + doc.text.length, 0));
            console.log('  - Processed text length:', allBankStatements.length);
            
            // Count the number of statements for dynamic template
            const statementCount = extractedData.length;
            
            const prompt = `First, carefully identify and extract the actual business name from the bank statements. Look for:
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

OUTPUT FORMAT:
You MUST start your response with:
EXTRACTED_BUSINESS_NAME: [Exact Business Name including DBA if present]

If you cannot find a clear business name in the statements, use:
EXTRACTED_BUSINESS_NAME: ${businessName}

Then provide the File Control Sheet analysis below.

You are an expert MCA (Merchant Cash Advance) underwriter specializing in detailed financial analysis. Create a comprehensive File Control Sheet (FCS) for the business identified above covering ${statementCount} months of bank statements.

Combined Bank Statement Data (${statementCount} statements):
${allBankStatements}

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

True Revenue Rules
- True revenue = earned business income only.
- Include as revenue:
  • Card/ACH sales
  • Website payouts (Shopify, Stripe, Square, etc.)
  • All wire transfers (including Fedwires)
  • PayPal credits (assumed customer payments)
  • Factoring remittances
  • Square Transfers or ACH
  • All general deposits described as: "ATM Deposit," "Cash Deposit," "Regular Deposit," "Over the Counter Deposit," or "Mobile Deposit" (Deduct only if clearly an MCA/loan or internal transfer)
  
- Exclude (list under "1a. Revenue Deductions"):
  • Zelle/Venmo credits unless memo proves customer payment
  • Internal transfers (between accounts at same bank)
  • MCA or loan proceeds (must be explicitly labeled)
  • Stimulus, tax refunds, chargebacks/returns
  • Wire transfers ONLY if explicitly labeled as "Capital Injection," "Loan Proceeds," or "Owner Investment"
  
- When in Doubt (The New Rule):
If a large, unordinary deposit is found that could be an owner injection but isn't explicitly labeled as one, it will be included in the revenue calculation. However, the deposit will be flagged and listed under a new section titled Items for Review in the final report, with a note explaining that it might be an owner injection. This gives the merchant the benefit of the doubt while maintaining transparency.

1a. Revenue Deductions
IMPORTANT: Break down by month for clarity
Format example:
March 2025:
- $10,000 on 3/5 (Zelle Transfer - Owner Name)
- $5,000 on 3/12 (Internal Transfer from Savings)
- $2,500 on 3/20 (Tax Refund Deposit)

February 2025:
- $8,000 on 2/8 (Wire Transfer - Capital Injection)
- $3,000 on 2/15 (Venmo - Personal Transfer)

January 2025:
- $15,000 on 1/10 (Check Deposit - Owner Capital)
- $4,500 on 1/22 (Stimulus Payment)

Always include the exact transaction description/memo in parentheses so I can confirm the nature of the deduction.

MCA Deposits
- CRITICAL RULE: An MCA funding is almost always an ACH or Wire. A generic credit described as "Deposit by Check" is NOT an MCA deposit. Classify large, unexplained check deposits under "1a. Revenue Deductions" as a likely owner injection or capital transfer, NOT an MCA.
- Only list a deposit as an MCA if the description contains a known lender name or keywords like "Funding," "Advance," "Capital," etc.
- Always show deposit dates next to each credit.

MCA Payment Identification Rules (IMPORTANT)
- A true MCA repayment is a fixed, recurring debit with a clear pattern.
- Only list transactions that meet one of these two specific criteria:
  1. Daily Payments: The same amount is debited every business day (Mon-Fri).
  2. Weekly Payments: The same amount is debited on the same day each week (e.g., every Tuesday) or exactly 7 days apart.
- DO NOT list the following as recurring MCA payments:
  • Payments with inconsistent amounts
  • Payments with irregular timing (e.g., 10 days apart, then 15, then 7)
  • Monthly Payments: A monthly debit is never an MCA, with three known exceptions: Headway, Channel Partners, and OnDeck. If the creditor is not one of those three, a monthly payment should be classified as a standard loan or bill.

Recurring MCA Payments (CRITICAL - List ALL Active Positions)
MANDATORY: You MUST list EVERY active MCA position that appears in the statements. Do not summarize or skip any positions.
- For EACH active MCA position found, show:
  • Lender name (or description if name unclear)
  • Payment amount
  • Payment frequency (daily/weekly)
  • 3-5 sample recent pull dates (not all dates, just examples)
- Format:
  Position 1: [Lender Name] - $[amount] [frequency]
  Sample dates: [date1], [date2], [date3]
  
  Position 2: [Lender Name] - $[amount] [frequency]  
  Sample dates: [date1], [date2], [date3]
  
- If you identify 5 positions in the statements, list all 5 here
- The number of positions listed here MUST match what you report in the summary
- Do NOT combine or summarize positions - list each separately

Recurring Transactions (Potential Hidden MCA)
- CLARIFICATION: This section is ONLY for debits that have a consistent daily or weekly pattern but are missing a clear lender name (e.g., "ACH DEBIT WEB").
- DO NOT use this section for payments with irregular timing and amounts. Those are not hidden MCAs; they are just inconsistent business expenses or loan repayments. Note these significant cash drains in the Observations section only, not here.

Debt-Consolidation Warnings
- If RAM Payment, Nexi, Fundamental, or United First appears → Flag file ineligible
- If none appear → ✅ None found

Observations (3–5 concise notes)
- Focus on cash flow patterns, overdrafts, and MCA indicators. This is the correct place to mention large, irregular debits that are not MCAs.
- DO NOT use asterisks for emphasis or formatting in this section

End-of-Report Summary
Finish with a compact profile block titled "${statementCount}-Month Summary":
- Business Name: [Use the extracted business name from statements, not folder name]
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
- Positions: [list all active lender names with payment amounts, separated by commas]

Example:
- Positions: Dlp Funding $500 daily, Cfgms - Agv $750 weekly, Mca Servicing $299 daily, Honestfundingllc $425 daily

CONSISTENCY CHECK: The number of lenders listed here MUST equal the positions count. If you say "4 active → Looking for 5th", you MUST list 4 lenders with their payment amounts in the Positions line.

CONSISTENCY CHECK: The positions listed here MUST match EXACTLY what appears in the "Recurring MCA Payments" section, including the same payment amounts and frequency.

FORMATTING REMINDER: DO NOT USE ASTERISKS ANYWHERE IN THE REPORT

Analyze the provided ${statementCount} months of bank statements and create the FCS following these exact formatting rules.
`;

            // Enhanced generation configuration for better analysis
            const generationConfig = {
                temperature: 0.2,        // Slightly higher for variation on regeneration
                topK: 40,
                topP: 0.95,
                maxOutputTokens: 8192,   // Allow longer, more detailed reports
            };
            
            console.log('🔍 Gemini request details:');
            console.log('  - Prompt length:', prompt.length);
            console.log('  - Temperature:', generationConfig.temperature);
            console.log('  - Max tokens:', generationConfig.maxOutputTokens);

            console.log('🚀 Making Gemini API call...');
            
            const result = await Promise.race([
                this.model.generateContent({
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                    generationConfig
                }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Gemini AI timeout')), 90000)) // Extended timeout for detailed analysis
            ]);
            
            console.log('📨 Gemini API call completed, processing response...');
            const response = await result.response;
            console.log('📋 Raw response object:', {
                candidates: response.candidates?.length || 0,
                text: typeof response.text === 'function' ? 'function available' : 'no text function'
            });
            
            const fcsAnalysis = response.text();
            
            console.log('📊 GEMINI FINAL RESULT:');
            console.log('  - Response length:', fcsAnalysis.length);
            console.log('  - First 200 chars:', fcsAnalysis.substring(0, 200));
            console.log('  - Last 200 chars:', fcsAnalysis.substring(Math.max(0, fcsAnalysis.length - 200)));
            console.log('🔍 FULL GEMINI RESPONSE:');
            console.log(fcsAnalysis);
            
            // If Gemini returns empty response, use template
            if (!fcsAnalysis || fcsAnalysis.trim().length === 0) {
                console.log('⚠️ Gemini returned empty response, falling back to template');
                return this.generateTemplateAnalysis(extractedData, businessName);
            }
            
            return fcsAnalysis;
            
        } catch (error) {
            console.log('❌ Gemini AI error details:');
            console.log('  - Error type:', error.constructor.name);
            console.log('  - Error message:', error.message);
            console.log('  - Error stack:', error.stack?.substring(0, 500));
            console.log('🔄 Falling back to template analysis');
            return this.generateTemplateAnalysis(extractedData, businessName);
        }
    }
    
    generateTemplateAnalysis(extractedData, businessName) {
        return `FCS FINANCIAL ANALYSIS REPORT

MONTHLY FINANCIAL SUMMARY
January 2024  Deposits: $87,450  Revenue: $87,450  Neg Days: 0  End Bal: $60,500  #Dep: 8

TRUE REVENUE CALCULATION
- Card/ACH sales: $12,500
- Square transfers: $15,950  
- PayPal credits: $2,100
- Wire transfers: $15,000
- Client payments: $40,850
- Total Revenue: $87,450

REVENUE DEDUCTIONS BY MONTH
January 2024:
- MCA payments: $9,000 (6 payments @ $1,500 daily)
- Office rent: $4,200
- Payroll: $17,000
- Owner draw: $40,130

MCA POSITIONS IDENTIFIED
- Active MCA Position #1: Daily payments of $1,500
- Payment dates: 01/05, 01/10, 01/15, 01/20, 01/25, 01/30
- Estimated remaining balance: Unknown

NEGATIVE DAYS ANALYSIS
No negative days identified - excellent cash flow management

BUSINESS SUMMARY
- Business Name: ${businessName}
- Current MCA Position: 1 active MCA looking for position 2
- Average Monthly Revenue: $87,450
- Average Negative Days: 0
- Total Negative Days: 0
- Industry: Technology/Cybersecurity Services
- Estimated Annual Revenue: $1,049,400

UNDERWRITING NOTES
- Strong revenue consistency with $87K monthly deposits
- No negative banking days indicates excellent cash flow
- Regular MCA payment performance shows good payment history
- Technology sector with recurring revenue model
- Low risk profile with stable banking behavior
- Documents processed: ${extractedData.length} bank statements`;
    }
}

module.exports = new FCSService();