// Phase 61 (May 2026) — admin_users.js happy-path coverage.
//
// /api/admin/users creates an app_user + an active user_invite row +
// emails the activation link via SendGrid. Was BLOCKED throughout
// Section 19 because (a) public.user_invites didn't exist (Bug 6) and
// (b) SendGrid env vars aren't set in CI. Phase 59 added the table;
// this file mocks SendGrid + sets the env vars in beforeAll so the
// happy path can finally be tested.
//
// The mock approach: jest.mock('@sendgrid/mail', ...) is hoisted to
// the top of THIS test file by Jest. `routes/admin_users.js` is
// loaded via `require('../app')` later — by then the mock is in place,
// so `sgMail.send(...)` resolves to a no-op without making a real HTTP
// call. Other test files don't hoist this mock, so they still see the
// real module. We also restore the env vars in afterAll so the
// EMAIL_NOT_CONFIGURED tests in daily_dispatch.test.js +
// user_management.test.js (env-gate cases) keep passing.

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

describeIfDb('Admin users — POST /api/admin/users', () => {
  // Save originals so we can restore in afterAll (other tests rely on these
  // being unset to assert EMAIL_NOT_CONFIGURED — see daily_dispatch.test.js
  // POST /commit and user_management.test.js POST /:id/resend env-gate).
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
    // Restore env (delete if originally undefined, otherwise reset).
    for (const [k, v] of Object.entries(originalEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    await cleanupTestRows();
    await closePool();
  });

  test('POST /api/admin/users as COMPANY_ADMIN creates app_user + active user_invite (201)', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: `test_phase61_${Date.now()}@constrai.ca`,
        role: 'TRADE_ADMIN',
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.role).toBe('TRADE_ADMIN');
    expect(res.body.user.is_active).toBe(true);
    expect(res.body.invite_id).toBeDefined();
    expect(res.body.activation_link).toMatch(/\/activate\?token=/);

    // Verify the user_invites row was actually written + active.
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT status, role, sent_at FROM public.user_invites WHERE id = $1`,
      [res.body.invite_id]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('ACTIVE');
    expect(rows[0].role).toBe('TRADE_ADMIN');
    expect(rows[0].sent_at).not.toBeNull(); // route updates sent_at after sgMail.send resolves
  });

  test('POST /api/admin/users without settings.user_management returns 403', async () => {
    const company = await seedCompany();
    const worker = await seedUser({ company_id: company.company_id, role: 'WORKER' });
    const { token } = await loginUser(worker);

    const res = await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: 'should-not-create@constrai.ca',
        role: 'TRADE_ADMIN',
      });

    expect(res.statusCode).toBe(403);
    expect(res.body.permission).toBe('settings.user_management');
  });

  test('COMPANY_ADMIN cannot create another COMPANY_ADMIN — INSUFFICIENT_PRIVILEGE 403', async () => {
    // Role-rank: COMPANY_ADMIN has rank 2, target COMPANY_ADMIN also rank 2.
    // The route requires callerRank STRICTLY LESS than targetRank — equal
    // ranks are blocked. This prevents a COMPANY_ADMIN from cloning their
    // own privilege level (which would be a privilege escalation vector
    // if the new user added themselves to a different company later).
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: `test_phase61_clone_${Date.now()}@constrai.ca`,
        role: 'COMPANY_ADMIN',
      });

    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ ok: false, error: 'INSUFFICIENT_PRIVILEGE' });
  });

  test('POST /api/admin/users with invalid role returns 400 INVALID_ROLE', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: 'test_phase61_invalid@constrai.ca',
        role: 'NONSENSE_ROLE',
      });

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ ok: false, error: 'INVALID_ROLE' });
    expect(Array.isArray(res.body.allowed)).toBe(true);
  });

  test('POST /api/admin/users with duplicate email returns 409 USER_EMAIL_EXISTS', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const { token } = await loginUser(admin);

    const email = `test_phase61_dup_${Date.now()}@constrai.ca`;

    // First call succeeds.
    const first = await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ email, role: 'TRADE_ADMIN' });
    expect(first.statusCode).toBe(201);

    // Second call with same email + same company → 409.
    const second = await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ email, role: 'TRADE_ADMIN' });

    expect(second.statusCode).toBe(409);
    expect(second.body).toMatchObject({ ok: false, error: 'USER_EMAIL_EXISTS' });
    expect(second.body.user).toBeDefined();
  });
});
