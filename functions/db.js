require('dotenv').config();
const { Pool } = require('pg');
const { drizzle } = require('drizzle-orm/node-postgres');
const schema = require('./shared/schema');

// Get database configuration
function getDbConfig() {
    const dbUrl = process.env.DATABASE_URL || '';

    if (dbUrl) {
        try {
            let cleanUrl = dbUrl.trim().replace(/^"|"$/g, '');
            if (cleanUrl.startsWith('postgres://')) {
                cleanUrl = 'postgresql://' + cleanUrl.slice(11);
            }

            if (cleanUrl.startsWith('postgresql://')) {
                const parsed = new URL(cleanUrl);
                return {
                    user: parsed.username,
                    password: parsed.password,
                    host: parsed.hostname,
                    database: parsed.pathname.replace(/^\/+/, ''),
                    port: parseInt(parsed.port, 10) || 5432,
                    ssl: { rejectUnauthorized: false },
                    connectionTimeoutMillis: 5000,
                };
            }
        } catch (error) {
            console.error('Error parsing DATABASE_URL:', error);
        }
    }

    // Default config
    return {
        user: 'root',
        password: 'lEx9Zk7EVyqjfxO3XWofcyaKEYUffwiq',
        host: 'dpg-d35r6gjipnbc739ndtt0-a.oregon-postgres.render.com',
        database: 'cloneacc_lt8x',
        port: 5432,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 5000,
    };
}

const pool = new Pool(getDbConfig());
const db = drizzle(pool, { schema });

module.exports = { pool, db };
