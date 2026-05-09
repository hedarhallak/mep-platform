// tests/integration/vhost_isolation.test.js
//
// Section 90 / Piece 90-B: vhost split (decision C2).
//
// Verifies physical separation of admin vs tenant routes by Host header:
//   - admin.constrai.ca (adminApp) mounts /api/super and /api/super/ccq-rates;
//     any other /api/* path returns 404.
//   - app.constrai.ca (tenantApp) mounts every other /api/* route;
//     /api/super/* returns 404.
//   - Public routes (/api/health, /api/auth/login, etc.) work on BOTH.
//
// These tests don't require a DB — they exercise routing only. They run
// without `describeIfDb` so they execute in every CI run.

'use strict';

const request = require('supertest');
const app = require('../../app');
const { adminRequest, tenantRequest } = require('../helpers/admin_request');

describe('Section 90 / 90-B — vhost split: physical route separation', () => {
  // ── Public routes are reachable on both portals ───────────────

  test('admin.constrai.ca + /api/health → 200 (public on adminApp)', async () => {
    const res = await adminRequest(app).get('/api/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('app.constrai.ca + /api/health → 200 (public on tenantApp)', async () => {
    const res = await tenantRequest(app).get('/api/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('default Host (no Host set) + /api/health → 200 (default fallback to tenantApp)', async () => {
    const res = await request(app).get('/api/health');
    expect(res.statusCode).toBe(200);
  });

  // ── /api/super/* on tenant Host is blocked ────────────────────

  test('app.constrai.ca + /api/super/stats → 404 NOT_FOUND (anti-leak guard)', async () => {
    const res = await tenantRequest(app).get('/api/super/stats');
    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({
      ok: false,
      error: 'NOT_FOUND',
      message: expect.stringMatching(/tenant portal/i),
    });
  });

  test('app.constrai.ca + /api/super/companies → 404 NOT_FOUND (anti-leak guard)', async () => {
    const res = await tenantRequest(app).get('/api/super/companies');
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  test('app.constrai.ca + /api/super/ccq-rates → 404 NOT_FOUND (anti-leak guard)', async () => {
    const res = await tenantRequest(app).get('/api/super/ccq-rates');
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  test('default Host + /api/super/stats → 404 NOT_FOUND (default fallback is tenantApp)', async () => {
    // CRITICAL: this proves a direct-IP attacker bypassing Cloudflare
    // cannot reach admin routes via the default fallback.
    const res = await request(app).get('/api/super/stats');
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  // ── Tenant routes on admin Host are blocked ───────────────────

  test('admin.constrai.ca + /api/employees → 404 NOT_FOUND (admin portal does not mount tenant routes)', async () => {
    const res = await adminRequest(app).get('/api/employees');
    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({
      ok: false,
      error: 'NOT_FOUND',
      message: expect.stringMatching(/admin portal/i),
    });
  });

  test('admin.constrai.ca + /api/projects → 404 NOT_FOUND', async () => {
    const res = await adminRequest(app).get('/api/projects');
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  test('admin.constrai.ca + /api/hub → 404 NOT_FOUND', async () => {
    const res = await adminRequest(app).get('/api/hub');
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  // ── Admin routes on admin Host route through (auth fires, not 404) ─

  test('admin.constrai.ca + /api/super/stats without token → 401 (route exists, auth required)', async () => {
    // The handler is registered on adminApp, so it doesn't 404. The auth
    // middleware fires and rejects the missing/invalid token. The exact
    // status (401 vs 403) depends on middleware/auth.js, but it must NOT
    // be 404 — that would mean the route isn't mounted on adminApp.
    const res = await adminRequest(app).get('/api/super/stats');
    expect(res.statusCode).not.toBe(404);
    expect([401, 403]).toContain(res.statusCode);
  });

  test('admin.constrai.ca + /api/super/ccq-rates without token → 401 (route exists, auth required)', async () => {
    const res = await adminRequest(app).get('/api/super/ccq-rates');
    expect(res.statusCode).not.toBe(404);
    expect([401, 403]).toContain(res.statusCode);
  });

  // ── Host header case-insensitivity (sanity check) ────────────────

  test('Host: ADMIN.CONSTRAI.CA (uppercase) routes to adminApp (case-insensitive)', async () => {
    const res = await request(app).get('/api/super/stats').set('Host', 'ADMIN.CONSTRAI.CA');
    // If case-insensitive matching works, this lands on adminApp and the
    // auth middleware rejects (401/403). If not, it falls through to the
    // tenantApp default fallback and hits the anti-leak 404.
    expect(res.statusCode).not.toBe(404);
  });

  // ── Unknown Host falls through to tenantApp ──────────────────────

  test('Host: random-host.example + /api/super/stats → 404 (default fallback is tenantApp)', async () => {
    const res = await request(app).get('/api/super/stats').set('Host', 'random-host.example');
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });
});
