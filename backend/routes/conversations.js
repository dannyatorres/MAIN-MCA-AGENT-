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

// Get all conversations (Now with SERVER-SIDE SEARCH)
router.get('/', async (req, res) => {
    try {
        const { state, priority, limit = 50, offset = 0, filter, search } = req.query;
        const db = getDatabase();

        let query = `
            SELECT
                c.id, c.display_id, c.lead_phone, c.business_name,
                c.first_name, c.last_name, c.state, c.current_step,
                c.priority, c.has_offer,
                COALESCE(c.last_activity, c.created_at) as last_activity,
                c.created_at,

                COALESCE((
                    SELECT COUNT(*) FROM messages m
                    WHERE m.conversation_id = c.id
                      AND m.direction = 'inbound'
                      AND m.timestamp > COALESCE(c.last_read_at, '1970-01-01')
                ), 0)::INTEGER as unread_count,

                EXISTS (
                    SELECT 1 FROM messages m
                    WHERE m.conversation_id = c.id AND m.direction = 'inbound'
                ) as has_response,

                (SELECT content FROM messages m
                 WHERE m.conversation_id = c.id
                 ORDER BY m.timestamp DESC LIMIT 1) as last_message

            FROM conversations c
            WHERE 1=1
        `;

        const values = [];
        let paramIndex = 1;

        // 1. STATE FILTER
        if (state) {
            query += ` AND c.state = $${paramIndex++}`;
            values.push(state);
        }

        // 2. PRIORITY FILTER
        if (priority) {
            query += ` AND c.priority = $${paramIndex++}`;
            values.push(priority);
        }

        // 3. SEARCH FILTER (Fixed for Business Names)
        if (search) {
            const term = search.trim();
            const searchTerm = `%${term}%`;

            // Fix: Check if the user actually typed any digits
            const digitsOnly = term.replace(/\D/g, '');
            const phoneSearch = digitsOnly.length > 0 ? `%${digitsOnly}%` : null;

            // 1. Setup the text search (Business Name, Person Name, Email)
            // Note: We use the current paramIndex for all these fields
            let conditions = [
                `c.business_name ILIKE $${paramIndex}`,
                `c.first_name ILIKE $${paramIndex}`,
                `c.last_name ILIKE $${paramIndex}`,
                `c.email ILIKE $${paramIndex}`,
                `CAST(c.display_id AS TEXT) ILIKE $${paramIndex}`
            ];

            values.push(searchTerm);
            paramIndex++; // Move index forward for the next value

            // 2. Only add phone search if user typed numbers
            // This prevents the "Match Everything" bug when searching for names
            if (phoneSearch) {
                conditions.push(`c.lead_phone LIKE $${paramIndex}`);
                values.push(phoneSearch);
                paramIndex++;
            }

            // Join them all with OR
            query += ` AND (${conditions.join(' OR ')})`;
        }

        // 4. QUICK FILTERS
        if (filter) {
            if (filter === 'INTERESTED') {
                query += ` AND EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id AND m.direction = 'inbound')`;
            } else if (filter === 'UNREAD') {
                query += ` AND (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.direction = 'inbound' AND m.timestamp > COALESCE(c.last_read_at, '1970-01-01')) > 0`;
            } else {
                query += ` AND c.current_step = $${paramIndex++}`;
                values.push(filter);
            }
        }

        // 5. SORTING & PAGING
        query += ` ORDER BY c.last_activity DESC NULLS LAST LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
        values.push(parseInt(limit), parseInt(offset));

        const result = await db.query(query, values);
        res.json(result.rows);

    } catch (error) {
        console.error('Get conversations error:', error);
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

        // Get conversation with all details (all data now in conversations table)
        const query = `
            SELECT * FROM conversations c
            WHERE ${isNumeric ? 'c.display_id = $1' : 'c.id = $1'}
        `;

        const result = await db.query(query, [isNumeric ? parseInt(id) : id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Conversation not found' });
        }

        const conversation = result.rows[0];

        // =========================================================
        // FETCH COMMANDER STRATEGY
        // =========================================================
        try {
            const strategyResult = await db.query(`
                SELECT lead_grade, strategy_type, game_plan, offer_amount, offer_generated_at
                FROM lead_strategy
                WHERE conversation_id = $1
            `, [conversation.id]);

            if (strategyResult.rows.length > 0) {
                conversation.lead_strategy = strategyResult.rows[0];

                // If the game_plan is stored as a string, parse it
                if (typeof conversation.lead_strategy.game_plan === 'string') {
                    conversation.lead_strategy.game_plan = JSON.parse(conversation.lead_strategy.game_plan);
                }
            } else {
                conversation.lead_strategy = null;
            }
        } catch (err) {
            console.error('Failed to attach strategy:', err.message);
            // Don't crash the whole request if this table is missing
            conversation.lead_strategy = null;
        }
        // =========================================================

        // --- AUTO-CLEAR OFFER FLAG ---
        if (conversation.has_offer) {
            await db.query(`UPDATE conversations SET has_offer = FALSE WHERE id = $1`, [conversation.id]);
        }
        // -----------------------------

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

// Create new conversation (FIXED ADDRESS MAPPING)
router.post('/', async (req, res) => {
    try {
        const data = req.body;
        const db = getDatabase();

        console.log('📝 Creating new lead...');

        // --- 1. PREP & MAP DATA ---
        // Clean Phone: Frontend sends 'primaryPhone', DB needs 'lead_phone'
        const leadPhone = (data.lead_phone || data.primaryPhone || '').replace(/\D/g, '');

        // Helper to clean other phones
        const cleanPhone = (val) => (val || '').replace(/\D/g, '');

        // Clean Currency
        ['annualRevenue', 'monthlyRevenue', 'requestedAmount', 'funding_amount'].forEach(k => {
            if (data[k]) data[k] = String(data[k]).replace(/[^0-9.]/g, '');
        });

        // --- 2. SMART NAME EXTRACTION ---
        let firstName = data.first_name || data.owner_name || data.ownerFirstName || data.contact_name || null;
        let lastName = data.last_name || data.ownerLastName || null;

        if (firstName && firstName.includes(' ') && !lastName) {
            const parts = firstName.split(' ');
            firstName = parts[0];
            lastName = parts.slice(1).join(' ');
        }

        // --- 3. CHECK FOR DUPLICATES ---
        const existingCheck = await db.query(
            'SELECT id FROM conversations WHERE lead_phone = $1',
            [leadPhone]
        );

        let newId;
        let isUpdate = false;

        if (existingCheck.rows.length > 0) {
            // DUPLICATE FOUND: Update specific fields instead of creating
            newId = existingCheck.rows[0].id;
            isUpdate = true;
            console.log(`⚠️ Lead exists (${newId}). Updating basic info.`);

            await db.query(`
                UPDATE conversations SET
                    business_name = COALESCE($1, business_name),
                    email = COALESCE($2, email),
                    first_name = COALESCE($3, first_name),
                    last_name = COALESCE($4, last_name),
                    last_activity = NOW()
                WHERE id = $5
            `, [data.business_name || data.businessName, data.email || data.businessEmail, firstName, lastName, newId]);

        } else {
            // --- 4. INSERT ALL FIELDS (With Correct Address Mapping) ---
            const insertResult = await db.query(`
                INSERT INTO conversations (
                    business_name, lead_phone, email, us_state,
                    address, city, zip,
                    first_name, last_name,
                    lead_source, notes, current_step, priority,
                    tax_id, business_start_date, business_type, entity_type, industry_type,
                    annual_revenue, monthly_revenue, funding_amount,
                    ssn, date_of_birth,
                    credit_score, funding_status, recent_funding,
                    owner_ownership_percent, owner_home_address, owner_home_city, owner_home_state, owner_home_zip,
                    owner2_first_name, owner2_last_name, owner2_email, owner2_phone,
                    owner2_ssn, owner2_dob, owner2_ownership_percent,
                    owner2_address, owner2_city, owner2_state, owner2_zip
                )
                VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'initial_contact', $12,
                    $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25,
                    $26, $27, $28, $29, $30,
                    $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41
                )
                RETURNING id
            `, [
                // 1-4: Basic Info
                data.business_name || data.businessName,
                leadPhone,
                data.email || data.businessEmail,
                data.us_state || data.businessState, // Maps businessState -> us_state

                // 5-7: Address (THE FIX IS HERE)
                data.address || data.businessAddress, // Maps businessAddress -> address
                data.city || data.businessCity,       // Maps businessCity -> city
                data.zip || data.businessZip,         // Maps businessZip -> zip

                // 8-12: Meta
                firstName,
                lastName,
                data.lead_source || 'Manual Entry',
                data.notes || '',
                data.priority ? parseInt(data.priority) : 1,

                // 13-17: Business Details
                data.tax_id || data.federalTaxId || null,
                data.business_start_date || data.businessStartDate || null,
                data.business_type || null,
                data.entity_type || data.entityType || null,
                data.industry_type || data.industryType || null,

                // 18-20: Financials
                data.annual_revenue || data.annualRevenue || null,
                data.monthly_revenue || data.monthlyRevenue || null,
                data.funding_amount || data.requestedAmount || null,

                // 21-30: Owner 1
                data.ssn || data.ownerSSN || null,
                data.date_of_birth || data.ownerDOB || null,
                data.credit_score || data.creditScore || null,
                data.funding_status || data.fundingStatus || null,
                data.recent_funding || data.recentFunding || null,
                data.owner_ownership_percent || data.ownershipPercent || null,
                data.owner_home_address || data.ownerHomeAddress || null,
                data.owner_home_city || data.ownerHomeCity || null,
                data.owner_home_state || data.ownerHomeState || null,
                data.owner_home_zip || data.ownerHomeZip || null,

                // 31-41: Owner 2
                data.owner2_first_name || data.owner2FirstName || null,
                data.owner2_last_name || data.owner2LastName || null,
                data.owner2_email || data.owner2Email || null,
                cleanPhone(data.owner2_phone || data.owner2Phone),
                data.owner2_ssn || data.owner2SSN || null,
                data.owner2_dob || data.owner2DOB || null,
                data.owner2_ownership_percent || data.owner2OwnershipPercent || null,
                data.owner2_address || data.owner2HomeAddress || null,
                data.owner2_city || data.owner2HomeCity || null,
                data.owner2_state || data.owner2HomeState || null,
                data.owner2_zip || data.owner2HomeZip || null
            ]);
            newId = insertResult.rows[0].id;
        }

        console.log(`✅ Lead ${isUpdate ? 'updated' : 'created'}: ${newId}`);

        // Fetch and return the full record to update the frontend state
        const finalConversation = await db.query('SELECT * FROM conversations WHERE id = $1', [newId]);

        res.json({
            success: true,
            conversation: finalConversation.rows[0]
        });

    } catch (error) {
        console.error('❌ Error creating conversation:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Update conversation (SMART UPDATE - Updates both tables)
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        console.log('📥 RAW body received:', JSON.stringify(updates, null, 2));
        const db = getDatabase();

        console.log(`📝 Updating conversation ${id} (Smart Update)...`);

        // 1. Sanitize: Convert empty strings to null
        Object.keys(updates).forEach(key => {
            if (updates[key] === '') updates[key] = null;
        });

        // 2. Define Field Mappings (camelCase -> snake_case)
        const fieldMap = {
            // Basic Info
            'businessName': 'business_name',
            'business_name': 'business_name',
            'dbaName': 'dba_name',
            'dba_name': 'dba_name',
            'primaryPhone': 'lead_phone',
            'lead_phone': 'lead_phone',
            'cellPhone': 'cell_phone',
            'cell_phone': 'cell_phone',
            'businessEmail': 'email',
            'email': 'email',

            // Address
            'businessAddress': 'address',
            'address': 'address',
            'businessCity': 'city',
            'city': 'city',
            'businessState': 'us_state',
            'us_state': 'us_state',
            'businessZip': 'zip',
            'zip': 'zip',

            // Business Details
            'entityType': 'entity_type',
            'entity_type': 'entity_type',
            'industryType': 'industry_type',
            'industry_type': 'industry_type',
            'businessType': 'business_type',
            'business_type': 'business_type',
            'businessStartDate': 'business_start_date',
            'business_start_date': 'business_start_date',
            'federalTaxId': 'tax_id',
            'tax_id': 'tax_id',

            // Financials
            'annualRevenue': 'annual_revenue',
            'annual_revenue': 'annual_revenue',
            'monthlyRevenue': 'monthly_revenue',
            'monthly_revenue': 'monthly_revenue',
            'requestedAmount': 'funding_amount',
            'funding_amount': 'funding_amount',
            'creditScore': 'credit_score',
            'credit_score': 'credit_score',
            'fundingStatus': 'funding_status',
            'funding_status': 'funding_status',
            'recentFunding': 'recent_funding',
            'recent_funding': 'recent_funding',

            // Owner 1
            'ownerFirstName': 'first_name',
            'first_name': 'first_name',
            'ownerLastName': 'last_name',
            'last_name': 'last_name',
            'ownerSSN': 'ssn',
            'ssn': 'ssn',
            'ownerDOB': 'date_of_birth',
            'date_of_birth': 'date_of_birth',
            'ownerPhone': 'owner_phone',
            'owner_phone': 'owner_phone',
            'ownerEmail': 'owner_email',
            'owner_email': 'owner_email',
            'ownershipPercent': 'owner_ownership_percent',
            'ownerPercent': 'owner_ownership_percent',
            'owner_ownership_percent': 'owner_ownership_percent',
            'ownerHomeAddress': 'owner_home_address',
            'owner_home_address': 'owner_home_address',
            'ownerHomeCity': 'owner_home_city',
            'owner_home_city': 'owner_home_city',
            'ownerHomeState': 'owner_home_state',
            'owner_home_state': 'owner_home_state',
            'ownerHomeZip': 'owner_home_zip',
            'owner_home_zip': 'owner_home_zip',

            // Owner 2
            'owner2FirstName': 'owner2_first_name',
            'owner2_first_name': 'owner2_first_name',
            'owner2LastName': 'owner2_last_name',
            'owner2_last_name': 'owner2_last_name',
            'owner2Email': 'owner2_email',
            'owner2_email': 'owner2_email',
            'owner2Phone': 'owner2_phone',
            'owner2_phone': 'owner2_phone',
            'owner2SSN': 'owner2_ssn',
            'owner2_ssn': 'owner2_ssn',
            'owner2DOB': 'owner2_dob',
            'owner2_dob': 'owner2_dob',
            'owner2OwnershipPercent': 'owner2_ownership_percent',
            'owner2_ownership_percent': 'owner2_ownership_percent',
            'owner2HomeAddress': 'owner2_address',
            'owner2_address': 'owner2_address',
            'owner2HomeCity': 'owner2_city',
            'owner2_city': 'owner2_city',
            'owner2HomeState': 'owner2_state',
            'owner2_state': 'owner2_state',
            'owner2HomeZip': 'owner2_zip',
            'owner2_zip': 'owner2_zip',

            // Other
            'state': 'state',
            'priority': 'priority',
            'leadSource': 'lead_source',
            'lead_source': 'lead_source',
            'notes': 'notes'
        };

        // 3. Convert incoming data to snake_case
        const dbUpdates = {};
        for (const [key, value] of Object.entries(updates)) {
            const dbColumn = fieldMap[key];
            if (dbColumn && value !== undefined) {
                dbUpdates[dbColumn] = value;
            }
        }

        console.log('📥 Mapped updates:', dbUpdates);

        // 4. Update conversations table
        if (Object.keys(dbUpdates).length > 0) {
            const setClauses = Object.keys(dbUpdates).map((k, i) => `${k} = $${i + 2}`);
            const values = [id, ...Object.values(dbUpdates)];

            await db.query(`
                UPDATE conversations
                SET ${setClauses.join(', ')}, last_activity = NOW()
                WHERE id = $1
            `, values);
            console.log(`✅ Updated ${Object.keys(dbUpdates).length} fields`);
        }

        // Return updated object
        const finalRes = await db.query('SELECT * FROM conversations WHERE id = $1', [id]);
        res.json({ success: true, conversation: finalRes.rows[0] });

    } catch (error) {
        console.error('❌ Update error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Toggle AI on/off for a conversation
router.post('/:id/toggle-ai', async (req, res) => {
    try {
        const { enabled } = req.body; // true or false
        const db = getDatabase();
        await db.query('UPDATE conversations SET ai_enabled = $1 WHERE id = $2', [enabled, req.params.id]);
        console.log(`🤖 AI ${enabled ? 'ENABLED' : 'DISABLED'} for conversation ${req.params.id}`);
        res.json({ success: true, ai_enabled: enabled });
    } catch (err) {
        console.error('❌ Toggle AI error:', err);
        res.status(500).json({ error: err.message });
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

        // lead_details table no longer used - data is in conversations table

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

// Send message (nested under conversations) - Supports SMS and MMS
router.post('/:id/messages', async (req, res) => {
    try {
        const { id: conversationId } = req.params;
        // Accept media_url from the frontend for MMS
        const { message_content, sender_type = 'user', media_url } = req.body;
        const db = getDatabase();

        // Allow empty text IF there is an image
        if (!message_content && !media_url) {
            return res.status(400).json({ error: 'Message content or attachment is required' });
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

        // Determine message type (SMS vs MMS)
        const messageType = media_url ? 'mms' : 'sms';

        // Insert message with media_url
        const result = await db.query(`
            INSERT INTO messages (
                conversation_id, content, direction, message_type,
                sent_by, media_url, timestamp, status
            )
            VALUES ($1, $2, $3, $4, $5, $6, NOW(), 'pending')
            RETURNING *
        `, [
            conversationId,
            message_content || '', // Allow empty string if image exists
            direction,
            messageType,
            sender_type,
            media_url || null
        ]);

        const newMessage = result.rows[0];

        // SEND VIA TWILIO (if outbound)
        if (direction === 'outbound') {
            try {
                if (!lead_phone) {
                    throw new Error('No phone number found for this conversation');
                }

                console.log(`📞 Sending ${messageType.toUpperCase()} to ${lead_phone}...`);

                if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
                    console.error('❌ Twilio credentials not configured!');
                    await db.query('UPDATE messages SET status = $1 WHERE id = $2', ['failed', newMessage.id]);
                    newMessage.status = 'failed';
                } else {
                    const twilio = require('twilio');
                    const twilioClient = twilio(
                        process.env.TWILIO_ACCOUNT_SID,
                        process.env.TWILIO_AUTH_TOKEN
                    );

                    // Prepare Twilio options
                    const msgOptions = {
                        body: message_content || '',
                        from: process.env.TWILIO_PHONE_NUMBER,
                        to: lead_phone
                    };

                    // Attach the image if it exists (MMS)
                    if (media_url) {
                        msgOptions.mediaUrl = [media_url];
                    }

                    // Send SMS/MMS via Twilio
                    const twilioMessage = await twilioClient.messages.create(msgOptions);

                    console.log(`✅ ${messageType.toUpperCase()} sent! SID: ${twilioMessage.sid}`);

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
            global.io.emit('new_message', {
                conversation_id: conversationId,
                message: newMessage
            });
            console.log(`📨 WebSocket event emitted for conversation ${conversationId}`);
        }

        console.log(`✅ Message sent in conversation ${conversationId}`);

        res.json({ message: newMessage });

    } catch (error) {
        console.error('❌ Error sending message:', error);
        res.status(500).json({ error: 'Failed to send message: ' + error.message });
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

// Send to lenders - STRICT MODE (Fails if no email)
router.post('/:id/send-to-lenders', async (req, res) => {
    try {
        const { id: conversationId } = req.params;
        const { selectedLenders, businessData, documents } = req.body;

        console.log(`🚀 FAST-SEND: Processing batch for ${selectedLenders?.length} lenders...`);

        // 🕵️ SPY LOG: See exactly what data arrived
        console.log('🕵️ PAYLOAD DEBUG:', JSON.stringify(selectedLenders, null, 2));

        if (!selectedLenders || selectedLenders.length === 0) {
            return res.status(400).json({ success: false, error: 'No lenders selected' });
        }

        const db = getDatabase();

        // --- STEP 1: PRE-DOWNLOAD DOCUMENTS ---
        const fileAttachments = [];
        if (documents && documents.length > 0) {
            console.log(`📥 Downloading ${documents.length} documents from S3...`);
            const docIds = documents.map(d => d.id);
            const docResult = await db.query(
                `SELECT * FROM documents WHERE id = ANY($1::uuid[])`,
                [docIds]
            );

            const downloadPromises = docResult.rows.map(async (doc) => {
                if (!doc.s3_key) return null;
                try {
                    const s3Obj = await s3.getObject({
                        Bucket: process.env.S3_DOCUMENTS_BUCKET,
                        Key: doc.s3_key
                    }).promise();
                    return {
                        filename: doc.original_filename,
                        content: s3Obj.Body,
                        contentType: doc.mime_type || 'application/pdf'
                    };
                } catch (err) {
                    console.error(`❌ S3 Download Failed [${doc.original_filename}]:`, err.message);
                    return null;
                }
            });

            const results = await Promise.all(downloadPromises);
            fileAttachments.push(...results.filter(f => f !== null));
        }

        // --- STEP 2: PARALLEL SUBMISSION (WITH LOGGING) ---
        const submissionPromises = selectedLenders.map(async (lenderData) => {
            const lenderName = lenderData.name || lenderData.lender_name;
            let lenderEmail = lenderData.email;
            let lenderCC = lenderData.cc_email || null; // 1. Try to get CC from Frontend

            const submissionId = uuidv4();

            // 🕵️ DEBUG LOG: What did Frontend send?
            console.log(`🕵️ PROCESSING LENDER: "${lenderName}"`);
            console.log(`   👉 Frontend Email: ${lenderEmail}`);
            console.log(`   📧 Frontend CC:    ${lenderCC}`);

            try {
                if (!lenderName) throw new Error('Missing lender name');

                // 2a. Find/Create Lender Record (Quick Lookup)
                let lenderId = null;

                // ✅ QUERY: Fuzzy match lender name (both directions)
                const lenderResult = await db.query(
                    `SELECT id, email, cc_email FROM lenders
                     WHERE LOWER(TRIM(name)) ILIKE '%' || LOWER(TRIM($1)) || '%'
                        OR LOWER(TRIM($1)) ILIKE '%' || LOWER(TRIM(name)) || '%'
                     LIMIT 1`,
                    [lenderName]
                );

                if (lenderResult.rows.length > 0) {
                    const dbLender = lenderResult.rows[0];
                    lenderId = dbLender.id;

                    console.log(`   🏦 DB FOUND MATCH: ID ${dbLender.id}`);
                    console.log(`   🏦 DB Email: ${dbLender.email}`);
                    console.log(`   🏦 DB CC:    ${dbLender.cc_email}`);

                    // 🛡️ FAIL-SAFE 1: If Frontend missing email, use DB email
                    if (!lenderEmail || !lenderEmail.includes('@')) {
                        console.log(`   ⚠️ Frontend missing email. Using DB: ${dbLender.email}`);
                        lenderEmail = dbLender.email;
                    }

                    // 🛡️ FAIL-SAFE 2: If Frontend missing CC, use DB CC
                    if (!lenderCC && dbLender.cc_email) {
                        console.log(`   ⚠️ Frontend missing CC. Using DB: ${dbLender.cc_email}`);
                        lenderCC = dbLender.cc_email;
                    }
                } else {
                    console.log(`   ❌ NO DATABASE MATCH for "${lenderName}"`);
                }

                // Final check before sending
                console.log(`   🚀 FINAL SENDING TO: To: ${lenderEmail}, CC: ${lenderCC}`);

                // 🚨 Final Validation
                if (!lenderEmail || !lenderEmail.includes('@')) {
                    throw new Error(`No valid email address found for ${lenderName}`);
                }

                // 2b. Create DB Record
                await db.query(`
                    INSERT INTO lender_submissions (
                        id, conversation_id, lender_id, lender_name, status,
                        submitted_at, custom_message, message, created_at
                    ) VALUES ($1, $2, $3, $4, 'processing', NOW(), $5, $5, NOW())
                `, [
                    submissionId, conversationId, lenderId, lenderName,
                    businessData?.customMessage || null
                ]);

                // 2c. Send Email
                // ✅ UPDATE: Pass 'lenderName' as the FIRST argument
                const emailResult = await emailService.sendLenderSubmission(
                    lenderName,      // <--- Added this
                    lenderEmail,
                    businessData,
                    fileAttachments,
                    lenderCC
                );

                if (emailResult.success) {
                    await db.query('UPDATE lender_submissions SET status = $1 WHERE id = $2', ['sent', submissionId]);
                    return { status: 'fulfilled', lenderName, emailSent: true };
                } else {
                    throw new Error(emailResult.error || 'Email service failed');
                }

            } catch (error) {
                console.error(`❌ Failed to send to ${lenderName}:`, error.message);

                if (submissionId) {
                    try { await db.query('UPDATE lender_submissions SET status = $1 WHERE id = $2', ['failed', submissionId]); } catch (e) {}
                }

                return { status: 'rejected', lenderName, reason: error.message };
            }
        });

        // --- STEP 3: RESULTS ---
        const results = await Promise.all(submissionPromises);

        const successful = results.filter(r => r.status === 'fulfilled');
        const failed = results.filter(r => r.status === 'rejected').map(r => ({
            lender: r.lenderName,
            error: r.reason
        }));

        console.log(`🏁 Batch Complete: ${successful.length} sent, ${failed.length} failed.`);

        res.json({
            success: true,
            results: { successful, failed, total: selectedLenders.length }
        });

    } catch (error) {
        console.error('❌ Critical Error:', error);
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
                completed_at,
                average_daily_balance,
                average_deposit_count,
                time_in_business_text,
                last_mca_deposit_date,
                withholding_percentage
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
                    positionCount: analysis.position_count,
                    average_deposit_count: analysis.average_deposit_count,
                    withholding_percentage: analysis.withholding_percentage,
                    averageDailyBalance: analysis.average_daily_balance
                },
                status: analysis.status,
                error: analysis.error_message,
                createdAt: analysis.created_at,
                completedAt: analysis.completed_at,
                average_daily_balance: analysis.average_daily_balance,
                average_deposit_count: analysis.average_deposit_count,
                time_in_business_text: analysis.time_in_business_text,
                last_mca_deposit_date: analysis.last_mca_deposit_date,
                withholding_percentage: analysis.withholding_percentage
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

        // --- CUSTOM: GENERATE RANDOM IP FOR TESTING ---
        const getRandomIp = () => Array(4).fill(0).map(() => Math.floor(Math.random() * 256)).join('.');
        const clientIp = getRandomIp();
        console.log(`🎲 Generated Random IP for PDF: ${clientIp}`);
        // ----------------------------------------------

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

// ============================================================================
// LENDER QUALIFICATION PERSISTENCE (For AI to reference results)
// ============================================================================

// SAVE Lender Qualification Results
router.post('/:id/lenders/save-results', async (req, res) => {
    try {
        const { id: conversationId } = req.params;
        const { results, criteria } = req.body;
        const db = getDatabase();

        console.log(`💾 Saving lender qualifications for conversation: ${conversationId}`);

        const recordId = uuidv4();

        // Delete old qualifications for this conversation (keep only the latest)
        await db.query('DELETE FROM lender_qualifications WHERE conversation_id = $1', [conversationId]);

        // Insert new results
        await db.query(`
            INSERT INTO lender_qualifications (
                id, conversation_id, qualification_data, criteria_used, qualified_lenders, created_at
            )
            VALUES ($1, $2, $3, $4, $5, NOW())
        `, [
            recordId,
            conversationId,
            JSON.stringify(results),
            JSON.stringify(criteria),
            JSON.stringify(results.qualified || [])
        ]);

        console.log('✅ Qualification results saved to database');

        // Update conversation last_activity
        await db.query('UPDATE conversations SET last_activity = NOW() WHERE id = $1', [conversationId]);

        res.json({ success: true });

    } catch (error) {
        console.error('❌ Error saving lender qualifications:', error);
        res.status(500).json({ error: 'Failed to save results' });
    }
});

// GET Lender Qualification Results (For loading history)
router.get('/:id/lenders/results', async (req, res) => {
    try {
        const { id } = req.params;
        const db = getDatabase();

        const result = await db.query(`
            SELECT * FROM lender_qualifications
            WHERE conversation_id = $1
            ORDER BY created_at DESC
            LIMIT 1
        `, [id]);

        if (result.rows.length === 0) {
            return res.json({ success: false, message: 'No qualification data found' });
        }

        res.json({
            success: true,
            data: result.rows[0].qualification_data,
            criteria: result.rows[0].criteria_used
        });

    } catch (error) {
        console.error('❌ Error fetching lender qualifications:', error);
        res.status(500).json({ error: 'Failed to fetch results' });
    }
});

// ==========================================
// 🤖 AI DISPATCHER TOOLS
// ==========================================

// Reset a lead so the AI Dispatcher picks it up immediately
router.post('/:id/reset-ai', async (req, res) => {
    try {
        const { id } = req.params;
        const db = getDatabase();

        console.log(`🤖 RESETTING LEAD ${id} FOR AI DISPATCHER...`);

        // 1. Reset state to 'NEW'
        // 2. Set last_activity to 20 mins ago (so the 5-min buffer passes)
        // 3. Ensure priority is high so it's grabbed first
        const result = await db.query(`
            UPDATE conversations
            SET state = 'NEW',
                current_step = 'initial_contact',
                last_activity = NOW() - INTERVAL '20 minutes',
                priority = 1
            WHERE id = $1
            RETURNING *
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: "Lead not found" });
        }

        res.json({
            success: true,
            message: "Lead reset! Dispatcher will grab it in <15 mins (or on restart).",
            lead: result.rows[0]
        });

    } catch (err) {
        console.error("❌ Reset Error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Mark conversation as read
router.post('/:id/mark-read', async (req, res) => {
    try {
        const { id } = req.params;
        const db = getDatabase();

        const isNumeric = /^\d+$/.test(id);

        const result = await db.query(`
            UPDATE conversations
            SET last_read_at = NOW()
            WHERE ${isNumeric ? 'display_id = $1' : 'id = $1'}
            RETURNING id
        `, [isNumeric ? parseInt(id) : id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Not found' });
        }

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==========================================
// COMMANDER - RUN FCS STRATEGY ANALYSIS
// ==========================================
const { analyzeAndStrategize, generateOffer, reStrategize } = require('../services/commanderService');

router.post('/:id/analyze-strategy', async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`COMMANDER: Running strategy analysis for ${id}...`);

        const gamePlan = await analyzeAndStrategize(id);

        if (!gamePlan) {
            return res.status(400).json({
                success: false,
                error: 'Analysis failed. Make sure FCS data exists for this lead.'
            });
        }

        res.json({ success: true, gamePlan });

    } catch (error) {
        console.error('Strategy Analysis Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/:id/generate-offer', async (req, res) => {
    try {
        const { id } = req.params;
        const offer = await generateOffer(id);

        if (!offer) {
            return res.status(400).json({ success: false, error: 'Offer generation failed' });
        }

        res.json({ success: true, offer });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==========================================
// 📊 OFFER COMPARISON - Track Predictions vs Actuals
// ==========================================

router.post('/:id/record-offer', async (req, res) => {
    try {
        const { id: conversationId } = req.params;
        const {
            lenderSubmissionId,
            lenderName,
            actualFunding,
            actualTerm,
            actualPayment,
            actualFactor,
            wasAccepted,
            wasFunded
        } = req.body;

        const db = getDatabase();

        // Get the strategy prediction
        const strategyRes = await db.query(`
            SELECT id, recommended_funding_max, recommended_term, recommended_payment
            FROM lead_strategy WHERE conversation_id = $1
        `, [conversationId]);

        const strategy = strategyRes.rows[0];
        const strategyId = strategy?.id || null;

        // Calculate variance
        const predictedFunding = strategy?.recommended_funding_max || 0;
        const fundingVariance = actualFunding - predictedFunding;
        const fundingVariancePct = predictedFunding > 0
            ? ((fundingVariance / predictedFunding) * 100).toFixed(2)
            : 0;

        await db.query(`
            INSERT INTO offer_comparisons (
                conversation_id, strategy_id, lender_submission_id, lender_name,
                predicted_funding, predicted_term, predicted_payment, predicted_factor,
                actual_funding, actual_term, actual_payment, actual_factor,
                funding_variance, funding_variance_pct,
                was_accepted, was_funded
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, 1.49, $8, $9, $10, $11, $12, $13, $14, $15)
        `, [
            conversationId,
            strategyId,
            lenderSubmissionId || null,
            lenderName || 'Unknown',
            predictedFunding,
            strategy?.recommended_term || 0,
            strategy?.recommended_payment || 0,
            actualFunding,
            actualTerm,
            actualPayment,
            actualFactor,
            fundingVariance,
            fundingVariancePct,
            wasAccepted || false,
            wasFunded || false
        ]);

        console.log(`📊 Offer recorded: ${actualFunding} from ${lenderName} (${fundingVariancePct}% variance)`);

        res.json({ success: true, variance: fundingVariancePct });
    } catch (error) {
        console.error('Error recording offer:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get accuracy stats
router.get('/analytics/strategy-accuracy', async (req, res) => {
    try {
        const db = getDatabase();
        const result = await db.query(`SELECT * FROM strategy_accuracy_report LIMIT 12`);
        res.json({ success: true, data: result.rows });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
