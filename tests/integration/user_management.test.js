// Phase 24 — User management list test.
//
// /api/users (mounted from routes/user_management.js) returns the
// company's app_users joined with their employee + profile +
// trade-type info. Permission-gated by settings.user_management.
//
// Phase 55 added env-gate tests for POST /:id/resend (still pinned
// against missing SendGrid env). Phase 61 (May 2026) adds the happy
// path now that public.user_invites exists (Phase 59 migration). The
// happy-path test mocks @sendgrid/mail at the top so sgMail.send
// becomes a no-op; the existing env-gate test still works because
// its describe block doesn't set the SENDGRID env vars.

jest.mock('@sendgrid/mail', () => ({
  setApiKey: jest.fn(),
  send: jest.fn().mockResolvedValue([{ statusCode: 202, headers: {} }, {}]),
}));

const request = require('supertest');
const app = require('../../app');
const {
  describeIfDb,
  closePool,
  seedCompany,
  seedUser,
  cleanupTestRows,
  getPool,
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

describeIfDb('User management — GET /api/users', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test("Company A admin sees only A's users (tenant-scoped)", async () => {
    const companyA = await seedCompany();
    const companyB = await seedCompany();
    const adminA = await seedUser({ company_id: companyA.company_id, role: 'COMPANY_ADMIN' });
    const workerA = await seedUser({ company_id: companyA.company_id, role: 'WORKER' });
    const workerB = await seedUser({ company_id: companyB.company_id, role: 'WORKER' });

    const { token } = await loginUser(adminA);

    const res = await request(app).get('/api/users').set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.users)).toBe(true);

    const ids = res.body.users.map((u) => Number(u.id));
    expect(ids).toEqual(expect.arrayContaining([adminA.id, workerA.id]));
    expect(ids).not.toContain(workerB.id);
  });

  test('GET /api/users without settings.user_management returns 403', async () => {
    const company = await seedCompany();
    const worker = await seedUser({ company_id: company.company_id, role: 'WORKER' });
    const { token } = await loginUser(worker);

    const res = await request(app).get('/api/users').set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(403);
    expect(res.body.permission).toBe('settings.user_management');
  });
});

describeIfDb('User management — PATCH /:id/role + /:id/status', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('PATCH /api/users/:id/status flips is_active (200)', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const target = await seedUser({
      company_id: company.company_id,
      role: 'WORKER',
      is_active: true,
    });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .patch(`/api/users/${target.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ is_active: false });

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('PATCH /api/users/:id/status without settings.user_management returns 403', async () => {
    const company = await seedCompany();
    const worker = await seedUser({ company_id: company.company_id, role: 'WORKER' });
    const { token } = await loginUser(worker);

    const res = await request(app)
      .patch(`/api/users/${worker.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ is_active: false });

    expect(res.statusCode).toBe(403);
    expect(res.body.permission).toBe('settings.user_management');
  });
});

