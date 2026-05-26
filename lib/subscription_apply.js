'use strict';

/**
 * lib/subscription_apply.js
 *
 * Phase 6-D-4 PR 4 / Section 117.4 — applies a subscription change
 * (seat change, cancellation, plan change) and writes the matching
 * audit records.
 *
 * Used by routes/super_subscription_apply.js. Separated from the route
 * so the transactional logic can be unit-tested independently and so
 * future cron jobs (Phase 6-D-7 monthly invoice generation) can reuse
 * the bracket lookup helpers.
 *
 * Each apply call performs (within the caller's transaction):
 *   1. UPDATE subscriptions — different fields per change type
 *   2. For SEAT_CHANGE: INSERT subscription_seat_changes
 *   3. INSERT audit_logs row #2 (links to request row #1 via
 *      details.request_audit_id when available)
 *
 * Returns:
 *   { subscription, auditId, seatChangeId? }
 *
 * proration_cents handling (PR 4 scope decision):
 *   We INSERT seat_changes rows with proration_cents = NULL during apply.
 *   Phase 6-D-7 (monthly invoice cron) will compute proration when
 *   generating SUBSCRIPTION_RECURRING invoices, then update the
 *   seat_changes.proration_cents + link via invoice_id. Deferring the
 *   math here keeps PR 4 focused on the audit + state-machine surface,
 *   not the billing arithmetic which deserves its own dedicated PR.
 *
 * REDUCE behavior (Section 117.4 nuance):
 *   subscribed_seats is updated IMMEDIATELY on REDUCE (matches the
 *   customer's explicit request). The customer keeps their existing
 *   employees but new invites are gated at the lower cap. Next monthly
 *   invoice naturally bills at the new lower amount; no mid-cycle refund.
 *   This is a slight deviation from Section 116.3's "effective_at end-of-
 *   period" hint — in practice subscribed_seats is the SINGLE source of
 *   truth for the cap, and effective_at on the seat_changes row is just
 *   the historical timestamp of when the change was applied.
 *
 * Cancellation behavior:
 *   cancel_at_period_end = true: subscription remains ACTIVE until
 *   next_billing_at, then cron transitions it to CANCELLED (auto-renew off).
 *   cancel_at_period_end = false + immediate: status → CANCELLED right
 *   away. SUPER_ADMIN typically uses cancel_at_period_end=true; immediate
 *   cancellation is reserved for refund / fraud / hard-stop scenarios.
 */

const BRACKET_LADDER = [
  { max: 5, unit_price_cents: 2700, label: '1-5' },
  { max: 10, unit_price_cents: 2500, label: '6-10' },
  { max: 20, unit_price_cents: 2400, label: '11-20' },
  { max: 35, unit_price_cents: 2300, label: '21-35' },
  { max: 50, unit_price_cents: 2200, label: '36-50' },
];
const ABOVE_50_BRACKET = { max: null, unit_price_cents: 2200, label: '50+' };

/**
 * Look up the bracket (unit_price + label) for a given seat count.
 * Mirrors the same arithmetic used in migration 019 backfill +
 * tests/helpers/db.js seedSubscription helper. Keep these three in sync
 * if the ladder ever changes (Section 115.3 source of truth).
 */
function bracketForSeats(seats) {
  const n = Number(seats);
  if (!Number.isFinite(n) || n < 1) {
    throw new Error(`bracketForSeats: invalid seat count ${seats}`);
  }
  for (const tier of BRACKET_LADDER) {
    if (n <= tier.max) return tier;
  }
  return ABOVE_50_BRACKET;
}

/**
 * Internal helper — INSERT an audit_logs row and return its id.
 * Mirrors lib/audit.js's audit() shape but returns the id (audit() does not).
 *
 * Used for audit_logs row #2 (SUPER_ADMIN_APPLIED_SUBSCRIPTION_CHANGE) so the
 * route can include it in the response. For audit_logs row #1 (customer-side
 * request), see routes/admin_subscription_requests.js.
 */
async function insertAuditLog(
  db,
  req,
  {
    action,
    entity_type,
    entity_id,
    entity_name = null,
    old_values = null,
    new_values = null,
    details = null,
    company_id_override = null,
  }
) {
  const user = req?.user || {};
  const company_id = company_id_override !== null ? company_id_override : user.company_id || null;
  const user_id = user.user_id || null;
  const username = user.username || null;
  const role = user.role || null;
  const ip_address = req?.ip || req?.headers?.['x-forwarded-for']?.split(',')[0]?.trim() || null;

  const { rows } = await db.query(
    `INSERT INTO public.audit_logs
       (company_id, user_id, username, role, action, entity_type, entity_id,
        entity_name, old_values, new_values, details, ip_address, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, NOW())
     RETURNING id`,
    [
      company_id,
      user_id,
      username,
      role,
      action,
      entity_type,
      entity_id,
      entity_name,
      old_values ? JSON.stringify(old_values) : null,
      new_values ? JSON.stringify(new_values) : null,
      details ? JSON.stringify(details) : null,
      ip_address,
    ]
  );
  return Number(rows[0].id);
}

