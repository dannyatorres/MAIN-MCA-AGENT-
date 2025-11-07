const { Pool } = require('pg');
require('dotenv').config();

async function fixDocuments() {
    const pool = new Pool({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT || 5432,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        ssl: { rejectUnauthorized: false }
    });

    try {
        console.log('🔧 Enabling UUID extension...');

        // Enable UUID extension
        await pool.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

        console.log('✅ UUID extension enabled');

        // Check if id column has proper default
        console.log('🔍 Checking id column...');
        const result = await pool.query(`
            SELECT column_name, column_default, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'documents' AND column_name = 'id'
        `);

        console.log('Current id column:', result.rows[0]);

        // Set proper default if missing
        if (!result.rows[0]?.column_default?.includes('uuid_generate_v4')) {
            console.log('🔧 Setting UUID default for id column...');
            await pool.query(`
                ALTER TABLE documents
                ALTER COLUMN id SET DEFAULT uuid_generate_v4()
            `);
            console.log('✅ UUID default set');
        }

        // Verify
        const verifyResult = await pool.query(`
            SELECT column_name, column_default, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'documents' AND column_name = 'id'
        `);

        console.log('✅ Updated id column:', verifyResult.rows[0]);

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await pool.end();
    }
}

fixDocuments();
