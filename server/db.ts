import { Pool, PoolConfig } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";
import 'dotenv/config';

// Log environment variables for debugging
console.log('Environment:');
console.log('- NODE_ENV:', process.env.NODE_ENV || 'development');

// Log database configuration
const dbUrl = process.env.DATABASE_URL || '';
console.log('- DATABASE_URL:', dbUrl ? '***HIDDEN***' : 'Not set');
console.log('- PGHOST:', process.env.PGHOST || 'Not set');
console.log('- PGDATABASE:', process.env.PGDATABASE || 'Not set');
console.log('- PGUSER:', process.env.PGUSER || 'Not set');

// Default configuration for Render.com PostgreSQL
const DEFAULT_CONFIG: PoolConfig = {
  user: 'root',
  password: 'lEx9Zk7EVyqjfxO3XWofcyaKEYUffwiq',
  host: 'dpg-d35r6gjipnbc739ndtt0-a.oregon-postgres.render.com',
  database: 'cloneacc_lt8x',
  port: 5432,
  ssl: {
    rejectUnauthorized: false,
  },
  connectionTimeoutMillis: 5000,
  query_timeout: 10000,
};

// Parse database URL
function parseDatabaseUrl(url: string): PoolConfig {
  try {
    // Clean up the URL
    let cleanUrl = url.trim()
      .replace(/^"|"$/g, '') // Remove surrounding quotes
      .replace(/^DATABASE_URL=/, ''); // Remove DATABASE_URL= prefix if present

    // Convert postgres:// to postgresql://
    if (cleanUrl.startsWith('postgres://')) {
      cleanUrl = 'postgresql://' + cleanUrl.slice(11);
    }

    // If it's a connection string, parse it
    if (cleanUrl.startsWith('postgresql://')) {
      const parsed = new URL(cleanUrl);
      return {
        user: parsed.username || DEFAULT_CONFIG.user,
        password: parsed.password || DEFAULT_CONFIG.password,
        host: parsed.hostname || DEFAULT_CONFIG.host,
        database: parsed.pathname.replace(/^\/+/, '') || DEFAULT_CONFIG.database,
        port: parseInt(parsed.port, 10) || DEFAULT_CONFIG.port,
        ssl: {
          rejectUnauthorized: false,
        },
        connectionTimeoutMillis: 5000,
        query_timeout: 10000,
      };
    }

    // If we get here, it's not a standard connection string
    console.warn('Non-standard DATABASE_URL format, using default config');
    return { ...DEFAULT_CONFIG };
  } catch (error) {
    console.error('Error parsing DATABASE_URL, using default config:', error);
    return { ...DEFAULT_CONFIG };
  }
}

// Get database configuration from environment variables
function getDbConfig(): PoolConfig {
  // If individual PG* vars are set, use them
  if (process.env.PGHOST && process.env.PGDATABASE && process.env.PGUSER && process.env.PGPASSWORD) {
    return {
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      host: process.env.PGHOST,
      database: process.env.PGDATABASE,
      port: parseInt(process.env.PGPORT || '5432', 10),
      ssl: {
        rejectUnauthorized: false,
      },
      connectionTimeoutMillis: 5000,
      query_timeout: 10000,
    };
  }
  
  // Otherwise, parse DATABASE_URL or use defaults
  if (process.env.DATABASE_URL) {
    return parseDatabaseUrl(process.env.DATABASE_URL);
  }
  
  console.warn('Using default database configuration');
  return { ...DEFAULT_CONFIG };
}

// Create database connection
let pool: Pool;
try {
  const dbConfig = getDbConfig();
  
  // Log the config (without sensitive data)
  console.log('Database connection config:', {
    ...dbConfig,
    password: dbConfig.password ? '***' : 'not set',
    connectionString: '***HIDDEN***',
  });
  
  // Create the pool
  pool = new Pool(dbConfig);
  
  // Test the connection
  pool.query('SELECT NOW()')
    .then(() => console.log('✅ Successfully connected to PostgreSQL'))
    .catch(err => {
      console.error('❌ Error connecting to PostgreSQL:', err);
      console.error('Connection details:', {
        host: dbConfig.host,
        port: dbConfig.port,
        database: dbConfig.database,
        user: dbConfig.user,
      });
    });
  
  // Handle connection errors
  pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
  });
  
} catch (error) {
  console.error('Failed to initialize database connection:', error);
  process.exit(1);
}

const isProduction = process.env.NODE_ENV === 'production';
console.log(`Running in ${isProduction ? 'production' : 'development'} mode`);

export { pool };
export const db = drizzle(pool, { 
  schema,
  logger: !isProduction // Enable query logging in development
});