/**
 * Fetch the current subscription row (with company_id) for an apply
 * operation. Returns null if not found.
 */
async function loadSubscription(db, subscriptionId) {
  const { rows } = await db.query(
    `SELECT id, company_id, status, plan_type, subscribed_seats,
            minimum_seats_billed, current_unit_price_cents,
            current_bracket_label, billing_cycle, billing_anchor_day,
            next_billing_at, trial_ends_at, cancel_at_period_end,
            cancellation_reason, payment_method
       FROM public.subscriptions
      WHERE id = $1
      LIMIT 1`,
    [subscriptionId]
  );
  return rows[0] || null;
}

/**
 * Apply a SEAT_CHANGE to a subscription.
 *
 * @param {object} db - tenantDb client (caller must be in a tx)
 * @param {object} req - Express request (for audit context)
 * @param {object} args
 * @param {number} args.subscriptionId
 * @param {number} args.newSeats
 * @param {number|null} args.requestAuditId - audit_logs row #1 id (customer request); NULL for SUPER_ADMIN-initiated
 * @param {string|null} args.reason
 * @returns {Promise<{subscription, auditId, seatChangeId, changeType}>}
 */
async function applySeatChange(
  db,
  req,
  { subscriptionId, newSeats, requestAuditId = null, reason = null }
) {
  const current = await loadSubscription(db, subscriptionId);
  if (!current) {
    const err = new Error('SUBSCRIPTION_NOT_FOUND');
    err.code = 'SUBSCRIPTION_NOT_FOUND';
    throw err;
  }
  const oldSeats = Number(current.subscribed_seats);
  const target = Number(newSeats);
  if (!Number.isInteger(target) || target < 1) {
    const err = new Error('INVALID_NEW_SEATS');
    err.code = 'INVALID_NEW_SEATS';
    throw err;
  }
  if (target === oldSeats) {
    const err = new Error('NO_CHANGE');
    err.code = 'NO_CHANGE';
    throw err;
  }

  const newBracket = bracketForSeats(target);
  const changeType = target > oldSeats ? 'ADD' : 'REDUCE';
  const delta = target - oldSeats;

  // UPDATE subscription
  const { rows: updatedRows } = await db.query(
    `UPDATE public.subscriptions
        SET subscribed_seats          = $1,
            current_unit_price_cents  = $2,
            current_bracket_label     = $3,
            updated_at                = NOW()
      WHERE id = $4
      RETURNING *`,
    [target, newBracket.unit_price_cents, newBracket.label, subscriptionId]
  );
  const updated = updatedRows[0];

  // INSERT subscription_seat_changes (proration deferred to monthly cron)
  const { rows: seatChangeRows } = await db.query(
    `INSERT INTO public.subscription_seat_changes
       (subscription_id, change_type, seats_before, seats_after, delta,
        effective_at, proration_cents, reason, created_by_user_id)
     VALUES ($1, $2, $3, $4, $5, NOW(), NULL, $6, $7)
     RETURNING id`,
    [subscriptionId, changeType, oldSeats, target, delta, reason, req?.user?.user_id || null]
  );
  const seatChangeId = Number(seatChangeRows[0].id);

  // INSERT audit_logs row #2 — SUPER_ADMIN apply event
  const auditId = await insertAuditLog(db, req, {
    action: 'SUPER_ADMIN_APPLIED_SUBSCRIPTION_CHANGE',
    entity_type: 'subscription',
    entity_id: subscriptionId,
    entity_name: `subscription #${subscriptionId}`,
    old_values: {
      subscribed_seats: oldSeats,
      unit_price_cents: Number(current.current_unit_price_cents),
      bracket_label: current.current_bracket_label,
    },
    new_values: {
      subscribed_seats: target,
      unit_price_cents: newBracket.unit_price_cents,
      bracket_label: newBracket.label,
    },
    details: {
      change_category: 'SEAT_CHANGE',
      change_type: changeType,
      delta,
      seat_change_id: seatChangeId,
      request_audit_id: requestAuditId,
      reason,
    },
    company_id_override: Number(current.company_id),
  });

  return { subscription: updated, auditId, seatChangeId, changeType };
}

/**
 * Apply a CANCEL to a subscription.
 *
 * @param {object} db
 * @param {object} req
 * @param {object} args
 * @param {number} args.subscriptionId
 * @param {boolean} args.cancelAtPeriodEnd - true: keeps ACTIVE until next_billing_at then transitions to CANCELLED; false: immediate transition to CANCELLED
 * @param {number|null} args.requestAuditId
 * @param {string|null} args.reason
 */
