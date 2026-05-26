// app.js — Express app setup with vhost split (Section 90 / Piece 90-B).
//
// Phase 11b refactor (2026-04-28): the Express app setup moved here from
// index.js so tests can drive the app via Supertest without binding to a
// port and without scheduling production cron jobs.
//
// Phase 90-B refactor (2026-05-09): the app is now a vhost root that
// dispatches by Host header into two physically separate sub-apps:
//
//   - adminApp  → admin.constrai.ca → mounts /api/super + /api/super/ccq-rates
//                 + the shared public routes (health, auth, etc.)
//   - tenantApp → app.constrai.ca   → mounts every other /api/* route
//                 + the same shared public routes
//
// A request that comes in on the wrong Host hits the sub-app's anti-leak
// 404 (admin Host with /api/employees → 404; tenant Host with /api/super
// → 404). This is "C2" from Section 90 — physical separation rather than
// linguistic role guards.
//
// Default fallback: tenantApp. Existing tests (~41 files) use
// `request(app)` without setting a Host header; those flow through the
// fallback and continue to work for tenant routes. The 4 test files that
// hit /api/super now use the helper `tests/helpers/admin_request.js`,
// which sets Host: admin.constrai.ca explicitly so they reach adminApp.
// This matches production behavior end-to-end.
//
// Production entry remains `index.js`, which:
//   1. require('./app')
//   2. app.listen(...)
//   3. schedules jobs

'use strict';

require('dotenv').config();
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
// Phase 6-D-1a (Section 100, May 14, 2026): cookie-parser enables the
// auth middleware to read the access_token cookie as a fallback when no
// Authorization: Bearer header is present (web uses cookies, mobile
// keeps Bearer). Mounted at root so both sub-apps see parsed req.cookies.
const cookieParser = require('cookie-parser');

// =============================================================================
// vhost middleware — inline (no npm dep). Dispatches by Host header.
// =============================================================================
//
// Section 90 / Decision C2: physical separation of admin vs tenant route
// trees by Host header. We don't use the `vhost` npm package because (a)
// we need only exact-match dispatch (no regex/wildcards), (b) inlining
// keeps the dependency graph flat, (c) the implementation is 5 lines.
//
// Pitfall to remember: if a wildcard host (e.g., '*.constrai.ca') is ever
// added later, register the more specific exact-match vhost FIRST.
// First-match-wins.
function vhost(targetHost, app) {
  const want = targetHost.toLowerCase();
  return (req, res, next) => {
    const host = (req.hostname || (req.headers.host || '').split(':')[0] || '').toLowerCase();
    if (host === want) return app(req, res, next);
    return next();
  };
}

// =============================================================================
// Shared loader for routers that may be exported as fn / { router } / default
// =============================================================================
function loadRouter(modPath) {
  const mod = require(modPath);
  if (typeof mod === 'function') return mod;
  if (mod && typeof mod.router === 'function') return mod.router;
  if (mod && typeof mod.default === 'function') return mod.default;
  throw new Error(`Route module "${modPath}" did not export an Express router function.`);
}

// =============================================================================
// Rate limiters — defined once, mounted at root (apply across both sub-apps).
// Skip under Jest so dense test loops don't trip 429s.
// =============================================================================
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

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTests,
  message: { ok: false, error: 'TOO_MANY_REQUESTS' },
});

const changePinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTests,
  message: { ok: false, error: 'TOO_MANY_REQUESTS' },
});

const onboardingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTests,
  message: { ok: false, error: 'TOO_MANY_REQUESTS' },
});

const superAdminLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTests,
  message: { ok: false, error: 'TOO_MANY_REQUESTS' },
});

// =============================================================================
// Middleware imports for the route mounts
// =============================================================================
const auth = require('./middleware/auth');
const superAdmin = require('./middleware/super_admin');
const tenantDb = require('./middleware/tenant_db');
if (typeof auth !== 'function') {
  throw new Error(`"./middleware/auth" must export a middleware function, got ${typeof auth}`);
}

