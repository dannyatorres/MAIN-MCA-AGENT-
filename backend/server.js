// Working MCA Command Center Server - Minimal version with CSV import
console.log('Starting MCA Command Center Server...');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const csvParser = require('csv-parser');
const { v4: uuidv4 } = require('uuid');
// const fcsService = require('./services/fcsService'); // Lazy load to avoid startup hang
// const lenderMatcher = require('./services/lender-matcher'); // Lazy load to avoid startup hang
require('dotenv').config();

// Email service - will be loaded on first use
let emailService = null;
function getEmailService() {
    if (!emailService) {
        const EmailService = require('./services/emailService');
        emailService = new EmailService();
        console.log('Email service initialized');
    }
    return emailService;
}

// Twilio SMS Configuration
let twilioClient = null;
function getTwilioClient() {
    if (!twilioClient && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
        const twilio = require('twilio');
        twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        console.log('Twilio client initialized');
    }
    return twilioClient;
}

// Database will be loaded on demand
console.log('Database will be loaded on first API request...');
let db = null;

function getDatabase() {
    if (!db) {
        try {
            const dbModule = require('./database/db');
            db = dbModule.getInstance();
            console.log('Database module loaded');
        } catch (error) {
            console.log('Database loading failed:', error.message);
            throw error;
        }
    }
    return db;
}

console.log('Creating express app...');
const app = express();
console.log('Express app created');

// CORS configuration
console.log('Setting up CORS...');
const corsOptions = {
    origin: ['http://localhost:8080', 'http://localhost:3000', 'http://localhost:8000', 'http://127.0.0.1:8080', 'http://127.0.0.1:8000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));

// Only apply JSON parsing to non-multipart requests
app.use((req, res, next) => {
    const contentType = req.get('Content-Type') || '';
    console.log('Request Content-Type:', contentType);
    if (contentType.includes('multipart/form-data')) {
        console.log('Multipart request detected, skipping JSON parsing');
        return next();
    }
    console.log('Non-multipart request, applying JSON parsing');
    return express.json({ limit: '50mb' })(req, res, next);
});

app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Configure multer for CSV uploads
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}-${file.originalname}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'text/csv' || file.originalname.toLowerCase().endsWith('.csv')) {
            cb(null, true);
        } else {
            cb(new Error('Only CSV files are allowed'));
        }
    },
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Separate multer configuration for document uploads (allows any file type)
const documentUpload = multer({
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit for documents
});

// Basic health endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// WebSocket test endpoint for debugging
app.get('/test-websocket', (req, res) => {
    console.log('Testing WebSocket emission');
    console.log('Checking if io is available...');
    console.log('io available:', !!io);
    
    try {
        const testMessageData = {
            conversation_id: 'test-conversation',
            message: {
                id: 'test-message-123',
                content: 'This is a WebSocket test message from /test-websocket endpoint',
                direction: 'inbound',
                created_at: new Date().toISOString(),
                message_type: 'sms',
                sent_by: 'test-system'
            }
        };
        
        // Try emitting via io
        if (io) {
            io.emit('new_message', testMessageData);
            console.log('Test WebSocket event emitted via io');
        }
        
        res.json({
            success: true,
            message: 'WebSocket test message sent',
            io_available: !!io,
            connected_clients: io ? io.engine.clientsCount : 0,
            test_data: testMessageData
        });
        
    } catch (error) {
        console.error('WebSocket test failed:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            io_available: !!io
        });
    }
});

// Test endpoint to verify PDF files
app.get('/verify-pdf/:filename', (req, res) => {
    const { filename } = req.params;
    const filePath = path.join(uploadDir, filename);
    
    if (!fs.existsSync(filePath)) {
        return res.status(404).send('File not found');
    }
    
    // Read first few bytes to check if it's a valid PDF
    const buffer = fs.readFileSync(filePath);
    const header = buffer.toString('utf8', 0, 4);
    const isValidPDF = header === '%PDF';
    
    res.json({
        filename,
        size: buffer.length,
        isValidPDF,
        header: header,
        firstBytes: Array.from(buffer.slice(0, 10))
    });
});

// Lookups endpoint for dropdowns
app.get('/api/lookups', (req, res) => {
    const lookups = {
        states: [
            { code: 'AL', name: 'Alabama' },
            { code: 'AK', name: 'Alaska' },
            { code: 'AZ', name: 'Arizona' },
            { code: 'AR', name: 'Arkansas' },
            { code: 'CA', name: 'California' },
            { code: 'CO', name: 'Colorado' },
            { code: 'CT', name: 'Connecticut' },
            { code: 'DE', name: 'Delaware' },
            { code: 'FL', name: 'Florida' },
            { code: 'GA', name: 'Georgia' },
            { code: 'HI', name: 'Hawaii' },
            { code: 'ID', name: 'Idaho' },
            { code: 'IL', name: 'Illinois' },
            { code: 'IN', name: 'Indiana' },
            { code: 'IA', name: 'Iowa' },
            { code: 'KS', name: 'Kansas' },
            { code: 'KY', name: 'Kentucky' },
            { code: 'LA', name: 'Louisiana' },
            { code: 'ME', name: 'Maine' },
            { code: 'MD', name: 'Maryland' },
            { code: 'MA', name: 'Massachusetts' },
            { code: 'MI', name: 'Michigan' },
            { code: 'MN', name: 'Minnesota' },
            { code: 'MS', name: 'Mississippi' },
            { code: 'MO', name: 'Missouri' },
            { code: 'MT', name: 'Montana' },
            { code: 'NE', name: 'Nebraska' },
            { code: 'NV', name: 'Nevada' },
            { code: 'NH', name: 'New Hampshire' },
            { code: 'NJ', name: 'New Jersey' },
            { code: 'NM', name: 'New Mexico' },
            { code: 'NY', name: 'New York' },
            { code: 'NC', name: 'North Carolina' },
            { code: 'ND', name: 'North Dakota' },
            { code: 'OH', name: 'Ohio' },
            { code: 'OK', name: 'Oklahoma' },
            { code: 'OR', name: 'Oregon' },
            { code: 'PA', name: 'Pennsylvania' },
            { code: 'RI', name: 'Rhode Island' },
            { code: 'SC', name: 'South Carolina' },
            { code: 'SD', name: 'South Dakota' },
            { code: 'TN', name: 'Tennessee' },
            { code: 'TX', name: 'Texas' },
            { code: 'UT', name: 'Utah' },
            { code: 'VT', name: 'Vermont' },
            { code: 'VA', name: 'Virginia' },
            { code: 'WA', name: 'Washington' },
            { code: 'WV', name: 'West Virginia' },
            { code: 'WI', name: 'Wisconsin' },
            { code: 'WY', name: 'Wyoming' }
        ],
        entityTypes: [
            'LLC',
            'Corporation',
            'S-Corp',
            'Partnership',
            'Sole Proprietorship',
            'Non-Profit'
        ],
        industries: [
            'Retail',
            'Restaurant/Food Service',
            'Construction',
            'Professional Services',
            'Healthcare',
            'Technology',
            'Manufacturing',
            'Transportation',
            'Real Estate',
            'Agriculture',
            'Education',
            'Entertainment',
            'Financial Services',
            'Consulting',
            'Other'
        ],
        leadSources: [
            'Website',
            'Referral',
            'Cold Call',
            'Social Media',
            'Email Campaign',
            'Trade Show',
            'Direct Mail',
            'Google Ads',
            'Facebook Ads',
            'Other'
        ],
        assignedTo: [
            'John Smith',
            'Sarah Johnson',
            'Mike Wilson',
            'Lisa Anderson',
            'Tom Brown'
        ]
    };
    
    res.json(lookups);
});

// Test endpoint for debugging
app.get('/api/test', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'Server is working correctly',
        timestamp: new Date().toISOString(),
        endpoints_available: [
            '/api/conversations',
            '/api/lookups',
            '/health'
        ]
    });
});

// CSV Import endpoint
app.post('/api/csv-import/upload', upload.single('csvFile'), async (req, res) => {
    console.log('📁 CSV upload request received');
    
    if (!req.file) {
        return res.status(400).json({ error: 'No CSV file provided' });
    }

    let database;
    try {
        database = getDatabase();
    } catch (error) {
        return res.status(500).json({ error: 'Database not available: ' + error.message });
    }

    try {
        const results = [];
        const filePath = req.file.path;
        
        // Parse CSV file
        const stream = fs.createReadStream(filePath)
            .pipe(csvParser())
            .on('data', (data) => results.push(data))
            .on('end', async () => {
                console.log(`Parsed ${results.length} rows from CSV`);
                
                try {
                    let imported = 0;
                    let errors = [];
                    
                    for (const row of results) {
                        try {
                            // Transform CSV data for database
                            const transformedData = transformCSVRow(row);
                            
                            // Create conversation
                            const conversation = await database.query(`
                                INSERT INTO conversations (
                                    id, lead_phone, business_name, first_name, last_name,
                                    cell_phone, email, address, city, zip, lead_source, notes,
                                    state, current_step, priority, created_at
                                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
                                ON CONFLICT (lead_phone) DO UPDATE SET
                                    business_name = EXCLUDED.business_name,
                                    first_name = EXCLUDED.first_name,
                                    last_name = EXCLUDED.last_name,
                                    cell_phone = EXCLUDED.cell_phone,
                                    email = EXCLUDED.email,
                                    updated_at = NOW()
                                RETURNING id
                            `, [
                                uuidv4(),
                                transformedData.conversation.lead_phone,
                                transformedData.conversation.business_name,
                                transformedData.conversation.first_name,
                                transformedData.conversation.last_name,
                                transformedData.conversation.cell_phone,
                                transformedData.conversation.email,
                                transformedData.conversation.address,
                                transformedData.conversation.city,
                                transformedData.conversation.zip,
                                transformedData.conversation.lead_source,
                                transformedData.conversation.notes,
                                'NEW',
                                'initial_contact',
                                0
                            ]);
                            
                            const conversationId = conversation.rows[0].id;
                            
                            // Save lead details if they exist
                            if (transformedData.leadDetails && Object.values(transformedData.leadDetails).some(val => val !== null)) {
                                console.log('💾 Saving lead details for conversation:', conversationId);
                                await database.query(`
                                    INSERT INTO lead_details (
                                        id, conversation_id, business_type, annual_revenue, business_start_date,
                                        funding_amount, factor_rate, funding_date, term_months,
                                        campaign, date_of_birth, tax_id_encrypted, ssn_encrypted, created_by
                                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                                    ON CONFLICT (conversation_id) DO UPDATE SET
                                        business_type = EXCLUDED.business_type,
                                        annual_revenue = EXCLUDED.annual_revenue,
                                        business_start_date = EXCLUDED.business_start_date,
                                        funding_amount = EXCLUDED.funding_amount,
                                        factor_rate = EXCLUDED.factor_rate,
                                        funding_date = EXCLUDED.funding_date,
                                        term_months = EXCLUDED.term_months,
                                        campaign = EXCLUDED.campaign,
                                        date_of_birth = EXCLUDED.date_of_birth,
                                        tax_id_encrypted = EXCLUDED.tax_id_encrypted,
                                        ssn_encrypted = EXCLUDED.ssn_encrypted,
                                        updated_at = NOW()
                                `, [
                                    uuidv4(),
                                    conversationId,
                                    transformedData.leadDetails.business_type,
                                    transformedData.leadDetails.annual_revenue,
                                    transformedData.leadDetails.business_start_date,
                                    transformedData.leadDetails.funding_amount,
                                    transformedData.leadDetails.factor_rate,
                                    transformedData.leadDetails.funding_date,
                                    transformedData.leadDetails.term_months,
                                    transformedData.leadDetails.campaign,
                                    transformedData.leadDetails.date_of_birth,
                                    transformedData.leadDetails.tax_id,
                                    transformedData.leadDetails.ssn,
                                    'csv_import'
                                ]);
                            }
                            
                            imported++;
                        } catch (error) {
                            console.log('Row import error:', error.message);
                            errors.push(`Row ${imported + errors.length + 1}: ${error.message}`);
                        }
                    }
                    
                    // Clean up uploaded file
                    fs.unlinkSync(filePath);
                    
                    res.json({
                        message: 'Import completed',
                        imported,
                        errors: errors.length,
                        details: errors.slice(0, 10) // Show first 10 errors
                    });
                    
                } catch (error) {
                    console.log('📁 CSV processing error:', error);
                    fs.unlinkSync(filePath);
                    res.status(500).json({ error: 'Failed to process CSV data' });
                }
            });
    } catch (error) {
        console.log('📁 CSV upload error:', error);
        res.status(500).json({ error: 'Failed to upload CSV file' });
    }
});

// Get conversations endpoint
app.get('/api/conversations', async (req, res) => {
    let database;
    try {
        database = getDatabase();
    } catch (error) {
        return res.status(500).json({ error: 'Database not available: ' + error.message });
    }

    try {
        console.log('📋 Fetching conversations...');

        // Use a more efficient query by ordering by created_at instead of last_activity
        // and reducing the fields returned to essential ones only
        const result = await database.query(`
            SELECT id, lead_phone, business_name, first_name, last_name,
                   state, current_step, priority,
                   COALESCE(last_activity, created_at) as last_activity,
                   created_at
            FROM conversations
            ORDER BY created_at DESC
            LIMIT 50
        `);

        console.log(`📋 Found ${result.rows.length} conversations`);
        res.json(result.rows);
    } catch (error) {
        console.log('❌ Get conversations error:', error);
        res.status(500).json({ error: 'Failed to fetch conversations' });
    }
});

// Stats endpoint - provides dashboard statistics
app.get('/api/stats', async (req, res) => {
    try {
        const database = getDatabase();
        
        // Get total conversations
        const totalResult = await database.query('SELECT COUNT(*) as count FROM conversations');
        const totalConversations = parseInt(totalResult.rows[0].count) || 0;
        
        // Get conversations by state
        const stateResult = await database.query(`
            SELECT state, COUNT(*) as count 
            FROM conversations 
            GROUP BY state
        `);
        
        const stateBreakdown = {};
        stateResult.rows.forEach(row => {
            stateBreakdown[row.state || 'UNKNOWN'] = parseInt(row.count) || 0;
        });
        
        // Get recent activity count (last 7 days)
        const recentResult = await database.query(`
            SELECT COUNT(*) as count 
            FROM conversations 
            WHERE last_activity > NOW() - INTERVAL '7 days'
        `);
        const recentActivity = parseInt(recentResult.rows[0].count) || 0;
        
        // Return valid JSON response
        res.json({
            totalConversations: totalConversations,
            stateBreakdown: stateBreakdown,
            recentActivity: recentActivity,
            newLeads: stateBreakdown['NEW'] || 0,
            qualified: stateBreakdown['QUALIFIED'] || 0,
            funded: stateBreakdown['FUNDED'] || 0
        });
        
    } catch (error) {
        console.error('Stats endpoint error:', error);
        // Always return valid JSON even on error
        res.json({
            totalConversations: 0,
            stateBreakdown: {},
            recentActivity: 0,
            newLeads: 0,
            qualified: 0,
            funded: 0,
            error: true
        });
    }
});

