'use strict';

/**
 * lib/email_invoice.js
 *
 * Phase 6-D-7 PR2 / Section 125 — subscription invoice email.
 *
 * The implementation lives in lib/email.js as `sendSubscriptionInvoice`
 * (PR2.1 / Section 125.5) so it can reuse the shared puppeteer browser,
 * STYLES, FROM, and getMailClient() that the other PDF/HTML senders use.
 * This module re-exports it under the name the cron + tests already import
 * (`sendSubscriptionInvoiceEmail`), so jobs/monthlyInvoiceJob.js and the
 * email test need no change.
 */

const { sendSubscriptionInvoice } = require('./email');

module.exports = {
  sendSubscriptionInvoiceEmail: sendSubscriptionInvoice,
};
