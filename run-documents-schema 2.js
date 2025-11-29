const { Pool } = require('pg');
const fs = require('fs');
require('dotenv').config();

async function runDocumentsSchema() {
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
        // Read the documents schema file
        const schemaSQL = fs.readFileSync('./backend/database/documents-schema.sql', 'utf8');

        console.log('📄 Running documents-schema.sql...');

        // Execute the schema
        await pool.query(schemaSQL);

        console.log('✅ Documents schema applied successfully!');

        // Verify the columns exist now
        const result = await pool.query(`
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_name = 'documents'
            ORDER BY ordinal_position
        `);

        console.log('\n📋 Documents table columns:');
        result.rows.forEach(row => {
            console.log(`  - ${row.column_name} (${row.data_type})`);
        });

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await pool.end();
    }
}

runDocumentsSchema();
