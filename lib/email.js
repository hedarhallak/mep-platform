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

// ── Helpers ───────────────────────────────────────────────────

function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ap = h < 12 ? 'AM' : 'PM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${String(h12).padStart(2,'0')}:${String(m).padStart(2,'0')} ${ap}`;
}

function fmtDate(d) {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d + 'T12:00:00Z') : new Date(d);
  return date.toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
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
    <div class="header"><h1>${APP_NAME.toUpperCase()}</h1><p>WORKFORCE MANAGEMENT PLATFORM</p></div>
    <div class="body">
      <h2>Welcome, ${companyName} Admin</h2>
      <p>Your company account has been created on ${APP_NAME}. Below are your login credentials.</p>
      <div class="creds">
        <div class="creds-row"><span class="creds-label">Company</span><span class="creds-value">${companyName}</span></div>
        <div class="creds-row"><span class="creds-label">Company Code</span><span class="creds-value">${companyCode}</span></div>
        <div class="creds-row"><span class="creds-label">Username</span><span class="creds-value">${username}</span></div>
        <div class="creds-row"><span class="creds-label">Temporary PIN</span><span class="creds-value pin">${tempPin}</span></div>
      </div>
      <div class="warning">⚠️ You will be required to change your PIN on first login. Keep this email secure and do not share it.</div>
      <a href="${APP_URL}/login.html" class="btn">Sign In to Your Account →</a>
    </div>
    <div class="footer">This email was sent by ${APP_NAME}. If you did not expect this, please contact support.</div>
  </div>
</body></html>`;
  const text = `Welcome to ${APP_NAME}\n\nCompany: ${companyName}\nCompany Code: ${companyCode}\nUsername: ${username}\nTemp PIN: ${tempPin}\n\nLogin at: ${APP_URL}/login.html`.trim();
  return sendEmail({ to, subject, html, text });
}

// ─────────────────────────────────────────────────────────────
// Assignment notification — Worker / Journeyman
// ─────────────────────────────────────────────────────────────
async function sendAssignmentEmployee({
  to, employeeName,
  projectCode, projectName, siteAddress,
  startDate, endDate, shiftStart, shiftEnd,
  notes, foremanName, foremanPhone, updateType,
}) {
  const isUpdate  = updateType === 'foreman_assigned';
  const subject   = isUpdate
    ? `[${APP_NAME}] Foreman Update — ${projectCode}`
    : `[${APP_NAME}] Assignment Notification — ${projectCode}`;
  const startFmt  = fmtDate(startDate);
  const endFmt    = fmtDate(endDate);
  const dateRange = startFmt === endFmt ? startFmt : `${startFmt} → ${endFmt}`;
  const shift     = shiftStart && shiftEnd ? `${fmtTime(shiftStart)} – ${fmtTime(shiftEnd)}` : '';

  const foremanSection = foremanName ? `
    <div class="foreman-box">
      <div class="title">👷 Your Foreman</div>
      <div class="name">${foremanName}</div>
      ${foremanPhone ? `<div class="phone">📞 ${foremanPhone}</div>` : ''}
    </div>` : '';

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${STYLES}</style></head><body>
  <div class="wrapper">
    <div class="header" style="background:#4f46e5;">
      <h1>${isUpdate ? '👷 Foreman Assigned' : '📋 New Assignment'}</h1>
      <p>${APP_NAME.toUpperCase()} · WORKFORCE MANAGEMENT</p>
    </div>
    <div class="body">
      <p class="greeting">Hello ${employeeName},</p>
      <p class="sub">${isUpdate ? 'A foreman has been assigned to your project:' : 'You have been assigned to the following project:'}</p>
      <div class="info-box">
        <div class="row"><span class="label">Project</span><span class="value">${projectCode}${projectName ? ' — ' + projectName : ''}</span></div>
        ${siteAddress ? `<div class="row"><span class="label">Location</span><span class="value">${siteAddress}</span></div>` : ''}
        <div class="row"><span class="label">Date</span><span class="value">${dateRange}</span></div>
        ${shift ? `<div class="row"><span class="label">Shift</span><span class="value">${shift}</span></div>` : ''}
      </div>
      ${foremanSection}
      ${notes ? `<div class="notes-box">📝 ${notes}</div>` : ''}
    </div>
    <div class="footer">${APP_NAME} — Automated notification. Do not reply.</div>
  </div>
</body></html>`;

  const text = `Hello ${employeeName},\n\nProject: ${projectCode}${projectName ? ' — ' + projectName : ''}\n${siteAddress ? 'Location: ' + siteAddress + '\n' : ''}Date: ${dateRange}\n${shift ? 'Shift: ' + shift + '\n' : ''}${foremanName ? '\nForeman: ' + foremanName + (foremanPhone ? '\nPhone: ' + foremanPhone : '') : ''}${notes ? '\nNotes: ' + notes : ''}\n\n— ${APP_NAME}`.trim();

  return sendEmail({ to, subject, html, text });
}

