// routes/conversations.js - HANDLES: Conversation management
// URLs like: /api/conversations, /api/conversations/:id

const express = require('express');
const router = express.Router();
const { getDatabase } = require('../services/database');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Configure multer for document uploads
const uploadDir = path.join(__dirname, '../uploads');
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

const documentUpload = multer({
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// Get all conversations
router.get('/', async (req, res) => {
    try {
        const { state, priority, limit = 50, offset = 0 } = req.query;
        const db = getDatabase();

        console.log('📋 Fetching conversations...');

        let query = `
            SELECT id, display_id, lead_phone, business_name, first_name, last_name,
                   state, current_step, priority,
                   COALESCE(last_activity, created_at) as last_activity,
                   created_at
            FROM conversations
            WHERE 1=1
        `;

        const values = [];
        let paramIndex = 1;

        if (state) {
            query += ` AND state = $${paramIndex++}`;
            values.push(state);
        }

        if (priority) {
            query += ` AND priority = $${paramIndex++}`;
            values.push(priority);
        }

        query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
        values.push(parseInt(limit), parseInt(offset));

        const result = await db.query(query, values);

        console.log(`✅ Found ${result.rows.length} conversations`);

        // Return just the array (matching original server format)
        res.json(result.rows);

    } catch (error) {
        console.error('❌ Get conversations error:', error);
        res.status(500).json({ error: 'Failed to fetch conversations' });
    }
});

// Get single conversation by ID
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const db = getDatabase();

        console.log('📄 Getting conversation details for ID:', id);

        // Check if id is numeric (display_id) or UUID
        const isNumeric = /^\d+$/.test(id);

        // Get conversation with all details
        const query = `
            SELECT c.*, ld.business_type, ld.annual_revenue, ld.business_start_date,
                   ld.funding_amount, ld.factor_rate, ld.funding_date, ld.term_months,
                   ld.campaign, ld.date_of_birth, ld.tax_id_encrypted as tax_id, ld.ssn_encrypted as ssn
            FROM conversations c
            LEFT JOIN lead_details ld ON c.id = ld.conversation_id
            WHERE ${isNumeric ? 'c.display_id = $1' : 'c.id = $1'}
        `;

        const result = await db.query(query, [isNumeric ? parseInt(id) : id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Conversation not found' });
        }

        const conversation = result.rows[0];

        // Handle state naming conflict (conversation state vs address state)
        if (conversation.state && conversation.state !== 'NEW') {
            conversation.address_state = conversation.state;
            conversation.state = 'NEW';
        }

        console.log('✅ Conversation details retrieved');

        // Return just the conversation object (matching original format)
        res.json(conversation);

    } catch (error) {
        console.error('❌ Error fetching conversation:', error);
        res.status(500).json({ error: 'Failed to fetch conversation' });
    }
});

