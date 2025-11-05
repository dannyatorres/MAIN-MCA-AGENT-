// Database connection and query utilities for AWS RDS PostgreSQL
const { Pool } = require('pg');
require('dotenv').config();

class Database {
    constructor() {
        this.pool = null;
        this.initialized = false;
        // Don't initialize immediately - wait for first use
    }

    init() {
        if (this.initialized) return;

        console.log('🔗 Initializing database connection...');

        // Create PostgreSQL connection pool with SSL for AWS RDS
        const connectionConfig = {
            host: process.env.DB_HOST,
            port: process.env.DB_PORT || 5432,
            database: process.env.DB_NAME,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            ssl: process.env.DB_SSL === 'true' ? {
                rejectUnauthorized: false // Required for AWS RDS
            } : false,
            // Connection pool settings - reduced timeouts to prevent hanging
            max: 10, // Maximum number of clients in the pool
            idleTimeoutMillis: 10000, // 10 seconds
            connectionTimeoutMillis: 5000, // 5 seconds timeout
            acquireTimeoutMillis: 5000, // 5 seconds to acquire connection
            statement_timeout: 10000, // 10 seconds for statements
            query_timeout: 10000, // 10 seconds for queries
        };

        // Support DATABASE_URL format as well
        if (process.env.DATABASE_URL) {
            console.log('📎 Using DATABASE_URL connection string');
            this.pool = new Pool({
                connectionString: process.env.DATABASE_URL,
                ssl: process.env.DB_SSL === 'true' ? {
                    rejectUnauthorized: false
                } : false,
                max: 10,
                idleTimeoutMillis: 10000,
                connectionTimeoutMillis: 5000, // 5 seconds timeout
                acquireTimeoutMillis: 5000, // 5 seconds to acquire connection
                statement_timeout: 10000, // 10 seconds for statements
                query_timeout: 10000, // 10 seconds for queries
            });
        } else {
            console.log('📎 Using individual DB config parameters');
            this.pool = new Pool(connectionConfig);
        }

        // Handle connection errors gracefully
        this.pool.on('error', (err) => {
            // Don't exit the process - let the app continue with error handling
        });

        this.initialized = true;
    }

    // Test database connection
    async testConnection() {
        this.init(); // Ensure initialized
        try {
            const client = await this.pool.connect();
            const result = await client.query('SELECT NOW() as current_time, version() as version');
            client.release();
            
            return true;
        } catch (error) {
            return false;
        }
    }

    // Execute a query
    async query(text, params = []) {
        this.init(); // Ensure initialized
        const start = Date.now();
        try {
            const result = await this.pool.query(text, params);
            const duration = Date.now() - start;
            return result;
        } catch (error) {
            throw error;
        }
    }

    // Get a client from the pool for transactions
    async getClient() {
        this.init(); // Ensure initialized
        return await this.pool.connect();
    }

    // Conversation-related queries
    async getActiveConversations() {
        try {
            const result = await this.query(`
                SELECT 
                    id,
                    business_name,
                    lead_phone,
                    state,
                    current_step,
                    created_at,
                    last_activity,
                    priority,
                    metadata
                FROM conversations 
                WHERE state != 'ARCHIVED'
                ORDER BY last_activity DESC
            `);
            return result.rows;
        } catch (error) {
            throw error;
        }
    }

    async getConversationById(id) {
        try {
            const result = await this.query(`
                SELECT 
                    id,
                    business_name,
                    lead_phone,
                    state,
                    current_step,
                    created_at,
                    last_activity,
                    priority,
                    metadata
                FROM conversations 
                WHERE id = $1
            `, [id]);
            
            if (result.rows[0]) {
                const conversation = result.rows[0];
                // Merge metadata fields into the main object for easy access
                if (conversation.metadata && typeof conversation.metadata === 'object') {
                    // Handle naming conflict: address state vs conversation state
                    const metadata = { ...conversation.metadata };
                    if (metadata.state) {
                        metadata.address_state = metadata.state; // Rename address state
                        delete metadata.state; // Remove to avoid conflict with conversation.state
                    }
                    Object.assign(conversation, metadata);
                }
                return conversation;
            }
            return null;
        } catch (error) {
            throw error;
        }
    }

