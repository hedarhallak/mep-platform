// DB-backed integration tests for POST /api/auth/refresh — Phase 11e.
//
// Each test logs the seeded user in to obtain a real refresh_token, then
// exercises a refresh path. Tokens are SHA-256 hashed before storage, so
// these tests also implicitly cover the hash + lookup pipeline in
// routes/auth.js.

const request = require('supertest');
const app = require('../../app');
const {
  describeIfDb,
  closePool,
  getPool,
  seedCompany,
  seedUser,
  cleanupTestRows,
} = require('../helpers/db');

async function loginUser(user, pin = '1234') {
  const res = await request(app).post('/api/auth/login').send({ username: user.username, pin });
  if (res.statusCode !== 200) {
    throw new Error(`Login failed in test setup: ${res.statusCode} ${JSON.stringify(res.body)}`);
  }
  return res.body; // { token, refresh_token, user }
}

describeIfDb('POST /api/auth/refresh', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('valid refresh_token returns new token pair + revokes the old', async () => {
    const company = await seedCompany();
    const user = await seedUser({ company_id: company.company_id, role: 'WORKER' });
    const { refresh_token } = await loginUser(user);

    const res = await request(app).post('/api/auth/refresh').send({ refresh_token });

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(typeof res.body.token).toBe('string');
    expect(typeof res.body.refresh_token).toBe('string');
    expect(res.body.refresh_token).not.toBe(refresh_token); // rotated

    // Old token row should now be revoked, new one present and active.
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT revoked FROM public.refresh_tokens WHERE user_id = $1 ORDER BY id`,
      [user.id]
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].revoked).toBe(true); // old
    expect(rows[1].revoked).toBe(false); // new
  });

  test('missing refresh_token returns 400 MISSING_REFRESH_TOKEN', async () => {
    const res = await request(app).post('/api/auth/refresh').send({});
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ ok: false, error: 'MISSING_REFRESH_TOKEN' });
  });

  test('unknown refresh_token returns 401 INVALID_REFRESH_TOKEN', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refresh_token: 'a'.repeat(128) });
    expect(res.statusCode).toBe(401);
    expect(res.body).toMatchObject({ ok: false, error: 'INVALID_REFRESH_TOKEN' });
  });

  test('replaying a revoked refresh_token returns 401 TOKEN_REVOKED + revokes all user tokens', async () => {
    const user = await seedUser();
    const { refresh_token } = await loginUser(user);

    // First use rotates: old becomes revoked, new issued.
    const first = await request(app).post('/api/auth/refresh').send({ refresh_token });
    expect(first.statusCode).toBe(200);

    // Second use of the (now revoked) original should fail with TOKEN_REVOKED.
    const replay = await request(app).post('/api/auth/refresh').send({ refresh_token });
    expect(replay.statusCode).toBe(401);
    expect(replay.body).toMatchObject({ ok: false, error: 'TOKEN_REVOKED' });

    // Theft-detection: the route revokes ALL tokens for that user on replay.
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS revoked_count FROM public.refresh_tokens
       WHERE user_id = $1 AND revoked = true`,
      [user.id]
    );
    expect(rows[0].revoked_count).toBeGreaterThanOrEqual(2);
  });

  test('expired refresh_token returns 401 REFRESH_TOKEN_EXPIRED', async () => {
    const user = await seedUser();
    const { refresh_token } = await loginUser(user);

    // Backdate the row's expires_at.
    const pool = getPool();
    await pool.query(
      `UPDATE public.refresh_tokens SET expires_at = NOW() - INTERVAL '1 day'
       WHERE user_id = $1`,
      [user.id]
    );

    const res = await request(app).post('/api/auth/refresh').send({ refresh_token });
    expect(res.statusCode).toBe(401);
    expect(res.body).toMatchObject({ ok: false, error: 'REFRESH_TOKEN_EXPIRED' });
  });

  test('refresh against disabled user returns 403 USER_DISABLED', async () => {
    const user = await seedUser();
    const { refresh_token } = await loginUser(user);

    // Deactivate the user post-login.
    const pool = getPool();
    await pool.query(`UPDATE public.app_users SET is_active = false WHERE id = $1`, [user.id]);

    const res = await request(app).post('/api/auth/refresh').send({ refresh_token });
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ ok: false, error: 'USER_DISABLED' });
  });
});
