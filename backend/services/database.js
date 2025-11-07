// services/database.js - HANDLES: Database connection
// This manages the connection to your PostgreSQL database

const { Pool } = require('pg');

let pool = null;
let schemaFixed = false;

async function getInstance() {
    if (!pool) {
        pool = new Pool({
            host: process.env.DB_HOST || 'localhost',
            port: process.env.DB_PORT || 5432,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000,
            ssl: process.env.DB_SSL === 'true' ? {
                rejectUnauthorized: false
            } : false
        });

        pool.on('error', (err) => {
            console.error('❌ Unexpected database error:', err);
        });

        console.log('✅ Database connection pool created');

        // AUTO-FIX: Ensure S3-only schema (add missing columns, remove file_path)
        if (!schemaFixed) {
            try {
                console.log('🔧 Auto-fixing documents table schema...');

                // Add S3-required columns if missing
                await pool.query(`
                    ALTER TABLE documents
                      ADD COLUMN IF NOT EXISTS mime_type VARCHAR(100),
                      ADD COLUMN IF NOT EXISTS file_extension VARCHAR(10),
                      ADD COLUMN IF NOT EXISTS processing_status VARCHAR(50) DEFAULT 'uploaded'
                `);

                // Remove old file_path column if it exists
                await pool.query(`
                    ALTER TABLE documents
                      DROP COLUMN IF EXISTS file_path
                `);

                console.log('✅ Documents table schema verified/fixed for S3');
                schemaFixed = true;
            } catch (err) {
                console.warn('⚠️ Could not auto-fix documents table:', err.message);
            }
        }
    }

    return pool;
}

function getDatabase() {
    // Return pool directly for synchronous calls
    // Schema fix runs async on first connection
    if (!pool) {
        getInstance(); // Trigger async initialization
    }
    return pool;
}

module.exports = {
    getInstance,
    getDatabase
};