    async createConversation(data) {
        try {
            const { businessName, phone, priority = 0, requestedAmount, leadDetails } = data;
            
            // Set priority as integer (0 = normal, 1 = high, -1 = low)
            const priorityInt = priority === 'high' ? 1 : priority === 'low' ? -1 : 0;
            
            // Store all lead details in metadata
            const metadata = leadDetails || {};
            if (requestedAmount) {
                metadata.requested_amount = requestedAmount;
            }
            
            const result = await this.query(`
                INSERT INTO conversations (
                    business_name,
                    lead_phone,
                    state,
                    current_step,
                    priority,
                    metadata,
                    created_at,
                    last_activity
                ) VALUES ($1, $2, 'NEW', 'Initial contact received', $3, $4, NOW(), NOW())
                RETURNING *
            `, [businessName, phone, priorityInt, JSON.stringify(metadata)]);
            
            return result.rows[0];
        } catch (error) {
            throw error;
        }
    }

    async updateConversationState(id, newState, currentStep, reason) {
        try {
            const result = await this.query(`
                UPDATE conversations 
                SET 
                    state = $2,
                    current_step = $3,
                    last_activity = NOW()
                WHERE id = $1
                RETURNING *
            `, [id, newState, currentStep]);

            // Log the state change
            if (reason) {
                await this.query(`
                    INSERT INTO agent_actions (
                        conversation_id,
                        action_type,
                        action_data,
                        created_at
                    ) VALUES ($1, 'state_change', $2, NOW())
                `, [id, JSON.stringify({ 
                    from_state: null, 
                    to_state: newState, 
                    reason 
                })]);
            }

            return result.rows[0];
        } catch (error) {
            throw error;
        }
    }

    // Message-related queries
    async getConversationMessages(conversationId, limit = 50) {
        try {
            const result = await this.query(`
                SELECT 
                    id,
                    conversation_id,
                    direction,
                    content,
                    timestamp,
                    twilio_sid
                FROM messages 
                WHERE conversation_id = $1
                ORDER BY timestamp ASC
                LIMIT $2
            `, [conversationId, limit]);
            return result.rows;
        } catch (error) {
            throw error;
        }
    }

    async createMessage(conversationId, direction, content, twilioSid = null) {
        try {
            const result = await this.query(`
                INSERT INTO messages (
                    conversation_id,
                    direction,
                    content,
                    twilio_sid,
                    timestamp
                ) VALUES ($1, $2, $3, $4, NOW())
                RETURNING *
            `, [conversationId, direction, content, twilioSid]);

            // Update conversation last_activity
            await this.query(`
                UPDATE conversations 
                SET last_activity = NOW() 
                WHERE id = $1
            `, [conversationId]);

            return result.rows[0];
        } catch (error) {
            throw error;
        }
    }

    // Statistics queries
    async getConversationStats() {
        try {
            const result = await this.query(`
                SELECT 
                    COUNT(*) as total,
                    COUNT(CASE WHEN state IN ('NEW', 'INTERESTED', 'FCS_RUNNING', 'COLLECTING_INFO') THEN 1 END) as active,
                    COUNT(CASE WHEN state = 'FCS_RUNNING' THEN 1 END) as processing,
                    COUNT(CASE WHEN DATE(created_at) = CURRENT_DATE THEN 1 END) as today
                FROM conversations
                WHERE state != 'ARCHIVED'
            `);
            return result.rows[0];
        } catch (error) {
            throw error;
        }
    }

    // FCS-related queries
    async getFCSResults(conversationId) {
        try {
            const result = await this.query(`
                SELECT * FROM fcs_results 
                WHERE conversation_id = $1
                ORDER BY created_at DESC
                LIMIT 1
            `, [conversationId]);
            return result.rows[0] || null;
        } catch (error) {
            throw error;
        }
    }

