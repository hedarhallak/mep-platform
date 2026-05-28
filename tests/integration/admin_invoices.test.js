// tests/integration/admin_invoices.test.js
//
// Phase 6-D-5 PR 2 / Section 119 — customer-facing invoices list endpoint.
// Verifies the GET /api/admin/invoices contract used by the tenant Billing
// page.

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

async function seedTenantAdmin() {
  const company = await seedCompany();
  await seedSubscription({
    company_id: company.company_id,
    subscribed_seats: 5,
    plan_type: 'MONTHLY',
  });
  const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
  const { token } = await loginUser(admin);
  return { company, admin, token };
}

async function insertInvoice(pool, { companyId, type, status, totalCents, daysAgo }) {
  const subtotal = totalCents;
  const num = `TEST-INV-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const { rows } = await pool.query(
    `INSERT INTO public.invoices
       (company_id, type, invoice_number, status,
        subtotal_cents, qst_cents, gst_cents, total_cents,
        issue_date)
     VALUES ($1, $2, $3, $4,
             $5, 0, 0, $5,
             CURRENT_DATE - ($6::int || ' days')::interval)
     RETURNING id, invoice_number`,
    [companyId, type, num, status, subtotal, daysAgo]
  );
  return rows[0];
}

// =============================================================================
// GET /api/admin/invoices
// =============================================================================

describeIfDb('GET /api/admin/invoices', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('COMPANY_ADMIN reads only their own company invoices → 200 + paginated', async () => {
    const pool = getPool();
    const ctx = await seedTenantAdmin();

    // Seed 3 invoices for this company + 1 for another company (cross-tenant
    // leakage guard).
    await insertInvoice(pool, {
      companyId: ctx.company.company_id,
      type: 'TRAINING',
      status: 'PAID',
      totalCents: 80000,
      daysAgo: 1,
    });
    await insertInvoice(pool, {
      companyId: ctx.company.company_id,
      type: 'SUBSCRIPTION_RECURRING',
      status: 'APPROVED',
      totalCents: 13500,
      daysAgo: 5,
    });
    await insertInvoice(pool, {
      companyId: ctx.company.company_id,
      type: 'CUSTOM_DEMAND',
      status: 'DRAFT',
      totalCents: 200000,
      daysAgo: 10,
    });
    const other = await seedCompany();
    await insertInvoice(pool, {
      companyId: other.company_id,
      type: 'OTHER',
      status: 'PAID',
      totalCents: 100,
      daysAgo: 0,
    });

    const res = await request(app)
      .get('/api/admin/invoices')
      .set('Authorization', `Bearer ${ctx.token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.invoices)).toBe(true);
    expect(res.body.invoices.length).toBe(3); // cross-tenant row excluded
    expect(res.body.pagination).toMatchObject({
      page: 1,
      limit: 20,
      total: 3,
      total_pages: 1,
    });
    // newest first
    const dates = res.body.invoices.map((i) => i.issue_date);
    expect(new Date(dates[0]).getTime()).toBeGreaterThanOrEqual(new Date(dates[1]).getTime());
  });

  test('type filter limits results to the requested ENUM value', async () => {
    const pool = getPool();
    const ctx = await seedTenantAdmin();
    await insertInvoice(pool, {
      companyId: ctx.company.company_id,
      type: 'TRAINING',
      status: 'PAID',
      totalCents: 80000,
      daysAgo: 1,
    });
    await insertInvoice(pool, {
      companyId: ctx.company.company_id,
      type: 'TRAINING',
      status: 'DRAFT',
      totalCents: 50000,
      daysAgo: 2,
    });
    await insertInvoice(pool, {
      companyId: ctx.company.company_id,
      type: 'SUBSCRIPTION_RECURRING',
      status: 'APPROVED',
      totalCents: 13500,
      daysAgo: 3,
    });

    const res = await request(app)
      .get('/api/admin/invoices?type=TRAINING')
      .set('Authorization', `Bearer ${ctx.token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.invoices).toHaveLength(2);
    expect(res.body.invoices.every((i) => i.type === 'TRAINING')).toBe(true);
  });

  test('rejects invalid type filter with 400', async () => {
    const ctx = await seedTenantAdmin();
    const res = await request(app)
      .get('/api/admin/invoices?type=GARBAGE')
      .set('Authorization', `Bearer ${ctx.token}`);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('INVALID_TYPE');
  });

  test('rejects unauthenticated request with 401', async () => {
    const res = await request(app).get('/api/admin/invoices');
    expect([401, 403]).toContain(res.statusCode);
  });
});
