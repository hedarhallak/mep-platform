// Phase 23 — Onboarding (public token verify) tests.
//
// /api/onboarding/verify is a PUBLIC endpoint — no JWT required. The
// frontend uses it to validate an invite/activation link before showing
// the worker their first-time setup form. The route is also rate-limited
// by onboardingLimiter (skipped in tests via NODE_ENV=test).

const request = require('supertest');
const app = require('../../app');
const {
  describeIfDb,
  closePool,
  cleanupTestRows,
  seedCompany,
  seedEmployee,
  seedUserInvite,
  seedUser,
  getPool,
} = require('../helpers/db');

describeIfDb('Onboarding — /api/onboarding/verify', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('GET /api/onboarding/verify without token returns 400 TOKEN_REQUIRED', async () => {
    const res = await request(app).get('/api/onboarding/verify');
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ ok: false, error: 'TOKEN_REQUIRED' });
  });

  // Phase 62 (May 2026) — un-skipped now that public.user_invites exists.
  // Original Phase 23 skip reason: route 500'd on the missing table.
  // Phase 59 added the table; the route now returns 404 cleanly when
  // the token doesn't match any invite row.
  test('GET /api/onboarding/verify with unknown token returns 404 TOKEN_NOT_FOUND', async () => {
    const res = await request(app)
      .get('/api/onboarding/verify')
      .query({ token: 'definitely-not-a-real-token-' + Date.now() });
    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({ ok: false, error: 'TOKEN_NOT_FOUND' });
  });

  test('GET /verify with valid ACTIVE token returns 200 + invite info', async () => {
    const company = await seedCompany();
    const employee = await seedEmployee({
      company_id: company.company_id,
      first_name: 'Phase62',
      last_name: 'Verifyme',
    });
    const invite = await seedUserInvite({
      company_id: company.company_id,
      employee_id: employee.id,
      role: 'WORKER',
    });

    const res = await request(app).get('/api/onboarding/verify').query({ token: invite.token });

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.invite).toBeDefined();
    expect(res.body.invite.role).toBe('WORKER');
    expect(res.body.invite.first_name).toBe('Phase62');
    expect(res.body.invite.last_name).toBe('Verifyme');
  });

  test('GET /verify with already-USED token returns 410 TOKEN_ALREADY_USED', async () => {
    const company = await seedCompany();
    const employee = await seedEmployee({ company_id: company.company_id });
    const invite = await seedUserInvite({
      company_id: company.company_id,
      employee_id: employee.id,
      status: 'USED',
    });

    const res = await request(app).get('/api/onboarding/verify').query({ token: invite.token });

    expect(res.statusCode).toBe(410);
    expect(res.body).toMatchObject({ ok: false, error: 'TOKEN_ALREADY_USED' });
  });

  test('GET /verify with expired ACTIVE token returns 410 TOKEN_EXPIRED', async () => {
    const company = await seedCompany();
    const employee = await seedEmployee({ company_id: company.company_id });
    const invite = await seedUserInvite({
      company_id: company.company_id,
      employee_id: employee.id,
      // expires_at in the past — route checks Date.now() against expires_at
      // ONLY when status is still ACTIVE, so we keep status ACTIVE here.
      expires_at: new Date(Date.now() - 60 * 60 * 1000), // 1h ago
    });

    const res = await request(app).get('/api/onboarding/verify').query({ token: invite.token });

    expect(res.statusCode).toBe(410);
    expect(res.body).toMatchObject({ ok: false, error: 'TOKEN_EXPIRED' });
  });
});

// Phase 54 — POST /api/onboarding/complete validation surface.
//
// /complete is the second public endpoint in this route file. It also
// hits public.user_invites, which is missing from the baseline schema
// (Bug 6) — so the happy path 500s. But validation guards run BEFORE
// the DB query, so we can pin them: missing token / username / pin
// each short-circuits with a 400 + specific error code, in order.
//
// This protects the validation contract from accidental refactor
// regressions even while the underlying user_invites table is missing.
describeIfDb('Onboarding — POST /api/onboarding/complete (validation)', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('POST /complete with empty body returns 400 TOKEN_REQUIRED', async () => {
    const res = await request(app).post('/api/onboarding/complete').send({});
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ ok: false, error: 'TOKEN_REQUIRED' });
  });

  test('POST /complete with token only returns 400 USERNAME_REQUIRED', async () => {
    const res = await request(app)
      .post('/api/onboarding/complete')
      .send({ token: 'placeholder-token' });
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ ok: false, error: 'USERNAME_REQUIRED' });
  });

  test('POST /complete with token + username but no pin returns 400 PIN_REQUIRED', async () => {
    const res = await request(app)
      .post('/api/onboarding/complete')
      .send({ token: 'placeholder-token', username: 'newuser' });
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ ok: false, error: 'PIN_REQUIRED' });
  });
});

