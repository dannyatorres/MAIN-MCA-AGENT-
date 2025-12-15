// backend/database/migrate-owner-full.js
const db = require('./db');

async function runMigration() {
  console.log('🚀 Starting migration: Adding FULL Owner Address block...');

  try {
    await db.testConnection();

    // We add all 4 common address fields at once to prevent future crashes
    await db.query(`
      ALTER TABLE lead_details
      ADD COLUMN IF NOT EXISTS owner_home_address TEXT,
      ADD COLUMN IF NOT EXISTS owner_city VARCHAR(100),
      ADD COLUMN IF NOT EXISTS owner_state VARCHAR(50),
      ADD COLUMN IF NOT EXISTS owner_zip VARCHAR(20);
    `);

    console.log('✅ Success: Added address, city, state, and zip columns.');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
  } finally {
    process.exit(0);
  }
}

runMigration();
