#!/usr/bin/env node

const { Pool } = require('pg');
require('dotenv').config();

console.log('🔧 Adding status column to fcs_results table...');

async function addStatusColumn() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    try {
        // Check if status column already exists
        const checkColumn = await pool.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'fcs_results' AND column_name = 'status'
        `);

        if (checkColumn.rows.length > 0) {
            console.log('✅ Status column already exists in fcs_results table');
            return;
        }

        // Add the status column
        await pool.query(`
            ALTER TABLE fcs_results
            ADD COLUMN status VARCHAR(50) DEFAULT 'pending'
        `);

        console.log('✅ Status column added successfully');

        // Add index for better performance
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_fcs_results_status
            ON fcs_results(status)
        `);

        console.log('✅ Index on status column created');

        // Add check constraint for valid statuses
        await pool.query(`
            ALTER TABLE fcs_results
            ADD CONSTRAINT check_fcs_status
            CHECK (status IN ('pending', 'processing', 'completed', 'failed'))
        `);

        console.log('✅ Check constraint added for valid statuses');

    } catch (error) {
        console.error('❌ Error adding status column:', error.message);
        throw error;
    } finally {
        await pool.end();
    }
}

addStatusColumn()
    .then(() => {
        console.log('🎉 Migration completed successfully!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('💥 Migration failed:', error);
        process.exit(1);
    });