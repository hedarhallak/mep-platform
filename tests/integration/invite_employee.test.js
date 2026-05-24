// Phase 61b (May 2026) — invite_employee.js happy-path coverage.
//
// /api/invite-employee creates an employees row + a user_invites row
// in one transaction, then sends an onboarding email via lib/email's
// sendEmail helper. Was BLOCKED until Phase 59 added public.user_invites
// to the schema.
//
// Email mocking note: invite_employee.js doesn't use @sendgrid/mail
// directly — it goes through lib/email.js's sendEmail() helper. That
// helper captures SENDGRID_API_KEY at MODULE LOAD time (snapshot
// semantics), so by the time our beforeAll runs, the key is already
// captured as undefined. sendEmail therefore returns false gracefully
// (logs a warning, no throw) instead of trying to call SendGrid. The
// route returns 201 with `email_sent: false` — perfect for the test:
// we exercise the SQL writes without actually emailing. We still mock
// @sendgrid/mail for safety (in case lib/email's load order changes).

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
  seedSubscription,
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

// Section 116 (May 24, 2026) — Phase 6-D-4 PR 2 refactor makes
// routes/invite_employee.js read from subscriptions.subscribed_seats.
// Every test that hits POST /api/invite-employee now needs a subscription
// seeded for the company (otherwise the route returns 404
// SUBSCRIPTION_NOT_FOUND). This helper wraps the standard seedCompany +
// seedSubscription pattern so test bodies stay readable.
async function seedCompanyWithSubscription(subscribedSeats = 5) {
  const company = await seedCompany();
  await seedSubscription({
    company_id: company.company_id,
    subscribed_seats: subscribedSeats,
  });
  return company;
}

