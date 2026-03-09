"use strict";

/**
 * lib/email.js
 * SendGrid email helper
 */

const sgMail = require("@sendgrid/mail");

const API_KEY  = process.env.SENDGRID_API_KEY;
const FROM     = process.env.SENDGRID_FROM_EMAIL;
const APP_NAME = process.env.APP_NAME || "MEP Platform";
const APP_URL  = process.env.APP_URL  || "http://localhost:3000";

if (API_KEY) {
  sgMail.setApiKey(API_KEY);
}

/**
 * Send a single email via SendGrid.
 * Returns true on success, false on failure (never throws).
 */
async function sendEmail({ to, subject, html, text }) {
  if (!API_KEY || !FROM) {
    console.warn("[email] SendGrid not configured — skipping email to:", to);
    return false;
  }

  try {
    await sgMail.send({ to, from: FROM, subject, html, text });
    console.log(`[email] Sent "${subject}" to ${to}`);
    return true;
  } catch (err) {
    console.error("[email] SendGrid error:", err?.response?.body || err.message);
    return false;
  }
}

/**
 * Welcome email sent to a new company ADMIN.
 */
async function sendAdminWelcome({ to, companyName, companyCode, username, tempPin }) {
  const subject = `Welcome to ${APP_NAME} — Your Admin Account`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #f4f4f8; margin: 0; padding: 0; }
    .wrapper { max-width: 560px; margin: 40px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    .header  { background: #0a0a0f; padding: 32px; text-align: center; }
    .header h1 { color: #f97316; font-size: 22px; margin: 0; letter-spacing: 2px; font-weight: 700; }
    .header p  { color: #64748b; font-size: 12px; margin: 6px 0 0; letter-spacing: 1px; }
    .body    { padding: 36px 40px; }
    .body h2 { font-size: 20px; color: #0f172a; margin: 0 0 8px; }
    .body p  { font-size: 15px; color: #475569; line-height: 1.6; margin: 0 0 20px; }
    .creds   { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 24px; margin: 24px 0; }
    .creds-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #e2e8f0; }
    .creds-row:last-child { border-bottom: none; padding-bottom: 0; }
    .creds-label { font-size: 12px; color: #94a3b8; letter-spacing: 1px; text-transform: uppercase; }
    .creds-value { font-size: 15px; color: #0f172a; font-weight: 600; font-family: monospace; }
    .creds-value.pin { color: #f97316; font-size: 20px; letter-spacing: 4px; }
    .warning { background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 14px 18px; font-size: 13px; color: #9a3412; margin: 20px 0; }
    .btn { display: block; background: #f97316; color: #fff; text-align: center; padding: 14px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 15px; margin: 24px 0 0; }
    .footer { background: #f8fafc; padding: 20px 40px; text-align: center; font-size: 12px; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>${APP_NAME.toUpperCase()}</h1>
      <p>WORKFORCE MANAGEMENT PLATFORM</p>
    </div>
    <div class="body">
      <h2>Welcome, ${companyName} Admin</h2>
      <p>Your company account has been created on ${APP_NAME}. Below are your login credentials.</p>

      <div class="creds">
        <div class="creds-row">
          <span class="creds-label">Company</span>
          <span class="creds-value">${companyName}</span>
        </div>
        <div class="creds-row">
          <span class="creds-label">Company Code</span>
          <span class="creds-value">${companyCode}</span>
        </div>
        <div class="creds-row">
          <span class="creds-label">Username</span>
          <span class="creds-value">${username}</span>
        </div>
        <div class="creds-row">
          <span class="creds-label">Temporary PIN</span>
          <span class="creds-value pin">${tempPin}</span>
        </div>
      </div>

      <div class="warning">
        ⚠️ You will be required to change your PIN on first login. Keep this email secure and do not share it.
      </div>

      <a href="${APP_URL}/login.html" class="btn">Sign In to Your Account →</a>
    </div>
    <div class="footer">
      This email was sent by ${APP_NAME}. If you did not expect this, please contact support.
    </div>
  </div>
</body>
</html>`;

  const text = `
Welcome to ${APP_NAME}

Company:      ${companyName}
Company Code: ${companyCode}
Username:     ${username}
Temp PIN:     ${tempPin}

You must change your PIN on first login.
Login at: ${APP_URL}/login.html
  `.trim();

  return sendEmail({ to, subject, html, text });
}

module.exports = { sendEmail, sendAdminWelcome };
