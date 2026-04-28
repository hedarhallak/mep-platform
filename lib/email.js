'use strict';

/**
 * lib/email.js
 * SendGrid email helper
 *
 * SECURITY NOTE: All user-controlled values inserted into HTML email
 * templates MUST be escaped via escapeHtml() (alias `e()`) to prevent
 * stored-XSS via HTML-rendering email clients.
 *
 * Plain-text email bodies don't need escaping — text/plain is not
 * interpreted by clients.
 */

const sgMail = require('@sendgrid/mail');

const API_KEY = process.env.SENDGRID_API_KEY;
const FROM = process.env.SENDGRID_FROM_EMAIL;
const APP_NAME = process.env.APP_NAME || 'MEP Platform';
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

if (API_KEY) {
  sgMail.setApiKey(API_KEY);
}

// ── Helpers ───────────────────────────────────────────────────

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#x27;',
      })[c]
  );
}
// Shorthand for inline template use
const e = escapeHtml;

function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ap = h < 12 ? 'AM' : 'PM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ap}`;
}

function fmtDate(d) {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d + 'T12:00:00Z') : new Date(d);
  return date.toLocaleDateString('en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

const STYLES = `
  body { font-family: 'Segoe UI', Arial, sans-serif; background: #f4f4f8; margin: 0; padding: 0; }
  .wrapper { max-width: 520px; margin: 40px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
  .header  { padding: 28px 32px; }
  .header h1 { color: #fff; font-size: 18px; margin: 0; font-weight: 700; }
  .header p  { font-size: 12px; margin: 4px 0 0; opacity: 0.8; color: #fff; }
  .body    { padding: 32px; }
  .greeting { font-size: 16px; color: #0f172a; font-weight: 600; margin: 0 0 12px; }
  .sub { font-size: 14px; color: #475569; margin: 0 0 4px; }
  .info-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px; margin: 20px 0; }
  .row { display: flex; justify-content: space-between; padding: 7px 0; border-bottom: 1px solid #f1f5f9; }
  .row:last-child { border-bottom: none; padding-bottom: 0; }
  .label { font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; flex-shrink: 0; }
  .value { font-size: 14px; color: #1e293b; font-weight: 600; text-align: right; max-width: 300px; }
  .foreman-box { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 14px 18px; margin: 16px 0 0; }
  .foreman-box .title { font-size: 11px; font-weight: 700; color: #1d4ed8; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
  .foreman-box .name { font-size: 15px; font-weight: 700; color: #1e293b; }
  .foreman-box .phone { font-size: 13px; color: #475569; margin-top: 2px; }
  .notes-box { background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 12px 16px; font-size: 13px; color: #92400e; margin: 12px 0 0; }
  .team-table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }
  .team-table th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; padding: 4px 0 8px; border-bottom: 1px solid #e2e8f0; }
  .team-table td { padding: 8px 0; border-bottom: 1px solid #f1f5f9; color: #1e293b; }
  .team-table tr:last-child td { border-bottom: none; }
  .footer { background: #f8fafc; padding: 18px 32px; text-align: center; font-size: 11px; color: #94a3b8; }
`;

// ─────────────────────────────────────────────────────────────

async function sendEmail({ to, subject, html, text }) {
  if (!API_KEY || !FROM) {
    console.warn('[email] SendGrid not configured — skipping email to:', to);
    return false;
  }
  try {
    await sgMail.send({ to, from: FROM, subject, html, text });
    console.log(`[email] Sent "${subject}" to ${to}`);
    return true;
  } catch (err) {
    console.error('[email] SendGrid error:', err?.response?.body || err.message);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
// Welcome email
// ─────────────────────────────────────────────────────────────
async function sendAdminWelcome({ to, companyName, companyCode, username, tempPin }) {
  const subject = `Welcome to ${APP_NAME} — Your Admin Account`;
  const html = `
<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
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
</style></head><body>
  <div class="wrapper">
    <div class="header"><h1>${e(APP_NAME.toUpperCase())}</h1><p>WORKFORCE MANAGEMENT PLATFORM</p></div>
    <div class="body">
      <h2>Welcome, ${e(companyName)} Admin</h2>
      <p>Your company account has been created on ${e(APP_NAME)}. Below are your login credentials.</p>
      <div class="creds">
        <div class="creds-row"><span class="creds-label">Company</span><span class="creds-value">${e(companyName)}</span></div>
        <div class="creds-row"><span class="creds-label">Company Code</span><span class="creds-value">${e(companyCode)}</span></div>
        <div class="creds-row"><span class="creds-label">Username</span><span class="creds-value">${e(username)}</span></div>
        <div class="creds-row"><span class="creds-label">Temporary PIN</span><span class="creds-value pin">${e(tempPin)}</span></div>
      </div>
      <div class="warning">You will be required to change your PIN on first login. Keep this email secure and do not share it.</div>
      <a href="${e(APP_URL)}/login.html" class="btn">Sign In to Your Account</a>
    </div>
    <div class="footer">This email was sent by ${e(APP_NAME)}. If you did not expect this, please contact support.</div>
  </div>
</body></html>`;
  const text =
    `Welcome to ${APP_NAME}\n\nCompany: ${companyName}\nCompany Code: ${companyCode}\nUsername: ${username}\nTemp PIN: ${tempPin}\n\nLogin at: ${APP_URL}/login.html`.trim();
  return sendEmail({ to, subject, html, text });
}

// ─────────────────────────────────────────────────────────────
// Assignment notification — Worker / Journeyman
// ─────────────────────────────────────────────────────────────
async function sendAssignmentEmployee({
  to,
  employeeName,
  projectCode,
  projectName,
  siteAddress,
  startDate,
  endDate,
  shiftStart,
  shiftEnd,
  notes,
  foremanName,
  foremanPhone,
  updateType,
}) {
  const isUpdate = updateType === 'foreman_assigned';
  const subject = isUpdate
    ? `[${APP_NAME}] Foreman Update — ${projectCode}`
    : `[${APP_NAME}] Assignment Notification — ${projectCode}`;
  const startFmt = fmtDate(startDate);
  const endFmt = fmtDate(endDate);
  const dateRange = startFmt === endFmt ? startFmt : `${startFmt} to ${endFmt}`;
  const shift = shiftStart && shiftEnd ? `${fmtTime(shiftStart)} - ${fmtTime(shiftEnd)}` : '';

  const foremanSection = foremanName
    ? `
    <div class="foreman-box">
      <div class="title">Your Foreman</div>
      <div class="name">${e(foremanName)}</div>
      ${foremanPhone ? `<div class="phone">${e(foremanPhone)}</div>` : ''}
    </div>`
    : '';

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${STYLES}</style></head><body>
  <div class="wrapper">
    <div class="header" style="background:#4f46e5;">
      <h1>${isUpdate ? 'Foreman Assigned' : 'New Assignment'}</h1>
      <p>${e(APP_NAME.toUpperCase())} - WORKFORCE MANAGEMENT</p>
    </div>
    <div class="body">
      <p class="greeting">Hello ${e(employeeName)},</p>
      <p class="sub">${isUpdate ? 'A foreman has been assigned to your project:' : 'You have been assigned to the following project:'}</p>
      <div class="info-box">
        <div class="row"><span class="label">Project</span><span class="value">${e(projectCode)}${projectName ? ' - ' + e(projectName) : ''}</span></div>
        ${siteAddress ? `<div class="row"><span class="label">Location</span><span class="value">${e(siteAddress)}</span></div>` : ''}
        <div class="row"><span class="label">Date</span><span class="value">${e(dateRange)}</span></div>
        ${shift ? `<div class="row"><span class="label">Shift</span><span class="value">${e(shift)}</span></div>` : ''}
      </div>
      ${foremanSection}
      ${notes ? `<div class="notes-box">${e(notes)}</div>` : ''}
    </div>
    <div class="footer">${e(APP_NAME)} - Automated notification. Do not reply.</div>
  </div>
</body></html>`;

  const text =
    `Hello ${employeeName},\n\nProject: ${projectCode}${projectName ? ' - ' + projectName : ''}\n${siteAddress ? 'Location: ' + siteAddress + '\n' : ''}Date: ${dateRange}\n${shift ? 'Shift: ' + shift + '\n' : ''}${foremanName ? '\nForeman: ' + foremanName + (foremanPhone ? '\nPhone: ' + foremanPhone : '') : ''}${notes ? '\nNotes: ' + notes : ''}\n\n- ${APP_NAME}`.trim();

  return sendEmail({ to, subject, html, text });
}

// ─────────────────────────────────────────────────────────────
// Assignment notification — Foreman
// isSelfNotice = true  → foreman just got assigned, show team list
// isSelfNotice = false → new worker joined, notify foreman
// ─────────────────────────────────────────────────────────────
async function sendAssignmentForeman({
  to,
  foremanName,
  employeeName,
  projectCode,
  projectName,
  siteAddress,
  startDate,
  endDate,
  shiftStart,
  shiftEnd,
  tradeCode,
  teamList,
  isSelfNotice,
}) {
  const startFmt = fmtDate(startDate);
  const endFmt = fmtDate(endDate);
  const dateRange = startFmt === endFmt ? startFmt : `${startFmt} to ${endFmt}`;
  const shift = shiftStart && shiftEnd ? `${fmtTime(shiftStart)} - ${fmtTime(shiftEnd)}` : '';

  const subject = isSelfNotice
    ? `[${APP_NAME}] You've been assigned as Foreman — ${projectCode}`
    : `[${APP_NAME}] New Team Member — ${projectCode}`;

  const teamSection =
    teamList && teamList.length > 0
      ? `
    <div style="margin-top:20px;">
      <div style="font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Your Team (${teamList.length})</div>
      <table class="team-table">
        <thead><tr><th>Name</th><th>Phone</th></tr></thead>
        <tbody>
          ${teamList.map((w) => `<tr><td>${e(w.name)}</td><td>${e(w.phone) || '-'}</td></tr>`).join('')}
        </tbody>
      </table>
    </div>`
      : '';

  const newMemberSection =
    !isSelfNotice && employeeName
      ? `
    <div class="info-box" style="margin-top:16px;">
      <div class="row"><span class="label">New Member</span><span class="value">${e(employeeName)}</span></div>
      ${tradeCode ? `<div class="row"><span class="label">Trade</span><span class="value">${e(tradeCode)}</span></div>` : ''}
    </div>`
      : '';

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${STYLES}</style></head><body>
  <div class="wrapper">
    <div class="header" style="background:#0f766e;">
      <h1>${isSelfNotice ? 'Foreman Assignment' : 'New Team Member'}</h1>
      <p>${e(APP_NAME.toUpperCase())} - FOREMAN NOTICE</p>
    </div>
    <div class="body">
      <p class="greeting">Hello ${e(foremanName)},</p>
      <p class="sub">${isSelfNotice ? 'You have been assigned as Foreman on:' : 'A new team member has been added to your project:'}</p>
      <div class="info-box">
        <div class="row"><span class="label">Project</span><span class="value">${e(projectCode)}${projectName ? ' - ' + e(projectName) : ''}</span></div>
        ${siteAddress ? `<div class="row"><span class="label">Location</span><span class="value">${e(siteAddress)}</span></div>` : ''}
        <div class="row"><span class="label">Date</span><span class="value">${e(dateRange)}</span></div>
        ${shift ? `<div class="row"><span class="label">Shift</span><span class="value">${e(shift)}</span></div>` : ''}
      </div>
      ${newMemberSection}
      ${teamSection}
    </div>
    <div class="footer">${e(APP_NAME)} - Automated notification. Do not reply.</div>
  </div>
</body></html>`;

  const teamText =
    teamList && teamList.length > 0
      ? '\n\nYour Team:\n' +
        teamList.map((w) => `  ${w.name} - ${w.phone || 'no phone'}`).join('\n')
      : '';
  const text =
    `Hello ${foremanName},\n\nProject: ${projectCode}${projectName ? ' - ' + projectName : ''}\n${siteAddress ? 'Location: ' + siteAddress + '\n' : ''}Date: ${dateRange}\n${shift ? 'Shift: ' + shift : ''}${!isSelfNotice && employeeName ? '\n\nNew Member: ' + employeeName + (tradeCode ? ' (' + tradeCode + ')' : '') : ''}${teamText}\n\n- ${APP_NAME}`.trim();

  return sendEmail({ to, subject, html, text });
}

// Reusable browser instance
let _browser = null;
async function getBrowser() {
  if (_browser) {
    try {
      await _browser.version();
      return _browser;
    } catch (_) {
      _browser = null;
    }
  }
  const puppeteer = require('puppeteer');
  _browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    headless: 'new',
  });
  return _browser;
}

// ─────────────────────────────────────────────────────────────
async function sendPurchaseOrder({
  to,
  ref,
  date,
  companyName,
  companyPhone,
  companyAddress,
  projectCode,
  projectName,
  siteAddress,
  foremanName,
  foremanPhone,
  items,
  note,
  isProcurement,
  supplierName,
}) {
  const subject = isProcurement
    ? `[${APP_NAME}] Purchase Request — ${ref}`
    : `[${APP_NAME}] Material Order — ${ref}`;

  const recipientLabel = isProcurement ? 'Procurement Department' : supplierName;

  const itemRows = (items || [])
    .map(
      (it, i) => `
    <tr style="background:${i % 2 === 0 ? '#f8fafc' : '#fff'}">
      <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#64748b;text-align:center">${i + 1}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#1e293b;font-weight:500">${e(it.item_name)}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#4f46e5;font-weight:700;text-align:center">${e(it.quantity)}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#64748b;text-align:center">${e(it.unit)}</td>
    </tr>
  `
    )
    .join('');

  const poHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #fff; color: #1e293b; padding: 40px; }
  </style>
  </head><body style="max-width:800px;margin:0 auto">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;padding-bottom:24px;border-bottom:2px solid #4f46e5">
      <div>
        <div style="font-size:22px;font-weight:800;color:#4f46e5">${e(companyName) || ''}</div>
        ${companyAddress ? `<div style="font-size:12px;color:#64748b;margin-top:4px">${e(companyAddress)}</div>` : ''}
        ${companyPhone ? `<div style="font-size:12px;color:#64748b">${e(companyPhone)}</div>` : ''}
      </div>
      <div style="text-align:right">
        <div style="font-size:20px;font-weight:800;color:#1e293b">Purchase Order</div>
        <div style="font-size:13px;color:#64748b;margin-top:4px">Ref: <strong>${e(ref)}</strong></div>
        <div style="font-size:13px;color:#64748b">Date: ${e(date)}</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px">
        <div style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Project</div>
        <div style="font-size:14px;font-weight:700;color:#1e293b">${e(projectCode)}${projectName ? ' - ' + e(projectName) : ''}</div>
        ${siteAddress ? `<div style="font-size:12px;color:#64748b;margin-top:4px">${e(siteAddress)}</div>` : ''}
      </div>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px">
        <div style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Requested By</div>
        <div style="font-size:14px;font-weight:700;color:#1e293b">${e(foremanName) || ''}</div>
        ${foremanPhone ? `<div style="font-size:12px;color:#64748b;margin-top:4px">${e(foremanPhone)}</div>` : ''}
      </div>
    </div>

    <div style="${isProcurement ? 'background:#eff6ff;border:1px solid #bfdbfe' : 'background:#f8fafc;border:1px solid #e2e8f0'};border-radius:8px;padding:14px;margin-bottom:20px">
      <div style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">To</div>
      <div style="font-size:14px;font-weight:700;color:#1e293b">${e(recipientLabel)}</div>
    </div>

    <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
      <thead>
        <tr style="background:#4f46e5">
          <th style="padding:10px 14px;text-align:center;font-size:11px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:1px;width:40px">#</th>
          <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:1px">Item Description</th>
          <th style="padding:10px 14px;text-align:center;font-size:11px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:1px;width:80px">Qty</th>
          <th style="padding:10px 14px;text-align:center;font-size:11px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:1px;width:80px">Unit</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>

    ${
      note
        ? `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px;margin-bottom:24px">
      <div style="font-size:10px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Notes</div>
      <div style="font-size:13px;color:#78350f">${e(note)}</div>
    </div>`
        : ''
    }

    <div style="border-top:1px solid #e2e8f0;padding-top:16px;display:flex;justify-content:space-between">
      <div style="font-size:11px;color:#94a3b8">Generated by ${e(APP_NAME)} - ${e(date)}</div>
      <div style="font-size:11px;color:#94a3b8">${e(ref)}</div>
    </div>
  </body></html>`;

  // Generate PDF using puppeteer (reuse browser)
  let pdfBuffer = null;
  try {
    const browser = await getBrowser();
    const page = await browser.newPage();
    await page.setContent(poHtml, { waitUntil: 'load' });
    pdfBuffer = await page.pdf({
      format: 'A4',
      margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
      printBackground: true,
    });
    await page.close();
  } catch (err) {
    console.error('[PO PDF generation error]', err.message);
    _browser = null;
  }

  // Email body (simple notification)
  const itemText = (items || [])
    .map((it, i) => `  ${i + 1}. ${it.item_name} - ${it.quantity} ${it.unit}`)
    .join('\n');

  const emailHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${STYLES}</style></head><body>
  <div class="wrapper">
    <div class="header" style="background:#4f46e5;">
      <h1>Purchase Order</h1>
      <p>${e(APP_NAME.toUpperCase())} - ${e(ref)}</p>
    </div>
    <div class="body">
      <p class="greeting">Dear ${e(recipientLabel)},</p>
      <p class="sub">Please find attached a material request from <strong>${e(companyName)}</strong>.</p>
      <div class="info-box">
        <div class="row"><span class="label">Ref</span><span class="value">${e(ref)}</span></div>
        <div class="row"><span class="label">Date</span><span class="value">${e(date)}</span></div>
        <div class="row"><span class="label">Project</span><span class="value">${e(projectCode)}${projectName ? ' - ' + e(projectName) : ''}</span></div>
        ${siteAddress ? `<div class="row"><span class="label">Site</span><span class="value">${e(siteAddress)}</span></div>` : ''}
        <div class="row"><span class="label">Requested By</span><span class="value">${e(foremanName)}${foremanPhone ? ' - ' + e(foremanPhone) : ''}</span></div>
      </div>
      ${note ? `<div class="notes-box">${e(note)}</div>` : ''}
    </div>
    <div class="footer">${e(APP_NAME)} - Ref: ${e(ref)} - ${e(date)}</div>
  </div>
</body></html>`;

  const msg = {
    to,
    from: FROM,
    subject,
    html: emailHtml,
    text: `Purchase Order ${ref}\n\nProject: ${projectCode}\nRequested by: ${foremanName}\n\nItems:\n${itemText}\n${note ? '\nNotes: ' + note : ''}`,
  };

  // Attach PDF if generated
  if (pdfBuffer) {
    msg.attachments = [
      {
        content: Buffer.from(pdfBuffer).toString('base64'),
        filename: `${ref}.pdf`,
        type: 'application/pdf',
        disposition: 'attachment',
      },
    ];
  }

  if (!API_KEY || !FROM) {
    console.warn('[email] SendGrid not configured — skipping email to:', to);
    return false;
  }
  try {
    await sgMail.send(msg);
    console.log(`[email] Sent "${subject}" with PDF to ${to}`);
    return true;
  } catch (err) {
    console.error('[email] SendGrid error:', err?.response?.body || err.message);
    return false;
  }
}

module.exports = {
  sendEmail,
  sendAdminWelcome,
  sendAssignmentEmployee,
  sendAssignmentForeman,
  sendPurchaseOrder,
  escapeHtml,
};
