'use strict';

/**
 * jobs/monthlyInvoiceJob.js
 *
 * Phase 6-D-7 PR1 / Section 125 — monthly subscription invoice generation.
 *
 * On the 1st of each month the cron generates and AUTO-APPROVES a
 * SUBSCRIPTION_RECURRING invoice for every ACTIVE monthly subscription that
 * hasn't been billed yet this period. The customer is pre-approved at signup,
 * so subscription invoices skip the QUOTE_SENT step and go straight to
 * APPROVED (approved_by = 'system') — see migration 018 invoices.status note.
 *
 * Amount: max(subscribed_seats, minimum_seats_billed) × current_unit_price_cents,
 * plus Quebec QST + GST via lib/invoice_numbering (reused from the training /
 * custom-demand quote endpoints). Sequential CONS-YYYY-NNNN numbering with the
 * same pg_advisory_xact_lock serialization.
 *
 * Idempotency (no double-billing): a subscription is skipped if either
 *   (a) last_billed_at is already within the current month, OR
 *   (b) a SUBSCRIPTION_RECURRING invoice already exists for the company with an
 *       issue_date in the current month.
 * Both guards run so a partial/failed previous run can't double-bill.
 *
 * Pool: uses superPool (mepuser_super, BYPASSRLS) — this is a cross-tenant
 * system job with no request context, so it must bypass RLS to read every
 * tenant's subscription and write invoices. (Same reason routes/auth.js uses
 * authPool — Pitfall #59.)
 *
 * Email: NOT sent here. Phase 6-D-7 PR2 wires the HTML invoice email (Resend)
 * onto the APPROVED invoices this job produces.
 */

const cron = require('node-cron');
const { pool, superPool } = require('../db');
const {
  generateInvoiceNumber,
  getActiveTaxRates,
  calculateTaxes,
} = require('../lib/invoice_numbering');

