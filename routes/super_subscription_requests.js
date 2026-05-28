'use strict';

/**
 * routes/super_subscription_requests.js
 *
 * Phase 6-D-6 PR 1 / Section 120 — SUPER_ADMIN inbox endpoint. Returns the
 * list of pending customer-initiated subscription change requests (seat /
 * cancel / plan upgrade) that Hedar has NOT yet acted on.
 *
 * "Pending" = an audit_logs row with action='CUSTOMER_REQUESTED_SUBSCRIPTION_CHANGE'
 * that does NOT have a matching audit_logs row with
 * action='SUPER_ADMIN_APPLIED_SUBSCRIPTION_CHANGE' linking back via
 * details.request_audit_id. This closes the 5-source audit chain from
 * Section 117.4 by giving Hedar a queryable view of "what needs my action".
 *
 * Mount: app.use('/api/super', auth, superAdmin, tenantDb, this) on adminApp
 *        (the router itself owns the path /subscription-requests).
 *
 * Endpoint:
 *   GET /subscription-requests
 *     Query params: none (the page list stays small in practice; pagination
 *                   added later if needed).
 *     Response 200:
 *       {
 *         ok: true,
 *         requests: [{
 *           audit_id, created_at, change_category,
 *           current: { ... },
 *           requested: { ... },
 *           reason,
 *           requester: { user_id, username, role },
 *           company: { id, name, company_code },
 *         }],
 *       }
 *     500 SERVER_ERROR
 *
 * No write happens here — the Apply action goes via the existing
 * POST /api/super/subscriptions/:id/apply-change endpoint (Phase 6-D-4 PR 4).
 *
 * RBAC: superAdmin middleware enforced at mount time.
 */

const express = require('express');
const router = express.Router();

router.get('/subscription-requests', async (req, res) => {
  try {
    // req.db here is the SUPER_ADMIN tenantDb pool (bypass-RLS via mepuser_super)
    // so the cross-company JOIN sees every company's audit rows.
    const { rows } = await req.db.query(
      `SELECT a.id            AS audit_id,
              a.created_at,
              a.user_id,
              a.username,
              a.role,
              a.company_id,
              a.details,
              c.name          AS company_name,
              c.company_code,
              s.id            AS subscription_id,
              s.subscribed_seats AS current_subscribed_seats,
              s.plan_type     AS current_plan_type,
              s.status        AS current_status
         FROM public.audit_logs a
         JOIN public.companies c ON c.company_id = a.company_id
         LEFT JOIN public.subscriptions s ON s.company_id = a.company_id
        WHERE a.action = 'CUSTOMER_REQUESTED_SUBSCRIPTION_CHANGE'
          AND NOT EXISTS (
            SELECT 1
              FROM public.audit_logs apply
             WHERE apply.action = 'SUPER_ADMIN_APPLIED_SUBSCRIPTION_CHANGE'
               AND (apply.details->>'request_audit_id')::bigint = a.id
          )
        ORDER BY a.created_at DESC
        LIMIT 200`
    );

    const requests = rows.map((r) => {
      const details = r.details || {};
      return {
        audit_id: Number(r.audit_id),
        created_at: r.created_at,
        change_category: details.change_category || null,
        current: details.current || null,
        requested: details.requested || null,
        reason: details.reason || null,
        source: details.source || null,
        user_agent: details.user_agent || null,
        requester: {
          user_id: r.user_id ? Number(r.user_id) : null,
          username: r.username,
          role: r.role,
        },
        company: {
          id: Number(r.company_id),
          name: r.company_name,
          company_code: r.company_code,
        },
        subscription: r.subscription_id
          ? {
              id: Number(r.subscription_id),
              subscribed_seats: Number(r.current_subscribed_seats),
              plan_type: r.current_plan_type,
              status: r.current_status,
            }
          : null,
      };
    });

    return res.json({ ok: true, requests });
  } catch (err) {
    console.error('GET /super/subscription-requests error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

module.exports = router;
