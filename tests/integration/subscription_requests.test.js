// tests/integration/subscription_requests.test.js
//
// Phase 6-D-4 PR 4 / Section 117.4 — customer-facing subscription change
// request endpoints. Verifies the audit-log row #1 side of the hybrid
// workflow (DB audit + mailto). The SUPER_ADMIN apply side is covered by
// tests/admin/super_subscription_apply.test.js.
//
// Endpoints tested:
//   POST /api/admin/subscription/seat-request
//   POST /api/admin/subscription/cancel-request
//   POST /api/admin/subscription/plan-upgrade-request
//
// Each test verifies:
//   - HTTP status + response shape (ok, request_audit_id, mailto_subject, mailto_body, mailto_url)
//   - audit_logs row inserted with correct action / entity / details
//   - input validation rejects malformed bodies

'use strict';

const request = require('supertest');
const app = require('../../app');
const {
  describeIfDb,
  closePool,
  getPool,
  seedCompany,
  seedSubscription,
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

// Helper to set up a company + subscription + COMPANY_ADMIN + token.
async function seedTenantAdmin({ subscribedSeats = 5, planType = 'MONTHLY' } = {}) {
  const company = await seedCompany();
  const subscription = await seedSubscription({
    company_id: company.company_id,
    subscribed_seats: subscribedSeats,
    plan_type: planType,
  });
  const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
  const { token } = await loginUser(admin);
  return { company, subscription, admin, token };
}

// =============================================================================
// GET /api/admin/subscription  (Phase 6-D-5 PR 1)
// =============================================================================

describeIfDb('GET /api/admin/subscription', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('COMPANY_ADMIN reads their own subscription → 200 with summary + usage', async () => {
    const ctx = await seedTenantAdmin({ subscribedSeats: 7, planType: 'MONTHLY' });
    const res = await request(app)
      .get('/api/admin/subscription')
      .set('Authorization', `Bearer ${ctx.token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      subscription: expect.objectContaining({
        id: ctx.subscription.id,
        status: expect.any(String),
        plan_type: 'MONTHLY',
        subscribed_seats: 7,
        cancel_at_period_end: expect.any(Boolean),
      }),
      usage: expect.objectContaining({
        current_employees: expect.any(Number),
        seats_remaining: expect.any(Number),
      }),
      company: expect.objectContaining({
        id: ctx.company.company_id,
        name: ctx.company.name,
      }),
    });
    // unit_price_cents must be a non-negative integer (bracket-derived)
    expect(Number.isInteger(res.body.subscription.current_unit_price_cents)).toBe(true);
    expect(res.body.subscription.current_unit_price_cents).toBeGreaterThanOrEqual(0);
    // seats_remaining = max(0, subscribed - current_employees)
    expect(res.body.usage.seats_remaining).toBeGreaterThanOrEqual(0);
  });

  test('rejects unauthenticated request with 401', async () => {
    const res = await request(app).get('/api/admin/subscription');
    expect([401, 403]).toContain(res.statusCode);
  });
});

// =============================================================================
// POST /api/admin/subscription/seat-request
// =============================================================================

describeIfDb('POST /api/admin/subscription/seat-request', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('COMPANY_ADMIN creates request → 200 + audit_log row inserted', async () => {
    const ctx = await seedTenantAdmin({ subscribedSeats: 5 });
    const res = await request(app)
      .post('/api/admin/subscription/seat-request')
      .set('Authorization', `Bearer ${ctx.token}`)
      .send({ requested_seats: 8, reason: 'Hiring 3 new foremen for the summer push' });

    expect(res.statusCode).toBe(200);
    // The arrow character `→` appears only in mailto_subject; mailto_body
    // uses natural prose ("from 5 to 8") for the customer's email reader.
    expect(res.body).toMatchObject({
      ok: true,
      mailto_subject: expect.stringContaining('Seat change'),
      mailto_body: expect.stringContaining('from 5 to 8'),
      mailto_url: expect.stringContaining('mailto:billing@constrai.ca'),
    });
    expect(res.body.mailto_subject).toMatch(/5\s*→\s*8/); // arrow in subject only
    expect(typeof res.body.request_audit_id).toBe('number');
    expect(res.body.request_audit_id).toBeGreaterThan(0);

    // audit_logs row #1 written?
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT action, entity_type, entity_id, details FROM public.audit_logs WHERE id = $1`,
      [res.body.request_audit_id]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe('CUSTOMER_REQUESTED_SUBSCRIPTION_CHANGE');
    expect(rows[0].entity_type).toBe('subscription');
    expect(Number(rows[0].entity_id)).toBe(ctx.subscription.id);
    expect(rows[0].details.change_category).toBe('SEAT_CHANGE');
    expect(rows[0].details.current.subscribed_seats).toBe(5);
    expect(rows[0].details.requested.subscribed_seats).toBe(8);
    expect(rows[0].details.reason).toBe('Hiring 3 new foremen for the summer push');
    expect(rows[0].details.source).toBe('web_app_button');
  });

  test('rejects requested_seats <= 0 with 400', async () => {
    const ctx = await seedTenantAdmin();
    const res = await request(app)
      .post('/api/admin/subscription/seat-request')
      .set('Authorization', `Bearer ${ctx.token}`)
      .send({ requested_seats: 0 });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('INVALID_REQUESTED_SEATS');
  });

  test('rejects non-integer requested_seats with 400', async () => {
    const ctx = await seedTenantAdmin();
    const res = await request(app)
      .post('/api/admin/subscription/seat-request')
      .set('Authorization', `Bearer ${ctx.token}`)
      .send({ requested_seats: 'lots' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('INVALID_REQUESTED_SEATS');
  });

  test('rejects when requested equals current (NO_CHANGE)', async () => {
    const ctx = await seedTenantAdmin({ subscribedSeats: 10 });
    const res = await request(app)
      .post('/api/admin/subscription/seat-request')
      .set('Authorization', `Bearer ${ctx.token}`)
      .send({ requested_seats: 10 });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('NO_CHANGE');
  });

  test('rejects reason exceeding 1000 chars', async () => {
    const ctx = await seedTenantAdmin();
    const res = await request(app)
      .post('/api/admin/subscription/seat-request')
      .set('Authorization', `Bearer ${ctx.token}`)
      .send({ requested_seats: 8, reason: 'x'.repeat(1001) });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('REASON_TOO_LONG');
  });

  test('returns 404 when company has no subscription', async () => {
    const company = await seedCompany();
    // Note: NO seedSubscription call here.
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const { token } = await loginUser(admin);
    const res = await request(app)
      .post('/api/admin/subscription/seat-request')
      .set('Authorization', `Bearer ${token}`)
      .send({ requested_seats: 8 });
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('SUBSCRIPTION_NOT_FOUND');
  });

  test('FOREMAN role rejected with 403 (COMPANY_ADMIN_UP middleware)', async () => {
    const company = await seedCompany();
    await seedSubscription({ company_id: company.company_id, subscribed_seats: 5 });
    const foreman = await seedUser({ company_id: company.company_id, role: 'FOREMAN' });
    const { token } = await loginUser(foreman);
    const res = await request(app)
      .post('/api/admin/subscription/seat-request')
      .set('Authorization', `Bearer ${token}`)
      .send({ requested_seats: 8 });
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');
  });
});

// =============================================================================
// POST /api/admin/subscription/cancel-request
// =============================================================================

describeIfDb('POST /api/admin/subscription/cancel-request', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('COMPANY_ADMIN creates cancellation request → 200 + audit_log row', async () => {
    const ctx = await seedTenantAdmin();
    const res = await request(app)
      .post('/api/admin/subscription/cancel-request')
      .set('Authorization', `Bearer ${ctx.token}`)
      .send({ reason: 'Project finished, no longer need the platform' });

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.mailto_subject).toContain('cancellation');
    expect(typeof res.body.request_audit_id).toBe('number');

    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT action, details FROM public.audit_logs WHERE id = $1`,
      [res.body.request_audit_id]
    );
    expect(rows[0].action).toBe('CUSTOMER_REQUESTED_SUBSCRIPTION_CHANGE');
    expect(rows[0].details.change_category).toBe('CANCEL');
    expect(rows[0].details.requested.cancel_at_period_end).toBe(true);
  });

  test('cancel_at_period_end defaults to true if omitted', async () => {
    const ctx = await seedTenantAdmin();
    const res = await request(app)
      .post('/api/admin/subscription/cancel-request')
      .set('Authorization', `Bearer ${ctx.token}`)
      .send({});
    expect(res.statusCode).toBe(200);

    const pool = getPool();
    const { rows } = await pool.query(`SELECT details FROM public.audit_logs WHERE id = $1`, [
      res.body.request_audit_id,
    ]);
    expect(rows[0].details.requested.cancel_at_period_end).toBe(true);
  });

  test('rejects request when subscription is already CANCELLED', async () => {
    const company = await seedCompany();
    await seedSubscription({ company_id: company.company_id, status: 'CANCELLED' });
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const { token } = await loginUser(admin);
    const res = await request(app)
      .post('/api/admin/subscription/cancel-request')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('ALREADY_CANCELLED');
  });
});

// =============================================================================
// POST /api/admin/subscription/plan-upgrade-request
// =============================================================================

describeIfDb('POST /api/admin/subscription/plan-upgrade-request', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('COMPANY_ADMIN requests plan change → 200 + audit_log row', async () => {
    const ctx = await seedTenantAdmin({ planType: 'MONTHLY' });
    const res = await request(app)
      .post('/api/admin/subscription/plan-upgrade-request')
      .set('Authorization', `Bearer ${ctx.token}`)
      .send({ requested_plan_type: 'ANNUAL', reason: 'Want the 17% discount' });

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.mailto_subject).toContain('MONTHLY → ANNUAL');

    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT action, details FROM public.audit_logs WHERE id = $1`,
      [res.body.request_audit_id]
    );
    expect(rows[0].details.change_category).toBe('PLAN_CHANGE');
    expect(rows[0].details.current.plan_type).toBe('MONTHLY');
    expect(rows[0].details.requested.plan_type).toBe('ANNUAL');
  });

  test('rejects invalid requested_plan_type', async () => {
    const ctx = await seedTenantAdmin();
    const res = await request(app)
      .post('/api/admin/subscription/plan-upgrade-request')
      .set('Authorization', `Bearer ${ctx.token}`)
      .send({ requested_plan_type: 'PLATINUM' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('INVALID_PLAN_TYPE');
  });

  test('rejects when requested plan equals current (NO_CHANGE)', async () => {
    const ctx = await seedTenantAdmin({ planType: 'MONTHLY' });
    const res = await request(app)
      .post('/api/admin/subscription/plan-upgrade-request')
      .set('Authorization', `Bearer ${ctx.token}`)
      .send({ requested_plan_type: 'MONTHLY' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('NO_CHANGE');
  });

  test('uppercases lowercase input (annual → ANNUAL)', async () => {
    const ctx = await seedTenantAdmin({ planType: 'MONTHLY' });
    const res = await request(app)
      .post('/api/admin/subscription/plan-upgrade-request')
      .set('Authorization', `Bearer ${ctx.token}`)
      .send({ requested_plan_type: 'annual' });
    expect(res.statusCode).toBe(200);
  });
});
