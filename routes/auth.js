'use strict';

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { pool, superPool } = require('../db');
const { JWT_SECRET, hashPin, verifyPin } = require('../lib/auth_utils');
// Phase 6-D-6.5 / Section 121 — TOTP 2FA helper.
const totpLib = require('../lib/totp');
const { audit, ACTIONS } = require('../lib/audit');
const { evaluateSessionCaps } = require('../lib/session_policy');
// Phase 6-D-1a (Section 100, May 14, 2026): cookie-based session for web.
// See lib/cookie_options.js for the policy. Mobile still uses Bearer.
const {
  accessTokenCookieOptions,
  refreshTokenCookieOptions,
  clearCookieOptions,
  isEphemeralSessionRole,
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

// §133: `sessionStartedAt` lets a rotated token carry the ORIGINAL login time
// forward (for the absolute cap). Pass null on a fresh login → the column
// DEFAULT NOW() takes over; pass the prior token's value on /refresh.
async function saveRefreshToken(userId, refreshToken, req, sessionStartedAt = null) {
  const tokenHash = hashRefreshToken(refreshToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);
  const userAgent = (req.headers['user-agent'] || '').substring(0, 500);
  const ip = req.ip || req.connection?.remoteAddress || null;

  await pool.query(
    `INSERT INTO public.refresh_tokens
       (user_id, token_hash, expires_at, user_agent, ip_address,
        session_started_at, last_activity_at)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6, NOW()), NOW())`,
    [userId, tokenHash, expiresAt, userAgent, ip, sessionStartedAt]
  );
}

function buildTokenPayload(user, role, mustChangePin, opts = {}) {
  // Section 121 (Phase 6-D-6.5): explicit totp_verified flag. Required on
  // the JWT for any user where totpLib.totpRequiredForUser() returns true.
  // For non-TOTP users this stays false and the middleware ignores it.
  return {
    user_id: String(user.id),
    username: user.username,
    employee_id: user.employee_id ? String(user.employee_id) : null,
    company_id: user.company_id ? String(user.company_id) : null,
    role,
    // §147 trade-scoping: the user's specialty (from their employee profile).
    // Drives backend filtering of project demand/coverage/pickers for
    // trade-level roles; company-level roles ignore it (see tradeScopeFor).
    trade_code: user.trade_code || null,
    must_change_pin: mustChangePin || false,
    totp_verified: opts.totpVerified === true,
  };
}

// Section 121: short-lived "pending TOTP" token issued between step 1 (PIN)
// and step 2 (6-digit code). Carries enough info to identify the user and
// reach the secret on the verify endpoint, but cannot authenticate to any
// /api/super or /api/* route on its own (kind='totp-pending').
const TOTP_PENDING_EXPIRES = '5m';
function signTotpPendingToken(user, role, mode /* 'setup' | 'verify' */) {
  return jwt.sign(
    {
      kind: 'totp-pending',
      user_id: String(user.id),
      username: user.username,
      role,
      mode,
    },
    JWT_SECRET,
    { expiresIn: TOTP_PENDING_EXPIRES }
  );
}

// Phase 6-D-1b (Section 101, May 14, 2026): inline JWT-using handlers
// (/whoami, /change-pin, /logout-all) bypass middleware/auth.js and need
// their own cookie fallback. Bearer header beats cookie when both arrive,
// mirroring middleware/auth.js's policy so mobile builds can't be
// silently downgraded.
function extractToken(req) {
  const authHeader = req.headers.authorization || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const cookieToken =
    req.cookies && typeof req.cookies.access_token === 'string' ? req.cookies.access_token : null;
  return bearerToken || cookieToken;
}

// Phase 6-D-1c (Section 102, May 14, 2026): web clients opt-in to the
// cookie-only response shape via the X-Auth-Channel: cookie header. When
// set, /login and /refresh omit `token` and `refresh_token` from the JSON
// body — the auth state travels via HttpOnly cookies (set unconditionally,
// see Section 100). Mobile (no header) keeps receiving body tokens for
// the Bearer-header flow.
//
// Why a request header rather than User-Agent sniffing: explicit, easy
// to mock in tests, and immune to UA-string drift across Expo / WebView
// updates. The security gain isn't about attacker resistance (the cookie
// is HttpOnly + SameSite=Lax either way) — it's about not echoing the
// JWT in a place where it could be inadvertently logged or cached.
function isWebClient(req) {
  const channel = req.headers['x-auth-channel'];
  return typeof channel === 'string' && channel.toLowerCase() === 'cookie';
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
              au.totp_secret_encrypted, au.totp_iv, au.totp_auth_tag, au.totp_enabled_at,
              ep.full_name, ep.trade_code,
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

    // ── Section 121 (Phase 6-D-6.5) — TOTP 2FA branching ──────────────────
    //
    // After PIN succeeds, decide whether to issue a normal JWT or a
    // pending-TOTP token. Two TOTP states:
    //
    //   - setup   → user is required to enroll, totp_enabled_at IS NULL.
    //               We generate a fresh secret (NOT persisted yet) and
    //               return the otpauth URI + base64 PNG QR. The frontend
    //               renders the wizard; the user submits POST /auth/totp/
    //               confirm-setup with the pending token + first 6-digit
    //               code, and only then do we persist totp_secret_encrypted.
    //
    //   - verify  → user already enrolled, must provide today's 6-digit
    //               code via POST /auth/totp/verify with the pending token.
    //
    // For users where TOTP is NOT required (everything except SUPER_ADMIN
    // when TOTP_ENFORCE !== 'true'), we fall through to the normal flow.
    if (totpLib.totpRequiredForUser({ role })) {
      const setupRequired = !user.totp_enabled_at;
      const pendingToken = signTotpPendingToken(user, role, setupRequired ? 'setup' : 'verify');
      if (setupRequired) {
        // Generate a NEW secret for this enrollment attempt. It is NOT
        // persisted until the user proves they can read codes from it.
        // We embed it in an HMAC envelope inside the pending token so the
        // confirm-setup endpoint doesn't need a side channel.
        const secret = totpLib.generateSecret();
        const label = user.email || user.username;
        const uri = totpLib.buildOtpauthUri({ secret, label });
        const qrCodeDataUrl = await totpLib.buildQrCodeDataUrl(uri);
        // Sign the secret inside a SEPARATE short-lived token so the client
        // round-trips it back to us on confirm-setup. The pending token
        // signs the user identity; the setup token signs the candidate
        // secret. Both expire in 5 minutes.
        const setupToken = jwt.sign(
          { kind: 'totp-setup-secret', user_id: String(user.id), secret },
          JWT_SECRET,
          { expiresIn: '5m' }
        );
        return res.status(200).json({
          ok: false,
          error: 'TOTP_SETUP_REQUIRED',
          totp_pending_token: pendingToken,
          totp_setup_token: setupToken,
          totp_secret_base32: secret,
          totp_otpauth_uri: uri,
          totp_qr_code_data_url: qrCodeDataUrl,
          issuer: process.env.TOTP_ISSUER || 'Constrai Admin',
          label,
        });
      }
      // Setup is complete; just need today's code.
      return res.status(200).json({
        ok: false,
        error: 'TOTP_REQUIRED',
        totp_pending_token: pendingToken,
      });
    }

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
    // Section 133: SUPER_ADMIN gets session cookies (no maxAge) so closing
    // the browser ends the session and forces login+TOTP on next visit.
    const ephemeral = isEphemeralSessionRole(role);
    res.cookie('access_token', accessToken, accessTokenCookieOptions(req, { ephemeral }));
    res.cookie('refresh_token', refreshToken, refreshTokenCookieOptions(req, { ephemeral }));

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

    // Phase 6-D-1c: web clients (X-Auth-Channel: cookie) get the cookies
    // only; the body omits `token` + `refresh_token`. Mobile (no header)
    // keeps the legacy body-tokens shape for the Bearer flow.
    const responseBody = {
      ok: true,
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
        trade_code: user.trade_code || null,
        must_change_pin: mustChangePin,
      },
    };
    if (!isWebClient(req)) {
      responseBody.token = accessToken;
      responseBody.refresh_token = refreshToken;
    }
    return res.json(responseBody);
  } catch (err) {
    console.error('LOGIN ERROR:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// =============================================================================
// TOTP 2FA — confirm setup + verify (Phase 6-D-6.5 / Section 121)
// =============================================================================
//
// Both endpoints are called AFTER a successful PIN login that returned a
// TOTP_SETUP_REQUIRED or TOTP_REQUIRED response. They consume the short-
// lived pending JWT to identify the user, validate the 6-digit code, then
// issue a fully-authenticated access+refresh pair with totp_verified=true.

function verifyPendingToken(token, expectedMode) {
  if (!token) return { ok: false, error: 'MISSING_TOTP_PENDING_TOKEN' };
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.kind !== 'totp-pending') {
      return { ok: false, error: 'INVALID_TOTP_PENDING_TOKEN' };
    }
    if (expectedMode && payload.mode !== expectedMode) {
      return { ok: false, error: 'INVALID_TOTP_PENDING_TOKEN' };
    }
    return { ok: true, payload };
  } catch (_err) {
    return { ok: false, error: 'EXPIRED_TOTP_PENDING_TOKEN' };
  }
}

