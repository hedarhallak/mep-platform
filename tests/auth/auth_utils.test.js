// Pure-function tests for lib/auth_utils.js — PIN hashing & verification.
//
// hashPin uses bcrypt (12 rounds). verifyPin handles both bcrypt and a
// legacy SHA-256 fallback (so existing users authenticate until they
// reset their PIN). Both helpers are pure given input + bcrypt's internal
// salt randomness.

const { hashPin, verifyPin } = require('../../lib/auth_utils');
const crypto = require('crypto');

describe('hashPin', () => {
  test('returns a bcrypt hash starting with $2b$', async () => {
    const hash = await hashPin('1234');
    expect(typeof hash).toBe('string');
    expect(hash.startsWith('$2b$')).toBe(true);
  });

  test('produces a different hash for the same input each call (salt)', async () => {
    const a = await hashPin('1234');
    const b = await hashPin('1234');
    expect(a).not.toBe(b);
  });

  test('coerces non-string input via String()', async () => {
    const hash = await hashPin(1234);
    expect(typeof hash).toBe('string');
    expect(hash.startsWith('$2b$')).toBe(true);
  });

  test('handles empty string', async () => {
    const hash = await hashPin('');
    expect(hash.startsWith('$2b$')).toBe(true);
  });
});

describe('verifyPin', () => {
  test('verifies a freshly hashed PIN', async () => {
    const hash = await hashPin('1234');
    const ok = await verifyPin('1234', hash);
    expect(ok).toBe(true);
  });

  test('rejects a wrong PIN against a bcrypt hash', async () => {
    const hash = await hashPin('1234');
    const ok = await verifyPin('5678', hash);
    expect(ok).toBe(false);
  });

  test('returns false for null/undefined storedHash', async () => {
    expect(await verifyPin('1234', null)).toBe(false);
    expect(await verifyPin('1234', undefined)).toBe(false);
  });

  test('returns false for empty storedHash', async () => {
    expect(await verifyPin('1234', '')).toBe(false);
  });

  test('verifies a legacy SHA-256 hash for back-compat', async () => {
    const legacyHash = crypto.createHash('sha256').update('legacy-pin', 'utf8').digest('hex');
    const ok = await verifyPin('legacy-pin', legacyHash);
    expect(ok).toBe(true);
  });

  test('rejects a wrong PIN against a legacy SHA-256 hash', async () => {
    const legacyHash = crypto.createHash('sha256').update('correct-pin', 'utf8').digest('hex');
    const ok = await verifyPin('wrong-pin', legacyHash);
    expect(ok).toBe(false);
  });

  test('coerces non-string raw PIN via String() for bcrypt path', async () => {
    const hash = await hashPin('5678');
    const ok = await verifyPin(5678, hash);
    expect(ok).toBe(true);
  });

  test('coerces non-string raw PIN via String() for legacy path', async () => {
    const legacyHash = crypto.createHash('sha256').update('9999', 'utf8').digest('hex');
    const ok = await verifyPin(9999, legacyHash);
    expect(ok).toBe(true);
  });
});
