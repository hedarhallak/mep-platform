// tests/smoke/totp_lib.test.js
//
// Phase 6-D-6.5 / Section 121 — pure-function smoke tests for lib/totp.js.
// Encryption roundtrip + code verification window. Does NOT touch the DB.

'use strict';

// Set the encryption key BEFORE requiring lib/totp so getEncryptionKey()
// validates the hex format on first call. 32 raw bytes = 64 hex chars.
process.env.TOTP_ENCRYPTION_KEY = 'a'.repeat(64);

const totpLib = require('../../lib/totp');

describe('lib/totp encryption roundtrip', () => {
  test('encryptSecret + decryptSecret returns the original secret', () => {
    const secret = totpLib.generateSecret();
    const { encrypted, iv, authTag } = totpLib.encryptSecret(secret);
    expect(Buffer.isBuffer(encrypted)).toBe(true);
    expect(iv).toHaveLength(12); // GCM nonce
    expect(authTag).toHaveLength(16); // GCM tag

    const decrypted = totpLib.decryptSecret({ encrypted, iv, authTag });
    expect(decrypted).toBe(secret);
  });

  test('decryptSecret with tampered ciphertext throws (GCM integrity)', () => {
    const secret = totpLib.generateSecret();
    const { encrypted, iv, authTag } = totpLib.encryptSecret(secret);
    const tampered = Buffer.from(encrypted);
    tampered[0] ^= 0x01; // flip a bit
    expect(() => totpLib.decryptSecret({ encrypted: tampered, iv, authTag })).toThrow();
  });
});

describe('lib/totp code verification', () => {
  test('verifyCode accepts a code generated for the current step', () => {
    const secret = totpLib.generateSecret();
    const code = totpLib.totp(secret);
    expect(totpLib.verifyCode(code, secret)).toBe(true);
  });

  test('verifyCode rejects a wrong code', () => {
    const secret = totpLib.generateSecret();
    expect(totpLib.verifyCode('000000', secret)).toBe(false);
  });

  test('verifyCode tolerates spaces in the input', () => {
    const secret = totpLib.generateSecret();
    const code = totpLib.totp(secret);
    expect(totpLib.verifyCode(`${code.slice(0, 3)} ${code.slice(3)}`, secret)).toBe(true);
  });

  test('verifyCode accepts a code from the previous 30s window (clock skew)', () => {
    const secret = totpLib.generateSecret();
    const prevTime = Date.now() - 31000;
    const oldCode = totpLib.totp(secret, prevTime);
    expect(totpLib.verifyCode(oldCode, secret)).toBe(true);
  });

  // RFC 6238 known test vectors (Appendix B, using the 20-byte ASCII secret
  // "12345678901234567890" → base32 "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ").
  test('matches RFC 6238 Appendix B test vector for T=59', () => {
    const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    expect(totpLib.totp(secret, 59 * 1000)).toBe('287082');
  });

  test('verifyCode returns false for null/undefined inputs', () => {
    const secret = totpLib.generateSecret();
    expect(totpLib.verifyCode(null, secret)).toBe(false);
    expect(totpLib.verifyCode('123456', null)).toBe(false);
  });
});

describe('lib/totp totpRequiredForUser', () => {
  const original = process.env.TOTP_ENFORCE;
  afterAll(() => {
    if (original === undefined) delete process.env.TOTP_ENFORCE;
    else process.env.TOTP_ENFORCE = original;
  });

  test('returns false when TOTP_ENFORCE is unset', () => {
    delete process.env.TOTP_ENFORCE;
    expect(totpLib.totpRequiredForUser({ role: 'SUPER_ADMIN' })).toBe(false);
  });

  test('returns true for SUPER_ADMIN when TOTP_ENFORCE=true', () => {
    process.env.TOTP_ENFORCE = 'true';
    expect(totpLib.totpRequiredForUser({ role: 'SUPER_ADMIN' })).toBe(true);
  });

  test('returns false for non-SA roles even when TOTP_ENFORCE=true', () => {
    process.env.TOTP_ENFORCE = 'true';
    expect(totpLib.totpRequiredForUser({ role: 'COMPANY_ADMIN' })).toBe(false);
    expect(totpLib.totpRequiredForUser({ role: 'FOREMAN' })).toBe(false);
  });

  test('returns false for missing user', () => {
    process.env.TOTP_ENFORCE = 'true';
    expect(totpLib.totpRequiredForUser(null)).toBe(false);
    expect(totpLib.totpRequiredForUser({})).toBe(false);
  });
});
