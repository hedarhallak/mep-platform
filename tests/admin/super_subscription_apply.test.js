// tests/admin/super_subscription_apply.test.js
//
// Phase 6-D-4 PR 4 / Section 117.4 — SUPER_ADMIN apply-change endpoint.
// Covers SEAT_CHANGE / CANCEL / PLAN_CHANGE branches + auth + Resend mock.
//
// Mounted on adminApp; tests set Host: admin.constrai.ca to route via the
// SUPER_ADMIN sub-app (same pattern as branding_upload.test.js).
//
// Mocks lib/email so the test never actually sends an email — we just
// verify sendEmail was called with the expected shape.

'use strict';

// jest.mock() factory variables MUST start with `mock` (Section 4.6 / Pitfall #fix).
jest.mock('../../lib/email', () => {
  const mockSendEmail = jest.fn(async () => true);
  // escapeHtml is used by lib/email_subscription_change.js for HTML safety.
  // We pass it through to a real implementation since tests don't care about XSS escaping shape.
  const mockEscapeHtml = (s) =>
    String(s ?? '').replace(
      /[&<>"']/g,
      (c) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[c]
    );
  return {
    sendEmail: mockSendEmail,
    escapeHtml: mockEscapeHtml,
    sendAdminWelcome: jest.fn(),
    sendAssignmentEmployee: jest.fn(),
    sendAssignmentForeman: jest.fn(),
    sendPurchaseOrder: jest.fn(),
    getMailClient: () => ({ send: jest.fn() }),
    _resetMailClientForTest: jest.fn(),
  };
});

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../app');
const { JWT_SECRET } = require('../../lib/auth_utils');
const {
  describeIfDb,
  closePool,
  getPool,
  seedCompany,
  seedSubscription,
  seedUser,
  cleanupTestRows,
} = require('../helpers/db');
const { sendEmail } = require('../../lib/email');

function buildSuperAdminToken(user) {
  return jwt.sign(
    {
      user_id: String(user.id),
      username: user.username,
      employee_id: user.employee_id ? String(user.employee_id) : null,
      company_id: user.company_id ? String(user.company_id) : null,
      role: 'SUPER_ADMIN',
      must_change_pin: false,
    },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

function buildTenantToken(user, role = 'FOREMAN') {
  return jwt.sign(
    {
      user_id: String(user.id),
      username: user.username,
      employee_id: user.employee_id ? String(user.employee_id) : null,
      company_id: user.company_id ? String(user.company_id) : null,
      role,
      must_change_pin: false,
    },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

// =============================================================================
// Auth + RBAC
// =============================================================================

describeIfDb('POST /api/super/subscriptions/:id/apply-change — auth + RBAC', () => {
  beforeEach(() => {
    sendEmail.mockClear();
  });

  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('rejects unauthenticated request with 401', async () => {
    const company = await seedCompany();
    const sub = await seedSubscription({ company_id: company.company_id, subscribed_seats: 5 });
    const res = await request(app)
      .post(`/api/super/subscriptions/${sub.id}/apply-change`)
      .set('Host', 'admin.constrai.ca')
      .send({ type: 'SEAT_CHANGE', new_seats: 8 });
    expect(res.statusCode).toBe(401);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test('rejects non-SUPER_ADMIN with 403', async () => {
    const company = await seedCompany();
    const sub = await seedSubscription({ company_id: company.company_id, subscribed_seats: 5 });
    const user = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const token = buildTenantToken(user, 'COMPANY_ADMIN');
    const res = await request(app)
      .post(`/api/super/subscriptions/${sub.id}/apply-change`)
      .set('Host', 'admin.constrai.ca')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'SEAT_CHANGE', new_seats: 8 });
    expect(res.statusCode).toBe(403);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

// =============================================================================
// SEAT_CHANGE
// =============================================================================

describeIfDb('apply-change — SEAT_CHANGE', () => {
  let sa, saToken;
  beforeEach(async () => {
    sendEmail.mockClear();
    sa = await seedUser({ role: 'SUPER_ADMIN', pin: 'sa-pin-1234' });
    saToken = buildSuperAdminToken(sa);
  });

  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('ADD seats: updates subscribed_seats + bracket + price + creates seat_change + audit log', async () => {
    const company = await seedCompany();
    const sub = await seedSubscription({ company_id: company.company_id, subscribed_seats: 5 });
    // Seed an admin so the Resend notify-email lookup has someone to email.
    await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN', pin: '1234' });

    const res = await request(app)
      .post(`/api/super/subscriptions/${sub.id}/apply-change`)
      .set('Host', 'admin.constrai.ca')
      .set('Authorization', `Bearer ${saToken}`)
      .send({
        type: 'SEAT_CHANGE',
        new_seats: 8,
        reason: 'customer approved via email',
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.subscription.subscribed_seats).toBe(8);
    expect(res.body.subscription.current_unit_price_cents).toBe(2500);
    expect(res.body.subscription.current_bracket_label).toBe('6-10');
    expect(res.body.change_type).toBe('ADD');
    expect(typeof res.body.audit_id).toBe('number');
    expect(typeof res.body.seat_change_id).toBe('number');
    expect(res.body.email_sent).toBe(true);

    const pool = getPool();
    // Verify subscription row in DB
    const { rows: subRows } = await pool.query(
      `SELECT subscribed_seats, current_unit_price_cents, current_bracket_label FROM public.subscriptions WHERE id = $1`,
      [sub.id]
    );
    expect(subRows[0].subscribed_seats).toBe(8);
    expect(subRows[0].current_unit_price_cents).toBe(2500);

    // Verify seat_change row
    const { rows: scRows } = await pool.query(
      `SELECT change_type, seats_before, seats_after, delta FROM public.subscription_seat_changes WHERE id = $1`,
      [res.body.seat_change_id]
    );
    expect(scRows[0].change_type).toBe('ADD');
    expect(scRows[0].seats_before).toBe(5);
    expect(scRows[0].seats_after).toBe(8);
    expect(scRows[0].delta).toBe(3);

    // Verify audit_logs row #2
    const { rows: alRows } = await pool.query(
      `SELECT action, entity_id, details FROM public.audit_logs WHERE id = $1`,
      [res.body.audit_id]
    );
    expect(alRows[0].action).toBe('SUPER_ADMIN_APPLIED_SUBSCRIPTION_CHANGE');
    expect(Number(alRows[0].entity_id)).toBe(sub.id);
    expect(alRows[0].details.change_category).toBe('SEAT_CHANGE');
    expect(alRows[0].details.change_type).toBe('ADD');
    expect(alRows[0].details.delta).toBe(3);

    // Verify Resend mock was called with the right shape
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const emailArgs = sendEmail.mock.calls[0][0];
    expect(emailArgs.subject).toContain('Re: Subscription change confirmed');
    expect(emailArgs.html).toContain('SEAT_CHANGE');
    expect(emailArgs.html).toContain('5'); // old seats
    expect(emailArgs.html).toContain('8'); // new seats
  });

  test('REDUCE seats: updates immediately + change_type REDUCE', async () => {
    const company = await seedCompany();
    const sub = await seedSubscription({ company_id: company.company_id, subscribed_seats: 25 });
    await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN', pin: '1234' });

    const res = await request(app)
      .post(`/api/super/subscriptions/${sub.id}/apply-change`)
      .set('Host', 'admin.constrai.ca')
      .set('Authorization', `Bearer ${saToken}`)
      .send({ type: 'SEAT_CHANGE', new_seats: 10 });

    expect(res.statusCode).toBe(200);
    expect(res.body.subscription.subscribed_seats).toBe(10);
    expect(res.body.subscription.current_bracket_label).toBe('6-10');
    expect(res.body.subscription.current_unit_price_cents).toBe(2500);
    expect(res.body.change_type).toBe('REDUCE');
  });

  test('rejects new_seats not an integer', async () => {
    const company = await seedCompany();
    const sub = await seedSubscription({ company_id: company.company_id });
    const res = await request(app)
      .post(`/api/super/subscriptions/${sub.id}/apply-change`)
      .set('Host', 'admin.constrai.ca')
      .set('Authorization', `Bearer ${saToken}`)
      .send({ type: 'SEAT_CHANGE', new_seats: 'lots' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('INVALID_NEW_SEATS');
  });

  test('rejects NO_CHANGE when new_seats equals current', async () => {
    const company = await seedCompany();
    const sub = await seedSubscription({ company_id: company.company_id, subscribed_seats: 7 });
    const res = await request(app)
      .post(`/api/super/subscriptions/${sub.id}/apply-change`)
      .set('Host', 'admin.constrai.ca')
      .set('Authorization', `Bearer ${saToken}`)
      .send({ type: 'SEAT_CHANGE', new_seats: 7 });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('NO_CHANGE');
  });

  test('send_confirmation_email=false skips Resend', async () => {
    const company = await seedCompany();
    const sub = await seedSubscription({ company_id: company.company_id, subscribed_seats: 5 });
    await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN', pin: '1234' });

    const res = await request(app)
      .post(`/api/super/subscriptions/${sub.id}/apply-change`)
      .set('Host', 'admin.constrai.ca')
      .set('Authorization', `Bearer ${saToken}`)
      .send({ type: 'SEAT_CHANGE', new_seats: 8, send_confirmation_email: false });

    expect(res.statusCode).toBe(200);
    expect(res.body.email_sent).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

// =============================================================================
// CANCEL
// =============================================================================

describeIfDb('apply-change — CANCEL', () => {
  let sa, saToken;
  beforeEach(async () => {
    sendEmail.mockClear();
    sa = await seedUser({ role: 'SUPER_ADMIN', pin: 'sa-pin-1234' });
    saToken = buildSuperAdminToken(sa);
  });

  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('cancel_at_period_end=true: sets flag, status stays ACTIVE', async () => {
    const company = await seedCompany();
    const sub = await seedSubscription({ company_id: company.company_id });
    await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN', pin: '1234' });

    const res = await request(app)
      .post(`/api/super/subscriptions/${sub.id}/apply-change`)
      .set('Host', 'admin.constrai.ca')
      .set('Authorization', `Bearer ${saToken}`)
      .send({ type: 'CANCEL', cancel_at_period_end: true, reason: 'Project finished' });

    expect(res.statusCode).toBe(200);
    expect(res.body.subscription.status).toBe('ACTIVE');
    expect(res.body.subscription.cancel_at_period_end).toBe(true);
    expect(res.body.subscription.cancellation_reason).toBe('Project finished');
  });

  test('cancel_at_period_end=false: immediate CANCELLED + cancelled_at set', async () => {
    const company = await seedCompany();
    const sub = await seedSubscription({ company_id: company.company_id });
    await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN', pin: '1234' });

    const res = await request(app)
      .post(`/api/super/subscriptions/${sub.id}/apply-change`)
      .set('Host', 'admin.constrai.ca')
      .set('Authorization', `Bearer ${saToken}`)
      .send({ type: 'CANCEL', cancel_at_period_end: false, reason: 'fraud detected' });

    expect(res.statusCode).toBe(200);
    expect(res.body.subscription.status).toBe('CANCELLED');
    expect(res.body.subscription.cancelled_at).toBeTruthy();
    expect(res.body.subscription.cancel_at_period_end).toBe(false);
  });

  test('rejects ALREADY_CANCELLED', async () => {
    const company = await seedCompany();
    const sub = await seedSubscription({ company_id: company.company_id, status: 'CANCELLED' });
    const res = await request(app)
      .post(`/api/super/subscriptions/${sub.id}/apply-change`)
      .set('Host', 'admin.constrai.ca')
      .set('Authorization', `Bearer ${saToken}`)
      .send({ type: 'CANCEL' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('ALREADY_CANCELLED');
  });
});

// =============================================================================
// PLAN_CHANGE
// =============================================================================

describeIfDb('apply-change — PLAN_CHANGE', () => {
  let sa, saToken;
  beforeEach(async () => {
    sendEmail.mockClear();
    sa = await seedUser({ role: 'SUPER_ADMIN', pin: 'sa-pin-1234' });
    saToken = buildSuperAdminToken(sa);
  });

  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('MONTHLY → ANNUAL updates plan_type + billing_cycle', async () => {
    const company = await seedCompany();
    const sub = await seedSubscription({ company_id: company.company_id, plan_type: 'MONTHLY' });
    await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN', pin: '1234' });

    const res = await request(app)
      .post(`/api/super/subscriptions/${sub.id}/apply-change`)
      .set('Host', 'admin.constrai.ca')
      .set('Authorization', `Bearer ${saToken}`)
      .send({ type: 'PLAN_CHANGE', new_plan_type: 'ANNUAL' });

    expect(res.statusCode).toBe(200);
    expect(res.body.subscription.plan_type).toBe('ANNUAL');
    expect(res.body.subscription.billing_cycle).toBe('ANNUAL');
  });

  test('MONTHLY → ENTERPRISE updates plan_type, billing_cycle stays MONTHLY', async () => {
    const company = await seedCompany();
    const sub = await seedSubscription({ company_id: company.company_id, plan_type: 'MONTHLY' });
    const res = await request(app)
      .post(`/api/super/subscriptions/${sub.id}/apply-change`)
      .set('Host', 'admin.constrai.ca')
      .set('Authorization', `Bearer ${saToken}`)
      .send({ type: 'PLAN_CHANGE', new_plan_type: 'ENTERPRISE', send_confirmation_email: false });

    expect(res.statusCode).toBe(200);
    expect(res.body.subscription.plan_type).toBe('ENTERPRISE');
    expect(res.body.subscription.billing_cycle).toBe('MONTHLY');
  });

  test('rejects invalid plan type', async () => {
    const company = await seedCompany();
    const sub = await seedSubscription({ company_id: company.company_id });
    const res = await request(app)
      .post(`/api/super/subscriptions/${sub.id}/apply-change`)
      .set('Host', 'admin.constrai.ca')
      .set('Authorization', `Bearer ${saToken}`)
      .send({ type: 'PLAN_CHANGE', new_plan_type: 'PLATINUM' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('INVALID_PLAN_TYPE');
  });
});

// =============================================================================
// Generic input validation
// =============================================================================

describeIfDb('apply-change — input validation', () => {
  let sa, saToken;
  beforeEach(async () => {
    sa = await seedUser({ role: 'SUPER_ADMIN', pin: 'sa-pin-1234' });
    saToken = buildSuperAdminToken(sa);
  });

  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('rejects invalid type', async () => {
    const company = await seedCompany();
    const sub = await seedSubscription({ company_id: company.company_id });
    const res = await request(app)
      .post(`/api/super/subscriptions/${sub.id}/apply-change`)
      .set('Host', 'admin.constrai.ca')
      .set('Authorization', `Bearer ${saToken}`)
      .send({ type: 'TELEPORT' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('INVALID_TYPE');
  });

  test('404 on non-existent subscription_id', async () => {
    const res = await request(app)
      .post(`/api/super/subscriptions/9999999/apply-change`)
      .set('Host', 'admin.constrai.ca')
      .set('Authorization', `Bearer ${saToken}`)
      .send({ type: 'SEAT_CHANGE', new_seats: 5 });
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('SUBSCRIPTION_NOT_FOUND');
  });

  test('400 on invalid id (non-numeric)', async () => {
    const res = await request(app)
      .post(`/api/super/subscriptions/abc/apply-change`)
      .set('Host', 'admin.constrai.ca')
      .set('Authorization', `Bearer ${saToken}`)
      .send({ type: 'SEAT_CHANGE', new_seats: 5 });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('INVALID_ID');
  });
});
