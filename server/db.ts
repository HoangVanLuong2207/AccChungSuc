import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";
import 'dotenv/config';

// Hàm log thông tin môi trường
function logEnvInfo() {
  console.log('Environment:');
  console.log('- NODE_ENV:', process.env.NODE_ENV || 'development');
  
  // Log tất cả các biến môi trường bắt đầu bằng DATABASE_
  Object.keys(process.env).forEach(key => {
    if (key.startsWith('DATABASE_')) {
      const value = key.includes('PASSWORD') || key.includes('URL') 
        ? '***HIDDEN***' 
        : process.env[key];
      console.log(`- ${key}: ${value}`);
    }
  });
}

logEnvInfo();

// Cấu hình kết nối mặc định
const DEFAULT_CONFIG = {
  user: 'root',
  password: 'lEx9Zk7EVyqjfxO3XWofcyaKEYUffwiq',
  host: 'dpg-d35r6gjipnbc739ndtt0-a.oregon-postgres.render.com',
  database: 'cloneacc_lt8x',
  port: 5432,
  ssl: {
    rejectUnauthorized: false,
  },
};

// Lấy cấu hình từ biến môi trường hoặc sử dụng mặc định
function getDbConfig() {
  // Nếu có DATABASE_URL, sử dụng nó
  if (process.env.DATABASE_URL) {
    try {
      // Xử lý trường hợp DATABASE_URL bị bọc trong dấu nháy
      let dbUrl = process.env.DATABASE_URL;
      if (dbUrl.startsWith('"') && dbUrl.endsWith('"')) {
        dbUrl = dbUrl.slice(1, -1);
      }
      
      // Xử lý trường hợp có dạng DATABASE_URL=value...
      if (dbUrl.startsWith('DATABASE_URL=')) {
        dbUrl = dbUrl.replace('DATABASE_URL=', '');
      }
      
      // Phân tích URL
      const url = new URL(dbUrl);
      
      return {
        user: url.username,
        password: url.password,
        host: url.hostname,
        database: url.pathname.replace(/^\/+/, ''),
        port: parseInt(url.port, 10) || 5432,
        ssl: {
          rejectUnauthorized: false,
        },
      };
    } catch (error) {
      console.error('Error parsing DATABASE_URL, using default config:', error);
      return DEFAULT_CONFIG;
    }
  }
  
  // Sử dụng cấu hình mặc định
  return DEFAULT_CONFIG;
}

const dbConfig = getDbConfig();
console.log('Database config:', {
  ...dbConfig,
  password: '***',
});

// Tạo pool kết nối
const pool = new Pool({
  ...dbConfig,
  connectionTimeoutMillis: 5000,
  query_timeout: 10000,
});

// Test the connection
pool.query('SELECT NOW()')
  .then(() => console.log('Successfully connected to PostgreSQL'))
  .catch(err => console.error('Error connecting to PostgreSQL:', err));

// Handle connection errors
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

const isProduction = process.env.NODE_ENV === 'production';
console.log(`Running in ${isProduction ? 'production' : 'development'} mode`);

export { pool };
export const db = drizzle(pool, { 
  schema,
  logger: !isProduction // Enable query logging in development
});