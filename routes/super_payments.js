'use strict';

/**
 * routes/super_payments.js
 *
 * Phase 6-D-4 PR 5 / Section 116.5 — SUPER_ADMIN manual payment recording.
 * Used when a customer pays via bank transfer / cheque / cash and Hedar
 * records it against the invoice. (Stripe-driven automatic payments land
 * in Phase 9-B.)
 *
 * Mount: app.use('/api/super', auth, superAdmin, tenantDb, this) on adminApp.
 *
 * Endpoint:
 *   POST /payments/record
 *     Body: { invoice_id, amount_cents, method, paid_at?, external_ref?,
 *             is_partial?, notes? }
 *     → INSERTs into payments + UPDATEs invoice.amount_paid_cents + transitions
 *       invoice.status (PAID if fully paid, PARTIAL_PAID otherwise). Logs audit.
 *
 * Methods: STRIPE_CARD | BANK_TRANSFER | CHEQUE | CASH | OTHER
 *
 * Refund handling is intentionally out of scope here — recording a refund
 * gets its own endpoint in Phase 9-B (which also handles Stripe-driven
 * partial refunds with idempotency keys).
 */

const express = require('express');
const router = express.Router();

const { audit } = require('../lib/audit');

const VALID_METHODS = ['STRIPE_CARD', 'BANK_TRANSFER', 'CHEQUE', 'CASH', 'OTHER'];

