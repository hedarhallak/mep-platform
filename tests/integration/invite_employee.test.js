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

describeIfDb('Invite employee — POST /api/invite-employee', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('happy path: COMPANY_ADMIN creates employee + ACTIVE user_invite (201)', async () => {
    const company = await seedCompany();
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
    const company = await seedCompany();
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
    const company = await seedCompany();
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
    const company = await seedCompany();
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
    const company = await seedCompany();
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

  // Section 113 (May 16, 2026) — per-tenant seat-cap enforcement.
  // The invite route reads companies.max_users + counts public.employees
  // and rejects with 402 USER_LIMIT_REACHED when current_users >= max_users.
  // We force the cap to 1 via a direct UPDATE (the column lands with
  // a default of 5 from migration 017 — too high to comfortably hit in
  // a test without seeding 5 employees). Then we insert ONE employee
  // manually so current_users == max_users == 1, and assert the next
  // invite is rejected.
  test('at-cap company returns 402 USER_LIMIT_REACHED on invite', async () => {
    const pool = getPool();
    const company = await seedCompany();

    // Squeeze the cap to 1 so a single employee fills it.
    await pool.query('UPDATE public.companies SET max_users = 1 WHERE company_id = $1', [
      company.company_id,
    ]);

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
      max_users: 1,
      current_users: 1,
    });
    expect(res.body.message_fr).toMatch(/Limite atteinte/);
    expect(res.body.message_en).toMatch(/Seat limit reached/);
  });

  // Section 113 sanity check — verify the happy path is NOT broken when
  // the company has plenty of headroom. Companies seeded via seedCompany
  // get the BASIC default (max_users = 5 from migration 017 backfill),
  // so a single invite with 0 existing employees should still 201.
  test('below-cap company still allows invite (regression guard for Section 113)', async () => {
    const company = await seedCompany();
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
