'use strict';

/**
 * routes/admin_subscription_requests.js
 *
 * Phase 6-D-4 PR 4 / Section 117.4 — customer-facing subscription change
 * request endpoints. Used by tenant COMPANY_ADMIN to formally request a
 * seat change, cancellation, or plan upgrade.
 *
 * Mount: app.use('/api/admin/subscription', auth, tenantDb, this) on
 *        tenantApp (NOT adminApp — these are customer-facing).
 *
 * The "hybrid DB-audit + email" workflow from Section 117.4:
 *   1. Customer admin submits this form → POST /seat-request (or cancel-/plan-upgrade-)
 *   2. We INSERT audit_logs row #1 (immutable per Pitfall #22) capturing
 *      WHO clicked, WHEN, with WHAT details
 *   3. Response includes request_audit_id + mailto_subject + mailto_body
 *      so the frontend can `window.location = mailto:...` and the
 *      customer's email client opens with pre-filled values
 *   4. Customer sends the email (their Sent folder = personal copy of proof)
 *   5. SUPER_ADMIN processes via POST /api/super/subscriptions/:id/apply-change
 *      (linked to this request via details.request_audit_id)
 *   6. Resend auto-email confirms to the customer (Section 117.4)
 *
 * Endpoints (all require COMPANY_ADMIN role):
 *   POST /seat-request           — request seat count change
 *   POST /cancel-request         — request subscription cancellation
 *   POST /plan-upgrade-request   — request plan type change (MONTHLY/ANNUAL/ENTERPRISE)
 *
 * Responses:
 *   200 { ok, request_audit_id, mailto_subject, mailto_body }
 *   400 invalid input (codes below)
 *   403 RBAC failure (handled by middleware/permissions)
 *   404 SUBSCRIPTION_NOT_FOUND
 *   500 SERVER_ERROR
 *
 * Notes:
 *   - We INSERT audit_logs DIRECTLY via req.db.query (RLS-scoped) rather
 *     than via lib/audit.js audit() — we need the inserted id back, and
 *     audit() doesn't return it. Same column shape as audit(); the only
 *     differences are RETURNING id + JSONB details with the request payload.
 *   - mailto_body is pre-rendered server-side (not client-side) so the
 *     pre-fill text matches what the audit log captured. Customer can edit
 *     before sending; both copies still exist (audit + customer's outbound).
 */

const express = require('express');
const router = express.Router();

// RBAC: only company-admin-level roles (COMPANY_ADMIN, IT_ADMIN, SUPER_ADMIN)
// can request subscription changes. Foremen / workers can never do this.
const { COMPANY_ADMIN_UP } = require('../middleware/roles');
router.use(COMPANY_ADMIN_UP);

const BILLING_EMAIL = 'billing@constrai.ca';
const MAX_REASON_LENGTH = 1000;
const VALID_PLAN_TYPES = ['MONTHLY', 'ANNUAL', 'ENTERPRISE'];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Insert an audit_logs row capturing a customer-initiated subscription
 * change request. Returns the inserted row's id.
 *
 * Mirrors lib/audit.js audit()'s column shape, but uses RETURNING id so
 * the route response can include the audit id for the frontend.
 */
async function insertCustomerRequestAuditLog(
  db,
  req,
  {
    subscriptionId,
    companyId,
    changeCategory, // 'SEAT_CHANGE' | 'CANCEL' | 'PLAN_CHANGE'
    currentValues, // current state snapshot for the audit
    requestedValues, // what the customer is asking for
    reason,
  }
) {
  const user = req?.user || {};
  const userId = user.user_id || null;
  const username = user.username || null;
  const role = user.role || null;
  const ipAddress = req?.ip || req?.headers?.['x-forwarded-for']?.split(',')[0]?.trim() || null;
  const userAgent = req?.headers?.['user-agent'] || null;

  const details = {
    change_category: changeCategory,
    current: currentValues,
    requested: requestedValues,
    reason: reason || null,
    source: 'web_app_button',
    user_agent: userAgent,
    request_timestamp: new Date().toISOString(),
  };

  const { rows } = await db.query(
    `INSERT INTO public.audit_logs
       (company_id, user_id, username, role, action, entity_type, entity_id,
        entity_name, details, ip_address, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
     RETURNING id`,
    [
      companyId,
      userId,
      username,
      role,
      'CUSTOMER_REQUESTED_SUBSCRIPTION_CHANGE',
      'subscription',
      subscriptionId,
      `${changeCategory} request`,
      JSON.stringify(details),
      ipAddress,
    ]
  );
  return Number(rows[0].id);
}

/**
 * Look up the company + active subscription for the request actor.
 * Returns null if either is missing.
 */
async function loadCompanyAndSubscription(db, companyId) {
  const { rows } = await db.query(
    `SELECT c.company_id, c.name AS company_name, c.company_code,
            s.id AS subscription_id, s.status, s.plan_type,
            s.subscribed_seats, s.current_unit_price_cents,
            s.current_bracket_label, s.next_billing_at,
            s.cancel_at_period_end
       FROM public.companies c
       LEFT JOIN public.subscriptions s ON s.company_id = c.company_id
      WHERE c.company_id = $1
      LIMIT 1`,
    [companyId]
  );
  return rows[0] || null;
}

