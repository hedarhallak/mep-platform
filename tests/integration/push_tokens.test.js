// Phase 25 — Push token registration tests.
//
// /api/profile/push-token is a tiny upsert endpoint used by the
// mobile app to register an Expo / APNs token for the logged-in user.
// Auth-gated; no RBAC. Idempotent via ON CONFLICT (user_id).

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

describeIfDb('Push tokens — POST /api/profile/push-token', () => {
  afterAll(async () => {
    // Clean up any push_tokens rows we created — there's a UNIQUE on
    // user_id and the rows FK to app_users which we wipe at test end.
    await getPool().query(
      `DELETE FROM public.push_tokens
       WHERE user_id IN (SELECT id FROM public.app_users WHERE username LIKE 'test_%')`
    );
    await cleanupTestRows();
    await closePool();
  });

  test('POST /push-token without token returns 400 TOKEN_REQUIRED', async () => {
    const company = await seedCompany();
    const user = await seedUser({ company_id: company.company_id, role: 'WORKER' });
    const { token } = await loginUser(user);

    const res = await request(app)
      .post('/api/profile/push-token')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ ok: false, error: 'TOKEN_REQUIRED' });
  });

  test('POST /push-token with token upserts the row (200, DB row exists)', async () => {
    const company = await seedCompany();
    const user = await seedUser({ company_id: company.company_id, role: 'WORKER' });
    const { token } = await loginUser(user);

    const expoToken = `ExponentPushToken[Phase25-${Date.now()}]`;

    const res = await request(app)
      .post('/api/profile/push-token')
      .set('Authorization', `Bearer ${token}`)
      .send({ token: expoToken, platform: 'ios' });

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);

    // DB readback: the row exists for this user with the right token.
    const { rows } = await getPool().query(
      'SELECT token, platform FROM public.push_tokens WHERE user_id = $1',
      [user.id]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].token).toBe(expoToken);
    expect(rows[0].platform).toBe('ios');
  });
});
