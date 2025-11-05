#!/usr/bin/env node

const { Pool } = require('pg');
require('dotenv').config();

console.log('🔧 Adding updated_at column to fcs_results table...');

async function addUpdatedAtColumn() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    try {
        // Check if updated_at column already exists
        const checkColumn = await pool.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'fcs_results' AND column_name = 'updated_at'
        `);

        if (checkColumn.rows.length > 0) {
            console.log('✅ updated_at column already exists in fcs_results table');
            return;
        }

        // Add the updated_at column
        await pool.query(`
            ALTER TABLE fcs_results
            ADD COLUMN updated_at TIMESTAMP DEFAULT NOW()
        `);

        console.log('✅ updated_at column added successfully');

        // Update existing rows to have the updated_at timestamp
        await pool.query(`
            UPDATE fcs_results
            SET updated_at = created_at
            WHERE updated_at IS NULL
        `);

        console.log('✅ Existing rows updated with updated_at timestamps');

    } catch (error) {
        console.error('❌ Error adding updated_at column:', error.message);
        throw error;
    } finally {
        await pool.end();
    }
}

addUpdatedAtColumn()
    .then(() => {
        console.log('🎉 Migration completed successfully!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('💥 Migration failed:', error);
        process.exit(1);
    });