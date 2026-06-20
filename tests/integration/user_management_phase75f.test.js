// tests/integration/user_management_phase75f.test.js — Phase 75f
// (May 2026, Section 40 routes coverage push, batch 6 — extension past 75e
// to push toward 60% lines).
//
// Targets routes/user_management.js (4 endpoints, 268 LOC). 14 tests across
// 4 describe blocks:
//   - GET   /                    (1 — 200 list)
//   - PATCH /:id/role            (6 — INVALID_ROLE/USER_NOT_FOUND/CROSS_COMPANY/
//                                     INSUFFICIENT_PRIVILEGE/CANNOT_ASSIGN_HIGHER/200)
//   - PATCH /:id/status          (5 — USER_NOT_FOUND/CROSS_COMPANY/SELF/
//                                     INSUFFICIENT_PRIVILEGE/200)
//   - POST  /:id/resend          (2 — EMAIL_NOT_CONFIGURED/USER_NOT_FOUND)
//
// All gated by `describeIfDb`. Section 40 stretch — get coverage close to
// 60% lines before final closeout.

'use strict';

const request = require('supertest');
const app = require('../../app');
const {
  describeIfDb,
  closePool,
  seedCompany,
  seedUser,
  seedEmployee,
  seedEmployeeProfile,
  cleanupTestRows,
} = require('../helpers/db');

async function loginUser(user, pin) {
  const usePin = pin || user.pin || '1234';
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, pin: usePin });
  if (res.statusCode !== 200) {
    throw new Error(`Login failed in test setup: ${res.statusCode} ${JSON.stringify(res.body)}`);
  }
  return res.body;
}

async function seedAdmin(companyId) {
  const emp = await seedEmployee({ company_id: companyId });
  await seedEmployeeProfile({ employee_id: emp.id });
  const admin = await seedUser({
    company_id: companyId,
    employee_id: emp.id,
    role: 'COMPANY_ADMIN',
  });
  return admin;
}

async function seedTargetUser(companyId, role = 'WORKER') {
  const emp = await seedEmployee({ company_id: companyId });
  await seedEmployeeProfile({ employee_id: emp.id });
  return seedUser({
    company_id: companyId,
    employee_id: emp.id,
    role,
  });
}

// ──────────────────────────────────────────────────────────────────
describeIfDb('GET /api/users', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('200 returns company users (admin sees themselves + targets)', async () => {
    const company = await seedCompany();
    const admin = await seedAdmin(company.company_id);
    await seedTargetUser(company.company_id, 'WORKER');
    const { token } = await loginUser(admin);

    const res = await request(app).get('/api/users').set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.users)).toBe(true);
    expect(res.body.users.length).toBeGreaterThanOrEqual(2);
  });
});