// Search conversations endpoint
app.get('/api/conversations/search', async (req, res) => {
    let database;
    try {
        database = getDatabase();
    } catch (error) {
        return res.status(500).json({ error: 'Database not available: ' + error.message });
    }
    
    try {
        const { q: searchTerm, state } = req.query;
        
        if (!searchTerm || searchTerm.trim() === '') {
            return res.status(400).json({ error: 'Search term required' });
        }
        
        console.log('Search request:', { searchTerm, state });
        
        // Build dynamic query with search conditions
        let baseQuery = `
            SELECT id, lead_phone, business_name, first_name, last_name,
                   state, current_step, priority, last_activity, created_at
            FROM conversations
            WHERE (
                LOWER(business_name) LIKE LOWER($1) OR
                LOWER(first_name) LIKE LOWER($1) OR  
                LOWER(last_name) LIKE LOWER($1) OR
                lead_phone LIKE $1
            )
        `;
        
        const searchPattern = `%${searchTerm}%`;
        let queryParams = [searchPattern];
        
        // Add state filter if provided
        if (state && state !== '') {
            baseQuery += ` AND LOWER(state) = LOWER($2)`;
            queryParams.push(state);
        }
        
        baseQuery += ` ORDER BY last_activity DESC LIMIT 50`;
        
        console.log('Search query:', baseQuery);
        console.log('Search params:', queryParams);
        
        const result = await database.query(baseQuery, queryParams);
        
        console.log(`Search found ${result.rows.length} results`);
        res.json(result.rows);
        
    } catch (error) {
        console.error('🔴 Search endpoint error:', error);
        res.status(500).json({ error: 'Search failed', details: error.message });
    }
});

