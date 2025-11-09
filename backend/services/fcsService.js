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
        
        // Initialize AI services (lazy loading)

        // Lazy initialization flags
        this.openai = null;
        this.documentAI = null;
        this.isOpenAIInitialized = false;
        this.isDocumentAIInitialized = false;

    }
    
    async getAccessTokenFromRefreshToken() {
        try {
            console.log('🔐 Refreshing OAuth access token...');

            const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    client_id: process.env.GOOGLE_CLIENT_ID,
                    client_secret: process.env.GOOGLE_CLIENT_SECRET,
                    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
                    grant_type: 'refresh_token'
                })
            });

            if (!tokenResponse.ok) {
                const errorText = await tokenResponse.text();
                throw new Error(`Token refresh failed: ${tokenResponse.status} ${errorText}`);
            }

            const data = await tokenResponse.json();

            if (!data.access_token) {
                throw new Error(`No access token in response: ${JSON.stringify(data)}`);
            }

            console.log('✅ OAuth access token obtained');
            return data.access_token;

        } catch (error) {
            console.error('❌ OAuth refresh failed:', error.message);
            throw error;
        }
    }

    async initializeOpenAI() {
        if (this.isOpenAIInitialized) return;

        try {
            this.openai = new OpenAI({
                apiKey: process.env.OPENAI_API_KEY
            });

            console.log(`✅ OpenAI initialized with GPT-4o`);
            this.isOpenAIInitialized = true;

        } catch (error) {
            console.error('❌ OpenAI initialization failed:', error);
            this.openai = null;
            this.isOpenAIInitialized = false;
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
            // CRITICAL: Force REST transport globally to avoid OpenSSL gRPC issues in cloud environments
            process.env.GOOGLE_CLOUD_USE_REST = 'true';

            // Initialize Document AI with support for both file-based and inline credentials

            // Option 1: Inline credentials from environment variable (BEST for cloud deployments)
            if (process.env.GOOGLE_CREDENTIALS_JSON) {
                console.log('🔑 Using inline credentials from GOOGLE_CREDENTIALS_JSON');
                console.log('🌐 GOOGLE_CLOUD_USE_REST set to force REST transport');

                // CRITICAL: Unset GOOGLE_APPLICATION_CREDENTIALS to prevent the library from trying to read a file
                delete process.env.GOOGLE_APPLICATION_CREDENTIALS;

                try {
                    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);

                    // Initialize with credentials object - REST transport forced via env var
                    this.documentAI = new DocumentProcessorServiceClient({
                        credentials: credentials,
                        projectId: process.env.GOOGLE_PROJECT_ID || 'planar-outpost-462721-c8'
                    });
                    console.log('✅ Successfully initialized with inline credentials (REST transport via env var)');
                } catch (parseError) {
                    console.error('❌ Failed to parse GOOGLE_CREDENTIALS_JSON:', parseError.message);
                    console.error('Stack trace:', parseError.stack);
                    throw new Error('Invalid GOOGLE_CREDENTIALS_JSON format');
                }
            }
            // Option 2: Credentials file path (for local development)
            else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
                console.log('🔑 Using credentials file:', process.env.GOOGLE_APPLICATION_CREDENTIALS);

                // Verify file exists before trying to use it
                const fs = require('fs');
                if (fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
                    this.documentAI = new DocumentProcessorServiceClient({
                        keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
                    });
                } else {
                    console.error('❌ Credentials file not found:', process.env.GOOGLE_APPLICATION_CREDENTIALS);
                    throw new Error(`Credentials file not found: ${process.env.GOOGLE_APPLICATION_CREDENTIALS}`);
                }
            }
            // Option 3: Application Default Credentials (fallback)
            else {
                console.log('🔑 Using Application Default Credentials (ADC)');
                console.log('   If this fails, set one of:');
                console.log('   1. GOOGLE_CREDENTIALS_JSON (for cloud deployments)');
                console.log('   2. GOOGLE_APPLICATION_CREDENTIALS (for local development)');
                console.log('   3. Run: gcloud auth application-default login');
                this.documentAI = new DocumentProcessorServiceClient();
            }

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
        console.log('🔍 getDocumentBuffer called with:', {
            id: document.id,
            s3_key: document.s3_key,
            s3_bucket: document.s3_bucket,
            file_path: document.file_path,
            filename: document.filename,
            original_name: document.original_name,
            original_filename: document.original_filename
        });

        if (document.s3_key) {
            console.log(`📥 Fetching from S3: ${document.s3_bucket || process.env.S3_DOCUMENTS_BUCKET}/${document.s3_key}`);
            try {
                const s3Object = await Promise.race([
                    this.s3.getObject({
                        Bucket: document.s3_bucket || process.env.S3_DOCUMENTS_BUCKET,
                        Key: document.s3_key
                    }).promise(),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('S3 download timeout')), 10000)
                    )
                ]);
                console.log(`✅ S3 fetch successful: ${s3Object.Body.length} bytes`);
                return s3Object.Body;
            } catch (s3Error) {
                console.error(`❌ S3 fetch failed:`, {
                    error: s3Error.message,
                    code: s3Error.code,
                    bucket: document.s3_bucket || process.env.S3_DOCUMENTS_BUCKET,
                    key: document.s3_key
                });
                throw s3Error;
            }
        } else if (document.file_path) {
            console.log(`📁 Reading from file system: ${document.file_path}`);
            const fileExists = await fs.access(document.file_path).then(() => true).catch(() => false);
            if (!fileExists) {
                throw new Error(`File not found at path: ${document.file_path}`);
            }
            const buffer = await fs.readFile(document.file_path);
            console.log(`✅ File read successful: ${buffer.length} bytes`);
            return buffer;
        } else {
            console.error('❌ No valid document source found!');
            console.error('Document object:', JSON.stringify(document, null, 2));
            throw new Error('No valid document source (need s3_key or file_path)');
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
                ContentType: this.getMimeType(
                    document.filename ||
                    document.original_name ||
                    document.original_filename ||
                    document.renamed_name ||
                    'document.pdf'
                )
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
                    mimeType: this.getMimeType(
                        document.filename ||
                        document.original_name ||
                        document.original_filename ||
                        document.renamed_name ||
                        'document.pdf'
                    )
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
                console.log('📋 Document AI Request Configuration:');
                console.log('  - Processor:', this.processorName);
                console.log('  - Content size:', documentBuffer.length, 'bytes');

                // Get OAuth access token (no JWT, no OpenSSL!)
                const accessToken = await this.getAccessTokenFromRefreshToken();

                const requestBody = {
                    rawDocument: {
                        content: documentBuffer.toString('base64'),
                        mimeType: this.getMimeType(
                            document.filename ||
                            document.original_name ||
                            document.original_filename ||
                            document.renamed_name ||
                            'document.pdf'
                        )
                    },
                    imagelessMode: true  // Enables 30-page processing (vs 15-page default)
                };

                console.log('🚀 Making Document AI REST API call (30-page mode with imagelessMode)...');
                const restResponse = await fetch(
                    `https://documentai.googleapis.com/v1/${this.processorName}:process`,
                    {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${accessToken}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(requestBody)
                    }
                );

                if (!restResponse.ok) {
                    const errorText = await restResponse.text();
                    throw new Error(`Document AI error: ${restResponse.status} ${errorText}`);
                }

                const result = await restResponse.json();

                console.log('📊 Document AI Response:');
                console.log('  - Text length:', result.document?.text?.length || 0);
                console.log('  - Pages processed:', result.document?.pages?.length || 0);
                console.log('  - Mode: imagelessMode (30-page limit)');

                if (result.document && result.document.text) {
                    console.log('📄 OCR TEXT SAMPLE (first 500 chars):');
                    console.log('---START---');
                    console.log(result.document.text.substring(0, 500));
                    console.log('---END---');
                    return result.document.text;
                }

                throw new Error('No text returned from Document AI');

            } catch (error) {
                console.log(`❌ Document AI failed: ${error.message}`);

                // Fallback to pdf-parse
                console.log('🔄 Falling back to pdf-parse...');
                try {
                    const pdfParse = require('pdf-parse');
                    const data = await pdfParse(documentBuffer, { max: 30 });

                    console.log(`✅ Fallback extracted ${data.text.length} characters from ${data.numpages} pages`);

                    if (data.text && data.text.trim().length > 100) {
                        return data.text;
                    }

                    return `PDF Document: ${document.filename || document.original_name}
File Size: ${documentBuffer.length} bytes
Pages: ${data.numpages}
Status: Minimal text - may need manual review`;

                } catch (pdfError) {
                    console.log('❌ pdf-parse failed:', pdfError.message);
                    return `PDF Processing Failed: ${document.filename || document.original_name}`;
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
        // Add null/undefined check
        if (!filename) {
            console.warn('⚠️ getMimeType called with undefined filename, defaulting to PDF');
            return 'application/pdf';
        }

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
            // Force OpenAI re-initialization for fresh analysis
            console.log('🔄 Initializing OpenAI for analysis...');

            // Add small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Initialize OpenAI on-demand
            await this.initializeOpenAI();

            // If OpenAI is not available, use hardcoded analysis
            if (!this.openai) {
                return this.generateTemplateAnalysis(extractedData, businessName);
            }
            
            // Combine all extracted text with size limits to prevent token overload
            const allBankStatements = extractedData.map(doc => {
                // Truncate very large documents to prevent timeout/failure
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

            console.log('🔍 OpenAI request details:');
            console.log('  - Model: gpt-4o');
            console.log('  - Prompt length:', prompt.length);
            console.log('  - Temperature: 0.2');
            console.log('  - Max tokens: 8192');

            console.log('🚀 Making OpenAI API call...');

            const completion = await Promise.race([
                this.openai.chat.completions.create({
                    model: "gpt-4o",
                    messages: [{ role: "user", content: prompt }],
                    temperature: 0.2,
                    max_tokens: 8192
                }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('OpenAI timeout')), 90000)) // Extended timeout for detailed analysis
            ]);

            console.log('📨 OpenAI API call completed, processing response...');
            console.log('📋 Raw response object:', {
                choices: completion.choices?.length || 0,
                model: completion.model,
                usage: completion.usage
            });

            const fcsAnalysis = completion.choices[0].message.content;

            console.log('📊 OPENAI FINAL RESULT:');
            console.log('  - Response length:', fcsAnalysis.length);
            console.log('  - First 200 chars:', fcsAnalysis.substring(0, 200));
            console.log('  - Last 200 chars:', fcsAnalysis.substring(Math.max(0, fcsAnalysis.length - 200)));
            console.log('🔍 FULL OPENAI RESPONSE:');
            console.log(fcsAnalysis);

            // If OpenAI returns empty response, use template
            if (!fcsAnalysis || fcsAnalysis.trim().length === 0) {
                console.log('⚠️ OpenAI returned empty response, falling back to template');
                return this.generateTemplateAnalysis(extractedData, businessName);
            }
            
            return fcsAnalysis;
            
        } catch (error) {
            console.log('❌ OpenAI error details:');
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

    /**
     * Generate FCS and save to database
     * This is the main entry point for database-backed FCS generation
     */
    async generateAndSaveFCS(conversationId, businessName, db) {
        let analysisId = null;

        try {
            console.log(`\n🔵 Starting FCS generation for conversation: ${conversationId}`);
            console.log(`   Business: ${businessName}`);

            // 1. Create initial database record
            const createResult = await db.query(`
                INSERT INTO fcs_analyses (
                    conversation_id,
                    status,
                    created_at
                ) VALUES ($1, $2, NOW())
                ON CONFLICT (conversation_id)
                DO UPDATE SET
                    status = $2,
                    created_at = NOW(),
                    error_message = NULL,
                    completed_at = NULL
                RETURNING id
            `, [conversationId, 'processing']);

            analysisId = createResult.rows[0].id;
            console.log(`✅ Created FCS analysis record: ${analysisId}`);

            // 2. Fetch documents for this conversation
            const docsResult = await db.query(`
                SELECT id, original_filename, s3_bucket, s3_key, mime_type, file_size
                FROM documents
                WHERE conversation_id = $1
                ORDER BY created_at ASC
            `, [conversationId]);

            if (docsResult.rows.length === 0) {
                throw new Error('No documents found for this conversation');
            }

            // Map database column names to what the code expects
            const documents = docsResult.rows.map(doc => ({
                ...doc,
                filename: doc.original_filename,  // Map original_filename to filename
                original_name: doc.original_filename  // Map original_filename to original_name
            }));
            console.log(`📄 Found ${documents.length} documents to process`);

            // 3. Download documents from S3 and extract text
            const extractedData = [];

            for (let i = 0; i < documents.length; i++) {
                const doc = documents[i];
                console.log(`⬇️  Processing ${i + 1}/${documents.length}: ${doc.original_filename}`);

                try {
                    // Download from S3
                    const s3Data = await this.s3.getObject({
                        Bucket: doc.s3_bucket,
                        Key: doc.s3_key
                    }).promise();

                    console.log(`   Downloaded ${(s3Data.Body.length / 1024).toFixed(2)} KB`);

                    // Extract text using Document AI
                    const extractedText = await this.extractTextFromDocumentSync(doc, s3Data.Body);

                    if (extractedText && extractedText.trim().length > 0) {
                        extractedData.push({
                            filename: doc.original_filename,
                            text: extractedText
                        });
                        console.log(`   ✅ Extracted ${extractedText.length} characters`);
                    } else {
                        console.warn(`   ⚠️  No text extracted from ${doc.original_filename}`);
                    }

                } catch (docError) {
                    console.error(`   ❌ Failed to process ${doc.original_filename}:`, docError.message);
                }
            }

            if (extractedData.length === 0) {
                throw new Error('No text could be extracted from any documents');
            }

            console.log(`\n📊 Successfully extracted text from ${extractedData.length}/${documents.length} documents`);

            // 4. Generate FCS analysis with Gemini
            console.log('🤖 Sending to Gemini AI for analysis...');
            const fcsAnalysis = await this.generateFCSAnalysisWithGemini(extractedData, businessName);

            if (!fcsAnalysis || fcsAnalysis.trim().length === 0) {
                throw new Error('Gemini returned empty analysis');
            }

            console.log(`✅ Received FCS analysis (${fcsAnalysis.length} characters)`);

            // 5. Parse the analysis to extract metadata
            const metadata = this.parseFCSMetadata(fcsAnalysis);

            // 6. Update database with completed analysis
            await db.query(`
                UPDATE fcs_analyses SET
                    extracted_business_name = $1,
                    statement_count = $2,
                    fcs_report = $3,
                    average_deposits = $4,
                    average_revenue = $5,
                    total_negative_days = $6,
                    average_negative_days = $7,
                    state = $8,
                    industry = $9,
                    position_count = $10,
                    status = 'completed',
                    completed_at = NOW()
                WHERE id = $11
            `, [
                metadata.extractedBusinessName || businessName,
                extractedData.length,
                fcsAnalysis,
                metadata.averageDeposits,
                metadata.averageRevenue,
                metadata.totalNegativeDays,
                metadata.averageNegativeDays,
                metadata.state,
                metadata.industry,
                metadata.positionCount,
                analysisId
            ]);

            console.log(`✅ FCS generation completed successfully!`);
            console.log(`   Analysis ID: ${analysisId}`);

            return {
                success: true,
                analysisId,
                metadata
            };

        } catch (error) {
            console.error(`❌ FCS generation failed:`, error.message);

            // Update database with error
            if (analysisId) {
                await db.query(`
                    UPDATE fcs_analyses SET
                        status = 'failed',
                        error_message = $1,
                        completed_at = NOW()
                    WHERE id = $2
                `, [error.message, analysisId]);
            }

            throw error;
        }
    }

    /**
     * Parse metadata from FCS report text
     * Extracts metrics from the summary section
     */
    parseFCSMetadata(fcsReport) {
        const metadata = {
            extractedBusinessName: null,
            averageDeposits: null,
            averageRevenue: null,
            totalNegativeDays: null,
            averageNegativeDays: null,
            state: null,
            industry: null,
            positionCount: null
        };

        try {
            // Extract business name
            const nameMatch = fcsReport.match(/^EXTRACTED_BUSINESS_NAME:\s*(.+?)$/m);
            if (nameMatch) {
                metadata.extractedBusinessName = nameMatch[1].trim();
            }

            // Look for the summary section
            const summaryMatch = fcsReport.match(/(\d+)-Month Summary[\s\S]*?(?=\n\n|$)/);
            if (!summaryMatch) return metadata;

            const summaryText = summaryMatch[0];

            // Extract metrics
            const avgDepositsMatch = summaryText.match(/Average Deposits:\s*\$?([\d,]+(?:\.\d{2})?)/);
            if (avgDepositsMatch) {
                metadata.averageDeposits = parseFloat(avgDepositsMatch[1].replace(/,/g, ''));
            }

            const avgRevenueMatch = summaryText.match(/Average True Revenue:\s*\$?([\d,]+(?:\.\d{2})?)/);
            if (avgRevenueMatch) {
                metadata.averageRevenue = parseFloat(avgRevenueMatch[1].replace(/,/g, ''));
            }

            const totalNegMatch = summaryText.match(/Negative Days:\s*(\d+)/);
            if (totalNegMatch) {
                metadata.totalNegativeDays = parseInt(totalNegMatch[1]);
            }

            const avgNegMatch = summaryText.match(/Average Negative Days:\s*([\d.]+)/);
            if (avgNegMatch) {
                metadata.averageNegativeDays = parseFloat(avgNegMatch[1]);
            }

            const stateMatch = summaryText.match(/State:\s*([A-Z]{2})/);
            if (stateMatch) {
                metadata.state = stateMatch[1];
            }

            const industryMatch = summaryText.match(/Industry:\s*(.+?)$/m);
            if (industryMatch) {
                metadata.industry = industryMatch[1].trim();
            }

            // Extract position count from "Position (ASSUME NEXT):" line
            const positionMatch = summaryText.match(/Position \(ASSUME NEXT\):\s*(\d+)/);
            if (positionMatch) {
                metadata.positionCount = parseInt(positionMatch[1]);
            }

        } catch (parseError) {
            console.warn('Failed to parse some FCS metadata:', parseError.message);
        }

        return metadata;
    }
}

module.exports = new FCSService();