// ─────────────────────────────────────────────────────────────────────────────
// GET /payments
//
// Phase 6-D-6 PR 4 / Section 123 — cross-company list of recorded payments for
// the SUPER_ADMIN Payments management UI. Mirrors the GET /custom-demands/quotes
// shape (Section 122.1): optional filter, limit default 50 / max 200, newest
// first. Joins invoices (for invoice_number + type) and companies (for the
// tenant name/code) so the table can render without N+1 lookups.
//
// Query params:
//   - method (optional): STRIPE_CARD | BANK_TRANSFER | CHEQUE | CASH | OTHER
//   - limit  (optional, default 50, max 200)
//
// Response 200: { ok, payments: [{ id, invoice_id, invoice_number,
//                  invoice_type, company_id, company_name, company_code,
//                  amount_cents, currency, method, status, is_partial,
//                  paid_at, external_ref, notes, created_at }] }
// ─────────────────────────────────────────────────────────────────────────────
router.get('/payments', async (req, res) => {
  try {
    const method = req.query.method ? String(req.query.method).trim().toUpperCase() : null;
    if (method && !VALID_METHODS.includes(method)) {
      return res.status(400).json({
        ok: false,
        error: 'INVALID_METHOD',
        message: `method must be one of: ${VALID_METHODS.join(', ')}`,
      });
    }
    const rawLimit = parseInt(req.query.limit, 10) || 50;
    const limit = Math.min(200, Math.max(1, rawLimit));

    const where = [];
    const params = [];
    let idx = 1;
    if (method) {
      where.push(`p.method = $${idx++}`);
      params.push(method);
    }
    params.push(limit);

    const { rows } = await req.db.query(
      `SELECT p.id, p.invoice_id, p.amount_cents, p.currency, p.method,
              p.status, p.is_partial, p.paid_at, p.external_ref, p.notes,
              p.created_at,
              i.invoice_number, i.type AS invoice_type, i.company_id,
              c.name AS company_name, c.company_code
         FROM public.payments p
         JOIN public.invoices i  ON i.id = p.invoice_id
         JOIN public.companies c ON c.company_id = i.company_id
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY p.paid_at DESC NULLS LAST, p.id DESC
        LIMIT $${idx}`,
      params
    );

    return res.json({
      ok: true,
      payments: rows.map((r) => ({
        id: Number(r.id),
        invoice_id: Number(r.invoice_id),
        invoice_number: r.invoice_number,
        invoice_type: r.invoice_type,
        company_id: Number(r.company_id),
        company_name: r.company_name,
        company_code: r.company_code,
        amount_cents: Number(r.amount_cents),
        currency: r.currency,
        method: r.method,
        status: r.status,
        is_partial: r.is_partial,
        paid_at: r.paid_at,
        external_ref: r.external_ref,
        notes: r.notes,
        created_at: r.created_at,
      })),
    });
  } catch (err) {
    console.error('GET /super/payments error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /payments/invoices
//
// Phase 6-D-6 PR 4 / Section 123 — invoice picker for the Record Payment modal.
// Cross-tenant list of invoices that can still receive a payment: status NOT in
// (VOID, REFUNDED, PAID) and amount_paid_cents < total_cents. Any type
// (SUBSCRIPTION / TRAINING / CUSTOM_DEMAND). Newest first, limit 50 / max 200.
//
// Response 200: { ok, invoices: [{ id, invoice_number, type, status,
//                  company_id, company_name, company_code, total_cents,
//                  amount_paid_cents, balance_cents, currency, issue_date }] }
// ─────────────────────────────────────────────────────────────────────────────
router.get('/payments/invoices', async (req, res) => {
  try {
    const rawLimit = parseInt(req.query.limit, 10) || 50;
    const limit = Math.min(200, Math.max(1, rawLimit));

    const { rows } = await req.db.query(
      `SELECT i.id, i.invoice_number, i.type, i.status, i.company_id,
              c.name AS company_name, c.company_code,
              i.total_cents, i.amount_paid_cents, i.currency, i.issue_date
         FROM public.invoices i
         JOIN public.companies c ON c.company_id = i.company_id
        WHERE i.status NOT IN ('VOID', 'REFUNDED', 'PAID')
          AND i.amount_paid_cents < i.total_cents
        ORDER BY i.issue_date DESC, i.id DESC
        LIMIT $1`,
      [limit]
    );

    return res.json({
      ok: true,
      invoices: rows.map((r) => ({
        id: Number(r.id),
        invoice_number: r.invoice_number,
        type: r.type,
        status: r.status,
        company_id: Number(r.company_id),
        company_name: r.company_name,
        company_code: r.company_code,
        total_cents: Number(r.total_cents),
        amount_paid_cents: Number(r.amount_paid_cents),
        balance_cents: Number(r.total_cents) - Number(r.amount_paid_cents),
        currency: r.currency,
        issue_date: r.issue_date,
      })),
    });
  } catch (err) {
    console.error('GET /super/payments/invoices error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

router.post('/payments/record', async (req, res) => {
  try {
    const body = req.body || {};
    const invoiceId = Number(body.invoice_id);
    if (!invoiceId) {
      return res.status(400).json({ ok: false, error: 'INVALID_INVOICE_ID' });
    }

    const amountCents = Number(body.amount_cents);
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      return res.status(400).json({
        ok: false,
        error: 'INVALID_AMOUNT_CENTS',
        message: 'amount_cents must be a positive integer',
      });
    }

    const method = String(body.method || '')
      .trim()
      .toUpperCase();
    if (!VALID_METHODS.includes(method)) {
      return res.status(400).json({
        ok: false,
        error: 'INVALID_METHOD',
        message: `method must be one of: ${VALID_METHODS.join(', ')}`,
      });
    }

    // Load invoice to verify it exists + check current state
    const { rows: invRows } = await req.db.query(
      `SELECT id, company_id, status, total_cents, amount_paid_cents, type, invoice_number
         FROM public.invoices WHERE id = $1 LIMIT 1`,
      [invoiceId]
    );
    if (invRows.length === 0) {
      return res.status(404).json({ ok: false, error: 'INVOICE_NOT_FOUND' });
    }
    const invoice = invRows[0];

    // Block recording payments on void/refunded invoices
    if (['VOID', 'REFUNDED'].includes(invoice.status)) {
      return res.status(400).json({
        ok: false,
        error: 'INVOICE_NOT_PAYABLE',
        message: `invoice is in status ${invoice.status} — cannot record payment`,
      });
    }

    // Block over-payment (amount_paid + new amount > total)
    const newAmountPaid = Number(invoice.amount_paid_cents) + amountCents;
    if (newAmountPaid > Number(invoice.total_cents)) {
      return res.status(400).json({
        ok: false,
        error: 'OVERPAYMENT',
        message: `recording $${(amountCents / 100).toFixed(2)} would exceed invoice total $${(Number(invoice.total_cents) / 100).toFixed(2)} (current paid: $${(Number(invoice.amount_paid_cents) / 100).toFixed(2)})`,
      });
    }

    const paidAt = body.paid_at ? new Date(body.paid_at) : new Date();
    if (Number.isNaN(paidAt.getTime())) {
      return res.status(400).json({ ok: false, error: 'INVALID_PAID_AT' });
    }

    const isPartial =
      body.is_partial != null ? !!body.is_partial : newAmountPaid < Number(invoice.total_cents);

    // Insert payment row
    const { rows: paymentRows } = await req.db.query(
      `INSERT INTO public.payments
         (invoice_id, amount_cents, currency, method, status, paid_at,
          external_ref, is_partial, notes, recorded_by_user_id)
       VALUES ($1, $2, 'CAD', $3, 'SUCCEEDED', $4,
               $5, $6, $7, $8)
       RETURNING *`,
      [
        invoiceId,
        amountCents,
        method,
        paidAt.toISOString(),
        body.external_ref ? String(body.external_ref).slice(0, 200) : null,
        isPartial,
        body.notes ? String(body.notes).slice(0, 2000) : null,
        req.user?.user_id || null,
      ]
    );
    const payment = paymentRows[0];

    // Update invoice.amount_paid_cents + status
    const newStatus = newAmountPaid >= Number(invoice.total_cents) ? 'PAID' : 'PARTIAL_PAID';
    const paidDate = newStatus === 'PAID' ? paidAt.toISOString().slice(0, 10) : null;

    const { rows: updatedRows } = await req.db.query(
      `UPDATE public.invoices
          SET amount_paid_cents = $1,
              status            = $2,
              paid_date         = COALESCE($3, paid_date),
              updated_at        = NOW()
        WHERE id = $4
        RETURNING *`,
      [newAmountPaid, newStatus, paidDate, invoiceId]
    );
    const updatedInvoice = updatedRows[0];

    await audit(req.db, req, {
      action: 'PAYMENT_RECORDED',
      entity_type: 'payment',
      entity_id: payment.id,
      entity_name: `${invoice.invoice_number} — payment #${payment.id}`,
      new_values: {
        invoice_id: invoiceId,
        amount_cents: amountCents,
        method,
        is_partial: isPartial,
        new_invoice_status: newStatus,
        new_amount_paid_cents: newAmountPaid,
      },
      details: { external_ref: payment.external_ref, paid_at: paidAt.toISOString() },
    });

    return res.json({
      ok: true,
      payment,
      invoice: updatedInvoice,
    });
  } catch (err) {
    console.error('POST /super/payments/record error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

module.exports = router;