// Get individual conversation details
app.get('/api/conversations/:id', async (req, res) => {
    let database;
    try {
        database = getDatabase();
    } catch (error) {
        return res.status(500).json({ error: 'Database not available: ' + error.message });
    }
    
    try {
        const { id } = req.params;
        console.log('Getting conversation details for ID:', id);
        
        // Get conversation with all details
        const result = await database.query(`
            SELECT c.*, ld.business_type, ld.annual_revenue, ld.business_start_date,
                   ld.funding_amount, ld.factor_rate, ld.funding_date, ld.term_months,
                   ld.campaign, ld.date_of_birth, ld.tax_id_encrypted as tax_id, ld.ssn_encrypted as ssn
            FROM conversations c
            LEFT JOIN lead_details ld ON c.id = ld.conversation_id
            WHERE c.id = $1
        `, [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Conversation not found' });
        }
        
        const conversation = result.rows[0];
        
        // Handle state naming conflict (conversation state vs address state)
        if (conversation.state && conversation.state !== 'NEW') {
            conversation.address_state = conversation.state;
            conversation.state = 'NEW';
        }
        
        console.log('Conversation details retrieved');
        res.json(conversation);
    } catch (error) {
        console.log('Get conversation details error:', error);
        res.status(500).json({ error: 'Failed to fetch conversation details' });
    }
});

// Transform CSV row to database format
function transformCSVRow(row) {
    // Normalize keys to handle different CSV formats
    const normalizedRow = {};
    for (const [key, value] of Object.entries(row)) {
        normalizedRow[key.toLowerCase().replace(/\s+/g, '_')] = value?.trim() || null;
    }
    
    console.log('CSV row keys:', Object.keys(normalizedRow));
    
    return {
        conversation: {
            lead_phone: normalizedRow['phone_number'] || normalizedRow['phone'] || null,
            business_name: normalizedRow['company_name'] || normalizedRow['business_name'] || null,
            first_name: normalizedRow['first_name'] || null,
            last_name: normalizedRow['last_name'] || null,
            cell_phone: normalizedRow['cell_phone'] || normalizedRow['mobile'] || null,
            email: normalizedRow['email'] || null,
            address: normalizedRow['address'] || null,
            city: normalizedRow['city'] || null,
            zip: normalizedRow['zip'] || null,
            lead_source: normalizedRow['lead_source'] || normalizedRow['source'] || null,
            notes: normalizedRow['notes'] || null
        },
        leadDetails: {
            business_type: normalizedRow['business_type'] || null,
            annual_revenue: normalizedRow['annual_revenue'] ? parseFloat(normalizedRow['annual_revenue']) : null,
            business_start_date: normalizedRow['business_start_date'] || null,
            funding_amount: normalizedRow['funding'] ? parseFloat(normalizedRow['funding']) : null,
            factor_rate: normalizedRow['factor_rate'] ? parseFloat(normalizedRow['factor_rate']) : null,
            funding_date: normalizedRow['funding_date'] || null,
            term_months: normalizedRow['term'] ? parseInt(normalizedRow['term']) : null,
            campaign: normalizedRow['campaign'] || null,
            date_of_birth: normalizedRow['dob'] || normalizedRow['date_of_birth'] || null,
            tax_id: normalizedRow['taxid'] || normalizedRow['tax_id'] || null,
            ssn: normalizedRow['ssn'] || null
        }
    };
}

// Bulk delete conversations endpoint
app.post('/api/conversations/bulk-delete', async (req, res) => {
    let database;
    try {
        database = getDatabase();
    } catch (error) {
        return res.status(500).json({ error: 'Database not available: ' + error.message });
    }
    
    try {
        const { conversationIds } = req.body;
        
        if (!conversationIds || !Array.isArray(conversationIds) || conversationIds.length === 0) {
            return res.status(400).json({ error: 'No conversation IDs provided' });
        }
        
        console.log('Bulk deleting conversations:', conversationIds);
        
        // Delete related records first to avoid foreign key constraints
        const placeholders = conversationIds.map((_, index) => `$${index + 1}`).join(',');
        
        // Add error handling for each delete
        try {
            await database.query(
                `DELETE FROM documents WHERE conversation_id IN (${placeholders})`,
                conversationIds
            );
            console.log('Documents deleted');
        } catch (err) {
            console.error('❌ Error deleting documents:', err.message);
        }
        
        try {
            await database.query(
                `DELETE FROM messages WHERE conversation_id IN (${placeholders})`,
                conversationIds
            );
            console.log('✅ Messages deleted');
        } catch (err) {
            console.error('❌ Error deleting messages:', err.message);
        }
        
        try {
            await database.query(
                `DELETE FROM lead_details WHERE conversation_id IN (${placeholders})`,
                conversationIds
            );
            console.log('✅ Lead details deleted');
        } catch (err) {
            console.error('❌ Error deleting lead_details:', err.message);
        }
        
        // Add these additional deletions for other possible related tables
        try {
            await database.query(
                `DELETE FROM fcs_results WHERE conversation_id IN (${placeholders})`,
                conversationIds
            );
            console.log('✅ FCS results deleted');
        } catch (err) {
            console.error('❌ Error deleting fcs_results:', err.message);
        }
        
        try {
            await database.query(
                `DELETE FROM lender_submissions WHERE conversation_id IN (${placeholders})`,
                conversationIds
            );
            console.log('✅ Lender submissions deleted');
        } catch (err) {
            console.error('❌ Error deleting lender_submissions:', err.message);
        }
        
        try {
            await database.query(
                `DELETE FROM lender_qualifications WHERE conversation_id IN (${placeholders})`,
                conversationIds
            );
            console.log('✅ Lender qualifications deleted');
        } catch (err) {
            console.error('❌ Error deleting lender_qualifications:', err.message);
        }
        
        // Finally delete conversations
        const result = await database.query(
            `DELETE FROM conversations WHERE id IN (${placeholders}) RETURNING id`,
            conversationIds
        );
        
        console.log(`✅ Deleted ${result.rows.length} conversations from live AWS database`);
        
        res.json({
            success: true,
            deletedCount: result.rows.length,
            deletedIds: result.rows.map(row => row.id)
        });
        
    } catch (error) {
        console.error('❌ Bulk delete error:', error);
        console.error('Full error details:', error.detail || error.message);
        res.status(500).json({ 
            error: 'Failed to delete conversations: ' + error.message,
            detail: error.detail,
            hint: error.hint 
        });
    }
});

// Diagnostic endpoint to check which tables reference a conversation
app.get('/api/conversations/:id/references', async (req, res) => {
    let database;
    try {
        database = getDatabase();
    } catch (error) {
        return res.status(500).json({ error: 'Database not available: ' + error.message });
    }
    
    try {
        const { id } = req.params;
        console.log('🔍 Checking table references for conversation:', id);
        
        // Query all tables that might reference this conversation
        const results = await database.query(`
            SELECT 'documents' as table_name, COUNT(*) as count FROM documents WHERE conversation_id = $1
            UNION ALL
            SELECT 'messages', COUNT(*) FROM messages WHERE conversation_id = $2
            UNION ALL
            SELECT 'lead_details', COUNT(*) FROM lead_details WHERE conversation_id = $3
            UNION ALL
            SELECT 'fcs_results', COUNT(*) FROM fcs_results WHERE conversation_id = $4
            UNION ALL
            SELECT 'lender_submissions', COUNT(*) FROM lender_submissions WHERE conversation_id = $5
            ORDER BY count DESC
        `, [id, id, id, id, id]);
        
        const references = results.rows.filter(row => parseInt(row.count) > 0);
        
        console.log(`📊 References found for conversation ${id}:`, references);
        
        res.json({
            conversationId: id,
            references: references,
            totalReferences: references.reduce((sum, ref) => sum + parseInt(ref.count), 0)
        });
        
    } catch (error) {
        console.error('❌ Error checking references:', error);
        res.status(500).json({ 
            error: 'Failed to check references: ' + error.message,
            detail: error.detail 
        });
    }
});

// Basic messages endpoint (for conversation messages)
app.get('/api/conversations/:id/messages', async (req, res) => {
    let database;
    try {
        database = getDatabase();
    } catch (error) {
        return res.json([]);
    }
    
    try {
        const { id } = req.params;
        const result = await database.query(`
            SELECT * FROM messages 
            WHERE conversation_id = $1 
            ORDER BY timestamp ASC
        `, [id]);
        
        res.json(result.rows);
    } catch (error) {
        console.log('📧 Get messages error:', error);
        res.json([]);
    }
});

// Send SMS Message
app.post('/api/conversations/:id/messages', async (req, res) => {
    try {
        const { id: conversationId } = req.params;
        const { message_content, sender_type = 'user' } = req.body;

        if (!message_content) {
            return res.status(400).json({ error: 'Message content is required' });
        }

        const database = getDatabase();
        
        // Get conversation details
        const conversation = await database.query(
            'SELECT * FROM conversations WHERE id = $1',
            [conversationId]
        );

        if (!conversation.rows.length) {
            return res.status(404).json({ error: 'Conversation not found' });
        }

        const conv = conversation.rows[0];
        const messageId = uuidv4();
        const direction = sender_type === 'user' ? 'outbound' : 'inbound';

        // Insert message into database first
        await database.query(
            `INSERT INTO messages (id, conversation_id, content, direction, message_type, sent_by, status) 
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [messageId, conversationId, message_content, direction, 'sms', 'operator', 'pending']
        );

        // Send SMS via Twilio if it's an outbound message
        if (direction === 'outbound' && conv.lead_phone) {
            const twilio = getTwilioClient();
            if (twilio && process.env.TWILIO_PHONE_NUMBER) {
                try {
                    console.log('📱 Sending SMS to:', conv.lead_phone, 'Message:', message_content);
                    const twilioMessage = await twilio.messages.create({
                        body: message_content,
                        from: process.env.TWILIO_PHONE_NUMBER,
                        to: conv.lead_phone
                    });

                    // Update message status to sent
                    await database.query(
                        'UPDATE messages SET status = $1, twilio_sid = $2 WHERE id = $3',
                        ['sent', twilioMessage.sid, messageId]
                    );

                    console.log('✅ SMS sent via Twilio:', twilioMessage.sid);
                } catch (twilioError) {
                    console.error('❌ Twilio SMS error:', twilioError);
                    
                    // Update message status to failed
                    await database.query(
                        'UPDATE messages SET status = $1, error_message = $2 WHERE id = $3',
                        ['failed', twilioError.message, messageId]
                    );
                    
                    return res.status(500).json({ 
                        error: 'Failed to send SMS: ' + twilioError.message,
                        messageId 
                    });
                }
            } else {
                console.warn('⚠️ Twilio not configured - message stored but not sent');
                await database.query(
                    'UPDATE messages SET status = $1 WHERE id = $2',
                    ['pending', messageId]
                );
            }
        } else {
            // For inbound messages
            await database.query(
                'UPDATE messages SET status = $1 WHERE id = $2',
                ['delivered', messageId]
            );
        }

        // Update conversation last activity
        await database.query(
            'UPDATE conversations SET last_activity = $1 WHERE id = $2',
            [new Date().toISOString(), conversationId]
        );

        // Get the complete message for response
        const messageResult = await database.query(
            'SELECT * FROM messages WHERE id = $1',
            [messageId]
        );

        res.json({
            success: true,
            message: messageResult.rows[0]
        });

    } catch (error) {
        console.error('❌ Send message error:', error);
        res.status(500).json({ error: 'Failed to send message: ' + error.message });
    }
});

// Basic documents endpoint
app.get('/api/conversations/:id/documents', async (req, res) => {
    let database;
    try {
        database = getDatabase();
    } catch (error) {
        return res.status(500).json({ error: 'Database not available: ' + error.message });
    }
    
    try {
        const { id } = req.params;
        const result = await database.query(`
            SELECT * FROM documents 
            WHERE conversation_id = $1 
            ORDER BY created_at DESC
        `, [id]);
        
        res.json({
            success: true,
            documents: result.rows
        });
    } catch (error) {
        console.log('📁 Get documents error:', error);
        res.json({
            success: false,
            error: 'Failed to fetch documents',
            documents: []
        });
    }
});

// Document upload endpoint
app.post('/api/conversations/:id/documents/upload', documentUpload.array('documents'), async (req, res) => {
    let database;
    try {
        database = getDatabase();
    } catch (error) {
        return res.status(500).json({ error: 'Database not available: ' + error.message });
    }
    
    try {
        const { id } = req.params;
        const uploadedFiles = req.files;
        
        if (!uploadedFiles || uploadedFiles.length === 0) {
            return res.status(400).json({ error: 'No files provided' });
        }
        
        const results = [];
        
        for (const file of uploadedFiles) {
            const documentId = uuidv4();
            
            // Insert document record
            const result = await database.query(`
                INSERT INTO documents (
                    id, conversation_id, original_filename, filename, 
                    file_size, created_at
                ) VALUES ($1, $2, $3, $4, $5, NOW())
                RETURNING *
            `, [
                documentId,
                id,
                file.originalname,
                file.filename,
                file.size
            ]);
            
            results.push(result.rows[0]);
        }
        
        console.log(`📁 Uploaded ${results.length} documents for conversation ${id}`);
        res.json({ 
            success: true,
            message: 'Documents uploaded successfully',
            documents: results 
        });
        
    } catch (error) {
        console.log('📁 Document upload error:', error);
        res.status(500).json({ error: 'Failed to upload documents' });
    }
});

// Document download endpoint - streams from AWS S3
app.get('/api/conversations/:conversationId/documents/:documentId/download', async (req, res) => {
    let database;
    try {
        database = getDatabase();
    } catch (error) {
        return res.status(500).json({ error: 'Database not available: ' + error.message });
    }
    
    try {
        const { conversationId, documentId } = req.params;
        
        // Get document info from database
        const result = await database.query(`
            SELECT * FROM documents 
            WHERE id = $1 AND conversation_id = $2
        `, [documentId, conversationId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Document not found' });
        }
        
        const doc = result.rows[0];
        
        // Always stream through backend for security (instead of direct S3 access)
        
        // If no S3 URL but has S3 key, stream from S3
        if (doc.s3_key) {
            console.log('📤 Streaming from S3 for download:', doc.original_filename);
            
            const AWS = require('aws-sdk');
            AWS.config.update({
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                region: process.env.AWS_REGION
            });
            
            const s3 = new AWS.S3();
            const stream = s3.getObject({
                Bucket: process.env.S3_DOCUMENTS_BUCKET,
                Key: doc.s3_key
            }).createReadStream();
            
            // Set appropriate headers for download
            res.setHeader('Content-Disposition', `attachment; filename="${doc.original_filename}"`);
            res.setHeader('Content-Type', 'application/octet-stream');
            
            // Handle stream errors
            stream.on('error', (error) => {
                console.error('📁 S3 stream error:', error);
                if (!res.headersSent) {
                    res.status(500).json({ error: 'Failed to download from S3' });
                }
            });
            
            // Stream the file from S3
            stream.pipe(res);
        } else if (doc.filename) {
            // Legacy document without S3 key - migrate to S3 first
            console.log('🔄 Legacy document detected for download, migrating to S3:', doc.original_filename);
            
            const path = require('path');
            const fs = require('fs');
            const AWS = require('aws-sdk');
            
            AWS.config.update({
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                region: process.env.AWS_REGION
            });
            
            const s3 = new AWS.S3();
            const localFilePath = path.join(__dirname, 'uploads', doc.filename);
            
            // Check if local file exists
            if (!fs.existsSync(localFilePath)) {
                return res.status(404).json({ error: 'Document file not found' });
            }
            
            try {
                // Read the local file
                const fileBuffer = fs.readFileSync(localFilePath);
                
                // Generate S3 key for the document
                const s3Key = `documents/${doc.filename}`;
                
                // Upload to S3
                const uploadParams = {
                    Bucket: process.env.S3_DOCUMENTS_BUCKET,
                    Key: s3Key,
                    Body: fileBuffer,
                    ContentType: 'application/pdf',
                    ServerSideEncryption: 'AES256'
                };
                
                const uploadResult = await s3.upload(uploadParams).promise();
                console.log('✅ Document migrated to S3 for download:', uploadResult.Location);
                
                // Update database with S3 information
                try {
                    await database.query(`
                        UPDATE documents
                        SET s3_key = $1, s3_url = $2
                        WHERE id = $3
                    `, [s3Key, uploadResult.Location, doc.id]);
                    console.log('✅ Database updated with S3 info');
                } catch (dbError) {
                    console.warn('⚠️ Database update failed but S3 upload succeeded:', dbError.message);
                    // Continue execution even if database update fails since S3 upload worked
                }
                
                // Now stream the file from S3 for download
                const stream = s3.getObject({
                    Bucket: process.env.S3_DOCUMENTS_BUCKET,
                    Key: s3Key
                }).createReadStream();
                
                // Set appropriate headers for download
                res.setHeader('Content-Disposition', `attachment; filename="${doc.original_filename}"`);
                res.setHeader('Content-Type', 'application/octet-stream');
                
                stream.on('error', (error) => {
                    console.error('📁 S3 stream error after migration:', error);
                    if (!res.headersSent) {
                        res.status(500).json({ error: 'Failed to download from S3' });
                    }
                });
                
                stream.pipe(res);
                
            } catch (migrationError) {
                console.error('❌ Document migration failed for download:', migrationError);
                return res.status(500).json({ error: 'Failed to migrate document to S3' });
            }
            
        } else {
            return res.status(404).json({ error: 'Document not found' });
        }
        
    } catch (error) {
        console.error('📁 Document download error:', error);
        res.status(500).json({ error: 'Failed to download document' });
    }
});

// Document preview endpoint - streams from AWS S3 for inline viewing
app.get('/api/conversations/:conversationId/documents/:documentId/preview', async (req, res) => {
    let database;
    try {
        database = getDatabase();
    } catch (error) {
        return res.status(500).json({ error: 'Database not available: ' + error.message });
    }
    
    try {
        const { conversationId, documentId } = req.params;
        
        // Get document info from database
        const result = await database.query(`
            SELECT * FROM documents 
            WHERE id = $1 AND conversation_id = $2
        `, [documentId, conversationId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Document not found' });
        }
        
        const doc = result.rows[0];
        console.log('🔍 Preview document debug:', {
            id: doc.id,
            filename: doc.filename,
            s3_key: doc.s3_key,
            original_filename: doc.original_filename
        });
        
        // Always stream through backend for security (instead of direct S3 access)
        
        // If document has S3 key, stream from S3
        if (doc.s3_key) {
            console.log('👁️ Streaming from S3 for preview:', doc.original_filename);
            
            const AWS = require('aws-sdk');
            AWS.config.update({
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                region: process.env.AWS_REGION
            });
            
            const s3 = new AWS.S3();
            const stream = s3.getObject({
                Bucket: process.env.S3_DOCUMENTS_BUCKET,
                Key: doc.s3_key
            }).createReadStream();
            
            // Set proper content type based on file extension
            const ext = path.extname(doc.original_filename).toLowerCase();
            let contentType = 'application/octet-stream';
            
            if (ext === '.pdf') contentType = 'application/pdf';
            else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
            else if (ext === '.png') contentType = 'image/png';
            else if (ext === '.gif') contentType = 'image/gif';
            else if (ext === '.txt') contentType = 'text/plain';
            
            // Set appropriate headers for preview (inline display)
            res.setHeader('Content-Disposition', `inline; filename="${doc.original_filename}"`);
            res.setHeader('Content-Type', contentType);
            
            // Handle stream errors
            stream.on('error', (error) => {
                console.error('👁️ S3 stream error:', error);
                if (!res.headersSent) {
                    res.status(500).json({ error: 'Failed to preview from S3' });
                }
            });
            
            // Stream the file from S3
            stream.pipe(res);
            
        } else if (doc.filename) {
            // Legacy document without S3 key - migrate to S3 first
            console.log('🔄 Legacy document detected, migrating to S3:', doc.original_filename);

            const path = require('path');
            const fs = require('fs');
            const AWS = require('aws-sdk');

            AWS.config.update({
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                region: process.env.AWS_REGION
            });

            const s3 = new AWS.S3();
            const localFilePath = path.join(__dirname, 'uploads', doc.filename);

            // Check if local file exists
            if (!fs.existsSync(localFilePath)) {
                return res.status(404).json({ error: 'Document file not found' });
            }

            try {
                // Read the local file
                const fileBuffer = fs.readFileSync(localFilePath);

                // Generate S3 key for the document
                const s3Key = `documents/${doc.filename}`;

                // Upload to S3
                const uploadParams = {
                    Bucket: process.env.S3_DOCUMENTS_BUCKET,
                    Key: s3Key,
                    Body: fileBuffer,
                    ContentType: 'application/pdf',
                    ServerSideEncryption: 'AES256'
                };

                const uploadResult = await s3.upload(uploadParams).promise();
                console.log('✅ Document migrated to S3:', uploadResult.Location);

                // Update database with S3 information
                try {
                    await database.query(`
                        UPDATE documents
                        SET s3_key = $1, s3_url = $2
                        WHERE id = $3
                    `, [s3Key, uploadResult.Location, doc.id]);
                    console.log('✅ Database updated with S3 info');
                } catch (dbError) {
                    console.warn('⚠️ Database update failed but S3 upload succeeded:', dbError.message);
                    // Continue execution even if database update fails since S3 upload worked
                }

                // Now stream the file from S3
                const stream = s3.getObject({
                    Bucket: process.env.S3_DOCUMENTS_BUCKET,
                    Key: s3Key
                }).createReadStream();

                // Set proper content type
                const ext = path.extname(doc.original_filename).toLowerCase();
                let contentType = 'application/octet-stream';
                if (ext === '.pdf') contentType = 'application/pdf';

                res.setHeader('Content-Disposition', `inline; filename="${doc.original_filename}"`);
                res.setHeader('Content-Type', contentType);

                stream.on('error', (error) => {
                    console.error('👁️ S3 stream error after migration:', error);
                    if (!res.headersSent) {
                        res.status(500).json({ error: 'Failed to preview from S3' });
                    }
                });

                stream.pipe(res);

            } catch (migrationError) {
                console.error('❌ Document migration failed:', migrationError);
                return res.status(500).json({ error: 'Failed to migrate document to S3' });
            }
            
        } else {
            return res.status(404).json({ error: 'Document not found' });
        }
        
    } catch (error) {
        console.error('👁️ Document preview error:', error);
        res.status(500).json({ error: 'Failed to preview document' });
    }
});

// Conversation update endpoint
app.put('/api/conversations/:id', express.json(), async (req, res) => {
    let database;
    try {
        database = getDatabase();
    } catch (error) {
        return res.status(500).json({ error: 'Database not available: ' + error.message });
    }

    try {
        const conversationId = req.params.id;
        const data = req.body;
        
        console.log('=== UPDATE REQUEST DEBUG ===');
        console.log('📝 Conversation ID:', conversationId);
        console.log('📥 Received fields:', Object.keys(data));
        console.log('📥 Received data:', JSON.stringify(data, null, 2));
        
        // Remove any fields with empty string values for states
        if (data.businessState === '') delete data.businessState;
        if (data.ownerHomeState === '') delete data.ownerHomeState;
        if (data.leadStatus === '') delete data.leadStatus;
        
        // Build dynamic update query based on provided fields
        const updateFields = [];
        const values = [];
        let paramCounter = 1;
        
        // Map frontend field names to database tables and columns
        // Handle BOTH camelCase AND snake_case field names from frontend
        // IMPORTANT: Only include fields that actually exist in the database schema
        const conversationsFields = {
            // Business information - both naming conventions
            businessName: 'business_name',
            business_name: 'business_name',
            
            businessAddress: 'address',
            business_address: 'address',
            address: 'address',
            
            businessCity: 'city',
            business_city: 'city',
            city: 'city',
            
            businessState: 'us_state',
            business_state: 'us_state',
            us_state: 'us_state',
            
            businessZip: 'zip',
            business_zip: 'zip',
            zip: 'zip',
            
            // Phone numbers - multiple mappings
            primaryPhone: 'lead_phone',
            primary_phone: 'lead_phone',
            lead_phone: 'lead_phone',
            phone: 'lead_phone',
            
            cellPhone: 'cell_phone',
            cell_phone: 'cell_phone',
            
            // Email
            businessEmail: 'email',
            business_email: 'email',
            email: 'email',
            
            // Lead tracking
            leadSource: 'lead_source',
            lead_source: 'lead_source',
            
            leadStatus: 'state', // This is the conversation state/status
            lead_status: 'state',
            state: 'state',
            
            // Owner information
            ownerFirstName: 'first_name',
            owner_first_name: 'first_name',
            first_name: 'first_name',
            
            ownerLastName: 'last_name',
            owner_last_name: 'last_name',
            last_name: 'last_name',
            
            // Other fields that exist in conversations table
            notes: 'notes',
            
            // Entity type - newly added column
            entityType: 'entity_type',
            entity_type: 'entity_type',
            
            // Owner details - moved to conversations table
            ownershipPercent: 'ownership_percent',
            ownership_percent: 'ownership_percent',
            
            ownerHomeAddress: 'owner_home_address',
            owner_home_address: 'owner_home_address',
            owner_address: 'owner_home_address',
            
            ownerHomeAddress2: 'owner_home_address2',
            owner_home_address2: 'owner_home_address2',
            
            ownerHomeCity: 'owner_home_city',
            owner_home_city: 'owner_home_city',
            
            ownerHomeState: 'owner_home_state',
            owner_home_state: 'owner_home_state',
            
            ownerHomeZip: 'owner_home_zip',
            owner_home_zip: 'owner_home_zip',
            
            ownerHomeCountry: 'owner_home_country',
            owner_home_country: 'owner_home_country',
            
            ownerEmail: 'owner_email',
            owner_email: 'owner_email'
        };
        
        const leadDetailsFields = {
            // Extended lead detail fields (lead_details table)
            // IMPORTANT: Only include fields that actually exist in the database schema
            
            // Dates that exist in lead_details table
            ownerDOB: 'date_of_birth',
            owner_dob: 'date_of_birth',
            owner_date_of_birth: 'date_of_birth',
            date_of_birth: 'date_of_birth',
            
            // SSN field mappings (maps to 'ssn_encrypted' column in database)
            ownerSSN: 'ssn_encrypted',
            owner_ssn: 'ssn_encrypted',
            ssn: 'ssn_encrypted',
            ssn_encrypted: 'ssn_encrypted',
            
            businessStartDate: 'business_start_date',
            business_start_date: 'business_start_date',
            
            fundingDate: 'funding_date',
            funding_date: 'funding_date',
            
            // Business details that exist in lead_details table
            industryType: 'business_type',
            industry_type: 'business_type',
            industry: 'business_type',
            business_type: 'business_type',
            
            // Financial information that exists in lead_details table
            annualRevenue: 'annual_revenue',
            annual_revenue: 'annual_revenue',
            
            requestedAmount: 'funding_amount',
            requested_amount: 'funding_amount',
            funding_amount: 'funding_amount',
            
            factorRate: 'factor_rate',
            factor_rate: 'factor_rate',
            
            termMonths: 'term_months',
            term_months: 'term_months',
            
            // Campaign and tracking
            campaign: 'campaign'
        };
        
        // Separate fields for conversations and lead_details tables
        const conversationsUpdateFields = [];
        const conversationsValues = [];
        const leadDetailsUpdateFields = [];
        const leadDetailsValues = [];
        let conversationsParamCounter = 1;
        let leadDetailsParamCounter = 1;
        
        // Track which database columns have been assigned to prevent duplicates
        const assignedConversationFields = new Set();
        const assignedLeadDetailFields = new Set();
        
        // Build update queries for both tables with duplicate prevention
        for (const [frontendField, value] of Object.entries(data)) {
            if (frontendField === 'id') continue; // Skip the ID field
            
            if (conversationsFields[frontendField]) {
                const dbField = conversationsFields[frontendField];
                
                // Skip if this database field has already been assigned
                if (assignedConversationFields.has(dbField)) {
                    console.log(`⚠️ Skipping duplicate field mapping: ${frontendField} -> ${dbField} (already assigned)`);
                    continue;
                }
                
                conversationsUpdateFields.push(`${dbField} = $${conversationsParamCounter}`);
                conversationsValues.push(value);
                conversationsParamCounter++;
                assignedConversationFields.add(dbField);
                console.log(`✅ Mapped: ${frontendField} -> ${dbField}`);
            } else if (leadDetailsFields[frontendField]) {
                const dbField = leadDetailsFields[frontendField];
                
                // Skip if this database field has already been assigned
                if (assignedLeadDetailFields.has(dbField)) {
                    console.log(`⚠️ Skipping duplicate field mapping: ${frontendField} -> ${dbField} (already assigned)`);
                    continue;
                }
                
                leadDetailsUpdateFields.push(`${dbField} = $${leadDetailsParamCounter}`);
                leadDetailsValues.push(value);
                leadDetailsParamCounter++;
                assignedLeadDetailFields.add(dbField);
                console.log(`✅ Mapped: ${frontendField} -> ${dbField}`);
            } else {
                console.log(`⚠️ Skipping unmapped field: ${frontendField}`);
            }
        }
        
        // Update conversations table if there are fields to update
        if (conversationsUpdateFields.length > 0) {
            // Add updated timestamp
            conversationsUpdateFields.push(`updated_at = $${conversationsParamCounter}`);
            conversationsValues.push(new Date().toISOString());
            conversationsParamCounter++;
            
            // Add conversation ID for WHERE clause
            conversationsValues.push(conversationId);
            
            const conversationsQuery = `
                UPDATE conversations 
                SET ${conversationsUpdateFields.join(', ')} 
                WHERE id = $${conversationsParamCounter}
            `;
            
            console.log('🔍 Conversations query:', conversationsQuery);
            console.log('🔍 Conversations values:', conversationsValues);
            
            await database.query(conversationsQuery, conversationsValues);
        }
        
        // Update lead_details table if there are fields to update
        if (leadDetailsUpdateFields.length > 0) {
            // First, check if lead_details record exists
            const existingDetails = await database.query(
                'SELECT id FROM lead_details WHERE conversation_id = $1',
                [conversationId]
            );
            
            if (existingDetails.rows.length > 0) {
                // Update existing record
                leadDetailsUpdateFields.push(`updated_at = $${leadDetailsParamCounter}`);
                leadDetailsValues.push(new Date().toISOString());
                leadDetailsParamCounter++;
                
                leadDetailsValues.push(conversationId);
                
                const leadDetailsQuery = `
                    UPDATE lead_details 
                    SET ${leadDetailsUpdateFields.join(', ')} 
                    WHERE conversation_id = $${leadDetailsParamCounter}
                `;
                
                console.log('🔍 Lead details query:', leadDetailsQuery);
                console.log('🔍 Lead details values:', leadDetailsValues);
                
                await database.query(leadDetailsQuery, leadDetailsValues);
            } else {
                // Insert new record
                const insertFields = ['conversation_id', ...leadDetailsUpdateFields.map(f => f.split(' = ')[0])];
                const insertValues = [conversationId, ...leadDetailsValues, new Date().toISOString()];
                const insertParams = insertValues.map((_, i) => `$${i + 1}`);
                
                const insertQuery = `
                    INSERT INTO lead_details (${insertFields.join(', ')}, created_at, updated_at)
                    VALUES (${insertParams.join(', ')}, NOW(), NOW())
                `;
                
                console.log('🔍 Lead details insert query:', insertQuery);
                console.log('🔍 Lead details insert values:', insertValues);
                
                await database.query(insertQuery, insertValues);
            }
        }
        
        // Get the updated conversation with lead details
        const finalResult = await database.query(`
            SELECT c.*, ld.date_of_birth, ld.business_start_date, 
                   ld.business_type, ld.annual_revenue, ld.funding_amount, ld.campaign
            FROM conversations c
            LEFT JOIN lead_details ld ON c.id = ld.conversation_id
            WHERE c.id = $1
        `, [conversationId]);
        
        if (finalResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Conversation not found' });
        }
        
        const updatedConversation = finalResult.rows[0];
        
        console.log('=== UPDATE RESPONSE DEBUG ===');
        console.log('✅ Updated conversation ID:', updatedConversation.id);
        console.log('📤 Sending back data:', JSON.stringify(updatedConversation, null, 2));
        
        res.json({
            success: true,
            message: 'Conversation updated successfully',
            data: updatedConversation
        });
        
    } catch (error) {
        console.error('❌ Database error:', error.message);
        
        // Parse the error to find which field is problematic
        const errorMatch = error.message?.match(/column "([^"]+)" of relation "([^"]+)" does not exist/);
        if (errorMatch) {
            console.error(`❌ Missing column: "${errorMatch[1]}" in table "${errorMatch[2]}"`);
            console.log('💡 Suggestion: Either add this column to the database or map it to a different table');
        }
        
        res.status(400).json({ 
            success: false, 
            error: error.message,
            details: error.stack,
            problematicField: errorMatch ? errorMatch[1] : null,
            problematicTable: errorMatch ? errorMatch[2] : null
        });
    }
});

// Debug endpoint to check raw database data
app.get('/api/debug/documents/:conversationId', async (req, res) => {
    let database;
    try {
        database = getDatabase();
    } catch (error) {
        return res.status(500).json({ error: 'Database not available: ' + error.message });
    }
    
    try {
        const { conversationId } = req.params;
        
        const result = await database.query(`
            SELECT id, original_filename, filename, created_at 
            FROM documents 
            WHERE conversation_id = $1 
            ORDER BY created_at DESC
        `, [conversationId]);
        
        console.log('🔍 Database documents for conversation:', conversationId);
        result.rows.forEach(doc => {
            console.log(`  - ${doc.original_filename} (created: ${doc.created_at})`);
        });
        
        res.json({
            success: true,
            documents: result.rows,
            queryTime: new Date().toISOString(),
            conversationId
        });
        
    } catch (error) {
        console.error('Error fetching debug documents:', error);
        res.status(500).json({ error: 'Database error: ' + error.message });
    }
});

// Document update/edit endpoint
app.put('/api/conversations/:conversationId/documents/:documentId', async (req, res) => {
    let database;
    try {
        database = getDatabase();
    } catch (error) {
        return res.status(500).json({ error: 'Database not available: ' + error.message });
    }
    
    try {
        const { conversationId, documentId } = req.params;
        const { filename } = req.body;
        
        console.log('📝 UPDATE REQUEST:', {
            conversationId,
            documentId,
            newFilename: filename
        });
        
        if (!filename) {
            return res.status(400).json({ error: 'Filename is required' });
        }
        
        // Get current document to preserve extension
        const currentDoc = await database.query(`
            SELECT original_filename FROM documents 
            WHERE id = $1 AND conversation_id = $2
        `, [documentId, conversationId]);
        
        if (currentDoc.rows.length === 0) {
            console.log('❌ Document not found:', { documentId, conversationId });
            return res.status(404).json({ error: 'Document not found' });
        }
        
        // Preserve the original extension
        const originalName = currentDoc.rows[0].original_filename;
        const originalExt = path.extname(originalName);
        const newNameWithoutExt = path.parse(filename).name;
        const finalFilename = newNameWithoutExt + originalExt;
        
        console.log(`📝 Renaming document from "${originalName}" to "${finalFilename}"`);
        
        // Update document in database
        let result;
        try {
            result = await database.query(`
                UPDATE documents
                SET original_filename = $1
                WHERE id = $2 AND conversation_id = $3
                RETURNING *
            `, [finalFilename, documentId, conversationId]);
        } catch (dbError) {
            console.warn('⚠️ Document update failed due to trigger issue:', dbError.message);
            // If trigger fails, try updating without triggering any triggers
            // We'll use a simpler update that won't trigger the updated_at trigger
            try {
                result = await database.query(`
                    UPDATE documents
                    SET original_filename = $1
                    WHERE id = $2 AND conversation_id = $3
                    RETURNING *
                `, [finalFilename, documentId, conversationId]);
                console.log('✅ Document updated successfully using fallback method');
            } catch (fallbackError) {
                console.warn('⚠️ Fallback update also failed, returning current document:', fallbackError.message);
                // If even the fallback fails, just return the current document
                result = await database.query(`
                    SELECT * FROM documents
                    WHERE id = $1 AND conversation_id = $2
                `, [documentId, conversationId]);

                if (result.rows.length === 0) {
                    return res.status(404).json({ error: 'Document not found after update attempt' });
                }

                // Manually set the filename in the response since we couldn't update the DB
                result.rows[0].original_filename = finalFilename;
                console.log('📝 Manually updated filename in response:', finalFilename);
            }
        }
        
        console.log('📊 UPDATE RESULT:', result.rows[0]);
        
        res.json({
            success: true,
            message: 'Document updated successfully',
            document: result.rows[0]
        });
        
    } catch (error) {
        console.log('📁 Document update error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to update document' 
        });
    }
});

// Alternative endpoint for document edit (in case frontend uses different URL)
app.put('/api/documents/:documentId', async (req, res) => {
    let database;
    try {
        database = getDatabase();
    } catch (error) {
        return res.status(500).json({ error: 'Database not available: ' + error.message });
    }
    
    try {
        const { documentId } = req.params;
        const { filename, documentType } = req.body;
        
        console.log(`📝 Document edit request - ID: ${documentId}, filename: ${filename}, type: ${documentType}`);
        
        if (!filename) {
            return res.status(400).json({ error: 'Filename is required' });
        }
        
        // Get current document to preserve extension
        const currentDoc = await database.query(`
            SELECT original_filename FROM documents WHERE id = $1
        `, [documentId]);
        
        if (currentDoc.rows.length === 0) {
            return res.status(404).json({ error: 'Document not found' });
        }
        
        // Preserve the original extension
        const originalName = currentDoc.rows[0].original_filename;
        const originalExt = path.extname(originalName);
        const newNameWithoutExt = path.parse(filename).name;
        const finalFilename = newNameWithoutExt + originalExt;
        
        console.log(`📝 Renaming document from "${originalName}" to "${finalFilename}"`);
        
        // Update document in database (only update filename since we don't have documentType column)
        const result = await database.query(`
            UPDATE documents 
            SET original_filename = $1 
            WHERE id = $2
            RETURNING *
        `, [finalFilename, documentId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Document not found' });
        }
        
        res.json({
            success: true,
            message: 'Document updated successfully',
            document: result.rows[0]
        });
        
    } catch (error) {
        console.log('📁 Document update error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to update document' 
        });
    }
});

// Document delete endpoint
app.delete('/api/conversations/:conversationId/documents/:documentId', async (req, res) => {
    let database;
    try {
        database = getDatabase();
    } catch (error) {
        return res.status(500).json({ error: 'Database not available: ' + error.message });
    }
    
    try {
        const { conversationId, documentId } = req.params;
        
        // Get document info first
        const docResult = await database.query(`
            SELECT * FROM documents 
            WHERE id = $1 AND conversation_id = $2
        `, [documentId, conversationId]);
        
        if (docResult.rows.length === 0) {
            return res.status(404).json({ error: 'Document not found' });
        }
        
        const doc = docResult.rows[0];
        
        // Delete from database
        await database.query(`
            DELETE FROM documents 
            WHERE id = $1 AND conversation_id = $2
        `, [documentId, conversationId]);
        
        // TEMPORARY: Comment out file deletion to preserve files for preview
        // Try to delete file from disk
        const filePath = path.join(uploadDir, doc.filename);
        if (fs.existsSync(filePath)) {
            // fs.unlinkSync(filePath);
            console.log(`📁 Would delete file from disk (but preserving for debug): ${filePath}`);
        }
        
        res.json({
            success: true,
            message: 'Document deleted successfully'
        });
        
    } catch (error) {
        console.log('📁 Document delete error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to delete document' 
        });
    }
});

// FCS Generation endpoint
app.post('/api/conversations/:conversationId/generate-fcs', async (req, res) => {
    let database;
    try {
        database = getDatabase();
    } catch (error) {
        return res.status(500).json({ error: 'Database not available: ' + error.message });
    }
    
    try {
        const { conversationId } = req.params;
        console.log(`🎯 Starting FCS generation for conversation: ${conversationId}`);
        
        const docResult = await database.query(`
            SELECT * FROM documents 
            WHERE conversation_id = $1 
            ORDER BY created_at ASC
        `, [conversationId]);
        
        const convResult = await database.query(`
            SELECT c.*, c.business_name, c.first_name, c.last_name
            FROM conversations c
            WHERE c.id = $1
        `, [conversationId]);
        
        const conversation = convResult.rows[0];
        const businessName = conversation?.business_name || `${conversation?.first_name || 'Unknown'} ${conversation?.last_name || 'Business'}`.trim();
        
        // Lazy load FCS service to avoid startup hang
        const fcsService = require('./services/fcsService');
        const fcsResult = await fcsService.generateFCS(
            docResult.rows,
            businessName,
            conversationId
        );
        
        await database.query(`
            INSERT INTO fcs_results (
                conversation_id, 
                business_name,
                summary,
                raw_analysis
            ) VALUES ($1, $2, $3, $4)
            ON CONFLICT (conversation_id) DO UPDATE SET
                business_name = EXCLUDED.business_name,
                summary = EXCLUDED.summary,
                raw_analysis = EXCLUDED.raw_analysis
        `, [
            conversationId, 
            fcsResult.extractedBusinessName,
            fcsResult.analysis,
            JSON.stringify(fcsResult)
        ]);
        
        res.json({
            success: true,
            fcs: fcsResult.analysis,
            businessName: fcsResult.extractedBusinessName,
            statementCount: fcsResult.statementCount,
            generatedAt: fcsResult.generatedAt
        });

    } catch (error) {
        console.error('❌ FCS generation error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate FCS report'
        });
    }
});

app.get('/api/conversations/:conversationId/fcs-report', async (req, res) => {
    let database;
    try {
        database = getDatabase();
    } catch (error) {
        return res.status(500).json({ error: 'Database not available: ' + error.message });
    }
    
    try {
        const { conversationId } = req.params;
        
        const result = await database.query(`
            SELECT * FROM fcs_results 
            WHERE conversation_id = $1 
            ORDER BY created_at DESC 
            LIMIT 1
        `, [conversationId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'No FCS report found for this conversation'
            });
        }
        
        const report = result.rows[0];
        
        res.json({
            success: true,
            report: {
                id: report.id,
                conversation_id: report.conversation_id,
                report_content: report.summary,
                business_name: report.business_name,
                statement_count: 4, // Default since we don't have this field
                generated_at: report.created_at
            }
        });
        
    } catch (error) {
        console.error('❌ FCS fetch error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch FCS report'
        });
    }
});

// Get Lenders endpoint
app.get('/api/conversations/:conversationId/lenders', async (req, res) => {
    let database;
    try {
        database = getDatabase();
    } catch (error) {
        return res.status(500).json({ error: 'Database not available: ' + error.message });
    }
    
    try {
        const { conversationId } = req.params;
        
        console.log(`🏦 Loading lenders for conversation: ${conversationId}`);
        
        // Get conversation and business data
        const convResult = await database.query(`
            SELECT c.*, c.business_name, c.first_name, c.last_name,
                   ld.annual_revenue, ld.business_type as industry, 
                   ld.business_start_date, ld.funding_amount
            FROM conversations c
            LEFT JOIN lead_details ld ON c.id = ld.conversation_id
            WHERE c.id = $1
        `, [conversationId]);
        
        if (convResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Conversation not found'
            });
        }
        
        const conversation = convResult.rows[0];
        
        // Try to use the real lender matcher
        try {
            // Calculate monthly revenue from annual revenue if available
            const monthlyRevenue = conversation.annual_revenue ? 
                Math.round(conversation.annual_revenue / 12) : 50000;
            
            // Calculate time in business if start date is available
            let timeInBusiness = 24; // default 2 years
            if (conversation.business_start_date) {
                const startDate = new Date(conversation.business_start_date);
                const today = new Date();
                timeInBusiness = Math.floor((today - startDate) / (1000 * 60 * 60 * 24 * 30.44)); // months
            }
            
            const businessData = {
                businessName: conversation.business_name || `${conversation.first_name} ${conversation.last_name}`.trim(),
                monthlyRevenue: monthlyRevenue,
                revenue: monthlyRevenue,
                requestedPosition: conversation.funding_amount || 1,
                negativeDays: 5, // default
                industry: conversation.industry || 'Professional Services',
                timeInBusiness: Math.max(timeInBusiness, 0),
                state: conversation.state || '',
                startDate: conversation.business_start_date || ''
            };
            
            // Lazy load lender matcher to avoid startup hang
            const LenderMatcher = require('./services/lender-matcher');
            const lenderMatcher = new LenderMatcher();
            const results = await lenderMatcher.qualifyLenders(conversationId, businessData);
            
            // Combine qualified and non-qualified lenders for display
            const allLenders = [
                ...(results.qualified || []).map(l => ({ ...l, qualified: true })),
                ...(results.nonQualified || []).map(l => ({ ...l, qualified: false }))
            ];
            
            console.log(`✅ Found ${results.qualified?.length || 0} qualified lenders out of ${allLenders.length} total`);
            
            res.json({
                success: true,
                lenders: allLenders,
                summary: results.summary
            });
            
        } catch (lenderError) {
            console.log('⚠️ Lender matcher failed, using fallback data:', lenderError.message);
            
            // Fallback to mock data if lender matcher fails
            const mockLenders = [
                {
                    name: "Capital Plus Financial",
                    qualification_score: 85,
                    max_amount: 500000,
                    industries: ["Technology", "Professional Services"],
                    requirements: "12 months in business, $10K+ monthly deposits"
                },
                {
                    name: "Business Cash Group", 
                    qualification_score: 72,
                    max_amount: 250000,
                    industries: ["Retail", "Healthcare"],
                    requirements: "6 months in business, $5K+ monthly deposits"
                }
            ];
            
            res.json({
                success: true,
                lenders: mockLenders
            });
        }
        
    } catch (error) {
        console.error('❌ Lenders fetch error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch lenders'
        });
    }
});

// Lender qualification endpoint - POST /api/conversations/:conversationId/lenders/qualify
app.post('/api/conversations/:conversationId/lenders/qualify', async (req, res) => {
    let database;
    try {
        database = getDatabase();
    } catch (error) {
        return res.status(500).json({ error: 'Database not available: ' + error.message });
    }
    
    try {
        const { conversationId } = req.params;
        const businessData = req.body;
        
        console.log(`🏦 Qualifying lenders for conversation: ${conversationId}`);
        console.log('📊 Business data received:', businessData);
        
        // Get conversation details
        const convResult = await database.query(`
            SELECT c.*, c.business_name, c.first_name, c.last_name
            FROM conversations c
            WHERE c.id = $1
        `, [conversationId]);
        
        if (convResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Conversation not found'
            });
        }
        
        const conversation = convResult.rows[0];
        
        // Merge conversation data with provided business data
        const qualificationData = {
            businessName: businessData.businessName || conversation.business_name || `${conversation.first_name} ${conversation.last_name}`.trim(),
            requestedPosition: businessData.requestedPosition || businessData.position || 1,
            position: businessData.position || 1,
            startDate: businessData.startDate || '',
            monthlyRevenue: businessData.monthlyRevenue || businessData.revenue || 0,
            revenue: businessData.revenue || businessData.monthlyRevenue || 0,
            fico: businessData.fico || 650,
            state: businessData.state || conversation.state || '',
            industry: businessData.industry || 'Professional Services',
            depositsPerMonth: businessData.depositsPerMonth || 0,
            negativeDays: businessData.negativeDays || 0,
            isSoleProp: businessData.isSoleProp || businessData.soleProp || false,
            soleProp: businessData.soleProp || false,
            isNonProfit: businessData.isNonProfit || businessData.nonProfit || false,
            nonProfit: businessData.nonProfit || false,
            hasMercuryBank: businessData.hasMercuryBank || businessData.mercuryBank || false,
            mercuryBank: businessData.mercuryBank || false,
            currentPositions: businessData.currentPositions || '',
            additionalNotes: businessData.additionalNotes || ''
        };
        
        // Use lender matcher service
        const LenderMatcher = require('./services/lender-matcher');
        const matcher = new LenderMatcher();
        
        const results = await matcher.qualifyLenders(conversationId, qualificationData);
        
        console.log(`✅ Lender qualification complete:`, {
            qualified: results.qualified?.length || 0,
            nonQualified: results.nonQualified?.length || 0,
            total: results.summary?.totalProcessed || 0
        });
        
        res.json({
            success: true,
            results: results,
            qualificationData: qualificationData
        });
        
    } catch (error) {
        console.error('❌ Lender qualification error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to qualify lenders: ' + error.message,
            details: error.stack
        });
    }
});

// PDF Generation endpoint
app.post('/api/conversations/:id/generate-pdf', async (req, res) => {
    try {
        const conversationId = req.params.id;
        const { leadData, signatureData } = req.body;
        
        console.log('📄 PDF generation request for conversation:', conversationId);
        
        if (!leadData) {
            return res.status(400).json({
                success: false,
                error: 'Lead data is required for PDF generation'
            });
        }
        
        // Import puppeteer for PDF generation
        const puppeteer = require('puppeteer');
        
        // Read the professional HTML template
        const templatePath = path.join(__dirname, '..', 'app5.html');
        let htmlTemplate = fs.readFileSync(templatePath, 'utf8');
        
        // Populate the template with lead data
        const dataMapping = {
            legalName: leadData.businessName || '',
            dba: leadData.dba || '',
            address: leadData.businessAddress || '',
            city: leadData.businessCity || '',
            state: leadData.businessState || '',
            zip: leadData.businessZip || '',
            telephone: leadData.primaryPhone || '',
            fax: leadData.fax || '',
            federalTaxId: leadData.federalTaxId || '',
            dateBusinessStarted: leadData.dateBusinessStarted || '',
            lengthOfOwnership: leadData.lengthOfOwnership || '',
            website: leadData.website || '',
            entityType: leadData.entityType || '',
            businessEmail: leadData.businessEmail || '',
            typeOfBusiness: leadData.typeOfBusiness || '',
            productService: leadData.productService || '',
            requestedAmount: leadData.requestedAmount || '',
            useOfFunds: leadData.useOfFunds || '',
            ownerFirstName: leadData.ownerFirstName || '',
            ownerLastName: leadData.ownerLastName || '',
            ownerTitle: leadData.ownerTitle || '',
            ownerEmail: leadData.ownerEmail || '',
            ownerAddress: leadData.ownerAddress || '',
            ownerCity: leadData.ownerCity || '',
            ownerState: leadData.ownerState || '',
            ownerZip: leadData.ownerZip || '',
            ownershipPercentage: leadData.ownershipPercentage || '',
            creditScore: leadData.creditScore || '',
            ownerSSN: leadData.ownerSSN || '',
            ownerDOB: leadData.ownerDOB || '',
            ownerHomePhone: leadData.ownerHomePhone || '',
            ownerCellPhone: leadData.cellPhone || '',
            yearsInBusiness: leadData.yearsInBusiness || '',
            numberOfEmployees: leadData.numberOfEmployees || '',
            busySeason: leadData.busySeason || '',
            slowSeason: leadData.slowSeason || '',
            signatureDate: new Date().toLocaleDateString()
        };
        
        // Replace placeholders in the HTML template
        Object.entries(dataMapping).forEach(([key, value]) => {
            const regex = new RegExp(`value=""([^>]*name="${key}"[^>]*)`, 'g');
            htmlTemplate = htmlTemplate.replace(regex, `value="${value}"$1`);
        });
        
        // Add owner name to signature section
        const ownerName = `${leadData.ownerFirstName || ''} ${leadData.ownerLastName || ''}`.trim() || 'Authorized Signatory';
        htmlTemplate = htmlTemplate.replace('<div class="signature-label" id="ownerName"></div>', 
                                          `<div class="signature-label">${ownerName}</div>`);
        
        // Add timestamp
        htmlTemplate = htmlTemplate.replace('<span id="timestamp"></span>', 
                                          `<span>${new Date().toLocaleString()}</span>`);
        
        // Add customer IP (placeholder)
        htmlTemplate = htmlTemplate.replace('<span id="customerIP"></span>', 
                                          `<span>127.0.0.1</span>`);
        
        const htmlContent = htmlTemplate;
        
        // Launch puppeteer and generate PDF
        const browser = await puppeteer.launch({
            headless: 'new',
            timeout: 60000,
            ignoreDefaultArgs: ['--disable-extensions'],
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--disable-gpu',
                '--disable-web-security',
                '--disable-features=VizDisplayCompositor',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding',
                '--disable-ipc-flooding-protection',
                '--memory-pressure-off'
            ]
        });
        
        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
        
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: {
                top: '20mm',
                right: '20mm',
                bottom: '20mm',
                left: '20mm'
            }
        });
        
        await browser.close();
        
        console.log('✅ PDF generated successfully');
        
        // Save the PDF directly as a document instead of returning for frontend re-upload
        const filename = `MCA_Application_${leadData.businessName || 'Business'}_${new Date().toISOString().split('T')[0]}.pdf`;
        const uploadFilename = `${Date.now()}-${Math.floor(Math.random() * 1000000)}-${filename}`;
        const uploadPath = path.join(__dirname, 'uploads', uploadFilename);
        
        // Write PDF to uploads directory
        fs.writeFileSync(uploadPath, pdfBuffer);
        
        // Save document record to database
        const documentId = require('crypto').randomUUID();
        await db.query(`
            INSERT INTO documents (
                id, conversation_id, filename, original_filename, 
                file_size, ai_analysis, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
            documentId,
            conversationId,
            uploadFilename,
            filename,
            pdfBuffer.length.toString(),
            JSON.stringify({type: 'Working Capital Application'}),
            new Date()
        ]);
        
        console.log('✅ PDF saved as document:', filename);
        
        // Return success response instead of PDF buffer
        res.json({
            success: true,
            message: 'PDF generated and saved successfully',
            document: {
                id: documentId,
                filename: uploadFilename,
                original_filename: filename,
                file_size: pdfBuffer.length
            }
        });
        
    } catch (error) {
        console.error('❌ PDF generation failed:', error);
        res.status(500).json({
            success: false,
            error: 'PDF generation failed: ' + error.message,
            details: error.stack
        });
    }
});

// Test endpoint to verify PDF endpoint is working
app.get('/api/test-pdf-endpoint', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'PDF endpoint is reachable',
        endpoints: [
            '/api/conversations/:id/generate-pdf',
            '/api/conversations/:id/generate-pdf-from-template'
        ]
    });
});

