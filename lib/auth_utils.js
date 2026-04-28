// lib/auth_utils.js
// Single source of truth for auth utilities
'use strict';

const crypto = require('crypto');
const bcrypt = require('bcrypt');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.trim().length < 16) {
  throw new Error(
    'FATAL: JWT_SECRET is missing or too short. Set a strong random value in .env (min 16 chars, recommended 64+).'
  );
}

/**
 * Hash a PIN using bcrypt (async).
 */
async function hashPin(pin) {
  return bcrypt.hash(String(pin), 12);
}

/**
 * Verify a raw PIN against a stored hash.
 * Supports both bcrypt (new) and legacy SHA-256 (old) hashes transparently.
 */
async function verifyPin(rawPin, storedHash) {
  if (!storedHash) return false;
  // bcrypt hashes
  if (storedHash.startsWith('$2b$') || storedHash.startsWith('$2a$')) {
    return bcrypt.compare(String(rawPin), storedHash);
  }
  // Legacy SHA-256 fallback — for existing users until they reset PIN
  const legacyHash = crypto.createHash('sha256').update(String(rawPin), 'utf8').digest('hex');
  return legacyHash === storedHash;
}

module.exports = { JWT_SECRET, hashPin, verifyPin };
