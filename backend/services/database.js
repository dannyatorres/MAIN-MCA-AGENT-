// services/database.js - HANDLES: Database connection
// This manages the connection to your PostgreSQL database

const { Pool } = require('pg');

let pool = null;
let initialized = false;

async function initialize() {
    if (initialized) return;

    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        client_encoding: 'UTF8'
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

        // 2. Fix 'messages' table (Adding Twilio ID AND Media URL for MMS)
        await pool.query(`
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS external_id VARCHAR(255);
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS twilio_sid VARCHAR(255);
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_url TEXT;
        `);

        // 3. Fix message_type constraint to allow 'mms'
        await pool.query(`
            ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_message_type_check;
            ALTER TABLE messages ADD CONSTRAINT messages_message_type_check
            CHECK (message_type IN ('sms', 'mms', 'email', 'system', 'whatsapp'));
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

        // 5. Create lender_qualifications table (For AI to reference results)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS lender_qualifications (
                id UUID PRIMARY KEY,
                conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
                qualification_data JSONB,
                criteria_used JSONB,
                qualified_lenders JSONB,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_lender_qual_conversation
            ON lender_qualifications(conversation_id);
        `);

        // Ensure lender_qualifications has all expected columns (self-heal older tables)
        await pool.query(`
            ALTER TABLE lender_qualifications
            ADD COLUMN IF NOT EXISTS qualification_data JSONB,
            ADD COLUMN IF NOT EXISTS criteria_used JSONB,
            ADD COLUMN IF NOT EXISTS qualified_lenders JSONB,
            ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
        `);

        // 6. Create job_queue (Required for FCS trigger route)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS job_queue (
                id SERIAL PRIMARY KEY,
                job_type VARCHAR(50) NOT NULL,
                conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
                input_data JSONB,
                status VARCHAR(50) DEFAULT 'queued',
                result_data JSONB,
                created_at TIMESTAMP DEFAULT NOW(),
                completed_at TIMESTAMP,
                error_message TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_job_queue_status ON job_queue(status);
            CREATE INDEX IF NOT EXISTS idx_job_queue_conv ON job_queue(conversation_id);
        `);

        // 7. Create fcs_analyses (For storing FCS analysis results)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS fcs_analyses (
                id SERIAL PRIMARY KEY,
                conversation_id UUID UNIQUE REFERENCES conversations(id) ON DELETE CASCADE,
                status VARCHAR(50) DEFAULT 'processing',
                extracted_business_name VARCHAR(255),
                statement_count INTEGER,
                fcs_report TEXT,
                average_deposits NUMERIC,
                average_revenue NUMERIC,
                total_negative_days INTEGER,
                average_negative_days NUMERIC,
                state VARCHAR(10),
                industry VARCHAR(100),
                position_count INTEGER,
                created_at TIMESTAMP DEFAULT NOW(),
                completed_at TIMESTAMP,
                error_message TEXT
            );
        `);

        // 8. Create fcs_results (Backwards compatibility for fcs.js routes)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS fcs_results (
                id SERIAL PRIMARY KEY,
                conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
                max_funding_amount NUMERIC,
                recommended_term_months NUMERIC,
                estimated_payment NUMERIC,
                factor_rate NUMERIC,
                risk_tier VARCHAR(10),
                approval_probability NUMERIC,
                analysis_notes TEXT,
                created_at TIMESTAMP DEFAULT NOW()
            );
        `);

        // 9. Create daily_reports (Daily Operations Agent output)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS daily_reports (
                id BIGSERIAL PRIMARY KEY,
                date DATE UNIQUE,
                report TEXT NOT NULL,
                stats JSONB,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
        `);

        // Ensure expected columns exist (safe for older tables)
        await pool.query(`ALTER TABLE daily_reports ADD COLUMN IF NOT EXISTS id BIGSERIAL;`);
        await pool.query(`ALTER TABLE daily_reports ADD COLUMN IF NOT EXISTS date DATE;`);
        await pool.query(`ALTER TABLE daily_reports ADD COLUMN IF NOT EXISTS report TEXT;`);
        await pool.query(`ALTER TABLE daily_reports ADD COLUMN IF NOT EXISTS stats JSONB;`);
        await pool.query(`ALTER TABLE daily_reports ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();`);
        await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_reports_date ON daily_reports(date);`);

        console.log('✅ Database schema verified and repaired (Job Queue & FCS tables added)');
    } catch (err) {
        console.warn('⚠️ Schema verification warning (non-fatal):', err.message);
    }

    initialized = true;
}

function getDatabase() {
    if (!pool) {
        pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false },
            client_encoding: 'UTF8'
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