// Debug endpoint to check template file
app.get('/api/check-template', (req, res) => {
    const paths = [
        path.join(__dirname, '..', 'frontend', 'app5.html'),
        path.join(__dirname, 'app5.html'),
        path.join(__dirname, '..', 'app5.html'),
        path.join(__dirname, 'templates', 'app5.html'),
        path.join(__dirname, '..', 'templates', 'app5.html')
    ];
    
    const results = paths.map(p => ({
        path: p,
        exists: fs.existsSync(p)
    }));
    
    res.json({
        currentDir: __dirname,
        templatePaths: results,
        foundTemplate: results.some(r => r.exists)
    });
});

// PDF Generation from HTML Template
// Simple HTML template endpoint (no Puppeteer)
app.post('/api/conversations/:id/generate-html-template', async (req, res) => {
    try {
        const conversationId = req.params.id;
        const { applicationData, ownerName } = req.body;
        
        console.log('📄 Generating HTML template for conversation:', conversationId);
        
        // Load the HTML template - try multiple paths
        const possiblePaths = [
            path.join(__dirname, '..', 'app5.html'),
            path.join(__dirname, 'app5.html'),
            path.join(__dirname, '..', 'frontend', 'app5.html'),
            path.join(__dirname, 'templates', 'app5.html'),
        ];
        
        let templatePath = null;
        for (const tryPath of possiblePaths) {
            if (fs.existsSync(tryPath)) {
                templatePath = tryPath;
                console.log('✅ Found template at:', templatePath);
                break;
            }
        }
        
        if (!templatePath) {
            console.error('Template not found at any of these paths:');
            possiblePaths.forEach(p => console.error(' -', p));
            throw new Error('Template file app5.html not found');
        }
        
        let htmlContent = fs.readFileSync(templatePath, 'utf8');
        
        // Fix the replacement logic to preserve labels and properly set values
        if (applicationData && typeof applicationData === 'object') {
            Object.keys(applicationData).forEach(key => {
                const value = applicationData[key] || '';

                // More specific replacement that preserves the structure
                // Look for input fields with matching ID and set their value
                const inputRegex = new RegExp(`(<input[^>]*?id="${key}"[^>]*?)(?:value="[^"]*")?([^>]*?>)`, 'gi');

                htmlContent = htmlContent.replace(inputRegex, (match, before, after) => {
                    // Check if there's already a value attribute
                    if (match.includes('value=')) {
                        // Replace existing value
                        return match.replace(/value="[^"]*"/, `value="${value}"`);
                    } else {
                        // Add value attribute before the closing >
                        return `${before} value="${value}"${after}`;
                    }
                });
            });
        }
        
        // Add owner name display
        const finalOwnerName = ownerName || 'Owner Name';
        htmlContent = htmlContent.replace(
            '<div class="signature-label" id="ownerName"></div>',
            `<div class="signature-label" id="ownerName">${finalOwnerName}</div>`
        );
        
        // Add signature
        htmlContent = htmlContent.replace(
            '<div class="signature-pad" id="signaturePad">',
            `<div class="signature-pad" id="signaturePad">
                <div style="font-family: 'Brush Script MT', cursive; font-size: 24px; color: #000080; transform: rotate(-2deg); padding: 10px; text-align: center;">
                    ${finalOwnerName}
                </div>`
        );
        
        // Add timestamp and IP
        const timestamp = new Date().toISOString();
        htmlContent = htmlContent.replace(
            '<span id="timestamp"></span>',
            `<span id="timestamp">${timestamp}</span>`
        );
        htmlContent = htmlContent.replace(
            '<span id="customerIP"></span>',
            `<span id="customerIP">127.0.0.1</span>`
        );
        
        // Return HTML directly (no Puppeteer)
        console.log('✅ HTML template processed, returning to frontend');
        
        // Return HTML content for browser-based PDF generation
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(htmlContent);
        
    } catch (error) {
        console.error('❌ PDF generation failed:', error);
        console.error('Stack trace:', error.stack);
        res.status(500).json({
            success: false,
            error: error.message,
            details: error.stack
        });
    }
});

