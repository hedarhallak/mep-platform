'use strict';

/**
 * jobs/trialExpiryJob.js
 *
 * Phase 6-D-7 PR3 / Section 125.6 — trial-expiry warning emails.
 *
 * Runs daily. Finds TRIAL subscriptions whose trial_ends_at falls within the
 * next TRIAL_WARN_DAYS (default 3) and that haven't been warned yet
 * (trial_warned_at IS NULL), emails the company's COMPANY_ADMIN a reminder,
 * and stamps trial_warned_at so the same trial isn't warned again.
 *
 * Pool: superPool (BYPASSRLS) — cross-tenant system job, no request context
 * (same reasoning as the monthly invoice job / Pitfall #59).
 *
 * Idempotency: trial_warned_at is set only after a successful send, so a
 * transient mail failure retries the next day; a tenant with no active
 * COMPANY_ADMIN email is logged and left unwarned (harmless re-check).
 */

const cron = require('node-cron');
const { pool, superPool } = require('../db');
const { sendTrialExpiryWarning } = require('../lib/email');

const DEFAULT_WARN_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Warn COMPANY_ADMINs whose trial ends within TRIAL_WARN_DAYS.
 *
 * @param {{connect:Function,query:Function}} [poolOverride] - pg Pool; defaults
 *        to superPool then pool. Tests inject their own pool.
 * @param {Date} [now=new Date()]
 * @returns {Promise<{considered:number,warned:number,errors:number}>}
 */
async function warnExpiringTrials(poolOverride, now = new Date()) {
  const dbPool = poolOverride || superPool || pool;
  const warnDays = parseInt(process.env.TRIAL_WARN_DAYS, 10) || DEFAULT_WARN_DAYS;
  const cutoff = new Date(now.getTime() + warnDays * DAY_MS);
  const summary = { considered: 0, warned: 0, errors: 0 };

  const { rows: subs } = await dbPool.query(
    `SELECT s.id, s.company_id, s.trial_ends_at, c.name AS company_name
       FROM public.subscriptions s
       JOIN public.companies c ON c.company_id = s.company_id
      WHERE s.status = 'TRIAL'
        AND s.trial_warned_at IS NULL
        AND s.trial_ends_at IS NOT NULL
        AND s.trial_ends_at > $1
        AND s.trial_ends_at <= $2
      ORDER BY s.trial_ends_at`,
    [now.toISOString(), cutoff.toISOString()]
  );

  for (const sub of subs) {
    summary.considered++;
    try {
      const { rows: admins } = await dbPool.query(
        `SELECT email FROM public.app_users
          WHERE company_id = $1 AND role = 'COMPANY_ADMIN' AND is_active = true
          ORDER BY id LIMIT 1`,
        [sub.company_id]
      );
      const to = admins[0] && admins[0].email;
      const daysLeft = Math.max(
        1,
        Math.ceil((new Date(sub.trial_ends_at).getTime() - now.getTime()) / DAY_MS)
      );

      if (!to) {
        console.warn(
          `[trialExpiry] no active COMPANY_ADMIN email for company ${sub.company_id} — leaving unwarned`
        );
        continue;
      }

      const sent = await sendTrialExpiryWarning({
        to,
        companyName: sub.company_name,
        trialEndsAt: sub.trial_ends_at,
        daysLeft,
      });

      if (sent) {
        await dbPool.query(
          `UPDATE public.subscriptions SET trial_warned_at = NOW(), updated_at = NOW() WHERE id = $1`,
          [sub.id]
        );
        summary.warned++;
        console.log(`[trialExpiry] Warned ${sub.company_name} (${daysLeft}d left) -> ${to}`);
      } else {
        // Send failed (provider down / not configured) — leave unwarned to retry tomorrow.
        summary.errors++;
      }
    } catch (err) {
      summary.errors++;
      console.error(`[trialExpiry] error for company ${sub.company_id}:`, err.message);
    }
  }

  console.log(
    `[trialExpiry] Run complete: ${summary.warned} warned, ${summary.errors} errors ` +
      `(of ${summary.considered} considered).`
  );
  return summary;
}

module.exports = function registerTrialExpiryJob() {
  // Daily at 13:00 UTC.
  cron.schedule('0 13 * * *', () => {
    warnExpiringTrials().catch((e) => console.error('[trialExpiry] Unhandled error:', e));
  });
  console.log('[trialExpiry] Scheduled: daily 13:00 UTC');
};

// Exported for tests + a future manual trigger.
module.exports.warnExpiringTrials = warnExpiringTrials;
