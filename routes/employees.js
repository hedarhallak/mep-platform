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
const { can } = require("../middleware/permissions");

router.use(auth);

// ── GET /api/employees ────────────────────────────────────────
// Returns all employees for the current company
// SUPER_ADMIN must pass ?company_id=X or gets all companies
router.get("/", can("employees.view"), async (req, res) => {
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
    const conditions = [];

    // Show inactive employees too unless filtered
    const activeFilter = req.query.active;
    if (activeFilter === 'true')  conditions.push("e.is_active = true");
    if (activeFilter === 'false') conditions.push("e.is_active = false");

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
router.get("/:id", can("employees.view"), async (req, res) => {
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

// ── PATCH /api/employees/:id ─────────────────────────────────
// Update employee info — admin can edit name, email, role, trade, etc.
router.patch("/:id", can("employees.edit"), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const employeeId = Number(req.params.id);
    const companyId  = req.user.company_id ? Number(req.user.company_id) : null;
    const userRole   = req.user.role;

    if (isNaN(employeeId)) {
      return res.status(400).json({ ok: false, error: "INVALID_ID" });
    }

    // Verify employee belongs to same company
    const empCheck = await client.query(
      `SELECT e.id, e.company_id, e.first_name, e.last_name,
              au.id AS user_id, au.role AS current_app_role
       FROM public.employees e
       LEFT JOIN public.app_users au ON au.employee_id = e.id
       WHERE e.id = $1 ${userRole !== "SUPER_ADMIN" && companyId ? "AND e.company_id = $2" : ""}
       LIMIT 1`,
      userRole !== "SUPER_ADMIN" && companyId ? [employeeId, companyId] : [employeeId]
    );

    if (!empCheck.rows.length) {
      return res.status(404).json({ ok: false, error: "EMPLOYEE_NOT_FOUND" });
    }

    const existing = empCheck.rows[0];
    const {
      first_name, last_name, contact_email,
      employee_profile_type, trade_code, rank_code,
      phone, home_address, city, postal_code,
      emergency_contact_name, emergency_contact_phone, emergency_contact_relationship,
      hire_date, termination_date, is_active
    } = req.body;

    // ── Update employees table ──
    const empUpdates = [];
    const empParams  = [];

    if (first_name !== undefined) {
      empParams.push(first_name.trim());
      empUpdates.push(`first_name = $${empParams.length}`);
    }
    if (last_name !== undefined) {
      empParams.push(last_name.trim());
      empUpdates.push(`last_name = $${empParams.length}`);
    }
    if (contact_email !== undefined) {
      empParams.push(contact_email.toLowerCase().trim());
      empUpdates.push(`contact_email = $${empParams.length}`);
    }
    if (employee_profile_type !== undefined) {
      empParams.push(employee_profile_type);
      empUpdates.push(`employee_profile_type = $${empParams.length}`);
    }
    if (hire_date !== undefined) {
      empParams.push(hire_date || null);
      empUpdates.push(`hire_date = $${empParams.length}`);
    }
    if (termination_date !== undefined) {
      empParams.push(termination_date || null);
      empUpdates.push(`termination_date = $${empParams.length}`);
    }
    if (is_active !== undefined) {
      empParams.push(is_active);
      empUpdates.push(`is_active = $${empParams.length}`);
    }

    if (empUpdates.length) {
      empParams.push(employeeId);
      await client.query(
        `UPDATE public.employees SET ${empUpdates.join(', ')} WHERE id = $${empParams.length}`,
        empParams
      );
    }

    // ── Update employee_profiles table ──
    const profUpdates = [];
    const profParams  = [];

    // Sync full_name if name changed
    if (first_name !== undefined || last_name !== undefined) {
      const fn = first_name?.trim() || existing.first_name;
      const ln = last_name?.trim()  || existing.last_name;
      profParams.push(`${fn} ${ln}`.trim());
      profUpdates.push(`full_name = $${profParams.length}`);
    }
    if (trade_code !== undefined) {
      profParams.push(trade_code || null);
      profUpdates.push(`trade_code = $${profParams.length}`);
    }
    if (rank_code !== undefined) {
      profParams.push(rank_code || null);
      profUpdates.push(`rank_code = $${profParams.length}`);
    }
    if (phone !== undefined) {
      profParams.push(phone?.trim() || null);
      profUpdates.push(`phone = $${profParams.length}`);
    }
    if (home_address !== undefined) {
      profParams.push(home_address || null);
      profUpdates.push(`home_address = $${profParams.length}`);
    }
    if (city !== undefined) {
      profParams.push(city || null);
      profUpdates.push(`city = $${profParams.length}`);
    }
    if (postal_code !== undefined) {
      profParams.push(postal_code || null);
      profUpdates.push(`postal_code = $${profParams.length}`);
    }
    if (emergency_contact_name !== undefined) {
      profParams.push(emergency_contact_name || null);
      profUpdates.push(`emergency_contact_name = $${profParams.length}`);
    }
    if (emergency_contact_phone !== undefined) {
      profParams.push(emergency_contact_phone || null);
      profUpdates.push(`emergency_contact_phone = $${profParams.length}`);
    }
    if (emergency_contact_relationship !== undefined) {
      profParams.push(emergency_contact_relationship || null);
      profUpdates.push(`emergency_contact_relationship = $${profParams.length}`);
    }

    if (profUpdates.length) {
      // Check if profile exists
      const profileExists = await client.query(
        `SELECT 1 FROM public.employee_profiles WHERE employee_id = $1 LIMIT 1`,
        [employeeId]
      );

      if (profileExists.rows.length) {
        profParams.push(employeeId);
        await client.query(
          `UPDATE public.employee_profiles SET ${profUpdates.join(', ')} WHERE employee_id = $${profParams.length}`,
          profParams
        );
      } else {
        // Create profile if it doesn't exist
        const fn = first_name?.trim() || existing.first_name;
        const ln = last_name?.trim()  || existing.last_name;
        await client.query(
          `INSERT INTO public.employee_profiles (employee_id, full_name, trade_code, rank_code, phone)
           VALUES ($1, $2, $3, $4, $5)`,
          [employeeId, `${fn} ${ln}`.trim(), trade_code || null, rank_code || null, phone?.trim() || null]
        );
      }
    }

    // ── Sync role to app_users if changed ──
    if (employee_profile_type !== undefined && existing.user_id) {
      await client.query(
        `UPDATE public.app_users SET role = $1 WHERE id = $2`,
        [employee_profile_type, existing.user_id]
      );
    }

    // ── Sync is_active to app_users if changed ──
    if (is_active !== undefined && existing.user_id) {
      await client.query(
        `UPDATE public.app_users SET is_active = $1 WHERE id = $2`,
        [is_active, existing.user_id]
      );
    }

    await client.query("COMMIT");

    return res.json({ ok: true, message: "Employee updated successfully" });

  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("PATCH /api/employees/:id error:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR", message: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
