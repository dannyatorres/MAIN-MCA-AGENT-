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

    // 🛠️ PERMANENT FIX: Ensure Schema is Correct on Startup
    try {
        console.log('🔧 Verifying database schema...');

        // 1. Fix 'csv_imports' table (Adding missing columns)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS csv_imports (
                id UUID PRIMARY KEY,
                filename VARCHAR(255),
                original_filename VARCHAR(255),
                column_mapping JSONB DEFAULT '{}'::jsonb,
                created_at TIMESTAMP DEFAULT NOW()
            );
            ALTER TABLE csv_imports ADD COLUMN IF NOT EXISTS original_filename VARCHAR(255);
            ALTER TABLE csv_imports ADD COLUMN IF NOT EXISTS column_mapping JSONB DEFAULT '{}'::jsonb;
            ALTER TABLE csv_imports ADD COLUMN IF NOT EXISTS total_rows INTEGER DEFAULT 0;
            ALTER TABLE csv_imports ADD COLUMN IF NOT EXISTS imported_rows INTEGER DEFAULT 0;
            ALTER TABLE csv_imports ADD COLUMN IF NOT EXISTS error_rows INTEGER DEFAULT 0;
            ALTER TABLE csv_imports ADD COLUMN IF NOT EXISTS errors JSONB DEFAULT '[]'::jsonb;
            ALTER TABLE csv_imports ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'processing';
            ALTER TABLE csv_imports ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;
        `);

        // 2. Fix 'messages' table (Adding Twilio ID)
        await pool.query(`
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS external_id VARCHAR(255);
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS twilio_sid VARCHAR(255);
        `);

        // 3. Fix 'documents' table (Ensure it exists)
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

        // 4. Create Performance Indices
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

        console.log('✅ Database schema verified and repaired');
    } catch (err) {
        console.warn('⚠️ Schema verification warning (non-fatal):', err.message);
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
