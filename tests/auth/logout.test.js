// DB-backed integration tests for POST /api/auth/logout and
// POST /api/auth/logout-all — Phase 11e.
//
// /logout is forgiving: it accepts a refresh_token, marks it revoked
// if found, and always returns 200 (no info-leak via differing 4xx
// status codes for valid vs invalid tokens).
//
// /logout-all requires a valid Bearer access token, then revokes EVERY
// refresh_token row for that user_id.

const request = require('supertest');
const app = require('../../app');
const { describeIfDb, closePool, getPool, seedUser, cleanupTestRows } = require('../helpers/db');

async function loginUser(user, pin = '1234') {
  const res = await request(app).post('/api/auth/login').send({ username: user.username, pin });
  if (res.statusCode !== 200) {
    throw new Error(`Login failed in test setup: ${res.statusCode} ${JSON.stringify(res.body)}`);
  }
  return res.body;
}

describeIfDb('POST /api/auth/logout', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('valid refresh_token returns 200 + revokes the row', async () => {
    const user = await seedUser();
    const { refresh_token } = await loginUser(user);

    const res = await request(app).post('/api/auth/logout').send({ refresh_token });
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);

    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT revoked FROM public.refresh_tokens WHERE user_id = $1`,
      [user.id]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].revoked).toBe(true);
  });

  test('missing refresh_token still returns 200 ok (no info leak)', async () => {
    const res = await request(app).post('/api/auth/logout').send({});
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('unknown refresh_token still returns 200 ok (no info leak)', async () => {
    const res = await request(app)
      .post('/api/auth/logout')
      .send({ refresh_token: 'b'.repeat(128) });
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

describeIfDb('POST /api/auth/logout-all', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('missing Bearer token returns 401 MISSING_TOKEN', async () => {
    const res = await request(app).post('/api/auth/logout-all').send({});
    expect(res.statusCode).toBe(401);
    expect(res.body).toMatchObject({ ok: false, error: 'MISSING_TOKEN' });
  });

  test('invalid Bearer token returns 401 INVALID_TOKEN', async () => {
    const res = await request(app)
      .post('/api/auth/logout-all')
      .set('Authorization', 'Bearer not-a-real-jwt')
      .send({});
    expect(res.statusCode).toBe(401);
    expect(res.body).toMatchObject({ ok: false, error: 'INVALID_TOKEN' });
  });

  test('valid Bearer revokes ALL refresh tokens for the user', async () => {
    const user = await seedUser();

    // Three logins → three refresh_token rows for the same user.
    const session1 = await loginUser(user);
    await loginUser(user);
    await loginUser(user);

    const pool = getPool();
    const before = await pool.query(
      `SELECT COUNT(*)::int AS n FROM public.refresh_tokens
       WHERE user_id = $1 AND revoked = false`,
      [user.id]
    );
    expect(before.rows[0].n).toBe(3);

    const res = await request(app)
      .post('/api/auth/logout-all')
      .set('Authorization', `Bearer ${session1.token}`)
      .send({});
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);

    const after = await pool.query(
      `SELECT COUNT(*)::int AS n FROM public.refresh_tokens
       WHERE user_id = $1 AND revoked = false`,
      [user.id]
    );
    expect(after.rows[0].n).toBe(0);
  });
});
