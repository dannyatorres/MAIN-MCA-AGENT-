// services/database.js - HANDLES: Database connection
// This manages the connection to your PostgreSQL database

const { Pool } = require('pg');

let pool = null;
let initialized = false;

async function initialize() {
    if (initialized) return;

    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    pool.on('error', (err) => {
        console.error('❌ Unexpected database error:', err);
    });

    console.log('✅ Database connection pool created');

    // AUTO-FIX: Create documents table if missing
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS documents (
                id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
                conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
                filename VARCHAR(255) NOT NULL,
                original_filename VARCHAR(255) NOT NULL,
                file_size BIGINT NOT NULL,
                document_type VARCHAR(50) DEFAULT 'Other',
                notes TEXT,
                s3_bucket VARCHAR(100),
                s3_key VARCHAR(500) NOT NULL,
                s3_url VARCHAR(1000),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_documents_conversation_id ON documents(conversation_id);
        `);
        console.log('✅ Documents table verified');
    } catch (err) {
        console.warn('⚠️ Could not verify documents table:', err.message);
    }

    // 🚀 PERFORMANCE FIX: Create indices for high-speed dashboard loading
    try {
        await pool.query(`
            -- Optimizes the "Pending Leads" and Dashboard sorting
            CREATE INDEX IF NOT EXISTS idx_conversations_priority_activity
            ON conversations(priority DESC, last_activity DESC);

            -- Optimizes filtering by State (New, Qualified, etc)
            CREATE INDEX IF NOT EXISTS idx_conversations_state
            ON conversations(state);

            -- Optimizes general list views
            CREATE INDEX IF NOT EXISTS idx_conversations_created_at
            ON conversations(created_at DESC);

            -- Optimizes message lookups
            CREATE INDEX IF NOT EXISTS idx_messages_conversation_id
            ON messages(conversation_id);
        `);
        console.log('✅ Database performance indices verified');
    } catch (err) {
        console.warn('⚠️ Could not verify indices:', err.message);
    }

    initialized = true;
}

function getDatabase() {
    if (!pool) {
        pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false }
        });

        pool.on('error', (err) => {
            console.error('❌ Unexpected database error:', err);
        });

        console.log('✅ Database connection pool created');
    }

    return pool;  // Return the pool directly, NOT a promise
}

// Call initialize on module load
initialize().catch(err => console.error('Failed to initialize database:', err));

module.exports = {
    getDatabase,
    initialize
};