// Create new conversation
router.post('/', async (req, res) => {
    try {
        const conversationData = req.body;
        const db = getDatabase();

        const result = await db.query(`
            INSERT INTO conversations (
                business_name, lead_phone, lead_email, state,
                business_address, current_step, priority
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `, [
            conversationData.business_name,
            conversationData.lead_phone,
            conversationData.lead_email,
            conversationData.state,
            conversationData.business_address,
            'initial_contact',
            conversationData.priority || 'medium'
        ]);

        console.log(`✅ New conversation created: ${result.rows[0].id}`);

        res.json({
            success: true,
            conversation: result.rows[0]
        });

    } catch (error) {
        console.error('Error creating conversation:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Update conversation (comprehensive version with lead_details support)
router.put('/:id', async (req, res) => {
    try {
        const conversationId = req.params.id;
        const data = req.body;
        const db = getDatabase();

        console.log('=== UPDATE REQUEST DEBUG ===');
        console.log('📝 Conversation ID:', conversationId);
        console.log('📥 Received fields:', Object.keys(data));

        // Remove any fields with empty string values for states
        if (data.businessState === '') delete data.businessState;
        if (data.ownerHomeState === '') delete data.ownerHomeState;
        if (data.leadStatus === '') delete data.leadStatus;

        // Map frontend field names to database tables and columns
        const conversationsFields = {
            // Business information
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

            // Phone numbers
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
            leadStatus: 'state',
            lead_status: 'state',
            state: 'state',

            // Owner information
            ownerFirstName: 'first_name',
            owner_first_name: 'first_name',
            first_name: 'first_name',
            ownerLastName: 'last_name',
            owner_last_name: 'last_name',
            last_name: 'last_name',

            // Other fields
            notes: 'notes',
            entityType: 'entity_type',
            entity_type: 'entity_type',
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
            // Dates
            ownerDOB: 'date_of_birth',
            owner_dob: 'date_of_birth',
            owner_d_o_b: 'date_of_birth',
            owner_date_of_birth: 'date_of_birth',
            date_of_birth: 'date_of_birth',

            // SSN field mappings
            ownerSSN: 'ssn_encrypted',
            owner_ssn: 'ssn_encrypted',
            owner_s_s_n: 'ssn_encrypted',
            ssn: 'ssn_encrypted',
            ssn_encrypted: 'ssn_encrypted',

            // Tax ID / EIN field mappings
            federalTaxId: 'tax_id_encrypted',
            federal_tax_id: 'tax_id_encrypted',
            taxId: 'tax_id_encrypted',
            tax_id: 'tax_id_encrypted',
            tax_id_encrypted: 'tax_id_encrypted',

            businessStartDate: 'business_start_date',
            business_start_date: 'business_start_date',
            fundingDate: 'funding_date',
            funding_date: 'funding_date',

            // Business details
            industryType: 'business_type',
            industry_type: 'business_type',
            industry: 'business_type',
            business_type: 'business_type',

            // Financial information
            annualRevenue: 'annual_revenue',
            annual_revenue: 'annual_revenue',
            requestedAmount: 'funding_amount',
            requested_amount: 'funding_amount',
            funding_amount: 'funding_amount',
            factorRate: 'factor_rate',
            factor_rate: 'factor_rate',
            termMonths: 'term_months',
            term_months: 'term_months',
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

        // Build update queries for both tables
        for (const [frontendField, value] of Object.entries(data)) {
            if (frontendField === 'id') continue; // Skip the ID field

            if (conversationsFields[frontendField]) {
                const dbField = conversationsFields[frontendField];

                // Skip if this database field has already been assigned
                if (assignedConversationFields.has(dbField)) {
                    console.log(`⚠️ Skipping duplicate: ${frontendField} -> ${dbField}`);
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
                    console.log(`⚠️ Skipping duplicate: ${frontendField} -> ${dbField}`);
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

            await db.query(conversationsQuery, conversationsValues);
        }

        // Update lead_details table if there are fields to update
        if (leadDetailsUpdateFields.length > 0) {
            // First, check if lead_details record exists
            const existingDetails = await db.query(
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

                await db.query(leadDetailsQuery, leadDetailsValues);
            } else {
                // Insert new record
                const insertFields = ['conversation_id', ...leadDetailsUpdateFields.map(f => f.split(' = ')[0])];
                const insertValues = [conversationId, ...leadDetailsValues];
                const insertParams = insertValues.map((_, i) => `$${i + 1}`);

                const insertQuery = `
                    INSERT INTO lead_details (${insertFields.join(', ')}, created_at)
                    VALUES (${insertParams.join(', ')}, NOW())
                `;

                console.log('🔍 Lead details insert query:', insertQuery);
                console.log('🔍 Lead details insert values:', insertValues);

                await db.query(insertQuery, insertValues);
            }
        }

        // Get the updated conversation with lead details
        const finalResult = await db.query(`
            SELECT c.*, ld.date_of_birth, ld.business_start_date,
                   ld.business_type, ld.annual_revenue, ld.funding_amount, ld.campaign,
                   ld.ssn_encrypted, ld.tax_id_encrypted, ld.factor_rate, ld.term_months, ld.funding_date
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

// Bulk delete conversations
router.post('/bulk-delete', async (req, res) => {
    try {
        const { conversationIds } = req.body;

        if (!conversationIds || !Array.isArray(conversationIds) || conversationIds.length === 0) {
            return res.status(400).json({ error: 'No conversation IDs provided' });
        }

        console.log('🗑️ Bulk deleting conversations:', conversationIds);

        const db = getDatabase();

        // Delete related records first to avoid foreign key constraints
        const placeholders = conversationIds.map((_, index) => `$${index + 1}`).join(',');

        // Add error handling for each delete
        try {
            await db.query(
                `DELETE FROM documents WHERE conversation_id IN (${placeholders})`,
                conversationIds
            );
            console.log('✅ Documents deleted');
        } catch (err) {
            console.error('❌ Error deleting documents:', err.message);
        }

        try {
            await db.query(
                `DELETE FROM messages WHERE conversation_id IN (${placeholders})`,
                conversationIds
            );
            console.log('✅ Messages deleted');
        } catch (err) {
            console.error('❌ Error deleting messages:', err.message);
        }

        try {
            await db.query(
                `DELETE FROM lead_details WHERE conversation_id IN (${placeholders})`,
                conversationIds
            );
            console.log('✅ Lead details deleted');
        } catch (err) {
            console.error('❌ Error deleting lead_details:', err.message);
        }

        // Delete FCS results
        try {
            await db.query(
                `DELETE FROM fcs_results WHERE conversation_id IN (${placeholders})`,
                conversationIds
            );
            console.log('✅ FCS results deleted');
        } catch (err) {
            console.error('❌ Error deleting fcs_results:', err.message);
        }

        // Delete lender submissions
        try {
            await db.query(
                `DELETE FROM lender_submissions WHERE conversation_id IN (${placeholders})`,
                conversationIds
            );
            console.log('✅ Lender submissions deleted');
        } catch (err) {
            console.error('❌ Error deleting lender_submissions:', err.message);
        }

        // Delete lender qualifications
        try {
            await db.query(
                `DELETE FROM lender_qualifications WHERE conversation_id IN (${placeholders})`,
                conversationIds
            );
            console.log('✅ Lender qualifications deleted');
        } catch (err) {
            console.error('❌ Error deleting lender_qualifications:', err.message);
        }

        // Delete AI messages
        try {
            await db.query(
                `DELETE FROM ai_messages WHERE conversation_id IN (${placeholders})`,
                conversationIds
            );
            console.log('✅ AI messages deleted');
        } catch (err) {
            console.error('❌ Error deleting ai_messages:', err.message);
        }

        // Delete AI chat messages
        try {
            await db.query(
                `DELETE FROM ai_chat_messages WHERE conversation_id IN (${placeholders})`,
                conversationIds
            );
            console.log('✅ AI chat messages deleted');
        } catch (err) {
            console.error('❌ Error deleting ai_chat_messages:', err.message);
        }

        // Delete lender matches
        try {
            await db.query(
                `DELETE FROM lender_matches WHERE conversation_id IN (${placeholders})`,
                conversationIds
            );
            console.log('✅ Lender matches deleted');
        } catch (err) {
            console.error('❌ Error deleting lender_matches:', err.message);
        }

        // Delete agent actions
        try {
            await db.query(
                `DELETE FROM agent_actions WHERE conversation_id IN (${placeholders})`,
                conversationIds
            );
            console.log('✅ Agent actions deleted');
        } catch (err) {
            console.error('❌ Error deleting agent_actions:', err.message);
        }

        // Finally delete conversations
        const result = await db.query(
            `DELETE FROM conversations WHERE id IN (${placeholders}) RETURNING id`,
            conversationIds
        );

        console.log(`✅ Deleted ${result.rows.length} conversations from AWS database`);

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

// Get messages for a conversation (nested under conversations)
router.get('/:id/messages', async (req, res) => {
    try {
        const { id } = req.params;
        const db = getDatabase();

        console.log('📧 Getting messages for conversation:', id);

        const result = await db.query(`
            SELECT * FROM messages
            WHERE conversation_id = $1
            ORDER BY timestamp ASC
        `, [id]);

        console.log(`✅ Found ${result.rows.length} messages`);

        // Return just the array (matching original format)
        res.json(result.rows);

    } catch (error) {
        console.log('❌ Get messages error:', error);
        // Return empty array on error (matching original)
        res.json([]);
    }
});

// Send message (nested under conversations)
router.post('/:id/messages', async (req, res) => {
    try {
        const { id: conversationId } = req.params;
        const { message_content, sender_type = 'user' } = req.body;
        const db = getDatabase();

        if (!message_content) {
            return res.status(400).json({ error: 'Message content is required' });
        }

        console.log('📤 Sending message to conversation:', conversationId);

        // Insert message
        const result = await db.query(`
            INSERT INTO messages (
                conversation_id, content, direction, message_type,
                sent_by, timestamp
            )
            VALUES ($1, $2, $3, 'sms', $4, NOW())
            RETURNING *
        `, [
            conversationId,
            message_content,
            sender_type === 'user' ? 'outbound' : 'inbound',
            sender_type
        ]);

        const newMessage = result.rows[0];

        // Update conversation last_activity
        await db.query(
            'UPDATE conversations SET last_activity = NOW() WHERE id = $1',
            [conversationId]
        );

        // Emit WebSocket event
        if (global.io) {
            global.io.to(`conversation_${conversationId}`).emit('new_message', {
                conversation_id: conversationId,
                message: newMessage
            });
        }

        console.log(`✅ Message sent in conversation ${conversationId}`);

        // Return just the message object
        res.json(newMessage);

    } catch (error) {
        console.error('❌ Error sending message:', error);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

// ============================================================================
// DOCUMENT MANAGEMENT ENDPOINTS (nested under conversations)
// ============================================================================

// Get documents for a conversation
router.get('/:id/documents', async (req, res) => {
    try {
        const { id } = req.params;
        const db = getDatabase();

        const result = await db.query(
            'SELECT * FROM documents WHERE conversation_id = $1 ORDER BY created_at DESC',
            [id]
        );

        // Return in expected format
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

// Upload documents to AWS S3
router.post('/:id/documents/upload', documentUpload.array('documents'), async (req, res) => {
    try {
        const { id } = req.params;
        const uploadedFiles = req.files;
        const db = getDatabase();

        if (!uploadedFiles || uploadedFiles.length === 0) {
            return res.status(400).json({ error: 'No files provided' });
        }

        // Check if AWS S3 is configured
        const hasS3Config = process.env.AWS_ACCESS_KEY_ID &&
                           process.env.AWS_SECRET_ACCESS_KEY &&
                           process.env.S3_DOCUMENTS_BUCKET;

        if (!hasS3Config) {
            return res.status(500).json({
                error: 'AWS S3 not configured. Please set AWS credentials in .env file.'
            });
        }

        // Initialize AWS S3
        const AWS = require('aws-sdk');
        AWS.config.update({
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            region: process.env.AWS_REGION || 'us-east-1'
        });

        const s3 = new AWS.S3();
        const bucket = process.env.S3_DOCUMENTS_BUCKET;
        const results = [];

        for (const file of uploadedFiles) {
            const documentId = uuidv4();

            // Read the file buffer
            const fileBuffer = fs.readFileSync(file.path);
            const s3Key = `documents/${file.filename}`;

            // Upload to S3 FIRST
            try {
                const uploadResult = await s3.upload({
                    Bucket: bucket,
                    Key: s3Key,
                    Body: fileBuffer,
                    ContentType: file.mimetype || 'application/pdf',
                    ServerSideEncryption: 'AES256'
                }).promise();

                const s3Url = uploadResult.Location;
                console.log(`✅ Uploaded to S3: ${s3Url}`);

                // Save document record to database
                const result = await db.query(`
                    INSERT INTO documents (
                        id, conversation_id, original_filename, filename,
                        file_size, s3_key, s3_url, created_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
                    RETURNING *
                `, [
                    documentId,
                    id,
                    file.originalname,
                    file.filename,
                    file.size,
                    s3Key,
                    s3Url
                ]);

                results.push(result.rows[0]);
                console.log(`✅ Document saved to database: ${file.originalname}`);

                // Delete local file after successful S3 upload
                try {
                    fs.unlinkSync(file.path);
                } catch (unlinkErr) {
                    console.warn('⚠️ Could not delete local file:', unlinkErr.message);
                }

            } catch (s3Error) {
                console.error(`❌ S3 upload failed for ${file.originalname}:`, s3Error);
                // Clean up local file on S3 failure
                try {
                    fs.unlinkSync(file.path);
                } catch (unlinkErr) {
                    console.warn('⚠️ Could not delete local file:', unlinkErr.message);
                }
                continue;
            }
        }

        console.log(`📁 Successfully uploaded ${results.length} documents for conversation ${id}`);

        const totalFiles = uploadedFiles.length;
        const successfulUploads = results.length;
        const failedUploads = totalFiles - successfulUploads;

        if (failedUploads > 0) {
            console.warn(`⚠️ ${failedUploads} of ${totalFiles} documents failed to upload to S3`);
            res.json({
                success: true,
                message: `${successfulUploads} of ${totalFiles} documents uploaded successfully`,
                warning: failedUploads > 0 ? `${failedUploads} documents failed S3 upload and were skipped` : null,
                documents: results,
                uploadStats: {
                    total: totalFiles,
                    successful: successfulUploads,
                    failed: failedUploads
                }
            });
        } else {
            res.json({
                success: true,
                message: 'All documents uploaded successfully',
                documents: results,
                uploadStats: {
                    total: totalFiles,
                    successful: successfulUploads,
                    failed: failedUploads
                }
            });
        }

    } catch (error) {
        console.error('❌ Document upload error:', error);
        res.status(500).json({ error: 'Failed to upload documents' });
    }
});

// Download document from S3
router.get('/:conversationId/documents/:documentId/download', async (req, res) => {
    try {
        const { documentId } = req.params;
        const db = getDatabase();

        // Get document from database
        const result = await db.query(
            'SELECT * FROM documents WHERE id = $1',
            [documentId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Document not found' });
        }

        const document = result.rows[0];

        // If S3 URL exists, redirect to S3
        if (document.s3_url) {
            // Generate signed URL for secure download
            const AWS = require('aws-sdk');
            AWS.config.update({
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                region: process.env.AWS_REGION || 'us-east-1'
            });

            const s3 = new AWS.S3();
            const signedUrl = s3.getSignedUrl('getObject', {
                Bucket: process.env.S3_DOCUMENTS_BUCKET,
                Key: document.s3_key,
                Expires: 300 // URL expires in 5 minutes
            });

            res.redirect(signedUrl);
        } else {
            // Fallback to local file if no S3 URL
            const filePath = path.join(uploadDir, document.filename);
            if (fs.existsSync(filePath)) {
                res.download(filePath, document.original_filename);
            } else {
                res.status(404).json({ error: 'File not found' });
            }
        }

    } catch (error) {
        console.error('❌ Error downloading document:', error);
        res.status(500).json({ error: 'Failed to download document' });
    }
});

// Preview document (stream from S3)
router.get('/:conversationId/documents/:documentId/preview', async (req, res) => {
    try {
        const { conversationId, documentId } = req.params;
        const db = getDatabase();

        // Get document info from database
        const result = await db.query(`
            SELECT * FROM documents
            WHERE id = $1 AND conversation_id = $2
        `, [documentId, conversationId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Document not found' });
        }

        const doc = result.rows[0];
        console.log('🔍 Preview document:', doc.original_filename);

        // If document has S3 key, stream from S3
        if (doc.s3_key) {
            console.log('👁️ Streaming from S3 for preview:', doc.original_filename);

            const AWS = require('aws-sdk');
            AWS.config.update({
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                region: process.env.AWS_REGION || 'us-east-1'
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

            const AWS = require('aws-sdk');
            AWS.config.update({
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                region: process.env.AWS_REGION || 'us-east-1'
            });

            const s3 = new AWS.S3();
            const localFilePath = path.join(uploadDir, doc.filename);

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
                    await db.query(`
                        UPDATE documents
                        SET s3_key = $1, s3_url = $2
                        WHERE id = $3
                    `, [s3Key, uploadResult.Location, doc.id]);
                    console.log('✅ Database updated with S3 info');
                } catch (dbError) {
                    console.warn('⚠️ Database update failed but S3 upload succeeded:', dbError.message);
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

// Update/edit document metadata
router.put('/:conversationId/documents/:documentId', async (req, res) => {
    try {
        const { conversationId, documentId } = req.params;
        const { filename, originalFilename, documentType } = req.body;
        const db = getDatabase();

        console.log('📝 UPDATE REQUEST:', {
            conversationId,
            documentId,
            newFilename: filename || originalFilename
        });

        const inputFilename = filename || originalFilename;

        if (!inputFilename) {
            return res.status(400).json({
                success: false,
                error: 'Filename is required'
            });
        }

        // Get current document to preserve extension
        const currentDoc = await db.query(`
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
        const newNameWithoutExt = path.parse(inputFilename).name;
        const finalFilename = newNameWithoutExt + originalExt;

        console.log(`📝 Renaming document from "${originalName}" to "${finalFilename}"`);

        // Update document
        let result;
        try {
            result = await db.query(`
                UPDATE documents
                SET original_filename = $1
                WHERE id = $2 AND conversation_id = $3
                RETURNING *
            `, [finalFilename, documentId, conversationId]);
        } catch (dbError) {
            // If trigger fails, drop the trigger and try again
            if (dbError.message.includes('updated_at')) {
                console.warn('⚠️ Document update failed due to trigger issue, dropping trigger and retrying...');
                await db.query('DROP TRIGGER IF EXISTS update_documents_updated_at ON documents');
                result = await db.query(`
                    UPDATE documents
                    SET original_filename = $1
                    WHERE id = $2 AND conversation_id = $3
                    RETURNING *
                `, [finalFilename, documentId, conversationId]);
                console.log('✅ Document updated successfully after dropping trigger');
            } else {
                throw dbError;
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

// Delete document from S3 and database
router.delete('/:conversationId/documents/:documentId', async (req, res) => {
    try {
        const { documentId } = req.params;
        const db = getDatabase();

        // Get document info
        const result = await db.query(
            'SELECT * FROM documents WHERE id = $1',
            [documentId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Document not found' });
        }

        const document = result.rows[0];

        // Delete from S3 if exists
        if (document.s3_key) {
            try {
                const AWS = require('aws-sdk');
                AWS.config.update({
                    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                    region: process.env.AWS_REGION || 'us-east-1'
                });

                const s3 = new AWS.S3();
                await s3.deleteObject({
                    Bucket: process.env.S3_DOCUMENTS_BUCKET,
                    Key: document.s3_key
                }).promise();

                console.log(`✅ Deleted from S3: ${document.s3_key}`);
            } catch (s3Error) {
                console.error('❌ Error deleting from S3:', s3Error);
            }
        }

        // Delete from database
        await db.query('DELETE FROM documents WHERE id = $1', [documentId]);

        console.log(`✅ Document deleted: ${documentId}`);

        res.json({
            success: true,
            message: 'Document deleted successfully'
        });

    } catch (error) {
        console.error('❌ Error deleting document:', error);
        res.status(500).json({ error: 'Failed to delete document' });
    }
});

module.exports = router;
