"use strict";

/**
 * routes/material_requests.js
 *
 * POST   /api/materials/requests              — worker creates a request
 * GET    /api/materials/requests              — list requests (foreman sees project's requests)
 * GET    /api/materials/requests/:id          — single request with items
 * PATCH  /api/materials/requests/:id/review   — foreman updates qty splits after surplus check
 * PATCH  /api/materials/requests/:id/cancel   — cancel a pending request
 * GET    /api/materials/surplus               — list available surplus items (for smart suggestion)
 *
 * POST   /api/materials/returns               — foreman declares surplus
 * GET    /api/materials/returns               — list surplus declarations
 */

const router = require("express").Router();
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
const ANY     = requireRoles(["COMPANY_ADMIN","ADMIN","TRADE_ADMIN","PROJECT_MANAGER","PM","WORKER"]);
const FOREMAN = requireRoles(["COMPANY_ADMIN","ADMIN","TRADE_ADMIN","PROJECT_MANAGER","PM","WORKER"]);

// ── Helper: resolve employee_id from token ───────────────────
async function resolveEmployeeId(req) {
  if (req.user?.employee_id) return Number(req.user.employee_id);
  const userId = req.user?.user_id || req.user?.id;
  if (userId) {
    const r = await pool.query(
      `SELECT employee_id FROM public.app_users WHERE id = $1 LIMIT 1`, [userId]
    );
    if (r.rows[0]?.employee_id) return Number(r.rows[0].employee_id);
  }
  return null;
}