// =============================================================================
// Public routes — mounted on BOTH adminApp and tenantApp.
//
// Why both: SUPER_ADMIN logs in on admin.constrai.ca, but might also want
// to test as a tenant in another tab on app.constrai.ca. Both portals
// expose /api/auth/login + the public health / config / docs endpoints.
// =============================================================================
function mountPublicRoutes(app) {
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
   */
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

  // /api-docs — Swagger UI. Public so frontend devs / partners can self-serve.
  // Phase 71 (May 2026, Section 22 hardening). See lib/openapi.js for the base
  // definition; per-route schemas are added incrementally in Phase 71b.
  {
    const swaggerUi = require('swagger-ui-express');
    const { spec } = require('./lib/openapi');
    app.get('/api-docs.json', (req, res) => res.json(spec));
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(spec, { explorer: true }));
  }

  // Auth + onboarding + activation links — public on both portals.
  app.use('/api/auth', loadRouter('./routes/auth'));
  app.use('/api/onboarding', require('./routes/onboarding'));
  app.use('/activate', loadRouter('./routes/activate'));

  // Phase 6-B — public tenant branding lookup (`GET /api/companies/:code/branding`).
  // Mounted on BOTH portals so the login screen can theme itself from either
  // host. Uses superPool internally (companies is RLS-strict) — see the file
  // header in routes/public_branding.js for the design notes.
  app.use('/api/companies', require('./routes/public_branding'));
}

// =============================================================================
// Admin routes — mounted ONLY on adminApp (admin.constrai.ca).
// Section 89-C/15: SUPER_ADMIN routes consume req.db (BYPASSRLS via superPool).
// =============================================================================
function mountAdminRoutes(app) {
  app.use('/api/super', auth, superAdmin, tenantDb, loadRouter('./routes/super_admin'));
  app.use('/api/super/ccq-rates', auth, superAdmin, tenantDb, require('./routes/ccq_rates'));
  // Section 112 / Phase 6-D-3: tenant logo + brand_color upload endpoint.
  // Multer + sharp + DO Spaces. SUPER_ADMIN-only by the auth+superAdmin
  // chain. Same `/api/super` prefix; the router exposes its own
  // `/companies/:id/branding` path.
  app.use('/api/super', auth, superAdmin, tenantDb, require('./routes/super_admin_branding'));
  // Section 117.4 / Phase 6-D-4 PR 4: SUPER_ADMIN applies a subscription
  // change (seat / cancel / plan) and triggers Resend confirmation email.
  // The router exposes its own /subscriptions/:id/apply-change path.
  app.use('/api/super', auth, superAdmin, tenantDb, require('./routes/super_subscription_apply'));
  // Section 115.4 + 115.8 / Phase 6-D-4 PR 5: SUPER_ADMIN training quote
  // creation + send. Sequential CONS-YYYY-NNNN invoice numbering.
  app.use('/api/super', auth, superAdmin, tenantDb, require('./routes/super_training_quotes'));
  // Section 115.5 / Phase 6-D-4 PR 5: SUPER_ADMIN custom-demand quotes
  // (custom integrations, custom reports, white-label work).
  app.use('/api/super', auth, superAdmin, tenantDb, require('./routes/super_custom_demands'));
  // Section 116.5 / Phase 6-D-4 PR 5: SUPER_ADMIN manual payment recording
  // (bank transfer, cheque, cash). Stripe-driven payments land in Phase 9-B.
  app.use('/api/super', auth, superAdmin, tenantDb, require('./routes/super_payments'));
  // Phase 6-D-4 PR 5: subscription lifecycle ops (extend-trial today; future
  // pause / resume / hard-cancel follow the same pattern).
  app.use(
    '/api/super',
    auth,
    superAdmin,
    tenantDb,
    require('./routes/super_subscription_lifecycle')
  );
}

