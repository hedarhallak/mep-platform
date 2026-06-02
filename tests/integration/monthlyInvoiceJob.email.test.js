// tests/integration/monthlyInvoiceJob.email.test.js
//
// Phase 6-D-7 PR2 / Section 125 — the auto-email leg of the monthly invoice
// cron. Mocks lib/email_invoice so no real mail is sent; asserts the cron calls
// the sender once per created invoice for the company's COMPANY_ADMIN when
// INVOICE_EMAIL_ENABLED=true, and not at all when the flag is off.
//
// The flag is read per-run inside generateMonthlyInvoices (not at module load),
// so the tests can toggle process.env between cases.

'use strict';

jest.mock('../../lib/email_invoice', () => ({
  sendSubscriptionInvoiceEmail: jest.fn(async () => true),
}));

const {
  describeIfDb,
  closePool,
  getPool,
  seedCompany,
  seedSubscription,
  seedUser,
  cleanupTestRows,
} = require('../helpers/db');
const { sendSubscriptionInvoiceEmail } = require('../../lib/email_invoice');
const { generateMonthlyInvoices } = require('../../jobs/monthlyInvoiceJob');

describeIfDb('monthlyInvoiceJob — email automation (INVOICE_EMAIL_ENABLED)', () => {
  let prevFlag;
  beforeAll(() => {
    prevFlag = process.env.INVOICE_EMAIL_ENABLED;
  });
  beforeEach(() => {
    sendSubscriptionInvoiceEmail.mockClear();
  });
  afterAll(async () => {
    if (prevFlag === undefined) delete process.env.INVOICE_EMAIL_ENABLED;
    else process.env.INVOICE_EMAIL_ENABLED = prevFlag;
    await cleanupTestRows();
    await closePool();
  });

  test('emails the COMPANY_ADMIN for a created invoice when enabled', async () => {
    process.env.INVOICE_EMAIL_ENABLED = 'true';
    const company = await seedCompany();
    await seedSubscription({
      company_id: company.company_id,
      status: 'ACTIVE',
      billing_cycle: 'MONTHLY',
      subscribed_seats: 5,
    });
    await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN', pin: '1234' });

    const summary = await generateMonthlyInvoices(getPool(), new Date());
    expect(summary.created).toBeGreaterThanOrEqual(1);
    expect(summary.emailed).toBeGreaterThanOrEqual(1);

    const mine = sendSubscriptionInvoiceEmail.mock.calls
      .map((c) => c[0])
      .find((a) => a.invoice && a.invoice.company_name === company.name);
    expect(mine).toBeTruthy();
    expect(mine.invoice.total_cents).toBe(15522); // 5 × 2700 + QST 1347 + GST 675
    expect(typeof mine.to).toBe('string');
    expect(mine.to).toContain('@');
  });

  test('does NOT email when INVOICE_EMAIL_ENABLED is not "true"', async () => {
    process.env.INVOICE_EMAIL_ENABLED = 'false';
    const company = await seedCompany();
    await seedSubscription({
      company_id: company.company_id,
      status: 'ACTIVE',
      billing_cycle: 'MONTHLY',
      subscribed_seats: 5,
    });
    await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN', pin: '1234' });

    const summary = await generateMonthlyInvoices(getPool(), new Date());
    const mine = sendSubscriptionInvoiceEmail.mock.calls
      .map((c) => c[0])
      .find((a) => a.invoice && a.invoice.company_name === company.name);
    expect(mine).toBeFalsy();
    expect(summary.emailed).toBe(0);
  });
});