function startOfMonthUTC(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
function startOfNextMonthUTC(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
}
function ymd(date) {
  return date.toISOString().slice(0, 10);
}

/**
 * Generate + auto-approve this month's SUBSCRIPTION_RECURRING invoices.
 *
 * @param {{connect: Function, query: Function}} [poolOverride] - pg Pool; defaults
 *        to superPool (BYPASSRLS) then pool. Tests inject their own pool.
 * @param {Date} [now=new Date()] - reference date (the billing period anchor).
 * @returns {Promise<{considered:number,created:number,skipped:number,errors:number,invoices:Array}>}
 */
async function generateMonthlyInvoices(poolOverride, now = new Date()) {
  const dbPool = poolOverride || superPool || pool;
  const periodStart = startOfMonthUTC(now);
  const nextPeriod = startOfNextMonthUTC(now);
  const summary = { considered: 0, created: 0, skipped: 0, errors: 0, invoices: [] };

  const { rows: subs } = await dbPool.query(
    `SELECT s.id, s.company_id, s.subscribed_seats, s.minimum_seats_billed,
            s.current_unit_price_cents, s.current_bracket_label, s.last_billed_at,
            c.name AS company_name
       FROM public.subscriptions s
       JOIN public.companies c ON c.company_id = s.company_id
      WHERE s.status = 'ACTIVE'
        AND s.billing_cycle = 'MONTHLY'
      ORDER BY s.company_id`
  );

  for (const sub of subs) {
    summary.considered++;

    // Idempotency guard (a): already billed this period.
    if (sub.last_billed_at && new Date(sub.last_billed_at) >= periodStart) {
      summary.skipped++;
      continue;
    }

    const client = await dbPool.connect();
    try {
      await client.query('BEGIN');

      // Idempotency guard (b): an invoice already exists for this period.
      const { rows: existing } = await client.query(
        `SELECT 1 FROM public.invoices
          WHERE company_id = $1 AND type = 'SUBSCRIPTION_RECURRING'
            AND issue_date >= $2 AND issue_date < $3
          LIMIT 1`,
        [sub.company_id, ymd(periodStart), ymd(nextPeriod)]
      );
      if (existing.length > 0) {
        await client.query('ROLLBACK');
        summary.skipped++;
        continue;
      }

      const billedSeats = Math.max(
        Number(sub.subscribed_seats) || 0,
        Number(sub.minimum_seats_billed) || 0
      );
      const subtotalCents = billedSeats * Number(sub.current_unit_price_cents);
      const taxRates = await getActiveTaxRates(client, now);
      const { qst_cents, gst_cents, total_cents } = calculateTaxes(subtotalCents, taxRates);
      const invoiceNumber = await generateInvoiceNumber(client, now);

      const issueDate = ymd(periodStart);
      const due = new Date(periodStart);
      due.setUTCDate(due.getUTCDate() + 30); // net-30
      const dueDate = ymd(due);

      const details = {
        billing_period: { start: issueDate, end: ymd(nextPeriod) },
        seats_billed: billedSeats,
        subscribed_seats: Number(sub.subscribed_seats),
        minimum_seats_billed: Number(sub.minimum_seats_billed),
        unit_price_cents: Number(sub.current_unit_price_cents),
        bracket_label: sub.current_bracket_label,
        tax_rates_basis_points: {
          qst: taxRates.qst_basis_points,
          gst: taxRates.gst_basis_points,
        },
        generated_by: 'monthlyInvoiceJob',
      };

      const { rows: invRows } = await client.query(
        `INSERT INTO public.invoices
           (company_id, subscription_id, type, invoice_number, status,
            subtotal_cents, qst_cents, gst_cents, total_cents, currency,
            issue_date, due_date, details, approved_at, approved_by)
         VALUES ($1, $2, 'SUBSCRIPTION_RECURRING', $3, 'APPROVED',
                 $4, $5, $6, $7, 'CAD',
                 $8, $9, $10, NOW(), 'system')
         RETURNING id, invoice_number, total_cents`,
        [
          sub.company_id,
          sub.id,
          invoiceNumber,
          subtotalCents,
          qst_cents,
          gst_cents,
          total_cents,
          issueDate,
          dueDate,
          JSON.stringify(details),
        ]
      );

      await client.query(
        `UPDATE public.subscriptions
            SET last_billed_at = NOW(), next_billing_at = $2, updated_at = NOW()
          WHERE id = $1`,
        [sub.id, nextPeriod.toISOString()]
      );

      await client.query('COMMIT');
      summary.created++;
      summary.invoices.push({
        company_id: Number(sub.company_id),
        company_name: sub.company_name,
        invoice_number: invRows[0].invoice_number,
        total_cents: Number(invRows[0].total_cents),
      });
      console.log(
        `[monthlyInvoice] Created ${invRows[0].invoice_number} for ${sub.company_name} ` +
          `(${billedSeats} seats, $${(Number(invRows[0].total_cents) / 100).toFixed(2)} CAD)`
      );
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch (_e) {
        /* ignore rollback error */
      }
      summary.errors++;
      console.error(`[monthlyInvoice] Error for company ${sub.company_id}:`, err.message);
    } finally {
      client.release();
    }
  }

  console.log(
    `[monthlyInvoice] Run complete: ${summary.created} created, ${summary.skipped} skipped, ` +
      `${summary.errors} errors (of ${summary.considered} considered).`
  );
  return summary;
}

module.exports = function registerMonthlyInvoiceJob() {
  // 1st of every month at 14:00 UTC (~09:00–10:00 America/Montreal depending on DST).
  cron.schedule('0 14 1 * *', () => {
    generateMonthlyInvoices().catch((e) => console.error('[monthlyInvoice] Unhandled error:', e));
  });
  console.log('[monthlyInvoice] Scheduled: 1st of month 14:00 UTC');
};

// Exported for tests + a future manual SUPER_ADMIN "run now" endpoint.
module.exports.generateMonthlyInvoices = generateMonthlyInvoices;