async function loadUserById(userId) {
  const { rows } = await authPool.query(
    `SELECT id, username, email, employee_id, company_id, role,
            is_active, must_change_pin,
            totp_secret_encrypted, totp_iv, totp_auth_tag, totp_enabled_at
       FROM public.app_users WHERE id = $1 LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

async function finishLoginAfterTotp(req, res, user, role) {
  const mustChangePin = user.must_change_pin === true;
  const payload = buildTokenPayload(user, role, mustChangePin, { totpVerified: true });
  const accessToken = signAccessToken(payload);
  const refreshToken = generateRefreshToken();
  await saveRefreshToken(user.id, refreshToken, req);
  await audit(pool, req, {
    action: ACTIONS.LOGIN_SUCCESS,
    entity_type: 'user',
    entity_id: user.id,
    entity_name: user.username,
    details: { role, totp_verified: true },
  });
  // Section 133: SUPER_ADMIN → session cookies (ephemeral). This is the
  // path SUPER_ADMIN actually takes (TOTP is enforced), so it's the one
  // that matters most for the 2FA-on-every-session guarantee.
  const ephemeral = isEphemeralSessionRole(role);
  res.cookie('access_token', accessToken, accessTokenCookieOptions(req, { ephemeral }));
  res.cookie('refresh_token', refreshToken, refreshTokenCookieOptions(req, { ephemeral }));
  return res.status(200).json({
    ok: true,
    token: accessToken,
    refresh_token: refreshToken,
    user: {
      id: user.id,
      username: user.username,
      role,
      trade_code: user.trade_code || null,
      must_change_pin: mustChangePin,
    },
  });
}

router.post('/totp/confirm-setup', async (req, res) => {
  try {
    const { totp_pending_token, totp_setup_token, code } = req.body || {};
    if (!code || !totp_setup_token) {
      return res.status(400).json({ ok: false, error: 'MISSING_FIELDS' });
    }
    const pendingCheck = verifyPendingToken(totp_pending_token, 'setup');
    if (!pendingCheck.ok) {
      return res.status(401).json({ ok: false, error: pendingCheck.error });
    }
    let setupPayload;
    try {
      setupPayload = jwt.verify(totp_setup_token, JWT_SECRET);
    } catch (_err) {
      return res.status(401).json({ ok: false, error: 'EXPIRED_TOTP_SETUP_TOKEN' });
    }
    if (setupPayload.kind !== 'totp-setup-secret') {
      return res.status(401).json({ ok: false, error: 'INVALID_TOTP_SETUP_TOKEN' });
    }
    if (String(setupPayload.user_id) !== String(pendingCheck.payload.user_id)) {
      return res.status(401).json({ ok: false, error: 'TOKEN_MISMATCH' });
    }
    if (!totpLib.verifyCode(code, setupPayload.secret)) {
      return res.status(400).json({ ok: false, error: 'INVALID_TOTP_CODE' });
    }
    const user = await loadUserById(pendingCheck.payload.user_id);
    if (!user) return res.status(404).json({ ok: false, error: 'USER_NOT_FOUND' });
    const role = String(user.role || '').toUpperCase();

    // Persist the encrypted secret + mark enrollment complete.
    //
    // MUST use authPool (superPool / BYPASSRLS): app_users is under strict
    // RLS (migration 013) and /api/auth/* runs BEFORE any tenantDb middleware
    // sets app.company_id, so a write through the regular `pool` matches ZERO
    // rows and silently no-ops — the user appears to enroll (JWT issued) but
    // totp_enabled_at stays NULL, so every later login re-shows the setup QR.
    // This mirrors the change-pin handler's pre-tenant app_users UPDATE.
    const { encrypted, iv, authTag } = totpLib.encryptSecret(setupPayload.secret);
    const upd = await authPool.query(
      `UPDATE public.app_users
          SET totp_secret_encrypted = $1,
              totp_iv = $2,
              totp_auth_tag = $3,
              totp_enabled_at = NOW()
        WHERE id = $4`,
      [encrypted, iv, authTag, user.id]
    );
    // Guard: never report success on a 0-row write. If RLS or a bad id ever
    // filters the UPDATE again, fail loudly instead of issuing a token for an
    // enrollment that didn't persist.
    if (upd.rowCount !== 1) {
      console.error(
        `POST /auth/totp/confirm-setup: UPDATE affected ${upd.rowCount} rows for user id=${user.id}`
      );
      return res.status(500).json({ ok: false, error: 'TOTP_ENROLLMENT_NOT_PERSISTED' });
    }
    return await finishLoginAfterTotp(req, res, user, role);
  } catch (err) {
    console.error('POST /auth/totp/confirm-setup error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

router.post('/totp/verify', async (req, res) => {
  try {
    const { totp_pending_token, code } = req.body || {};
    if (!code) return res.status(400).json({ ok: false, error: 'MISSING_FIELDS' });
    const pendingCheck = verifyPendingToken(totp_pending_token, 'verify');
    if (!pendingCheck.ok) {
      return res.status(401).json({ ok: false, error: pendingCheck.error });
    }
    const user = await loadUserById(pendingCheck.payload.user_id);
    if (!user || !user.totp_enabled_at) {
      return res.status(404).json({ ok: false, error: 'USER_NOT_FOUND' });
    }
    const role = String(user.role || '').toUpperCase();
    const secret = totpLib.decryptSecret({
      encrypted: user.totp_secret_encrypted,
      iv: user.totp_iv,
      authTag: user.totp_auth_tag,
    });
    if (!totpLib.verifyCode(code, secret)) {
      await audit(pool, req, {
        action: ACTIONS.LOGIN_FAILED,
        entity_type: 'user',
        entity_id: user.id,
        entity_name: user.username,
        details: { reason: 'INVALID_TOTP_CODE' },
      });
      return res.status(400).json({ ok: false, error: 'INVALID_TOTP_CODE' });
    }
    return await finishLoginAfterTotp(req, res, user, role);
  } catch (err) {
    console.error('POST /auth/totp/verify error:', err);
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
              rt.session_started_at, rt.last_activity_at,
              au.username, au.employee_id, au.company_id, au.role, au.is_active, au.must_change_pin,
              ep.full_name, ep.trade_code
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

    // §133: server-side idle + absolute session caps for high-privilege roles.
    // Enforced HERE so a SUPER_ADMIN session cannot be extended by tampering
    // with client JS. last_activity_at is bumped by the admin guard on real
    // requests (not by /refresh), so an active admin is never falsely timed
    // out. Tenant roles are unaffected (isEphemeralSessionRole excludes them).
    const sessionRole = record.role ? String(record.role).toUpperCase() : null;
    if (isEphemeralSessionRole(sessionRole)) {
      const verdict = evaluateSessionCaps({
        lastActivityAt: record.last_activity_at,
        sessionStartedAt: record.session_started_at,
      });
      if (!verdict.ok) {
        // End the whole session — revoke every token for this user.
        await pool.query('UPDATE public.refresh_tokens SET revoked = TRUE WHERE user_id = $1', [
          record.user_id,
        ]);
        return res.status(401).json({
          ok: false,
          error:
            verdict.reason === 'ABSOLUTE' ? 'SESSION_ABSOLUTE_TIMEOUT' : 'SESSION_IDLE_TIMEOUT',
        });
      }
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

    // §133: carry the ORIGINAL session start forward so the absolute cap is
    // measured from the real login, not reset on every rotation.
    await saveRefreshToken(record.user_id, newRefreshToken, req, record.session_started_at);

    // Section 100 / Phase 6-D-1a: rotate the cookie pair alongside the
    // body tokens so web clients on the cookie path stay authenticated
    // after rotation. Same additive policy as /login.
    // Section 133: keep the rotated SUPER_ADMIN cookies ephemeral too —
    // a mid-session refresh must NOT silently upgrade them to persistent
    // (that would re-open the browser-close gap).
    const ephemeral = isEphemeralSessionRole(role);
    res.cookie('access_token', newAccessToken, accessTokenCookieOptions(req, { ephemeral }));
    res.cookie('refresh_token', newRefreshToken, refreshTokenCookieOptions(req, { ephemeral }));

    // Phase 6-D-1c: same web-vs-mobile body shape as /login.
    const responseBody = {
      ok: true,
      user: {
        user_id: record.user_id,
        username: record.username,
        name: record.full_name || record.username,
        employee_id: record.employee_id,
        company_id: record.company_id,
        role,
        must_change_pin: mustChangePin,
      },
    };
    if (!isWebClient(req)) {
      responseBody.token = newAccessToken;
      responseBody.refresh_token = newRefreshToken;
    }
    return res.json(responseBody);
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
  // Phase 6-D-1b: accept JWT from Bearer header OR access_token cookie.
  const token = extractToken(req);

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
  // Phase 6-D-1b: accept JWT from Bearer header OR access_token cookie.
  // Critical for cross-subdomain hop: after redirect from app.constrai.ca
  // to acm.constrai.ca, the frontend has no localStorage at the new
  // origin and must rely on the Domain=.constrai.ca cookie to identify
  // the user on first paint.
  const token = extractToken(req);
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
  // Phase 6-D-1b: accept JWT from Bearer header OR access_token cookie.
  const token = extractToken(req);
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
