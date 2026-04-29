// Jest setup file — runs before any test imports modules.
//
// Sets a deterministic JWT_SECRET so lib/auth_utils.js can be required from
// tests without throwing. Real production secrets come from .env on the
// server; CI and local test runs use this fixed value.

process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-secret-only-used-in-tests-do-not-deploy-this-value';

// Prevent test runs from accidentally hitting any database. If a future
// test imports a module that creates a pg pool at load time, this lets us
// catch it with an explicit error instead of a network timeout.
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgres://noop:noop@127.0.0.1:1/no_real_db_in_unit_tests';
