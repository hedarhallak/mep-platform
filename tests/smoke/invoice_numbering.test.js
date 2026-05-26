// tests/smoke/invoice_numbering.test.js
//
// Phase 6-D-4 PR 5 — pure-function smoke tests for the tax calculation
// helper. Sequential invoice numbering is exercised via integration tests
// (needs a real DB + advisory lock). calculateTaxes is fully pure.

'use strict';

const { calculateTaxes } = require('../../lib/invoice_numbering');

describe('calculateTaxes()', () => {
  const QC_RATES = { qst_basis_points: 9975, gst_basis_points: 500 };

  test('zero subtotal → zero taxes', () => {
    const r = calculateTaxes(0, QC_RATES);
    expect(r).toEqual({ qst_cents: 0, gst_cents: 0, total_cents: 0 });
  });

  test('$100 subtotal → $9.975 QST (rounded to 998) + $5 GST = $114.98', () => {
    // 10000 cents * 9975 / 10000 = 9975 cents? No — 10000 * 9975 / 10000 = 9975 (in 1/100 of cent units).
    // Wait: 10000 cents * 9975 / 10000 = 9975. But that's $99.75 which is too high.
    // Correct: basis points = 1/100 of 1% = 1/10000 fraction.
    // So qst = subtotal * 9975 / 10000 / 100 = subtotal * 9975 / 1000000.
    // Wait no — basis points: 1 bp = 0.01% = 0.0001. So multiplier is bp / 10000.
    // For 9975 bp = 9.975% = 0.09975. So qst = 10000 cents * 0.09975 = 997.5 → round to 998 cents.
    // Total = 10000 + 998 + 500 = 11498 = $114.98 ✓
    const r = calculateTaxes(10000, QC_RATES);
    expect(r.qst_cents).toBe(998);
    expect(r.gst_cents).toBe(500);
    expect(r.total_cents).toBe(11498);
  });

  test('large subtotal — math preserves integer cents', () => {
    // $1,234.56 = 123456 cents
    // qst = 123456 * 0.09975 = 12314.7... → round to 12315
    // gst = 123456 * 0.05 = 6172.8 → round to 6173
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
