"use strict";

/**
 * routes/employees.js
 *
 * GET  /api/employees       — list employees for current company
 * GET  /api/employees/:id   — get single employee
 */

const express = require("express");
const router  = express.Router();
const { pool } = require("../db");
const auth    = require("../middleware/auth");
const { COMPANY_ADMIN_UP, TRADE_ADMIN_UP } = require("../middleware/roles");

router.use(auth);

// ── GET /api/employees ────────────────────────────────────────
// Returns all employees for the current company
// SUPER_ADMIN must pass ?company_id=X or gets all companies
router.get("/", TRADE_ADMIN_UP, async (req, res) => {
  try {
    const userRole  = req.user.role;
    const companyId = req.user.company_id ? Number(req.user.company_id) : null;

    // SUPER_ADMIN can pass ?company_id to filter, or gets all
    const filterCompanyId =
      userRole === "SUPER_ADMIN"
        ? (req.query.company_id ? Number(req.query.company_id) : null)
        : companyId;

    if (userRole !== "SUPER_ADMIN" && !filterCompanyId) {
      return res.status(403).json({ ok: false, error: "COMPANY_CONTEXT_REQUIRED" });
    }

    // Optional filters
    const search    = req.query.search?.trim()   || null;
    const roleFilter = req.query.role?.trim()    || null;
    const tradeFilter = req.query.trade?.trim()  || null;

    const params = [];
    const conditions = ["e.is_active = true"];

    if (filterCompanyId) {
      params.push(filterCompanyId);
      conditions.push(`e.company_id = $${params.length}`);
    }

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(
        e.first_name ILIKE $${params.length} OR
        e.last_name  ILIKE $${params.length} OR
        e.contact_email ILIKE $${params.length} OR
        e.employee_code ILIKE $${params.length}
      )`);
    }

    if (roleFilter) {
      params.push(roleFilter);
      conditions.push(`e.employee_profile_type = $${params.length}`);
    }

    if (tradeFilter) {
      params.push(tradeFilter);
      conditions.push(`ep.trade_code = $${params.length}`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await pool.query(
      `SELECT
         e.id,
         e.employee_code,
         e.first_name,
         e.last_name,
         e.contact_email        AS email,
         e.employee_profile_type AS role,
         e.company_id,
         e.is_active,
         e.created_at,
         ep.trade_code,
         ep.role_code,
         ep.rank_code,
         ep.full_name,
         ep.phone,
         ep.city,
         au.id                  AS user_id,
         au.username,
         au.profile_status,
         au.is_active           AS account_active,
         tt.name                AS trade_name
       FROM public.employees e
       LEFT JOIN public.employee_profiles ep ON ep.employee_id = e.id
       LEFT JOIN public.app_users         au ON au.employee_id = e.id
       LEFT JOIN public.trade_types       tt ON tt.code = ep.trade_code
       ${whereClause}
       ORDER BY e.created_at DESC`,
      params
    );

    return res.json({
      ok:        true,
      total:     result.rows.length,
      employees: result.rows,
    });

  } catch (err) {
    console.error("GET /api/employees error:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR", message: err.message });
  }
});

// ── GET /api/employees/:id ────────────────────────────────────
router.get("/:id", TRADE_ADMIN_UP, async (req, res) => {
  try {
    const employeeId = Number(req.params.id);
    const companyId  = req.user.company_id ? Number(req.user.company_id) : null;
    const userRole   = req.user.role;

    if (isNaN(employeeId)) {
      return res.status(400).json({ ok: false, error: "INVALID_ID" });
    }

    const result = await pool.query(
      `SELECT
         e.id,
         e.employee_code,
         e.first_name,
         e.last_name,
         e.contact_email        AS email,
         e.employee_profile_type AS role,
         e.company_id,
         e.is_active,
         e.created_at,
         ep.trade_code,
         ep.role_code,
         ep.rank_code,
         ep.full_name,
         ep.phone,
         ep.home_address,
         ep.city,
         ep.postal_code,
         ep.home_unit,
         ep.emergency_contact_name,
         ep.emergency_contact_phone,
         ep.emergency_contact_relationship,
         au.id                  AS user_id,
         au.username,
         au.profile_status,
         au.is_active           AS account_active,
         tt.name                AS trade_name
       FROM public.employees e
       LEFT JOIN public.employee_profiles ep ON ep.employee_id = e.id
       LEFT JOIN public.app_users         au ON au.employee_id = e.id
       LEFT JOIN public.trade_types       tt ON tt.code = ep.trade_code
       WHERE e.id = $1
         ${userRole !== "SUPER_ADMIN" && companyId ? "AND e.company_id = $2" : ""}
       LIMIT 1`,
      userRole !== "SUPER_ADMIN" && companyId ? [employeeId, companyId] : [employeeId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ ok: false, error: "EMPLOYEE_NOT_FOUND" });
    }

    return res.json({ ok: true, employee: result.rows[0] });

  } catch (err) {
    console.error("GET /api/employees/:id error:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR", message: err.message });
  }
});

module.exports = router;
