const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// As of Phase 9 (2026-04-28): the canonical migration directory is now
// `migrations/` at repo root. The previous `db/migrations/` and the
// pre-Phase-9 contents of `migrations/` are archived under
// `db/migrations.archive/` for historical reference only — they are NOT
// re-run on fresh setups. The new `migrations/000_baseline_2026-04-28.sql`
// is a pg_dump snapshot of prod after all historical migrations had been
// (manually) applied; running it on a fresh database brings the schema to
// the post-Phase-6 cleanup state. New migrations are added on top with
// numbers 001, 002, ... and are tracked via the schema_migrations table.
const MIGRATIONS_DIR = path.join(__dirname, '../migrations');

async function run() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id          SERIAL PRIMARY KEY,
        filename    TEXT NOT NULL UNIQUE,
        executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const { rows: executed } = await client.query(
      'SELECT filename FROM schema_migrations ORDER BY filename'
    );
    const executedSet = new Set(executed.map((r) => r.filename));

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    const pending = files.filter((f) => !executedSet.has(f));

    if (pending.length === 0) {
      console.log('No pending migrations.');
      return;
    }

    console.log(`Found ${pending.length} pending migration(s):\n`);

    for (const file of pending) {
      const filePath = path.join(MIGRATIONS_DIR, file);
      const sql = fs.readFileSync(filePath, 'utf8');
      console.log(`  Running: ${file}`);
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`  Done:    ${file} ✓`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`  FAILED:  ${file}`);
        console.error(`  Error:   ${err.message}`);
        process.exit(1);
      }
    }

    console.log('\nAll migrations applied successfully.');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error('Migration runner error:', err.message);
  process.exit(1);
});
