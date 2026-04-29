// tests/helpers/db.js — DB connectivity helper for Phase 11c+.
//
// Tests that need to talk to a real database import this module. It:
//   - Exposes `dbAvailable()` — returns true when a non-sentinel
//     DATABASE_URL is set (i.e. CI's postgres service container or a
//     local dev opt-in via TEST_DATABASE_URL).
//   - Exposes `getPool()` — lazily creates a pg.Pool against the test DB
//     (separate from the app's pool to keep test queries isolated).
//   - Exposes `closePool()` — call from afterAll() to let Jest exit cleanly.
//
// DB-backed test files skip themselves with `describe.skip` when
// dbAvailable() is false, so smoke + pure-function suites keep working
// in environments without a Postgres service.

'use strict';

const { Pool } = require('pg');

const SENTINEL_HINT = 'noop@127.0.0.1';

function dbAvailable() {
  const url = process.env.DATABASE_URL || '';
  return url.length > 0 && !url.includes(SENTINEL_HINT);
}

let _pool = null;

function getPool() {
  if (!_pool) {
    if (!dbAvailable()) {
      throw new Error(
        'tests/helpers/db.js: getPool() called but DATABASE_URL is sentinel. ' +
          'Wrap your describe block with describeIfDb() so the suite is skipped.'
      );
    }
    _pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return _pool;
}

async function closePool() {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}

// Convenience: a describe-or-skip helper for DB-dependent suites.
//
//   const { describeIfDb } = require('../helpers/db');
//   describeIfDb('POST /api/auth/login', () => { ... });
//
const describeIfDb = dbAvailable() ? describe : describe.skip;

module.exports = { dbAvailable, getPool, closePool, describeIfDb };