// =============================================================================
// Tenant routes — mounted ONLY on tenantApp (app.constrai.ca).
// =============================================================================
function mountTenantRoutes(app) {
  // ── Core business routes ────────────────────────────────────
  // Section 89-C/12: employees migrated to req.db (RLS-enforced).
  app.use('/api/employees', auth, tenantDb, loadRouter('./routes/employees'));
  // Section 89-C/8: projects migrated to req.db (RLS-enforced).
  app.use('/api/projects', auth, tenantDb, loadRouter('./routes/projects'));
  // Section 89-B sample migration: /api/suppliers was the first production
  // route to consume req.db (RLS-enforced).
  app.use('/api/suppliers', auth, tenantDb, require('./routes/suppliers'));
  // Section 89-C/11: assignments migrated to req.db (RLS-enforced).
  app.use('/api/assignments', auth, tenantDb, loadRouter('./routes/assignments'));
  // Section 89-C/4: auto_assign migrated to req.db (RLS-enforced).
  // NOTE: assignments.js (mounted directly above) and auto_assign coexist
  // on /api/assignments. Express resolves these in mount order: requests
  // matching assignments.js endpoints fire first; auto_assign sees only
  // /auto-suggest, /auto-confirm, etc.
  app.use('/api/assignments', auth, tenantDb, require('./routes/auto_assign'));
  // Section 89-C/2: attendance migrated to req.db (RLS-enforced).
  app.use('/api/attendance', auth, tenantDb, loadRouter('./routes/attendance'));
  // Section 89-C/13: profile + push_tokens migrated to req.db (RLS-enforced).
  app.use('/api/profile', auth, tenantDb, loadRouter('./routes/profile'));
  app.use('/api/profile', auth, tenantDb, require('./routes/push_tokens_route'));

  // ── Project structure ───────────────────────────────────────
  // Section 89-C/1: project_trades + project_foremen migrated to req.db.
  app.use('/api/project-trades', auth, tenantDb, require('./routes/project_trades'));
  app.use('/api/project-foremen', auth, tenantDb, require('./routes/project_foremen'));

  // ── Materials & Purchase Orders ─────────────────────────────
  // Section 89-C/10: material_requests migrated to req.db (RLS-enforced).
  app.use('/api/materials', auth, tenantDb, require('./routes/material_requests'));

  // ── Expense claims (Section 94.5 starter) ───────────────────
  // Emergency-purchase claims submitted by workers, approved by admin.
  // Mounted on the tenant sub-app only — admin portal has no expense
  // claim view (cross-tenant claim aggregation is out of scope; if a
  // future SUPER_ADMIN audit view is needed, mount a read-only copy
  // on adminApp at /api/super/expense-claims).
  app.use('/api/expense-claims', auth, tenantDb, require('./routes/expense_claims'));

  // ── Business Intelligence ───────────────────────────────────
  // Section 89-C/1: bi route migrated to req.db.
  app.use('/api/bi', auth, tenantDb, require('./routes/bi'));
  // Section 89-C/3: reports migrated to req.db (RLS-enforced).
  app.use('/api/reports', auth, tenantDb, loadRouter('./routes/reports'));

  // ── Daily operations ────────────────────────────────────────
  // Section 89-C/9: daily_dispatch migrated to req.db (RLS-enforced).
  app.use('/api/daily-dispatch', auth, tenantDb, loadRouter('./routes/daily_dispatch'));

  // ── User & invite management ────────────────────────────────
  // Section 89-C/14: invite_employee migrated to req.db (RLS-enforced).
  app.use('/api/invite-employee', auth, tenantDb, require('./routes/invite_employee'));
  // Section 89-C/14: admin_users migrated to req.db (RLS-enforced).
  app.use('/api/admin/users', auth, tenantDb, loadRouter('./routes/admin_users'));
  // Section 117.4 / Phase 6-D-4 PR 4: subscription change request endpoints
  // (seat-request / cancel-request / plan-upgrade-request). Tenant
  // COMPANY_ADMIN submits → audit_logs row #1 → mailto suggestion returned.
  // SUPER_ADMIN later applies via /api/super/subscriptions/:id/apply-change
  // (mounted on adminApp via mountAdminRoutes).
  app.use(
    '/api/admin/subscription',
    auth,
    tenantDb,
    require('./routes/admin_subscription_requests')
  );

  // ── RBAC Permissions ────────────────────────────────────────
  // Section 89-C/5: user_management migrated to req.db (RLS-enforced).
  app.use('/api/users', auth, tenantDb, require('./routes/user_management'));
  // Section 89-C/11: permissions migrated to req.db.
  app.use('/api/permissions', auth, tenantDb, require('./routes/permissions'));

  // ── Hub (Tasks & Blueprints) ────────────────────────────────
  // Section 89-C/6: hub migrated to req.db (RLS-enforced).
  app.use('/api/hub', auth, tenantDb, require('./routes/hub'));

  // ── Daily Standup ───────────────────────────────────────────
  // Section 89-C/7: standup migrated to req.db (RLS-enforced).
  app.use('/api/standup', auth, tenantDb, require('./routes/standup'));
  app.use('/uploads/hub', express.static(path.join(__dirname, 'uploads/hub')));
}

