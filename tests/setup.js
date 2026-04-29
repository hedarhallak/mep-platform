// Jest setup file — runs before any test imports modules.
//
// 1. Sets a deterministic JWT_SECRET so lib/auth_utils.js can be required
//    from tests without throwing the env-guard check at module load time.
//
// 2. DATABASE_URL strategy:
//    - If TEST_DATABASE_URL is set (CI sets this to the postgres service
//      container, local dev opt-in via `set TEST_DATABASE_URL=...`),
//      promote it to DATABASE_URL so the app's pg.Pool connects to the
//      test database.
//    - Otherwise, set DATABASE_URL to a sentinel that no real Postgres
//      will answer. DB-backed tests detect the sentinel via dbAvailable()
//      below and skip themselves; pure-function tests stay green.
//
//    This deliberately PREVENTS tests from running against Hedar's local
//    dev DB by default — the .env file's DATABASE_URL is only used by the
//    real app, not by `npm test`.

process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-secret-only-used-in-tests-do-not-deploy-this-value';

const SENTINEL_DB_URL = 'postgres://noop:noop@127.0.0.1:1/no_real_db_in_tests';

if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
} else {
  process.env.DATABASE_URL = SENTINEL_DB_URL;
}
