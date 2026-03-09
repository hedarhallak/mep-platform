"use strict";

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
 */

const express = require("express");
const router  = express.Router();
const { pool }    = require("../db");
const { hashPin } = require("../lib/auth_utils");
const { sendAdminWelcome }   = require("../lib/email");
const { audit, ACTIONS }     = require("../lib/audit");

// ── Helpers ──────────────────────────────────────────────

function generateCompanyCode(name) {
  const prefix = name
    .replace(/[^a-zA-Z]/g, "")
    .toUpperCase()
    .slice(0, 3)
    .padEnd(3, "X");
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}${suffix}`;
}

async function uniqueCompanyCode(pool, name) {
  for (let i = 0; i < 10; i++) {
    const code   = generateCompanyCode(name);
    const exists = await pool.query(
      "SELECT 1 FROM public.companies WHERE company_code = $1 LIMIT 1",
      [code]
    );
    if (!exists.rows.length) return code;
  }
  return "CO" + Date.now().toString(36).toUpperCase();
}

// ── Routes ───────────────────────────────────────────────

/**
 * GET /api/super/stats
 */
router.get("/stats", async (req, res) => {
  try {
    const { rows } = await pool.query(`
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
    console.error("GET /super/stats error:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

/**
 * GET /api/super/companies
 */
router.get("/companies", async (req, res) => {
  try {
    const { rows } = await pool.query(`
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
    console.error("GET /super/companies error:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

/**
 * GET /api/super/companies/:id
 */
router.get("/companies/:id", async (req, res) => {
  try {
    const companyId = Number(req.params.id);
    if (!companyId) return res.status(400).json({ ok: false, error: "INVALID_ID" });

    const { rows } = await pool.query(
      "SELECT * FROM public.companies WHERE company_id = $1 LIMIT 1",
      [companyId]
    );
    if (!rows.length) return res.status(404).json({ ok: false, error: "COMPANY_NOT_FOUND" });

    const admins = await pool.query(
      `SELECT id, username, role, is_active, created_at
       FROM public.app_users
       WHERE company_id = $1 AND role = 'ADMIN'
       ORDER BY created_at`,
      [companyId]
    );

    return res.json({ ok: true, company: rows[0], admins: admins.rows });
  } catch (err) {
    console.error("GET /super/companies/:id error:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

/**
 * POST /api/super/companies
 * Body: name, admin_username, admin_pin, plan?, admin_email?, phone?
 */
router.post("/companies", async (req, res) => {
  const client = await pool.connect();
  try {
    const { name, admin_username, admin_pin, plan, admin_email, phone } = req.body || {};

    if (!name || !String(name).trim())
      return res.status(400).json({ ok: false, error: "COMPANY_NAME_REQUIRED" });
    if (!admin_username || !String(admin_username).trim())
      return res.status(400).json({ ok: false, error: "ADMIN_USERNAME_REQUIRED" });
    if (!admin_pin)
      return res.status(400).json({ ok: false, error: "ADMIN_PIN_REQUIRED" });

    const pinStr = String(admin_pin);
    if (pinStr.length < 4 || pinStr.length > 8)
      return res.status(400).json({ ok: false, error: "INVALID_PIN_FORMAT", message: "PIN must be 4-8 characters" });

    const allowedPlans = ["BASIC", "PRO", "ENTERPRISE"];
    const planValue    = plan ? String(plan).toUpperCase() : "BASIC";
    if (!allowedPlans.includes(planValue))
      return res.status(400).json({ ok: false, error: "INVALID_PLAN", allowed: allowedPlans });

    const companyName   = String(name).trim();
    const adminUsername = String(admin_username).trim().toLowerCase();

    const userExists = await pool.query(
      "SELECT 1 FROM public.app_users WHERE username = $1 LIMIT 1",
      [adminUsername]
    );
    if (userExists.rows.length)
      return res.status(409).json({ ok: false, error: "USERNAME_TAKEN" });

    await client.query("BEGIN");

    const companyCode = await uniqueCompanyCode(pool, companyName);
    const companyIns  = await client.query(
      `INSERT INTO public.companies
         (name, company_code, status, plan, admin_email, phone, created_at, updated_at)
       VALUES ($1, $2, 'ACTIVE', $3, $4, $5, NOW(), NOW())
       RETURNING *`,
      [companyName, companyCode, planValue, admin_email || null, phone || null]
    );
    const company = companyIns.rows[0];

    const pinHash = await hashPin(pinStr);
    const userIns = await client.query(
      `INSERT INTO public.app_users
         (username, pin_hash, company_id, role, is_active, must_change_pin, is_temp_pin)
       VALUES ($1, $2, $3, 'ADMIN', true, true, true)
       RETURNING id, username, role`,
      [adminUsername, pinHash, company.company_id]
    );
    const adminUser = userIns.rows[0];

    await client.query("COMMIT");

    // Send welcome email if admin_email provided (non-blocking)
    let emailSent = false;
    if (admin_email) {
      emailSent = await sendAdminWelcome({
        to:          admin_email,
        companyName: company.name,
        companyCode: company.company_code,
        username:    adminUsername,
        tempPin:     pinStr,
      });
    }

    await audit(pool, req, {
      action:      ACTIONS.COMPANY_CREATED,
      entity_type: "company",
      entity_id:   company.company_id,
      entity_name: company.name,
      new_values:  { plan: company.plan, admin_username: adminUsername },
    });

    return res.status(201).json({
      ok: true,
      message: "Company and admin account created successfully",
      email_sent: emailSent,
      company: {
        id:           company.company_id,
        name:         company.name,
        company_code: company.company_code,
        status:       company.status,
        plan:         company.plan,
        created_at:   company.created_at,
      },
      admin: {
        id:              adminUser.id,
        username:        adminUser.username,
        role:            adminUser.role,
        must_change_pin: true,
        note:            "Admin must change PIN on first login",
      },
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("POST /super/companies error:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR", message: err.message });
  } finally {
    client.release();
  }
});

/**
 * PATCH /api/super/companies/:id
 */
router.patch("/companies/:id", async (req, res) => {
  try {
    const companyId = Number(req.params.id);
    if (!companyId) return res.status(400).json({ ok: false, error: "INVALID_ID" });

    const { name, plan, status, admin_email, phone } = req.body || {};

    const allowedStatuses = ["ACTIVE", "SUSPENDED", "TRIAL"];
    const allowedPlans    = ["BASIC", "PRO", "ENTERPRISE"];

    if (status && !allowedStatuses.includes(String(status).toUpperCase()))
      return res.status(400).json({ ok: false, error: "INVALID_STATUS", allowed: allowedStatuses });
    if (plan && !allowedPlans.includes(String(plan).toUpperCase()))
      return res.status(400).json({ ok: false, error: "INVALID_PLAN", allowed: allowedPlans });

    const upd = await pool.query(
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
        name   ? String(name).trim()          : null,
        plan   ? String(plan).toUpperCase()   : null,
        status ? String(status).toUpperCase() : null,
        admin_email || null,
        phone       || null,
        companyId,
      ]
    );

    if (!upd.rows.length)
      return res.status(404).json({ ok: false, error: "COMPANY_NOT_FOUND" });

    return res.json({ ok: true, company: upd.rows[0] });
  } catch (err) {
    console.error("PATCH /super/companies/:id error:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

/**
 * POST /api/super/companies/:id/suspend
 */
router.post("/companies/:id/suspend", async (req, res) => {
  try {
    const companyId = Number(req.params.id);
    if (!companyId) return res.status(400).json({ ok: false, error: "INVALID_ID" });

    const upd = await pool.query(
      `UPDATE public.companies SET status = 'SUSPENDED', updated_at = NOW()
       WHERE company_id = $1 RETURNING company_id, name, status`,
      [companyId]
    );
    if (!upd.rows.length)
      return res.status(404).json({ ok: false, error: "COMPANY_NOT_FOUND" });

    await audit(pool, req, {
      action:      ACTIONS.COMPANY_SUSPENDED,
      entity_type: "company",
      entity_id:   companyId,
      entity_name: upd.rows[0].name,
    });

    return res.json({ ok: true, message: "Company suspended", company: upd.rows[0] });
  } catch (err) {
    console.error("POST /super/companies/:id/suspend error:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

/**
 * POST /api/super/companies/:id/activate
 */
router.post("/companies/:id/activate", async (req, res) => {
  try {
    const companyId = Number(req.params.id);
    if (!companyId) return res.status(400).json({ ok: false, error: "INVALID_ID" });

    const upd = await pool.query(
      `UPDATE public.companies SET status = 'ACTIVE', updated_at = NOW()
       WHERE company_id = $1 RETURNING company_id, name, status`,
      [companyId]
    );
    if (!upd.rows.length)
      return res.status(404).json({ ok: false, error: "COMPANY_NOT_FOUND" });

    await audit(pool, req, {
      action:      ACTIONS.COMPANY_ACTIVATED,
      entity_type: "company",
      entity_id:   companyId,
      entity_name: upd.rows[0].name,
    });

    return res.json({ ok: true, message: "Company activated", company: upd.rows[0] });
  } catch (err) {
    console.error("POST /super/companies/:id/activate error:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

module.exports = router;
