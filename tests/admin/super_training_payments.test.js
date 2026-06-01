// tests/admin/super_training_payments.test.js
//
// Phase 6-D-4 PR 5 — integration tests for SUPER_ADMIN training quote +
// custom-demand quote + payment recording + extend-trial endpoints.
//
// Mounted on adminApp; tests set Host: admin.constrai.ca to route via the
// SUPER_ADMIN sub-app (same pattern as branding_upload.test.js + super_subscription_apply).
//
// Mocks lib/email so quote-send doesn't actually fire Resend.

'use strict';

jest.mock('../../lib/email', () => {
  const mockSendEmail = jest.fn(async () => true);
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

// =============================================================================
// GET /api/super/training/quotes  (Phase 6-D-6 PR 2 / Section 120)
// =============================================================================

describeIfDb('GET /api/super/training/quotes', () => {
  let sa, saToken;
  beforeEach(async () => {
    sa = await seedUser({ role: 'SUPER_ADMIN', pin: 'sa-pin-1234' });
    saToken = buildSuperAdminToken(sa);
  });

  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('SUPER_ADMIN sees TRAINING invoices across all tenants', async () => {
    const pool = getPool();
    const c1 = await seedCompany();
    const c2 = await seedCompany();
    await seedSubscription({ company_id: c1.company_id, subscribed_seats: 5 });
    await seedSubscription({ company_id: c2.company_id, subscribed_seats: 5 });

    // 2 TRAINING + 1 SUBSCRIPTION (should be filtered out)
    const insert = (companyId, type, num, total) =>
      pool.query(
        `INSERT INTO public.invoices
           (company_id, type, invoice_number, status, subtotal_cents,
            qst_cents, gst_cents, total_cents, issue_date)
         VALUES ($1, $2, $3, 'DRAFT', $4, 0, 0, $4, CURRENT_DATE)`,
        [companyId, type, num, total]
      );
    const stamp = Date.now();
    await insert(c1.company_id, 'TRAINING', `T1-${stamp}`, 80000);
    await insert(c2.company_id, 'TRAINING', `T2-${stamp}`, 120000);
    await insert(c1.company_id, 'SUBSCRIPTION_RECURRING', `S1-${stamp}`, 13500);

    const res = await request(app)
      .get('/api/super/training/quotes')
      .set('Host', 'admin.constrai.ca')
      .set('Authorization', `Bearer ${saToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    const types = res.body.quotes.map((q) => q.type || 'TRAINING');
    expect(
      res.body.quotes.every(
        (q) => /^T\d/.test(q.invoice_number) === true || /TRAIN|CONS/.test(q.invoice_number)
      )
    ).toBe(true);
    // The 2 we just inserted must be present
    const nums = res.body.quotes.map((q) => q.invoice_number);
    expect(nums).toContain(`T1-${stamp}`);
    expect(nums).toContain(`T2-${stamp}`);
    // The SUBSCRIPTION row must not be present
    expect(nums).not.toContain(`S1-${stamp}`);
  });

  test('status filter limits results', async () => {
    const pool = getPool();
    const c = await seedCompany();
    const stamp = Date.now();
    await pool.query(
      `INSERT INTO public.invoices
         (company_id, type, invoice_number, status, subtotal_cents,
          qst_cents, gst_cents, total_cents, issue_date)
       VALUES ($1, 'TRAINING', $2, 'DRAFT', 80000, 0, 0, 80000, CURRENT_DATE),
              ($1, 'TRAINING', $3, 'QUOTE_SENT', 90000, 0, 0, 90000, CURRENT_DATE)`,
      [c.company_id, `Ts-D-${stamp}`, `Ts-Q-${stamp}`]
    );

    const res = await request(app)
      .get('/api/super/training/quotes?status=QUOTE_SENT')
      .set('Host', 'admin.constrai.ca')
      .set('Authorization', `Bearer ${saToken}`);

    expect(res.statusCode).toBe(200);
    const nums = res.body.quotes.map((q) => q.invoice_number);
    expect(nums).toContain(`Ts-Q-${stamp}`);
    expect(nums).not.toContain(`Ts-D-${stamp}`);
  });

  test('rejects unauthenticated with 401', async () => {
    const res = await request(app)
      .get('/api/super/training/quotes')
      .set('Host', 'admin.constrai.ca');
    expect(res.statusCode).toBe(401);
  });
});

// =============================================================================
// POST /api/super/training/quotes
// =============================================================================

describeIfDb('POST /api/super/training/quotes', () => {
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

  test('creates DRAFT TRAINING invoice with sequential CONS-YYYY-NNNN', async () => {
    const company = await seedCompany();
    const res = await request(app)
      .post('/api/super/training/quotes')
      .set('Host', 'admin.constrai.ca')
      .set('Authorization', `Bearer ${saToken}`)
      .send({
        company_id: company.company_id,
        trainees: [
          { role: 'ADMIN', count: 1 },
          { role: 'PROJECT_MANAGER', count: 1 },
          { role: 'FOREMAN', count: 2 },
          { role: 'WORKER', count: 2 },
        ],
        distance_km: 30,
        training_days: 1,
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.invoice.type).toBe('TRAINING');
    expect(res.body.invoice.status).toBe('DRAFT');
    expect(res.body.invoice.invoice_number).toMatch(/^CONS-\d{4}-\d{4}$/);
    expect(res.body.invoice.subtotal_cents).toBe(80000); // $800 base only
    expect(Number(res.body.invoice.qst_cents)).toBeGreaterThan(0);
    expect(Number(res.body.invoice.gst_cents)).toBeGreaterThan(0);
    expect(res.body.invoice.total_cents).toBe(
      res.body.invoice.subtotal_cents +
        Number(res.body.invoice.qst_cents) +
        Number(res.body.invoice.gst_cents)
    );
  });

  test('invoice_number increments across two quotes', async () => {
    const co1 = await seedCompany();
    const co2 = await seedCompany();
    const r1 = await request(app)
      .post('/api/super/training/quotes')
      .set('Host', 'admin.constrai.ca')
      .set('Authorization', `Bearer ${saToken}`)
      .send({
        company_id: co1.company_id,
        trainees: [{ role: 'ADMIN', count: 1 }],
        distance_km: 0,
        training_days: 1,
      });
    const r2 = await request(app)
      .post('/api/super/training/quotes')
      .set('Host', 'admin.constrai.ca')
      .set('Authorization', `Bearer ${saToken}`)
      .send({
        company_id: co2.company_id,
        trainees: [{ role: 'ADMIN', count: 1 }],
        distance_km: 0,
        training_days: 1,
      });

    const seq = (n) => Number(n.invoice_number.match(/-(\d+)$/)[1]);
    expect(seq(r2.body.invoice)).toBe(seq(r1.body.invoice) + 1);
  });

  test('400 INVALID_COMPANY_ID', async () => {
    const res = await request(app)
      .post('/api/super/training/quotes')
      .set('Host', 'admin.constrai.ca')
      .set('Authorization', `Bearer ${saToken}`)
      .send({
        company_id: 0,
        trainees: [{ role: 'ADMIN', count: 1 }],
        distance_km: 0,
        training_days: 1,
      });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('INVALID_COMPANY_ID');
  });

  test('404 COMPANY_NOT_FOUND', async () => {
    const res = await request(app)
      .post('/api/super/training/quotes')
      .set('Host', 'admin.constrai.ca')
      .set('Authorization', `Bearer ${saToken}`)
      .send({
        company_id: 9999999,
        trainees: [{ role: 'ADMIN', count: 1 }],
        distance_km: 0,
        training_days: 1,
      });
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('COMPANY_NOT_FOUND');
  });

  test('400 on invalid trainee role', async () => {
    const company = await seedCompany();
    const res = await request(app)
      .post('/api/super/training/quotes')
      .set('Host', 'admin.constrai.ca')
      .set('Authorization', `Bearer ${saToken}`)
      .send({
        company_id: company.company_id,
        trainees: [{ role: 'JANITOR', count: 1 }],
        distance_km: 0,
        training_days: 1,
      });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('INVALID_TRAINEE_ROLE');
  });
});

// =============================================================================
// POST /api/super/training/quotes/:id/send
// =============================================================================

describeIfDb('POST /api/super/training/quotes/:id/send', () => {
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

  test('DRAFT → QUOTE_SENT + sendEmail called', async () => {
    const company = await seedCompany();
    await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN', pin: '1234' });

    // Create quote
    const created = await request(app)
      .post('/api/super/training/quotes')
      .set('Host', 'admin.constrai.ca')
      .set('Authorization', `Bearer ${saToken}`)
      .send({
        company_id: company.company_id,
        trainees: [{ role: 'ADMIN', count: 1 }],
        distance_km: 0,
        training_days: 1,
      });
    const invoiceId = created.body.invoice.id;

    // Send it
    const sent = await request(app)
      .post(`/api/super/training/quotes/${invoiceId}/send`)
      .set('Host', 'admin.constrai.ca')
      .set('Authorization', `Bearer ${saToken}`)
      .send({});

    expect(sent.statusCode).toBe(200);
    expect(sent.body.invoice.status).toBe('QUOTE_SENT');
    expect(sent.body.email_sent).toBe(true);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0].subject).toContain('Training quote CONS-');
  });

  test('400 when invoice already PAID', async () => {
    const company = await seedCompany();
    const pool = getPool();
    const { rows } = await pool.query(
      `INSERT INTO public.invoices
         (company_id, type, invoice_number, status, subtotal_cents, total_cents, issue_date)
       VALUES ($1, 'TRAINING', $2, 'PAID', 10000, 10000, CURRENT_DATE) RETURNING id`,
      [company.company_id, `CONS-TEST-${Date.now()}`]
    );
    const res = await request(app)
      .post(`/api/super/training/quotes/${rows[0].id}/send`)
      .set('Host', 'admin.constrai.ca')
      .set('Authorization', `Bearer ${saToken}`)
      .send({});
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('INVALID_STATUS');
  });
});

// =============================================================================
// GET /api/super/custom-demands/quotes  (Phase 6-D-6 PR 3 / Section 122)
// =============================================================================

describeIfDb('GET /api/super/custom-demands/quotes', () => {
  let sa, saToken;
  beforeEach(async () => {
    sa = await seedUser({ role: 'SUPER_ADMIN', pin: 'sa-pin-1234' });
    saToken = buildSuperAdminToken(sa);
  });

  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('SUPER_ADMIN sees CUSTOM_DEMAND invoices across all tenants', async () => {
    const pool = getPool();
    const c1 = await seedCompany();
    const c2 = await seedCompany();

    // 2 CUSTOM_DEMAND + 1 TRAINING (should be filtered out)
    const insert = (companyId, type, num, total) =>
      pool.query(
        `INSERT INTO public.invoices
           (company_id, type, invoice_number, status, subtotal_cents,
            qst_cents, gst_cents, total_cents, issue_date)
         VALUES ($1, $2, $3, 'DRAFT', $4, 0, 0, $4, CURRENT_DATE)`,
        [companyId, type, num, total]
      );
    const stamp = Date.now();
    await insert(c1.company_id, 'CUSTOM_DEMAND', `CD1-${stamp}`, 400000);
    await insert(c2.company_id, 'CUSTOM_DEMAND', `CD2-${stamp}`, 250000);
    await insert(c1.company_id, 'TRAINING', `TR1-${stamp}`, 80000);

    const res = await request(app)
      .get('/api/super/custom-demands/quotes')
      .set('Host', 'admin.constrai.ca')
      .set('Authorization', `Bearer ${saToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    const nums = res.body.quotes.map((q) => q.invoice_number);
    expect(nums).toContain(`CD1-${stamp}`);
    expect(nums).toContain(`CD2-${stamp}`);
    expect(nums).not.toContain(`TR1-${stamp}`);
    // company_name is joined from companies table
    const sampleCd = res.body.quotes.find((q) => q.invoice_number === `CD1-${stamp}`);
    expect(sampleCd.company_name).toBe(c1.name);
  });

  test('status filter limits results', async () => {
    const pool = getPool();
    const c = await seedCompany();
    const stamp = Date.now();
    await pool.query(
      `INSERT INTO public.invoices
         (company_id, type, invoice_number, status, subtotal_cents,
          qst_cents, gst_cents, total_cents, issue_date)
       VALUES ($1, 'CUSTOM_DEMAND', $2, 'DRAFT', 400000, 0, 0, 400000, CURRENT_DATE),
              ($1, 'CUSTOM_DEMAND', $3, 'QUOTE_SENT', 500000, 0, 0, 500000, CURRENT_DATE)`,
      [c.company_id, `CDs-D-${stamp}`, `CDs-Q-${stamp}`]
    );

    const res = await request(app)
      .get('/api/super/custom-demands/quotes?status=QUOTE_SENT')
      .set('Host', 'admin.constrai.ca')
      .set('Authorization', `Bearer ${saToken}`);

    expect(res.statusCode).toBe(200);
    const nums = res.body.quotes.map((q) => q.invoice_number);
    expect(nums).toContain(`CDs-Q-${stamp}`);
    expect(nums).not.toContain(`CDs-D-${stamp}`);
  });

  test('rejects unauthenticated with 401', async () => {
    const res = await request(app)
      .get('/api/super/custom-demands/quotes')
      .set('Host', 'admin.constrai.ca');
    expect(res.statusCode).toBe(401);
  });
});

// =============================================================================
// POST /api/super/custom-demands/quotes
// =============================================================================

describeIfDb('POST /api/super/custom-demands/quotes', () => {
  let sa, saToken;
  beforeEach(async () => {
    sa = await seedUser({ role: 'SUPER_ADMIN', pin: 'sa-pin-1234' });
    saToken = buildSuperAdminToken(sa);
  });

  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('creates DRAFT CUSTOM_DEMAND invoice with milestones', async () => {
    const company = await seedCompany();
    const res = await request(app)
      .post('/api/super/custom-demands/quotes')
      .set('Host', 'admin.constrai.ca')
      .set('Authorization', `Bearer ${saToken}`)
      .send({
        company_id: company.company_id,
        title: 'QuickBooks integration',
        description: 'Two-way sync',
        scope_of_work: '...detailed SOW...',
        subtotal_cents: 400000,
        milestones: [
          { name: 'Discovery + design', amount_cents: 100000, due_after_days: 14 },
          { name: 'Development', amount_cents: 200000, due_after_days: 45 },
          { name: 'Testing + deployment', amount_cents: 100000, due_after_days: 60 },
        ],
      });
    expect(res.statusCode).toBe(200);
    expect(res.body.invoice.type).toBe('CUSTOM_DEMAND');
    expect(res.body.invoice.status).toBe('DRAFT');
    expect(res.body.invoice.subtotal_cents).toBe(400000);
    expect(res.body.invoice.details.milestones).toHaveLength(3);
  });

  test('400 INVALID_TITLE on empty title', async () => {
    const company = await seedCompany();
    const res = await request(app)
      .post('/api/super/custom-demands/quotes')
      .set('Host', 'admin.constrai.ca')
      .set('Authorization', `Bearer ${saToken}`)
      .send({ company_id: company.company_id, title: '', subtotal_cents: 1000 });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('INVALID_TITLE');
  });

  test('400 INVALID_SUBTOTAL_CENTS on negative', async () => {
    const company = await seedCompany();
    const res = await request(app)
      .post('/api/super/custom-demands/quotes')
      .set('Host', 'admin.constrai.ca')
      .set('Authorization', `Bearer ${saToken}`)
      .send({ company_id: company.company_id, title: 'Test', subtotal_cents: -100 });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('INVALID_SUBTOTAL_CENTS');
  });
});

// =============================================================================
// POST /api/super/payments/record
// =============================================================================

describeIfDb('POST /api/super/payments/record', () => {
  let sa, saToken;
  beforeEach(async () => {
    sa = await seedUser({ role: 'SUPER_ADMIN', pin: 'sa-pin-1234' });
    saToken = buildSuperAdminToken(sa);
  });

  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  async function createInvoiceForPayment(companyId, total = 100000) {
    const pool = getPool();
    const { rows } = await pool.query(
      `INSERT INTO public.invoices
         (company_id, type, invoice_number, status, subtotal_cents, total_cents, issue_date)
       VALUES ($1, 'TRAINING', $2, 'APPROVED', $3, $3, CURRENT_DATE) RETURNING id, total_cents`,
      [companyId, `CONS-PAYTEST-${Date.now()}-${Math.floor(Math.random() * 9999)}`, total]
    );
    return rows[0];
  }

  test('full payment → invoice transitions to PAID', async () => {
    const company = await seedCompany();
    const inv = await createInvoiceForPayment(company.company_id, 100000);
    const res = await request(app)
      .post('/api/super/payments/record')
      .set('Host', 'admin.constrai.ca')
      .set('Authorization', `Bearer ${saToken}`)
      .send({
        invoice_id: inv.id,
        amount_cents: 100000,
        method: 'BANK_TRANSFER',
        external_ref: 'BT-2026-001',
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.payment.amount_cents).toBe(100000);
    expect(res.body.invoice.status).toBe('PAID');
    expect(res.body.invoice.amount_paid_cents).toBe(100000);
    expect(res.body.invoice.paid_date).toBeTruthy();
  });

  test('partial payment → PARTIAL_PAID', async () => {
    const company = await seedCompany();
    const inv = await createInvoiceForPayment(company.company_id, 100000);
    const res = await request(app)
      .post('/api/super/payments/record')
      .set('Host', 'admin.constrai.ca')
      .set('Authorization', `Bearer ${saToken}`)
      .send({
        invoice_id: inv.id,
        amount_cents: 50000,
        method: 'CHEQUE',
      });
    expect(res.statusCode).toBe(200);
    expect(res.body.invoice.status).toBe('PARTIAL_PAID');
    expect(res.body.invoice.amount_paid_cents).toBe(50000);
    expect(res.body.payment.is_partial).toBe(true);
  });

  test('50/50 second payment → PAID', async () => {
    const company = await seedCompany();
    const inv = await createInvoiceForPayment(company.company_id, 100000);

    // First half
    await request(app)
      .post('/api/super/payments/record')
      .set('Host', 'admin.constrai.ca')
      .set('Authorization', `Bearer ${saToken}`)
      .send({ invoice_id: inv.id, amount_cents: 50000, method: 'CHEQUE' });

    // Second half
    const res = await request(app)
      .post('/api/super/payments/record')
      .set('Host', 'admin.constrai.ca')
      .set('Authorization', `Bearer ${saToken}`)
      .send({ invoice_id: inv.id, amount_cents: 50000, method: 'CHEQUE' });

    expect(res.body.invoice.status).toBe('PAID');
    expect(res.body.invoice.amount_paid_cents).toBe(100000);
  });

  test('400 OVERPAYMENT', async () => {
    const company = await seedCompany();
    const inv = await createInvoiceForPayment(company.company_id, 100000);
    const res = await request(app)
      .post('/api/super/payments/record')
      .set('Host', 'admin.constrai.ca')
      .set('Authorization', `Bearer ${saToken}`)
      .send({
        invoice_id: inv.id,
        amount_cents: 150000,
        method: 'CHEQUE',
      });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('OVERPAYMENT');
  });

  test('400 INVALID_METHOD', async () => {
    const company = await seedCompany();
    const inv = await createInvoiceForPayment(company.company_id, 100000);
    const res = await request(app)
      .post('/api/super/payments/record')
      .set('Host', 'admin.constrai.ca')
      .set('Authorization', `Bearer ${saToken}`)
      .send({ invoice_id: inv.id, amount_cents: 1000, method: 'CRYPTO' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('INVALID_METHOD');
  });

  test('400 INVOICE_NOT_PAYABLE on VOID', async () => {
    const company = await seedCompany();
    const pool = getPool();
    const { rows } = await pool.query(
      `INSERT INTO public.invoices
         (company_id, type, invoice_number, status, subtotal_cents, total_cents, issue_date)
       VALUES ($1, 'TRAINING', $2, 'VOID', 1000, 1000, CURRENT_DATE) RETURNING id`,
      [company.company_id, `CONS-VOID-${Date.now()}`]
    );
    const res = await request(app)
      .post('/api/super/payments/record')
      .set('Host', 'admin.constrai.ca')
      .set('Authorization', `Bearer ${saToken}`)
      .send({ invoice_id: rows[0].id, amount_cents: 1000, method: 'CHEQUE' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('INVOICE_NOT_PAYABLE');
  });
});

// =============================================================================
// GET /api/super/payments  +  GET /api/super/payments/invoices
// (Phase 6-D-6 PR 4 / Section 123)
// =============================================================================

describeIfDb('GET /api/super/payments', () => {
  let sa, saToken;
  beforeEach(async () => {
    sa = await seedUser({ role: 'SUPER_ADMIN', pin: 'sa-pin-1234' });
    saToken = buildSuperAdminToken(sa);
  });

  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  async function seedInvoice(companyId, num, total, status = 'APPROVED', paid = 0) {
    const pool = getPool();
    const { rows } = await pool.query(
      `INSERT INTO public.invoices
         (company_id, type, invoice_number, status, subtotal_cents,
          qst_cents, gst_cents, total_cents, amount_paid_cents, issue_date)
       VALUES ($1, 'TRAINING', $2, $3, $4, 0, 0, $4, $5, CURRENT_DATE)
       RETURNING id`,
      [companyId, num, status, total, paid]
    );
    return rows[0].id;
  }

  async function seedPayment(invoiceId, amount, method = 'BANK_TRANSFER', ref = null) {
    const pool = getPool();
    const { rows } = await pool.query(
      `INSERT INTO public.payments
         (invoice_id, amount_cents, currency, method, status, paid_at, external_ref)
       VALUES ($1, $2, 'CAD', $3, 'SUCCEEDED', NOW(), $4)
       RETURNING id`,
      [invoiceId, amount, method, ref]
    );
    return rows[0].id;
  }

  test('SUPER_ADMIN sees payments across all tenants with joined invoice + company', async () => {
    const c1 = await seedCompany();
    const c2 = await seedCompany();
    const stamp = Date.now();
    const inv1 = await seedInvoice(c1.company_id, `PINV1-${stamp}`, 100000);
    const inv2 = await seedInvoice(c2.company_id, `PINV2-${stamp}`, 200000);
    await seedPayment(inv1, 100000, 'BANK_TRANSFER', `REF1-${stamp}`);
    await seedPayment(inv2, 50000, 'CHEQUE', `REF2-${stamp}`);

    const res = await request(app)
      .get('/api/super/payments')
      .set('Host', 'admin.constrai.ca')
      .set('Authorization', `Bearer ${saToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    const refs = res.body.payments.map((p) => p.external_ref);
    expect(refs).toContain(`REF1-${stamp}`);
    expect(refs).toContain(`REF2-${stamp}`);
    const sample = res.body.payments.find((p) => p.external_ref === `REF1-${stamp}`);
    expect(sample.invoice_number).toBe(`PINV1-${stamp}`);
    expect(sample.company_name).toBe(c1.name);
    expect(sample.amount_cents).toBe(100000);
  });

  test('method filter limits results', async () => {
    const c = await seedCompany();
    const stamp = Date.now();
    const inv = await seedInvoice(c.company_id, `PMINV-${stamp}`, 300000);
    await seedPayment(inv, 1000, 'BANK_TRANSFER', `M-BT-${stamp}`);
    await seedPayment(inv, 2000, 'CHEQUE', `M-CHQ-${stamp}`);

    const res = await request(app)
      .get('/api/super/payments?method=CHEQUE')
      .set('Host', 'admin.constrai.ca')
      .set('Authorization', `Bearer ${saToken}`);

    expect(res.statusCode).toBe(200);
    const refs = res.body.payments.map((p) => p.external_ref);
    expect(refs).toContain(`M-CHQ-${stamp}`);
    expect(refs).not.toContain(`M-BT-${stamp}`);
  });

  test('400 INVALID_METHOD on bad method filter', async () => {
    const res = await request(app)
      .get('/api/super/payments?method=CRYPTO')
      .set('Host', 'admin.constrai.ca')
      .set('Authorization', `Bearer ${saToken}`);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('INVALID_METHOD');
  });

  test('rejects unauthenticated with 401', async () => {
    const res = await request(app).get('/api/super/payments').set('Host', 'admin.constrai.ca');
    expect(res.statusCode).toBe(401);
  });

  test('GET /payments/invoices lists only payable invoices', async () => {
    const c = await seedCompany();
    const stamp = Date.now();
    const payable = await seedInvoice(c.company_id, `INVPAY-${stamp}`, 100000, 'APPROVED', 0);
    const paid = await seedInvoice(c.company_id, `INVPAID-${stamp}`, 100000, 'PAID', 100000);
    const voided = await seedInvoice(c.company_id, `INVVOID-${stamp}`, 100000, 'VOID', 0);

    const res = await request(app)
      .get('/api/super/payments/invoices')
      .set('Host', 'admin.constrai.ca')
      .set('Authorization', `Bearer ${saToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    const nums = res.body.invoices.map((i) => i.invoice_number);
    expect(nums).toContain(`INVPAY-${stamp}`);
    expect(nums).not.toContain(`INVPAID-${stamp}`);
    expect(nums).not.toContain(`INVVOID-${stamp}`);
    const sample = res.body.invoices.find((i) => i.invoice_number === `INVPAY-${stamp}`);
    expect(sample.balance_cents).toBe(100000);
    void payable;
    void paid;
    void voided;
  });
});

// =============================================================================
// POST /api/super/subscriptions/:id/extend-trial
// =============================================================================

describeIfDb('POST /api/super/subscriptions/:id/extend-trial', () => {
  let sa, saToken;
  beforeEach(async () => {
    sa = await seedUser({ role: 'SUPER_ADMIN', pin: 'sa-pin-1234' });
    saToken = buildSuperAdminToken(sa);
  });

  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('extends TRIAL subscription by 7 days', async () => {
    const company = await seedCompany();
    const trialEnds = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const sub = await seedSubscription({
      company_id: company.company_id,
      status: 'TRIAL',
      trial_ends_at: trialEnds,
    });

    const res = await request(app)
      .post(`/api/super/subscriptions/${sub.id}/extend-trial`)
      .set('Host', 'admin.constrai.ca')
      .set('Authorization', `Bearer ${saToken}`)
      .send({ days_to_add: 7 });

    expect(res.statusCode).toBe(200);
    expect(res.body.days_added).toBe(7);
    expect(new Date(res.body.subscription.trial_ends_at).getTime()).toBeGreaterThan(
      trialEnds.getTime()
    );
  });

  test('rejects on non-TRIAL subscription', async () => {
    const company = await seedCompany();
    const sub = await seedSubscription({ company_id: company.company_id, status: 'ACTIVE' });
    const res = await request(app)
      .post(`/api/super/subscriptions/${sub.id}/extend-trial`)
      .set('Host', 'admin.constrai.ca')
      .set('Authorization', `Bearer ${saToken}`)
      .send({ days_to_add: 7 });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('NOT_IN_TRIAL');
  });

  test('400 INVALID_DAYS_TO_ADD on 0 or >365', async () => {
    const company = await seedCompany();
    const sub = await seedSubscription({ company_id: company.company_id, status: 'TRIAL' });
    const res = await request(app)
      .post(`/api/super/subscriptions/${sub.id}/extend-trial`)
      .set('Host', 'admin.constrai.ca')
      .set('Authorization', `Bearer ${saToken}`)
      .send({ days_to_add: 0 });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('INVALID_DAYS_TO_ADD');
  });
});