// ─────────────────────────────────────────────────────────────
// Assignment notification — Foreman
// isSelfNotice = true  → foreman just got assigned, show team list
// isSelfNotice = false → new worker joined, notify foreman
// ─────────────────────────────────────────────────────────────
async function sendAssignmentForeman({
  to, foremanName, employeeName,
  projectCode, projectName, siteAddress,
  startDate, endDate, shiftStart, shiftEnd,
  tradeCode, teamList, isSelfNotice,
}) {
  const startFmt  = fmtDate(startDate);
  const endFmt    = fmtDate(endDate);
  const dateRange = startFmt === endFmt ? startFmt : `${startFmt} → ${endFmt}`;
  const shift     = shiftStart && shiftEnd ? `${fmtTime(shiftStart)} – ${fmtTime(shiftEnd)}` : '';

  const subject = isSelfNotice
    ? `[${APP_NAME}] You've been assigned as Foreman — ${projectCode}`
    : `[${APP_NAME}] New Team Member — ${projectCode}`;

  const teamSection = (teamList && teamList.length > 0) ? `
    <div style="margin-top:20px;">
      <div style="font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Your Team (${teamList.length})</div>
      <table class="team-table">
        <thead><tr><th>Name</th><th>Phone</th></tr></thead>
        <tbody>
          ${teamList.map(w => `<tr><td>${w.name}</td><td>${w.phone || '—'}</td></tr>`).join('')}
        </tbody>
      </table>
    </div>` : '';

  const newMemberSection = (!isSelfNotice && employeeName) ? `
    <div class="info-box" style="margin-top:16px;">
      <div class="row"><span class="label">New Member</span><span class="value">${employeeName}</span></div>
      ${tradeCode ? `<div class="row"><span class="label">Trade</span><span class="value">${tradeCode}</span></div>` : ''}
    </div>` : '';

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${STYLES}</style></head><body>
  <div class="wrapper">
    <div class="header" style="background:#0f766e;">
      <h1>${isSelfNotice ? '🦺 Foreman Assignment' : '👷 New Team Member'}</h1>
      <p>${APP_NAME.toUpperCase()} · FOREMAN NOTICE</p>
    </div>
    <div class="body">
      <p class="greeting">Hello ${foremanName},</p>
      <p class="sub">${isSelfNotice ? 'You have been assigned as Foreman on:' : 'A new team member has been added to your project:'}</p>
      <div class="info-box">
        <div class="row"><span class="label">Project</span><span class="value">${projectCode}${projectName ? ' — ' + projectName : ''}</span></div>
        ${siteAddress ? `<div class="row"><span class="label">Location</span><span class="value">${siteAddress}</span></div>` : ''}
        <div class="row"><span class="label">Date</span><span class="value">${dateRange}</span></div>
        ${shift ? `<div class="row"><span class="label">Shift</span><span class="value">${shift}</span></div>` : ''}
      </div>
      ${newMemberSection}
      ${teamSection}
    </div>
    <div class="footer">${APP_NAME} — Automated notification. Do not reply.</div>
  </div>
</body></html>`;

  const teamText = (teamList && teamList.length > 0)
    ? '\n\nYour Team:\n' + teamList.map(w => `  ${w.name} — ${w.phone || 'no phone'}`).join('\n')
    : '';
  const text = `Hello ${foremanName},\n\nProject: ${projectCode}${projectName ? ' — ' + projectName : ''}\n${siteAddress ? 'Location: ' + siteAddress + '\n' : ''}Date: ${dateRange}\n${shift ? 'Shift: ' + shift : ''}${!isSelfNotice && employeeName ? '\n\nNew Member: ' + employeeName + (tradeCode ? ' (' + tradeCode + ')' : '') : ''}${teamText}\n\n— ${APP_NAME}`.trim();

  return sendEmail({ to, subject, html, text });
}

module.exports = { sendEmail, sendAdminWelcome, sendAssignmentEmployee, sendAssignmentForeman };
