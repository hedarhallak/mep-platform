'use strict';

/**
 * lib/email_subscription_change.js
 *
 * Phase 6-D-4 PR 4 / Section 117.4 — confirmation email sent to a tenant's
 * admin after a subscription change is applied by SUPER_ADMIN.
 *
 * Threading: uses the "Re: ..." subject pattern (Interpretation 2 from
 * Section 117.4) — most email clients (Gmail, Outlook, Apple Mail) thread
 * by subject + recipient when sender domain matches. Real Message-ID
 * threading would require inbound email ingestion (Resend Inbound or
 * Mailgun Routes), deferred to Phase 9-B if customer complaints emerge.
 *
 * Bilingual: every email contains English then French body sections,
 * matching the bilingual norm established in Section 113.4 for billing
 * error messages.
 *
 * Security: any user-controlled value interpolated into HTML is escaped
 * via `e()` (from lib/email.js) to prevent stored-XSS via HTML rendering.
 */

const { sendEmail, escapeHtml: e } = require('./email');

const APP_NAME = process.env.APP_NAME || 'Constrai';
const BILLING_FROM_LABEL = 'Constrai billing';

/**
 * Format a cents amount as a CAD price string ("$24.00 CAD").
 * Localizes the decimal point based on the language ('en' → ".", 'fr' → ",").
 */
function formatCents(amountCents, lang = 'en') {
  if (amountCents == null) return '—';
  const dollars = (Number(amountCents) / 100).toFixed(2);
  const formatted = lang === 'fr' ? dollars.replace('.', ',') : dollars;
  return `$${formatted} CAD`;
}

/**
 * Format a Date / timestamp string as ISO date (YYYY-MM-DD).
 */
function formatDate(dateLike) {
  if (!dateLike) return '—';
  try {
    const d = new Date(dateLike);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toISOString().slice(0, 10);
  } catch {
    return '—';
  }
}

/**
 * Build the HTML body for a subscription change confirmation.
 *
 * @param {object} ctx
 * @param {string} ctx.companyName
 * @param {string} ctx.changeCategory - 'SEAT_CHANGE' | 'CANCEL' | 'PLAN_CHANGE'
 * @param {object} ctx.summary - free-form key/value pairs to render in the email table
 * @param {string|null} ctx.appliedAt
 * @param {string|null} ctx.nextBillingAt
 */
