'use strict';

/**
 * routes/super_custom_demands.js
 *
 * Phase 6-D-4 PR 5 / Section 115.5 — SUPER_ADMIN custom-demand quote endpoint.
 * Custom demands cover ad-hoc work: custom integrations, custom reports,
 * white-label branding work, data migrations, etc. Each is a one-time invoice
 * with milestones; the same quote→invoice flow as training applies.
 *
 * Mount: app.use('/api/super', auth, superAdmin, tenantDb, this) on adminApp.
 *
 * Endpoints:
 *   POST /custom-demands/quotes
 *     Body: { company_id, title, description, scope_of_work,
 *             subtotal_cents, milestones?, estimated_completion_date?,
 *             quote_expires_at?, customer_notes?, internal_notes? }
 *     → Creates a DRAFT invoice of type='CUSTOM_DEMAND' with details JSONB
 *       matching Section 116.4 CUSTOM_DEMAND shape.
 *
 * Tax computation + sequential numbering use the same lib helpers as
 * training quotes.
 */

const express = require('express');
const router = express.Router();

const { audit } = require('../lib/audit');
const {
  generateInvoiceNumber,
  getActiveTaxRates,
  calculateTaxes,
} = require('../lib/invoice_numbering');

// ─────────────────────────────────────────────────────────────────────────────
// GET /custom-demands/quotes
//
// Phase 6-D-6 PR 3 / Section 122 — cross-company list of CUSTOM_DEMAND
// invoices for the SUPER_ADMIN Custom Demands management UI. Mirrors the
// GET /training/quotes endpoint shape (Section 120.3) so the frontend
// pattern is identical.
//
// Query params:
//   - status (optional): DRAFT/QUOTE_SENT/APPROVED/PARTIAL_PAID/PAID/...
//   - limit  (optional, default 50, max 200)
//
// Response 200: { ok, quotes: [{ id, invoice_number, status, company_id,
//                  company_name, company_code, subtotal_cents, qst_cents,
//                  gst_cents, total_cents, amount_paid_cents, currency,
//                  issue_date, quote_expires_at, customer_notes,
//                  details, created_at }] }
// ─────────────────────────────────────────────────────────────────────────────
router.get('/custom-demands/quotes', async (req, res) => {
  try {
    const status = req.query.status ? String(req.query.status).toUpperCase() : null;
    const rawLimit = parseInt(req.query.limit, 10) || 50;
    const limit = Math.min(200, Math.max(1, rawLimit));

    const where = [`i.type = 'CUSTOM_DEMAND'`];
    const params = [];
    let idx = 1;
    if (status) {
      where.push(`i.status = $${idx++}`);
      params.push(status);
    }
    params.push(limit);

    const { rows } = await req.db.query(
      `SELECT i.id, i.invoice_number, i.status, i.company_id,
              c.name AS company_name, c.company_code,
              i.subtotal_cents, i.qst_cents, i.gst_cents,
              i.total_cents, i.amount_paid_cents, i.currency,
              i.issue_date, i.quote_expires_at,
              i.customer_notes, i.details, i.created_at
         FROM public.invoices i
         JOIN public.companies c ON c.company_id = i.company_id
        WHERE ${where.join(' AND ')}
        ORDER BY i.issue_date DESC, i.id DESC
        LIMIT $${idx}`,
      params
    );

    return res.json({
      ok: true,
      quotes: rows.map((r) => ({
        id: Number(r.id),
        invoice_number: r.invoice_number,
        status: r.status,
        company_id: Number(r.company_id),
        company_name: r.company_name,
        company_code: r.company_code,
        subtotal_cents: Number(r.subtotal_cents),
        qst_cents: Number(r.qst_cents),
        gst_cents: Number(r.gst_cents),
        total_cents: Number(r.total_cents),
        amount_paid_cents: Number(r.amount_paid_cents),
        currency: r.currency,
        issue_date: r.issue_date,
        quote_expires_at: r.quote_expires_at,
        customer_notes: r.customer_notes,
        details: r.details || {},
        created_at: r.created_at,
      })),
    });
  } catch (err) {
    console.error('GET /super/custom-demands/quotes error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

router.post('/custom-demands/quotes', async (req, res) => {
  try {
    const body = req.body || {};
    const companyId = Number(body.company_id);
    if (!companyId) {
      return res.status(400).json({ ok: false, error: 'INVALID_COMPANY_ID' });
    }

    // Verify company exists
    const { rows: companyRows } = await req.db.query(
      `SELECT company_id, name FROM public.companies WHERE company_id = $1 LIMIT 1`,
      [companyId]
    );
    if (companyRows.length === 0) {
      return res.status(404).json({ ok: false, error: 'COMPANY_NOT_FOUND' });
    }

    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title || title.length > 200) {
      return res.status(400).json({
        ok: false,
        error: 'INVALID_TITLE',
        message: 'title must be a non-empty string ≤200 chars',
      });
    }

    const subtotalCents = Number(body.subtotal_cents);
    if (!Number.isInteger(subtotalCents) || subtotalCents < 0) {
      return res.status(400).json({
        ok: false,
        error: 'INVALID_SUBTOTAL_CENTS',
        message: 'subtotal_cents must be a non-negative integer',
      });
    }

    // Optional milestones — validate shape if provided
    let milestones = [];
    if (Array.isArray(body.milestones)) {
      const sumOfMilestones = body.milestones.reduce(
        (acc, m) => acc + Number(m?.amount_cents || 0),
        0
      );
      // Soft check: don't enforce equality (milestones may be a subset for partial-billing scenarios),
      // but reject if any milestone amount is invalid
      for (const m of body.milestones) {
        if (!m || typeof m !== 'object') {
          return res.status(400).json({ ok: false, error: 'INVALID_MILESTONE_ENTRY' });
        }
        const amt = Number(m.amount_cents);
        if (!Number.isInteger(amt) || amt < 0) {
          return res.status(400).json({ ok: false, error: 'INVALID_MILESTONE_AMOUNT' });
        }
        milestones.push({
          name: String(m.name || 'Unnamed milestone').slice(0, 200),
          amount_cents: amt,
          due_after_days: Number(m.due_after_days) || null,
        });
      }
      void sumOfMilestones; // intentionally not used; documenting that we computed it for future validation
    }

    const issueDate = new Date();
    const taxRates = await getActiveTaxRates(req.db, issueDate);
    const { qst_cents, gst_cents, total_cents } = calculateTaxes(subtotalCents, taxRates);
    const invoiceNumber = await generateInvoiceNumber(req.db, issueDate);

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
      title,
      description: body.description ? String(body.description).slice(0, 5000) : null,
      scope_of_work: body.scope_of_work ? String(body.scope_of_work).slice(0, 20000) : null,
      milestones,
      estimated_completion_date: body.estimated_completion_date || null,
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
       VALUES ($1, 'CUSTOM_DEMAND', $2, 'DRAFT',
               $3, $4, $5, $6,
               'CAD', $7, $8,
               $9, $10, $11,
               $12)
       RETURNING *`,
      [
        companyId,
        invoiceNumber,
        subtotalCents,
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
      action: 'CUSTOM_DEMAND_QUOTE_CREATED',
      entity_type: 'invoice',
      entity_id: invoice.id,
      entity_name: invoice.invoice_number,
      new_values: { subtotal_cents: subtotalCents, total_cents, type: 'CUSTOM_DEMAND' },
      details: { title, milestones_count: milestones.length },
    });

    return res.json({ ok: true, invoice });
  } catch (err) {
    console.error('POST /super/custom-demands/quotes error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

module.exports = router;
