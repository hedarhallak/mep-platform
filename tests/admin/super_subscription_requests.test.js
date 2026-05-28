// tests/admin/super_subscription_requests.test.js
//
// Phase 6-D-6 PR 1 / Section 120 — SUPER_ADMIN subscription request inbox.
// Verifies the GET /api/super/subscription-requests contract:
//   - Auth: SUPER_ADMIN required (anonymous → 401, non-SA → 403).
//   - Pending rows: returns only CUSTOMER_REQUESTED_* audit rows that
//     have NO matching SUPER_ADMIN_APPLIED_* follow-up.
//   - Shape: { ok, requests: [{ audit_id, change_category, current,
//             requested, requester, company, subscription }] }
//   - Cross-company visibility: SA sees pending requests from EVERY tenant.

'use strict';

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

function buildTenantToken(user, role = 'COMPANY_ADMIN') {
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

async function insertRequestAuditRow(pool, { companyId, userId, username, details }) {
  const { rows } = await pool.query(
    `INSERT INTO public.audit_logs
       (company_id, user_id, username, role, action, entity_type, entity_id,
        entity_name, details, created_at)
     VALUES ($1, $2, $3, 'COMPANY_ADMIN', 'CUSTOMER_REQUESTED_SUBSCRIPTION_CHANGE',
             'subscription', NULL, 'SEAT_CHANGE request',
             $4, NOW())
     RETURNING id`,
    [companyId, userId, username, JSON.stringify(details)]
  );
  return Number(rows[0].id);
}

async function insertApplyAuditRow(pool, { companyId, requestAuditId }) {
  await pool.query(
    `INSERT INTO public.audit_logs
       (company_id, action, entity_type, entity_id, entity_name, details, created_at)
     VALUES ($1, 'SUPER_ADMIN_APPLIED_SUBSCRIPTION_CHANGE', 'subscription', NULL,
             'apply', $2, NOW())`,
    [companyId, JSON.stringify({ request_audit_id: requestAuditId })]
  );
}

// =============================================================================
// Auth + RBAC
// =============================================================================

describeIfDb('GET /api/super/subscription-requests — auth + RBAC', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('rejects unauthenticated request with 401', async () => {
    const res = await request(app)
      .get('/api/super/subscription-requests')
      .set('Host', 'admin.constrai.ca');
    expect(res.statusCode).toBe(401);
  });

  test('rejects non-SUPER_ADMIN with 403', async () => {
    const company = await seedCompany();
    const user = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const token = buildTenantToken(user, 'COMPANY_ADMIN');
    const res = await request(app)
      .get('/api/super/subscription-requests')
      .set('Host', 'admin.constrai.ca')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(403);
  });
});

// =============================================================================
// Pending filtering
// =============================================================================

describeIfDb('GET /api/super/subscription-requests — pending filtering', () => {
  let sa, saToken;
  beforeEach(async () => {
    sa = await seedUser({ role: 'SUPER_ADMIN', pin: 'sa-pin-1234' });
    saToken = buildSuperAdminToken(sa);
  });

  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('returns CUSTOMER_REQUESTED rows that have no matching APPLY row', async () => {
    const pool = getPool();
    const company = await seedCompany();
    await seedSubscription({ company_id: company.company_id, subscribed_seats: 5 });
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });

    // Pending request (no matching apply)
    const pendingId = await insertRequestAuditRow(pool, {
      companyId: company.company_id,
      userId: admin.id,
      username: admin.username,
      details: {
        change_category: 'SEAT_CHANGE',
        current: { subscribed_seats: 5, unit_price_cents: 2700, bracket_label: '1-5' },
        requested: { subscribed_seats: 9 },
        reason: 'Hiring 4 new foremen',
        source: 'web_app_button',
      },
    });

    // Already-applied request (excluded from inbox)
    const appliedRequestId = await insertRequestAuditRow(pool, {
      companyId: company.company_id,
      userId: admin.id,
      username: admin.username,
      details: {
        change_category: 'SEAT_CHANGE',
        current: { subscribed_seats: 3 },
        requested: { subscribed_seats: 5 },
      },
    });
    await insertApplyAuditRow(pool, {
      companyId: company.company_id,
      requestAuditId: appliedRequestId,
    });

    const res = await request(app)
      .get('/api/super/subscription-requests')
      .set('Host', 'admin.constrai.ca')
      .set('Authorization', `Bearer ${saToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    const ids = res.body.requests.map((r) => r.audit_id);
    expect(ids).toContain(pendingId);
    expect(ids).not.toContain(appliedRequestId);

    const pending = res.body.requests.find((r) => r.audit_id === pendingId);
    expect(pending.change_category).toBe('SEAT_CHANGE');
    expect(pending.current.subscribed_seats).toBe(5);
    expect(pending.requested.subscribed_seats).toBe(9);
    expect(pending.reason).toBe('Hiring 4 new foremen');
    expect(pending.company.id).toBe(Number(company.company_id));
    expect(pending.company.name).toBe(company.name);
    expect(pending.requester.username).toBe(admin.username);
    expect(pending.subscription.subscribed_seats).toBe(5);
  });

  test('shows pending rows from multiple companies (cross-tenant visibility)', async () => {
    const pool = getPool();
    const c1 = await seedCompany();
    const c2 = await seedCompany();
    await seedSubscription({ company_id: c1.company_id, subscribed_seats: 5 });
    await seedSubscription({ company_id: c2.company_id, subscribed_seats: 12 });
    const admin1 = await seedUser({ company_id: c1.company_id, role: 'COMPANY_ADMIN' });
    const admin2 = await seedUser({ company_id: c2.company_id, role: 'COMPANY_ADMIN' });

    const id1 = await insertRequestAuditRow(pool, {
      companyId: c1.company_id,
      userId: admin1.id,
      username: admin1.username,
      details: {
        change_category: 'SEAT_CHANGE',
        current: { subscribed_seats: 5 },
        requested: { subscribed_seats: 7 },
      },
    });
    const id2 = await insertRequestAuditRow(pool, {
      companyId: c2.company_id,
      userId: admin2.id,
      username: admin2.username,
      details: {
        change_category: 'CANCEL',
        current: { plan_type: 'MONTHLY' },
        requested: { cancel_at_period_end: true },
      },
    });

    const res = await request(app)
      .get('/api/super/subscription-requests')
      .set('Host', 'admin.constrai.ca')
      .set('Authorization', `Bearer ${saToken}`);

    expect(res.statusCode).toBe(200);
    const ids = res.body.requests.map((r) => r.audit_id);
    expect(ids).toContain(id1);
    expect(ids).toContain(id2);
  });
});
