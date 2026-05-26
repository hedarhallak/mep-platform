'use strict';

/**
 * lib/invoice_numbering.js
 *
 * Phase 6-D-4 PR 5 / Section 116.6 — sequential invoice number generation
 * and Quebec tax rate lookup. Used by routes/super_training_quotes.js,
 * routes/super_custom_demands.js, and (Phase 6-D-7) the monthly
 * subscription-invoice cron.
 *
 * Numbering format (Section 116.11): `CONS-YYYY-NNNN`
 *   - CONS = prefix (Constrai)
 *   - YYYY = 4-digit year of issue_date
 *   - NNNN = sequential per year, zero-padded to 4 digits, increments
 *           for every new invoice created in that year
 *
 * Concurrency: uses pg_advisory_xact_lock during the SELECT MAX + INSERT
 * window to serialize concurrent generations. Lock is released
 * automatically at the end of the transaction. Single-key lock (no per-year
 * key) keeps it simple and correct under low-throughput billing volume.
 *
 * Tax rates (Section 116.6): stored in `tax_rates.rate_basis_points` as
 * THOUSANDTHS-OF-PERCENT (1 unit = 0.001%, so 1% = 1000 units, divisor 100000).
 * This non-standard scale was chosen because Quebec QST is 9.975% — standard
 * basis points (1 bp = 0.01%) would require 997.5 (non-integer). Thousandths
 * give us 9975 for QST and 5000 for GST, both exact integers.
 *   - QC / QST: 9975 → 9.975%
 *   - FEDERAL / GST: 5000 → 5%
 * (Migration 018 seeded GST as 500 mistakenly mixing scales; migration 021
 * normalizes it to 5000.)
 *
 * History-aware: the active rate for an issue_date is the row where
 * effective_from <= date AND (effective_until IS NULL OR date < effective_until).
 *
 * All amount math is in INTEGER cents (Section 116.12).
 */

const ADVISORY_LOCK_KEY = 4242420001; // arbitrary unique constant, see Pitfall note below

/**
 * Generate the next sequential invoice number for the current year.
 *
 * MUST be called inside a transaction (req.db's tenantDb transaction).
 * The advisory lock is transaction-scoped (pg_advisory_xact_lock), so two
 * concurrent generations serialize until both COMMITs complete.
 *
 * @param {{query: Function}} db - pg client (req.db) inside a transaction
 * @param {Date} [issueDate=new Date()] - used to determine year prefix
 * @returns {Promise<string>} e.g. 'CONS-2026-0042'
 */
async function generateInvoiceNumber(db, issueDate = new Date()) {
  await db.query('SELECT pg_advisory_xact_lock($1)', [ADVISORY_LOCK_KEY]);

  const year = issueDate.getUTCFullYear();
  const prefix = `CONS-${year}-`;
  const { rows } = await db.query(
    `SELECT invoice_number FROM public.invoices
      WHERE invoice_number LIKE $1
      ORDER BY invoice_number DESC
      LIMIT 1`,
    [`${prefix}%`]
  );

  let nextSeq = 1;
  if (rows.length > 0) {
    const match = rows[0].invoice_number.match(/-(\d+)$/);
    if (match) nextSeq = parseInt(match[1], 10) + 1;
  }
  return `${prefix}${String(nextSeq).padStart(4, '0')}`;
}

/**
 * Look up the active QST + GST rates for a given date.
 *
 * @param {{query: Function}} db
 * @param {Date} [asOfDate=new Date()]
 * @returns {Promise<{qst_basis_points: number, gst_basis_points: number}>}
 */
async function getActiveTaxRates(db, asOfDate = new Date()) {
  const dateStr = asOfDate instanceof Date ? asOfDate.toISOString() : String(asOfDate);
  const { rows } = await db.query(
    `SELECT jurisdiction, tax_name, rate_basis_points, effective_from
       FROM public.tax_rates
      WHERE effective_from <= $1
        AND (effective_until IS NULL OR $1 < effective_until)
      ORDER BY effective_from DESC`,
    [dateStr]
  );
  const rates = { qst_basis_points: 0, gst_basis_points: 0 };
  for (const r of rows) {
    if (r.tax_name === 'QST' && rates.qst_basis_points === 0) {
      rates.qst_basis_points = Number(r.rate_basis_points);
    }
    if (r.tax_name === 'GST' && rates.gst_basis_points === 0) {
      rates.gst_basis_points = Number(r.rate_basis_points);
    }
  }
  return rates;
}

/**
 * Compute QST + GST + total from a subtotal in cents and rate object.
 *
 * Rates use THOUSANDTHS-OF-PERCENT (1 unit = 0.001%), so the multiplier is
 * rate / 100000. Examples:
 *   - QST 9975 (9.975%): subtotal * 9975 / 100000
 *   - GST 5000 (5.000%): subtotal * 5000 / 100000
 *
 * This is NOT the standard basis-points convention (where 1 bp = 0.01%, divisor
 * 10000). We chose thousandths to keep Quebec's 9.975% QST as an exact integer.
 * The column is named `rate_basis_points` for historical reasons (migration 018);
 * renaming would be a destructive change for too little gain. See the header
 * docstring + migration 021 for the GST 500→5000 normalization.
 *
 * Math.round() to avoid fractional cents in the DB integer column.
 *
 * @param {number} subtotalCents
 * @param {{qst_basis_points: number, gst_basis_points: number}} rates
 * @returns {{qst_cents: number, gst_cents: number, total_cents: number}}
 */
function calculateTaxes(subtotalCents, rates) {
  const subtotal = Math.max(0, Math.round(Number(subtotalCents) || 0));
  const qst = Math.round((subtotal * Number(rates.qst_basis_points || 0)) / 100000);
  const gst = Math.round((subtotal * Number(rates.gst_basis_points || 0)) / 100000);
  return {
    qst_cents: qst,
    gst_cents: gst,
    total_cents: subtotal + qst + gst,
  };
}

module.exports = {
  generateInvoiceNumber,
  getActiveTaxRates,
  calculateTaxes,
  ADVISORY_LOCK_KEY,
};
