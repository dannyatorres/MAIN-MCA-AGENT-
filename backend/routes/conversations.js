// routes/conversations.js - HANDLES: Conversation management
// URLs like: /api/conversations, /api/conversations/:id

const express = require('express');
const router = express.Router();
const { getDatabase } = require('../services/database');
const documentService = require('../services/documentService');
const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || 'us-east-1'
});

// Get all conversations (Now with SERVER-SIDE SEARCH)
router.get('/', async (req, res) => {
    try {
        const { state, priority, limit = 50, offset = 0, filter, search } = req.query;
        const db = getDatabase();

        let query = `
            SELECT
                c.*,

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

        console.log(`✅ Deleted ${result.rows.length} conversations`);

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

// Message routes moved to /routes/messages.js

// Document routes moved to /routes/documents.js
// Lender submission routes moved to /routes/submissions.js
// FCS routes moved to /routes/fcs.js
// PDF routes moved to /routes/pdf.js

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

// Mark a deal as FUNDED
router.post('/:id/mark-funded', async (req, res) => {
    try {
        const { id } = req.params;
        const { amount } = req.body;
        const db = getDatabase();

        console.log(`🎉 Marking deal ${id} as FUNDED for $${amount}`);

        const result = await db.query(`
            UPDATE conversations
            SET state = 'FUNDED',
                funded_amount = $2,
                funded_at = NOW(),
                has_offer = TRUE,
                last_activity = NOW()
            WHERE id = $1
            RETURNING *
        `, [id, amount || 0]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Conversation not found' });
        }

        await db.query(`
            UPDATE lender_submissions
            SET status = 'FUNDED', last_response_at = NOW()
            WHERE conversation_id = $1 AND status = 'OFFER'
        `, [id]);

        console.log(`✅ Deal FUNDED: ${result.rows[0].business_name} - $${amount}`);

        res.json({ success: true, conversation: result.rows[0] });
    } catch (error) {
        console.error('❌ Mark funded error:', error);
        res.status(500).json({ success: false, error: error.message });
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

// Clear offer badge
router.post('/:id/clear-offer', async (req, res) => {
    try {
        const { id } = req.params;
        const db = getDatabase();

        await db.query('UPDATE conversations SET has_offer = FALSE WHERE id = $1', [id]);

        res.json({ success: true });
    } catch (error) {
        console.error('Error clearing offer:', error);
        res.status(500).json({ error: 'Failed to clear offer' });
    }
});

// ============================================================================
// PDF GENERATION ENDPOINTS (Restored)
// ============================================================================

// 1. Generate HTML Template
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

        await s3.putObject({
            Bucket: process.env.S3_DOCUMENTS_BUCKET,
            Key: s3Key,
            Body: buffer,
            ContentType: 'application/pdf'
        }).promise();

        const docId = documentId || uuidv4();
        await db.query(`
            INSERT INTO documents (
                id, conversation_id, s3_key, original_filename,
                mime_type, file_size, created_at
            )
            VALUES ($1, $2, $3, $4, 'application/pdf', $5, NOW())
        `, [docId, conversationId, s3Key, filename, buffer.length]);

        console.log(`✅ PDF Saved: ${filename}`);
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Error saving PDF:', error);
        res.status(500).json({ error: 'Failed to save PDF to S3/DB' });
    }
});

// 3. Generate PDF using Puppeteer (Server-Side)
router.post('/:id/generate-pdf-document', async (req, res) => {
    try {
        const conversationId = req.params.id;
        const { applicationData, ownerName } = req.body;

        const getRandomIp = () => Array(4).fill(0).map(() => Math.floor(Math.random() * 256)).join('.');
        const clientIp = getRandomIp();
        console.log(`🎲 Generated Random IP for PDF: ${clientIp}`);

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

// Commander & Analytics routes moved to /routes/commander.js and /routes/analytics.js

module.exports = router;