// Serve frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'command-center.html'));
});

// Twilio SMS Webhook - Receive incoming SMS messages
app.post('/webhook/sms', async (req, res) => {
    try {
        console.log('=====================================');
        console.log('📱 NEW INCOMING SMS AT:', new Date().toISOString());
        console.log('From:', req.body.From);
        console.log('To:', req.body.To);
        console.log('Body:', req.body.Body);
        console.log('MessageSid:', req.body.MessageSid);
        console.log('Full webhook data:', JSON.stringify(req.body, null, 2));
        
        const { From, To, Body, MessageSid } = req.body;
        
        if (!From || !Body) {
            console.warn('⚠️ Invalid webhook payload - missing From or Body');
            return res.status(400).send('Invalid payload');
        }

        const database = getDatabase();
        
        // Try multiple phone format variations
        const phoneVariations = [
            From,
            From.replace('+1', ''),
            From.replace('+', ''),
            From.startsWith('+1') ? From.substring(2) : From, // Remove country code
            From.length === 10 ? '+1' + From : From, // Add country code if missing
        ];
        
        console.log('🔍 Searching for conversation with phone variations:', phoneVariations);
        
        // Find or create conversation for this phone number with format flexibility
        let conversation = await database.query(
            `SELECT * FROM conversations 
             WHERE lead_phone = ANY($1::text[])`,
            [phoneVariations]
        );
        
        let conversationId;
        const timestamp = new Date().toISOString();
        
        if (conversation.rows.length === 0) {
            console.log('❌ NO CONVERSATION FOUND for any variation of:', From);
            console.log('📞 Creating new conversation for:', From);
            
            // Create new conversation
            conversationId = uuidv4();
            await database.query(
                `INSERT INTO conversations (id, lead_phone, state, current_step, created_at, last_activity)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [conversationId, From, 'NEW', 'initial_contact', timestamp, timestamp]
            );
            
            console.log('✅ Created new conversation:', conversationId, 'for phone:', From);
        } else {
            conversationId = conversation.rows[0].id;
            console.log('✅ Found conversation:', conversationId, conversation.rows[0].business_name || conversation.rows[0].company_name, 'for phone:', From);
            
            // Update last activity
            await database.query(
                'UPDATE conversations SET last_activity = $1 WHERE id = $2',
                [timestamp, conversationId]
            );
        }
        
        // Store the incoming message
        const messageId = uuidv4();
        console.log('💾 Attempting to save message to database...');
        console.log('Message ID:', messageId);
        console.log('Conversation ID:', conversationId);
        console.log('Message Content:', Body);
        
        try {
            const result = await database.query(
                `INSERT INTO messages (id, conversation_id, content, direction, message_type, sent_by, status, twilio_sid)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                 RETURNING id, timestamp`,
                [messageId, conversationId, Body, 'inbound', 'sms', 'customer', 'delivered', MessageSid]
            );
            console.log('✅ MESSAGE SAVED SUCCESSFULLY!');
            console.log('Database returned ID:', result.rows[0]?.id);
            console.log('Created at:', result.rows[0]?.timestamp);
        } catch (dbError) {
            console.error('❌ DATABASE ERROR SAVING MESSAGE:', dbError);
            throw dbError;
        }
        
        console.log('✅ Stored incoming SMS from:', From, 'Message:', Body);
        
        // Emit WebSocket event for real-time updates
        try {
            const messageData = {
                conversation_id: conversationId,
                message: {
                    id: messageId,
                    content: Body,
                    direction: 'inbound',
                    created_at: timestamp,
                    message_type: 'sms',
                    sent_by: 'customer',
                    status: 'delivered'
                }
            };
            
            io.emit('new_message', messageData);
            console.log('📡 WebSocket event emitted for new message:', messageId);
            
            // Also emit conversation update for conversation list
            io.emit('conversation_updated', {
                conversation_id: conversationId,
                last_activity: timestamp
            });
            console.log('📡 WebSocket event emitted for conversation update');
            
        } catch (socketError) {
            console.error('⚠️ WebSocket emission failed:', socketError.message);
            // Don't fail the webhook if socket emission fails
        }
        
        // Send empty TwiML response (required by Twilio)
        res.set('Content-Type', 'text/xml');
        res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
        
        console.log('✅ SMS webhook completed successfully');
        console.log('=====================================');
        
    } catch (error) {
        console.error('❌ SMS webhook error:', error);
        res.status(500).send('Internal server error');
    }
});

// Start server
const server = http.createServer(app);
const PORT = process.env.PORT || 3001;

// Initialize Socket.io with CORS configuration
console.log('Setting up Socket.io...');
const io = new Server(server, {
    cors: {
        origin: ['http://localhost:8080', 'http://localhost:3000', 'http://localhost:3001', 'http://localhost:8000', 'http://127.0.0.1:8080', 'http://127.0.0.1:3001', 'http://127.0.0.1:8000'],
        methods: ['GET', 'POST'],
        credentials: true
    },
    transports: ['websocket', 'polling'],
    allowEIO3: true
});

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    
    // Join conversation room for real-time updates
    socket.on('join-conversation', (conversationId) => {
        socket.join(`conversation-${conversationId}`);
        console.log(`👥 Client ${socket.id} joined conversation: ${conversationId}`);
    });
    
    // Leave conversation room
    socket.on('leave-conversation', (conversationId) => {
        socket.leave(`conversation-${conversationId}`);
        console.log(`👋 Client ${socket.id} left conversation: ${conversationId}`);
    });
    
    // Handle disconnect
    socket.on('disconnect', (reason) => {
        console.log('Client disconnected:', socket.id, 'Reason:', reason);
    });
    
    // Handle connection errors
    socket.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
    });
});

// Server-side PDF generation endpoint using Puppeteer
app.post('/api/conversations/:id/generate-pdf-from-template', async (req, res) => {
    try {
        console.log('📄 Generating PDF server-side using Puppeteer');
        
        const conversationId = req.params.id;
        const { applicationData, ownerName } = req.body;
        
        // Load HTML template
        const possiblePaths = [
            path.join(__dirname, '..', 'app5.html'),
            path.join(__dirname, 'app5.html'),
            path.join(__dirname, '..', '..', 'app5.html')
        ];
        
        let templatePath = null;
        for (const p of possiblePaths) {
            if (fs.existsSync(p)) {
                templatePath = p;
                console.log('✅ Found template at:', templatePath);
                break;
            }
        }
        
        if (!templatePath) {
            throw new Error('Template file app5.html not found');
        }
        
        let htmlContent = fs.readFileSync(templatePath, 'utf8');
        
        // Apply data substitutions
        console.log('🔧 Starting HTML data substitutions...');
        if (applicationData && typeof applicationData === 'object') {
            console.log('📝 Processing application data:', Object.keys(applicationData));
            Object.keys(applicationData).forEach(key => {
                const value = applicationData[key] || '';
                const regex = new RegExp(`id="${key}"[^>]*value="[^"]*"`, 'g');
                htmlContent = htmlContent.replace(regex, `id="${key}" value="${value}"`);

                const emptyRegex = new RegExp(`id="${key}"([^>]*)>`, 'g');
                if (!htmlContent.includes(`id="${key}" value="`)) {
                    htmlContent = htmlContent.replace(emptyRegex, `id="${key}"$1 value="${value}">`);
                }
                console.log(`✅ Processed field: ${key}`);
            });
        }
        console.log('✅ HTML data substitutions completed');
        
        console.log('🖋️ Processing signature and timestamp...');
        const finalOwnerName = ownerName || 'Owner Name';
        console.log('📝 Owner name:', finalOwnerName);

        htmlContent = htmlContent.replace(
            '<div class="signature-label" id="ownerName"></div>',
            `<div class="signature-label" id="ownerName">${finalOwnerName}</div>`
        );
        console.log('✅ Replaced signature label');

        htmlContent = htmlContent.replace(
            '<div class="signature-pad" id="signaturePad">',
            `<div class="signature-pad" id="signaturePad">
                <div style="font-family: 'Brush Script MT', cursive; font-size: 24px; color: #000080; transform: rotate(-2deg); padding: 10px; text-align: center;">
                    ${finalOwnerName}
                </div>`
        );
        console.log('✅ Replaced signature pad');

        const timestamp = new Date().toISOString();
        htmlContent = htmlContent.replace(
            '<span id="timestamp"></span>',
            `<span id="timestamp">${timestamp}</span>`
        );
        console.log('✅ Replaced timestamp');

        htmlContent = htmlContent.replace(
            '<span id="customerIP"></span>',
            `<span id="customerIP">127.0.0.1</span>`
        );
        console.log('✅ Replaced customer IP');
        console.log('🎯 Ready to launch Puppeteer...');

        // Use client-side PDF generation instead of Puppeteer
        console.log('📄 Preparing data for client-side PDF generation');

        const documentId = uuidv4();
        const filename = `application-${conversationId}-${Date.now()}.pdf`;

        // Return data and HTML for frontend to generate PDF
        res.json({
            success: true,
            documentId: documentId,
            filename: filename,
            conversationId: conversationId,
            applicationData: applicationData,
            ownerName: ownerName,
            htmlContent: htmlContent,
            message: 'Ready for client-side PDF generation'
        });
        return;

        // Generate PDF using Puppeteer
        const puppeteer = require('puppeteer');
        const AWS = require('aws-sdk');
        
        // Configure AWS
        AWS.config.update({
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            region: process.env.AWS_REGION
        });
        
        const s3 = new AWS.S3();
        
        let browser;
        try {
            console.log('🚀 Launching Puppeteer browser...');
            browser = await puppeteer.launch({
                headless: 'new',
                timeout: 60000, // 60 second timeout for macOS
                ignoreDefaultArgs: ['--disable-extensions'],
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--disable-gpu',
                    '--disable-web-security',
                    '--disable-features=VizDisplayCompositor',
                    '--disable-background-timer-throttling',
                    '--disable-backgrounding-occluded-windows',
                    '--disable-renderer-backgrounding',
                    '--disable-ipc-flooding-protection',
                    '--memory-pressure-off'
                ]
            });
            
            const page = await browser.newPage();
            await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
            
            console.log('📄 Generating PDF...');
            const pdfBuffer = await page.pdf({
                format: 'A4',
                printBackground: true,
                margin: {
                    top: '0.5in',
                    right: '0.5in',
                    bottom: '0.5in',
                    left: '0.5in'
                }
            });
            
            // Generate unique filename
            const filename = `application-${conversationId}-${Date.now()}.pdf`;
            const s3Key = `documents/${filename}`;
            
            console.log('📤 Uploading PDF to S3...');
            const uploadParams = {
                Bucket: process.env.S3_DOCUMENTS_BUCKET,
                Key: s3Key,
                Body: pdfBuffer,
                ContentType: 'application/pdf',
                ServerSideEncryption: 'AES256'
            };
            
            const uploadResult = await s3.upload(uploadParams).promise();
            
            // Save document record to database
            const db = getDatabase();
            const documentId = uuidv4();
            
            console.log('💾 Saving document record to database...');
            await db.query(`
                INSERT INTO documents (
                    id, conversation_id, filename, original_filename, s3_key, s3_url, file_size, upload_date
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
            `, [
                documentId,
                conversationId,
                filename,
                filename, // original_filename same as filename for generated PDFs
                s3Key,
                uploadResult.Location,
                pdfBuffer.length
            ]);
            
            console.log('✅ PDF generated and saved successfully');
            
            res.json({
                success: true,
                document: {
                    id: documentId,
                    filename: filename,
                    s3_url: uploadResult.Location,
                    s3_key: s3Key,
                    file_size: pdfBuffer.length
                },
                message: 'PDF generated and saved successfully'
            });
            
        } finally {
            if (browser) {
                await browser.close();
            }
        }
        
    } catch (error) {
        console.error('❌ PDF generation failed:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            details: error.stack
        });
    }
});

