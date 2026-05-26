// tests/smoke/invoice_numbering.test.js
//
// Phase 6-D-4 PR 5 — pure-function smoke tests for the tax calculation
// helper. Sequential invoice numbering is exercised via integration tests
// (needs a real DB + advisory lock). calculateTaxes is fully pure.

'use strict';

const { calculateTaxes } = require('../../lib/invoice_numbering');

describe('calculateTaxes()', () => {
  // Thousandths-of-percent convention (see lib/invoice_numbering.js header).
  // QST 9975 = 9.975%, GST 5000 = 5.000%.
  const QC_RATES = { qst_basis_points: 9975, gst_basis_points: 5000 };

  test('zero subtotal → zero taxes', () => {
    const r = calculateTaxes(0, QC_RATES);
    expect(r).toEqual({ qst_cents: 0, gst_cents: 0, total_cents: 0 });
  });

  test('$100 subtotal → $9.975 QST (rounded to 998) + $5 GST = $114.98', () => {
    // 10000 cents (= $100) * 9975 / 100000 = 997.5 → round to 998 (QST 9.975%).
    // 10000 cents * 5000 / 100000 = 500 (GST 5%).
    // Total = 10000 + 998 + 500 = 11498 = $114.98 ✓
    const r = calculateTaxes(10000, QC_RATES);
    expect(r.qst_cents).toBe(998);
    expect(r.gst_cents).toBe(500);
    expect(r.total_cents).toBe(11498);
  });

  test('large subtotal — math preserves integer cents', () => {
    // $1,234.56 = 123456 cents
    // qst = 123456 * 9975 / 100000 = 12314.7... → round to 12315
    // gst = 123456 * 5000 / 100000 = 6172.8 → round to 6173
    // total = 123456 + 12315 + 6173 = 141944
    const r = calculateTaxes(123456, QC_RATES);
    expect(r.qst_cents).toBe(12315);
    expect(r.gst_cents).toBe(6173);
    expect(r.total_cents).toBe(141944);
  });

  test('zero rates yield zero taxes', () => {
    const r = calculateTaxes(12345, { qst_basis_points: 0, gst_basis_points: 0 });
    expect(r).toEqual({ qst_cents: 0, gst_cents: 0, total_cents: 12345 });
  });

  test('negative subtotal clamped to 0', () => {
    const r = calculateTaxes(-100, QC_RATES);
    expect(r).toEqual({ qst_cents: 0, gst_cents: 0, total_cents: 0 });
  });

  test('non-numeric subtotal coerced to 0', () => {
    const r = calculateTaxes('not a number', QC_RATES);
    expect(r).toEqual({ qst_cents: 0, gst_cents: 0, total_cents: 0 });
  });
});
