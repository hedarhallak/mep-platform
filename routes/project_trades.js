"use strict";

/**
 * routes/project_trades.js
 * Manages trades within a project
 *
 * GET    /api/project-trades/:project_id        — list trades for a project
 * POST   /api/project-trades/:project_id        — add trade to project
 * PATCH  /api/project-trades/:id                — update trade (status, admin)
 * DELETE /api/project-trades/:id                — remove trade from project
 */

const router = require("express").Router();
const pool   = require("../db");
const auth   = require("../middleware/auth");
const { can } = require("../middleware/permissions");

// All routes require authentication
router.use(auth);

// ── GET /api/project-trades/:project_id ──────────────────────
router.get("/:project_id", async (req, res) => {
  try {
    const { project_id } = req.params;
    const companyId = req.user.company_id;

    // Verify project belongs to company
    const proj = await pool.query(
      `SELECT id FROM public.projects WHERE id = $1 AND company_id = $2 LIMIT 1`,
      [project_id, companyId]
    );
    if (!proj.rows.length)
      return res.status(404).json({ ok: false, error: "PROJECT_NOT_FOUND" });

    const result = await pool.query(
      `SELECT
         pt.id,
         pt.project_id,
         pt.trade_type_id,
         tt.name  AS trade_name,
         tt.code  AS trade_code,
         pt.trade_admin_id,
         au.username AS trade_admin_username,
         ep.first_name || ' ' || ep.last_name AS trade_admin_name,
         pt.status,
         pt.notes,
         pt.created_at,
         -- Count active assignments for this trade
         (SELECT COUNT(*) FROM public.assignment_requests ar
          WHERE ar.project_trade_id = pt.id
            AND ar.status = 'APPROVED') AS assignment_count
       FROM public.project_trades pt
       JOIN public.trade_types tt ON tt.id = pt.trade_type_id
       LEFT JOIN public.app_users au ON au.id = pt.trade_admin_id
       LEFT JOIN public.employee_profiles ep ON ep.id = au.employee_id
       WHERE pt.project_id = $1 AND pt.company_id = $2
       ORDER BY tt.name`,
      [project_id, companyId]
    );

    return res.json({ ok: true, trades: result.rows });
  } catch (err) {
    console.error("GET project-trades error:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

// ── POST /api/project-trades/:project_id ─────────────────────
router.post("/:project_id", can("projects.edit"), async (req, res) => {
  try {
    const { project_id } = req.params;
    const { trade_type_id, trade_admin_id, notes } = req.body;
    const companyId = req.user.company_id;

    if (!trade_type_id)
      return res.status(400).json({ ok: false, error: "TRADE_TYPE_REQUIRED" });

    // Verify project belongs to company
    const proj = await pool.query(
      `SELECT id FROM public.projects WHERE id = $1 AND company_id = $2 LIMIT 1`,
      [project_id, companyId]
    );
    if (!proj.rows.length)
      return res.status(404).json({ ok: false, error: "PROJECT_NOT_FOUND" });

    // Verify trade type exists
    const trade = await pool.query(
      `SELECT id FROM public.trade_types WHERE id = $1 AND is_active = true LIMIT 1`,
      [trade_type_id]
    );
    if (!trade.rows.length)
      return res.status(400).json({ ok: false, error: "INVALID_TRADE_TYPE" });

    // If trade_admin_id provided, verify user belongs to company
    if (trade_admin_id) {
      const admin = await pool.query(
        `SELECT id FROM public.app_users WHERE id = $1 AND company_id = $2 LIMIT 1`,
        [trade_admin_id, companyId]
      );
      if (!admin.rows.length)
        return res.status(400).json({ ok: false, error: "INVALID_TRADE_ADMIN" });
    }

    const result = await pool.query(
      `INSERT INTO public.project_trades
         (project_id, trade_type_id, trade_admin_id, notes, company_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [project_id, trade_type_id, trade_admin_id || null, notes || null, companyId]
    );

    return res.status(201).json({ ok: true, trade: result.rows[0] });
  } catch (err) {
    if (err.code === "23505")
      return res.status(409).json({ ok: false, error: "TRADE_ALREADY_EXISTS" });
    console.error("POST project-trades error:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

// ── PATCH /api/project-trades/:id ────────────────────────────
router.patch("/:id", can("projects.edit"), async (req, res) => {
  try {
    const { id } = req.params;
    const { trade_admin_id, status, notes } = req.body;
    const companyId = req.user.company_id;

    const existing = await pool.query(
      `SELECT * FROM public.project_trades WHERE id = $1 AND company_id = $2 LIMIT 1`,
      [id, companyId]
    );
    if (!existing.rows.length)
      return res.status(404).json({ ok: false, error: "NOT_FOUND" });

    const result = await pool.query(
      `UPDATE public.project_trades SET
         trade_admin_id = COALESCE($1, trade_admin_id),
         status         = COALESCE($2, status),
         notes          = COALESCE($3, notes),
         updated_at     = NOW()
       WHERE id = $4 AND company_id = $5
       RETURNING *`,
      [trade_admin_id ?? null, status ?? null, notes ?? null, id, companyId]
    );

    return res.json({ ok: true, trade: result.rows[0] });
  } catch (err) {
    console.error("PATCH project-trades error:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

// ── DELETE /api/project-trades/:id ───────────────────────────
router.delete("/:id", can("projects.delete"), async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = req.user.company_id;

    // Check no active assignments
    const active = await pool.query(
      `SELECT COUNT(*) FROM public.assignment_requests
       WHERE project_trade_id = $1 AND status IN ('PENDING','APPROVED')`,
      [id]
    );
    if (parseInt(active.rows[0].count) > 0)
      return res.status(409).json({
        ok: false,
        error: "HAS_ACTIVE_ASSIGNMENTS",
        message: "Cannot remove trade with active assignments",
      });

    await pool.query(
      `DELETE FROM public.project_trades WHERE id = $1 AND company_id = $2`,
      [id, companyId]
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error("DELETE project-trades error:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

module.exports = router;