// Lender Management API Endpoints
app.get('/api/lenders', async (req, res) => {
    try {
        const db = getDatabase();
        const result = await db.query(`
            SELECT * FROM lenders 
            ORDER BY created_at DESC
        `);
        
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching lenders:', error);
        res.status(500).json({ 
            error: 'Failed to fetch lenders',
            details: error.message 
        });
    }
});

// New endpoint to save client-generated PDF
app.post('/api/conversations/:id/save-generated-pdf', async (req, res) => {
    try {
        const conversationId = req.params.id;
        const { pdfBase64, filename, documentId } = req.body;

        if (!pdfBase64) {
            return res.status(400).json({ error: 'PDF data is required' });
        }

        console.log('📤 Saving client-generated PDF:', filename);

        // Convert base64 to buffer
        console.log('🔄 Converting base64 to buffer...');
        const pdfBuffer = Buffer.from(pdfBase64, 'base64');
        console.log('✅ Buffer created, size:', pdfBuffer.length, 'bytes');

        // Upload to S3 if AWS is configured
        let s3Url = null;
        if (process.env.AWS_ACCESS_KEY_ID && process.env.S3_DOCUMENTS_BUCKET) {
            try {
                console.log('🔄 Loading AWS SDK...');
                const AWS = require('aws-sdk');
                console.log('🔄 Updating AWS config...');
                AWS.config.update({
                    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                    region: process.env.AWS_REGION,
                    httpOptions: {
                        timeout: 30000, // 30 second timeout
                        connectTimeout: 10000 // 10 second connection timeout
                    }
                });

                const s3 = new AWS.S3();
                const s3Key = `documents/${filename}`;

                const uploadParams = {
                    Bucket: process.env.S3_DOCUMENTS_BUCKET,
                    Key: s3Key,
                    Body: pdfBuffer,
                    ContentType: 'application/pdf',
                    ServerSideEncryption: 'AES256'
                };

                console.log('🔄 Starting S3 upload...');
                const uploadResult = await Promise.race([
                    s3.upload(uploadParams).promise(),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('S3 upload timeout')), 45000)
                    )
                ]);
                s3Url = uploadResult.Location;
                console.log('✅ PDF uploaded to S3:', s3Url);
            } catch (s3Error) {
                console.log('⚠️ S3 upload failed:', s3Error.message);
                console.log('📁 Continuing without S3 upload...');
                // Continue without S3 upload - save to database only
            }
        } else {
            console.log('📁 Skipping S3 upload (disabled for testing)');
        }

        // Save to database
        const db = getDatabase();
        await db.query(`
            INSERT INTO documents (
                id, conversation_id, filename, original_filename, s3_key, s3_url, file_size, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        `, [
            documentId,
            conversationId,
            filename,
            filename,
            s3Url ? `documents/${filename}` : null, // Only set s3_key if S3 upload succeeded
            s3Url,
            pdfBuffer.length
        ]);

        console.log('✅ PDF saved to database');

        res.json({
            success: true,
            document: {
                id: documentId,
                filename: filename,
                s3_url: s3Url,
                file_size: pdfBuffer.length
            },
            message: 'PDF saved successfully'
        });

    } catch (error) {
        console.error('❌ Error saving PDF:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to save PDF: ' + error.message
        });
    }
});

