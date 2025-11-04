// services/database.js - HANDLES: Database connection
// This manages the connection to your PostgreSQL database

const { Pool } = require('pg');

let pool = null;

function getInstance() {
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
    }

    return pool;
}

function getDatabase() {
    return getInstance();
}

module.exports = {
    getInstance,
    getDatabase
};
