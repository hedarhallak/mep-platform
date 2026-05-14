'use strict';

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { pool, superPool } = require('../db');
const { JWT_SECRET, hashPin, verifyPin } = require('../lib/auth_utils');
const { audit, ACTIONS } = require('../lib/audit');
// Phase 6-D-1a (Section 100, May 14, 2026): cookie-based session for web.
// See lib/cookie_options.js for the policy. Mobile still uses Bearer.
const {
  accessTokenCookieOptions,
  refreshTokenCookieOptions,
  clearCookieOptions,
} = require('../lib/cookie_options');

// =============================================================================
// authPool — pool used for PRE-TENANT lookups against RLS-strict tables.
//
// auth.js runs before any tenant context exists (login / refresh / whoami /
// change-pin all execute BEFORE middleware/tenant_db.js can resolve a
// tenant). Under migration 013's strict RLS, queries against `app_users`
// and `companies` from a connection with no `app.company_id` GUC set
// return zero rows — login fails with INVALID_PIN_FORMAT /
// INVALID_CREDENTIALS even for valid credentials. See DECISIONS.md
// Section 90 / Piece 90-F and Pitfall #28 for the full incident report.
//
// `superPool` connects as `mepuser_super` (BYPASSRLS) so its queries see
// every row regardless of the GUC. When `DATABASE_URL_SUPER` is unset
// (dev / legacy CI), `superPool == null` and we fall back to the regular
// pool — that works under Stage 1 permissive RLS but will 0-row under
// Stage 3 strict, so production MUST set DATABASE_URL_SUPER.
//
// Tables this affects in auth.js:
//   - app_users          (strict — used by login, refresh, whoami, change-pin)
//   - companies          (strict — used by SUSPENDED check in login)
//
// Tables NOT affected (left on the regular pool):
//   - refresh_tokens     (no RLS — not in migration 012/013's table list)
//   - employee_profiles  (no RLS — joined via app_users / employees only)
//   - audit_logs         (RLS on, but a permissive INSERT policy lets the
//                         pre-tenant pool write — see migration 013)
// =============================================================================
const authPool = superPool || pool;

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
/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Username + PIN login
 *     description: |
 *       Validates credentials and issues a JWT access token (1h validity)
 *       plus a refresh token (7-day rotation). Rate-limited 20 attempts /
 *       15min by IP. The error code differentiates between INVALID_CREDENTIALS,
 *       ACCOUNT_SUSPENDED, and COMPANY_SUSPENDED so the UI can render
 *       the right message.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, pin]
 *             properties:
 *               username: { type: string, example: jane.tester }
 *               pin:      { type: string, example: '1234', description: '4-6 digit numeric PIN' }
 *     responses:
 *       200:
 *         description: Authenticated. Returns access + refresh tokens and the user object.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:           { type: boolean, example: true }
 *                 accessToken:  { type: string, description: 'JWT, 1h validity' }
 *                 refreshToken: { type: string, description: '7-day rotation token' }
 *                 user:         { type: object }
 *       400:
 *         description: Missing username or pin in the request body.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: Invalid credentials, account suspended, or company suspended.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       429:
 *         description: Rate-limited (20 attempts / 15min from this IP).
 */
