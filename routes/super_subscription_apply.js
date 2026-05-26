'use strict';

/**
 * routes/super_subscription_apply.js
 *
 * Phase 6-D-4 PR 4 / Section 117.4 — SUPER_ADMIN endpoint that applies a
 * subscription change (seat change, cancellation, plan change) after the
 * customer requested it via routes/admin_subscription_requests.js.
 *
 * Mount: app.use('/api/super', auth, superAdmin, tenantDb, this) on
 *        adminApp. The router itself exposes the path
 *        /subscriptions/:id/apply-change.
 *
 * Request body shape:
 *   {
 *     type: 'SEAT_CHANGE' | 'CANCEL' | 'PLAN_CHANGE',
 *     // SEAT_CHANGE only:
 *     new_seats: 8,
 *     // CANCEL only:
 *     cancel_at_period_end: true,
 *     // PLAN_CHANGE only:
 *     new_plan_type: 'ANNUAL',
 *     // common
 *     request_audit_id: 12345 | null,   // links back to customer request audit row
 *     reason: '...',
 *     send_confirmation_email: true     // default true; set false to skip Resend
 *   }
 *
 * Responses:
 *   200 { ok, subscription, audit_id, seat_change_id?, email_sent }
 *   400 invalid input (codes: INVALID_TYPE, INVALID_NEW_SEATS,
 *       INVALID_PLAN_TYPE, NO_CHANGE)
 *   404 { ok: false, error: 'SUBSCRIPTION_NOT_FOUND' }
 *   403 (RBAC failure via middleware)
 *   500 SERVER_ERROR
 *
 * The actual UPDATE + INSERT logic lives in lib/subscription_apply.js so
 * tests can exercise it independently of HTTP plumbing.
 */

const express = require('express');
const router = express.Router();

const {
  applySeatChange,
  applyCancellation,
  applyPlanChange,
} = require('../lib/subscription_apply');
const { sendSubscriptionChangeConfirmation } = require('../lib/email_subscription_change');

const VALID_TYPES = ['SEAT_CHANGE', 'CANCEL', 'PLAN_CHANGE'];

/**
 * Resolve the email address to notify after applying the change.
 * Strategy:
 *   1. If a request_audit_id is provided, look up the actor user's email
 *      (the customer admin who originally requested the change).
 *   2. Otherwise, fall back to the first COMPANY_ADMIN on the company.
 *   3. If neither is available, returns null (caller skips sending).
 */
async function resolveNotifyEmail(db, { companyId, requestAuditId }) {
  if (requestAuditId) {
    const { rows } = await db.query(
      `SELECT au.email
         FROM public.audit_logs al
         JOIN public.app_users au ON au.id = al.user_id
        WHERE al.id = $1
        LIMIT 1`,
      [requestAuditId]
    );
    if (rows[0]?.email) return rows[0].email;
  }
  const { rows } = await db.query(
    `SELECT email FROM public.app_users
      WHERE company_id = $1 AND role = 'COMPANY_ADMIN' AND is_active = true
      ORDER BY created_at ASC
      LIMIT 1`,
    [companyId]
  );
  return rows[0]?.email || null;
}

/**
 * Look up the company name for the email subject + body.
 */
async function loadCompanyName(db, companyId) {
  const { rows } = await db.query(
    `SELECT name FROM public.companies WHERE company_id = $1 LIMIT 1`,
    [companyId]
  );
  return rows[0]?.name || `Company #${companyId}`;
}

/**
 * Build the email summary key/value pairs based on the change category.
 */
