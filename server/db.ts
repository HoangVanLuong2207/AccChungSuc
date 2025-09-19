import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";
import 'dotenv/config';

// Kiểm tra và log thông tin kết nối
console.log('Database connection check:');
console.log('- NODE_ENV:', process.env.NODE_ENV || 'development');
console.log('- DATABASE_URL:', process.env.DATABASE_URL ? '***[HIDDEN]***' : 'Not set');

if (!process.env.DATABASE_URL) {
  console.error('❌ Error: DATABASE_URL is not set in environment variables');
  console.error('Please check your .env file or environment configuration');
  throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
}

// Hàm xử lý URL kết nối
const getConnectionString = (): string => {
  let dbUrl = process.env.DATABASE_URL || '';
  
  // Xử lý trường hợp DATABASE_URL bị bọc trong dấu nháy
  if (dbUrl.startsWith('"') && dbUrl.endsWith('"')) {
    dbUrl = dbUrl.slice(1, -1);
  }
  
  // Xử lý trường hợp có dạng DATABASE_URL=value...
  if (dbUrl.startsWith('DATABASE_URL=')) {
    dbUrl = dbUrl.replace('DATABASE_URL=', '');
  }
  
  // Thêm sslmode=require nếu chưa có
  if (!dbUrl.includes('sslmode=')) {
    dbUrl += (dbUrl.includes('?') ? '&' : '?') + 'sslmode=require';
  }
  
  console.log('Final connection string:', dbUrl.replace(/:[^:]*?@/, ':***@'));
  return dbUrl;
};

const connectionString = getConnectionString();

const isProduction = process.env.NODE_ENV === 'production';
console.log(`Running in ${isProduction ? 'production' : 'development'} mode`);

console.log('Database connection string:', 
  isProduction 
    ? `${connectionString.split('@')[0]}@[HIDDEN]` 
    : connectionString
);

const poolConfig = {
  connectionString,
  ssl: isProduction ? {
    rejectUnauthorized: false,
    // Add more SSL options if needed
  } : false,
  // Add connection timeout
  connectionTimeoutMillis: 5000,
  // Add query timeout
  query_timeout: 10000,
};

// Create a new pool
const pool = new Pool(poolConfig);

// Test the connection
pool.query('SELECT NOW()')
  .then(() => console.log('Successfully connected to PostgreSQL'))
  .catch(err => console.error('Error connecting to PostgreSQL:', err));

// Handle connection errors
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

export { pool };
export const db = drizzle(pool, { 
  schema,
  logger: !isProduction // Enable query logging in development
});