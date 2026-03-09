"use strict";

/**
 * routes/projects.js
 * Project management — company isolated
 *
 * GET    /api/projects                  — list all projects for company
 * GET    /api/projects/map              — projects with coordinates
 * GET    /api/projects/meta             — trade_types + project_statuses + clients (for dropdowns)
 * GET    /api/projects/:id              — single project details
 * POST   /api/projects                  — create project (ADMIN only)
 * PATCH  /api/projects/:id              — update project (ADMIN only)
 * DELETE /api/projects/:id              — delete project (ADMIN only, only if no assignments)
 *
 * GET    /api/projects/clients          — list clients for company
 * POST   /api/projects/clients          — create client (ADMIN only)
 */

const express = require("express");
const router  = express.Router();
const { pool }           = require("../db");
const { audit, ACTIONS } = require("../lib/audit");

// ── Helpers ──────────────────────────────────────────────

function requireRoles(allowed) {
  return (req, res, next) => {
    const role = req.user?.role;
    if (!allowed.includes(role)) {
      return res.status(403).json({ ok: false, error: "FORBIDDEN", required: allowed });
    }
    return next();
  };
}

const ADMIN_ONLY = requireRoles(["ADMIN"]);
const ADMIN_PM   = requireRoles(["ADMIN", "PM"]);

