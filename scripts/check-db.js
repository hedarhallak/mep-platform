const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const KNOWN_EMPTY_TABLES = [];

async function checkDb() {
  const client = await pool.connect();
  try {
    const { rows: tables } = await client.query(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);

    const issues = [];
    const warnings = [];

    for (const { tablename } of tables) {
      const { rows } = await client.query(`SELECT COUNT(*) as count FROM "${tablename}"`);
      const count = parseInt(rows[0].count, 10);

      if (count === 0 && !KNOWN_EMPTY_TABLES.includes(tablename)) {
        warnings.push(`  EMPTY TABLE: ${tablename} (0 rows)`);
      }
    }

    const { rows: dupSeq } = await client.query(`
      SELECT sequence_name
      FROM information_schema.sequences
      WHERE sequence_schema = 'public'
      ORDER BY sequence_name
    `);

    console.log('\n========================================');
    console.log('       CONSTRAI — DB Audit');
    console.log('========================================');
    console.log(`Total tables: ${tables.length}`);
    console.log(`Total sequences: ${dupSeq.length}`);

    if (warnings.length > 0) {
      console.log(`\n⚠️   EMPTY TABLES (${warnings.length}) — review if still needed:`);
      warnings.forEach((w) => console.log(w));
    } else {
      console.log('\n✅  No empty tables found.');
    }

    if (issues.length > 0) {
      console.log(`\n🔴  ERRORS (${issues.length}):`);
      issues.forEach((i) => console.log(i));
      console.log('');
      return false;
    }

    console.log('');
    return true;
  } finally {
    client.release();
    await pool.end();
  }
}

checkDb().catch((err) => {
  console.error('DB audit error:', err.message);
  process.exit(1);
});
