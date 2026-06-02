'use strict';

/**
 * lib/email_invoice.js
 *
 * Phase 6-D-7 PR2 / Section 125 — monthly SUBSCRIPTION_RECURRING invoice email
 * sent to a tenant's COMPANY_ADMIN after the monthly cron generates +
 * auto-approves the invoice (jobs/monthlyInvoiceJob.js).
 *
 * Mirrors lib/email_training_quote.js: all user-controlled values pass through
 * escapeHtml() and are pre-computed to single-token names so Semgrep's static
 * XSS analysis can see the escape unambiguously (no nested template literals
 * inside e()).
 */

const { sendEmail, escapeHtml: e } = require('./email');

const APP_NAME = process.env.APP_NAME || 'Constrai';

function formatCents(amountCents) {
  return (Number(amountCents) / 100).toFixed(2);
}

/**
 * Build the HTML body for a subscription-invoice email. `invoice` is the
 * invoice row joined with company_name and (optionally) the details snapshot.
 */
function buildHtml(invoice) {
  const invoiceNumber = e(String(invoice.invoice_number || ''));
  const companyName = e(String(invoice.company_name || ''));
  const issueDate = e(String(invoice.issue_date || '—'));
  const dueDate = e(String(invoice.due_date || '—'));
  const seats = e(String(invoice.seats_billed != null ? invoice.seats_billed : '—'));
  const unitPrice = e(formatCents(invoice.unit_price_cents || 0));
  const subtotal = e(formatCents(invoice.subtotal_cents));
  const qst = e(formatCents(invoice.qst_cents || 0));
  const gst = e(formatCents(invoice.gst_cents || 0));
  const total = e(formatCents(invoice.total_cents));
  const appName = e(APP_NAME);

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: 'Segoe UI', Arial, sans-serif; color:#0f172a;">
  <h2>Invoice ${invoiceNumber}</h2>
  <p>Hello ${companyName},</p>
  <p>Your monthly subscription invoice for the period beginning ${issueDate} is ready.</p>
  <table style="border-collapse:collapse;">
    <tr><td>Seats billed</td><td><strong>${seats}</strong> &times; $${unitPrice}/seat</td></tr>
    <tr><td>Subtotal</td><td>$${subtotal} CAD</td></tr>
    <tr><td>QST</td><td>$${qst} CAD</td></tr>
    <tr><td>GST</td><td>$${gst} CAD</td></tr>
    <tr><td>Total</td><td><strong>$${total} CAD</strong></td></tr>
    <tr><td>Due date</td><td>${dueDate}</td></tr>
  </table>
  <p>Payment is by bank transfer or cheque to ${appName}. Reply to this email or contact billing@constrai.ca with any questions.</p>
  <p>— ${appName} billing</p>
</body>
</html>`;
}

function buildText(invoice) {
  return [
    `Invoice ${invoice.invoice_number} for ${invoice.company_name}`,
    `Seats billed: ${invoice.seats_billed != null ? invoice.seats_billed : '—'}`,
    `Subtotal: $${formatCents(invoice.subtotal_cents)} CAD`,
    `QST: $${formatCents(invoice.qst_cents || 0)} CAD`,
    `GST: $${formatCents(invoice.gst_cents || 0)} CAD`,
    `Total: $${formatCents(invoice.total_cents)} CAD`,
    `Due date: ${invoice.due_date || '—'}`,
    `Payment by bank transfer or cheque to ${APP_NAME}.`,
    `— ${APP_NAME} billing`,
  ].join('\n');
}

/**
 * Send a monthly subscription invoice email.
 *
 * @param {object} args
 * @param {string} args.to - recipient (COMPANY_ADMIN email)
 * @param {object} args.invoice - invoice fields joined with company_name
 * @returns {Promise<boolean>} send-success
 */
async function sendSubscriptionInvoiceEmail({ to, invoice }) {
  if (!to || !invoice) return false;
  const subject = `Invoice ${invoice.invoice_number} - ${invoice.company_name}`;
  const html = buildHtml(invoice);
  const text = buildText(invoice);
  return await sendEmail({ to, subject, html, text });
}

module.exports = {
  sendSubscriptionInvoiceEmail,
  buildHtml,
  buildText,
};
