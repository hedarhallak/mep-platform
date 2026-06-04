'use strict';

/**
 * routes/expense_claims.js
 *
 * Section 94.5 — Emergency purchase / invoice submission workflow.
 *
 * Endpoints:
 *   POST   /api/expense-claims                — submit a new claim
 *   POST   /api/expense-claims/receipt        — upload a receipt photo →
 *                                                { receipt_url } (Section 129)
 *   GET    /api/expense-claims                — list (filtered by ?status,
 *                                                ?project_id, ?mine=1)
 *   GET    /api/expense-claims/:id            — view a single claim
 *   PATCH  /api/expense-claims/:id/status     — accounting review:
 *                                                APPROVED / REJECTED / PAID
 *                                                (Section 129)
 *
 * All routes mount under `auth + tenantDb` (see app.js). Permission
 * gates: `expense_claims.submit` (submit + receipt upload) /
 * `expense_claims.view` / `expense_claims.approve` (status changes).
 *
 * Workflow note (Hedar, June 2 — Section 129): this is NOT a
 * pre-approval flow. The foreman buys first, then uploads the receipt
 * as documentation. Accounting reviews after the fact: APPROVED =
 * reviewed/acknowledged, REJECTED = objection (contact the employee,
 * reason required), PAID = reimbursed.
 */

const crypto = require('crypto');
const multer = require('multer');
const router = require('express').Router();
const { can } = require('../middleware/permissions');
const { audit } = require('../lib/audit');
const { processReceiptUpload, RECEIPT_MAX_FILE_SIZE_BYTES } = require('../lib/image_upload');
const { putPublicObject } = require('../lib/spaces_client');

// Memory storage — sharp processes a Buffer; limits guard against OOM.
const receiptUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: RECEIPT_MAX_FILE_SIZE_BYTES, files: 1 },
});

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