function buildConfirmationHtml({
  companyName,
  changeCategory,
  summary = {},
  appliedAt,
  nextBillingAt,
}) {
  const rowsEn = Object.entries(summary)
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 0;color:#64748b;">${e(k)}</td><td style="padding:6px 0;color:#0f172a;font-weight:600;">${e(String(v))}</td></tr>`
    )
    .join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #f4f4f8; margin: 0; padding: 24px; color: #0f172a; }
    .wrapper { max-width: 580px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 16px rgba(0,0,0,0.05); }
    .header { background: #0f172a; padding: 28px 32px; }
    .header h1 { color: #fff; font-size: 18px; font-weight: 600; margin: 0; }
    .header p { color: #94a3b8; font-size: 12px; margin: 4px 0 0; letter-spacing: 0.5px; }
    .section { padding: 24px 32px; border-top: 1px solid #f1f5f9; }
    .section:first-of-type { border-top: 0; }
    .lang-tag { display: inline-block; background: #f1f5f9; color: #64748b; font-size: 10px; letter-spacing: 1px; padding: 3px 8px; border-radius: 4px; text-transform: uppercase; font-weight: 600; margin-bottom: 12px; }
    h2 { font-size: 16px; color: #0f172a; margin: 0 0 12px; font-weight: 600; }
    p { font-size: 14px; color: #475569; line-height: 1.6; margin: 0 0 12px; }
    table.summary { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px; }
    table.summary td { padding: 6px 0; border-bottom: 1px solid #f1f5f9; }
    .footer { background: #f8fafc; padding: 16px 32px; font-size: 11px; color: #94a3b8; text-align: center; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>${e(APP_NAME)} — Subscription change confirmed</h1>
      <p>${e(BILLING_FROM_LABEL)}</p>
    </div>

    <div class="section">
      <span class="lang-tag">EN</span>
      <h2>Subscription change confirmed for ${e(companyName)}</h2>
      <p>Your ${e(changeCategoryLabel(changeCategory, 'en'))} request has been processed. The summary below reflects the change that is now in effect on your account.</p>
      <table class="summary">
        ${rowsEn}
        <tr><td style="padding:6px 0;color:#64748b;">Applied at</td><td style="padding:6px 0;color:#0f172a;font-weight:600;">${e(formatDate(appliedAt))}</td></tr>
        ${nextBillingAt ? `<tr><td style="padding:6px 0;color:#64748b;">Next billing date</td><td style="padding:6px 0;color:#0f172a;font-weight:600;">${e(formatDate(nextBillingAt))}</td></tr>` : ''}
      </table>
      <p>The change is reflected in your account immediately. Any proration will appear on your next invoice. If you did not request this change, please contact <a href="mailto:billing@constrai.ca">billing@constrai.ca</a> immediately.</p>
    </div>

    <div class="section">
      <span class="lang-tag">FR</span>
      <h2>Modification de l'abonnement confirmée pour ${e(companyName)}</h2>
      <p>Votre demande de ${e(changeCategoryLabel(changeCategory, 'fr'))} a été traitée. Le résumé ci-dessous reflète la modification désormais effective sur votre compte.</p>
      <p>La modification est appliquée immédiatement. Toute proration apparaîtra sur votre prochaine facture. Si vous n'avez pas demandé cette modification, veuillez contacter <a href="mailto:billing@constrai.ca">billing@constrai.ca</a> immédiatement.</p>
    </div>

    <div class="footer">
      ${e(APP_NAME)} · Section 117 subscription change audit · billing@constrai.ca
    </div>
  </div>
</body>
</html>`;
}

function changeCategoryLabel(category, lang) {
  if (lang === 'fr') {
    if (category === 'SEAT_CHANGE') return 'modification du nombre de sièges';
    if (category === 'CANCEL') return 'annulation';
    if (category === 'PLAN_CHANGE') return 'changement de plan';
    return 'modification';
  }
  if (category === 'SEAT_CHANGE') return 'seat change';
  if (category === 'CANCEL') return 'cancellation';
  if (category === 'PLAN_CHANGE') return 'plan change';
  return 'change';
}

/**
 * Build the plain-text fallback body.
 */
function buildConfirmationText({
  companyName,
  changeCategory,
  summary = {},
  appliedAt,
  nextBillingAt,
}) {
  const lines = [];
  lines.push(`${APP_NAME} — Subscription change confirmed for ${companyName}`);
  lines.push('');
  lines.push(`Your ${changeCategoryLabel(changeCategory, 'en')} request has been processed.`);
  lines.push('');
  for (const [k, v] of Object.entries(summary)) {
    lines.push(`  ${k}: ${v}`);
  }
  lines.push(`  Applied at: ${formatDate(appliedAt)}`);
  if (nextBillingAt) lines.push(`  Next billing date: ${formatDate(nextBillingAt)}`);
  lines.push('');
  lines.push('If you did not request this change, please contact billing@constrai.ca immediately.');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(`Modification de l'abonnement confirmée pour ${companyName}`);
  lines.push(`Votre demande de ${changeCategoryLabel(changeCategory, 'fr')} a été traitée.`);
  lines.push('');
  lines.push(
    "Si vous n'avez pas demandé cette modification, contactez billing@constrai.ca immédiatement."
  );
  return lines.join('\n');
}

/**
 * Send a subscription change confirmation email to a tenant admin.
 *
 * Subject prefixed with "Re:" to encourage email-client threading with
 * the original customer request email (Section 117.4 Interpretation 2).
 *
 * @param {object} args
 * @param {string} args.to - customer admin email address
 * @param {string} args.companyName
 * @param {string} args.changeCategory - 'SEAT_CHANGE' | 'CANCEL' | 'PLAN_CHANGE'
 * @param {object} args.summary - free-form key/value pairs for the table
 * @param {Date|string|null} args.appliedAt
 * @param {Date|string|null} args.nextBillingAt
 * @returns {Promise<boolean>} true on send-success, false if email is not configured / fails
 */
async function sendSubscriptionChangeConfirmation({
  to,
  companyName,
  changeCategory,
  summary,
  appliedAt = null,
  nextBillingAt = null,
}) {
  if (!to) return false;

  const subject = `Re: Subscription change confirmed for ${companyName}`;
  const html = buildConfirmationHtml({
    companyName,
    changeCategory,
    summary,
    appliedAt,
    nextBillingAt,
  });
  const text = buildConfirmationText({
    companyName,
    changeCategory,
    summary,
    appliedAt,
    nextBillingAt,
  });

  return await sendEmail({ to, subject, html, text });
}

module.exports = {
  sendSubscriptionChangeConfirmation,
  // exported for tests
  buildConfirmationHtml,
  buildConfirmationText,
  formatCents,
  formatDate,
  changeCategoryLabel,
};
