'use strict';

// routes/user_management.js
// GET    /api/users           â€” list all app_users for company
// PATCH  /api/users/:id/role  â€” change user role
// PATCH  /api/users/:id/status â€” activate / deactivate
// POST   /api/users/:id/resend â€” resend activation email

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
// Provider-agnostic mail client (SendGrid by default, Resend via
// EMAIL_PROVIDER=resend). See lib/email.js#getMailClient.
const sgMail = require('../lib/email').getMailClient();
const { can, logAudit } = require('../middleware/permissions');
const { normalizeRole, canAssignRole } = require('../middleware/roles');
const { escapeHtml } = require('../lib/email');

// Section 89-C/5 (Phase 4 Stage 2): in-handler queries migrated to req.db
// (RLS-enforced via middleware/tenant_db). The `pool` import was removed —
// every business query in this file uses `req.db.query(...)`.
//
// `logAudit(req, ...)` (from middleware/permissions.js) is fire-and-forget
// and uses its own internal `pool.query` to insert into audit_logs. That
// path will be addressed when middleware/permissions.js itself is migrated
// for Stage 3 (see HANDOFF.md Pitfall #21). For Stage 1+2 permissive RLS
// the audit INSERT works fine on the unset-GUC pool client.
//
// WHERE company_id clauses are kept for defense-in-depth — RLS does the
// actual filtering at the DB layer once tenant_db sets the GUC.

const ALLOWED_ROLES = [
  'IT_ADMIN',
  'COMPANY_ADMIN',
  'TRADE_PROJECT_MANAGER',
  'TRADE_ADMIN',
  'WORKER',
];

const ROLE_RANK = {
  SUPER_ADMIN: 0,
  // §132 OWNER ranks just below SUPER_ADMIN so the existing rank checks block
  // any in-tenant actor from altering/demoting an OWNER (targetRank would
  // otherwise default to 99 = unprotected). The explicit canAssignRole guard
  // below is the primary protection; this keeps the rank map consistent. §140.
  OWNER: 1,
  IT_ADMIN: 1,
  COMPANY_ADMIN: 2,
  TRADE_PROJECT_MANAGER: 3,
  TRADE_ADMIN: 4,
  FOREMAN: 5,
  JOURNEYMAN: 6,
  APPRENTICE_4: 7,
  APPRENTICE_3: 7,
  APPRENTICE_2: 7,
  APPRENTICE_1: 7,
  WORKER: 8,
  DRIVER: 8,
};

function mustEnv(name) {
  const v = process.env[name];
  return v && String(v).trim() ? String(v).trim() : null;
}

