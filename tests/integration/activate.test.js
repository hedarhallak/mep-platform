// Phase 49 / §151.6 — Activate route.
//
// /activate is a PUBLIC endpoint (no auth) that handles the email
// activation link. The token IS the authorization; the route runs against
// authPool (superPool || pool) so no tenant GUC is needed. §151.6 adds the
// real token flow: GET (valid/invalid/expired/used) + POST /set-pin
// (validation + the create-user + consume-invite happy path).

const request = require('supertest');
const app = require('../../app');
const {
  describeIfDb,
  closePool,
  getPool,
  seedCompany,
  seedEmployee,
  seedUserInvite,
  cleanupTestRows,
} = require('../helpers/db');

describeIfDb('Activate — /activate', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  async function seedInvite(overrides = {}) {
    const company = await seedCompany();
    const emp = await seedEmployee({ company_id: company.company_id });
    const invite = await seedUserInvite({
      company_id: company.company_id,
      employee_id: emp.id,
      ...overrides,
    });
    return { company, emp, invite };
  }

  // ── GET /activate ────────────────────────────────────────────────────────

  test('GET /activate without token returns 400 with plain-text error', async () => {
    const res = await request(app).get('/activate');
    expect(res.statusCode).toBe(400);
    expect(res.text).toMatch(/Missing activation token/i);
  });

  test('GET /activate with an unknown token → 400 Invalid activation link', async () => {
    const res = await request(app).get('/activate').query({ token: 'no-such-token-xyz' });
    expect(res.statusCode).toBe(400);
    expect(res.text).toMatch(/Invalid activation link/i);
  });

  test('GET /activate with an expired invite → 400 expired', async () => {
    const { invite } = await seedInvite({ expires_at: new Date(Date.now() - 60_000) });
    const res = await request(app).get('/activate').query({ token: invite.token });
    expect(res.statusCode).toBe(400);
    expect(res.text).toMatch(/expired/i);
  });

  test('GET /activate with a valid invite → 200 + the Set PIN form', async () => {
    const { invite } = await seedInvite();
    const res = await request(app).get('/activate').query({ token: invite.token });
    expect(res.statusCode).toBe(200);
    expect(res.text).toMatch(/Set PIN/i);
    expect(res.text).toContain('/activate/set-pin');
  });

  // ── POST /activate/set-pin ────────────────────────────────────────────────

  test('POST /set-pin with mismatched PINs → 400 Invalid PIN', async () => {
    const { invite } = await seedInvite();
    const res = await request(app)
      .post('/activate/set-pin')
      .type('form')
      .send({ token: invite.token, pin: '1234', pin_confirm: '9999' });
    expect(res.statusCode).toBe(400);
    expect(res.text).toMatch(/Invalid PIN/i);
  });

  test('POST /set-pin with too-short PIN → 400 length error', async () => {
    const { invite } = await seedInvite();
    const res = await request(app)
      .post('/activate/set-pin')
      .type('form')
      .send({ token: invite.token, pin: '12', pin_confirm: '12' });
    expect(res.statusCode).toBe(400);
    expect(res.text).toMatch(/4 to 8/i);
  });

  test('POST /set-pin with an unknown token → 400 Invalid activation link', async () => {
    const res = await request(app)
      .post('/activate/set-pin')
      .type('form')
      .send({ token: 'no-such-token', pin: '1234', pin_confirm: '1234' });
    expect(res.statusCode).toBe(400);
    expect(res.text).toMatch(/Invalid activation link/i);
  });

  test('POST /set-pin valid → redirects to /login, creates the user, consumes the invite', async () => {
    const pool = getPool();
    const { invite } = await seedInvite();

    const res = await request(app)
      .post('/activate/set-pin')
      .type('form')
      .send({ token: invite.token, pin: '4321', pin_confirm: '4321' })
      .redirects(0);
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toMatch(/\/login\?activated=1/);

    // the app_user now exists + is active, with a pin set
    const { rows: users } = await pool.query(
      `SELECT is_active, activated_at, pin_hash FROM public.app_users WHERE email = $1`,
      [invite.email]
    );
    expect(users).toHaveLength(1);
    expect(users[0].is_active).toBe(true);
    expect(users[0].activated_at).not.toBeNull();
    expect(users[0].pin_hash).toBeTruthy();

    // the invite is consumed (used_at set)
    const { rows: inv } = await pool.query(
      `SELECT used_at FROM public.user_invites WHERE id = $1`,
      [invite.id]
    );
    expect(inv[0].used_at).not.toBeNull();

    // a second activation attempt is rejected as already-used (GET + POST)
    const getUsed = await request(app).get('/activate').query({ token: invite.token });
    expect(getUsed.statusCode).toBe(400);
    expect(getUsed.text).toMatch(/already used/i);

    const postUsed = await request(app)
      .post('/activate/set-pin')
      .type('form')
      .send({ token: invite.token, pin: '4321', pin_confirm: '4321' });
    expect(postUsed.statusCode).toBe(400);
    expect(postUsed.text).toMatch(/already used/i);
  });
});
