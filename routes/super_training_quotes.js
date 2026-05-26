'use strict';

/**
 * routes/super_training_quotes.js
 *
 * Phase 6-D-4 PR 5 / Section 115.4 + 115.8 — SUPER_ADMIN training quote
 * endpoints. Hedar manually creates quotes via this API; the customer
 * receives them by email after a separate "send" call.
 *
 * Mount: app.use('/api/super', auth, superAdmin, tenantDb, this) on adminApp.
 *
 * Endpoints:
 *   POST /training/quotes
 *     Body: { company_id, trainees, distance_km, training_days,
 *             flight?, per_diem_rate_cents_per_day?,
 *             quote_expires_at?, customer_notes?, internal_notes?,
 *             payment_schedule? }
 *     → Creates a DRAFT invoice of type='TRAINING' with full breakdown in
 *       details JSONB. invoice_number is sequential CONS-YYYY-NNNN.
 *       Tax computed via QC QST + Federal GST active at issue_date.
 *
 *   POST /training/quotes/:id/send
 *     → Marks the invoice as QUOTE_SENT (was DRAFT) and emails the customer
 *       admin. Idempotent: already-sent invoices return their existing state.
 *
 * 50/50 payment terms (Section 115.4): the payment_schedule defaults to
 * 50% first / 50% on last training day. Override via body.payment_schedule.
 */

const express = require('express');
const router = express.Router();

const { audit } = require('../lib/audit');
const { computeTrainingQuote } = require('../lib/training_quote');
const {
  generateInvoiceNumber,
  getActiveTaxRates,
  calculateTaxes,
} = require('../lib/invoice_numbering');
const { sendTrainingQuoteEmail } = require('../lib/email_training_quote');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function defaultPaymentSchedule(issueDate, trainingDays) {
  const issue = new Date(issueDate);
  const firstDue = new Date(issue);
  firstDue.setUTCDate(firstDue.getUTCDate() + 7); // first 50% due 7 days before training start
  const secondDue = new Date(issue);
  secondDue.setUTCDate(secondDue.getUTCDate() + 30 + Math.max(0, trainingDays - 1));
  return {
    first_payment_pct: 50,
    first_payment_due: firstDue.toISOString().slice(0, 10),
    second_payment_pct: 50,
    second_payment_due: secondDue.toISOString().slice(0, 10),
  };
}

async function loadCompanyForQuote(db, companyId) {
  const { rows } = await db.query(
    `SELECT company_id, name, company_code FROM public.companies WHERE company_id = $1 LIMIT 1`,
    [companyId]
  );
  return rows[0] || null;
}

