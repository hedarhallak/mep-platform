// tests/smoke/lib_auth_utils.test.js — Phase 73c.
//
// lib/auth_utils.js (37 lines) is small but high-stakes — it backs every
// PIN check + JWT signing in the system. Cover hashPin (bcrypt format
// check), verifyPin (bcrypt branch + legacy SHA-256 branch + falsy
// stored-hash branch).

'use strict';

const crypto = require('crypto');
const { hashPin, verifyPin, JWT_SECRET } = require('../../lib/auth_utils');

describe('lib/auth_utils — JWT_SECRET export', () => {
  test('exports JWT_SECRET from process.env.JWT_SECRET (set by tests/setup.js)', () => {
    expect(typeof JWT_SECRET).toBe('string');
    expect(JWT_SECRET.length).toBeGreaterThanOrEqual(16);
  });
});

describe('lib/auth_utils — hashPin', () => {
  test('returns a bcrypt-format hash starting with $2b$ (cost factor 12)', async () => {
    const hash = await hashPin('1234');
    expect(typeof hash).toBe('string');
    expect(hash).toMatch(/^\$2b\$12\$/);
  });

  test('non-string input is coerced before hashing', async () => {
    const hashFromNum = await hashPin(1234);
    const hashFromStr = await hashPin('1234');
    // Each call generates a new salt, so the hashes differ — but both
    // verify against either input.
    expect(await verifyPin('1234', hashFromNum)).toBe(true);
    expect(await verifyPin(1234, hashFromStr)).toBe(true);
  });

  test('two calls with same input produce different hashes (random salt)', async () => {
    const a = await hashPin('1234');
    const b = await hashPin('1234');
    expect(a).not.toBe(b);
  });
});

describe('lib/auth_utils — verifyPin', () => {
  test('returns false when storedHash is falsy', async () => {
    expect(await verifyPin('1234', null)).toBe(false);
    expect(await verifyPin('1234', undefined)).toBe(false);
    expect(await verifyPin('1234', '')).toBe(false);
  });

  test('returns true on matching bcrypt hash ($2b$ prefix)', async () => {
    const hash = await hashPin('1234');
    expect(await verifyPin('1234', hash)).toBe(true);
  });

  test('returns false on mismatching bcrypt hash', async () => {
    const hash = await hashPin('1234');
    expect(await verifyPin('5678', hash)).toBe(false);
  });

  test('handles legacy $2a$ bcrypt prefix (older format)', async () => {
    // bcrypt's compare understands both $2a$ and $2b$, so feed it a
    // synthetic $2a$ hash via low-level bcrypt to confirm the branch
    // taken in verifyPin.
    const bcrypt = require('bcrypt');
    const realHash = await bcrypt.hash('test123', 10);
    // Force prefix to $2a$ to simulate older library output
    const legacyish = realHash.replace(/^\$2b\$/, '$2a$');
    expect(await verifyPin('test123', legacyish)).toBe(true);
  });

  test('matches a legacy SHA-256 hash (non-bcrypt branch)', async () => {
    const sha = crypto.createHash('sha256').update('1234', 'utf8').digest('hex');
    expect(await verifyPin('1234', sha)).toBe(true);
  });

  test('returns false on legacy SHA-256 mismatch', async () => {
    const sha = crypto.createHash('sha256').update('1234', 'utf8').digest('hex');
    expect(await verifyPin('9999', sha)).toBe(false);
  });

  test('coerces non-string raw PINs before comparing (legacy branch)', async () => {
    const sha = crypto.createHash('sha256').update('1234', 'utf8').digest('hex');
    expect(await verifyPin(1234, sha)).toBe(true);
  });
});
