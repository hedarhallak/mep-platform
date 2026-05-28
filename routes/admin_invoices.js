'use strict';

/**
 * routes/admin_invoices.js
 *
 * Phase 6-D-5 PR 2 / Section 119 — customer-facing invoices list endpoint.
 * Used by the tenant Billing/Invoices page (mep.constrai.ca/billing/invoices)
 * to render a paginated, filterable table of the company's invoices.
 *
 * Mount: app.use('/api/admin/invoices', auth, tenantDb, this) on tenantApp.
 *
 * Endpoint:
 *   GET /
 *     Query params:
 *       - page   (default 1)
 *       - limit  (default 20, max 100)
 *       - type   (optional, ENUM: SUBSCRIPTION_RECURRING | TRAINING |
 *                                  CUSTOM_DEMAND | OTHER)
 *       - status (optional: DRAFT, QUOTE_SENT, APPROVED, PARTIAL_PAID,
 *                            PAID, OVERDUE, VOID, REFUNDED)
 *     Response 200:
 *       {
 *         ok: true,
 *         invoices: [{ id, invoice_number, type, status,
 *                       subtotal_cents, qst_cents, gst_cents, total_cents,
 *                       amount_paid_cents, currency,
 *                       issue_date, due_date, paid_date, quote_expires_at,
 *                       customer_notes }],
 *         pagination: { page, limit, total, total_pages }
 *       }
 *     400 INVALID_TYPE | INVALID_STATUS | INVALID_PAGINATION
 *     500 SERVER_ERROR
 *
 * RBAC: COMPANY_ADMIN_UP (COMPANY_ADMIN, IT_ADMIN, SUPER_ADMIN). Foremen
 *       and workers do not see billing data.
 *
 * Scoping: results are scoped to req.user.company_id via the WHERE clause
 *          AND the underlying RLS on the invoices table (mepuser sees only
 *          their tenant's rows; SUPER_ADMIN's bypass-RLS role can see all
 *          but we still scope by req.user.company_id to keep the UX honest
 *          for SA-as-tenant-impersonation).
 *
 * internal_notes are deliberately NOT returned to the customer — those are
 * SUPER_ADMIN-only per the schema comment in migration 018.
 */

const express = require('express');
const router = express.Router();

const { COMPANY_ADMIN_UP } = require('../middleware/roles');
router.use(COMPANY_ADMIN_UP);

const VALID_TYPES = ['SUBSCRIPTION_RECURRING', 'TRAINING', 'CUSTOM_DEMAND', 'OTHER'];
const VALID_STATUSES = [
  'DRAFT',
  'QUOTE_SENT',
  'APPROVED',
  'PARTIAL_PAID',
  'PAID',
  'OVERDUE',
  'VOID',
  'REFUNDED',
];

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

router.get('/', async (req, res) => {
  try {
    const companyId = req.user?.company_id;
    if (!companyId) {
      return res.status(401).json({ ok: false, error: 'NO_TENANT' });
    }

    // Parse + validate pagination
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const rawLimit = parseInt(req.query.limit, 10) || DEFAULT_LIMIT;
    const limit = Math.min(MAX_LIMIT, Math.max(1, rawLimit));
    if (Number.isNaN(page) || Number.isNaN(limit)) {
      return res.status(400).json({ ok: false, error: 'INVALID_PAGINATION' });
    }
    const offset = (page - 1) * limit;

    // Optional filters
    const typeFilter = req.query.type ? String(req.query.type).toUpperCase() : null;
    if (typeFilter && !VALID_TYPES.includes(typeFilter)) {
      return res.status(400).json({
        ok: false,
        error: 'INVALID_TYPE',
        message: `type must be one of ${VALID_TYPES.join(', ')}`,
      });
    }
    const statusFilter = req.query.status ? String(req.query.status).toUpperCase() : null;
    if (statusFilter && !VALID_STATUSES.includes(statusFilter)) {
      return res.status(400).json({
        ok: false,
        error: 'INVALID_STATUS',
        message: `status must be one of ${VALID_STATUSES.join(', ')}`,
      });
    }

    // Build WHERE clause. company_id is always scoped; type/status added if
    // provided. Parameters are positional ($1, $2, …) to keep pg's pool happy.
    const where = ['company_id = $1'];
    const params = [companyId];
    let idx = 2;
    if (typeFilter) {
      where.push(`type = $${idx++}`);
      params.push(typeFilter);
    }
    if (statusFilter) {
      where.push(`status = $${idx++}`);
      params.push(statusFilter);
    }
    const whereSql = where.join(' AND ');

    // Total count (for pagination metadata)
    const countResult = await req.db.query(
      `SELECT COUNT(*)::int AS total FROM public.invoices WHERE ${whereSql}`,
      params
    );
    const total = countResult.rows[0]?.total || 0;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    // Page query. ORDER BY issue_date DESC, id DESC is stable + matches the
    // "newest first" UX. We explicitly list the columns to avoid leaking
    // internal_notes / pdf_url / approved_by to the customer.
    const pageResult = await req.db.query(
      `SELECT id, invoice_number, type, status,
              subtotal_cents, qst_cents, gst_cents, total_cents,
              amount_paid_cents, currency,
              issue_date, due_date, paid_date, quote_expires_at,
              customer_notes,
              created_at
         FROM public.invoices
        WHERE ${whereSql}
        ORDER BY issue_date DESC, id DESC
        LIMIT $${idx++} OFFSET $${idx}`,
      [...params, limit, offset]
    );

    return res.json({
      ok: true,
      invoices: pageResult.rows.map((r) => ({
        id: Number(r.id),
        invoice_number: r.invoice_number,
        type: r.type,
        status: r.status,
        subtotal_cents: Number(r.subtotal_cents),
        qst_cents: Number(r.qst_cents),
        gst_cents: Number(r.gst_cents),
        total_cents: Number(r.total_cents),
        amount_paid_cents: Number(r.amount_paid_cents),
        currency: r.currency,
        issue_date: r.issue_date,
        due_date: r.due_date,
        paid_date: r.paid_date,
        quote_expires_at: r.quote_expires_at,
        customer_notes: r.customer_notes,
        created_at: r.created_at,
      })),
      pagination: {
        page,
        limit,
        total,
        total_pages: totalPages,
      },
    });
  } catch (err) {
    console.error('GET /admin/invoices error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

module.exports = router;