    async saveFCSResults(conversationId, results) {
        try {
            const result = await this.query(`
                INSERT INTO fcs_results (
                    conversation_id,
                    revenue_data,
                    credit_score,
                    time_in_business,
                    raw_data,
                    created_at
                ) VALUES ($1, $2, $3, $4, $5, NOW())
                RETURNING *
            `, [
                conversationId,
                results.revenue_data,
                results.credit_score,
                results.time_in_business,
                JSON.stringify(results.raw_data || {})
            ]);
            return result.rows[0];
        } catch (error) {
            throw error;
        }
    }

    // Lender-related queries
    async getLenderMatches(conversationId) {
        try {
            const result = await this.query(`
                SELECT * FROM lender_matches 
                WHERE conversation_id = $1
                ORDER BY match_score DESC
            `, [conversationId]);
            return result.rows;
        } catch (error) {
            throw error;
        }
    }

    async saveLenderMatches(conversationId, matches) {
        try {
            // Clear existing matches
            await this.query(`
                DELETE FROM lender_matches 
                WHERE conversation_id = $1
            `, [conversationId]);

            // Insert new matches
            const results = [];
            for (const match of matches) {
                const result = await this.query(`
                    INSERT INTO lender_matches (
                        conversation_id,
                        lender_name,
                        tier,
                        position,
                        qualified,
                        blocking_reason,
                        max_amount,
                        factor_rate,
                        term_months,
                        is_preferred,
                        match_score,
                        requirements,
                        created_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
                    RETURNING *
                `, [
                    conversationId,
                    match.name || match.lender_name,
                    match.tier,
                    match.position,
                    match.qualified !== undefined ? match.qualified : true,
                    match.blocking_reason,
                    match.max_amount,
                    match.factor_rate,
                    match.term_months,
                    match.is_preferred || false,
                    match.match_score,
                    JSON.stringify(match.requirements || {})
                ]);
                results.push(result.rows[0]);
            }
            return results;
        } catch (error) {
            throw error;
        }
    }

    // Context-related queries
    async getConversationContext(conversationId) {
        try {
            const result = await this.query(`
                SELECT context_key, context_value, context_type
                FROM conversation_context 
                WHERE conversation_id = $1
            `, [conversationId]);
            
            const context = {};
            result.rows.forEach(row => {
                context[row.context_key] = row.context_value;
            });
            return context;
        } catch (error) {
            throw error;
        }
    }

    async setConversationContext(conversationId, key, value, type = 'string') {
        try {
            await this.query(`
                INSERT INTO conversation_context (
                    conversation_id, context_key, context_value, context_type, created_at
                ) VALUES ($1, $2, $3, $4, NOW())
                ON CONFLICT (conversation_id, context_key) 
                DO UPDATE SET 
                    context_value = EXCLUDED.context_value,
                    context_type = EXCLUDED.context_type,
                    updated_at = NOW()
            `, [conversationId, key, value, type]);
        } catch (error) {
            throw error;
        }
    }

    // Get conversation messages
    async getConversationMessages(conversationId) {
        try {
            // Try different column names that might exist
            let query = 'SELECT * FROM messages WHERE conversation_id = $1';
            
            // Try to order by timestamp or created_at or id, fallback to no ordering
            try {
                const testResult = await this.query('SELECT * FROM messages LIMIT 1');
                const columns = testResult.fields ? testResult.fields.map(f => f.name) : [];
                
                if (columns.includes('created_at')) {
                    query += ' ORDER BY created_at ASC';
                } else if (columns.includes('timestamp')) {
                    query += ' ORDER BY timestamp ASC';
                } else if (columns.includes('id')) {
                    query += ' ORDER BY id ASC';
                }
            } catch (err) {
                // Table might not exist or be empty, that's ok
                return [];
            }
            
            const result = await this.query(query, [conversationId]);
            return result.rows || [];
        } catch (error) {
            return [];
        }
    }
    
    // Get all context for conversation (stub implementation)
    async getAllContext(conversationId) {
        try {
            const result = await this.query(
                'SELECT * FROM conversations WHERE id = $1',
                [conversationId]
            );
            
            if (result.rows.length === 0) {
                return {};
            }
            
            const conversation = result.rows[0];
            
            // Return context from metadata and basic conversation data
            return {
                conversation: conversation,
                messages: await this.getConversationMessages(conversationId),
                metadata: conversation.metadata || {},
                fcs_results: await this.getFCSResults(conversationId) || [],
                lender_results: await this.getLenderMatches(conversationId) || []
            };
        } catch (error) {
            return {};
        }
    }