// =============================================================================
// Anti-leak 404 — used as a tail catch-all on each sub-app to prevent any
// route-tree leak across portals.
// =============================================================================
function notFoundOnPath(message) {
  return (req, res) => {
    res.status(404).json({ ok: false, error: 'NOT_FOUND', message });
  };
}

// =============================================================================
// Build the vhost root + the two sub-apps.
// =============================================================================
const root = express();

// Trust the first reverse proxy (Nginx).
// Required so req.ip and rate-limit key generation use the real client IP
// from X-Forwarded-For instead of Nginx's loopback address.
root.set('trust proxy', 1);

// Security headers (CSP) — applied at root before vhost dispatch.
root.use(
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

root.use(express.json());
// Cookie parsing — applied at root before vhost dispatch so every route
// (auth, middleware/auth, etc.) sees req.cookies populated. No signed
// cookies in this app yet; if introduced later, pass a secret here.
root.use(cookieParser());

// Rate limiters at root level — they fire BEFORE vhost dispatch so the
// IP-based limit applies regardless of which Host the request targeted.
root.use('/api/auth/login', authLimiter);
root.use('/api/auth/signup', authLimiter);
root.use('/api/auth/refresh', refreshLimiter);
root.use('/api/auth/change-pin', changePinLimiter);
root.use('/api/onboarding', onboardingLimiter);
root.use('/activate', onboardingLimiter);
root.use('/api/super', superAdminLimiter);

// ── Admin sub-app (admin.constrai.ca) ───────────────────────────
const adminApp = express();
mountPublicRoutes(adminApp);
mountAdminRoutes(adminApp);
// Anti-leak: any /api/* path NOT defined above (i.e., a tenant route accidentally
// requested via the admin Host) falls through to a 404 instead of 404'ing via
// Express's default handler — explicit JSON so callers see the failure clearly.
adminApp.use('/api', notFoundOnPath('Endpoint not available on the admin portal'));

// ── Tenant sub-app (app.constrai.ca) ────────────────────────────
const tenantApp = express();
mountPublicRoutes(tenantApp);
// Anti-leak: /api/super/* on the tenant Host returns 404. Registered BEFORE
// the tenant routes so it matches first for /api/super/*.
tenantApp.use('/api/super', notFoundOnPath('Endpoint not available on the tenant portal'));
mountTenantRoutes(tenantApp);

// ── Wire vhost dispatch ─────────────────────────────────────────
root.use(vhost('admin.constrai.ca', adminApp));
root.use(vhost('app.constrai.ca', tenantApp));

// ── Default fallback ────────────────────────────────────────────
// Tests using `request(app)` without setting Host, plus direct-IP requests
// (UptimeRobot polls /api/health/deep on the Droplet IP), fall through to
// tenantApp. /api/super on default Host hits tenantApp's anti-leak guard
// → 404. This means an attacker bypassing Cloudflare and hitting the IP
// directly cannot reach admin routes.
//
// All ~41 existing test files using `request(app)` continue to work
// unchanged for tenant routes. The 4 SA test files use the helper at
// `tests/helpers/admin_request.js` to set Host: admin.constrai.ca
// explicitly so they reach adminApp.
root.use(tenantApp);

// =============================================================================
// Sentry error handler — registered on root LAST so it sees uncaught errors
// bubbling up from either sub-app. Inside Jest (NODE_ENV=test),
// instrument.js skips Sentry.init(), making this a no-op.
// =============================================================================
const Sentry = require('@sentry/node');
Sentry.setupExpressErrorHandler(root);

module.exports = root;
