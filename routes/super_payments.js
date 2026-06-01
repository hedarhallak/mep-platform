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
