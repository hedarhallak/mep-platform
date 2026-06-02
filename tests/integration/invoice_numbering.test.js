// tests/integration/invoice_numbering.test.js
//
// Phase 6-D-7 / Section 125.3 — regression test for generateInvoiceNumber.
//
// The original implementation picked the latest sequence with a STRING
// `ORDER BY invoice_number DESC`, which breaks once the sequence crosses the
// zero-pad width: 'CONS-YYYY-9999' sorts ABOVE 'CONS-YYYY-10000'
// lexicographically, so the next number computed was 10000 → UNIQUE collision
// with the existing 10000. The fix takes the MAX of the numeric suffix.
//
// Uses a far-future year (2099) so the seeded numbers can't collide with real
// 2026 invoices in the shared test DB.

'use strict';

const { describeIfDb, closePool, getPool, seedCompany, cleanupTestRows } = require('../helpers/db');
const { generateInvoiceNumber } = require('../../lib/invoice_numbering');

describeIfDb('lib/invoice_numbering — generateInvoiceNumber numeric ordering', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('returns 10001 when 9999 and 10000 already exist (numeric MAX, not string)', async () => {
    const company = await seedCompany();
    const pool = getPool();
    const insertInvoice = (num) =>
      pool.query(
        `INSERT INTO public.invoices
           (company_id, type, invoice_number, status,
            subtotal_cents, qst_cents, gst_cents, total_cents, issue_date)
         VALUES ($1, 'CUSTOM_DEMAND', $2, 'DRAFT', 1000, 0, 0, 1000, DATE '2099-06-01')`,
        [company.company_id, num]
      );

    await insertInvoice('CONS-2099-0001');
    await insertInvoice('CONS-2099-9999');
    await insertInvoice('CONS-2099-10000');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const next = await generateInvoiceNumber(client, new Date(Date.UTC(2099, 5, 1)));
      await client.query('ROLLBACK');
      // String ordering would have wrongly produced CONS-2099-10000 (collision).
      expect(next).toBe('CONS-2099-10001');
    } finally {
      client.release();
    }
  });

  test('returns 0001 for a year with no existing invoices', async () => {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const next = await generateInvoiceNumber(client, new Date(Date.UTC(2098, 0, 1)));
      await client.query('ROLLBACK');
      expect(next).toBe('CONS-2098-0001');
    } finally {
      client.release();
    }
  });
});
