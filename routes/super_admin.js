'use strict';

/**
 * routes/super_admin.js
 * Company management — SUPER_ADMIN only
 *
 * GET    /api/super/companies              — list all companies
 * POST   /api/super/companies              — create company + ADMIN account
 * GET    /api/super/companies/:id          — company details
 * PATCH  /api/super/companies/:id          — update company (name, plan, status)
 * POST   /api/super/companies/:id/suspend  — suspend company
 * POST   /api/super/companies/:id/activate — activate company
 * GET    /api/super/stats                  — platform statistics
 *
 * Section 89-C/15: migrated from `pool.query` to `req.db.query`. The
 * `tenantDb` middleware routes SUPER_ADMIN through `superPool`
 * (BYPASSRLS), so cross-company reads (the entire purpose of this
 * route file) work naturally without per-query bypass. The
 * pre-existing manual `pool.connect()/BEGIN/COMMIT` block in
 * POST /companies flattened to a `req.db.query` sequence — same
 * pattern as 89-C/4..14.
 *
 * `audit(…, req, …)` calls were updated in 89-E/2 from
 * `audit(pool, req, …)` to `audit(req.db, req, …)`, so this file no
 * longer imports `pool` directly. All DB I/O (handler queries +
 * audit writes) flows through the request-scoped client.
 */

const express = require('express');
const router = express.Router();
const { hashPin } = require('../lib/auth_utils');
const { sendAdminWelcome } = require('../lib/email');
const { audit, ACTIONS } = require('../lib/audit');

// ── Helpers ──────────────────────────────────────────────

