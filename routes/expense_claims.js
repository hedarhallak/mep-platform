'use strict';

/**
 * routes/expense_claims.js
 *
 * Section 94.5 — Emergency purchase / invoice submission workflow.
 *
 * Starter scope: POST (submit) + GET (list own + project-scoped).
 * Admin approve/reject (PATCH) + payment-marked (PATCH status=PAID) +
 * tests come in follow-up PRs.
 *
 * Endpoints:
 *   POST   /api/expense-claims                — submit a new claim
 *   GET    /api/expense-claims                — list (filtered by ?status,
 *                                                ?project_id, ?mine=1)
 *   GET    /api/expense-claims/:id            — view a single claim
 *
 * All routes mount under `auth + tenantDb` (see app.js). Permission
 * gates: `expense_claims.submit` / `expense_claims.view`. The
 * `expense_claims.approve` permission lands when the PATCH endpoint
 * ships in the next PR.
 */

const router = require('express').Router();
const { can } = require('../middleware/permissions');
const { audit } = require('../lib/audit');

// ── Helpers ──────────────────────────────────────────────────────────

// Backend-side validation. Currency limited to CAD/USD for now.
const ALLOWED_CURRENCIES = new Set(['CAD', 'USD']);

function parseAmount(rawAmount) {
  // Accept either a decimal-string ('40.50') or an integer cents value
  // (4050). Reject NaN, negatives, zero, and excessively large numbers.
  if (rawAmount == null) return null;
  const num = Number(rawAmount);
  if (!Number.isFinite(num) || num <= 0) return null;
  // If the caller passed a decimal, convert to cents. If integer >= 1000,
  // assume it's already cents (e.g., 4050 ≠ $4050 — it's $40.50).
  // To avoid ambiguity, callers should send cents as integer string and
  // the frontend should multiply $40.50 * 100 before submitting.
  const cents = Math.round(num * 100) === num * 100 ? num : Math.round(num * 100);
  if (cents > 1_000_000_00) return null; // $1M cap; sanity guard
  return cents;
}

// ── POST /api/expense-claims ─────────────────────────────────────────
router.post('/', can('expense_claims.submit'), async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const userId = Number(req.user.user_id);
    const { project_id, employee_id, vendor, amount_cents, currency, receipt_url, description } =
      req.body || {};

    // Validation
    if (!project_id || !vendor || !amount_cents) {
      return res.status(400).json({
        ok: false,
        error: 'MISSING_FIELDS',
        required: ['project_id', 'vendor', 'amount_cents'],
      });
    }

    const cents = parseAmount(amount_cents);
    if (cents === null) {
      return res.status(400).json({ ok: false, error: 'INVALID_AMOUNT' });
    }

    const ccy = (currency || 'CAD').toUpperCase();
    if (!ALLOWED_CURRENCIES.has(ccy)) {
      return res.status(400).json({
        ok: false,
        error: 'UNSUPPORTED_CURRENCY',
        allowed: Array.from(ALLOWED_CURRENCIES),
      });
    }

    // Insert. WHERE company_id is enforced by RLS — defense-in-depth
    // the explicit reference here too.
    const { rows } = await req.db.query(
      `INSERT INTO public.expense_claims
         (company_id, project_id, employee_id, submitted_by_user_id,
          vendor, amount_cents, currency, receipt_url, description, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'PENDING')
       RETURNING *`,
      [
        companyId,
        Number(project_id),
        employee_id ? Number(employee_id) : null,
        userId,
        String(vendor).trim(),
        cents,
        ccy,
        receipt_url ? String(receipt_url).trim() : null,
        description ? String(description).trim() : null,
      ]
    );

    await audit(req.db, req, {
      action: 'EXPENSE_CLAIM_SUBMITTED',
      entity_type: 'expense_claim',
      entity_id: rows[0].id,
      new_values: {
        project_id: rows[0].project_id,
        vendor: rows[0].vendor,
        amount_cents: rows[0].amount_cents,
        currency: rows[0].currency,
      },
    });

    return res.status(201).json({ ok: true, claim: rows[0] });
  } catch (err) {
    console.error('POST /api/expense-claims error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// ── GET /api/expense-claims ──────────────────────────────────────────
//
// Query params:
//   ?status=PENDING|APPROVED|REJECTED|PAID    — filter by status
//   ?project_id=<id>                          — filter by project
//   ?mine=1                                   — only claims submitted by
//                                               the requesting user
router.get('/', can('expense_claims.view'), async (req, res) => {
  try {
    const userId = Number(req.user.user_id);
    const { status, project_id, mine } = req.query;

    const conditions = [];
    const params = [];

    if (status) {
      if (!['PENDING', 'APPROVED', 'REJECTED', 'PAID'].includes(status)) {
        return res.status(400).json({ ok: false, error: 'INVALID_STATUS' });
      }
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }
    if (project_id) {
      params.push(Number(project_id));
      conditions.push(`project_id = $${params.length}`);
    }
    if (mine === '1' || mine === 'true') {
      params.push(userId);
      conditions.push(`submitted_by_user_id = $${params.length}`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows } = await req.db.query(
      `SELECT id, project_id, employee_id, submitted_by_user_id,
              vendor, amount_cents, currency, receipt_url, description,
              status, approved_by_user_id, approved_at, rejection_reason,
              created_at, updated_at
         FROM public.expense_claims
         ${whereClause}
         ORDER BY created_at DESC
         LIMIT 200`,
      params
    );

    return res.json({ ok: true, claims: rows });
  } catch (err) {
    console.error('GET /api/expense-claims error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// ── GET /api/expense-claims/:id ──────────────────────────────────────
router.get('/:id', can('expense_claims.view'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: 'INVALID_ID' });
    }

    const { rows } = await req.db.query(
      `SELECT id, company_id, project_id, employee_id, submitted_by_user_id,
              vendor, amount_cents, currency, receipt_url, description,
              status, approved_by_user_id, approved_at, rejection_reason,
              created_at, updated_at
         FROM public.expense_claims
        WHERE id = $1
        LIMIT 1`,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
    }

    return res.json({ ok: true, claim: rows[0] });
  } catch (err) {
    console.error('GET /api/expense-claims/:id error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

module.exports = router;
