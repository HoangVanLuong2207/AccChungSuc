const { Client } = require('pg');

async function setup() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    await client.query('BEGIN');
    await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto;');

    await client.query(`
      CREATE TABLE IF NOT EXISTS accounts (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        status BOOLEAN NOT NULL DEFAULT true,
        tag TEXT,
        updated_at TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    await client.query(`
      ALTER TABLE accounts
      ADD COLUMN IF NOT EXISTS tag TEXT;
    `);

    await client.query(`
      ALTER TABLE accounts
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT now();
    `);

    await client.query(`
      ALTER TABLE accounts
      ALTER COLUMN updated_at SET DEFAULT now();
    `);

    await client.query(`
      UPDATE accounts
      SET updated_at = COALESCE(updated_at, now());
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS acclogs (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        status BOOLEAN NOT NULL DEFAULT true,
        updated_at TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    await client.query(`
      ALTER TABLE acclogs
      ALTER COLUMN updated_at SET DEFAULT now();
    `);

    await client.query(`
      UPDATE acclogs
      SET updated_at = COALESCE(updated_at, now());
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL
      );
    `);

    await client.query('COMMIT');
    console.log('Database tables created successfully.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to set up tables:', error);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

setup();
