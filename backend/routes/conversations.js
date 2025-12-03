// routes/conversations.js - HANDLES: Conversation management
// URLs like: /api/conversations, /api/conversations/:id

const express = require('express');
const router = express.Router();
const { getDatabase } = require('../services/database');
const EmailService = require('../services/emailService');
const AWS = require('aws-sdk');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Initialize email service
const emailService = new EmailService();

// Initialize S3
const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || 'us-east-1'
});

// ⚠️ REMOVED LOCAL FILE UPLOAD - Use /api/documents/upload instead

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

        // Debug: Log address fields
        console.log('📍 Address fields from DB:', {
            address: conversation.address,
            city: conversation.city,
            zip: conversation.zip,
            us_state: conversation.us_state,
            state: conversation.state,
            tax_id: conversation.tax_id,
            first_name: conversation.first_name,
            last_name: conversation.last_name
        });

        // Handle state naming conflict (conversation state vs address state)
        // Only modify if 'state' looks like a workflow state, not an address state
        if (conversation.state && !['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'].includes(conversation.state)) {
            conversation.workflow_state = conversation.state;
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

        // FIXED: Changed priority default from 'medium' to 1 (Integer) to fix DB error
        const result = await db.query(`
            INSERT INTO conversations (
                business_name, lead_phone, email, us_state,
                address, current_step, priority
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `, [
            conversationData.business_name,
            conversationData.lead_phone,
            conversationData.email,
            conversationData.us_state,
            conversationData.business_address,
            'initial_contact',
            // Fix: Send a number (1) instead of a string ("medium")
            conversationData.priority ? parseInt(conversationData.priority) : 1
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
            dba_name: 'dba_name',
            dbaName: 'dba_name',
            ownershipPercent: 'ownership_percent',
            ownership_percent: 'ownership_percent',
            ownership_percentage: 'ownership_percent', // ADDED: Frontend sends this
            ownerHomeAddress: 'owner_home_address',
            owner_home_address: 'owner_home_address',
            owner_address: 'owner_home_address', // ADDED: Frontend sends this
            ownerHomeAddress2: 'owner_home_address2',
            owner_home_address2: 'owner_home_address2',
            ownerHomeCity: 'owner_home_city',
            owner_home_city: 'owner_home_city',
            owner_city: 'owner_home_city', // ADDED: Frontend sends this
            ownerHomeState: 'owner_home_state',
            owner_home_state: 'owner_home_state',
            owner_state: 'owner_home_state', // ADDED: Frontend sends this
            ownerHomeZip: 'owner_home_zip',
            owner_home_zip: 'owner_home_zip',
            owner_zip: 'owner_home_zip', // ADDED: Frontend sends this
            ownerHomeCountry: 'owner_home_country',
            owner_home_country: 'owner_home_country',
            ownerEmail: 'owner_email',
            owner_email: 'owner_email',

            // --- PARTNER / OWNER 2 INFO ---
            owner2FirstName: 'owner2_first_name',
            owner2_first_name: 'owner2_first_name',
            owner2LastName: 'owner2_last_name',
            owner2_last_name: 'owner2_last_name',
            owner2Email: 'owner2_email',
            owner2_email: 'owner2_email',
            owner2Phone: 'owner2_phone',
            owner2_phone: 'owner2_phone',
            owner2OwnershipPercent: 'owner2_ownership_percent',
            owner2_ownership_percent: 'owner2_ownership_percent',
            owner2_ownership_percentage: 'owner2_ownership_percent',
            owner2HomeAddress: 'owner2_address',
            owner2_home_address: 'owner2_address',
            owner2_address: 'owner2_address',
            owner2Address: 'owner2_address',
            owner2HomeCity: 'owner2_city',
            owner2_home_city: 'owner2_city',
            owner2_city: 'owner2_city',
            owner2City: 'owner2_city',
            owner2HomeState: 'owner2_state',
            owner2_home_state: 'owner2_state',
            owner2_state: 'owner2_state',
            owner2State: 'owner2_state',
            owner2HomeZip: 'owner2_zip',
            owner2_home_zip: 'owner2_zip',
            owner2_zip: 'owner2_zip',
            owner2Zip: 'owner2_zip',
            owner2SSN: 'owner2_ssn',
            owner2_ssn: 'owner2_ssn',
            owner2_s_s_n: 'owner2_ssn',
            owner2DOB: 'owner2_dob',
            owner2_dob: 'owner2_dob',
            owner2_d_o_b: 'owner2_dob'
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

        // Get conversation details to get phone number
        const convResult = await db.query(
            'SELECT lead_phone, business_name FROM conversations WHERE id = $1',
            [conversationId]
        );

        if (convResult.rows.length === 0) {
            return res.status(404).json({ error: 'Conversation not found' });
        }

        const { lead_phone, business_name } = convResult.rows[0];
        const direction = sender_type === 'user' ? 'outbound' : 'inbound';

        // Insert message with initial status
        const result = await db.query(`
            INSERT INTO messages (
                conversation_id, content, direction, message_type,
                sent_by, timestamp, status
            )
            VALUES ($1, $2, $3, 'sms', $4, NOW(), 'pending')
            RETURNING *
        `, [
            conversationId,
            message_content,
            direction,
            sender_type
        ]);

        const newMessage = result.rows[0];

        // SEND VIA TWILIO (if outbound SMS)
        if (direction === 'outbound') {
            try {
                if (!lead_phone) {
                    throw new Error('No phone number found for this conversation');
                }

                console.log(`📞 Sending SMS to ${lead_phone}...`);

                // Check if Twilio credentials exist
                if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
                    console.error('❌ Twilio credentials not configured!');
                    await db.query('UPDATE messages SET status = $1 WHERE id = $2', ['failed', newMessage.id]);
                    newMessage.status = 'failed';
                } else {
                    // Initialize Twilio client
                    const twilio = require('twilio');
                    const twilioClient = twilio(
                        process.env.TWILIO_ACCOUNT_SID,
                        process.env.TWILIO_AUTH_TOKEN
                    );

                    // Send SMS via Twilio
                    const twilioMessage = await twilioClient.messages.create({
                        body: message_content,
                        from: process.env.TWILIO_PHONE_NUMBER,
                        to: lead_phone
                    });

                    console.log(`✅ SMS sent! SID: ${twilioMessage.sid}`);

                    // Update message status to sent
                    await db.query(
                        'UPDATE messages SET status = $1, twilio_sid = $2 WHERE id = $3',
                        ['sent', twilioMessage.sid, newMessage.id]
                    );

                    newMessage.status = 'sent';
                    newMessage.twilio_sid = twilioMessage.sid;
                }
            } catch (twilioError) {
                console.error('❌ Twilio error:', twilioError.message);
                await db.query('UPDATE messages SET status = $1 WHERE id = $2', ['failed', newMessage.id]);
                newMessage.status = 'failed';
            }
        }

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
            console.log(`📨 WebSocket event emitted for conversation ${conversationId}`);
        }

        console.log(`✅ Message sent in conversation ${conversationId}`);

        // Return the message object with the actual status
        res.json({ message: newMessage });

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
// ⚠️ UPLOAD ROUTE REMOVED - Use /api/documents/upload for direct S3 uploads

// Download document from S3
router.get('/:conversationId/documents/:documentId/download', async (req, res) => {
    try {
        const { documentId } = req.params;
        const db = getDatabase();

        // 1. Get document info from DB
        const result = await db.query(
            'SELECT filename, original_filename, s3_key, mime_type FROM documents WHERE id = $1',
            [documentId]
        );

        if (result.rows.length === 0) {
            return res.status(404).send('Document not found');
        }

        const doc = result.rows[0];

        if (!doc.s3_key) {
            return res.status(404).send('Document not found in S3. Please re-upload this document.');
        }

        // 2. Prepare the Filename
        // Use the real filename, or fallback to 'document.pdf'
        let downloadName = doc.filename || doc.original_filename || 'document.pdf';

        // FIX: Remove dangerous characters (like newlines/quotes) that break headers
        downloadName = downloadName.replace(/"/g, "'").replace(/[\r\n]/g, "");

        console.log('📥 Downloading document:', downloadName);

        // 3. Set Headers - QUOTES ARE CRITICAL: filename="${downloadName}"
        res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
        res.setHeader('Content-Type', doc.mime_type || 'application/pdf');

        // 4. Stream file from S3
        const AWS = require('aws-sdk');
        AWS.config.update({
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            region: process.env.AWS_REGION || 'us-east-1'
        });

        const s3 = new AWS.S3();
        const s3Stream = s3.getObject({
            Bucket: process.env.S3_DOCUMENTS_BUCKET,
            Key: doc.s3_key
        }).createReadStream();

        // Handle Stream Errors (File missing in S3)
        s3Stream.on('error', (s3Err) => {
            console.error('❌ S3 Stream Error:', s3Err);
            if (!res.headersSent) {
                res.status(404).send('File not found in storage');
            }
        });

        // Pipe to response
        s3Stream.pipe(res);

    } catch (error) {
        console.error('❌ Download Route Error:', error);
        if (!res.headersSent) res.status(500).send('Server Error');
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

        } else {
            // Document doesn't have S3 key - re-upload required
            return res.status(404).json({
                error: 'Document not found in S3. Please re-upload this document.'
            });
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
        // ✅ FIX: Removed dangerous DROP TRIGGER logic.
        // If the DB trigger fails, we should let it fail and fix the schema, not delete the trigger.
        const result = await db.query(`
            UPDATE documents
            SET original_filename = $1
            WHERE id = $2 AND conversation_id = $3
            RETURNING *
        `, [finalFilename, documentId, conversationId]);

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

// Send to lenders - Submit deal to selected lenders (Optimized with Streams)
router.post('/:id/send-to-lenders', async (req, res) => {
    try {
        const { id: conversationId } = req.params;
        const { selectedLenders, businessData, documents } = req.body;

        console.log('📤 Sending to lenders:', {
            conversationId,
            lenderCount: selectedLenders?.length,
            documentCount: documents?.length
        });

        if (!selectedLenders || selectedLenders.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No lenders selected'
            });
        }

        const db = getDatabase();
        const successful = [];
        const failed = [];

        // 1. Fetch Document Metadata ONLY (Lightweight)
        // We do NOT download the files here. We just get the keys to stream them later.
        const documentMetadata = [];
        if (documents && documents.length > 0) {
            console.log(`📎 Preparing metadata for ${documents.length} documents...`);

            // Optimize: Fetch all metadata in one query instead of a loop
            const docIds = documents.map(d => d.id);
            try {
                const docResult = await db.query(
                    `SELECT * FROM documents WHERE id = ANY($1::uuid[])`,
                    [docIds]
                );

                documentMetadata.push(...docResult.rows);
                console.log(`✅ Found metadata for ${documentMetadata.length} documents`);
            } catch (docError) {
                console.error(`❌ Failed to fetch document metadata:`, docError.message);
            }
        }

        // 2. Create submissions for each lender
        for (const lenderData of selectedLenders) {
            try {
                const lenderName = lenderData.name || lenderData.lender_name;
                const lenderEmail = lenderData.email;

                if (!lenderName) {
                    failed.push({ lenderData, error: 'Missing lender name' });
                    continue;
                }

                // Look up lender
                let lenderQuery = 'SELECT id, name, email FROM lenders WHERE name ILIKE $1';
                const queryParams = [lenderName];
                if (lenderEmail) {
                    lenderQuery += ' OR email ILIKE $2';
                    queryParams.push(lenderEmail);
                }

                const lenderResult = await db.query(lenderQuery, queryParams);
                let lenderId = null;
                let lender = lenderResult.rows.length > 0 ? lenderResult.rows[0] : { name: lenderName, email: lenderEmail };
                if (lenderResult.rows.length > 0) lenderId = lender.id;

                // Create submission record
                const submissionId = uuidv4();
                await db.query(`
                    INSERT INTO lender_submissions (
                        id, conversation_id, lender_id, lender_name, status,
                        submitted_at, custom_message, message, created_at
                    ) VALUES ($1, $2, $3, $4, $5, NOW(), $6, $6, NOW())
                `, [
                    submissionId, conversationId, lenderId, lenderName, 'submitted',
                    businessData?.customMessage || null
                ]);

                // 3. PREPARE STREAMS (The Memory Fix)
                // We create fresh ReadStreams for this specific email.
                // This streams data from S3 -> Node -> Email Server without buffering RAM.
                const emailAttachments = documentMetadata.map(doc => ({
                    filename: doc.original_filename,
                    // Create a fresh stream for this email
                    content: s3.getObject({ Bucket: doc.s3_bucket, Key: doc.s3_key }).createReadStream(),
                    contentType: doc.mime_type || 'application/pdf'
                }));

                // Send email
                let emailResult = null;
                const recipientEmail = lenderEmail || lender.email;

                if (recipientEmail) {
                    console.log(`📧 Streaming email to ${recipientEmail} with ${emailAttachments.length} attachments...`);

                    try {
                        emailResult = await emailService.sendLenderSubmission(
                            recipientEmail,
                            businessData,
                            emailAttachments // Passes streams, not buffers
                        );

                        await db.query(
                            'UPDATE lender_submissions SET status = $1 WHERE id = $2',
                            ['sent', submissionId]
                        );
                    } catch (emailError) {
                        console.error(`❌ Email failed:`, emailError.message);
                        await db.query(
                            'UPDATE lender_submissions SET status = $1 WHERE id = $2',
                            ['email_failed', submissionId]
                        );
                        emailResult = { success: false, error: emailError.message };
                    }
                } else {
                    console.warn(`⚠️ No email for ${lenderName}`);
                }

                successful.push({
                    lenderId, lenderName, submissionId,
                    emailSent: emailResult?.success || false
                });

            } catch (error) {
                console.error(`❌ Submission failed for ${lenderData.name}:`, error);
                failed.push({ lenderName: lenderData.name, error: error.message });
            }
        }

        // Update conversation activity
        await db.query('UPDATE conversations SET last_activity = NOW() WHERE id = $1', [conversationId]);

        res.json({
            success: true,
            results: { successful, failed, total: selectedLenders.length }
        });

    } catch (error) {
        console.error('❌ Error sending to lenders:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ===== FCS (File Control Sheet) Routes =====

// Generate FCS analysis for a conversation
router.post('/:id/fcs/generate', async (req, res) => {
    try {
        const { id: conversationId } = req.params;
        const db = getDatabase();
        const fcsService = require('../services/fcsService');

        console.log(`🔵 FCS generation requested for conversation: ${conversationId}`);

        // Get conversation details
        const convResult = await db.query(
            'SELECT business_name FROM conversations WHERE id = $1',
            [conversationId]
        );

        if (convResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Conversation not found'
            });
        }

        const businessName = convResult.rows[0].business_name || 'Unknown Business';

        // Start async FCS generation (don't await - let it run in background)
        fcsService.generateAndSaveFCS(conversationId, businessName, db)
            .then(result => {
                console.log(`✅ FCS generation completed for ${conversationId}`);
            })
            .catch(error => {
                console.error(`❌ FCS generation failed for ${conversationId}:`, error.message);
            });

        // Return immediately to client
        res.json({
            success: true,
            message: 'FCS generation started',
            status: 'processing'
        });

    } catch (error) {
        console.error('Error starting FCS generation:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get FCS analysis status
router.get('/:id/fcs/status', async (req, res) => {
    try {
        const { id: conversationId } = req.params;
        const db = getDatabase();

        const result = await db.query(
            'SELECT id, status, error_message, created_at, completed_at FROM fcs_analyses WHERE conversation_id = $1',
            [conversationId]
        );

        if (result.rows.length === 0) {
            return res.json({
                success: true,
                status: 'not_started'
            });
        }

        const analysis = result.rows[0];

        res.json({
            success: true,
            status: analysis.status,
            analysisId: analysis.id,
            error: analysis.error_message,
            createdAt: analysis.created_at,
            completedAt: analysis.completed_at
        });

    } catch (error) {
        console.error('Error checking FCS status:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get completed FCS analysis
router.get('/:id/fcs', async (req, res) => {
    try {
        const { id: conversationId } = req.params;
        const db = getDatabase();

        const result = await db.query(`
            SELECT
                id,
                extracted_business_name,
                statement_count,
                fcs_report,
                average_deposits,
                average_revenue,
                total_negative_days,
                average_negative_days,
                state,
                industry,
                position_count,
                status,
                error_message,
                created_at,
                completed_at
            FROM fcs_analyses
            WHERE conversation_id = $1
        `, [conversationId]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'No FCS analysis found for this conversation'
            });
        }

        const analysis = result.rows[0];

        res.json({
            success: true,
            analysis: {
                id: analysis.id,
                businessName: analysis.extracted_business_name,
                statementCount: analysis.statement_count,
                report: analysis.fcs_report,
                metrics: {
                    averageDeposits: analysis.average_deposits,
                    averageRevenue: analysis.average_revenue,
                    totalNegativeDays: analysis.total_negative_days,
                    averageNegativeDays: analysis.average_negative_days,
                    state: analysis.state,
                    industry: analysis.industry,
                    positionCount: analysis.position_count
                },
                status: analysis.status,
                error: analysis.error_message,
                createdAt: analysis.created_at,
                completedAt: analysis.completed_at
            }
        });

    } catch (error) {
        console.error('Error fetching FCS analysis:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================================
// PDF GENERATION ENDPOINTS
// ============================================================================

const documentService = require('../services/documentService');

// 1. Generate HTML Template (Reads app5.html and fills it with data)
router.post('/:id/generate-html-template', async (req, res) => {
    try {
        const { applicationData, ownerName } = req.body;
        const clientIp = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || '127.0.0.1';

        const html = documentService.generatePopulatedTemplate(applicationData, ownerName, clientIp);
        res.send(html);

    } catch (error) {
        console.error('❌ Error generating template:', error);
        res.status(500).json({ error: 'Failed to generate HTML template' });
    }
});

// 2. Save Generated PDF to S3 and Database
router.post('/:id/save-generated-pdf', async (req, res) => {
    try {
        const { conversationId, pdfBase64, filename, documentId } = req.body;
        const db = getDatabase();

        const buffer = Buffer.from(pdfBase64, 'base64');
        const s3Key = `generated/${conversationId}/${Date.now()}_${filename}`;

        // Upload to S3
        await s3.putObject({
            Bucket: process.env.S3_DOCUMENTS_BUCKET,
            Key: s3Key,
            Body: buffer,
            ContentType: 'application/pdf'
        }).promise();

        // Save to Database
        const docId = documentId || uuidv4();
        await db.query(`
            INSERT INTO documents (
                id, conversation_id, s3_key, original_filename,
                mime_type, file_size, created_at
            )
            VALUES ($1, $2, $3, $4, 'application/pdf', $5, NOW())
        `, [
            docId,
            conversationId,
            s3Key,
            filename,
            buffer.length
        ]);

        console.log(`✅ PDF Saved: ${filename}`);
        res.json({ success: true });

    } catch (error) {
        console.error('❌ Error saving PDF:', error);
        res.status(500).json({ error: 'Failed to save PDF to S3/DB' });
    }
});

// 3. Generate PDF using Puppeteer (Server-Side Rendering)
router.post('/:id/generate-pdf-document', async (req, res) => {
    try {
        const conversationId = req.params.id;
        const { applicationData, ownerName } = req.body;
        const clientIp = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || '127.0.0.1';

        const result = await documentService.generateLeadPDF(
            conversationId,
            applicationData,
            ownerName,
            clientIp
        );

        res.json({ success: true, message: 'PDF generated successfully', document: result });

    } catch (error) {
        console.error('❌ Puppeteer PDF Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
