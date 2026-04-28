'use strict';

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { pool } = require('../db');
const { JWT_SECRET, hashPin, verifyPin } = require('../lib/auth_utils');
const { audit, ACTIONS } = require('../lib/audit');

// ===== Token Config =====
const ACCESS_TOKEN_EXPIRES = '1h'; // Short-lived access token
const REFRESH_TOKEN_DAYS = 7; // Refresh token valid for 7 days

// ===== Helpers =====
function signAccessToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRES });
}

function generateRefreshToken() {
  return crypto.randomBytes(64).toString('hex');
}

function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function isValidPin(pin, role) {
  const s = String(pin || '');
  if (role === 'SUPER_ADMIN') return s.length >= 8 && s.length <= 32;
  return s.length >= 4 && s.length <= 8;
}

async function saveRefreshToken(userId, refreshToken, req) {
  const tokenHash = hashRefreshToken(refreshToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);
  const userAgent = (req.headers['user-agent'] || '').substring(0, 500);
  const ip = req.ip || req.connection?.remoteAddress || null;

  await pool.query(
    `INSERT INTO public.refresh_tokens (user_id, token_hash, expires_at, user_agent, ip_address)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, tokenHash, expiresAt, userAgent, ip]
  );
}

function buildTokenPayload(user, role, mustChangePin) {
  return {
    user_id: String(user.id),
    username: user.username,
    employee_id: user.employee_id ? String(user.employee_id) : null,
    company_id: user.company_id ? String(user.company_id) : null,
    role,
    must_change_pin: mustChangePin || false,
  };
}

// ===================
// LOGIN
// ===================
router.post('/login', async (req, res) => {
  try {
    const { username, pin } = req.body || {};

    if (!username || !pin) {
      return res.status(400).json({ ok: false, error: 'MISSING_FIELDS' });
    }

    const { rows } = await pool.query(
      `SELECT au.id, au.username, au.employee_id, au.company_id, au.role, au.is_active, au.pin_hash, au.must_change_pin, ep.full_name
       FROM public.app_users au
       LEFT JOIN public.employee_profiles ep ON ep.employee_id = au.employee_id
       WHERE au.username = $1 LIMIT 1`,
      [username]
    );

    const user = rows[0];
    const fetchedRole = user ? String(user.role || '').toUpperCase() : null;
    if (!isValidPin(pin, fetchedRole)) {
      return res.status(400).json({ ok: false, error: 'INVALID_PIN_FORMAT' });
    }

    const pinOk = user ? await verifyPin(pin, user.pin_hash) : false;
    if (!user || !pinOk) {
      await audit(pool, req, {
        action: ACTIONS.LOGIN_FAILED,
        entity_type: 'user',
        entity_name: username,
        details: { reason: 'INVALID_CREDENTIALS' },
      });
      return res.status(401).json({ ok: false, error: 'INVALID_CREDENTIALS' });
    }

    if (user.is_active === false) {
      return res.status(403).json({ ok: false, error: 'USER_DISABLED' });
    }

    const userRole = user.role ? String(user.role).toUpperCase() : null;
    if (userRole !== 'SUPER_ADMIN' && user.company_id) {
      const company = await pool.query(
        'SELECT status FROM public.companies WHERE company_id = $1 LIMIT 1',
        [user.company_id]
      );
      if (company.rows.length && company.rows[0].status === 'SUSPENDED') {
        return res.status(403).json({
          ok: false,
          error: 'COMPANY_SUSPENDED',
          message: 'Company account is suspended, contact support',
        });
      }
    }

    const role = user.role ? String(user.role).toUpperCase() : null;
    const mustChangePin = user.must_change_pin === true;

    const payload = buildTokenPayload(user, role, mustChangePin);
    const accessToken = signAccessToken(payload);
    const refreshToken = generateRefreshToken();

    await saveRefreshToken(user.id, refreshToken, req);

    await audit(pool, req, {
      action: ACTIONS.LOGIN_SUCCESS,
      entity_type: 'user',
      entity_id: user.id,
      entity_name: user.username,
      details: { role },
    });

    return res.json({
      ok: true,
      token: accessToken,
      refresh_token: refreshToken,
      must_change_pin: mustChangePin,
      user: {
        user_id: user.id,
        username: user.username,
        name: user.full_name || user.username,
        employee_id: user.employee_id,
        company_id: user.company_id,
        role,
        must_change_pin: mustChangePin,
      },
    });
  } catch (err) {
    console.error('LOGIN ERROR:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// ===================
// REFRESH TOKEN
// ===================
router.post('/refresh', async (req, res) => {
  try {
    const { refresh_token } = req.body || {};

    if (!refresh_token) {
      return res.status(400).json({ ok: false, error: 'MISSING_REFRESH_TOKEN' });
    }

    const tokenHash = hashRefreshToken(refresh_token);

    const { rows } = await pool.query(
      `SELECT rt.id, rt.user_id, rt.expires_at, rt.revoked,
              au.username, au.employee_id, au.company_id, au.role, au.is_active, au.must_change_pin,
              ep.full_name
       FROM public.refresh_tokens rt
       JOIN public.app_users au ON au.id = rt.user_id
       LEFT JOIN public.employee_profiles ep ON ep.employee_id = au.employee_id
       WHERE rt.token_hash = $1 LIMIT 1`,
      [tokenHash]
    );

    if (!rows.length) {
      return res.status(401).json({ ok: false, error: 'INVALID_REFRESH_TOKEN' });
    }

    const record = rows[0];

    if (record.revoked) {
      // Potential token theft — revoke ALL tokens for this user
      await pool.query('UPDATE public.refresh_tokens SET revoked = TRUE WHERE user_id = $1', [
        record.user_id,
      ]);
      return res.status(401).json({ ok: false, error: 'TOKEN_REVOKED' });
    }

    if (new Date(record.expires_at) < new Date()) {
      return res.status(401).json({ ok: false, error: 'REFRESH_TOKEN_EXPIRED' });
    }

    if (record.is_active === false) {
      return res.status(403).json({ ok: false, error: 'USER_DISABLED' });
    }

    // Token rotation: revoke old, issue new pair
    await pool.query('UPDATE public.refresh_tokens SET revoked = TRUE WHERE id = $1', [record.id]);

    const role = record.role ? String(record.role).toUpperCase() : null;
    const mustChangePin = record.must_change_pin === true;

    const payload = buildTokenPayload(
      {
        id: record.user_id,
        username: record.username,
        employee_id: record.employee_id,
        company_id: record.company_id,
      },
      role,
      mustChangePin
    );

    const newAccessToken = signAccessToken(payload);
    const newRefreshToken = generateRefreshToken();

    await saveRefreshToken(record.user_id, newRefreshToken, req);

    return res.json({
      ok: true,
      token: newAccessToken,
      refresh_token: newRefreshToken,
      user: {
        user_id: record.user_id,
        username: record.username,
        name: record.full_name || record.username,
        employee_id: record.employee_id,
        company_id: record.company_id,
        role,
        must_change_pin: mustChangePin,
      },
    });
  } catch (err) {
    console.error('REFRESH ERROR:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// ===================
// LOGOUT
// ===================
router.post('/logout', async (req, res) => {
  try {
    const { refresh_token } = req.body || {};

    if (refresh_token) {
      const tokenHash = hashRefreshToken(refresh_token);
      await pool.query('UPDATE public.refresh_tokens SET revoked = TRUE WHERE token_hash = $1', [
        tokenHash,
      ]);
    }

    return res.json({ ok: true, message: 'Logged out successfully' });
  } catch (err) {
    console.error('LOGOUT ERROR:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// ===================
// LOGOUT ALL DEVICES
// ===================
router.post('/logout-all', async (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) return res.status(401).json({ ok: false, error: 'MISSING_TOKEN' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    await pool.query('UPDATE public.refresh_tokens SET revoked = TRUE WHERE user_id = $1', [
      payload.user_id,
    ]);
    return res.json({ ok: true, message: 'All sessions revoked' });
  } catch {
    return res.status(401).json({ ok: false, error: 'INVALID_TOKEN' });
  }
});

// ===================
// SIGN UP — DEPRECATED
// ===================
// Old signup routes removed for security.
// All employee registration now goes through:
//   1. Admin invites via POST /api/invite-employee (creates user_invites record)
//   2. Employee completes via POST /api/onboarding/complete (creates app_user)
// This ensures only invited employees can create accounts.
router.post('/signup', (req, res) => {
  return res.status(410).json({
    ok: false,
    error: 'SIGNUP_DISABLED',
    message: 'Direct signup is disabled. Please use the invitation link sent to your email.',
  });
});
router.post('/signup-invite', (req, res) => {
  return res.status(410).json({
    ok: false,
    error: 'SIGNUP_DISABLED',
    message: 'This signup method is deprecated. Please use the invitation link sent to your email.',
  });
});

// ===================
// WHOAMI
// ===================
router.get('/whoami', async (req, res) => {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ ok: false, error: 'MISSING_TOKEN' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const userId = payload?.user_id;
    const { normalizeRole } = require('../middleware/roles');

    if (userId) {
      try {
        const q = await pool.query(
          'SELECT profile_status, role, company_id FROM public.app_users au LEFT JOIN public.companies c ON c.company_id = au.company_id WHERE au.id = $1',
          [String(userId)]
        );
        const row = q.rows?.[0] || {};
        return res.json({
          ok: true,
          user: {
            ...payload,
            role: normalizeRole(row.role || payload.role),
            profile_status: row.profile_status || null,
          },
        });
      } catch {
        return res.json({ ok: true, user: { ...payload, role: normalizeRole(payload.role) } });
      }
    }
    return res.json({ ok: true, user: { ...payload, role: normalizeRole(payload.role) } });
  } catch {
    return res.status(401).json({ ok: false, error: 'INVALID_TOKEN' });
  }
});

// ===================
// CHANGE PIN
// ===================
router.post('/change-pin', async (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ ok: false, error: 'MISSING_TOKEN' });

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ ok: false, error: 'INVALID_TOKEN' });
  }

  try {
    const { current_pin, new_pin } = req.body || {};
    if (!current_pin || !new_pin)
      return res.status(400).json({ ok: false, error: 'MISSING_FIELDS' });

    const newPinStr = String(new_pin);
    const role = payload.role ? String(payload.role).toUpperCase() : null;

    if (!isValidPin(newPinStr, role))
      return res
        .status(400)
        .json({ ok: false, error: 'INVALID_PIN_FORMAT', message: 'PIN must be 4-8 characters' });
    if (String(current_pin) === newPinStr)
      return res.status(400).json({
        ok: false,
        error: 'SAME_PIN',
        message: 'New PIN must be different from current PIN',
      });

    const { rows } = await pool.query(
      'SELECT id, pin_hash, must_change_pin FROM public.app_users WHERE id = $1 LIMIT 1',
      [String(payload.user_id)]
    );
    if (!rows.length) return res.status(404).json({ ok: false, error: 'USER_NOT_FOUND' });

    const user = rows[0];
    const pinOk = await verifyPin(String(current_pin), user.pin_hash);
    if (!pinOk) return res.status(401).json({ ok: false, error: 'WRONG_CURRENT_PIN' });

    const newHash = await hashPin(newPinStr);
    await pool.query(
      `UPDATE public.app_users SET pin_hash = $1, must_change_pin = false, is_temp_pin = false WHERE id = $2`,
      [newHash, String(payload.user_id)]
    );

    await audit(pool, req, {
      action: ACTIONS.PIN_CHANGED,
      entity_type: 'user',
      entity_id: payload.user_id,
      entity_name: payload.username,
    });
    return res.json({ ok: true, message: 'PIN changed successfully' });
  } catch (err) {
    console.error('CHANGE-PIN ERROR:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

module.exports = router;