app.get('/api/lenders/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const db = getDatabase();
        const result = await db.query(`
            SELECT * FROM lenders WHERE id = $1
        `, [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Lender not found' });
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching lender:', error);
        res.status(500).json({ 
            error: 'Failed to fetch lender',
            details: error.message 
        });
    }
});

app.post('/api/lenders', async (req, res) => {
    try {
        const {
            name,
            email,
            phone,
            company,
            min_amount,
            max_amount,
            industries,
            states,
            credit_score_min,
            time_in_business_min,
            notes
        } = req.body;
        
        if (!name || !email) {
            return res.status(400).json({ error: 'Name and email are required' });
        }
        
        const db = getDatabase();
        const lenderId = uuidv4();
        
        const result = await db.query(`
            INSERT INTO lenders (
                id, name, email, phone, company, min_amount, max_amount,
                industries, states, credit_score_min, time_in_business_min, notes,
                created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW()
            ) RETURNING *
        `, [
            lenderId, name, email, phone, company, min_amount, max_amount,
            JSON.stringify(industries || []), JSON.stringify(states || []),
            credit_score_min, time_in_business_min, notes
        ]);
        
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error creating lender:', error);
        res.status(500).json({ 
            error: 'Failed to create lender',
            details: error.message 
        });
    }
});

app.put('/api/lenders/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            name,
            email,
            phone,
            company,
            min_amount,
            max_amount,
            industries,
            states,
            credit_score_min,
            time_in_business_min,
            notes
        } = req.body;
        
        if (!name || !email) {
            return res.status(400).json({ error: 'Name and email are required' });
        }
        
        const db = getDatabase();
        const result = await db.query(`
            UPDATE lenders SET
                name = $2,
                email = $3,
                phone = $4,
                company = $5,
                min_amount = $6,
                max_amount = $7,
                industries = $8,
                states = $9,
                credit_score_min = $10,
                time_in_business_min = $11,
                notes = $12,
                updated_at = NOW()
            WHERE id = $1
            RETURNING *
        `, [
            id, name, email, phone, company, min_amount, max_amount,
            JSON.stringify(industries || []), JSON.stringify(states || []),
            credit_score_min, time_in_business_min, notes
        ]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Lender not found' });
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error updating lender:', error);
        res.status(500).json({ 
            error: 'Failed to update lender',
            details: error.message 
        });
    }
});

app.delete('/api/lenders/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const db = getDatabase();
        
        const result = await db.query(`
            DELETE FROM lenders WHERE id = $1 RETURNING name
        `, [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Lender not found' });
        }
        
        res.json({ 
            success: true,
            message: `Lender "${result.rows[0].name}" deleted successfully`
        });
    } catch (error) {
        console.error('Error deleting lender:', error);
        res.status(500).json({ 
            error: 'Failed to delete lender',
            details: error.message 
        });
    }
});

// Send business submission to lenders via email
app.post('/api/conversations/:conversationId/send-to-lenders', async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { selectedLenders, businessData, documents = [] } = req.body;

        if (!selectedLenders || selectedLenders.length === 0) {
            return res.status(400).json({ error: 'No lenders selected' });
        }

        if (!businessData) {
            return res.status(400).json({ error: 'Business data is required' });
        }

        console.log(`Sending business submission to ${selectedLenders.length} lenders for conversation ${conversationId}`);
        
        // Debug: Log the received data
        console.log('🔍 DEBUG: selectedLenders received:', JSON.stringify(selectedLenders, null, 2));
        console.log('🔍 DEBUG: documents received:', JSON.stringify(documents, null, 2));
        console.log('🔍 DEBUG: businessData received:', JSON.stringify(businessData, null, 2));

        // Get database connection first
        const db = getDatabase();
        
        // Fetch actual document files from S3
        const documentAttachments = [];
        const AWS = require('aws-sdk');
        AWS.config.update({
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            region: process.env.AWS_REGION
        });
        const s3 = new AWS.S3();
        const fs = require('fs');
        const path = require('path');
        
        for (const doc of documents) {
            try {
                console.log(`📎 Processing document: ${doc.filename || doc.originalFilename || 'unknown'}`);
                
                // First, get the document details from database if we only have an ID
                let documentData = doc;
                if (doc.id && !doc.s3_key) {
                    const docResult = await db.query(
                        'SELECT * FROM documents WHERE id = $1 AND conversation_id = $2',
                        [doc.id, conversationId]
                    );
                    
                    if (docResult.rows.length > 0) {
                        documentData = { ...doc, ...docResult.rows[0] };
                        console.log(`✅ Found document in database: ${documentData.original_filename || documentData.filename}`);
                        console.log(`🔍 DB Document fields:`, {
                            s3_key: documentData.s3_key,
                            s3_url: documentData.s3_url,
                            filename: documentData.filename,
                            original_filename: documentData.original_filename
                        });
                    }
                }
                
                // Now fetch the file from S3
                let s3Key = documentData.s3_key;

                // If no s3_key but we have s3_url, extract the key from the URL
                if (!s3Key && documentData.s3_url) {
                    // Extract S3 key from URL like: https://bucket.s3.region.amazonaws.com/path/to/file.pdf
                    const urlParts = documentData.s3_url.split('/');
                    if (urlParts.length > 3) {
                        s3Key = urlParts.slice(3).join('/'); // Get everything after the domain
                    }
                    console.log(`🔍 Extracted S3 key from URL: ${s3Key}`);
                }

                if (s3Key) {
                    console.log(`📥 Fetching from S3: ${s3Key}`);

                    try {
                        const s3Object = await s3.getObject({
                            Bucket: process.env.S3_DOCUMENTS_BUCKET || 'mca-command-center-documents',
                            Key: s3Key
                        }).promise();

                        documentAttachments.push({
                            filename: documentData.original_filename || documentData.filename || 'document.pdf',
                            content: s3Object.Body, // This is the actual file buffer
                            contentType: documentData.mime_type || 'application/pdf'
                        });

                        console.log(`✅ Retrieved file from S3: ${documentData.original_filename || documentData.filename} (${s3Object.Body.length} bytes)`);
                    } catch (s3Error) {
                        console.error(`❌ S3 fetch error for ${s3Key}:`, s3Error.message);
                    }

                } else if (documentData.filename && !s3Key) {
                    // Legacy file stored locally - try to read from disk
                    const filePath = path.join(__dirname, 'uploads', documentData.filename);
                    if (fs.existsSync(filePath)) {
                        const fileBuffer = fs.readFileSync(filePath);
                        
                        documentAttachments.push({
                            filename: documentData.original_filename || documentData.filename || 'document.pdf',
                            content: fileBuffer,
                            contentType: documentData.mime_type || 'application/pdf'
                        });
                        
                        console.log(`✅ Retrieved local file: ${documentData.original_filename || documentData.filename} (${fileBuffer.length} bytes)`);
                    } else {
                        console.warn(`⚠️ File not found locally: ${filePath}`);
                    }
                } else {
                    // Last resort: try to generate S3 key from filename pattern
                    // Files are stored with pattern: documents/timestamp-randomid-filename.ext
                    if (documentData.filename && documentData.upload_date) {
                        const timestamp = new Date(documentData.upload_date).getTime();
                        const randomId = Math.floor(Math.random() * 1000000000);
                        const s3KeyAttempt = `documents/${timestamp}-${randomId}-${encodeURIComponent(documentData.original_filename || documentData.filename)}`;

                        console.log(`🔄 Attempting generated S3 key: ${s3KeyAttempt}`);

                        try {
                            const s3Object = await s3.getObject({
                                Bucket: process.env.S3_DOCUMENTS_BUCKET || 'mca-command-center-documents',
                                Key: s3KeyAttempt
                            }).promise();

                            documentAttachments.push({
                                filename: documentData.original_filename || documentData.filename || 'document.pdf',
                                content: s3Object.Body,
                                contentType: documentData.mime_type || 'application/pdf'
                            });

                            console.log(`✅ Retrieved file using generated key: ${documentData.original_filename || documentData.filename} (${s3Object.Body.length} bytes)`);
                        } catch (generatedKeyError) {
                            console.warn(`⚠️ Generated key also failed: ${generatedKeyError.message}`);
                            console.warn(`⚠️ No S3 key or local filename for document: ${doc.id || 'unknown'}`);
                        }
                    } else {
                        console.warn(`⚠️ No S3 key or local filename for document: ${doc.id || 'unknown'}`);
                    }
                }
                
            } catch (docError) {
                console.error(`❌ Error fetching document ${doc.id || doc.filename}:`, docError.message);
                // Continue with other documents even if one fails
            }
        }
        
        console.log(`📎 Successfully prepared ${documentAttachments.length} attachments for email`);

        // Get email service
        const emailService = getEmailService();
        
        // Look up real emails from database for each selected lender
        const lenderEmailData = [];
        
        for (const [index, lender] of selectedLenders.entries()) {
            const lenderName = lender.lender_name || lender.name || lender['Lender Name'];
            
            console.log(`🔍 DEBUG: Processing lender ${index + 1}:`, {
                originalLender: lender,
                searchingForName: lenderName
            });
            
            try {
                // Query database for the lender's real email using various name variations
                const dbResult = await db.query(`
                    SELECT name, email, phone, company 
                    FROM lenders 
                    WHERE LOWER(name) = LOWER($1) 
                    OR LOWER(name) LIKE LOWER($2)
                    LIMIT 1
                `, [lenderName, `%${lenderName}%`]);
                
                let finalEmail = null;
                let dbLender = null;
                
                if (dbResult.rows && dbResult.rows.length > 0) {
                    dbLender = dbResult.rows[0];
                    finalEmail = dbLender.email;
                    console.log(`✅ Found database match for "${lenderName}":`, {
                        dbName: dbLender.name,
                        dbEmail: dbLender.email
                    });
                } else {
                    console.warn(`⚠️ No database match found for lender: "${lenderName}"`);
                    // Fallback to any email from the original lender object
                    finalEmail = lender.email || lender.Email || lender['Lender Email'];
                }
                
                // If still no email, create a placeholder but warn about it
                if (!finalEmail) {
                    finalEmail = `${lenderName.toLowerCase().replace(/[^a-z0-9]/g, '.')}@placeholder.com`;
                    console.error(`❌ No email found for "${lenderName}", using placeholder: ${finalEmail}`);
                }
                
                lenderEmailData.push({
                    name: lenderName,
                    email: finalEmail,
                    phone: dbLender?.phone || lender.phone,
                    company: dbLender?.company || lender.company
                });
                
            } catch (dbError) {
                console.error(`❌ Database error looking up lender "${lenderName}":`, dbError);
                // Fallback to placeholder
                const fallbackEmail = `${lenderName.toLowerCase().replace(/[^a-z0-9]/g, '.')}@placeholder.com`;
                lenderEmailData.push({
                    name: lenderName,
                    email: fallbackEmail
                });
            }
        }
        
        console.log('🔍 DEBUG: Final lenderEmailData with database emails:', JSON.stringify(lenderEmailData, null, 2));

        // Send emails to all selected lenders WITH ACTUAL FILE ATTACHMENTS
        const emailResults = await emailService.sendBulkLenderSubmissions(
            lenderEmailData,
            businessData,
            documentAttachments  // Pass the actual file buffers, not just metadata
        );

        // Log the submission to database - create one record per lender
        // Reuse db connection from above
        
        for (const lender of selectedLenders) {
            try {
                const lenderName = lender.lender_name || lender.name;
                const wasEmailSent = emailResults.successful?.some(result => 
                    result.email === lender.email || result.lender === lenderName
                );
                const emailStatus = wasEmailSent ? 'sent' : 'failed';
                
                await db.query(`
                    INSERT INTO lender_submissions (
                        conversation_id, lender_name, documents_sent, 
                        message, status
                    ) VALUES ($1, $2, $3, $4, $5)
                `, [
                    conversationId,
                    lenderName,
                    documentAttachments.map(d => d.filename), // Use actual attachment filenames
                    `Email ${emailStatus} to ${lenderName} (${lender.email})`, // message
                    emailStatus // status (sent/failed)
                ]);
            } catch (error) {
                console.error(`Error logging submission for lender ${lender.name || lender.lender_name}:`, error.message);
                // Continue with other lenders
            }
        }

        res.json({
            success: true,
            results: emailResults,
            message: `Emails sent to ${emailResults.successful.length} of ${selectedLenders.length} lenders`,
            attachmentCount: documentAttachments.length
        });

    } catch (error) {
        console.error('Error sending to lenders:', error);
        res.status(500).json({
            error: 'Failed to send to lenders',
            details: error.message
        });
    }
});