// ── POST /api/expense-claims/receipt ─────────────────────────────────
//
// Multipart upload (field name 'receipt'). Validates + auto-orients +
// downscales the photo (lib/image_upload.processReceiptUpload), uploads
// to DO Spaces under receipts/<company>/, returns { receipt_url } for
// the client to include in the subsequent POST /api/expense-claims.
router.post(
  '/receipt',
  can('expense_claims.submit'),
  (req, res, next) => {
    receiptUpload.single('receipt')(req, res, (err) => {
      if (err) {
        // Multer LIMIT_FILE_SIZE → stable 400, mirroring lib error codes.
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ ok: false, error: 'FILE_TOO_LARGE' });
        }
        console.error('POST /api/expense-claims/receipt multer error:', err);
        return res.status(400).json({ ok: false, error: 'UPLOAD_FAILED' });
      }
      return next();
    });
  },
  async (req, res) => {
    try {
      const companyId = req.user.company_id;

      let processed;
      try {
        processed = await processReceiptUpload(req.file || null);
      } catch (e) {
        const code = e && e.code ? e.code : 'IMAGE_UNREADABLE';
        return res.status(400).json({
          ok: false,
          error: code,
          message: e && e.message ? e.message : 'Image processing failed',
        });
      }

      const key = `receipts/${companyId}/${Date.now()}-${crypto.randomBytes(4).toString('hex')}.jpg`;
      let url;
      try {
        url = await putPublicObject(key, processed.buffer, processed.contentType);
      } catch (e) {
        if (e && e.code === 'SPACES_NOT_CONFIGURED') {
          console.error('Spaces upload failed: client not configured');
          return res.status(500).json({ ok: false, error: 'SPACES_NOT_CONFIGURED' });
        }
        console.error('Spaces upload failed:', e && e.message ? e.message : e);
        return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
      }

      return res.status(201).json({ ok: true, receipt_url: url });
    } catch (err) {
      console.error('POST /api/expense-claims/receipt error:', err);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  }
);

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
      // ec.-prefixed: `status` alone is ambiguous since the projects JOIN
      // (projects has its own status column).
      conditions.push(`ec.status = $${params.length}`);
    }
    if (project_id) {
      params.push(Number(project_id));
      conditions.push(`ec.project_id = $${params.length}`);
    }
    if (mine === '1' || mine === 'true') {
      params.push(userId);
      conditions.push(`ec.submitted_by_user_id = $${params.length}`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    // JOIN projects for display (Section 129.8) — submitters (foremen)
    // don't hold projects.view, so the client can't resolve codes itself.
    const { rows } = await req.db.query(
      `SELECT ec.id, ec.project_id, ec.employee_id, ec.submitted_by_user_id,
              ec.vendor, ec.amount_cents, ec.currency, ec.receipt_url, ec.description,
              ec.status, ec.approved_by_user_id, ec.approved_at, ec.rejection_reason,
              ec.created_at, ec.updated_at,
              p.project_code, p.project_name
         FROM public.expense_claims ec
         LEFT JOIN public.projects p ON p.id = ec.project_id
         ${whereClause}
         ORDER BY ec.created_at DESC
         LIMIT 200`,
      params
    );

    return res.json({ ok: true, claims: rows });
  } catch (err) {
    console.error('GET /api/expense-claims error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// ── GET /api/expense-claims/vendors ──────────────────────────────────
//
// Smart vendor recall (Section 129.5): distinct vendor names previously
// used by THIS company (RLS scopes the rows), most recently used first.
// Powers the <datalist> autocomplete on the submit form — suggestions,
// not a closed list; free text stays allowed.
//
// NOTE: defined BEFORE /:id so 'vendors' isn't swallowed by the id param.
router.get('/vendors', can('expense_claims.submit'), async (req, res) => {
  try {
    const { rows } = await req.db.query(
      `SELECT vendor, MAX(created_at) AS last_used
         FROM public.expense_claims
        GROUP BY vendor
        ORDER BY last_used DESC
        LIMIT 20`
    );
    return res.json({ ok: true, vendors: rows.map((r) => r.vendor) });
  } catch (err) {
    console.error('GET /api/expense-claims/vendors error:', err);
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

// ── PATCH /api/expense-claims/:id/status ─────────────────────────────
//
// Accounting review (Section 129). Allowed transitions:
//   PENDING  → APPROVED  (reviewed / acknowledged)
//   PENDING  → REJECTED  (objection — rejection_reason REQUIRED;
//                          accounting contacts the employee outside the app)
//   APPROVED → PAID      (reimbursed externally)
//
// The UPDATE is conditional on the required current status, so two
// concurrent reviewers can't double-transition: rowCount 0 + row exists
// → 409 INVALID_TRANSITION; row missing → 404 (RLS also hides other
// tenants' claims, which surfaces as the same 404).
router.patch('/:id/status', can('expense_claims.approve'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: 'INVALID_ID' });
    }

    const userId = Number(req.user.user_id);
    const status = req.body && req.body.status ? String(req.body.status).toUpperCase() : null;
    const reason =
      req.body && req.body.rejection_reason
        ? String(req.body.rejection_reason).trim().slice(0, 2000)
        : null;

    if (!['APPROVED', 'REJECTED', 'PAID'].includes(status)) {
      return res.status(400).json({
        ok: false,
        error: 'INVALID_STATUS',
        allowed: ['APPROVED', 'REJECTED', 'PAID'],
      });
    }
    if (status === 'REJECTED' && !reason) {
      return res.status(400).json({ ok: false, error: 'REJECTION_REASON_REQUIRED' });
    }

    const requiredCurrent = status === 'PAID' ? 'APPROVED' : 'PENDING';

    // APPROVED / REJECTED stamp the reviewer; PAID keeps the original
    // approval stamp and only flips the status.
    const { rows } =
      status === 'PAID'
        ? await req.db.query(
            `UPDATE public.expense_claims
                SET status = 'PAID', updated_at = NOW()
              WHERE id = $1 AND status = $2
              RETURNING *`,
            [id, requiredCurrent]
          )
        : await req.db.query(
            `UPDATE public.expense_claims
                SET status = $3,
                    approved_by_user_id = $4,
                    approved_at = NOW(),
                    rejection_reason = $5,
                    updated_at = NOW()
              WHERE id = $1 AND status = $2
              RETURNING *`,
            [id, requiredCurrent, status, userId, status === 'REJECTED' ? reason : null]
          );

    if (!rows.length) {
      // Distinguish "wrong state" from "not found / not visible".
      const { rows: existing } = await req.db.query(
        `SELECT id, status FROM public.expense_claims WHERE id = $1 LIMIT 1`,
        [id]
      );
      if (!existing.length) {
        return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      }
      return res.status(409).json({
        ok: false,
        error: 'INVALID_TRANSITION',
        current_status: existing[0].status,
        required_current_status: requiredCurrent,
      });
    }

    await audit(req.db, req, {
      action: `EXPENSE_CLAIM_${status}`,
      entity_type: 'expense_claim',
      entity_id: rows[0].id,
      new_values: {
        status,
        rejection_reason: status === 'REJECTED' ? reason : undefined,
      },
    });

    return res.json({ ok: true, claim: rows[0] });
  } catch (err) {
    console.error('PATCH /api/expense-claims/:id/status error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

module.exports = router;
