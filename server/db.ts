import { Pool } from 'pg';
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

if (!dbUrl) {
  console.error('❌ Error: DATABASE_URL is not set in environment variables');
  throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
}

// Parse database URL
function parseDatabaseUrl(url: string) {
  try {
    // Clean up the URL if it has quotes or DATABASE_URL= prefix
    let cleanUrl = url.trim();
    if (cleanUrl.startsWith('"') && cleanUrl.endsWith('"')) {
      cleanUrl = cleanUrl.slice(1, -1);
    }
    if (cleanUrl.startsWith('DATABASE_URL=')) {
      cleanUrl = cleanUrl.replace('DATABASE_URL=', '');
    }
    
    // Handle postgres:// URLs
    if (cleanUrl.startsWith('postgres://')) {
      cleanUrl = cleanUrl.replace('postgres://', 'postgresql://');
    }
    
    const parsed = new URL(cleanUrl);
    
    // Extract database name from path (remove leading slash)
    const database = parsed.pathname.replace(/^\/+/, '');
    
    return {
      user: parsed.username,
      password: parsed.password,
      host: parsed.hostname,
      database: database,
      port: parseInt(parsed.port, 10) || 5432,
      ssl: {
        rejectUnauthorized: false,
      },
      // Add timeouts
      connectionTimeoutMillis: 5000,
      query_timeout: 10000,
    };
  } catch (error) {
    console.error('Error parsing DATABASE_URL:', error);
    throw new Error('Invalid DATABASE_URL format');
  }
}

// Get database configuration from environment variables
function getDbConfig() {
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
  
  // Otherwise, parse DATABASE_URL
  if (process.env.DATABASE_URL) {
    return parseDatabaseUrl(process.env.DATABASE_URL);
  }
  
  throw new Error('Either DATABASE_URL or PG* environment variables must be set');
}

// Create database connection
let pool: Pool;
try {
  const dbConfig = getDbConfig();
  
  console.log('Database connection config:', {
    ...dbConfig,
    password: '***',
    connectionString: '***HIDDEN***',
  });
  
  pool = new Pool(dbConfig);
  
  // Test the connection
  pool.query('SELECT NOW()')
    .then(() => console.log('✅ Successfully connected to PostgreSQL'))
    .catch(err => console.error('❌ Error connecting to PostgreSQL:', err));
  
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