// â”€â”€ GET /api/users â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// List all app_users for current company with employee info
router.get('/', can('settings.user_management'), async (req, res) => {
  try {
    const companyId = req.user.company_id;

    const result = await req.db.query(
      `
      SELECT
        au.id,
        au.username,
        au.email,
        au.role,
        au.is_active,
        au.profile_status,
        au.activation_sent_at,
        au.activated_at,
        au.created_at,
        e.first_name,
        e.last_name,
        e.employee_code,
        ep.trade_code,
        tt.name AS trade_name
      FROM public.app_users au
      LEFT JOIN public.employees      e  ON e.id  = au.employee_id
      LEFT JOIN public.employee_profiles ep ON ep.employee_id = e.id
      LEFT JOIN public.trade_types    tt ON tt.code = ep.trade_code
      WHERE au.company_id = $1
      ORDER BY au.created_at DESC
    `,
      [companyId]
    );

    res.json({ ok: true, users: result.rows });
  } catch (err) {
    console.error('GET /users error:', err);
    res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// â”€â”€ PATCH /api/users/:id/role â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Change user role â€” caller must outrank target
router.patch('/:id/role', can('settings.user_management'), async (req, res) => {
  try {
    const targetId = Number(req.params.id);
    const newRole = normalizeRole(req.body?.role);
    const companyId = req.user.company_id;

    if (!ALLOWED_ROLES.includes(newRole)) {
      return res.status(400).json({ ok: false, error: 'INVALID_ROLE', allowed: ALLOWED_ROLES });
    }

    // Load target user
    const { rows } = await req.db.query(
      `SELECT id, role, company_id FROM public.app_users WHERE id = $1 LIMIT 1`,
      [targetId]
    );
    if (!rows.length) return res.status(404).json({ ok: false, error: 'USER_NOT_FOUND' });

    const target = rows[0];
    if (Number(target.company_id) !== Number(companyId)) {
      return res.status(403).json({ ok: false, error: 'CROSS_COMPANY' });
    }

    // §132 OWNER guard (DECISIONS §140): no in-tenant actor may assign OWNER,
    // nor alter a user who currently IS an OWNER — only Constrai (SUPER_ADMIN).
    if (!canAssignRole(req.user.role, newRole, target.role)) {
      return res.status(403).json({ ok: false, error: 'OWNER_ROLE_RESTRICTED' });
    }

    // Rank check â€” cannot change role of someone equal or higher
    const callerRank = ROLE_RANK[normalizeRole(req.user.role)] ?? 99;
    const targetRank = ROLE_RANK[normalizeRole(target.role)] ?? 99;
    const newRank = ROLE_RANK[newRole] ?? 99;

    if (callerRank >= targetRank) {
      return res.status(403).json({ ok: false, error: 'INSUFFICIENT_PRIVILEGE' });
    }
    if (callerRank >= newRank) {
      return res.status(403).json({ ok: false, error: 'CANNOT_ASSIGN_HIGHER_ROLE' });
    }

    await req.db.query(`UPDATE public.app_users SET role = $1 WHERE id = $2`, [newRole, targetId]);

    await logAudit(
      req,
      'CHANGE_ROLE',
      'app_users',
      targetId,
      { role: target.role },
      { role: newRole }
    );

    res.json({ ok: true, message: `Role updated to ${newRole}` });
  } catch (err) {
    console.error('PATCH /users/:id/role error:', err);
    res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// â”€â”€ PATCH /api/users/:id/status â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Activate or deactivate a user account
router.patch('/:id/status', can('settings.user_management'), async (req, res) => {
  try {
    const targetId = Number(req.params.id);
    const isActive = Boolean(req.body?.is_active);
    const companyId = req.user.company_id;

    const { rows } = await req.db.query(
      `SELECT id, role, is_active, company_id FROM public.app_users WHERE id = $1 LIMIT 1`,
      [targetId]
    );
    if (!rows.length) return res.status(404).json({ ok: false, error: 'USER_NOT_FOUND' });

    const target = rows[0];
    if (Number(target.company_id) !== Number(companyId)) {
      return res.status(403).json({ ok: false, error: 'CROSS_COMPANY' });
    }

    // Cannot deactivate yourself
    if (Number(targetId) === Number(req.user.user_id)) {
      return res.status(400).json({ ok: false, error: 'CANNOT_DEACTIVATE_SELF' });
    }

    const callerRank = ROLE_RANK[normalizeRole(req.user.role)] ?? 99;
    const targetRank = ROLE_RANK[normalizeRole(target.role)] ?? 99;
    if (callerRank >= targetRank) {
      return res.status(403).json({ ok: false, error: 'INSUFFICIENT_PRIVILEGE' });
    }

    await req.db.query(`UPDATE public.app_users SET is_active = $1 WHERE id = $2`, [
      isActive,
      targetId,
    ]);

    logAudit(
      req,
      isActive ? 'ACTIVATE_USER' : 'DEACTIVATE_USER',
      'app_users',
      targetId,
      { is_active: target.is_active },
      { is_active: isActive }
    );

    res.json({ ok: true, message: isActive ? 'User activated' : 'User deactivated' });
  } catch (err) {
    console.error('PATCH /users/:id/status error:', err);
    res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// â”€â”€ POST /api/users/:id/resend â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Resend activation email to a user who hasn't activated yet
router.post('/:id/resend', can('settings.user_management'), async (req, res) => {
  try {
    const targetId = Number(req.params.id);
    const companyId = req.user.company_id;

    // Section 98 (May 13, 2026): SENDGRID_API_KEY no longer checked here.
    // Mail goes through getMailClient() which routes to Resend in prod.
    const SENDGRID_FROM_EMAIL = mustEnv('SENDGRID_FROM_EMAIL');
    const APP_BASE_URL = mustEnv('APP_BASE_URL');

    if (!SENDGRID_FROM_EMAIL || !APP_BASE_URL) {
      return res.status(500).json({ ok: false, error: 'EMAIL_NOT_CONFIGURED' });
    }

    const { rows } = await req.db.query(
      `SELECT id, email, username, role, activated_at, company_id
       FROM public.app_users WHERE id = $1 LIMIT 1`,
      [targetId]
    );
    if (!rows.length) return res.status(404).json({ ok: false, error: 'USER_NOT_FOUND' });

    const target = rows[0];
    if (Number(target.company_id) !== Number(companyId)) {
      return res.status(403).json({ ok: false, error: 'CROSS_COMPANY' });
    }

    if (target.activated_at) {
      return res.status(400).json({ ok: false, error: 'ALREADY_ACTIVATED' });
    }

    if (!target.email) {
      return res.status(400).json({ ok: false, error: 'NO_EMAIL_ON_RECORD' });
    }

    // Revoke old invites + generate new token
    await req.db.query(
      `UPDATE public.user_invites SET status='REVOKED', revoked_at=NOW()
       WHERE company_id = $1 AND lower(email) = lower($2) AND status='ACTIVE'`,
      [companyId, target.email]
    );

    const rawToken = crypto.randomBytes(32).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    await req.db.query(
      `INSERT INTO public.user_invites
        (company_id, email, role, token_hash, status, created_by_user_id, expires_at)
       VALUES ($1, $2, $3, $4, 'ACTIVE', $5, $6)`,
      [companyId, target.email, target.role, tokenHash, req.user.user_id, expiresAt]
    );

    const activateLink = `${APP_BASE_URL.replace(/\/$/, '')}/activate?token=${rawToken}`;

    await sgMail.send({
      to: target.email,
      from: SENDGRID_FROM_EMAIL,
      subject: 'Your MEP Platform activation link',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:500px">
          <h2>Activate your account</h2>
          <p>Hi <strong>${escapeHtml(target.username)}</strong>, here is your new activation link:</p> <!-- nosemgrep: javascript.express.security.injection.raw-html-format.raw-html-format -->
          <p><a href="${escapeHtml(activateLink)}">${escapeHtml(activateLink)}</a></p>
          <p style="color:#94a3b8;font-size:13px">Expires in 48 hours.</p>
        </div>
      `,
    });

    await req.db.query(`UPDATE public.app_users SET activation_sent_at = NOW() WHERE id = $1`, [
      targetId,
    ]);

    await logAudit(req, 'RESEND_INVITE', 'app_users', targetId, null, { email: target.email });

    res.json({ ok: true, message: 'Activation email resent' });
  } catch (err) {
    console.error('POST /users/:id/resend error:', err);
    res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

module.exports = router;