function buildEmailSummary(category, current, updated, extras = {}) {
  if (category === 'SEAT_CHANGE') {
    return {
      'Previous seats': Number(current.subscribed_seats),
      'New seats': Number(updated.subscribed_seats),
      Bracket: updated.current_bracket_label,
      'Per-seat price': `$${(Number(updated.current_unit_price_cents) / 100).toFixed(2)} CAD/month`,
    };
  }
  if (category === 'CANCEL') {
    return {
      Status: updated.status,
      'Cancel at period end': updated.cancel_at_period_end ? 'Yes' : 'No',
      Effective: extras.cancelAtPeriodEnd
        ? `End of current billing period (${updated.next_billing_at ? new Date(updated.next_billing_at).toISOString().slice(0, 10) : '—'})`
        : 'Immediately',
    };
  }
  if (category === 'PLAN_CHANGE') {
    return {
      'Previous plan': current.plan_type,
      'New plan': updated.plan_type,
      'Billing cycle': updated.billing_cycle,
    };
  }
  return {};
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /subscriptions/:id/apply-change
// ─────────────────────────────────────────────────────────────────────────────
router.post('/subscriptions/:id/apply-change', async (req, res) => {
  try {
    const subscriptionId = Number(req.params.id);
    if (!subscriptionId) {
      return res.status(400).json({ ok: false, error: 'INVALID_ID' });
    }

    const body = req.body || {};
    const type = String(body.type || '')
      .trim()
      .toUpperCase();
    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({
        ok: false,
        error: 'INVALID_TYPE',
        message: `type must be one of: ${VALID_TYPES.join(', ')}`,
      });
    }

    const requestAuditId = body.request_audit_id ? Number(body.request_audit_id) : null;
    const reason = typeof body.reason === 'string' ? body.reason.trim() : null;
    const sendConfirmation = body.send_confirmation_email !== false; // default true

    // Snapshot current subscription state for the email summary BEFORE we modify.
    // We need this for the "Previous seats" / "Previous plan" rendering.
    const { rows: snapRows } = await req.db.query(
      `SELECT s.id, s.company_id, s.status, s.plan_type, s.subscribed_seats,
              s.current_unit_price_cents, s.current_bracket_label,
              s.cancel_at_period_end, s.billing_cycle
         FROM public.subscriptions s
        WHERE s.id = $1
        LIMIT 1`,
      [subscriptionId]
    );
    if (snapRows.length === 0) {
      return res.status(404).json({ ok: false, error: 'SUBSCRIPTION_NOT_FOUND' });
    }
    const snapshot = snapRows[0];
    const companyId = Number(snapshot.company_id);

    // Dispatch to the right apply function
    let result;
    let category;
    let extras = {};
    try {
      if (type === 'SEAT_CHANGE') {
        const newSeats = Number(body.new_seats);
        if (!Number.isInteger(newSeats) || newSeats < 1 || newSeats > 10000) {
          return res.status(400).json({
            ok: false,
            error: 'INVALID_NEW_SEATS',
            message: 'new_seats must be an integer between 1 and 10000',
          });
        }
        result = await applySeatChange(req.db, req, {
          subscriptionId,
          newSeats,
          requestAuditId,
          reason,
        });
        category = 'SEAT_CHANGE';
      } else if (type === 'CANCEL') {
        const cancelAtPeriodEnd = body.cancel_at_period_end !== false; // default true
        extras.cancelAtPeriodEnd = cancelAtPeriodEnd;
        result = await applyCancellation(req.db, req, {
          subscriptionId,
          cancelAtPeriodEnd,
          requestAuditId,
          reason,
        });
        category = 'CANCEL';
      } else if (type === 'PLAN_CHANGE') {
        const newPlanType = String(body.new_plan_type || '')
          .trim()
          .toUpperCase();
        result = await applyPlanChange(req.db, req, {
          subscriptionId,
          newPlanType,
          requestAuditId,
          reason,
        });
        category = 'PLAN_CHANGE';
      }
    } catch (e) {
      if (e?.code === 'SUBSCRIPTION_NOT_FOUND') {
        return res.status(404).json({ ok: false, error: 'SUBSCRIPTION_NOT_FOUND' });
      }
      if (e?.code === 'NO_CHANGE') {
        return res.status(400).json({ ok: false, error: 'NO_CHANGE', message: e.message });
      }
      if (e?.code === 'INVALID_PLAN_TYPE') {
        return res.status(400).json({ ok: false, error: 'INVALID_PLAN_TYPE', message: e.message });
      }
      if (e?.code === 'INVALID_NEW_SEATS') {
        return res.status(400).json({ ok: false, error: 'INVALID_NEW_SEATS', message: e.message });
      }
      if (e?.code === 'ALREADY_CANCELLED') {
        return res.status(400).json({ ok: false, error: 'ALREADY_CANCELLED', message: e.message });
      }
      throw e;
    }

    // Email confirmation (best-effort, doesn't block the response on failure)
    let emailSent = false;
    if (sendConfirmation) {
      const notifyEmail = await resolveNotifyEmail(req.db, { companyId, requestAuditId });
      if (notifyEmail) {
        const companyName = await loadCompanyName(req.db, companyId);
        const summary = buildEmailSummary(category, snapshot, result.subscription, extras);
        try {
          emailSent = await sendSubscriptionChangeConfirmation({
            to: notifyEmail,
            companyName,
            changeCategory: category,
            summary,
            appliedAt: new Date(),
            nextBillingAt: result.subscription.next_billing_at,
          });
        } catch (emailErr) {
          // Never fail the request because of an email problem
          console.warn('sendSubscriptionChangeConfirmation failed:', emailErr?.message || emailErr);
        }
      }
    }

    return res.json({
      ok: true,
      subscription: result.subscription,
      audit_id: result.auditId,
      seat_change_id: result.seatChangeId || null,
      change_type: result.changeType || category,
      email_sent: emailSent,
    });
  } catch (err) {
    console.error('POST /super/subscriptions/:id/apply-change error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

module.exports = router;
