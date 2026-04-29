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

// ─── Fixture helpers — Phase 11d ──────────────────────────────
//
// Tests insert minimal company + user rows, run their assertions, then
// `cleanupTestRows()` removes anything created with the test prefix.
// All test rows have usernames / company names starting with `test_`
// so the cleanup query is targeted and never touches real data.

const TEST_PREFIX = 'test_';

let _seq = 0;
function uniqueTag() {
  _seq += 1;
  return `${Date.now()}_${_seq}`;
}

async function seedCompany(overrides = {}) {
  const pool = getPool();
  const name = overrides.name || `${TEST_PREFIX}co_${uniqueTag()}`;
  const status = overrides.status || 'ACTIVE';
  const { rows } = await pool.query(
    `INSERT INTO public.companies (name, status, plan)
     VALUES ($1, $2, 'BASIC')
     RETURNING company_id`,
    [name, status]
  );
  return { company_id: Number(rows[0].company_id), name, status };
}

async function seedUser(overrides = {}) {
  const pool = getPool();
  const { hashPin } = require('../../lib/auth_utils');
  const username = overrides.username || `${TEST_PREFIX}u_${uniqueTag()}`;
  const role = overrides.role || 'WORKER';
  const pin = overrides.pin || '1234';
  const isActive = overrides.is_active !== undefined ? overrides.is_active : true;
  const companyId = overrides.company_id || null;
  const pinHash = await hashPin(pin);
  const { rows } = await pool.query(
    `INSERT INTO public.app_users (username, pin_hash, role, is_active, company_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [username, pinHash, role, isActive, companyId]
  );
  return { id: Number(rows[0].id), username, role, pin, company_id: companyId };
}

async function cleanupTestRows() {
  const pool = getPool();
  // Order matters — refresh_tokens FK to app_users; app_users FK to companies.
  await pool.query(
    `DELETE FROM public.refresh_tokens
     WHERE user_id IN (SELECT id FROM public.app_users WHERE username LIKE $1)`,
    [`${TEST_PREFIX}%`]
  );
  await pool.query(`DELETE FROM public.audit_logs WHERE username LIKE $1`, [`${TEST_PREFIX}%`]);
  await pool.query(`DELETE FROM public.app_users WHERE username LIKE $1`, [`${TEST_PREFIX}%`]);
  await pool.query(`DELETE FROM public.companies WHERE name LIKE $1`, [`${TEST_PREFIX}%`]);
}

module.exports = {
  dbAvailable,
  getPool,
  closePool,
  describeIfDb,
  seedCompany,
  seedUser,
  cleanupTestRows,
};
