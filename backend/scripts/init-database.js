const fs = require('fs');
const path = require('path');
const dbModule = require('../database/db');

async function initDatabase() {
    console.log('🔍 Initializing MCA Command Center Database...');

    try {
        const db = dbModule.getInstance();

        // Test connection first
        console.log('📡 Testing database connection...');
        const connected = await db.testConnection();
        if (!connected) {
            throw new Error('Database connection failed');
        }
        console.log('✅ Database connection successful');

        // Read and execute schema files
        const schemaFiles = [
            'schema.sql',
            'extended-schema.sql',
            'documents-schema.sql',
            'lenders-schema.sql'
        ];

        for (const file of schemaFiles) {
            const filePath = path.join(__dirname, '../database', file);
            if (fs.existsSync(filePath)) {
                console.log(`📄 Executing ${file}...`);
                const sql = fs.readFileSync(filePath, 'utf8');

                // Split by semicolon and execute each statement
                const statements = sql.split(';').filter(stmt => stmt.trim().length > 0);

                for (const statement of statements) {
                    try {
                        await db.query(statement);
                    } catch (error) {
                        // Ignore "already exists" errors
                        if (!error.message.includes('already exists')) {
                            console.log(`⚠️ Warning in ${file}:`, error.message);
                        }
                    }
                }
                console.log(`✅ ${file} executed successfully`);
            } else {
                console.log(`⚠️ ${file} not found, skipping...`);
            }
        }

        // Test a simple query
        console.log('🧪 Testing database tables...');
        const result = await db.query('SELECT COUNT(*) as count FROM conversations');
        console.log(`✅ Database initialized successfully. Conversations table has ${result.rows[0].count} records.`);

        console.log('🎉 Database initialization complete!');
        process.exit(0);

    } catch (error) {
        console.error('❌ Database initialization failed:', error.message);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    initDatabase();
}

module.exports = { initDatabase };