// ── GET /api/projects/meta ────────────────────────────────
// Returns dropdown data: trade_types, project_statuses, clients
router.get("/meta", async (req, res) => {
  try {
    const companyId = req.user.company_id;

    const [tradeTypes, statuses, clients] = await Promise.all([
      pool.query("SELECT id, code, name FROM public.trade_types WHERE is_active = true ORDER BY name"),
      pool.query("SELECT id, code, name, is_final FROM public.project_statuses ORDER BY id"),
      pool.query(
        "SELECT id, client_code, client_name, phone, email FROM public.clients WHERE company_id = $1 AND is_active = true ORDER BY client_name",
        [companyId]
      ),
    ]);

    return res.json({
      ok:           true,
      trade_types:  tradeTypes.rows,
      statuses:     statuses.rows,
      clients:      clients.rows,
    });
  } catch (err) {
    console.error("GET /api/projects/meta error:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

// ── GET /api/projects/clients ─────────────────────────────
router.get("/clients", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, client_code, client_name, client_type, phone, email, address, is_active, created_at
       FROM public.clients
       WHERE company_id = $1
       ORDER BY client_name`,
      [req.user.company_id]
    );
    return res.json({ ok: true, clients: rows });
  } catch (err) {
    console.error("GET /api/projects/clients error:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

// ── POST /api/projects/clients ────────────────────────────
router.post("/clients", ADMIN_ONLY, async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const { client_name, client_type, phone, email, address } = req.body || {};

    if (!client_name || !String(client_name).trim())
      return res.status(400).json({ ok: false, error: "CLIENT_NAME_REQUIRED" });

    // Generate client_code: CLI-XXXX
    const countRes = await pool.query(
      "SELECT COUNT(*) FROM public.clients WHERE company_id = $1",
      [companyId]
    );
    const seq         = parseInt(countRes.rows[0].count) + 1;
    const client_code = "CLI-" + String(seq).padStart(4, "0");

    const { rows } = await pool.query(
      `INSERT INTO public.clients
         (client_code, client_name, client_type, phone, email, address, company_id, is_active, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true, NOW())
       RETURNING *`,
      [
        client_code,
        String(client_name).trim(),
        client_type || null,
        phone       || null,
        email       || null,
        address     || null,
        companyId,
      ]
    );

    return res.status(201).json({ ok: true, client: rows[0] });
  } catch (err) {
    console.error("POST /api/projects/clients error:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

// ── GET /api/projects ─────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const { status, trade } = req.query;
    const companyId = req.user.company_id;

    let query = `
      SELECT
        p.id,
        p.project_code,
        p.project_name,
        p.site_address,
        p.site_lat,
        p.site_lng,
        p.start_date,
        p.end_date,
        p.created_at,
        tt.code  AS trade_code,
        tt.name  AS trade_name,
        ps.code  AS status_code,
        ps.name  AS status_name,
        ps.is_final,
        c.client_name,
        COUNT(DISTINCT a.id) AS assignment_count
      FROM public.projects p
      LEFT JOIN public.trade_types      tt ON tt.id = p.trade_type_id
      LEFT JOIN public.project_statuses ps ON ps.id = p.status_id
      LEFT JOIN public.clients           c ON c.id  = p.client_id
      LEFT JOIN public.assignments       a ON a.project_id = p.id
      WHERE p.company_id = $1
    `;

    const params = [companyId];

    if (status) {
      params.push(String(status).toUpperCase());
      query += ` AND ps.code = $${params.length}`;
    }

    if (trade) {
      params.push(String(trade).toUpperCase());
      query += ` AND tt.code = $${params.length}`;
    }

    query += " GROUP BY p.id, tt.code, tt.name, ps.code, ps.name, ps.is_final, c.client_name ORDER BY p.created_at DESC";

    const { rows } = await pool.query(query, params);
    return res.json({ ok: true, projects: rows });
  } catch (err) {
    console.error("GET /api/projects error:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

// ── GET /api/projects/map ─────────────────────────────────
router.get("/map", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, project_code, project_name, site_address, site_lat, site_lng,
              tt.name AS trade_name, ps.name AS status_name
       FROM public.projects p
       LEFT JOIN public.trade_types      tt ON tt.id = p.trade_type_id
       LEFT JOIN public.project_statuses ps ON ps.id = p.status_id
       WHERE p.company_id = $1
         AND p.site_lat IS NOT NULL AND p.site_lng IS NOT NULL
       ORDER BY p.project_code`,
      [req.user.company_id]
    );
    return res.json({ ok: true, projects: rows });
  } catch (err) {
    console.error("GET /api/projects/map error:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

// ── GET /api/projects/:id ─────────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    const projectId = Number(req.params.id);
    const companyId = req.user.company_id;

    if (!projectId) return res.status(400).json({ ok: false, error: "INVALID_ID" });

    const { rows } = await pool.query(
      `SELECT
         p.*,
         tt.code AS trade_code, tt.name AS trade_name,
         ps.code AS status_code, ps.name AS status_name, ps.is_final,
         c.client_name, c.client_code, c.phone AS client_phone, c.email AS client_email
       FROM public.projects p
       LEFT JOIN public.trade_types      tt ON tt.id = p.trade_type_id
       LEFT JOIN public.project_statuses ps ON ps.id = p.status_id
       LEFT JOIN public.clients           c ON c.id  = p.client_id
       WHERE p.id = $1 AND p.company_id = $2
       LIMIT 1`,
      [projectId, companyId]
    );

    if (!rows.length)
      return res.status(404).json({ ok: false, error: "PROJECT_NOT_FOUND" });

    return res.json({ ok: true, project: rows[0] });
  } catch (err) {
    console.error("GET /api/projects/:id error:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

// ── POST /api/projects ────────────────────────────────────
router.post("/", ADMIN_ONLY, async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const {
      project_name,
      trade_type_id,
      status_id,
      site_address,
      start_date,
      end_date,
      client_id,
    } = req.body || {};

    if (!project_name || !String(project_name).trim())
      return res.status(400).json({ ok: false, error: "PROJECT_NAME_REQUIRED" });
    if (!trade_type_id)
      return res.status(400).json({ ok: false, error: "TRADE_TYPE_REQUIRED" });

    // Validate trade_type belongs to platform
    const trade = await pool.query(
      "SELECT id FROM public.trade_types WHERE id = $1 AND is_active = true LIMIT 1",
      [trade_type_id]
    );
    if (!trade.rows.length)
      return res.status(400).json({ ok: false, error: "INVALID_TRADE_TYPE" });

    // Default status = PLANNED (id:1) if not provided
    const resolvedStatusId = status_id || 1;

    const status = await pool.query(
      "SELECT id FROM public.project_statuses WHERE id = $1 LIMIT 1",
      [resolvedStatusId]
    );
    if (!status.rows.length)
      return res.status(400).json({ ok: false, error: "INVALID_STATUS" });

    // Validate client belongs to this company
    if (client_id) {
      const client = await pool.query(
        "SELECT id FROM public.clients WHERE id = $1 AND company_id = $2 LIMIT 1",
        [client_id, companyId]
      );
      if (!client.rows.length)
        return res.status(400).json({ ok: false, error: "INVALID_CLIENT" });
    }

    // Generate project_code: PRJ-XXXX
    // Use MAX to avoid duplicate codes when projects are deleted
    const seqRes = await pool.query(
      `SELECT COALESCE(MAX(CAST(SUBSTRING(project_code FROM 5) AS INTEGER)), 0) + 1 AS next_seq
       FROM public.projects
       WHERE company_id = $1 AND project_code ~ '^PRJ-[0-9]+$'`,
      [companyId]
    );
    const seq          = seqRes.rows[0].next_seq;
    const project_code = "PRJ-" + String(seq).padStart(4, "0");

    const { rows } = await pool.query(
      `INSERT INTO public.projects
         (project_code, project_name, trade_type_id, status_id, site_address,
          start_date, end_date, client_id, company_id, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
       RETURNING *`,
      [
        project_code,
        String(project_name).trim(),
        trade_type_id,
        resolvedStatusId,
        site_address || null,
        start_date   || null,
        end_date     || null,
        client_id    || null,
        companyId,
      ]
    );

    await audit(pool, req, {
      action:      ACTIONS.PROJECT_CREATED,
      entity_type: "project",
      entity_id:   rows[0].id,
      entity_name: rows[0].project_name,
      new_values:  rows[0],
    });

    return res.status(201).json({ ok: true, project: rows[0] });
  } catch (err) {
    console.error("POST /api/projects error:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

// ── PATCH /api/projects/:id ───────────────────────────────
router.patch("/:id", ADMIN_ONLY, async (req, res) => {
  try {
    const projectId = Number(req.params.id);
    const companyId = req.user.company_id;

    if (!projectId) return res.status(400).json({ ok: false, error: "INVALID_ID" });

    // Verify ownership
    const exists = await pool.query(
      "SELECT id FROM public.projects WHERE id = $1 AND company_id = $2 LIMIT 1",
      [projectId, companyId]
    );
    if (!exists.rows.length)
      return res.status(404).json({ ok: false, error: "PROJECT_NOT_FOUND" });

    const {
      project_name,
      trade_type_id,
      status_id,
      site_address,
      site_lat,
      site_lng,
      start_date,
      end_date,
      client_id,
    } = req.body || {};

    const { rows } = await pool.query(
      `UPDATE public.projects SET
         project_name  = COALESCE($1, project_name),
         trade_type_id = COALESCE($2, trade_type_id),
         status_id     = COALESCE($3, status_id),
         site_address  = COALESCE($4, site_address),
         site_lat      = COALESCE($5, site_lat),
         site_lng      = COALESCE($6, site_lng),
         start_date    = COALESCE($7, start_date),
         end_date      = COALESCE($8, end_date),
         client_id     = COALESCE($9, client_id)
       WHERE id = $10 AND company_id = $11
       RETURNING *`,
      [
        project_name  ? String(project_name).trim() : null,
        trade_type_id || null,
        status_id     || null,
        site_address  || null,
        site_lat      ?? null,
        site_lng      ?? null,
        start_date    || null,
        end_date      || null,
        client_id     || null,
        projectId,
        companyId,
      ]
    );

    await audit(pool, req, {
      action:      ACTIONS.PROJECT_UPDATED,
      entity_type: "project",
      entity_id:   rows[0].id,
      entity_name: rows[0].project_name,
      new_values:  req.body,
    });

    return res.json({ ok: true, project: rows[0] });
  } catch (err) {
    console.error("PATCH /api/projects/:id error:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

// ── DELETE /api/projects/:id ──────────────────────────────
router.delete("/:id", ADMIN_ONLY, async (req, res) => {
  try {
    const projectId = Number(req.params.id);
    const companyId = req.user.company_id;

    if (!projectId) return res.status(400).json({ ok: false, error: "INVALID_ID" });

    // Verify ownership
    const exists = await pool.query(
      "SELECT id FROM public.projects WHERE id = $1 AND company_id = $2 LIMIT 1",
      [projectId, companyId]
    );
    if (!exists.rows.length)
      return res.status(404).json({ ok: false, error: "PROJECT_NOT_FOUND" });

    // Block delete if project has assignments
    const assigned = await pool.query(
      "SELECT COUNT(*) FROM public.assignments WHERE project_id = $1",
      [projectId]
    );
    if (parseInt(assigned.rows[0].count) > 0)
      return res.status(409).json({
        ok:    false,
        error: "PROJECT_HAS_ASSIGNMENTS",
        message: "Cannot delete a project that has assignments. Change status to CANCELLED instead.",
      });

    // Fetch name before delete for audit
    const toDelete = await pool.query(
      "SELECT project_name FROM public.projects WHERE id = $1",
      [projectId]
    );

    await pool.query(
      "DELETE FROM public.projects WHERE id = $1 AND company_id = $2",
      [projectId, companyId]
    );

    await audit(pool, req, {
      action:      ACTIONS.PROJECT_DELETED,
      entity_type: "project",
      entity_id:   projectId,
      entity_name: toDelete.rows[0]?.project_name,
      details:     { deleted_by: req.user.username, reason: req.body?.reason || null },
    });

    return res.json({ ok: true, message: "Project deleted" });
  } catch (err) {
    console.error("DELETE /api/projects/:id error:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

module.exports = router;