// Phase 55 — POST /api/users/:id/resend env-gate + RBAC.
//
// /resend regenerates an activation invite, writes to public.user_invites
// (Bug 6 — table missing), and emails via SendGrid. In CI we have neither
// SendGrid env nor user_invites — but the env-gate runs FIRST, so the
// route returns 500 EMAIL_NOT_CONFIGURED before touching the missing
// table. Pinning that env-gate ordering is the safest coverage we can
// add today; once Bug 6 is fixed and SendGrid is configured, the test
// can be promoted to a full happy-path.
describeIfDb('User management — POST /:id/resend', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('POST /:id/resend without SendGrid env returns 500 EMAIL_NOT_CONFIGURED', async () => {
    // Same env-pinning pattern as daily_dispatch.test.js POST /commit.
    // The route checks SENDGRID_API_KEY / SENDGRID_FROM_EMAIL / APP_BASE_URL
    // BEFORE looking up the user, so locally-set env vars caused this test
    // to flap (404 instead of 500) across Sections 65-78. Pin the env
    // explicitly so the result is deterministic.
    const origKey = process.env.SENDGRID_API_KEY;
    const origFrom = process.env.SENDGRID_FROM_EMAIL;
    const origBase = process.env.APP_BASE_URL;
    delete process.env.SENDGRID_API_KEY;
    delete process.env.SENDGRID_FROM_EMAIL;
    delete process.env.APP_BASE_URL;
    try {
      const company = await seedCompany();
      const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
      const target = await seedUser({ company_id: company.company_id, role: 'WORKER' });
      const { token } = await loginUser(admin);

      const res = await request(app)
        .post(`/api/users/${target.id}/resend`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(500);
      expect(res.body).toMatchObject({ ok: false, error: 'EMAIL_NOT_CONFIGURED' });
    } finally {
      if (origKey !== undefined) process.env.SENDGRID_API_KEY = origKey;
      if (origFrom !== undefined) process.env.SENDGRID_FROM_EMAIL = origFrom;
      if (origBase !== undefined) process.env.APP_BASE_URL = origBase;
    }
  });

  test('POST /:id/resend without settings.user_management returns 403', async () => {
    const company = await seedCompany();
    const worker = await seedUser({ company_id: company.company_id, role: 'WORKER' });
    const target = await seedUser({ company_id: company.company_id, role: 'WORKER' });
    const { token } = await loginUser(worker);

    const res = await request(app)
      .post(`/api/users/${target.id}/resend`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(403);
    expect(res.body.permission).toBe('settings.user_management');
  });
});

// Phase 61 — POST /:id/resend happy path (Bug 6 partially unblocked).
//
// Now that public.user_invites exists (Phase 59), and SendGrid is mocked
// at the top of this file, the previously 500-or-403 endpoint can run
// end-to-end. We set the SENDGRID env in beforeAll and restore in
// afterAll so this describe block doesn't bleed into the env-gate
// tests above (which intentionally rely on missing env).
describeIfDb('User management — POST /:id/resend (happy path)', () => {
  const originalEnv = {
    SENDGRID_API_KEY: process.env.SENDGRID_API_KEY,
    SENDGRID_FROM_EMAIL: process.env.SENDGRID_FROM_EMAIL,
    APP_BASE_URL: process.env.APP_BASE_URL,
  };

  beforeAll(() => {
    process.env.SENDGRID_API_KEY = 'SG.test-key-not-real';
    process.env.SENDGRID_FROM_EMAIL = 'noreply@test.constrai.ca';
    process.env.APP_BASE_URL = 'http://localhost:3000';
  });

  afterAll(async () => {
    for (const [k, v] of Object.entries(originalEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    await cleanupTestRows();
    await closePool();
  });

  test('POST /:id/resend on un-activated user revokes old invites + creates a fresh ACTIVE one', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const { token } = await loginUser(admin);

    // Create a target user with email + activated_at = NULL. seedUser
    // doesn't set email by default, so we patch it directly. activated_at
    // defaults to NULL on insert, which is what /resend requires.
    const targetEmail = `test_phase61_resend_${Date.now()}@constrai.ca`;
    const target = await seedUser({ company_id: company.company_id, role: 'WORKER' });
    const pool = getPool();
    await pool.query(`UPDATE public.app_users SET email = $1 WHERE id = $2`, [
      targetEmail,
      target.id,
    ]);

    const res = await request(app)
      .post(`/api/users/${target.id}/resend`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);

    // Verify a fresh ACTIVE invite was written.
    const { rows } = await pool.query(
      `SELECT status FROM public.user_invites
         WHERE company_id = $1 AND lower(email) = lower($2) AND status = 'ACTIVE'`,
      [company.company_id, targetEmail]
    );
    expect(rows.length).toBe(1);
  });

  test('POST /:id/resend on already-activated user returns 400 ALREADY_ACTIVATED', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const { token } = await loginUser(admin);

    const target = await seedUser({ company_id: company.company_id, role: 'WORKER' });
    const pool = getPool();
    await pool.query(`UPDATE public.app_users SET email = $1, activated_at = NOW() WHERE id = $2`, [
      `test_phase61_already_${Date.now()}@constrai.ca`,
      target.id,
    ]);

    const res = await request(app)
      .post(`/api/users/${target.id}/resend`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ ok: false, error: 'ALREADY_ACTIVATED' });
  });

  test('POST /:id/resend on user from a different company returns 403 CROSS_COMPANY', async () => {
    const companyA = await seedCompany();
    const companyB = await seedCompany();
    const adminA = await seedUser({ company_id: companyA.company_id, role: 'COMPANY_ADMIN' });
    const targetB = await seedUser({ company_id: companyB.company_id, role: 'WORKER' });
    const pool = getPool();
    await pool.query(`UPDATE public.app_users SET email = $1 WHERE id = $2`, [
      `test_phase61_cross_${Date.now()}@constrai.ca`,
      targetB.id,
    ]);

    const { token } = await loginUser(adminA);

    const res = await request(app)
      .post(`/api/users/${targetB.id}/resend`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ ok: false, error: 'CROSS_COMPANY' });
  });
});
