// app.js — Section 19 Phase 11b extraction.
//
// Express app setup, factored out of index.js so Supertest can drive the
// app in tests without binding to a port and without scheduling the
// production cron jobs (weeklyReportJob, ccqRatesReminderJob).
//
// Production entry remains `index.js`, which:
//   1. require('./app')
//   2. app.listen(...)
//   3. schedules jobs
//
// Tests do `const app = require('../../app')` and pipe Supertest
// requests directly into it. No listen, no jobs.

'use strict';

require('dotenv').config();
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const app = express();

// --- Trust the first reverse proxy (Nginx) ---
// Required so req.ip and rate-limit key generation use the real client IP
// from X-Forwarded-For instead of Nginx's loopback address.
app.set('trust proxy', 1);

// --- Security headers ---
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", 'https://api.mapbox.com'],
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://fonts.googleapis.com',
          'https://api.mapbox.com',
        ],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        connectSrc: ["'self'", 'https://api.mapbox.com', 'https://events.mapbox.com'],
        objectSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:', 'https://api.mapbox.com'],
        workerSrc: ["'self'", 'blob:'],
      },
    },
  })
);

// --- Body parsing ---
app.use(express.json());

// --- Rate limiting ---
// Skip rate limiting under Jest (NODE_ENV=test). Tests issue many auth
// requests in a tight loop from the same supertest IP; the production
// auth limit of 20/15min would cause 429s and false-positive failures.
// All other environments (dev, staging, prod) keep the limits intact.
const skipInTests = () => process.env.NODE_ENV === 'test';

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTests,
  message: {
    ok: false,
    error: 'TOO_MANY_REQUESTS',
    message: 'Too many attempts, please try again later.',
  },
});

// Refresh endpoint — moderate limit to prevent token brute-force
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTests,
  message: { ok: false, error: 'TOO_MANY_REQUESTS' },
});

// PIN change — strict (prevents stolen-token PIN reset abuse)
const changePinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTests,
  message: { ok: false, error: 'TOO_MANY_REQUESTS' },
});

// Public onboarding / activation — strict (prevents invite-token brute-force)
const onboardingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTests,
  message: { ok: false, error: 'TOO_MANY_REQUESTS' },
});

// SUPER_ADMIN endpoints — moderate (defense in depth even though SA is auth-gated)
const superAdminLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTests,
  message: { ok: false, error: 'TOO_MANY_REQUESTS' },
});

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/signup', authLimiter);
app.use('/api/auth/refresh', refreshLimiter);
app.use('/api/auth/change-pin', changePinLimiter);
app.use('/api/onboarding', onboardingLimiter);
app.use('/activate', onboardingLimiter);
app.use('/api/super', superAdminLimiter);

function loadRouter(modPath) {
  const mod = require(modPath);
  if (typeof mod === 'function') return mod;
  if (mod && typeof mod.router === 'function') return mod.router;
  if (mod && typeof mod.default === 'function') return mod.default;
  throw new Error(`Route module "${modPath}" did not export an Express router function.`);
}

const auth = require('./middleware/auth');
const superAdmin = require('./middleware/super_admin');
// Section 89-B (Phase 4 Stage 2): per-request tenant DB context. Mount AFTER
// auth so req.user.company_id is populated. Routes that opt in by querying
// req.db (instead of pool) get RLS-enforced reads/writes for free. Routes
// that still use pool.query() rely on the permissive policies from Stage 1
// (migration 012) until they're migrated. See DECISIONS.md Section 89.
const tenantDb = require('./middleware/tenant_db');
if (typeof auth !== 'function') {
  throw new Error(`"./middleware/auth" must export a middleware function, got ${typeof auth}`);
}

// ── Public endpoints ──────────────────────────────────────────

