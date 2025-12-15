// migrate-owner-percent.js
// MAKE SURE THIS FILE IS IN THE SAME FOLDER AS db.js
const db = require('./db');

async function runMigration() {
  console.log('🚀 Starting migration: Adding owner_ownership_percent column...');

  try {
    // 1. Initialize connection
    await db.testConnection();

    // 2. Run the command safely (IF NOT EXISTS prevents errors if it runs twice)
    await db.query(`
      ALTER TABLE lead_details
      ADD COLUMN IF NOT EXISTS owner_ownership_percent DECIMAL(5,2);
    `);

    console.log('✅ Success: Column "owner_ownership_percent" added.');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
  } finally {
    // 3. Force exit so the script doesn't hang
    process.exit(0);
  }
}

runMigration();