// ── POST /requests ───────────────────────────────────────────
// Worker or foreman creates a material request
router.post("/requests", ANY, async (req, res) => {
  try {
    const companyId  = req.user.company_id;
    const employeeId = await resolveEmployeeId(req);
    const { project_id, items, note } = req.body || {};

    if (!project_id) return res.status(400).json({ ok: false, error: "PROJECT_REQUIRED" });
    if (!Array.isArray(items) || !items.length)
      return res.status(400).json({ ok: false, error: "ITEMS_REQUIRED" });

    // Validate items
    for (const it of items) {
      if (!it.item_name || String(it.item_name).trim() === '')
        return res.status(400).json({ ok: false, error: "ITEM_NAME_REQUIRED" });
      if (!it.quantity || Number(it.quantity) <= 0)
        return res.status(400).json({ ok: false, error: "ITEM_QUANTITY_REQUIRED" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Find foreman on this project today
      const foremanRes = await client.query(
        `SELECT requested_for_employee_id AS foreman_employee_id
         FROM public.assignment_requests
         WHERE project_id    = $1
           AND company_id    = $2
           AND status        = 'APPROVED'
           AND assignment_role = 'FOREMAN'
           AND start_date   <= CURRENT_DATE
           AND end_date     >= CURRENT_DATE
         LIMIT 1`,
        [project_id, companyId]
      );
      const foremanId = foremanRes.rows[0]?.foreman_employee_id || null;

      const { rows: [req_row] } = await client.query(
        `INSERT INTO public.material_requests
           (company_id, project_id, requested_by, foreman_employee_id, note)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [companyId, project_id, employeeId, foremanId, note || null]
      );

      const itemRows = [];
      for (const it of items) {
        const { rows: [item] } = await client.query(
          `INSERT INTO public.material_request_items
             (request_id, item_name, item_name_raw, quantity, unit, note)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *`,
          [
            req_row.id,
            String(it.item_name).trim(),
            it.item_name_raw || null,
            Number(it.quantity),
            String(it.unit || 'pcs').trim(),
            it.note || null,
          ]
        );
        itemRows.push(item);
      }

      await client.query("COMMIT");
      return res.status(201).json({ ok: true, request: { ...req_row, items: itemRows } });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("POST /materials/requests error:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

// ── GET /requests ────────────────────────────────────────────
router.get("/requests", ANY, async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const { project_id, status } = req.query;

    let q = `
      SELECT
        mr.id, mr.status, mr.note, mr.created_at, mr.updated_at,
        mr.project_id, mr.requested_by, mr.merged_into_id,
        p.project_code, p.project_name,
        ep.full_name AS requester_name,
        (
          SELECT json_agg(i ORDER BY i.id)
          FROM public.material_request_items i
          WHERE i.request_id = mr.id
        ) AS items
      FROM public.material_requests mr
      JOIN public.projects           p  ON p.id          = mr.project_id
      JOIN public.employee_profiles  ep ON ep.employee_id = mr.requested_by
      WHERE mr.company_id = $1
    `;
    const params = [companyId];

    if (project_id) { params.push(project_id); q += ` AND mr.project_id = $${params.length}`; }
    if (status)     { params.push(status);     q += ` AND mr.status = $${params.length}`; }

    q += " ORDER BY mr.created_at DESC";

    const { rows } = await pool.query(q, params);
    return res.json({ ok: true, requests: rows });
  } catch (err) {
    console.error("GET /materials/requests error:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

// ── GET /requests/:id ────────────────────────────────────────
router.get("/requests/:id", ANY, async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const id = Number(req.params.id);

    const { rows: [request] } = await pool.query(
      `SELECT mr.*, p.project_code, p.project_name, ep.full_name AS requester_name
       FROM public.material_requests mr
       JOIN public.projects p ON p.id = mr.project_id
       JOIN public.employee_profiles ep ON ep.employee_id = mr.requested_by
       WHERE mr.id = $1 AND mr.company_id = $2`,
      [id, companyId]
    );
    if (!request) return res.status(404).json({ ok: false, error: "NOT_FOUND" });

    const { rows: items } = await pool.query(
      `SELECT * FROM public.material_request_items WHERE request_id = $1 ORDER BY id`,
      [id]
    );
    return res.json({ ok: true, request: { ...request, items } });
  } catch (err) {
    console.error("GET /materials/requests/:id error:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

// ── PATCH /requests/:id/cancel ───────────────────────────────
router.patch("/requests/:id/cancel", ANY, async (req, res) => {
  try {
    const companyId  = req.user.company_id;
    const employeeId = await resolveEmployeeId(req);
    const id = Number(req.params.id);

    const { rows: [existing] } = await pool.query(
      `SELECT * FROM public.material_requests WHERE id = $1 AND company_id = $2 LIMIT 1`,
      [id, companyId]
    );
    if (!existing) return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    if (existing.status !== 'PENDING')
      return res.status(409).json({ ok: false, error: "CANNOT_CANCEL", message: "Only PENDING requests can be cancelled." });
    // Only requester or foreman can cancel
    const userRole = normalizeRole(req.user.role);
    const isManager = ['COMPANY_ADMIN','TRADE_ADMIN','PROJECT_MANAGER'].includes(userRole);
    if (!isManager && existing.requested_by !== employeeId)
      return res.status(403).json({ ok: false, error: "FORBIDDEN" });

    const { rows: [updated] } = await pool.query(
      `UPDATE public.material_requests SET status = 'CANCELLED' WHERE id = $1 RETURNING *`,
      [id]
    );
    return res.json({ ok: true, request: updated });
  } catch (err) {
    console.error("PATCH /cancel error:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

// ── PATCH /requests/:id/review ───────────────────────────────
// Foreman sets qty_from_surplus / qty_from_supplier per item after checking surplus
router.patch("/requests/:id/review", FOREMAN, async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const id = Number(req.params.id);
    const { items, status } = req.body || {}; // items: [{id, qty_from_surplus, qty_from_supplier, surplus_source_project_id}]

    const { rows: [existing] } = await pool.query(
      `SELECT * FROM public.material_requests WHERE id = $1 AND company_id = $2 LIMIT 1`,
      [id, companyId]
    );
    if (!existing) return res.status(404).json({ ok: false, error: "NOT_FOUND" });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      if (Array.isArray(items)) {
        for (const it of items) {
          await client.query(
            `UPDATE public.material_request_items
             SET qty_from_surplus = $1, qty_from_supplier = $2, surplus_source_project_id = $3
             WHERE id = $4 AND request_id = $5`,
            [
              it.qty_from_surplus || 0,
              it.qty_from_supplier || 0,
              it.surplus_source_project_id || null,
              it.id, id
            ]
          );
          // Reduce qty_available in return items if using surplus
          if (it.qty_from_surplus > 0 && it.surplus_source_project_id) {
            await client.query(
              `UPDATE public.material_return_items ri
               SET qty_available = GREATEST(0, qty_available - $1)
               FROM public.material_returns mr
               WHERE ri.return_id = mr.id
                 AND mr.project_id = $2
                 AND mr.company_id = $3
                 AND LOWER(ri.item_name) = LOWER($4)
                 AND ri.qty_available > 0
               LIMIT 1`,
              [it.qty_from_surplus, it.surplus_source_project_id, companyId, it.item_name]
            );
          }
        }
      }

      const newStatus = status || 'REVIEWED';
      const { rows: [updated] } = await client.query(
        `UPDATE public.material_requests SET status = $1 WHERE id = $2 RETURNING *`,
        [newStatus, id]
      );

      await client.query("COMMIT");
      return res.json({ ok: true, request: updated });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("PATCH /review error:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

// ── GET /inbox ───────────────────────────────────────────────
// Returns all pending material requests assigned to this foreman
router.get("/inbox", ANY, async (req, res) => {
  try {
    const companyId  = req.user.company_id;
    const employeeId = await resolveEmployeeId(req);

    const { rows } = await pool.query(
      `SELECT
         mr.id, mr.status, mr.note, mr.created_at, mr.project_id,
         mr.requested_by, mr.foreman_employee_id,
         p.project_code, p.project_name,
         ep.full_name AS requester_name,
         ep.trade_code,
         (
           SELECT json_agg(i ORDER BY i.id)
           FROM public.material_request_items i
           WHERE i.request_id = mr.id
         ) AS items
       FROM public.material_requests mr
       JOIN public.projects          p  ON p.id          = mr.project_id
       JOIN public.employee_profiles ep ON ep.employee_id = mr.requested_by
       WHERE mr.company_id           = $1
         AND mr.foreman_employee_id  = $2
         AND mr.status NOT IN ('CANCELLED','SENT')
       ORDER BY mr.created_at DESC`,
      [companyId, employeeId]
    );

    return res.json({ ok: true, requests: rows });
  } catch (err) {
    console.error("GET /materials/inbox error:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

// ── GET /surplus ─────────────────────────────────────────────
// Returns available surplus items — used for smart suggestion
router.get("/surplus", ANY, async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const { item_name } = req.query;

    let q = `
      SELECT
        ri.id, ri.item_name, ri.quantity, ri.unit, ri.qty_available,
        mr.project_id, mr.id AS return_id,
        p.project_code, p.project_name
      FROM public.material_return_items ri
      JOIN public.material_returns mr ON mr.id = ri.return_id
      JOIN public.projects         p  ON p.id  = mr.project_id
      WHERE mr.company_id  = $1
        AND mr.status      = 'AVAILABLE'
        AND ri.qty_available > 0
    `;
    const params = [companyId];

    if (item_name) {
      params.push(`%${item_name.toLowerCase()}%`);
      q += ` AND LOWER(ri.item_name) LIKE $${params.length}`;
    }

    q += " ORDER BY ri.item_name, ri.qty_available DESC";
    const { rows } = await pool.query(q, params);
    return res.json({ ok: true, surplus: rows });
  } catch (err) {
    console.error("GET /surplus error:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

// ── POST /returns ────────────────────────────────────────────
// Foreman declares surplus materials available from their project
router.post("/returns", FOREMAN, async (req, res) => {
  try {
    const companyId  = req.user.company_id;
    const employeeId = await resolveEmployeeId(req);
    const { project_id, items, note } = req.body || {};

    if (!project_id) return res.status(400).json({ ok: false, error: "PROJECT_REQUIRED" });
    if (!Array.isArray(items) || !items.length)
      return res.status(400).json({ ok: false, error: "ITEMS_REQUIRED" });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const { rows: [ret] } = await client.query(
        `INSERT INTO public.material_returns (company_id, project_id, declared_by, note)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [companyId, project_id, employeeId, note || null]
      );

      const itemRows = [];
      for (const it of items) {
        const qty = Number(it.quantity);
        const { rows: [item] } = await client.query(
          `INSERT INTO public.material_return_items
             (return_id, item_name, item_name_raw, quantity, unit, qty_available, note)
           VALUES ($1, $2, $3, $4, $5, $4, $6) RETURNING *`,
          [ret.id, String(it.item_name).trim(), it.item_name_raw || null, qty, String(it.unit || 'pcs').trim(), it.note || null]
        );
        itemRows.push(item);
      }

      await client.query("COMMIT");
      return res.status(201).json({ ok: true, return: { ...ret, items: itemRows } });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("POST /returns error:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

// ── GET /returns ─────────────────────────────────────────────
router.get("/returns", ANY, async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const { project_id } = req.query;

    let q = `
      SELECT mr.*, p.project_code, p.project_name, ep.full_name AS declared_by_name,
        (SELECT json_agg(i ORDER BY i.id) FROM public.material_return_items i WHERE i.return_id = mr.id) AS items
      FROM public.material_returns mr
      JOIN public.projects p ON p.id = mr.project_id
      JOIN public.employee_profiles ep ON ep.employee_id = mr.declared_by
      WHERE mr.company_id = $1
    `;
    const params = [companyId];
    if (project_id) { params.push(project_id); q += ` AND mr.project_id = $${params.length}`; }
    q += " ORDER BY mr.created_at DESC";

    const { rows } = await pool.query(q, params);
    return res.json({ ok: true, returns: rows });
  } catch (err) {
    console.error("GET /returns error:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

module.exports = router;
