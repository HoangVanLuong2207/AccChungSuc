import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Configure for both development (Replit) and production (Render)
const isProduction = process.env.NODE_ENV === 'production';
const poolConfig = {
  connectionString: process.env.DATABASE_URL,
  ...(isProduction && {
    ssl: {
      rejectUnauthorized: false
    }
  })
};

export const pool = new Pool(poolConfig);
export const db = drizzle(pool, { schema });