router.post('/login', async (req, res) => {
  try {
    // Section 87 / migration 011: login is now email-based for the Model C
    // single-domain architecture. Backward-compat: still accept `username` in
    // the request body for older mobile builds; the lookup matches either
    // email or username.
    const { email, username, pin } = req.body || {};
    const loginIdentifier = email || username;

    if (!loginIdentifier || !pin) {
      return res.status(400).json({ ok: false, error: 'MISSING_FIELDS' });
    }

    // Pre-tenant lookup against app_users + companies (both strict RLS —
    // needs authPool). companies JOIN added in Section 100 / Phase 6-D-1a
    // to surface `company_code` for the post-login redirect_url (the
    // generic `app.constrai.ca` login redirects to `<code>.constrai.ca`).
    const { rows } = await authPool.query(
      `SELECT au.id, au.username, au.email, au.employee_id, au.company_id, au.role,
              au.is_active, au.pin_hash, au.must_change_pin,
              ep.full_name,
              c.company_code, c.name AS company_name
       FROM public.app_users au
       LEFT JOIN public.employee_profiles ep ON ep.employee_id = au.employee_id
       LEFT JOIN public.companies c          ON c.company_id   = au.company_id
       WHERE lower(au.email) = lower($1) OR lower(au.username) = lower($1)
       LIMIT 1`,
      [loginIdentifier]
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
        entity_name: loginIdentifier,
        details: { reason: 'INVALID_CREDENTIALS' },
      });
      return res.status(401).json({ ok: false, error: 'INVALID_CREDENTIALS' });
    }

    if (user.is_active === false) {
      return res.status(403).json({ ok: false, error: 'USER_DISABLED' });
    }

    const userRole = user.role ? String(user.role).toUpperCase() : null;

    // Phase 5 / 90-E — cross-portal login gate.
    //
    // The login endpoint is mounted on BOTH adminApp and tenantApp via
    // mountPublicRoutes (90-B), so a request can land here from either
    // host. Reject COMPANY_ADMIN / FOREMAN / etc. attempting to log in
    // on admin.constrai.ca; the admin portal is SUPER_ADMIN only.
    //
    // The reverse direction (SA logging in on app.constrai.ca) is
    // intentionally allowed — Section 90 calls out that SA needs to
    // be able to test as a tenant in another tab.
    //
    // `req.hostname` follows X-Forwarded-Host when trust-proxy is set
    // (see app.js); Nginx forces Host to the literal portal name (90-B
    // / 90-D), so production traffic always lands here with hostname
    // either 'admin.constrai.ca' or 'app.constrai.ca'. Tests using
    // request(app) without setting Host get '127.0.0.1' here and skip
    // the gate (current default-fallback behavior preserved).
    const reqHost = (req.hostname || '').toLowerCase();
    if (reqHost === 'admin.constrai.ca' && userRole !== 'SUPER_ADMIN') {
      await audit(pool, req, {
        action: ACTIONS.BLOCKED_PORTAL_LOGIN,
        entity_type: 'user',
        entity_id: user.id,
        entity_name: user.username,
        details: { role: userRole, attempted_portal: 'admin' },
      });
      return res.status(403).json({
        ok: false,
        error: 'BLOCKED_PORTAL_LOGIN',
        message: 'This account does not have access to the admin portal.',
      });
    }

    if (userRole !== 'SUPER_ADMIN' && user.company_id) {
      // Pre-tenant lookup against companies (strict RLS table — needs authPool).
      const company = await authPool.query(
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

    // Section 100 / Phase 6-D-1a: set HttpOnly cookies for web clients.
    // Additive — the response body still carries the tokens so existing
    // localStorage-based flows + mobile (Bearer) keep working unchanged.
    // Phase 6-D-1b will drop the body tokens for web routes.
    res.cookie('access_token', accessToken, accessTokenCookieOptions(req));
    res.cookie('refresh_token', refreshToken, refreshTokenCookieOptions(req));

    // Section 100 / Phase 6-D-1a: Pattern B (generic-entry → email lookup
    // → tenant subdomain). Only set redirect_url when:
    //   1. The request came in on `app.constrai.ca` (the generic entry).
    //      A request that already hit a tenant subdomain is by definition
    //      not redirecting anywhere, and admin.constrai.ca is SUPER_ADMIN
    //      only (no tenant to redirect to).
    //   2. The user has a company_code (every tenant role has one;
    //      SUPER_ADMIN may not).
    //   3. The user is NOT SUPER_ADMIN (they live on admin.constrai.ca).
    const userCompanyCode = user.company_code ? String(user.company_code).toLowerCase() : null;
    let redirectUrl = null;
    if (reqHost === 'app.constrai.ca' && userCompanyCode && userRole !== 'SUPER_ADMIN') {
      redirectUrl = `https://${userCompanyCode}.constrai.ca/dashboard`;
    }

    return res.json({
      ok: true,
      token: accessToken,
      refresh_token: refreshToken,
      must_change_pin: mustChangePin,
      redirect_url: redirectUrl,
      user: {
        user_id: user.id,
        username: user.username,
        email: user.email,
        name: user.full_name || user.username,
        employee_id: user.employee_id,
        company_id: user.company_id,
        company_code: user.company_code || null,
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
    // Section 100 / Phase 6-D-1a: web clients send the refresh token via
    // an HttpOnly cookie; mobile sends it in the JSON body. Cookie wins
    // when both arrive (cookie path is the more secure default once web
    // moves off localStorage in 6-D-1b).
    const cookieRefresh =
      req.cookies && typeof req.cookies.refresh_token === 'string'
        ? req.cookies.refresh_token
        : null;
    const bodyRefresh = req.body && req.body.refresh_token;
    const refresh_token = cookieRefresh || bodyRefresh;

    if (!refresh_token) {
      return res.status(400).json({ ok: false, error: 'MISSING_REFRESH_TOKEN' });
    }

    const tokenHash = hashRefreshToken(refresh_token);

    // Pre-tenant lookup that JOINs app_users (strict RLS table — needs
    // authPool). Without superPool, the JOIN to app_users would filter
    // every row out and refresh would always return INVALID_REFRESH_TOKEN
    // even for valid tokens.
    const { rows } = await authPool.query(
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

    // Section 100 / Phase 6-D-1a: rotate the cookie pair alongside the
    // body tokens so web clients on the cookie path stay authenticated
    // after rotation. Same additive policy as /login.
    res.cookie('access_token', newAccessToken, accessTokenCookieOptions(req));
    res.cookie('refresh_token', newRefreshToken, refreshTokenCookieOptions(req));

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
    // Section 100 / Phase 6-D-1a: accept refresh token from cookie OR
    // body so logout works for both web and mobile clients.
    const cookieRefresh =
      req.cookies && typeof req.cookies.refresh_token === 'string'
        ? req.cookies.refresh_token
        : null;
    const bodyRefresh = req.body && req.body.refresh_token;
    const refresh_token = cookieRefresh || bodyRefresh;

    if (refresh_token) {
      const tokenHash = hashRefreshToken(refresh_token);
      await pool.query('UPDATE public.refresh_tokens SET revoked = TRUE WHERE token_hash = $1', [
        tokenHash,
      ]);
    }

    // Clear both cookies. Domain + Path on clearCookie MUST match the
    // original Set-Cookie or the browser keeps the old cookie alive —
    // clearCookieOptions(req) mirrors what was used on the Set-Cookie path.
    const cookieOpts = clearCookieOptions(req);
    res.clearCookie('access_token', cookieOpts);
    res.clearCookie('refresh_token', cookieOpts);

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
        // Pre-tenant SELECT that touches app_users + companies (both strict
        // RLS — needs authPool).
        const q = await authPool.query(
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

    // Pre-tenant SELECT/UPDATE on app_users (strict RLS — needs authPool).
    // /api/auth/change-pin runs after JWT verify but BEFORE any tenantDb
    // middleware (auth.js is mounted via mountPublicRoutes in 90-B), so
    // there's no GUC set on the regular pool. Under Stage 3 strict RLS the
    // SELECT would 0-row → USER_NOT_FOUND for legitimate users.
    const { rows } = await authPool.query(
      'SELECT id, pin_hash, must_change_pin FROM public.app_users WHERE id = $1 LIMIT 1',
      [String(payload.user_id)]
    );
    if (!rows.length) return res.status(404).json({ ok: false, error: 'USER_NOT_FOUND' });

    const user = rows[0];
    const pinOk = await verifyPin(String(current_pin), user.pin_hash);
    if (!pinOk) return res.status(401).json({ ok: false, error: 'WRONG_CURRENT_PIN' });

    const newHash = await hashPin(newPinStr);
    await authPool.query(
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
