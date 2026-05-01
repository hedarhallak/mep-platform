// Phase 27 — Daily dispatch preview tests.
//
// /api/daily-dispatch/preview returns the dispatch summary for a given
// date. Auth-gated, no RBAC. Handler short-circuits to 400 if the
// caller has no company_id (e.g. SUPER_ADMIN without a company).

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

describeIfDb('Daily dispatch — /api/daily-dispatch/preview', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('GET /api/daily-dispatch/preview as COMPANY_ADMIN returns 200', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .get('/api/daily-dispatch/preview')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('GET /api/daily-dispatch/preview as SUPER_ADMIN (no company) returns 400 company_required', async () => {
    const sa = await seedUser({ role: 'SUPER_ADMIN', pin: 'sa-pin-1234' });
    const { token } = await loginUser(sa);

    const res = await request(app)
      .get('/api/daily-dispatch/preview')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ ok: false, error: 'company_required' });
  });
});

// Phase 52 — Daily dispatch mutation surfaces (POST /prepare, POST /commit).
//
// /prepare creates a STARTED run row for a (company, date) and snapshots
// assignments per employee. On a fresh tenant with no assignments it
// still returns 200 with employees=0 — pin that empty-data shape.
// /commit short-circuits to 500 EMAIL_NOT_CONFIGURED in CI (no SendGrid
// env), before the run lookup runs — pin that env-gate so a missing
// SendGrid env is not silently treated as "no run".
describeIfDb('Daily dispatch — POST /api/daily-dispatch/prepare', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('POST /prepare as SUPER_ADMIN (no company) returns 400 company_required', async () => {
    const sa = await seedUser({ role: 'SUPER_ADMIN', pin: 'sa-pin-prep1' });
    const { token } = await loginUser(sa);

    const res = await request(app)
      .post('/api/daily-dispatch/prepare')
      .query({ date: '2027-08-15' })
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ ok: false, error: 'company_required' });
  });

  test('POST /prepare on empty company returns 200 + ok run with employees=0', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .post('/api/daily-dispatch/prepare')
      .query({ date: '2027-08-16' })
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.run).toBeDefined();
    // run.id is `daily_dispatch_runs.id` which is bigint — pg returns
    // bigints as strings to avoid losing precision past 2^53. Just
    // verify it's present and parseable as a positive integer.
    expect(res.body.run.id).toBeDefined();
    expect(Number(res.body.run.id)).toBeGreaterThan(0);
    expect(res.body.employees).toBe(0);
    expect(res.body.assignments).toBe(0);
  });

  test('POST /prepare twice on same date returns 409 already_prepared', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const { token } = await loginUser(admin);

    // First prepare succeeds
    const first = await request(app)
      .post('/api/daily-dispatch/prepare')
      .query({ date: '2027-08-17' })
      .set('Authorization', `Bearer ${token}`);
    expect(first.statusCode).toBe(200);

    // Second prepare on same date returns 409
    const second = await request(app)
      .post('/api/daily-dispatch/prepare')
      .query({ date: '2027-08-17' })
      .set('Authorization', `Bearer ${token}`);

    expect(second.statusCode).toBe(409);
    expect(second.body).toMatchObject({ ok: false, error: 'already_prepared' });
    expect(second.body.run).toBeDefined();
  });
});

describeIfDb('Daily dispatch — POST /api/daily-dispatch/commit', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('POST /commit without SendGrid env returns 500 EMAIL_NOT_CONFIGURED', async () => {
    // CI does not configure SENDGRID_API_KEY / SENDGRID_FROM_EMAIL.
    // The route checks the env BEFORE looking up the run, so this
    // always returns 500 EMAIL_NOT_CONFIGURED in test environments.
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .post('/api/daily-dispatch/commit')
      .query({ date: '2027-08-18' })
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(500);
    expect(res.body).toMatchObject({ ok: false, error: 'EMAIL_NOT_CONFIGURED' });
  });
});
