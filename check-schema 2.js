const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: { rejectUnauthorized: false }
});

async function checkSchema() {
    try {
        // Check conversations table structure
        const convSchema = await pool.query(`
            SELECT column_name, data_type, character_maximum_length
            FROM information_schema.columns
            WHERE table_name = 'conversations'
            AND column_name IN ('id', 'display_id')
            ORDER BY ordinal_position;
        `);
        
        console.log('\n=== CONVERSATIONS TABLE ===');
        convSchema.rows.forEach(row => {
            console.log(`${row.column_name}: ${row.data_type}`);
        });
        
        // Check messages table structure
        const msgSchema = await pool.query(`
            SELECT column_name, data_type, character_maximum_length
            FROM information_schema.columns
            WHERE table_name = 'messages'
            AND column_name IN ('id', 'conversation_id')
            ORDER BY ordinal_position;
        `);
        
        console.log('\n=== MESSAGES TABLE ===');
        msgSchema.rows.forEach(row => {
            console.log(`${row.column_name}: ${row.data_type}`);
        });
        
        // Check foreign key constraints
        const fkConstraints = await pool.query(`
            SELECT
                tc.constraint_name,
                tc.table_name,
                kcu.column_name,
                ccu.table_name AS foreign_table_name,
                ccu.column_name AS foreign_column_name
            FROM information_schema.table_constraints AS tc
            JOIN information_schema.key_column_usage AS kcu
                ON tc.constraint_name = kcu.constraint_name
            JOIN information_schema.constraint_column_usage AS ccu
                ON ccu.constraint_name = tc.constraint_name
            WHERE tc.constraint_type = 'FOREIGN KEY'
                AND tc.table_name = 'messages'
                AND kcu.column_name = 'conversation_id';
        `);
        
        console.log('\n=== FOREIGN KEY CONSTRAINTS ===');
        fkConstraints.rows.forEach(row => {
            console.log(`${row.table_name}.${row.column_name} -> ${row.foreign_table_name}.${row.foreign_column_name}`);
        });
        
        await pool.end();
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

checkSchema();
