'use strict';

/**
 * jobs/ccqRatesReminderJob.js
 * Sends reminder to SUPER_ADMIN on March 1 and April 1, 2028
 * to update CCQ travel rates before the ACQ agreement expires (April 30, 2028)
 */

const cron = require('node-cron');
const { pool } = require('../db');
const sgMail = require('@sendgrid/mail');

if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

async function sendCCQReminder(poolInstance) {
  const db = poolInstance || pool;
  try {
    const { rows: admins } = await db.query(`
      SELECT username FROM public.app_users
      WHERE role = 'SUPER_ADMIN' AND username LIKE '%@%'
    `);

    if (!admins.length) return;

    const html = `
      <div style="font-family:sans-serif;max-width:700px;margin:0 auto;padding:24px">
        <h2 style="color:#4f46e5">⚠️ CCQ Travel Rates — Update Required Before April 30, 2028</h2>
        <p style="color:#64748b">
          The current ACQ/CCQ collective agreement travel allowance rates expire on
          <strong style="color:#ef4444">April 30, 2028</strong>.
        </p>
        <p style="color:#64748b">Please:</p>
        <ol style="color:#64748b;line-height:1.8">
          <li>Visit <a href="https://www.acq.org" style="color:#4f46e5">acq.org</a> and download the latest <strong>"Frais de déplacement"</strong> schedule</li>
          <li>Log in to MEP Platform → Super Admin → CCQ Rates</li>
          <li>Add the new rates with the correct effective dates</li>
          <li>If rates have not changed, extend the <strong>effective_to</strong> date of existing rates</li>
        </ol>
        <p style="color:#94a3b8;font-size:11px;margin-top:32px">MEP Platform · Automated reminder</p>
      </div>
    `;

    for (const admin of admins) {
      try {
        await sgMail.send({
          to: admin.username,
          from: process.env.SENDGRID_FROM_EMAIL || 'noreply@mepplatform.com',
          subject: '⚠️ Action Required: CCQ Travel Rates Expiring April 30, 2028',
          html,
        });
        console.log(`[ccqRatesReminder] Reminder sent to ${admin.username}`);
      } catch (e) {
        console.error(`[ccqRatesReminder] Failed to send to ${admin.username}:`, e.message);
      }
    }
  } catch (err) {
    console.error('[ccqRatesReminder] Error:', err);
  }
}

module.exports = function registerCCQRatesReminderJob(poolInstance) {
  // March 1, 2028 at 09:00 Quebec time (14:00 UTC)
  cron.schedule('0 14 1 3 *', () => {
    const year = new Date().getFullYear();
    if (year === 2028) sendCCQReminder(poolInstance);
  });

  // April 1, 2028 at 09:00 Quebec time (14:00 UTC)
  cron.schedule('0 14 1 4 *', () => {
    const year = new Date().getFullYear();
    if (year === 2028) sendCCQReminder(poolInstance);
  });

  console.log('[ccqRatesReminder] Scheduled: Mar 1 + Apr 1, 2028');
};

module.exports.sendCCQReminder = sendCCQReminder;
