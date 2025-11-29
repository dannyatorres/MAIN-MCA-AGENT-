const { Pool } = require('pg');
require('dotenv').config();

async function createFcsTable() {
    const pool = new Pool({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT || 5432,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        ssl: { rejectUnauthorized: false }
    });

    try {
        console.log('🔧 Creating fcs_analyses table...\n');

        await pool.query(`
            CREATE TABLE IF NOT EXISTS fcs_analyses (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,

                -- Metadata extracted from analysis
                extracted_business_name TEXT,
                statement_count INTEGER,

                -- The complete formatted FCS report
                fcs_report TEXT,

                -- Parsed metrics from summary (for filtering/sorting in future)
                average_deposits DECIMAL,
                average_revenue DECIMAL,
                total_negative_days INTEGER,
                average_negative_days DECIMAL,
                state VARCHAR(2),
                industry TEXT,
                position_count INTEGER,

                -- Status tracking
                status TEXT DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
                error_message TEXT,

                -- Timestamps
                created_at TIMESTAMP DEFAULT NOW(),
                completed_at TIMESTAMP,

                -- Ensure only one active analysis per conversation
                UNIQUE(conversation_id)
            );
        `);

        console.log('✅ fcs_analyses table created successfully');

        // Create index for faster lookups
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_fcs_conversation_id
            ON fcs_analyses(conversation_id);
        `);

        console.log('✅ Index created on conversation_id');

        // Check the schema
        const schemaCheck = await pool.query(`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_name = 'fcs_analyses'
            ORDER BY ordinal_position;
        `);

        console.log('\n📋 Table schema:');
        schemaCheck.rows.forEach(col => {
            console.log(`  - ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'}`);
        });

        console.log('\n✅ FCS table setup complete!');

    } catch (error) {
        console.error('❌ Error:', error.message);
        throw error;
    } finally {
        await pool.end();
    }
}

createFcsTable();