/**
 * Build the suggested mailto body. The customer's email client will open
 * with this pre-filled; they can edit before sending.
 */
function buildMailtoBody(category, ctx) {
  const lines = [];
  lines.push(`Hello Constrai billing team,`);
  lines.push('');
  lines.push(`Company: ${ctx.companyName} (${ctx.companyCode})`);
  lines.push(`Subscription ID: ${ctx.subscriptionId}`);
  lines.push('');
  if (category === 'SEAT_CHANGE') {
    lines.push(
      `Request: change subscribed seats from ${ctx.currentSeats} to ${ctx.requestedSeats}.`
    );
  } else if (category === 'CANCEL') {
    lines.push(
      `Request: cancel my subscription${ctx.cancelAtPeriodEnd === false ? ' immediately' : ' at the end of the current billing period'}.`
    );
  } else if (category === 'PLAN_CHANGE') {
    lines.push(`Request: change plan type from ${ctx.currentPlan} to ${ctx.requestedPlan}.`);
  }
  if (ctx.reason) {
    lines.push('');
    lines.push(`Reason: ${ctx.reason}`);
  }
  lines.push('');
  lines.push(
    `Audit reference: request_audit_id = ${ctx.requestAuditId} (also visible in your Constrai admin audit log).`
  );
  lines.push('');
  lines.push(`Thanks,`);
  lines.push(`${ctx.requesterName || 'Company admin'}`);
  return lines.join('\n');
}

function buildMailtoSubject(category, ctx) {
  if (category === 'SEAT_CHANGE') {
    return `Seat change request - ${ctx.companyName} (${ctx.currentSeats} → ${ctx.requestedSeats})`;
  }
  if (category === 'CANCEL') {
    return `Subscription cancellation request - ${ctx.companyName}`;
  }
  if (category === 'PLAN_CHANGE') {
    return `Plan change request - ${ctx.companyName} (${ctx.currentPlan} → ${ctx.requestedPlan})`;
  }
  return `Subscription change request - ${ctx.companyName}`;
}

