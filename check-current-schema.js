const { Pool } = require('pg');
require('dotenv').config();

async function checkCurrentSchema() {
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
        console.log('📋 Current documents table columns:');
        const result = await pool.query(`
            SELECT column_name, data_type, column_default
            FROM information_schema.columns
            WHERE table_name = 'documents'
            ORDER BY ordinal_position
        `);

        if (result.rows.length === 0) {
            console.log('⚠️  Documents table does not exist!');
        } else {
            result.rows.forEach(row => {
                console.log(`  - ${row.column_name} (${row.data_type}) ${row.column_default || ''}`);
            });
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await pool.end();
    }
}

checkCurrentSchema();
