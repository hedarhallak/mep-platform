'use strict';

/**
 * lib/totp.js
 *
 * Phase 6-D-6.5 / Section 121 — TOTP 2FA helper for SUPER_ADMIN.
 *
 * Self-contained RFC 6238 implementation using node:crypto only — no
 * runtime dependencies on otplib / @scure/base, which fail to load under
 * Jest's default transform pipeline (Section 121.X). All we need from
 * external libs is `qrcode` (pure CommonJS) for the QR PNG render in the
 * setup wizard.
 *
 * Layers:
 *   - base32 encode/decode (RFC 4648, used by the otpauth:// URI format)
 *   - hotp(secret, counter) → 6-digit code (HMAC-SHA1, RFC 4226 §5.3)
 *   - totp(secret, time?)   → hotp with counter = floor(time/30000)
 *   - verifyCode(code, secret, opts?) — accepts the previous/current/next
 *     30s window codes (±1 step tolerance, matches Google Authenticator)
 *   - encryptSecret / decryptSecret — AES-256-GCM at-rest envelope
 *   - generateSecret() returns a 20-byte (160-bit) base32 string, the same
 *     length Google Authenticator emits and well above the RFC 4226 80-bit
 *     minimum
 *
 * Threat model:
 *   - DB dump alone → secrets remain encrypted (attacker can't generate codes).
 *   - DB dump + .env leaked → equivalent to plaintext (defense already lost).
 *   - Key rotation policy: re-encrypt all rows using new key; documented
 *     in RECOVERY.md when needed.
 */

const crypto = require('crypto');
const QRCode = require('qrcode');

const ENCRYPTION_ALGO = 'aes-256-gcm';
const IV_LENGTH = 12; // GCM standard nonce length
const KEY_BYTES = 32; // 256-bit key
const STEP_SECONDS = 30;
const DIGITS = 6;
const WINDOW = 1; // ±1 step tolerance
const TOTP_ISSUER = process.env.TOTP_ISSUER || 'Constrai Admin';

// ─── base32 (RFC 4648) ────────────────────────────────────────────────────
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = '';
  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  }
  return output;
}

function base32Decode(input) {
  const cleaned = String(input).toUpperCase().replace(/=+$/g, '').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const output = [];
  for (let i = 0; i < cleaned.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(cleaned[i]);
    if (idx === -1) throw new Error('Invalid base32 character');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

// ─── HOTP / TOTP ──────────────────────────────────────────────────────────
function hotp(secretBuffer, counter) {
  const buf = Buffer.alloc(8);
  // Big-endian 64-bit counter
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = crypto.createHmac('sha1', secretBuffer).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 10 ** DIGITS).padStart(DIGITS, '0');
}

function totp(secretBase32, timeMs = Date.now()) {
  const counter = Math.floor(timeMs / 1000 / STEP_SECONDS);
  return hotp(base32Decode(secretBase32), counter);
}

// ─── Encryption key + public API ──────────────────────────────────────────
function getEncryptionKey() {
  const hex = process.env.TOTP_ENCRYPTION_KEY;
  if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(
      'TOTP_ENCRYPTION_KEY missing or malformed. Expected a 64-character hex string (32 raw bytes).'
    );
  }
  return Buffer.from(hex, 'hex');
}

/** Generate a fresh 20-byte base32 TOTP secret (matches Google Authenticator). */
function generateSecret() {
  return base32Encode(crypto.randomBytes(20));
}

/** Build the otpauth:// URI used by Authenticator apps. */
function buildOtpauthUri({ secret, label }) {
  const issuer = encodeURIComponent(TOTP_ISSUER);
  const account = encodeURIComponent(label);
  const sec = encodeURIComponent(secret);
  // otpauth://totp/<issuer>:<account>?secret=...&issuer=...&algorithm=SHA1&digits=6&period=30
  return (
    `otpauth://totp/${issuer}:${account}` +
    `?secret=${sec}&issuer=${issuer}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`
  );
}

/** Render an otpauth:// URI as a base64 data URL PNG. */
async function buildQrCodeDataUrl(uri) {
  return await QRCode.toDataURL(uri, { margin: 1, width: 256 });
}

/**
 * Verify a 6-digit code against a base32 secret. Accepts the previous,
 * current, and next 30s windows (±1 step) to tolerate clock skew.
 */
function verifyCode(code, secret, { timeMs = Date.now() } = {}) {
  if (!code || !secret) return false;
  const cleaned = String(code).replace(/\D/g, '');
  if (cleaned.length !== DIGITS) return false;
  let secretBuf;
  try {
    secretBuf = base32Decode(secret);
  } catch (_e) {
    return false;
  }
  const counter = Math.floor(timeMs / 1000 / STEP_SECONDS);
  for (let w = -WINDOW; w <= WINDOW; w++) {
    if (hotp(secretBuf, counter + w) === cleaned) return true;
  }
  return false;
}

/** Encrypt a base32 TOTP secret for persistence. */
function encryptSecret(secret) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(Buffer.from(secret, 'utf8')), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { encrypted, iv, authTag };
}

/** Decrypt persisted ciphertext back to the base32 TOTP secret. */
function decryptSecret({ encrypted, iv, authTag }) {
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGO, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

/**
 * Helper: should this user/role require TOTP today?
 * Currently SUPER_ADMIN only (Section 120.5 lock). COMPANY_ADMIN extension
 * is Phase 6-D-6.7 backlog.
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
  // Exported for tests:
  totp,
  hotp,
  base32Encode,
  base32Decode,
  _internals: { ENCRYPTION_ALGO, IV_LENGTH, KEY_BYTES, STEP_SECONDS, DIGITS },
};
