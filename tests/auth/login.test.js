// DB-backed integration tests for POST /api/auth/login — Phase 11d.
//
// Drives the real Express app via Supertest, against the PostGIS service
// container in CI (or skipped locally without TEST_DATABASE_URL).
// Each test seeds its own company + user, runs the assertion, and the
// suite cleans up with a single `LIKE 'test_%'` sweep at the end.
//
// Coverage:
//   - happy path: valid creds return 200 + tokens + user object
//   - 400 on missing fields (username / pin)
//   - 400 on invalid PIN format (too short / too long)
//   - 401 on wrong PIN (existing user)
//   - 401 on nonexistent username
//   - 403 on disabled user (is_active = false)
//   - 403 on suspended company
//
// Future Phase 11e: refresh, change-pin, logout.

const request = require('supertest');
const app = require('../../app');
const {
  describeIfDb,
  closePool,
  seedCompany,
  seedUser,
  cleanupTestRows,
} = require('../helpers/db');

describeIfDb('POST /api/auth/login', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('valid creds return 200 + access token + refresh token + user object', async () => {
    const company = await seedCompany();
    const user = await seedUser({ company_id: company.company_id, role: 'FOREMAN', pin: '1234' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: user.username, pin: '1234' });

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(typeof res.body.token).toBe('string');
    expect(typeof res.body.refresh_token).toBe('string');
    expect(res.body.user).toMatchObject({
      username: user.username,
      role: 'FOREMAN',
    });
  });

  test('missing username returns 400 MISSING_FIELDS', async () => {
    const res = await request(app).post('/api/auth/login').send({ pin: '1234' });
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ ok: false, error: 'MISSING_FIELDS' });
  });

  test('missing pin returns 400 MISSING_FIELDS', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'someone' });
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ ok: false, error: 'MISSING_FIELDS' });
  });

  test('PIN shorter than 4 chars returns 400 INVALID_PIN_FORMAT', async () => {
    const user = await seedUser({ pin: '1234' });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: user.username, pin: '12' });
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ ok: false, error: 'INVALID_PIN_FORMAT' });
  });

  test('wrong PIN against existing user returns 401 INVALID_CREDENTIALS', async () => {
    const user = await seedUser({ pin: '1234' });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: user.username, pin: '9999' });
    expect(res.statusCode).toBe(401);
    expect(res.body).toMatchObject({ ok: false, error: 'INVALID_CREDENTIALS' });
  });

  test('nonexistent username returns 401 INVALID_CREDENTIALS', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'test_nobody_here_xxx', pin: '1234' });
    expect(res.statusCode).toBe(401);
    expect(res.body).toMatchObject({ ok: false, error: 'INVALID_CREDENTIALS' });
  });

  test('disabled user (is_active = false) returns 403 USER_DISABLED', async () => {
    const user = await seedUser({ pin: '1234', is_active: false });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: user.username, pin: '1234' });
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ ok: false, error: 'USER_DISABLED' });
  });

  test('suspended company returns 403 COMPANY_SUSPENDED', async () => {
    const company = await seedCompany({ status: 'SUSPENDED' });
    const user = await seedUser({
      company_id: company.company_id,
      role: 'WORKER',
      pin: '1234',
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: user.username, pin: '1234' });

    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ ok: false, error: 'COMPANY_SUSPENDED' });
  });

  test('login persists a refresh_token row keyed to the user', async () => {
    const user = await seedUser({ pin: '1234' });
    await request(app).post('/api/auth/login').send({ username: user.username, pin: '1234' });

    const { getPool } = require('../helpers/db');
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT user_id, expires_at, revoked
       FROM public.refresh_tokens
       WHERE user_id = $1`,
      [user.id]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].revoked).toBeFalsy();
    expect(new Date(rows[0].expires_at).getTime()).toBeGreaterThan(Date.now());
  });
});