// ──────────────────────────────────────────────────────────────────
describeIfDb('PATCH /api/users/:id/role', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  // §148.18: role validation is data-driven now — FOREMAN (and every Phase-4
  // role) is a valid catalog role, so assigning it SUCCEEDS (was a hardcoded
  // ALLOWED_ROLES reject). A genuinely unknown role still 400s.
  test('200 — a non-legacy catalog role (FOREMAN) is now assignable (§148.18)', async () => {
    const company = await seedCompany();
    const admin = await seedAdmin(company.company_id);
    const target = await seedTargetUser(company.company_id, 'WORKER');
    const { token } = await loginUser(admin);

    const res = await request(app)
      .patch(`/api/users/${target.id}/role`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'FOREMAN' });

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ ok: true });
  });

  test('400 INVALID_ROLE for a role not in the catalog', async () => {
    const company = await seedCompany();
    const admin = await seedAdmin(company.company_id);
    const target = await seedTargetUser(company.company_id, 'WORKER');
    const { token } = await loginUser(admin);

    const res = await request(app)
      .patch(`/api/users/${target.id}/role`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'NOT_A_REAL_ROLE' });

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ ok: false, error: 'INVALID_ROLE' });
  });

  test('404 USER_NOT_FOUND for non-existent target', async () => {
    const company = await seedCompany();
    const admin = await seedAdmin(company.company_id);
    const { token } = await loginUser(admin);

    const res = await request(app)
      .patch('/api/users/9999999/role')
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'WORKER' });

    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({ ok: false, error: 'USER_NOT_FOUND' });
  });

  test('403 CROSS_COMPANY when target belongs to a different company', async () => {
    const companyA = await seedCompany();
    const companyB = await seedCompany();
    const admin = await seedAdmin(companyA.company_id);
    const targetInOtherCo = await seedTargetUser(companyB.company_id, 'WORKER');
    const { token } = await loginUser(admin);

    const res = await request(app)
      .patch(`/api/users/${targetInOtherCo.id}/role`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'WORKER' });

    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ ok: false, error: 'CROSS_COMPANY' });
  });

  test('403 INSUFFICIENT_PRIVILEGE when caller and target are equal rank', async () => {
    const company = await seedCompany();
    const admin = await seedAdmin(company.company_id);
    // Both COMPANY_ADMIN (rank 2) — caller cannot modify equal-rank user
    const peerAdmin = await seedTargetUser(company.company_id, 'COMPANY_ADMIN');
    const { token } = await loginUser(admin);

    const res = await request(app)
      .patch(`/api/users/${peerAdmin.id}/role`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'WORKER' });

    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ ok: false, error: 'INSUFFICIENT_PRIVILEGE' });
  });

  test('403 CANNOT_ASSIGN_HIGHER_ROLE when new role outranks caller', async () => {
    const company = await seedCompany();
    const admin = await seedAdmin(company.company_id); // rank 2
    const target = await seedTargetUser(company.company_id, 'TRADE_ADMIN'); // rank 4 (lower)
    const { token } = await loginUser(admin);

    // Try to promote target to IT_ADMIN (rank 1) — caller (rank 2) cannot
    const res = await request(app)
      .patch(`/api/users/${target.id}/role`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'IT_ADMIN' });

    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ ok: false, error: 'CANNOT_ASSIGN_HIGHER_ROLE' });
  });

  test('200 happy path — admin (rank 2) changes WORKER role to TRADE_ADMIN', async () => {
    const company = await seedCompany();
    const admin = await seedAdmin(company.company_id);
    const target = await seedTargetUser(company.company_id, 'WORKER');
    const { token } = await loginUser(admin);

    const res = await request(app)
      .patch(`/api/users/${target.id}/role`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'TRADE_ADMIN' });

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.message).toMatch(/TRADE_ADMIN/);
  });
});

// ──────────────────────────────────────────────────────────────────
describeIfDb('PATCH /api/users/:id/status', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('404 USER_NOT_FOUND for non-existent target', async () => {
    const company = await seedCompany();
    const admin = await seedAdmin(company.company_id);
    const { token } = await loginUser(admin);

    const res = await request(app)
      .patch('/api/users/9999999/status')
      .set('Authorization', `Bearer ${token}`)
      .send({ is_active: false });

    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({ ok: false, error: 'USER_NOT_FOUND' });
  });

  test('403 CROSS_COMPANY when target belongs to a different company', async () => {
    const companyA = await seedCompany();
    const companyB = await seedCompany();
    const admin = await seedAdmin(companyA.company_id);
    const targetInOtherCo = await seedTargetUser(companyB.company_id, 'WORKER');
    const { token } = await loginUser(admin);

    const res = await request(app)
      .patch(`/api/users/${targetInOtherCo.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ is_active: false });

    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ ok: false, error: 'CROSS_COMPANY' });
  });

  test('400 CANNOT_DEACTIVATE_SELF when admin targets themselves', async () => {
    const company = await seedCompany();
    const admin = await seedAdmin(company.company_id);
    const { token } = await loginUser(admin);

    const res = await request(app)
      .patch(`/api/users/${admin.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ is_active: false });

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ ok: false, error: 'CANNOT_DEACTIVATE_SELF' });
  });

  test('403 INSUFFICIENT_PRIVILEGE when caller and target are equal rank', async () => {
    const company = await seedCompany();
    const admin = await seedAdmin(company.company_id);
    const peerAdmin = await seedTargetUser(company.company_id, 'COMPANY_ADMIN');
    const { token } = await loginUser(admin);

    const res = await request(app)
      .patch(`/api/users/${peerAdmin.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ is_active: false });

    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ ok: false, error: 'INSUFFICIENT_PRIVILEGE' });
  });

  test('200 happy path — admin deactivates a WORKER', async () => {
    const company = await seedCompany();
    const admin = await seedAdmin(company.company_id);
    const target = await seedTargetUser(company.company_id, 'WORKER');
    const { token } = await loginUser(admin);

    const res = await request(app)
      .patch(`/api/users/${target.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ is_active: false });

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.message).toMatch(/deactivated/i);
  });
});