async function applyCancellation(
  db,
  req,
  { subscriptionId, cancelAtPeriodEnd = true, requestAuditId = null, reason = null }
) {
  const current = await loadSubscription(db, subscriptionId);
  if (!current) {
    const err = new Error('SUBSCRIPTION_NOT_FOUND');
    err.code = 'SUBSCRIPTION_NOT_FOUND';
    throw err;
  }
  if (current.status === 'CANCELLED' || current.status === 'DELETED') {
    const err = new Error('ALREADY_CANCELLED');
    err.code = 'ALREADY_CANCELLED';
    throw err;
  }

  let updateSql;
  let updateParams;
  if (cancelAtPeriodEnd) {
    updateSql = `UPDATE public.subscriptions
                    SET cancel_at_period_end = true,
                        cancellation_reason  = $1,
                        updated_at           = NOW()
                  WHERE id = $2
                  RETURNING *`;
    updateParams = [reason, subscriptionId];
  } else {
    updateSql = `UPDATE public.subscriptions
                    SET status               = 'CANCELLED',
                        cancelled_at         = NOW(),
                        cancel_at_period_end = false,
                        cancellation_reason  = $1,
                        updated_at           = NOW()
                  WHERE id = $2
                  RETURNING *`;
    updateParams = [reason, subscriptionId];
  }
  const { rows: updatedRows } = await db.query(updateSql, updateParams);
  const updated = updatedRows[0];

  const auditId = await insertAuditLog(db, req, {
    action: 'SUPER_ADMIN_APPLIED_SUBSCRIPTION_CHANGE',
    entity_type: 'subscription',
    entity_id: subscriptionId,
    entity_name: `subscription #${subscriptionId}`,
    old_values: {
      status: current.status,
      cancel_at_period_end: current.cancel_at_period_end,
    },
    new_values: {
      status: updated.status,
      cancel_at_period_end: updated.cancel_at_period_end,
      cancelled_at: updated.cancelled_at,
    },
    details: {
      change_category: 'CANCEL',
      cancel_at_period_end: !!cancelAtPeriodEnd,
      request_audit_id: requestAuditId,
      reason,
    },
    company_id_override: Number(current.company_id),
  });

  return { subscription: updated, auditId, changeType: 'CANCEL' };
}

/**
 * Apply a PLAN_CHANGE to a subscription.
 * Plan changes don't currently move pricing on their own (pricing is bracket-
 * driven by seat count, not plan type — Section 115.3). plan_type is a
 * service-level distinction (Monthly vs Annual vs Enterprise) that affects
 * billing cadence and support tier but not per-seat price (until the 17%
 * annual discount logic lands in Phase 6-D-7 or Phase 9-B).
 */
async function applyPlanChange(
  db,
  req,
  { subscriptionId, newPlanType, requestAuditId = null, reason = null }
) {
  const VALID_PLANS = ['MONTHLY', 'ANNUAL', 'ENTERPRISE'];
  if (!VALID_PLANS.includes(newPlanType)) {
    const err = new Error('INVALID_PLAN_TYPE');
    err.code = 'INVALID_PLAN_TYPE';
    throw err;
  }
  const current = await loadSubscription(db, subscriptionId);
  if (!current) {
    const err = new Error('SUBSCRIPTION_NOT_FOUND');
    err.code = 'SUBSCRIPTION_NOT_FOUND';
    throw err;
  }
  if (current.plan_type === newPlanType) {
    const err = new Error('NO_CHANGE');
    err.code = 'NO_CHANGE';
    throw err;
  }

  // Billing cycle follows plan type: ANNUAL plan → ANNUAL cycle; MONTHLY/ENTERPRISE → MONTHLY (Enterprise can be annual but
  // is handled via custom contract — for now we keep ENTERPRISE on MONTHLY billing too).
  const newCycle = newPlanType === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY';

  const { rows: updatedRows } = await db.query(
    `UPDATE public.subscriptions
        SET plan_type      = $1,
            billing_cycle  = $2,
            updated_at     = NOW()
      WHERE id = $3
      RETURNING *`,
    [newPlanType, newCycle, subscriptionId]
  );
  const updated = updatedRows[0];

  const auditId = await insertAuditLog(db, req, {
    action: 'SUPER_ADMIN_APPLIED_SUBSCRIPTION_CHANGE',
    entity_type: 'subscription',
    entity_id: subscriptionId,
    entity_name: `subscription #${subscriptionId}`,
    old_values: {
      plan_type: current.plan_type,
      billing_cycle: current.billing_cycle,
    },
    new_values: {
      plan_type: updated.plan_type,
      billing_cycle: updated.billing_cycle,
    },
    details: {
      change_category: 'PLAN_CHANGE',
      from_plan: current.plan_type,
      to_plan: newPlanType,
      request_audit_id: requestAuditId,
      reason,
    },
    company_id_override: Number(current.company_id),
  });

  return { subscription: updated, auditId, changeType: 'PLAN_CHANGE' };
}

module.exports = {
  bracketForSeats,
  insertAuditLog,
  loadSubscription,
  applySeatChange,
  applyCancellation,
  applyPlanChange,
  BRACKET_LADDER,
  ABOVE_50_BRACKET,
};
