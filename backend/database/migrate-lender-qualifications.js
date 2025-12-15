// migrate-lender-qualifications.js
// Adds missing columns to lender_qualifications so inserts from the API won't fail
const db = require('./db');

async function runMigration() {
  console.log('🚀 Starting migration: lender_qualifications column patch...');

  try {
    await db.testConnection();

    await db.query(`
      ALTER TABLE lender_qualifications
      ADD COLUMN IF NOT EXISTS qualification_data JSONB,
      ADD COLUMN IF NOT EXISTS criteria_used JSONB,
      ADD COLUMN IF NOT EXISTS qualified_lenders JSONB,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
    `);

    console.log('✅ Success: lender_qualifications columns verified/added.');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
  } finally {
    process.exit(0);
  }
}

runMigration();