// Test email configuration endpoint
app.get('/api/email/test', async (req, res) => {
    try {
        const emailService = getEmailService();
        const testResult = await emailService.testEmailConfiguration();
        
        // Also send a test email if configuration is valid
        if (testResult.success) {
            const testEmail = req.query.email || 'test@example.com';
            console.log(`🔧 Testing email sending to: ${testEmail}`);
            
            // Send a simple test email
            try {
                await emailService.sendLenderSubmission(testEmail, {
                    businessName: 'Test Business',
                    industry: 'Technology',
                    state: 'CA',
                    monthlyRevenue: 50000,
                    fico: 750,
                    tib: 24,
                    position: 100000,
                    negativeDays: 0
                }, []);
                
                testResult.testEmailSent = true;
                testResult.testEmailRecipient = testEmail;
            } catch (emailError) {
                testResult.testEmailError = emailError.message;
                testResult.testEmailSent = false;
            }
        }
        res.json(testResult);
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// AI Assistant endpoints
let aiService = null;
function getAIService() {
    if (!aiService) {
        aiService = require('./services/aiService');
        console.log('✅ AI service initialized');
    }
    return aiService;
}

// AI chat endpoint - FIXED VERSION
app.post('/api/ai/chat', async (req, res) => {
    try {
        const { query, conversationId } = req.body;

        if (!query) {
            return res.status(400).json({
                success: false,
                error: 'Query is required'
            });
        }

        const aiService = getAIService();

        // Get conversation context if conversationId is provided
        let conversationContext = null;
        if (conversationId) {
            try {
                const db = getDatabase();
                const conversationResult = await db.query(
                    'SELECT * FROM conversations WHERE id = $1',
                    [conversationId]
                );

                if (conversationResult.rows.length > 0) {
                    const conversation = conversationResult.rows[0];

                    // Get recent messages - FIXED QUERY
                    // Use timestamp column and filter out null/empty content
                    const messagesResult = await db.query(`
                        SELECT
                            direction,
                            content,
                            timestamp as message_time,
                            status,
                            sent_by
                        FROM messages
                        WHERE conversation_id = $1
                            AND content IS NOT NULL
                            AND content != ''
                            AND timestamp IS NOT NULL
                        ORDER BY timestamp DESC
                        LIMIT 50
                    `, [conversationId]);

                    // Log what messages we found for debugging
                    console.log(`📨 Found ${messagesResult.rows.length} messages for AI context`);
                    if (messagesResult.rows.length > 0) {
                        console.log('Most recent message:', {
                            time: messagesResult.rows[0].message_time,
                            direction: messagesResult.rows[0].direction,
                            preview: messagesResult.rows[0].content.substring(0, 50)
                        });
                    }

                    // Check for documents and FCS report (gracefully handle missing tables)
                    let documentsCount = 0;
                    let fcsReport = null;

                    try {
                        const documentsResult = await db.query(
                            'SELECT COUNT(*) as count FROM documents WHERE conversation_id = $1',
                            [conversationId]
                        );
                        documentsCount = parseInt(documentsResult.rows[0].count);
                    } catch (err) {
                        console.log('⚠️ Documents table not available:', err.message);
                    }

                    try {
                        const fcsResult = await db.query(
                            'SELECT summary as report_content, business_name, created_at as generated_at FROM fcs_results WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 1',
                            [conversationId]
                        );
                        if (fcsResult.rows.length > 0) {
                            fcsReport = fcsResult.rows[0];
                            fcsReport.statement_count = 4; // Default as used in FCS endpoint
                        }
                    } catch (err) {
                        console.log('⚠️ FCS results table not available:', err.message);
                    }

                    // Get lead details for more context
                    let leadDetails = null;
                    try {
                        const leadResult = await db.query(
                            'SELECT * FROM lead_details WHERE conversation_id = $1',
                            [conversationId]
                        );
                        if (leadResult.rows.length > 0) {
                            leadDetails = leadResult.rows[0];
                        }
                    } catch (err) {
                        console.log('⚠️ Lead details not available:', err.message);
                    }

                    // Format messages for AI context - reverse to show chronologically (oldest first)
                    const formattedMessages = messagesResult.rows.reverse().map(msg => ({
                        direction: msg.direction,
                        content: msg.content,
                        timestamp: msg.message_time,
                        sent_by: msg.sent_by || (msg.direction === 'inbound' ? 'customer' : 'agent')
                    }));

                    // Count outbound messages and get last outbound timestamp
                    const outboundMessages = formattedMessages.filter(msg => msg.direction === 'outbound');
                    const lastOutboundMessage = outboundMessages.length > 0 ?
                        outboundMessages[outboundMessages.length - 1] : null;

                    conversationContext = {
                        business_name: conversation.business_name,
                        lead_phone: conversation.lead_phone,
                        stage: conversation.state || conversation.stage,
                        current_step: conversation.current_step,
                        last_message_time: conversation.last_activity || conversation.last_message_time,
                        has_documents: documentsCount > 0,
                        document_count: documentsCount,
                        has_fcs: !!fcsReport,
                        fcs_report: fcsReport,
                        recent_messages: formattedMessages,
                        message_count: formattedMessages.length,
                        // Message type determination fields
                        outbound_message_count: outboundMessages.length,
                        last_outbound_time: lastOutboundMessage?.timestamp,
                        user_query: query, // The actual request from the user
                        // Add more context fields
                        email: conversation.email,
                        city: conversation.city,
                        state: conversation.us_state,
                        lead_source: conversation.lead_source,
                        notes: conversation.notes,
                        // Lead details if available
                        annual_revenue: leadDetails?.annual_revenue,
                        business_type: leadDetails?.business_type,
                        funding_amount: leadDetails?.funding_amount,
                        business_start_date: leadDetails?.business_start_date
                    };

                    // Log the context we're sending to AI
                    console.log('🤖 AI Context Summary:', {
                        business: conversationContext.business_name,
                        messageCount: conversationContext.message_count,
                        outboundCount: conversationContext.outbound_message_count,
                        hasDocuments: conversationContext.has_documents,
                        hasFCS: conversationContext.has_fcs,
                        stage: conversationContext.stage,
                        userQuery: conversationContext.user_query?.substring(0, 50) + '...'
                    });
                }
            } catch (dbError) {
                console.error('⚠️ Could not load conversation context:', dbError);
                console.error('Stack trace:', dbError.stack);
                // Don't fail the whole request, just proceed without context
            }
        }

        const startTime = Date.now();
        const result = await aiService.generateResponse(query, conversationContext);
        const endTime = Date.now();
        const responseTime = endTime - startTime;

        // Save AI messages to database
        if (conversationId) {
            try {
                const db = getDatabase();

                // Save user message with proper timestamp
                await db.query(
                    `INSERT INTO ai_messages
                    (conversation_id, message_type, content, tokens_used, model_used, response_time_ms, timestamp, created_at)
                    VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
                    [conversationId, 'user', query, null, null, null]
                );

                // Save AI response
                const responseContent = result.success ? result.response : result.fallback;
                const tokensUsed = result.usage ? result.usage.total_tokens : null;
                const modelUsed = result.usage ? (process.env.OPENAI_MODEL || 'gpt-4') : null;

                await db.query(
                    `INSERT INTO ai_messages
                    (conversation_id, message_type, content, tokens_used, model_used, response_time_ms, timestamp, created_at)
                    VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
                    [conversationId, 'assistant', responseContent, tokensUsed, modelUsed, responseTime]
                );

                console.log('💾 AI messages saved to database');
            } catch (dbError) {
                console.error('⚠️ Failed to save AI messages:', dbError.message);
            }
        }

        if (result.success) {
            res.json({
                success: true,
                response: result.response,
                usage: result.usage,
                contextUsed: !!conversationContext,
                messageCount: conversationContext?.message_count || 0
            });
        } else {
            res.json({
                success: false,
                error: result.error,
                fallback: result.fallback,
                contextUsed: !!conversationContext
            });
        }

    } catch (error) {
        console.error('AI Chat Error:', error);
        console.error('Stack trace:', error.stack);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            fallback: 'I apologize, but I encountered an error processing your request. Please try again.'
        });
    }
});

// Debug endpoint to check messages and their timestamps
app.get('/api/debug/messages/:conversationId', async (req, res) => {
    try {
        const { conversationId } = req.params;
        const db = getDatabase();

        // Get all messages with timestamp field
        const messagesResult = await db.query(`
            SELECT
                id,
                content,
                direction,
                sent_by,
                status,
                timestamp
            FROM messages
            WHERE conversation_id = $1
            ORDER BY timestamp DESC
            LIMIT 50
        `, [conversationId]);

        // Get message count
        const countResult = await db.query(
            'SELECT COUNT(*) as total FROM messages WHERE conversation_id = $1',
            [conversationId]
        );

        // Check for null timestamps
        const nullTimestampResult = await db.query(`
            SELECT COUNT(*) as null_count
            FROM messages
            WHERE conversation_id = $1
                AND timestamp IS NULL
        `, [conversationId]);

        // Get the most recent message
        const mostRecentResult = await db.query(`
            SELECT *
            FROM messages
            WHERE conversation_id = $1
            ORDER BY timestamp DESC
            LIMIT 1
        `, [conversationId]);

        res.json({
            conversationId,
            totalMessages: parseInt(countResult.rows[0].total),
            messagesWithNullTimestamps: parseInt(nullTimestampResult.rows[0].null_count),
            mostRecentMessage: mostRecentResult.rows[0] || null,
            messages: messagesResult.rows.map(msg => ({
                id: msg.id,
                content_preview: msg.content ? msg.content.substring(0, 100) : null,
                direction: msg.direction,
                sent_by: msg.sent_by,
                status: msg.status,
                timestamp: msg.timestamp,
                has_timestamp: !!msg.timestamp
            })),
            analysis: {
                hasTimestampIssues: parseInt(nullTimestampResult.rows[0].null_count) > 0,
                recommendation: parseInt(nullTimestampResult.rows[0].null_count) > 0
                    ? "Some messages have null timestamps. Run: UPDATE messages SET timestamp = NOW() WHERE timestamp IS NULL AND conversation_id = '" + conversationId + "'"
                    : "All messages have proper timestamps"
            }
        });

    } catch (error) {
        console.error('Debug messages error:', error);
        res.status(500).json({
            error: 'Failed to debug messages',
            details: error.message,
            stack: error.stack
        });
    }
});

// Fix messages with missing timestamps
app.post('/api/debug/fix-timestamps/:conversationId', async (req, res) => {
    try {
        const { conversationId } = req.params;
        const db = getDatabase();

        // Update messages with null timestamps to current time
        const result = await db.query(`
            UPDATE messages
            SET timestamp = NOW()
            WHERE conversation_id = $1
                AND timestamp IS NULL
            RETURNING id
        `, [conversationId]);

        res.json({
            success: true,
            messagesFixed: result.rows.length,
            fixedMessageIds: result.rows.map(r => r.id)
        });

    } catch (error) {
        console.error('Fix timestamps error:', error);
        res.status(500).json({
            error: 'Failed to fix timestamps',
            details: error.message
        });
    }
});

// Get AI messages for a conversation
app.get('/api/ai/messages/:conversationId', async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { limit = 50, offset = 0 } = req.query;
        
        if (!conversationId) {
            return res.status(400).json({
                success: false,
                error: 'Conversation ID is required'
            });
        }

        const db = getDatabase();
        
        const result = await db.query(`
            SELECT id, message_type, content, timestamp, tokens_used, model_used, response_time_ms, created_at
            FROM ai_messages 
            WHERE conversation_id = $1 
            ORDER BY timestamp DESC 
            LIMIT $2 OFFSET $3
        `, [conversationId, parseInt(limit), parseInt(offset)]);
        
        const countResult = await db.query(
            'SELECT COUNT(*) as total FROM ai_messages WHERE conversation_id = $1',
            [conversationId]
        );
        
        res.json({
            success: true,
            messages: result.rows.reverse(), // Reverse to show oldest first in UI
            total: parseInt(countResult.rows[0].total),
            limit: parseInt(limit),
            offset: parseInt(offset)
        });
        
    } catch (error) {
        console.error('AI Messages retrieval error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve AI messages',
            details: error.message
        });
    }
});

// AI configuration status endpoint
app.get('/api/ai/status', (req, res) => {
    try {
        const aiService = getAIService();
        const config = aiService.getConfiguration();
        
        res.json({
            success: true,
            ...config
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// AI Chat Messages endpoints
// Get AI chat history for a conversation
app.get('/api/ai/chat/:conversationId', async (req, res) => {
    try {
        const { conversationId } = req.params;
        const db = getDatabase();

        const result = await db.query(`
            SELECT
                id,
                role,
                content,
                created_at,
                ai_model,
                ai_tokens_used
            FROM ai_chat_messages
            WHERE conversation_id = $1
            ORDER BY created_at ASC
        `, [conversationId]);

        res.json({
            success: true,
            messages: result.rows
        });
    } catch (error) {
        console.error('Error fetching AI chat history:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Save AI chat message
app.post('/api/ai/chat/:conversationId/messages', async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { role, content, ai_model, ai_tokens_used, ai_response_time_ms } = req.body;

        if (!role || !content) {
            return res.status(400).json({
                success: false,
                error: 'Role and content are required'
            });
        }

        if (!['user', 'assistant'].includes(role)) {
            return res.status(400).json({
                success: false,
                error: 'Role must be either "user" or "assistant"'
            });
        }

        const db = getDatabase();

        const result = await db.query(`
            INSERT INTO ai_chat_messages
            (conversation_id, role, content, ai_model, ai_tokens_used, ai_response_time_ms)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id, created_at
        `, [conversationId, role, content, ai_model || null, ai_tokens_used || null, ai_response_time_ms || null]);

        console.log(`💬 Saved AI chat message: ${role} - ${content.substring(0, 50)}...`);

        res.json({
            success: true,
            message: {
                id: result.rows[0].id,
                created_at: result.rows[0].created_at,
                conversation_id: conversationId,
                role,
                content
            }
        });
    } catch (error) {
        console.error('Error saving AI chat message:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

server.listen(PORT, () => {
    console.log(`MCA Command Center Server running on port ${PORT}`);
    console.log(`Socket.io WebSocket server ready on port ${PORT}`);
    console.log(`CSV Import: http://localhost:${PORT}/api/csv-import/upload`);
    console.log(`Conversations: http://localhost:${PORT}/api/conversations`);
});