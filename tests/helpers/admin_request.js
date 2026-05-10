// tests/helpers/admin_request.js
//
// Section 90 / Piece 90-B: vhost split. The admin portal lives on
// admin.constrai.ca; routes mounted on adminApp are unreachable on the
// tenant Host (app.constrai.ca) and on the default-fallback Host that
// supertest uses by default. Tests that hit /api/super/* must set
// Host: admin.constrai.ca explicitly so the request reaches adminApp.
//
// This helper wraps supertest and sets the Host header automatically:
//
//   const { adminRequest } = require('../helpers/admin_request');
//   const res = await adminRequest(app)
//     .get('/api/super/stats')
//     .set('Authorization', `Bearer ${token}`);
//
// Public routes (login, health, etc.) work on either sub-app, so for
// `/api/auth/login` you can keep using `request(app).post(...)` as
// before — no need for adminRequest there.

'use strict';

const request = require('supertest');

const ADMIN_HOST = 'admin.constrai.ca';
const TENANT_HOST = 'app.constrai.ca';

/**
 * Returns a supertest-like object that auto-sets `Host: admin.constrai.ca`
 * on every request. Same surface as `request(app)`.
 */
function adminRequest(app) {
  const r = request(app);
  return {
    get: (p) => r.get(p).set('Host', ADMIN_HOST),
    post: (p) => r.post(p).set('Host', ADMIN_HOST),
    put: (p) => r.put(p).set('Host', ADMIN_HOST),
    patch: (p) => r.patch(p).set('Host', ADMIN_HOST),
    delete: (p) => r.delete(p).set('Host', ADMIN_HOST),
    head: (p) => r.head(p).set('Host', ADMIN_HOST),
  };
}

/**
 * Returns a supertest-like object that auto-sets `Host: app.constrai.ca`.
 * Used by vhost_isolation tests to verify the tenant Host explicitly.
 * Most tenant tests don't need this — the default fallback already routes
 * them through tenantApp.
 */
function tenantRequest(app) {
  const r = request(app);
  return {
    get: (p) => r.get(p).set('Host', TENANT_HOST),
    post: (p) => r.post(p).set('Host', TENANT_HOST),
    put: (p) => r.put(p).set('Host', TENANT_HOST),
    patch: (p) => r.patch(p).set('Host', TENANT_HOST),
    delete: (p) => r.delete(p).set('Host', TENANT_HOST),
    head: (p) => r.head(p).set('Host', TENANT_HOST),
  };
}

module.exports = { adminRequest, tenantRequest, ADMIN_HOST, TENANT_HOST };