// ──────────────────────────────────────────────────────────────────
describeIfDb('POST /api/users/:id/resend', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  // The resend route reads SENDGRID_API_KEY/FROM/APP_BASE_URL via mustEnv().
  // CI doesn't set them, so the EMAIL_NOT_CONFIGURED branch is the natural
  // first-fail. We snapshot+restore around any test that depends on the
  // env state to keep the suite hermetic.

  test('500 EMAIL_NOT_CONFIGURED when SENDGRID_API_KEY env is unset', async () => {
    const company = await seedCompany();
    const admin = await seedAdmin(company.company_id);
    const target = await seedTargetUser(company.company_id, 'WORKER');
    const { token } = await loginUser(admin);

    const orig = {
      SENDGRID_API_KEY: process.env.SENDGRID_API_KEY,
      SENDGRID_FROM_EMAIL: process.env.SENDGRID_FROM_EMAIL,
      APP_BASE_URL: process.env.APP_BASE_URL,
    };
    delete process.env.SENDGRID_API_KEY;
    delete process.env.SENDGRID_FROM_EMAIL;
    delete process.env.APP_BASE_URL;

    try {
      const res = await request(app)
        .post(`/api/users/${target.id}/resend`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(500);
      expect(res.body).toMatchObject({ ok: false, error: 'EMAIL_NOT_CONFIGURED' });
    } finally {
      if (orig.SENDGRID_API_KEY !== undefined) process.env.SENDGRID_API_KEY = orig.SENDGRID_API_KEY;
      if (orig.SENDGRID_FROM_EMAIL !== undefined)
        process.env.SENDGRID_FROM_EMAIL = orig.SENDGRID_FROM_EMAIL;
      if (orig.APP_BASE_URL !== undefined) process.env.APP_BASE_URL = orig.APP_BASE_URL;
    }
  });

  test('404 USER_NOT_FOUND for non-existent target (with env set so we pass the env guard)', async () => {
    const company = await seedCompany();
    const admin = await seedAdmin(company.company_id);
    const { token } = await loginUser(admin);

    // Force env to non-empty values so the EMAIL_NOT_CONFIGURED guard
    // does NOT short-circuit; the route then reaches the user lookup
    // and returns 404 for the bogus id.
    const orig = {
      SENDGRID_API_KEY: process.env.SENDGRID_API_KEY,
      SENDGRID_FROM_EMAIL: process.env.SENDGRID_FROM_EMAIL,
      APP_BASE_URL: process.env.APP_BASE_URL,
    };
    process.env.SENDGRID_API_KEY = 'SG.test_dummy_key';
    process.env.SENDGRID_FROM_EMAIL = 'noreply@constrai.test';
    process.env.APP_BASE_URL = 'https://app.constrai.test';

    try {
      const res = await request(app)
        .post('/api/users/9999999/resend')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(404);
      expect(res.body).toMatchObject({ ok: false, error: 'USER_NOT_FOUND' });
    } finally {
      if (orig.SENDGRID_API_KEY === undefined) delete process.env.SENDGRID_API_KEY;
      else process.env.SENDGRID_API_KEY = orig.SENDGRID_API_KEY;
      if (orig.SENDGRID_FROM_EMAIL === undefined) delete process.env.SENDGRID_FROM_EMAIL;
      else process.env.SENDGRID_FROM_EMAIL = orig.SENDGRID_FROM_EMAIL;
      if (orig.APP_BASE_URL === undefined) delete process.env.APP_BASE_URL;
      else process.env.APP_BASE_URL = orig.APP_BASE_URL;
    }
  });
});
