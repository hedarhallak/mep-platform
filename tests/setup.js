// Jest setup file — runs before any test imports modules.

// Force NODE_ENV=test so app.js's rate-limit skip kicks in. CI sets
// NODE_ENV=development at the workflow level (to allow native deps to
// install without prebuilds), so we override here for the test process.
process.env.NODE_ENV = 'test';

process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-secret-only-used-in-tests-do-not-deploy-this-value';

const SENTINEL_DB_URL = 'postgres://noop:noop@127.0.0.1:1/no_real_db_in_tests';

if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
} else {
  process.env.DATABASE_URL = SENTINEL_DB_URL;
}
