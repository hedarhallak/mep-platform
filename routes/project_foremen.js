"use strict";

/**
 * routes/project_foremen.js
 *
 * GET    /api/project-foremen/:project_id          → list foremen for a project
 * POST   /api/project-foremen/:project_id          → assign foreman to trade on project
 * DELETE /api/project-foremen/:project_id/:trade   → remove foreman from trade
 */

const router  = require("express").Router();
const { pool } = require("../db");
const { normalizeRole } = require("../middleware/roles");

function requireRoles(allowed) {
  const normalized = allowed.map(r => normalizeRole(r));
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ ok: false, error: "UNAUTHENTICATED" });
    const userRole = normalizeRole(req.user.role);
    if (userRole === "SUPER_ADMIN") return next();
    if (!normalized.includes(userRole))
      return res.status(403).json({ ok: false, error: "FORBIDDEN" });
    return next();
  };
}
const ADMIN_ONLY = requireRoles(["COMPANY_ADMIN", "ADMIN"]);

// ── GET /api/project-foremen/:project_id ─────────────────────
router.get("/:project_id", async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const projectId = Number(req.params.project_id);

    const { rows } = await pool.query(
      `SELECT
         pf.id,
         pf.trade_code,
         pf.employee_id,
         ep.full_name   AS foreman_name,
         ep.trade_code  AS foreman_trade,
         ep.rank_code,
         ep.contact_email,
         au.phone       AS phone
       FROM public.project_foremen pf
       JOIN public.employee_profiles ep ON ep.employee_id = pf.employee_id
       LEFT JOIN public.app_users au    ON au.employee_id = pf.employee_id
       WHERE pf.project_id = $1 AND pf.company_id = $2
       ORDER BY pf.trade_code`,
      [projectId, companyId]
    );

    return res.json({ ok: true, foremen: rows });
  } catch (err) {
    console.error("GET /project-foremen error:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

// ── POST /api/project-foremen/:project_id ────────────────────
// Body: { employee_id, trade_code }
router.post("/:project_id", ADMIN_ONLY, async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const projectId = Number(req.params.project_id);
    const { employee_id, trade_code } = req.body || {};

    if (!employee_id) return res.status(400).json({ ok: false, error: "EMPLOYEE_REQUIRED" });
    if (!trade_code)  return res.status(400).json({ ok: false, error: "TRADE_REQUIRED" });

    // Verify project belongs to company
    const proj = await pool.query(
      `SELECT id FROM public.projects WHERE id = $1 AND company_id = $2 LIMIT 1`,
      [projectId, companyId]
    );
    if (!proj.rows.length)
      return res.status(404).json({ ok: false, error: "PROJECT_NOT_FOUND" });

    // Verify employee belongs to company
    const emp = await pool.query(
      `SELECT ep.employee_id, ep.full_name, ep.contact_email
       FROM public.employee_profiles ep
       JOIN public.app_users au ON au.employee_id = ep.employee_id
       WHERE ep.employee_id = $1 AND au.company_id = $2 LIMIT 1`,
      [employee_id, companyId]
    );
    if (!emp.rows.length)
      return res.status(404).json({ ok: false, error: "EMPLOYEE_NOT_FOUND" });

    // Upsert — replace existing foreman for this trade on this project
    const { rows } = await pool.query(
      `INSERT INTO public.project_foremen (project_id, employee_id, trade_code, company_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (project_id, trade_code)
       DO UPDATE SET employee_id = EXCLUDED.employee_id, updated_at = NOW()
       RETURNING *`,
      [projectId, employee_id, trade_code.toUpperCase(), companyId]
    );

    // Also update rank_code on employee_profiles to FOREMAN
    await pool.query(
      `UPDATE public.employee_profiles SET rank_code = 'FOREMAN' WHERE employee_id = $1`,
      [employee_id]
    );

    return res.status(201).json({ ok: true, foreman: rows[0] });
  } catch (err) {
    console.error("POST /project-foremen error:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

// ── DELETE /api/project-foremen/:project_id/:trade ───────────
router.delete("/:project_id/:trade", ADMIN_ONLY, async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const projectId = Number(req.params.project_id);
    const trade     = req.params.trade.toUpperCase();

    const { rowCount } = await pool.query(
      `DELETE FROM public.project_foremen
       WHERE project_id = $1 AND trade_code = $2 AND company_id = $3`,
      [projectId, trade, companyId]
    );

    if (!rowCount)
      return res.status(404).json({ ok: false, error: "NOT_FOUND" });

    return res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /project-foremen error:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

module.exports = router;