async function findCustomerAdminEmail(db, companyId) {
  const { rows } = await db.query(
    `SELECT email FROM public.app_users
      WHERE company_id = $1 AND role = 'COMPANY_ADMIN' AND is_active = true
      ORDER BY created_at ASC
      LIMIT 1`,
    [companyId]
  );
  return rows[0]?.email || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /training/quotes
// ─────────────────────────────────────────────────────────────────────────────
router.post('/training/quotes', async (req, res) => {
  try {
    const body = req.body || {};
    const companyId = Number(body.company_id);
    if (!companyId) {
      return res.status(400).json({ ok: false, error: 'INVALID_COMPANY_ID' });
    }

    const company = await loadCompanyForQuote(req.db, companyId);
    if (!company) {
      return res.status(404).json({ ok: false, error: 'COMPANY_NOT_FOUND' });
    }

    // Compute breakdown + subtotal via lib helper (validates input shape).
    let computed;
    try {
      computed = computeTrainingQuote({
        trainees: body.trainees,
        distance_km: body.distance_km,
        training_days: body.training_days,
        flight: body.flight,
        per_diem_rate_cents_per_day: body.per_diem_rate_cents_per_day,
      });
    } catch (computeErr) {
      return res.status(400).json({
        ok: false,
        error: computeErr.code || 'INVALID_QUOTE_INPUT',
        message: computeErr.message,
      });
    }

    const issueDate = new Date();
    const taxRates = await getActiveTaxRates(req.db, issueDate);
    const { qst_cents, gst_cents, total_cents } = calculateTaxes(computed.subtotal_cents, taxRates);

    const invoiceNumber = await generateInvoiceNumber(req.db, issueDate);

    const paymentSchedule =
      body.payment_schedule || defaultPaymentSchedule(issueDate, computed.breakdown.training_days);

    // Validate quote_expires_at if provided; otherwise default to 30 days from issue.
    let quoteExpiresAt = null;
    if (body.quote_expires_at) {
      const dt = new Date(body.quote_expires_at);
      if (Number.isNaN(dt.getTime())) {
        return res.status(400).json({ ok: false, error: 'INVALID_QUOTE_EXPIRES_AT' });
      }
      quoteExpiresAt = dt.toISOString().slice(0, 10);
    } else {
      const dt = new Date(issueDate);
      dt.setUTCDate(dt.getUTCDate() + 30);
      quoteExpiresAt = dt.toISOString().slice(0, 10);
    }

    const details = {
      ...computed.breakdown,
      payment_schedule: paymentSchedule,
      // location.address is optional metadata; preserve if caller sent it
      location_address: body.location_address || null,
      tax_rates_basis_points: {
        qst: taxRates.qst_basis_points,
        gst: taxRates.gst_basis_points,
      },
    };

    const { rows: invoiceRows } = await req.db.query(
      `INSERT INTO public.invoices
         (company_id, type, invoice_number, status,
          subtotal_cents, qst_cents, gst_cents, total_cents,
          currency, issue_date, quote_expires_at,
          details, customer_notes, internal_notes,
          created_by_user_id)
       VALUES ($1, 'TRAINING', $2, 'DRAFT',
               $3, $4, $5, $6,
               'CAD', $7, $8,
               $9, $10, $11,
               $12)
       RETURNING *`,
      [
        companyId,
        invoiceNumber,
        computed.subtotal_cents,
        qst_cents,
        gst_cents,
        total_cents,
        issueDate.toISOString().slice(0, 10),
        quoteExpiresAt,
        JSON.stringify(details),
        body.customer_notes ? String(body.customer_notes).slice(0, 5000) : null,
        body.internal_notes ? String(body.internal_notes).slice(0, 5000) : null,
        req.user?.user_id || null,
      ]
    );
    const invoice = invoiceRows[0];

    await audit(req.db, req, {
      action: 'TRAINING_QUOTE_CREATED',
      entity_type: 'invoice',
      entity_id: invoice.id,
      entity_name: invoice.invoice_number,
      new_values: {
        subtotal_cents: computed.subtotal_cents,
        total_cents,
        type: 'TRAINING',
      },
      details: { breakdown: computed.breakdown, tax_rates: taxRates },
    });

    return res.json({ ok: true, invoice });
  } catch (err) {
    console.error('POST /super/training/quotes error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /training/quotes/:id/send
// ─────────────────────────────────────────────────────────────────────────────
router.post('/training/quotes/:id/send', async (req, res) => {
  try {
    const invoiceId = Number(req.params.id);
    if (!invoiceId) {
      return res.status(400).json({ ok: false, error: 'INVALID_ID' });
    }

    const { rows: invRows } = await req.db.query(
      `SELECT i.*, c.name AS company_name, c.company_code
         FROM public.invoices i
         JOIN public.companies c ON c.company_id = i.company_id
        WHERE i.id = $1 AND i.type = 'TRAINING'
        LIMIT 1`,
      [invoiceId]
    );
    if (invRows.length === 0) {
      return res.status(404).json({ ok: false, error: 'INVOICE_NOT_FOUND' });
    }
    const invoice = invRows[0];

    if (!['DRAFT', 'QUOTE_SENT'].includes(invoice.status)) {
      return res.status(400).json({
        ok: false,
        error: 'INVALID_STATUS',
        message: `cannot send quote that is in status ${invoice.status}`,
      });
    }

    const customerEmail =
      req.body?.to || (await findCustomerAdminEmail(req.db, invoice.company_id));
    if (!customerEmail) {
      return res.status(400).json({
        ok: false,
        error: 'NO_RECIPIENT',
        message: 'No customer admin email found and no `to` override provided',
      });
    }

    // Mark as QUOTE_SENT (idempotent: already-sent stays QUOTE_SENT)
    if (invoice.status === 'DRAFT') {
      await req.db.query(
        `UPDATE public.invoices
            SET status = 'QUOTE_SENT', updated_at = NOW()
          WHERE id = $1`,
        [invoiceId]
      );
    }

    // Build + send email via lib/email_training_quote.js (extracted to keep
    // route handler thin + satisfy Semgrep's static XSS rule by avoiding
    // nested template literals inside escape calls).
    let emailSent = false;
    try {
      emailSent = await sendTrainingQuoteEmail({ to: customerEmail, invoice });
    } catch (emailErr) {
      console.warn('Training quote email send failed:', emailErr?.message || emailErr);
    }

    await audit(req.db, req, {
      action: 'TRAINING_QUOTE_SENT',
      entity_type: 'invoice',
      entity_id: invoice.id,
      entity_name: invoice.invoice_number,
      details: { sent_to: customerEmail, email_sent: emailSent },
    });

    // Return the updated invoice
    const { rows: updatedRows } = await req.db.query(
      `SELECT * FROM public.invoices WHERE id = $1 LIMIT 1`,
      [invoiceId]
    );
    return res.json({ ok: true, invoice: updatedRows[0], email_sent: emailSent });
  } catch (err) {
    console.error('POST /super/training/quotes/:id/send error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

module.exports = router;
