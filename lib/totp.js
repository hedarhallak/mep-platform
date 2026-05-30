'use strict';

/**
 * lib/totp.js
 *
 * Phase 6-D-6.5 / Section 121 — TOTP 2FA helper for SUPER_ADMIN.
 *
 * Wraps otplib for code generation/verification + node:crypto for
 * AES-256-GCM at-rest encryption of the per-user TOTP secret. The
 * encryption key lives in process.env.TOTP_ENCRYPTION_KEY (32 raw
 * bytes, hex-encoded — 64 hex characters).
 *
 * Threat model assumed:
 *   - DB dump alone → secrets remain encrypted (attacker can't generate codes).
 *   - DB dump + .env leaked → equivalent to plaintext (defense already lost).
 *   - Key rotation policy: re-encrypt all rows using new key; documented
 *     in RECOVERY.md when needed.
 *
 * Code window: 30s steps, ±1 step tolerance (i.e. accept the previous,
 * current, and next 30s codes). Matches Google Authenticator's UX.
 */

const crypto = require('crypto');
const { authenticator } = require('otplib');
const QRCode = require('qrcode');

const ENCRYPTION_ALGO = 'aes-256-gcm';
const IV_LENGTH = 12; // GCM standard nonce length
const KEY_BYTES = 32; // 256-bit key
const TOTP_ISSUER = process.env.TOTP_ISSUER || 'Constrai Admin';

// Configure otplib for a ±1 step tolerance window (allows clock skew on
// the authenticator app, plus the few seconds between user reading the
// code and submitting it).
authenticator.options = {
  window: 1,
  step: 30,
  digits: 6,
};

function getEncryptionKey() {
  const hex = process.env.TOTP_ENCRYPTION_KEY;
  if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(
      'TOTP_ENCRYPTION_KEY missing or malformed. Expected a 64-character hex string (32 raw bytes).'
    );
  }
  return Buffer.from(hex, 'hex');
}

/**
 * Generate a fresh base32 TOTP secret for a brand-new enrollment.
 *
 * @returns {string} base32 secret suitable for otpauth:// URIs.
 */
function generateSecret() {
  return authenticator.generateSecret();
}

/**
 * Build the otpauth:// URI used by Authenticator apps.
 *
 * @param {object} args
 * @param {string} args.secret - base32 secret
 * @param {string} args.label  - e.g. 'hedar.hallak@gmail.com'
 * @returns {string}
 */
function buildOtpauthUri({ secret, label }) {
  return authenticator.keyuri(label, TOTP_ISSUER, secret);
}

/**
 * Render an otpauth:// URI as a base64 data URL PNG so the frontend can
 * <img src={dataUrl} /> it directly without bundling a QR library.
 *
 * @param {string} uri
 * @returns {Promise<string>}
 */
async function buildQrCodeDataUrl(uri) {
  return await QRCode.toDataURL(uri, { margin: 1, width: 256 });
}

/**
 * Verify a 6-digit code against a base32 secret. Returns true/false.
 *
 * @param {string} code   - the 6-digit code the user entered
 * @param {string} secret - the base32 TOTP secret
 * @returns {boolean}
 */
function verifyCode(code, secret) {
  if (!code || !secret) return false;
  // Strip non-digits just in case the user pasted with spaces.
  const cleaned = String(code).replace(/\D/g, '');
  if (cleaned.length !== 6) return false;
  try {
    return authenticator.verify({ token: cleaned, secret });
  } catch (_err) {
    return false;
  }
}

/**
 * Encrypt a base32 TOTP secret for persistence.
 *
 * @param {string} secret
 * @returns {{ encrypted: Buffer, iv: Buffer, authTag: Buffer }}
 */
function encryptSecret(secret) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(Buffer.from(secret, 'utf8')), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { encrypted, iv, authTag };
}

/**
 * Decrypt persisted ciphertext back to the base32 TOTP secret.
 *
 * @param {{ encrypted: Buffer, iv: Buffer, authTag: Buffer }} stored
 * @returns {string}
 */
function decryptSecret({ encrypted, iv, authTag }) {
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGO, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

/**
 * Helper: should this user/role require TOTP today?
 *
 * Currently SUPER_ADMIN only (Section 120.5 lock). COMPANY_ADMIN extension
 * is Phase 6-D-6.7 backlog. Reading the role + the TOTP_ENFORCE feature
 * flag here in one place makes the rollout reversible without touching
 * every caller.
 *
 * @param {{ role?: string } | null | undefined} user
 * @returns {boolean}
 */
function totpRequiredForUser(user) {
  if (!user || !user.role) return false;
  if (process.env.TOTP_ENFORCE !== 'true') return false;
  return user.role === 'SUPER_ADMIN';
}

module.exports = {
  generateSecret,
  buildOtpauthUri,
  buildQrCodeDataUrl,
  verifyCode,
  encryptSecret,
  decryptSecret,
  totpRequiredForUser,
  // exported for tests:
  _internals: { ENCRYPTION_ALGO, IV_LENGTH, KEY_BYTES },
};
