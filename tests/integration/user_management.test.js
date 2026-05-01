// Phase 24 — User management list test.
//
// /api/users (mounted from routes/user_management.js) returns the
// company's app_users joined with their employee + profile +
// trade-type info. Permission-gated by settings.user_management.

const request = require('supertest');
const app = require('../../app');
const {
  describeIfDb,
  closePool,
  seedCompany,
  seedUser,
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
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const target = await seedUser({ company_id: company.company_id, role: 'WORKER' });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .post(`/api/users/${target.id}/resend`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(500);
    expect(res.body).toMatchObject({ ok: false, error: 'EMAIL_NOT_CONFIGURED' });
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