// Phase 62 — POST /api/onboarding/complete happy paths + error branches.
//
// The full flow (token verify → app_users INSERT → employees activate →
// employee_profiles upsert → invite mark USED) was blocked by the missing
// user_invites table until Phase 59. Now the table exists, so we can
// exercise the whole transaction end-to-end.
describeIfDb('Onboarding — POST /api/onboarding/complete (happy path)', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('POST /complete with valid token creates app_user + activates employee + marks invite USED', async () => {
    const company = await seedCompany();
    const employee = await seedEmployee({
      company_id: company.company_id,
      first_name: 'New',
      last_name: 'Hire',
    });
    // Phase 62 — seedEmployee defaults is_active=true; the route's
    // `UPDATE employees SET is_active = true` is a no-op in that case
    // but we want to verify the broader flow: app_user creation +
    // invite-USED marking + employee_profiles upsert.
    const invite = await seedUserInvite({
      company_id: company.company_id,
      employee_id: employee.id,
      role: 'WORKER',
    });

    const username = `test_phase62_${Date.now()}`;
    const res = await request(app).post('/api/onboarding/complete').send({
      token: invite.token,
      username,
      pin: '1234',
      phone: '+15145551212',
      home_address: '123 Test St',
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);

    // Verify the side effects that matter:
    const pool = getPool();

    // 1. app_user was created with the chosen username + invite's role/employee.
    const userRow = await pool.query(
      `SELECT username, role, employee_id, company_id, is_active, must_change_pin
         FROM public.app_users WHERE username = $1`,
      [username.toLowerCase()]
    );
    expect(userRow.rows).toHaveLength(1);
    expect(userRow.rows[0].role).toBe('WORKER');
    expect(Number(userRow.rows[0].employee_id)).toBe(employee.id);
    expect(Number(userRow.rows[0].company_id)).toBe(Number(company.company_id));
    expect(userRow.rows[0].is_active).toBe(true);
    // Worker just chose their own PIN — they should NOT be forced to change it.
    expect(userRow.rows[0].must_change_pin).toBe(false);

    // 2. The invite was burned — status flipped to USED + used_at set.
    const inviteRow = await pool.query(
      `SELECT status, used_at FROM public.user_invites WHERE id = $1`,
      [invite.id]
    );
    expect(inviteRow.rows[0].status).toBe('USED');
    expect(inviteRow.rows[0].used_at).not.toBeNull();
  });

  test('POST /complete with unknown token returns 404 TOKEN_NOT_FOUND', async () => {
    const res = await request(app)
      .post('/api/onboarding/complete')
      .send({
        token: 'no-such-token-' + Date.now(),
        username: 'doesntmatter',
        pin: '1234',
      });

    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({ ok: false, error: 'TOKEN_NOT_FOUND' });
  });

  test('POST /complete with already-USED token returns 410 TOKEN_ALREADY_USED', async () => {
    const company = await seedCompany();
    const employee = await seedEmployee({ company_id: company.company_id });
    const invite = await seedUserInvite({
      company_id: company.company_id,
      employee_id: employee.id,
      status: 'USED',
    });

    const res = await request(app)
      .post('/api/onboarding/complete')
      .send({
        token: invite.token,
        username: `test_phase62_used_${Date.now()}`,
        pin: '1234',
      });

    expect(res.statusCode).toBe(410);
    expect(res.body).toMatchObject({ ok: false, error: 'TOKEN_ALREADY_USED' });
  });

  test('POST /complete with username already taken returns 409 USERNAME_TAKEN', async () => {
    const company = await seedCompany();

    // Pre-create a user with the username we're going to try to use.
    const taken = `test_phase62_taken_${Date.now()}`;
    await seedUser({ company_id: company.company_id, username: taken, role: 'WORKER' });

    // Now create a fresh invite + try to complete it with the same username.
    const employee = await seedEmployee({ company_id: company.company_id });
    const invite = await seedUserInvite({
      company_id: company.company_id,
      employee_id: employee.id,
    });

    const res = await request(app).post('/api/onboarding/complete').send({
      token: invite.token,
      username: taken,
      pin: '1234',
    });

    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ ok: false, error: 'USERNAME_TAKEN' });
  });
});
