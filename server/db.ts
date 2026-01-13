import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from "@shared/schema";
import 'dotenv/config';

// Log environment variables for debugging
console.log('Environment:');
console.log('- NODE_ENV:', process.env.NODE_ENV || 'development');
console.log('- TURSO_DATABASE_URL:', process.env.TURSO_DATABASE_URL ? '***HIDDEN***' : 'Not set');

// Create Turso/LibSQL client
const tursoUrl = process.env.TURSO_DATABASE_URL;
const tursoAuthToken = process.env.TURSO_AUTH_TOKEN;

if (!tursoUrl) {
  console.error('FATAL: TURSO_DATABASE_URL is not set!');
  process.exit(1);
}

let client: ReturnType<typeof createClient>;

try {
  client = createClient({
    url: tursoUrl,
    authToken: tursoAuthToken,
  });

  console.log('✅ Turso client created successfully');

  // Test connection
  client.execute('SELECT 1')
    .then(() => console.log('✅ Successfully connected to Turso'))
    .catch((err) => {
      console.error('❌ Error connecting to Turso:', err);
    });

} catch (error) {
  console.error('Failed to initialize Turso connection:', error);
  process.exit(1);
}

const isProduction = process.env.NODE_ENV === 'production';
console.log(`Running in ${isProduction ? 'production' : 'development'} mode`);

export { client };
export const db = drizzle(client, {
  schema,
  logger: !isProduction // Enable query logging in development
});