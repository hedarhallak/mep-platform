'use strict';

/**
 * routes/super_subscription_lifecycle.js
 *
 * Phase 6-D-4 PR 5 — SUPER_ADMIN subscription lifecycle endpoints that
 * sit alongside the apply-change endpoint (PR 4). Kept separate because
 * extend-trial doesn't share much logic with seat/cancel/plan changes
 * and lives in its own conceptual category (state-management ops).
 *
 * Mount: app.use('/api/super', auth, superAdmin, tenantDb, this) on adminApp.
 *
 * Endpoints:
 *   POST /subscriptions/:id/extend-trial
 *     Body: { days_to_add, reason? }
 *     → Updates trial_ends_at to trial_ends_at + N days (or NOW + N days if
 *       trial_ends_at is null). Only valid for status=TRIAL subscriptions.
 */

const express = require('express');
const router = express.Router();

const { audit } = require('../lib/audit');

router.post('/subscriptions/:id/extend-trial', async (req, res) => {
  try {
    const subscriptionId = Number(req.params.id);
    if (!subscriptionId) {
      return res.status(400).json({ ok: false, error: 'INVALID_ID' });
    }

    const daysToAdd = Number(req.body?.days_to_add);
    if (!Number.isInteger(daysToAdd) || daysToAdd < 1 || daysToAdd > 365) {
      return res.status(400).json({
        ok: false,
        error: 'INVALID_DAYS_TO_ADD',
        message: 'days_to_add must be an integer between 1 and 365',
      });
    }
    const reason =
      typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 1000) : null;

    // Load current subscription
    const { rows: subRows } = await req.db.query(
      `SELECT id, company_id, status, trial_started_at, trial_ends_at
         FROM public.subscriptions WHERE id = $1 LIMIT 1`,
      [subscriptionId]
    );
    if (subRows.length === 0) {
      return res.status(404).json({ ok: false, error: 'SUBSCRIPTION_NOT_FOUND' });
    }
    const current = subRows[0];

    if (current.status !== 'TRIAL') {
      return res.status(400).json({
        ok: false,
        error: 'NOT_IN_TRIAL',
        message: `subscription is in status ${current.status}; only TRIAL can be extended`,
      });
    }

    // New trial_ends_at = max(current trial_ends_at, NOW()) + daysToAdd days
    // This way an already-expired trial extends FROM NOW, not from the past.
    const baseTime = current.trial_ends_at
      ? Math.max(new Date(current.trial_ends_at).getTime(), Date.now())
      : Date.now();
    const newTrialEndsAt = new Date(baseTime + daysToAdd * 24 * 60 * 60 * 1000);

    const { rows: updatedRows } = await req.db.query(
      `UPDATE public.subscriptions
          SET trial_ends_at = $1,
              updated_at    = NOW()
        WHERE id = $2
        RETURNING *`,
      [newTrialEndsAt.toISOString(), subscriptionId]
    );
    const updated = updatedRows[0];

    await audit(req.db, req, {
      action: 'TRIAL_EXTENDED',
      entity_type: 'subscription',
      entity_id: subscriptionId,
      entity_name: `subscription #${subscriptionId}`,
      old_values: { trial_ends_at: current.trial_ends_at },
      new_values: { trial_ends_at: updated.trial_ends_at },
      details: { days_added: daysToAdd, reason, company_id: Number(current.company_id) },
    });

    return res.json({ ok: true, subscription: updated, days_added: daysToAdd });
  } catch (err) {
    console.error('POST /super/subscriptions/:id/extend-trial error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

module.exports = router;
