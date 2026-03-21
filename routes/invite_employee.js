"use strict";

/**
 * routes/invite_employee.js
 *
 * POST /api/invite-employee
 * Creates employee record in public.employees + sends onboarding invite email.
 *
 * Body:
 *   first_name, last_name, email, trade_type_id, level_code, role, emp_code (optional)
 */

const router  = require("express").Router();
const crypto  = require("crypto");
const { pool } = require("../db");
const auth    = require("../middleware/auth");
const { can } = require("../middleware/permissions");
const { sendEmail } = require("../lib/email");

router.use(auth);

// ── helpers ───────────────────────────────────────────────────
const hashToken = t => crypto.createHash("sha256").update(t).digest("hex");

function generateEmployeeCode(companyId) {
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `EMP-${companyId}-${rand}`;
}

function inviteEmailHtml({ firstName, lastName, role, tradeName, inviteUrl, appName, expiresHours }) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #f1f5f9; padding: 40px 16px; }
    .wrapper { max-width: 560px; margin: 0 auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 32px rgba(0,0,0,0.08); }
    .header { background: #0f172a; padding: 36px 40px; text-align: center; }
    .header-logo { display: inline-flex; align-items: center; justify-content: center; width: 52px; height: 52px; background: #6366f1; border-radius: 14px; margin-bottom: 16px; }
    .header h1 { color: #fff; font-size: 20px; font-weight: 700; letter-spacing: 0.5px; }
    .header p  { color: #94a3b8; font-size: 13px; margin-top: 4px; }
    .body { padding: 40px; }
    .greeting { font-size: 22px; font-weight: 700; color: #0f172a; margin-bottom: 12px; }
    .text { font-size: 15px; color: #475569; line-height: 1.7; margin-bottom: 24px; }
    .info-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px 24px; margin-bottom: 28px; }
    .info-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #f1f5f9; }
    .info-row:last-child { border-bottom: none; padding-bottom: 0; }
    .info-label { font-size: 12px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.8px; font-weight: 600; }
    .info-value { font-size: 14px; color: #1e293b; font-weight: 600; }
    .btn { display: block; background: #6366f1; color: #fff !important; text-align: center; padding: 16px 24px; border-radius: 12px; text-decoration: none; font-weight: 700; font-size: 16px; letter-spacing: 0.3px; margin-bottom: 20px; }
    .expiry { font-size: 13px; color: #94a3b8; text-align: center; margin-bottom: 28px; }
    .steps { background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 12px; padding: 20px 24px; margin-bottom: 28px; }
    .steps-title { font-size: 13px; font-weight: 700; color: #0369a1; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 12px; }
    .step { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 10px; font-size: 14px; color: #334155; }
    .step:last-child { margin-bottom: 0; }
    .step-num { width: 22px; height: 22px; background: #6366f1; color: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; flex-shrink: 0; margin-top: 1px; }
    .url-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; font-family: monospace; font-size: 12px; color: #6366f1; word-break: break-all; margin-bottom: 28px; }
    .footer { background: #f8fafc; padding: 20px 40px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #f1f5f9; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <div class="header-logo">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
      </div>
      <h1>${appName}</h1>
      <p>Construction ERP Platform</p>
    </div>

    <div class="body">
      <div class="greeting">Welcome, ${firstName}! 👋</div>
      <p class="text">
        You've been invited to join <strong>${appName}</strong>. 
        Complete your account setup to access your assignments, schedules, and project information.
      </p>

      <div class="info-box">
        <div class="info-row">
          <span class="info-label">Name</span>
          <span class="info-value">${firstName} ${lastName}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Role</span>
          <span class="info-value">${role.replace(/_/g, ' ')}</span>
        </div>
        ${tradeName ? `
        <div class="info-row">
          <span class="info-label">Trade</span>
          <span class="info-value">${tradeName}</span>
        </div>` : ''}
      </div>

      <div class="steps">
        <div class="steps-title">How to get started</div>
        <div class="step"><div class="step-num">1</div><span>Click the button below to open your personal setup page</span></div>
        <div class="step"><div class="step-num">2</div><span>Choose a username and secure PIN</span></div>
        <div class="step"><div class="step-num">3</div><span>Enter your home address (used for smart assignment matching)</span></div>
        <div class="step"><div class="step-num">4</div><span>Sign in and start using the platform</span></div>
      </div>

      <a href="${inviteUrl}" class="btn">Complete My Account Setup →</a>
      <p class="expiry">⏱ This link expires in ${expiresHours} hours</p>

      <p style="font-size:13px;color:#94a3b8;margin-bottom:8px;">If the button doesn't work, copy this link:</p>
      <div class="url-box">${inviteUrl}</div>
    </div>

    <div class="footer">
      This invitation was sent by your company administrator via ${appName}.<br>
      If you did not expect this email, you can safely ignore it.
    </div>
  </div>
</body>
</html>`;
}

// ── POST /api/invite-employee ─────────────────────────────────
router.post("/", can("employees.invite"), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const {
      first_name, last_name, email,
      trade_type_id, level_code, role, emp_code
    } = req.body;

    const companyId       = req.user.company_id;
    const createdByUserId = req.user.user_id;
    const appName         = process.env.APP_NAME     || "MEP Platform";
    const appBaseUrl      = process.env.APP_BASE_URL  || "http://localhost:3000";
    const expiresHours    = Number(process.env.USER_INVITE_EXPIRES_HOURS || 48);

    // ── Validate ──────────────────────────────────────────────
    if (!first_name?.trim()) return res.status(400).json({ ok: false, error: "FIRST_NAME_REQUIRED" });
    if (!last_name?.trim())  return res.status(400).json({ ok: false, error: "LAST_NAME_REQUIRED" });
    if (!email?.trim())      return res.status(400).json({ ok: false, error: "EMAIL_REQUIRED" });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ ok: false, error: "INVALID_EMAIL" });
    if (!role)               return res.status(400).json({ ok: false, error: "ROLE_REQUIRED" });

    // ── Check email not already used in this company ──────────
    const emailExists = await client.query(
      `SELECT id FROM public.employees
       WHERE (email = $1 OR contact_email = $1)
         AND company_id = $2
       LIMIT 1`,
      [email.toLowerCase().trim(), companyId]
    );
    if (emailExists.rows.length)
      return res.status(409).json({ ok: false, error: "EMAIL_ALREADY_REGISTERED" });

    // ── Get trade name for email ──────────────────────────────
    let tradeName = null;
    if (trade_type_id) {
      const t = await client.query(
        `SELECT name FROM public.trade_types WHERE id = $1 LIMIT 1`,
        [trade_type_id]
      );
      tradeName = t.rows[0]?.name || null;
    }

    // ── Generate employee_code if not provided ────────────────
    const employeeCode = emp_code?.trim() || generateEmployeeCode(companyId);

    // ── INSERT into public.employees ──────────────────────────
    const empResult = await client.query(
      `INSERT INTO public.employees
         (first_name, last_name, contact_email, employee_code, company_id, is_active, employee_profile_type)
       VALUES ($1, $2, $3, $4, $5, false, $6)
       RETURNING id`,
      [
        first_name.trim(),
        last_name.trim(),
        email.toLowerCase().trim(),
        employeeCode,
        companyId,
        role,
      ]
    );
    const employeeId = empResult.rows[0].id;

    // ── Generate invite token ─────────────────────────────────
    const rawToken  = crypto.randomBytes(32).toString("base64url");
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + expiresHours * 3600 * 1000);

    await client.query(
      `INSERT INTO public.user_invites
         (token_hash, email, role, employee_id, company_id, created_by_user_id, expires_at, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE')`,
      [
        tokenHash,
        email.toLowerCase().trim(),
        role,
        employeeId,
        companyId,
        createdByUserId,
        expiresAt,
      ]
    );

    await client.query("COMMIT");

    // ── Send email (outside transaction) ─────────────────────
    const inviteUrl = `${appBaseUrl}/onboarding?token=${rawToken}`;
    const emailSent = await sendEmail({
      to:      email,
      subject: `You're invited to join ${appName}`,
      html:    inviteEmailHtml({
        firstName:   first_name.trim(),
        lastName:    last_name.trim(),
        role,
        tradeName,
        inviteUrl,
        appName,
        expiresHours,
      }),
      text: `Hi ${first_name}, you've been invited to ${appName}. Complete your setup here: ${inviteUrl} (expires in ${expiresHours} hours)`,
    });

    return res.status(201).json({
      ok:          true,
      employee_id: employeeId,
      email_sent:  emailSent,
      invite_url:  inviteUrl, // useful for dev/testing
    });

  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("POST /api/invite-employee error:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR", message: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