app.get('/api/geocode/suggest', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const token = process.env.MAPBOX_ACCESS_TOKEN;
    if (!q || q.length < 3) return res.json({ ok: true, features: [] });
    if (!token) return res.json({ ok: false, error: 'MAPBOX_NOT_CONFIGURED' });

    const url =
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json` +
      `?access_token=${encodeURIComponent(token)}&country=ca&language=en&types=address&limit=5`;

    const r = await fetch(url);
    const data = await r.json();
    return res.json({ ok: true, features: data.features || [] });
  } catch (err) {
    console.error('geocode/suggest error:', err.message);
    return res.status(500).json({ ok: false, error: 'GEOCODE_ERROR' });
  }
});

app.get('/api/config', (req, res) => {
  return res.json({
    ok: true,
    mapbox_token: process.env.MAPBOX_ACCESS_TOKEN || null,
  });
});

// /api-docs — interactive Swagger UI for the OpenAPI spec, generated
// from the @openapi JSDoc blocks scattered across this file + routes/.
// Public (no auth) so frontend devs / partners can self-serve. Phase 71
// (May 2026, Section 22 hardening). See lib/openapi.js for the base
// definition; per-route schemas are added incrementally in Phase 71b.
{
  const swaggerUi = require('swagger-ui-express');
  const { spec } = require('./lib/openapi');
  app.get('/api-docs.json', (req, res) => res.json(spec));
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(spec, { explorer: true }));
}

/**
 * @openapi
 * /api/health:
 *   get:
 *     tags: [Health]
 *     summary: Liveness probe
 *     description: |
 *       Cheap liveness probe — no I/O, no DB. Polled by UptimeRobot every
 *       5 minutes. Always returns 200 if the Node process is responsive.
 *     security: []
 *     responses:
 *       200:
 *         description: Process is responsive.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:      { type: boolean, example: true }
 *                 service: { type: string, example: mep-site-workforce }
 *                 time:    { type: string, format: date-time }
 */
app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'mep-site-workforce', time: new Date().toISOString() });
});

/**
 * @openapi
 * /api/health/deep:
 *   get:
 *     tags: [Health]
 *     summary: Readiness probe with structured checks
 *     description: |
 *       Phase 66 readiness probe. Returns DB connectivity, disk space, and
 *       last-backup-age status. Returns 503 if any hard-fail check trips
 *       (DB or disk); 200 otherwise. Soft warnings (stale backup) surface
 *       in the response body via a `warnings` array but do NOT trip 503.
 *     security: []
 *     responses:
 *       200:
 *         description: All hard-fail checks passed; soft warnings may be present.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:       { type: boolean, example: true }
 *                 service:  { type: string }
 *                 time:     { type: string, format: date-time }
 *                 checks:
 *                   type: object
 *                   properties:
 *                     db:     { type: object }
 *                     disk:   { type: object }
 *                     backup: { type: object }
 *                 warnings:
 *                   type: array
 *                   items: { type: string }
 *       503:
 *         description: One or more hard-fail checks tripped (DB or disk).
 */
// /api/health/deep — Phase 66 readiness probe. Runs structured checks
// (DB connectivity, disk space, last backup age) and returns 503 when a
// hard-fail check trips. UptimeRobot continues polling the cheap
// /api/health endpoint above; this deeper variant is intended for ops
// dashboards and ad-hoc inspection. See lib/health.js for check details.
app.get('/api/health/deep', async (req, res) => {
  try {
    const { pool } = require('./db');
    const { runChecks } = require('./lib/health');
    const { statusCode, body } = await runChecks(pool);
    res.status(statusCode).json(body);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Auth (public) ─────────────────────────────────────────────
app.use('/api/auth', loadRouter('./routes/auth'));
app.use('/api/onboarding', require('./routes/onboarding')); // public — no auth
app.use('/activate', loadRouter('./routes/activate')); // public — activation link

// ── Super admin ───────────────────────────────────────────────
app.use('/api/super', auth, superAdmin, loadRouter('./routes/super_admin'));
app.use('/api/super/ccq-rates', auth, superAdmin, require('./routes/ccq_rates'));

// ── Core business routes ──────────────────────────────────────
app.use('/api/employees', auth, loadRouter('./routes/employees'));
// Section 89-C/8: projects migrated to req.db (RLS-enforced).
app.use('/api/projects', auth, tenantDb, loadRouter('./routes/projects'));
// Section 89-B sample migration: /api/suppliers was the first production
// route to consume req.db (RLS-enforced). Section 89-C/1 (May 7, 2026)
// extends this to /api/bi, /api/project-trades, /api/project-foremen.
// Other routes still use pool.query + permissive RLS until they migrate
// in subsequent 89-C batches.
app.use('/api/suppliers', auth, tenantDb, require('./routes/suppliers'));
app.use('/api/assignments', auth, loadRouter('./routes/assignments'));
// Section 89-C/4: auto_assign migrated to req.db (RLS-enforced).
// NOTE: assignments.js (mounted directly above) still uses pool.query —
// it'll be migrated in a separate batch since it has 30 queries + complex
// transactional logic. Express resolves these two routers in mount order:
// requests matching assignments.js endpoints fire first; auto_assign only
// sees requests for paths assignments.js doesn't define (/auto-suggest,
// /auto-confirm). Adding tenantDb here only affects auto_assign's path set.
app.use('/api/assignments', auth, tenantDb, require('./routes/auto_assign'));
// Section 89-C/2: attendance migrated to req.db (RLS-enforced).
app.use('/api/attendance', auth, tenantDb, loadRouter('./routes/attendance'));
app.use('/api/profile', auth, loadRouter('./routes/profile'));
app.use('/api/profile', auth, require('./routes/push_tokens_route'));

// ── Project structure ─────────────────────────────────────────
// Section 89-C/1: project_trades + project_foremen migrated to req.db.
app.use('/api/project-trades', auth, tenantDb, require('./routes/project_trades'));
app.use('/api/project-foremen', auth, tenantDb, require('./routes/project_foremen'));

// ── Materials & Purchase Orders ───────────────────────────────
// NOTE (2026-04-26): routes/materials.js (the "v1" daily-ticket workflow)
// is no longer mounted — verified zero frontend/mobile usage. The active
// flow is routes/material_requests.js (the merge-and-send-PO workflow).
// File kept on disk for one sprint as a safety net; delete after no
// incidents.
app.use('/api/materials', auth, require('./routes/material_requests'));

// ── Business Intelligence ─────────────────────────────────────
// Section 89-C/1: bi route migrated to req.db.
app.use('/api/bi', auth, tenantDb, require('./routes/bi'));
// Section 89-C/3: reports migrated to req.db (RLS-enforced).
app.use('/api/reports', auth, tenantDb, loadRouter('./routes/reports'));

// ── Daily operations ──────────────────────────────────────────
// Section 89-C/9: daily_dispatch migrated to req.db (RLS-enforced).
app.use('/api/daily-dispatch', auth, tenantDb, loadRouter('./routes/daily_dispatch'));

// ── User & invite management ──────────────────────────────────
app.use('/api/invite-employee', auth, require('./routes/invite_employee'));

// Phase 63 (May 2026) — /api/user-invites/generate was redundant with
// /api/invite-employee + /api/users/:id/resend (audit confirmed no
// frontend usage). Route file deleted. See DECISIONS.md Phase 63.
app.use('/api/admin/users', auth, loadRouter('./routes/admin_users'));

// ── RBAC Permissions ──────────────────────────────────────────
// Section 89-C/5: user_management migrated to req.db (RLS-enforced).
app.use('/api/users', auth, tenantDb, require('./routes/user_management'));
app.use('/api/permissions', auth, require('./routes/permissions'));

// ── Hub (Tasks & Blueprints) ──────────────────────────────────
// Section 89-C/6: hub migrated to req.db (RLS-enforced).
app.use('/api/hub', auth, tenantDb, require('./routes/hub'));

// ── Daily Standup ─────────────────────────────────────────────
// Section 89-C/7: standup migrated to req.db (RLS-enforced).
app.use('/api/standup', auth, tenantDb, require('./routes/standup'));
app.use('/uploads/hub', require('express').static(path.join(__dirname, 'uploads/hub')));

// ── Sentry error handler ──────────────────────────────────────
// Phase 64 (May 2026). Must be registered AFTER all routes so it sees
// every uncaught exception bubbling up. Inside Jest (NODE_ENV=test),
// instrument.js skips Sentry.init(), making this a no-op — but we
// still register the handler unconditionally so prod and dev have
// matching middleware stacks.
const Sentry = require('@sentry/node');
Sentry.setupExpressErrorHandler(app);

module.exports = app;
