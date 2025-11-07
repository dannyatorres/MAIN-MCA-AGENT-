const { Pool } = require('pg');
require('dotenv').config();

async function migrateDocumentsSchema() {
    console.log('🔌 Connecting to database...');

    const pool = new Pool({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT || 5432,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        ssl: {
            rejectUnauthorized: false
        }
    });

    try {
        console.log('📄 Starting schema migration...\n');

        // Enable UUID extension
        await pool.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
        console.log('✅ UUID extension enabled');

        // Add missing columns to documents table
        console.log('\n📋 Adding missing columns to documents table...');

        const alterTableCommands = [
            `ALTER TABLE documents ADD COLUMN IF NOT EXISTS document_type VARCHAR(50) DEFAULT 'Other'`,
            `ALTER TABLE documents ADD COLUMN IF NOT EXISTS document_subtype VARCHAR(100)`,
            `ALTER TABLE documents ADD COLUMN IF NOT EXISTS s3_bucket VARCHAR(100)`,
            `ALTER TABLE documents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()`,
            `ALTER TABLE documents ADD COLUMN IF NOT EXISTS processed_at TIMESTAMP WITH TIME ZONE`,
            `ALTER TABLE documents ADD COLUMN IF NOT EXISTS uploaded_by VARCHAR(100)`,
            `ALTER TABLE documents ADD COLUMN IF NOT EXISTS tags TEXT[]`,
            `ALTER TABLE documents ADD COLUMN IF NOT EXISTS notes TEXT`
        ];

        for (const command of alterTableCommands) {
            try {
                await pool.query(command);
                const columnName = command.match(/ADD COLUMN IF NOT EXISTS (\w+)/)[1];
                console.log(`  ✅ Added column: ${columnName}`);
            } catch (err) {
                if (!err.message.includes('already exists')) {
                    console.log(`  ⚠️  Warning: ${err.message}`);
                }
            }
        }

        // Drop existing constraints if they exist and recreate them
        console.log('\n🔧 Setting up constraints...');

        await pool.query(`
            DO $$
            BEGIN
                ALTER TABLE documents DROP CONSTRAINT IF EXISTS valid_document_type;
                ALTER TABLE documents ADD CONSTRAINT valid_document_type CHECK (document_type IN (
                    'Bank Statement', 'Tax Return', 'Application', 'FCS Sheet',
                    'Business License', 'Financial Statement', 'Legal Document', 'Other'
                ));
            EXCEPTION
                WHEN OTHERS THEN NULL;
            END $$;
        `);
        console.log('  ✅ Document type constraint added');

        await pool.query(`
            DO $$
            BEGIN
                ALTER TABLE documents DROP CONSTRAINT IF EXISTS valid_processing_status;
                ALTER TABLE documents ADD CONSTRAINT valid_processing_status CHECK (processing_status IN (
                    'uploaded', 'processing', 'processed', 'failed', 'archived'
                ));
            EXCEPTION
                WHEN OTHERS THEN NULL;
            END $$;
        `);
        console.log('  ✅ Processing status constraint added');

        // Create document_analysis table
        console.log('\n📊 Creating document_analysis table...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS document_analysis (
                id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
                document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
                conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,

                analysis_type VARCHAR(50) NOT NULL DEFAULT 'bank_statement',
                llm_provider VARCHAR(50) NOT NULL,
                model_used VARCHAR(100) NOT NULL,

                average_daily_balance DECIMAL(15,2),
                monthly_deposits DECIMAL(15,2),
                number_of_deposits INTEGER,
                nsf_count INTEGER DEFAULT 0,
                negative_days INTEGER DEFAULT 0,

                total_income DECIMAL(15,2),
                total_expenses DECIMAL(15,2),
                net_cash_flow DECIMAL(15,2),

                analysis_start_date DATE,
                analysis_end_date DATE,
                analysis_period_months INTEGER,

                raw_llm_response JSONB,
                extracted_data JSONB,
                confidence_score DECIMAL(3,2),

                summary TEXT,
                insights TEXT[],
                red_flags TEXT[],
                recommendations TEXT[],

                processing_time_ms INTEGER,
                tokens_used INTEGER,
                cost_usd DECIMAL(10,4),

                analysis_status VARCHAR(50) DEFAULT 'completed',
                reviewed_by VARCHAR(100),
                reviewed_at TIMESTAMP WITH TIME ZONE,
                review_notes TEXT,

                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

                CONSTRAINT valid_analysis_type CHECK (analysis_type IN (
                    'bank_statement', 'tax_return', 'financial_statement', 'general'
                )),
                CONSTRAINT valid_analysis_status CHECK (analysis_status IN (
                    'processing', 'completed', 'failed', 'reviewed', 'approved'
                )),
                CONSTRAINT valid_confidence CHECK (confidence_score >= 0.00 AND confidence_score <= 1.00)
            )
        `);
        console.log('  ✅ document_analysis table created');

        // Create document_processing_queue table
        console.log('\n⚙️  Creating document_processing_queue table...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS document_processing_queue (
                id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
                document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
                conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,

                processing_type VARCHAR(50) NOT NULL,
                priority INTEGER DEFAULT 5,

                status VARCHAR(50) DEFAULT 'queued',
                attempts INTEGER DEFAULT 0,
                max_attempts INTEGER DEFAULT 3,

                processor_instance VARCHAR(100),
                started_at TIMESTAMP WITH TIME ZONE,
                completed_at TIMESTAMP WITH TIME ZONE,
                error_message TEXT,

                processing_config JSONB,
                context_data JSONB,

                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

                CONSTRAINT valid_processing_status CHECK (status IN (
                    'queued', 'processing', 'completed', 'failed', 'retrying'
                ))
            )
        `);
        console.log('  ✅ document_processing_queue table created');

        // Create indexes
        console.log('\n🔍 Creating indexes...');
        const indexes = [
            `CREATE INDEX IF NOT EXISTS idx_documents_conversation_id ON documents(conversation_id)`,
            `CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(document_type)`,
            `CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(processing_status)`,
            `CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at DESC)`,
            `CREATE INDEX IF NOT EXISTS idx_documents_s3_key ON documents(s3_key)`,
            `CREATE INDEX IF NOT EXISTS idx_document_analysis_document_id ON document_analysis(document_id)`,
            `CREATE INDEX IF NOT EXISTS idx_document_analysis_conversation_id ON document_analysis(conversation_id)`,
            `CREATE INDEX IF NOT EXISTS idx_document_analysis_type ON document_analysis(analysis_type)`,
            `CREATE INDEX IF NOT EXISTS idx_document_analysis_status ON document_analysis(analysis_status)`,
            `CREATE INDEX IF NOT EXISTS idx_document_analysis_created_at ON document_analysis(created_at DESC)`,
            `CREATE INDEX IF NOT EXISTS idx_processing_queue_status ON document_processing_queue(status)`,
            `CREATE INDEX IF NOT EXISTS idx_processing_queue_priority ON document_processing_queue(priority DESC)`,
            `CREATE INDEX IF NOT EXISTS idx_processing_queue_created_at ON document_processing_queue(created_at)`
        ];

        for (const indexCommand of indexes) {
            await pool.query(indexCommand);
        }
        console.log('  ✅ All indexes created');

        // Create update trigger function
        console.log('\n🔔 Creating triggers...');
        await pool.query(`
            CREATE OR REPLACE FUNCTION update_updated_at_column()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.updated_at = NOW();
                RETURN NEW;
            END;
            $$ language 'plpgsql'
        `);

        // Create triggers
        await pool.query(`
            DROP TRIGGER IF EXISTS update_documents_updated_at ON documents;
            CREATE TRIGGER update_documents_updated_at
                BEFORE UPDATE ON documents
                FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
        `);

        await pool.query(`
            DROP TRIGGER IF EXISTS update_document_analysis_updated_at ON document_analysis;
            CREATE TRIGGER update_document_analysis_updated_at
                BEFORE UPDATE ON document_analysis
                FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
        `);

        await pool.query(`
            DROP TRIGGER IF EXISTS update_processing_queue_updated_at ON document_processing_queue;
            CREATE TRIGGER update_processing_queue_updated_at
                BEFORE UPDATE ON document_processing_queue
                FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
        `);
        console.log('  ✅ Triggers created');

        // Create lookup_values table if it doesn't exist and insert document types
        console.log('\n📝 Setting up lookup values...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS lookup_values (
                id SERIAL PRIMARY KEY,
                category VARCHAR(50) NOT NULL,
                name VARCHAR(100) NOT NULL,
                value VARCHAR(100) NOT NULL,
                description TEXT,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                UNIQUE(category, name)
            )
        `);

        const lookupValues = [
            ['document_type', 'Bank Statement', 'Bank Statement', 'Monthly or quarterly bank statements'],
            ['document_type', 'Tax Return', 'Tax Return', 'Business tax returns'],
            ['document_type', 'Application', 'Application', 'MCA application forms'],
            ['document_type', 'FCS Sheet', 'FCS Sheet', 'Financial condition sheets'],
            ['document_type', 'Business License', 'Business License', 'Business licenses and permits'],
            ['document_type', 'Financial Statement', 'Financial Statement', 'P&L, Balance Sheet, Cash Flow'],
            ['document_type', 'Legal Document', 'Legal Document', 'Contracts, agreements, legal docs'],
            ['document_type', 'Other', 'Other', 'Other supporting documents']
        ];

        for (const [category, name, value, description] of lookupValues) {
            await pool.query(`
                INSERT INTO lookup_values (category, name, value, description, is_active)
                VALUES ($1, $2, $3, $4, true)
                ON CONFLICT (category, name) DO NOTHING
            `, [category, name, value, description]);
        }
        console.log('  ✅ Lookup values inserted');

        // Verify final schema
        console.log('\n📋 Final documents table schema:');
        const result = await pool.query(`
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_name = 'documents'
            ORDER BY ordinal_position
        `);

        result.rows.forEach(row => {
            console.log(`  - ${row.column_name} (${row.data_type})`);
        });

        console.log('\n✅ Migration completed successfully! 🎉');

    } catch (error) {
        console.error('\n❌ Migration error:', error.message);
        console.error('Stack:', error.stack);
    } finally {
        await pool.end();
    }
}

migrateDocumentsSchema();