function generateCompanyCode(name) {
  const prefix = name
    .replace(/[^a-zA-Z]/g, '')
    .toUpperCase()
    .slice(0, 3)
    .padEnd(3, 'X');
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}${suffix}`;
}

async function uniqueCompanyCode(req, name) {
  for (let i = 0; i < 10; i++) {
    const code = generateCompanyCode(name);
    const exists = await req.db.query(
      'SELECT 1 FROM public.companies WHERE company_code = $1 LIMIT 1',
      [code]
    );
    if (!exists.rows.length) return code;
  }
  return 'CO' + Date.now().toString(36).toUpperCase();
}

// ── Routes ───────────────────────────────────────────────

/**
 * GET /api/super/stats
 */
router.get('/stats', async (req, res) => {
  try {
    const { rows } = await req.db.query(`
      SELECT
        (SELECT COUNT(*) FROM public.companies)                                        AS total_companies,
        (SELECT COUNT(*) FROM public.companies WHERE status = 'ACTIVE')               AS active_companies,
        (SELECT COUNT(*) FROM public.companies WHERE status = 'SUSPENDED')            AS suspended_companies,
        (SELECT COUNT(*) FROM public.companies WHERE status = 'TRIAL')                AS trial_companies,
        (SELECT COUNT(*) FROM public.employees)                                        AS total_employees,
        (SELECT COUNT(*) FROM public.projects)                                         AS total_projects,
        (SELECT COUNT(*) FROM public.app_users WHERE role != 'SUPER_ADMIN')           AS total_users
    `);
    return res.json({ ok: true, stats: rows[0] });
  } catch (err) {
    console.error('GET /super/stats error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

/**
 * GET /api/super/companies
 */
router.get('/companies', async (req, res) => {
  try {
    const { rows } = await req.db.query(`
      SELECT
        c.company_id   AS id,
        c.name,
        c.company_code,
        c.status,
        c.plan,
        c.admin_email,
        c.phone,
        c.created_at,
        c.updated_at,
        COUNT(DISTINCT e.id) AS employee_count,
        COUNT(DISTINCT p.id) AS project_count,
        COUNT(DISTINCT u.id) AS user_count
      FROM public.companies c
      LEFT JOIN public.employees e ON e.company_id = c.company_id
      LEFT JOIN public.projects  p ON p.company_id = c.company_id
      LEFT JOIN public.app_users u ON u.company_id = c.company_id AND u.role != 'SUPER_ADMIN'
      GROUP BY c.company_id
      ORDER BY c.created_at DESC
    `);
    return res.json({ ok: true, companies: rows });
  } catch (err) {
    console.error('GET /super/companies error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

/**
 * GET /api/super/companies/overview
 *
 * Phase 5 / 90-D — read-only dashboard list for the admin portal.
 * Distinct from `GET /companies` above (which is the management endpoint
 * that also drives suspend/activate/PATCH); this shape is display-only
 * and adds `last_activity_at` (latest audit_logs row per tenant) which
 * the dashboard renders as "last seen".
 *
 * MUST be registered BEFORE `GET /companies/:id` — otherwise Express
 * would route `/companies/overview` to the :id handler which Number()s
 * "overview" to NaN and 400s. (Pitfall recorded — easy to miss when
 * adding routes; convention: more specific named routes first, then
 * parameterized routes.)
 */
router.get('/companies/overview', async (req, res) => {
  try {
    const { rows } = await req.db.query(`
      SELECT
        c.company_id,
        c.name,
        c.plan,
        c.status,
        c.created_at,
        COUNT(DISTINCT e.id) AS employee_count,
        COUNT(DISTINCT p.id) AS project_count,
        MAX(a.created_at)    AS last_activity_at
      FROM public.companies c
      LEFT JOIN public.employees   e ON e.company_id = c.company_id
      LEFT JOIN public.projects    p ON p.company_id = c.company_id
      LEFT JOIN public.audit_logs  a ON a.company_id = c.company_id
      GROUP BY c.company_id
      ORDER BY c.name ASC
    `);
    return res.json({ ok: true, companies: rows });
  } catch (err) {
    console.error('GET /super/companies/overview error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

/**
 * GET /api/super/companies/:id
 */
router.get('/companies/:id', async (req, res) => {
  try {
    const companyId = Number(req.params.id);
    if (!companyId) return res.status(400).json({ ok: false, error: 'INVALID_ID' });

    // Section 116 (May 24, 2026) — Phase 6-D-4 PR 2 refactor:
    // LEFT JOIN subscriptions so the admin Branding page sees the canonical
    // subscribed_seats + bracket + pricing snapshot in a single round-trip.
    // LEFT JOIN (not INNER) so pre-migration-019 companies or future
    // unusual cases without a subscription still return the company row
    // with NULL subscription fields rather than a misleading 404.
    //
    // Response shape (backward-compatible):
    //   - company.* — all original company columns (including legacy max_users)
    //   - company.subscription_id, subscribed_seats, minimum_seats_billed,
    //     current_unit_price_cents, current_bracket_label, subscription_status,
    //     subscription_plan_type, next_billing_at, trial_ends_at — NEW from
    //     subscriptions table (NULL if no subscription)
    //   - company.current_users — count of public.employees for the company
    //
    // Frontend (CompanyBranding.jsx) prefers subscribed_seats but falls back
    // to max_users for backward-compat during the transition window.
    const { rows } = await req.db.query(
      `SELECT
         c.*,
         s.id                       AS subscription_id,
         s.status                   AS subscription_status,
         s.plan_type                AS subscription_plan_type,
         s.subscribed_seats,
         s.minimum_seats_billed,
         s.current_unit_price_cents,
         s.current_bracket_label,
         s.next_billing_at,
         s.trial_ends_at,
         s.cancel_at_period_end,
         s.payment_method
       FROM public.companies c
       LEFT JOIN public.subscriptions s ON s.company_id = c.company_id
       WHERE c.company_id = $1
       LIMIT 1`,
      [companyId]
    );
    if (!rows.length) return res.status(404).json({ ok: false, error: 'COMPANY_NOT_FOUND' });

    const admins = await req.db.query(
      `SELECT id, username, role, is_active, created_at
       FROM public.app_users
       WHERE company_id = $1 AND role = 'ADMIN'
       ORDER BY created_at`,
      [companyId]
    );

    // Count current employees (same definition the invite enforcement in
    // routes/invite_employee.js uses — see Section 113.4 comment block).
    const seatCount = await req.db.query(
      'SELECT COUNT(*)::int AS current_users FROM public.employees WHERE company_id = $1',
      [companyId]
    );
    const currentUsers = Number(seatCount.rows[0]?.current_users || 0);

    return res.json({
      ok: true,
      company: { ...rows[0], current_users: currentUsers },
      admins: admins.rows,
    });
  } catch (err) {
    console.error('GET /super/companies/:id error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

/**
 * POST /api/super/companies
 * Body: name, admin_username, admin_pin, plan?, admin_email?, phone?
 *
 * 89-C/15: manual transaction flattened — tenantDb wraps the request.
 */
router.post('/companies', async (req, res) => {
  try {
    const { name, admin_username, admin_pin, plan, admin_email, phone } = req.body || {};

    if (!name || !String(name).trim())
      return res.status(400).json({ ok: false, error: 'COMPANY_NAME_REQUIRED' });
    if (!admin_username || !String(admin_username).trim())
      return res.status(400).json({ ok: false, error: 'ADMIN_USERNAME_REQUIRED' });
    if (!admin_pin) return res.status(400).json({ ok: false, error: 'ADMIN_PIN_REQUIRED' });

    const pinStr = String(admin_pin);
    if (pinStr.length < 4 || pinStr.length > 8)
      return res
        .status(400)
        .json({ ok: false, error: 'INVALID_PIN_FORMAT', message: 'PIN must be 4-8 characters' });

    const allowedPlans = ['BASIC', 'PRO', 'ENTERPRISE'];
    const planValue = plan ? String(plan).toUpperCase() : 'BASIC';
    if (!allowedPlans.includes(planValue))
      return res.status(400).json({ ok: false, error: 'INVALID_PLAN', allowed: allowedPlans });

    const companyName = String(name).trim();
    const adminUsername = String(admin_username).trim().toLowerCase();

    const userExists = await req.db.query(
      'SELECT 1 FROM public.app_users WHERE username = $1 LIMIT 1',
      [adminUsername]
    );
    if (userExists.rows.length) return res.status(409).json({ ok: false, error: 'USERNAME_TAKEN' });

    const companyCode = await uniqueCompanyCode(req, companyName);
    const companyIns = await req.db.query(
      `INSERT INTO public.companies
         (name, company_code, status, plan, admin_email, phone, created_at, updated_at)
       VALUES ($1, $2, 'ACTIVE', $3, $4, $5, NOW(), NOW())
       RETURNING *`,
      [companyName, companyCode, planValue, admin_email || null, phone || null]
    );
    const company = companyIns.rows[0];

    const pinHash = await hashPin(pinStr);
    // Section 87 / migration 011: email is NOT NULL and globally unique. Use
    // admin_email if provided, otherwise synthesize from username + code.
    const adminEmail =
      admin_email && String(admin_email).trim()
        ? String(admin_email).trim().toLowerCase()
        : `${adminUsername}@${companyCode}.constrai.local`;
    const userIns = await req.db.query(
      `INSERT INTO public.app_users
         (username, email, pin_hash, company_id, role, is_active, must_change_pin, is_temp_pin)
       VALUES ($1, $2, $3, $4, 'ADMIN', true, true, true)
       RETURNING id, username, email, role`,
      [adminUsername, adminEmail, pinHash, company.company_id]
    );
    const adminUser = userIns.rows[0];

    // Send welcome email if admin_email provided (non-blocking).
    // Note: this happens before res.json (and therefore before tenantDb's
    // COMMIT), but sendAdminWelcome catches its own errors and returns
    // false rather than throwing, so a SendGrid failure does NOT roll
    // back the company creation. Same semantic as the pre-migration
    // "after-COMMIT" placement.
    let emailSent = false;
    if (admin_email) {
      emailSent = await sendAdminWelcome({
        to: admin_email,
        companyName: company.name,
        companyCode: company.company_code,
        username: adminUsername,
        tempPin: pinStr,
      });
    }

    await audit(req.db, req, {
      action: ACTIONS.COMPANY_CREATED,
      entity_type: 'company',
      entity_id: company.company_id,
      entity_name: company.name,
      new_values: { plan: company.plan, admin_username: adminUsername },
    });

    return res.status(201).json({
      ok: true,
      message: 'Company and admin account created successfully',
      email_sent: emailSent,
      company: {
        id: company.company_id,
        name: company.name,
        company_code: company.company_code,
        status: company.status,
        plan: company.plan,
        created_at: company.created_at,
      },
      admin: {
        id: adminUser.id,
        username: adminUser.username,
        role: adminUser.role,
        must_change_pin: true,
        note: 'Admin must change PIN on first login',
      },
    });
  } catch (err) {
    console.error('POST /super/companies error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR', message: err.message });
  }
});

/**
 * POST /api/super/companies/:id/owner — provision the OWNER account (§132.5 / §140 Slice 3).
 *
 * Constrai-only (SUPER_ADMIN). Creates a NEW user with role=OWNER for the
 * company and emails them a temp PIN (must_change_pin → they set their own on
 * first login) — the same provisioning shape as the company's first admin.
 * One active OWNER per company (backup-OWNER is a future option, §140.4).
 * Works for existing tenants (e.g. MEP) and new ones. The in-tenant OWNER
 * guard (canAssignRole) already blocks anyone but SUPER_ADMIN from minting one.
 */
router.post('/companies/:id/owner', async (req, res) => {
  try {
    const companyId = Number(req.params.id);
    if (!companyId) return res.status(400).json({ ok: false, error: 'INVALID_ID' });

    const { email, username: usernameRaw } = req.body || {};
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) {
      return res.status(400).json({ ok: false, error: 'VALID_EMAIL_REQUIRED' });
    }
    const ownerEmail = String(email).trim().toLowerCase();

    const co = await req.db.query(
      'SELECT company_id, name, company_code FROM public.companies WHERE company_id = $1 LIMIT 1',
      [companyId]
    );
    if (!co.rows.length) return res.status(404).json({ ok: false, error: 'COMPANY_NOT_FOUND' });
    const company = co.rows[0];

    // One active OWNER per company (§132.5 / §140.4).
    const existingOwner = await req.db.query(
      `SELECT 1 FROM public.app_users WHERE company_id = $1 AND role = 'OWNER' AND is_active = true LIMIT 1`,
      [companyId]
    );
    if (existingOwner.rows.length)
      return res.status(409).json({ ok: false, error: 'OWNER_ALREADY_EXISTS' });

    // Email is globally unique (migration 011).
    const emailTaken = await req.db.query(
      'SELECT 1 FROM public.app_users WHERE lower(email) = $1 LIMIT 1',
      [ownerEmail]
    );
    if (emailTaken.rows.length) return res.status(409).json({ ok: false, error: 'EMAIL_TAKEN' });

    // Username from the email local-part; ensure unique.
    const base =
      String(usernameRaw || ownerEmail.split('@')[0])
        .toLowerCase()
        .replace(/[^a-z0-9_.-]/g, '')
        .slice(0, 30) || 'owner';
    let username = base;
    for (let i = 1; i < 50; i++) {
      const taken = await req.db.query(
        'SELECT 1 FROM public.app_users WHERE username = $1 LIMIT 1',
        [username]
      );
      if (!taken.rows.length) break;
      username = `${base}${i}`;
    }

    // Temp PIN — owner sets a real PIN on first login (must_change_pin).
    const tempPin = String(Math.floor(100000 + Math.random() * 900000));
    const pinHash = await hashPin(tempPin);

    const ins = await req.db.query(
      `INSERT INTO public.app_users
         (username, email, pin_hash, company_id, role, is_active, must_change_pin, is_temp_pin)
       VALUES ($1, $2, $3, $4, 'OWNER', true, true, true)
       RETURNING id, username, email, role`,
      [username, ownerEmail, pinHash, companyId]
    );
    const owner = ins.rows[0];

    // Welcome email with the temp PIN (catches its own errors → never rolls back).
    const emailSent = await sendAdminWelcome({
      to: ownerEmail,
      companyName: company.name,
      companyCode: company.company_code,
      username,
      tempPin,
    });

    await audit(req.db, req, {
      action: ACTIONS.OWNER_PROVISIONED,
      entity_type: 'app_users',
      entity_id: owner.id,
      entity_name: username,
      new_values: { role: 'OWNER', company_id: companyId, email: ownerEmail },
    });

    return res.status(201).json({ ok: true, owner, email_sent: emailSent });
  } catch (err) {
    console.error('POST /super/companies/:id/owner error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR', message: err.message });
  }
});

/**
 * GET /api/super/audit — cross-tenant audit (§132.6 layer 6, §140 Slice 3b).
 *
 * Constrai's global oversight view of the high-risk / OWNER audit across ALL
 * tenants. SUPER_ADMIN routes through superPool (BYPASSRLS), so the absence of
 * a company_id filter intentionally spans every tenant. Surfaces OWNER
 * provisioning + the §132.7 sensitive-field edits with old→new + the company.
 * (The separate out-of-tenant-reach audit COPY is future infra — not this.)
 */
const SUPER_AUDIT_ACTIONS = [
  'OWNER_PROVISIONED',
  'PROJECT_UPDATED',
  'PROJECT_DELETED',
  'ASSIGNMENT_UPDATED',
  'ASSIGNMENT_DELETED',
  'ATTENDANCE_CHECKIN',
  'ATTENDANCE_CHECKOUT',
  'ATTENDANCE_CONFIRMED',
  'COMPANY_UPDATED',
];

router.get('/audit', async (req, res) => {
  try {
    const result = await req.db.query(
      `SELECT al.id, al.company_id, c.name AS company_name, al.action, al.entity_type,
              al.entity_name, al.old_values, al.new_values,
              al.username AS changed_by, al.role AS changer_role, al.created_at
         FROM public.audit_logs al
         LEFT JOIN public.companies c ON c.company_id = al.company_id
        WHERE al.action = ANY($1)
        ORDER BY al.created_at DESC
        LIMIT 200`,
      [SUPER_AUDIT_ACTIONS]
    );
    return res.json({ ok: true, audit: result.rows });
  } catch (err) {
    console.error('GET /super/audit error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

/**
 * PATCH /api/super/companies/:id
 */
router.patch('/companies/:id', async (req, res) => {
  try {
    const companyId = Number(req.params.id);
    if (!companyId) return res.status(400).json({ ok: false, error: 'INVALID_ID' });

    const { name, plan, status, admin_email, phone } = req.body || {};

    const allowedStatuses = ['ACTIVE', 'SUSPENDED', 'TRIAL'];
    const allowedPlans = ['BASIC', 'PRO', 'ENTERPRISE'];

    if (status && !allowedStatuses.includes(String(status).toUpperCase()))
      return res.status(400).json({ ok: false, error: 'INVALID_STATUS', allowed: allowedStatuses });
    if (plan && !allowedPlans.includes(String(plan).toUpperCase()))
      return res.status(400).json({ ok: false, error: 'INVALID_PLAN', allowed: allowedPlans });

    const upd = await req.db.query(
      `UPDATE public.companies SET
         name        = COALESCE($1, name),
         plan        = COALESCE($2, plan),
         status      = COALESCE($3, status),
         admin_email = COALESCE($4, admin_email),
         phone       = COALESCE($5, phone),
         updated_at  = NOW()
       WHERE company_id = $6
       RETURNING *`,
      [
        name ? String(name).trim() : null,
        plan ? String(plan).toUpperCase() : null,
        status ? String(status).toUpperCase() : null,
        admin_email || null,
        phone || null,
        companyId,
      ]
    );

    if (!upd.rows.length) return res.status(404).json({ ok: false, error: 'COMPANY_NOT_FOUND' });

    return res.json({ ok: true, company: upd.rows[0] });
  } catch (err) {
    console.error('PATCH /super/companies/:id error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

/**
 * POST /api/super/companies/:id/suspend
 */
router.post('/companies/:id/suspend', async (req, res) => {
  try {
    const companyId = Number(req.params.id);
    if (!companyId) return res.status(400).json({ ok: false, error: 'INVALID_ID' });

    const upd = await req.db.query(
      `UPDATE public.companies SET status = 'SUSPENDED', updated_at = NOW()
       WHERE company_id = $1 RETURNING company_id, name, status`,
      [companyId]
    );
    if (!upd.rows.length) return res.status(404).json({ ok: false, error: 'COMPANY_NOT_FOUND' });

    await audit(req.db, req, {
      action: ACTIONS.COMPANY_SUSPENDED,
      entity_type: 'company',
      entity_id: companyId,
      entity_name: upd.rows[0].name,
    });

    return res.json({ ok: true, message: 'Company suspended', company: upd.rows[0] });
  } catch (err) {
    console.error('POST /super/companies/:id/suspend error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

/**
 * POST /api/super/companies/:id/activate
 */
router.post('/companies/:id/activate', async (req, res) => {
  try {
    const companyId = Number(req.params.id);
    if (!companyId) return res.status(400).json({ ok: false, error: 'INVALID_ID' });

    const upd = await req.db.query(
      `UPDATE public.companies SET status = 'ACTIVE', updated_at = NOW()
       WHERE company_id = $1 RETURNING company_id, name, status`,
      [companyId]
    );
    if (!upd.rows.length) return res.status(404).json({ ok: false, error: 'COMPANY_NOT_FOUND' });

    await audit(req.db, req, {
      action: ACTIONS.COMPANY_ACTIVATED,
      entity_type: 'company',
      entity_id: companyId,
      entity_name: upd.rows[0].name,
    });

    return res.json({ ok: true, message: 'Company activated', company: upd.rows[0] });
  } catch (err) {
    console.error('POST /super/companies/:id/activate error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

module.exports = router;
