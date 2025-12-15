// migrate-owner-percent.js
const db = require('./backend/database/db');

async function runMigration() {
  console.log('🚀 Starting migration: Adding owner_ownership_percent column...');

  try {
    // 1. Check connection
    await db.testConnection();

    // 2. Run the ALTER TABLE command
    await db.query(`
      ALTER TABLE lead_details
      ADD COLUMN IF NOT EXISTS owner_ownership_percent DECIMAL(5,2);
    `);

    console.log('✅ Success: Column "owner_ownership_percent" added to "lead_details".');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
  } finally {
    // 3. Close the connection pool to exit the script
    await db.getInstance().close();
  }
}

runMigration();
