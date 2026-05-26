'use strict';

/**
 * lib/email_training_quote.js
 *
 * Phase 6-D-4 PR 5 / Section 115.4 — training quote email sent to a
 * tenant's admin after Hedar marks the DRAFT quote as QUOTE_SENT.
 *
 * Extracted from routes/super_training_quotes.js to (a) match the
 * lib/email_subscription_change.js pattern, (b) avoid nested template
 * literals that confuse Semgrep's static XSS analysis (rule 5DO3), and
 * (c) keep the route handler thin.
 *
 * Security: all user-controlled values pass through escapeHtml() from
 * lib/email.js before reaching the HTML template. Variables are
 * pre-computed and assigned to single-token names so Semgrep can see
 * the escape unambiguously.
 */

const { sendEmail, escapeHtml: e } = require('./email');

const APP_NAME = process.env.APP_NAME || 'Constrai';

/**
 * Format a cents amount as a `"24.00"` string (no currency suffix).
 * The caller adds " CAD" outside the escape boundary.
 */
function formatCents(amountCents) {
  return (Number(amountCents) / 100).toFixed(2);
}

/**
 * Build the HTML body for a training-quote email.
 * Every interpolation site escapes a single pre-computed primitive
 * (no nested template literals inside e()) so Semgrep can prove safety.
 */
function buildHtml(invoice) {
  const invoiceNumber = e(String(invoice.invoice_number || ''));
  const companyName = e(String(invoice.company_name || ''));
  const expiresAt = e(String(invoice.quote_expires_at || '—'));
  const subtotal = e(formatCents(invoice.subtotal_cents));
  const totalTax = e(formatCents(Number(invoice.qst_cents || 0) + Number(invoice.gst_cents || 0)));
  const total = e(formatCents(invoice.total_cents));
  const appName = e(APP_NAME);

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: 'Segoe UI', Arial, sans-serif; color:#0f172a;">
  <h2>Training quote ${invoiceNumber}</h2>
  <p>Hello ${companyName},</p>
  <p>Please find your on-site training quote summary below. The quote is valid until ${expiresAt}.</p>
  <table style="border-collapse:collapse;">
    <tr><td>Subtotal</td><td><strong>$${subtotal} CAD</strong></td></tr>
    <tr><td>QST + GST</td><td>$${totalTax} CAD</td></tr>
    <tr><td>Total</td><td><strong>$${total} CAD</strong></td></tr>
  </table>
  <p>Payment terms: 50% before training starts + 50% on the last day of training.</p>
  <p>Reply to this email to approve the quote, or contact billing@constrai.ca with questions.</p>
  <p>— ${appName} billing</p>
</body>
</html>`;
}

function buildText(invoice) {
  const subtotal = formatCents(invoice.subtotal_cents);
  const total = formatCents(invoice.total_cents);
  return [
    `Training quote ${invoice.invoice_number} for ${invoice.company_name}`,
    `Subtotal: $${subtotal} CAD`,
    `Total (incl. tax): $${total} CAD`,
    `Valid until: ${invoice.quote_expires_at || '—'}`,
    `Reply to approve.`,
    `— ${APP_NAME} billing`,
  ].join('\n');
}

/**
 * Send a training quote email.
 *
 * @param {object} args
 * @param {string} args.to - recipient email
 * @param {object} args.invoice - invoice row joined with company_name/code
 * @returns {Promise<boolean>} send-success
 */
async function sendTrainingQuoteEmail({ to, invoice }) {
  if (!to || !invoice) return false;
  const subject = `Training quote ${invoice.invoice_number} - ${invoice.company_name}`;
  const html = buildHtml(invoice);
  const text = buildText(invoice);
  return await sendEmail({ to, subject, html, text });
}

module.exports = {
  sendTrainingQuoteEmail,
  buildHtml,
  buildText,
};