function buildMailtoUrl(category, ctx) {
  const subject = encodeURIComponent(buildMailtoSubject(category, ctx));
  const body = encodeURIComponent(buildMailtoBody(category, ctx));
  return `mailto:${BILLING_EMAIL}?subject=${subject}&body=${body}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /seat-request
// ─────────────────────────────────────────────────────────────────────────────
router.post('/seat-request', async (req, res) => {
  try {
    const companyId = req.user?.company_id;
    if (!companyId) {
      return res.status(401).json({ ok: false, error: 'NO_TENANT' });
    }

    const requestedSeatsRaw = req.body?.requested_seats;
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : null;

    const requestedSeats = Number(requestedSeatsRaw);
    if (!Number.isInteger(requestedSeats) || requestedSeats < 1 || requestedSeats > 10000) {
      return res.status(400).json({
        ok: false,
        error: 'INVALID_REQUESTED_SEATS',
        message: 'requested_seats must be an integer between 1 and 10000',
      });
    }
    if (reason && reason.length > MAX_REASON_LENGTH) {
      return res.status(400).json({
        ok: false,
        error: 'REASON_TOO_LONG',
        message: `reason must be ≤${MAX_REASON_LENGTH} characters`,
      });
    }

    const ctx = await loadCompanyAndSubscription(req.db, companyId);
    if (!ctx || !ctx.subscription_id) {
      return res.status(404).json({ ok: false, error: 'SUBSCRIPTION_NOT_FOUND' });
    }
    if (Number(requestedSeats) === Number(ctx.subscribed_seats)) {
      return res.status(400).json({
        ok: false,
        error: 'NO_CHANGE',
        message: `requested_seats (${requestedSeats}) equals current subscribed_seats`,
      });
    }

    const requestAuditId = await insertCustomerRequestAuditLog(req.db, req, {
      subscriptionId: Number(ctx.subscription_id),
      companyId: Number(companyId),
      changeCategory: 'SEAT_CHANGE',
      currentValues: {
        subscribed_seats: Number(ctx.subscribed_seats),
        unit_price_cents: Number(ctx.current_unit_price_cents),
        bracket_label: ctx.current_bracket_label,
      },
      requestedValues: {
        subscribed_seats: requestedSeats,
      },
      reason,
    });

    const mailtoCtx = {
      companyName: ctx.company_name,
      companyCode: ctx.company_code,
      subscriptionId: Number(ctx.subscription_id),
      currentSeats: Number(ctx.subscribed_seats),
      requestedSeats,
      reason,
      requestAuditId,
      requesterName: req.user?.username || req.user?.email || null,
    };

    return res.json({
      ok: true,
      request_audit_id: requestAuditId,
      mailto_subject: buildMailtoSubject('SEAT_CHANGE', mailtoCtx),
      mailto_body: buildMailtoBody('SEAT_CHANGE', mailtoCtx),
      mailto_url: buildMailtoUrl('SEAT_CHANGE', mailtoCtx),
    });
  } catch (err) {
    console.error('POST /admin/subscription/seat-request error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /cancel-request
// ─────────────────────────────────────────────────────────────────────────────
router.post('/cancel-request', async (req, res) => {
  try {
    const companyId = req.user?.company_id;
    if (!companyId) {
      return res.status(401).json({ ok: false, error: 'NO_TENANT' });
    }

    const cancelAtPeriodEnd = req.body?.cancel_at_period_end !== false; // default true
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : null;
    if (reason && reason.length > MAX_REASON_LENGTH) {
      return res.status(400).json({
        ok: false,
        error: 'REASON_TOO_LONG',
        message: `reason must be ≤${MAX_REASON_LENGTH} characters`,
      });
    }

    const ctx = await loadCompanyAndSubscription(req.db, companyId);
    if (!ctx || !ctx.subscription_id) {
      return res.status(404).json({ ok: false, error: 'SUBSCRIPTION_NOT_FOUND' });
    }
    if (ctx.status === 'CANCELLED' || ctx.status === 'DELETED') {
      return res.status(400).json({
        ok: false,
        error: 'ALREADY_CANCELLED',
        message: `subscription is already ${ctx.status}`,
      });
    }

    const requestAuditId = await insertCustomerRequestAuditLog(req.db, req, {
      subscriptionId: Number(ctx.subscription_id),
      companyId: Number(companyId),
      changeCategory: 'CANCEL',
      currentValues: {
        status: ctx.status,
        cancel_at_period_end: !!ctx.cancel_at_period_end,
      },
      requestedValues: {
        cancel_at_period_end: !!cancelAtPeriodEnd,
      },
      reason,
    });

    const mailtoCtx = {
      companyName: ctx.company_name,
      companyCode: ctx.company_code,
      subscriptionId: Number(ctx.subscription_id),
      cancelAtPeriodEnd,
      reason,
      requestAuditId,
      requesterName: req.user?.username || req.user?.email || null,
    };

    return res.json({
      ok: true,
      request_audit_id: requestAuditId,
      mailto_subject: buildMailtoSubject('CANCEL', mailtoCtx),
      mailto_body: buildMailtoBody('CANCEL', mailtoCtx),
      mailto_url: buildMailtoUrl('CANCEL', mailtoCtx),
    });
  } catch (err) {
    console.error('POST /admin/subscription/cancel-request error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /plan-upgrade-request
// ─────────────────────────────────────────────────────────────────────────────
router.post('/plan-upgrade-request', async (req, res) => {
  try {
    const companyId = req.user?.company_id;
    if (!companyId) {
      return res.status(401).json({ ok: false, error: 'NO_TENANT' });
    }

    const requestedPlan = String(req.body?.requested_plan_type || '')
      .trim()
      .toUpperCase();
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : null;

    if (!VALID_PLAN_TYPES.includes(requestedPlan)) {
      return res.status(400).json({
        ok: false,
        error: 'INVALID_PLAN_TYPE',
        message: `requested_plan_type must be one of ${VALID_PLAN_TYPES.join(', ')}`,
      });
    }
    if (reason && reason.length > MAX_REASON_LENGTH) {
      return res.status(400).json({
        ok: false,
        error: 'REASON_TOO_LONG',
        message: `reason must be ≤${MAX_REASON_LENGTH} characters`,
      });
    }

    const ctx = await loadCompanyAndSubscription(req.db, companyId);
    if (!ctx || !ctx.subscription_id) {
      return res.status(404).json({ ok: false, error: 'SUBSCRIPTION_NOT_FOUND' });
    }
    if (ctx.plan_type === requestedPlan) {
      return res.status(400).json({
        ok: false,
        error: 'NO_CHANGE',
        message: `subscription is already on plan ${requestedPlan}`,
      });
    }

    const requestAuditId = await insertCustomerRequestAuditLog(req.db, req, {
      subscriptionId: Number(ctx.subscription_id),
      companyId: Number(companyId),
      changeCategory: 'PLAN_CHANGE',
      currentValues: {
        plan_type: ctx.plan_type,
      },
      requestedValues: {
        plan_type: requestedPlan,
      },
      reason,
    });

    const mailtoCtx = {
      companyName: ctx.company_name,
      companyCode: ctx.company_code,
      subscriptionId: Number(ctx.subscription_id),
      currentPlan: ctx.plan_type,
      requestedPlan,
      reason,
      requestAuditId,
      requesterName: req.user?.username || req.user?.email || null,
    };

    return res.json({
      ok: true,
      request_audit_id: requestAuditId,
      mailto_subject: buildMailtoSubject('PLAN_CHANGE', mailtoCtx),
      mailto_body: buildMailtoBody('PLAN_CHANGE', mailtoCtx),
      mailto_url: buildMailtoUrl('PLAN_CHANGE', mailtoCtx),
    });
  } catch (err) {
    console.error('POST /admin/subscription/plan-upgrade-request error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

module.exports = router;
