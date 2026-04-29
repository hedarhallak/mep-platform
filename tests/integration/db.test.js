// Smoke test for the test DB infrastructure — Phase 11c.
//
// Establishes that:
//   - tests/helpers/db.js detects the DATABASE_URL correctly
//   - getPool() can connect + run a query
//   - The Phase 9 baseline migration left expected tables in place
//
// Skips when DATABASE_URL is the sentinel (local dev without
// TEST_DATABASE_URL). CI sets TEST_DATABASE_URL → these tests run
// against the postgis/postgis service container with the baseline
// applied via psql in the workflow.

const { describeIfDb, getPool, closePool } = require('../helpers/db');

describeIfDb('Test DB connectivity', () => {
  afterAll(async () => {
    await closePool();
  });

  test('SELECT 1 returns a single row', async () => {
    const pool = getPool();
    const { rows } = await pool.query('SELECT 1 AS one');
    expect(rows).toEqual([{ one: 1 }]);
  });

  test('PostGIS extension is installed', async () => {
    const pool = getPool();
    const { rows } = await pool.query(`SELECT extname FROM pg_extension WHERE extname = 'postgis'`);
    expect(rows).toHaveLength(1);
    expect(rows[0].extname).toBe('postgis');
  });

  test('app_users table exists from baseline', async () => {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'app_users'`
    );
    expect(rows).toHaveLength(1);
  });

  test('companies table exists from baseline', async () => {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'companies'`
    );
    expect(rows).toHaveLength(1);
  });

  test('role_permissions table structure is in place from baseline', async () => {
    // pg_dump -s is schema-only, so the table is empty here. We verify
    // the table + key columns exist so any future test that seeds data
    // into it has a known target. (The 284-row seed data lives on prod;
    // tests will create their own minimal fixtures.)
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'role_permissions'
         AND column_name IN ('role', 'permission_code')`
    );
    expect(rows).toHaveLength(2);
  });
});