    // Initialize documents table (enhanced schema)
    async ensureDocumentsTable() {
        try {
            await this.query(`
                CREATE TABLE IF NOT EXISTS documents (
                    id UUID PRIMARY KEY,
                    conversation_id UUID REFERENCES conversations(id),
                    filename TEXT NOT NULL,
                    original_filename TEXT NOT NULL,
                    document_type TEXT DEFAULT 'Bank Statement',
                    file_size BIGINT DEFAULT 0,
                    file_path TEXT,
                    s3_key TEXT,
                    s3_url TEXT,
                    upload_date TIMESTAMPTZ,
                    processing_status TEXT DEFAULT 'completed',
                    ai_processed BOOLEAN DEFAULT FALSE,
                    ai_processed_at TIMESTAMPTZ,
                    raw_original_filename TEXT,
                    ai_analysis JSONB DEFAULT '{}',
                    created_at TIMESTAMPTZ DEFAULT NOW()
                )
            `);
        } catch (error) {
        }
    }

    // Document-related queries
    async saveDocument(conversationId, documentData) {
        try {
            
            const result = await this.query(`
                INSERT INTO documents (
                    id,
                    conversation_id,
                    filename,
                    original_filename,
                    file_size,
                    s3_key,
                    s3_url,
                    ai_analysis,
                    upload_date,
                    created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
                RETURNING *
            `, [
                documentData.id,
                conversationId,
                documentData.filename,
                documentData.originalFilename,
                documentData.fileSize,
                documentData.s3Key,
                documentData.s3Url,
                JSON.stringify(documentData.aiAnalysis || {}),
                documentData.uploadDate
            ]);
            return result.rows[0];
        } catch (error) {
            throw error;
        }
    }

    async getDocuments(conversationId) {
        try {
            const result = await this.query(`
                SELECT * FROM documents 
                WHERE conversation_id = $1
                ORDER BY created_at DESC
            `, [conversationId]);
            return result.rows.map(doc => ({
                ...doc,
                aiAnalysis: typeof doc.ai_analysis === 'string' ? JSON.parse(doc.ai_analysis) : doc.ai_analysis
            }));
        } catch (error) {
            return [];
        }
    }

    async deleteDocument(documentId) {
        try {
            const result = await this.query(`
                DELETE FROM documents 
                WHERE id = $1
                RETURNING *
            `, [documentId]);
            return result.rows[0];
        } catch (error) {
            throw error;
        }
    }

    async updateDocument(documentId, updateData) {
        try {
            const setClauses = [];
            const values = [];
            let paramIndex = 1;

            // Build dynamic SET clause
            if (updateData.original_filename !== undefined) {
                setClauses.push(`original_filename = $${paramIndex++}`);
                values.push(updateData.original_filename);
            }
            if (updateData.document_type !== undefined) {
                setClauses.push(`document_type = $${paramIndex++}`);
                values.push(updateData.document_type);
            }
            if (updateData.ai_analysis !== undefined) {
                setClauses.push(`ai_analysis = $${paramIndex++}`);
                values.push(JSON.stringify(updateData.ai_analysis));
            }
            
            // Always update the updated_at timestamp
            setClauses.push(`updated_at = NOW()`);
            
            if (setClauses.length === 1) { // Only updated_at
                throw new Error('No fields to update');
            }

            values.push(documentId); // WHERE clause parameter

            const query = `
                UPDATE documents 
                SET ${setClauses.join(', ')}
                WHERE id = $${paramIndex}
                RETURNING *
            `;

            const result = await this.query(query, values);
            return result.rows[0];
        } catch (error) {
            throw error;
        }
    }

    // Health check
    async healthCheck() {
        try {
            await this.query('SELECT 1');
            return { status: 'healthy', timestamp: new Date() };
        } catch (error) {
            return { status: 'unhealthy', error: error.message, timestamp: new Date() };
        }
    }

