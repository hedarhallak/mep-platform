// tests/integration/monthlyInvoiceJob.test.js
//
// Phase 6-D-7 PR1 / Section 125 — integration tests for the monthly
// subscription-invoice cron worker. Drives generateMonthlyInvoices() directly
// against the test DB (the cron schedule itself is not exercised).
//
// Asserts, scoped to a freshly-seeded test company so the shared DB's other
// subscriptions don't affect the assertions:
//   1. an ACTIVE monthly subscription gets a SUBSCRIPTION_RECURRING invoice,
//      APPROVED, approved_by 'system', with correct seat math + Quebec taxes,
//      and last_billed_at advanced.
//   2. a second run in the same month is idempotent (no duplicate invoice).

'use strict';

const {
  describeIfDb,
  closePool,
  getPool,
  seedCompany,
  seedSubscription,
  cleanupTestRows,
} = require('../helpers/db');
const { generateMonthlyInvoices } = require('../../jobs/monthlyInvoiceJob');

describeIfDb('jobs/monthlyInvoiceJob — generateMonthlyInvoices', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  async function invoicesForCompany(companyId) {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT id, type, status, approved_by, subtotal_cents, qst_cents, gst_cents,
              total_cents, invoice_number, subscription_id
         FROM public.invoices
        WHERE company_id = $1 AND type = 'SUBSCRIPTION_RECURRING'
        ORDER BY id DESC`,
      [companyId]
    );
    return rows;
  }

  test('generates an APPROVED SUBSCRIPTION_RECURRING invoice with correct seat math + taxes', async () => {
    const company = await seedCompany();
    // 5 seats → bracket 1-5 → $27.00/seat → subtotal $135.00 (13500 cents).
    const sub = await seedSubscription({
      company_id: company.company_id,
      status: 'ACTIVE',
      billing_cycle: 'MONTHLY',
      subscribed_seats: 5,
    });

    const summary = await generateMonthlyInvoices(getPool(), new Date());
    expect(summary.created).toBeGreaterThanOrEqual(1);

    const invs = await invoicesForCompany(company.company_id);
    expect(invs).toHaveLength(1);
    const inv = invs[0];
    expect(inv.status).toBe('APPROVED');
    expect(inv.approved_by).toBe('system');
    expect(String(inv.subscription_id)).toBe(String(sub.id));
    expect(inv.subtotal_cents).toBe(13500); // 5 × 2700
    // QST 9.975% of 13500 = 1346.625 → 1347; GST 5% = 675; total = 15522.
    expect(inv.qst_cents).toBe(1347);
    expect(inv.gst_cents).toBe(675);
    expect(inv.total_cents).toBe(15522);
    expect(inv.invoice_number).toMatch(/^CONS-\d{4}-\d{4}$/);

    // Subscription anchors advanced.
    const { rows: subRows } = await getPool().query(
      `SELECT last_billed_at FROM public.subscriptions WHERE id = $1`,
      [sub.id]
    );
    expect(subRows[0].last_billed_at).toBeTruthy();
  });

  test('is idempotent — a second run in the same month does not double-bill', async () => {
    const company = await seedCompany();
    await seedSubscription({
      company_id: company.company_id,
      status: 'ACTIVE',
      billing_cycle: 'MONTHLY',
      subscribed_seats: 8, // bracket 6-10 → 2500/seat → subtotal 20000
    });

    const now = new Date();
    await generateMonthlyInvoices(getPool(), now);
    const afterFirst = await invoicesForCompany(company.company_id);
    expect(afterFirst).toHaveLength(1);
    expect(afterFirst[0].subtotal_cents).toBe(20000); // 8 × 2500

    // Run again — must skip this company (already billed this period).
    await generateMonthlyInvoices(getPool(), now);
    const afterSecond = await invoicesForCompany(company.company_id);
    expect(afterSecond).toHaveLength(1); // still exactly one
  });

  test('skips non-ACTIVE subscriptions (e.g. TRIAL)', async () => {
    const company = await seedCompany();
    await seedSubscription({
      company_id: company.company_id,
      status: 'TRIAL',
      billing_cycle: 'MONTHLY',
      subscribed_seats: 5,
    });

    await generateMonthlyInvoices(getPool(), new Date());
    const invs = await invoicesForCompany(company.company_id);
    expect(invs).toHaveLength(0);
  });
});