describeIfDb('Invite employee — POST /api/invite-employee', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('happy path: COMPANY_ADMIN creates employee + ACTIVE user_invite (201)', async () => {
    const company = await seedCompanyWithSubscription();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const { token } = await loginUser(admin);

    const email = `test_phase61b_${Date.now()}@constrai.ca`;

    const res = await request(app)
      .post('/api/invite-employee')
      .set('Authorization', `Bearer ${token}`)
      .send({
        first_name: 'Test',
        last_name: 'Invitee',
        email,
        role: 'WORKER',
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(typeof res.body.employee_id).toBe('number');
    expect(res.body.invite_url).toMatch(/\/onboarding\?token=/);

    // Verify both rows landed atomically.
    const pool = getPool();
    const empRow = await pool.query(
      `SELECT id, contact_email, is_active, employee_profile_type
         FROM public.employees WHERE id = $1`,
      [res.body.employee_id]
    );
    expect(empRow.rows).toHaveLength(1);
    // is_active stays false until the user finishes onboarding /complete.
    expect(empRow.rows[0].is_active).toBe(false);
    expect(empRow.rows[0].contact_email).toBe(email.toLowerCase());

    const inviteRow = await pool.query(
      `SELECT status, role, employee_id, expires_at FROM public.user_invites
         WHERE company_id = $1 AND lower(email) = lower($2)`,
      [company.company_id, email]
    );
    expect(inviteRow.rows).toHaveLength(1);
    expect(inviteRow.rows[0].status).toBe('ACTIVE');
    expect(inviteRow.rows[0].role).toBe('WORKER');
    expect(Number(inviteRow.rows[0].employee_id)).toBe(res.body.employee_id);
    // expires_at should be in the future (default 48h).
    expect(new Date(inviteRow.rows[0].expires_at).getTime()).toBeGreaterThan(Date.now());
  });

  test('without employees.invite permission returns 403', async () => {
    const company = await seedCompanyWithSubscription();
    const worker = await seedUser({ company_id: company.company_id, role: 'WORKER' });
    const { token } = await loginUser(worker);

    const res = await request(app)
      .post('/api/invite-employee')
      .set('Authorization', `Bearer ${token}`)
      .send({
        first_name: 'Should',
        last_name: 'Notwork',
        email: 'should-not-create@constrai.ca',
        role: 'WORKER',
      });

    expect(res.statusCode).toBe(403);
    expect(res.body.permission).toBe('employees.invite');
  });

  test('missing first_name returns 400 FIRST_NAME_REQUIRED', async () => {
    const company = await seedCompanyWithSubscription();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .post('/api/invite-employee')
      .set('Authorization', `Bearer ${token}`)
      .send({ last_name: 'Solo', email: 'a@b.c', role: 'WORKER' });

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ ok: false, error: 'FIRST_NAME_REQUIRED' });
  });

  test('invalid email format returns 400 INVALID_EMAIL', async () => {
    const company = await seedCompanyWithSubscription();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .post('/api/invite-employee')
      .set('Authorization', `Bearer ${token}`)
      .send({
        first_name: 'Bad',
        last_name: 'Email',
        email: 'not-an-email',
        role: 'WORKER',
      });

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ ok: false, error: 'INVALID_EMAIL' });
  });

  test('duplicate email in same company returns 409 EMAIL_ALREADY_REGISTERED', async () => {
    const company = await seedCompanyWithSubscription();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const { token } = await loginUser(admin);

    const email = `test_phase61b_dup_${Date.now()}@constrai.ca`;

    const first = await request(app)
      .post('/api/invite-employee')
      .set('Authorization', `Bearer ${token}`)
      .send({ first_name: 'First', last_name: 'Try', email, role: 'WORKER' });
    expect(first.statusCode).toBe(201);

    const second = await request(app)
      .post('/api/invite-employee')
      .set('Authorization', `Bearer ${token}`)
      .send({ first_name: 'Second', last_name: 'Try', email, role: 'WORKER' });

    expect(second.statusCode).toBe(409);
    expect(second.body).toMatchObject({ ok: false, error: 'EMAIL_ALREADY_REGISTERED' });
  });

  // Section 113 + Section 116 (May 24, 2026, Phase 6-D-4 PR 2 refactor) —
  // per-tenant seat-cap enforcement now reads from subscriptions.subscribed_seats
  // (was companies.max_users in Section 114). We seed the subscription directly
  // with subscribed_seats=1 so a single existing employee fills the cap; the
  // older pattern of UPDATEing companies.max_users no longer affects the route.
  // The 402 response keeps `max_users` as a legacy alias for backward-compat
  // (alongside the new `subscribed_seats` field).
  test('at-cap company returns 402 USER_LIMIT_REACHED on invite', async () => {
    const pool = getPool();
    // Seed with subscribed_seats=1 so the very first existing employee fills the cap.
    const company = await seedCompanyWithSubscription(1);

    // Seed one existing employee to occupy the only seat.
    await pool.query(
      `INSERT INTO public.employees
         (first_name, last_name, contact_email, employee_code, company_id, is_active, employee_profile_type)
       VALUES ('Existing', 'Worker', $1, $2, $3, true, 'WORKER')`,
      [
        `test_s113_existing_${Date.now()}@constrai.ca`,
        `EMP-${company.company_id}-${Math.floor(1000 + Math.random() * 9000)}`,
        company.company_id,
      ]
    );

    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .post('/api/invite-employee')
      .set('Authorization', `Bearer ${token}`)
      .send({
        first_name: 'Sixth',
        last_name: 'Person',
        email: `test_s113_overcap_${Date.now()}@constrai.ca`,
        role: 'WORKER',
      });

    expect(res.statusCode).toBe(402);
    expect(res.body).toMatchObject({
      ok: false,
      error: 'USER_LIMIT_REACHED',
      subscribed_seats: 1,
      max_users: 1, // legacy alias kept for backward-compat (Section 116 refactor)
      current_users: 1,
    });
    expect(res.body.message_fr).toMatch(/Limite atteinte/);
    expect(res.body.message_en).toMatch(/Seat limit reached/);
  });

  // Section 113 + Section 116 sanity check — verify the happy path is NOT
  // broken when the company has plenty of headroom. Companies seeded via
  // seedCompanyWithSubscription default to subscribed_seats=5, so a single
  // invite with 0 existing employees should still 201.
  test('below-cap company still allows invite (regression guard for Section 113/116)', async () => {
    const company = await seedCompanyWithSubscription();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .post('/api/invite-employee')
      .set('Authorization', `Bearer ${token}`)
      .send({
        first_name: 'Below',
        last_name: 'Cap',
        email: `test_s113_belowcap_${Date.now()}@constrai.ca`,
        role: 'WORKER',
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.ok).toBe(true);
  });
});