    // Lead Details operations
    async saveLeadDetails(conversationId, leadDetailsData) {
        try {
            
            const result = await this.query(`
                INSERT INTO lead_details (
                    conversation_id,
                    business_type,
                    annual_revenue,
                    business_start_date,
                    funding_amount,
                    factor_rate,
                    funding_date,
                    term_months,
                    campaign,
                    date_of_birth,
                    tax_id_encrypted,
                    ssn_encrypted,
                    created_by
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                RETURNING *
            `, [
                conversationId,
                leadDetailsData.business_type || null,
                leadDetailsData.annual_revenue || null,
                leadDetailsData.business_start_date || null,
                leadDetailsData.funding_amount || null,
                leadDetailsData.factor_rate || null,
                leadDetailsData.funding_date || null,
                leadDetailsData.term_months || null,
                leadDetailsData.campaign || null,
                leadDetailsData.date_of_birth || null,
                leadDetailsData.tax_id || null,
                leadDetailsData.ssn || null,
                'csv_import'
            ]);
            
            return result.rows[0];
        } catch (error) {
            throw error;
        }
    }

    async getLeadDetails(conversationId) {
        try {
            const result = await this.query(
                'SELECT * FROM lead_details WHERE conversation_id = $1',
                [conversationId]
            );
            return result.rows[0];
        } catch (error) {
            throw error;
        }
    }

    async updateLeadDetails(conversationId, updateData) {
        try {
            const setClauses = [];
            const values = [];
            let paramIndex = 1;
            
            // Build dynamic SET clause
            for (const [key, value] of Object.entries(updateData)) {
                setClauses.push(`${key} = $${paramIndex}`);
                values.push(value);
                paramIndex++;
            }
            
            if (setClauses.length === 0) {
                return;
            }
            
            // Add updated_at
            setClauses.push(`updated_at = NOW()`);
            
            const query = `
                UPDATE lead_details 
                SET ${setClauses.join(', ')}
                WHERE conversation_id = $${paramIndex}
                RETURNING *
            `;
            values.push(conversationId);
            
            const result = await this.query(query, values);
            return result.rows[0];
        } catch (error) {
            throw error;
        }
    }

    // Close the pool
    async close() {
        if (this.pool) {
            await this.pool.end();
        }
    }
}

// Export a factory function instead of initialized instance
module.exports = {
    getInstance() {
        if (!this._instance) {
            this._instance = new Database();
        }
        return this._instance;
    },
    // For backward compatibility, proxy common methods
    async testConnection() { return this.getInstance().testConnection(); },
    async query(text, params) { return this.getInstance().query(text, params); },
    async getActiveConversations() { return this.getInstance().getActiveConversations(); },
    async getConversationById(id) { return this.getInstance().getConversationById(id); },
    async createConversation(data) { return this.getInstance().createConversation(data); },
    async getConversationMessages(conversationId, limit) { return this.getInstance().getConversationMessages(conversationId, limit); },
    async getAllContext(conversationId) { return this.getInstance().getAllContext(conversationId); },
    async getFCSResults(conversationId) { return this.getInstance().getFCSResults(conversationId); },
    async getDocuments(conversationId) { return this.getInstance().getDocuments(conversationId); },
    async saveDocument(conversationId, documentData) { return this.getInstance().saveDocument(conversationId, documentData); },
    async updateDocument(documentId, updateData) { return this.getInstance().updateDocument(documentId, updateData); },
    async deleteDocument(documentId) { return this.getInstance().deleteDocument(documentId); },
    async saveLeadDetails(conversationId, leadDetailsData) { return this.getInstance().saveLeadDetails(conversationId, leadDetailsData); },
    async getLeadDetails(conversationId) { return this.getInstance().getLeadDetails(conversationId); },
    async updateLeadDetails(conversationId, updateData) { return this.getInstance().updateLeadDetails(conversationId, updateData); },
    async healthCheck() { return this.getInstance().healthCheck(); },
    async ensureDocumentsTable() { return this.getInstance().ensureDocumentsTable(); }
};