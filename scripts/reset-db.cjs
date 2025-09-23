const { Client } = require('pg');

async function reset() {
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
    await client.query('DROP TABLE IF EXISTS "acclogs" CASCADE;');
    await client.query('DROP TABLE IF EXISTS "accounts" CASCADE;');
    await client.query('DROP TABLE IF EXISTS "users" CASCADE;');
    await client.query('COMMIT');
    console.log('Dropped acclogs, accounts, and users tables.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to reset tables:', error);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

reset();
