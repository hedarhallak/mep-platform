// routes/materials.js
// English-only code (Option 1: Foreman Review & Merge -> Preview -> Send to Office)

const express = require("express");
const router = express.Router();

const { pool } = require("../db");

// ---- Robust auth middleware resolver (prevents startup crash) ----
const authModule = (() => {
  try {
    return require("../middleware/auth");
  } catch (e) {
    console.error("[materials] Cannot load ../middleware/auth:", e.message);
    return null;
  }
})();

function pickAuthMiddleware(mod) {
  if (!mod) return null;
  if (typeof mod === "function") return mod;

  const candidates = [
    "requireAuth",
    "requireAuthToken",
    "auth",
    "authMiddleware",
    "authenticate",
    "authenticateToken",
    "verifyToken",
    "tokenMiddleware",
    "requireLogin",
    "ensureAuth",
  ];

  for (const k of candidates) {
    if (typeof mod[k] === "function") return mod[k];
  }

  for (const k of Object.keys(mod)) {
    if (mod[k] && typeof mod[k] === "object") {
      for (const c of candidates) {
        if (typeof mod[k][c] === "function") return mod[k][c];
      }
    }
  }

  return null;
}

const requireAuthResolved = pickAuthMiddleware(authModule);
const requireAuth = requireAuthResolved
  ? requireAuthResolved
  : (req, res) => {
      console.error("[materials] AUTH_MIDDLEWARE_NOT_FOUND: Fix ../middleware/auth exports.");
      return res.status(500).json({ ok: false, error: "AUTH_MIDDLEWARE_NOT_FOUND" });
    };

// ---- Helpers ----
function getWorkDateISO() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isAdmin(role) {
  return role === "admin";
}

function normalizeItems(rawItems) {
  if (!Array.isArray(rawItems)) return [];
  const items = [];
  for (const it of rawItems) {
    const itemText = String(it.item_text || it.item || "").trim();
    const qty = Number(it.qty ?? it.quantity ?? 0);
    const unit = String(it.unit || "").trim();
    const note = String(it.note || "").trim();
    if (!itemText) continue;
    items.push({ item_text: itemText, qty, unit, note });
  }
  return items;
}

async function getTodayProjectIdFromAttendance(client, employeeId, companyId, workDate) {
  const q = `
    SELECT project_id
    FROM public.attendance_logs
    WHERE employee_id = $1
      AND company_id = $2
      AND work_date = $3
    ORDER BY created_at DESC
    LIMIT 1
  `;
  const r = await client.query(q, [employeeId, companyId, workDate]);
  return r.rows[0]?.project_id ?? null;
}

async function isEmployeeForemanForProject(client, employeeId, projectId) {
  const q = `
    SELECT 1
    FROM public.project_foremen
    WHERE project_id = $1
      AND foreman_employee_id = $2
      AND is_active = true
    LIMIT 1
  `;
  const r = await client.query(q, [projectId, employeeId]);
  return r.rowCount > 0;
}

async function isEmployeeAnyActiveForeman(client, employeeId) {
  const q = `
    SELECT 1
    FROM public.project_foremen
    WHERE foreman_employee_id = $1
      AND is_active = true
    LIMIT 1
  `;
  const r = await client.query(q, [employeeId]);
  return r.rowCount > 0;
}

async function resolveProjectIdForMaterials(client, { isForeman, employeeId, companyId, workDate, manualProjectId }) {
  const attendanceProjectId = await getTodayProjectIdFromAttendance(client, employeeId, companyId, workDate);

  if (isForeman) {
    if (attendanceProjectId) return attendanceProjectId;

    if (!manualProjectId) return null;

    const ok = await isEmployeeForemanForProject(client, employeeId, manualProjectId);
    if (!ok) {
      const err = new Error("FOREMAN_NOT_ASSIGNED_TO_PROJECT");
      err.status = 403;
      throw err;
    }
    return manualProjectId;
  }

  return attendanceProjectId;
}

async function getForemanForProject(client, projectId) {
  const q = `
    SELECT foreman_employee_id
    FROM public.project_foremen
    WHERE project_id = $1
      AND is_active = true
    LIMIT 1
  `;
  const r = await client.query(q, [projectId]);
  return r.rows[0]?.foreman_employee_id ?? null;
}

/**
 * Foreman capability:
 * - admin OR derived-foreman via project_foremen
 */
async function requireForemanCap(client, user) {
  const { employee_id, role } = user || {};
  if (!employee_id) {
    const err = new Error("UNAUTHORIZED");
    err.status = 401;
    throw err;
  }
  const foremanCap = isAdmin(role) || (await isEmployeeAnyActiveForeman(client, employee_id));
  if (!foremanCap) {
    const err = new Error("FORBIDDEN");
    err.status = 403;
    throw err;
  }
  return true;
}

// ==========================================================
//  Existing: Foreman Projects (for picker)
//  GET /api/materials/foreman/projects
// ==========================================================
router.get("/foreman/projects", requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    await requireForemanCap(client, req.user);

    const { employee_id } = req.user;

    const q = `
      SELECT
        pf.project_id,
        p.project_code,
        p.project_name
      FROM public.project_foremen pf
      JOIN public.projects p ON p.id = pf.project_id
      WHERE pf.foreman_employee_id = $1
        AND pf.is_active = true
      ORDER BY p.project_code ASC
    `;
    const r = await client.query(q, [employee_id]);
    return res.json({ ok: true, projects: r.rows });
  } catch (e) {
    console.error(e);
    return res.status(e.status || 500).json({ ok: false, error: e.message || "SERVER_ERROR" });
  } finally {
    client.release();
  }
});

// ==========================================================
//  Existing: Worker submit (Auto project only)
//  POST /api/materials/submit
//  Writes to your materials_requests schema
// ==========================================================
router.post("/submit", requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const { employee_id, user_id } = req.user || {};
    if (!employee_id || !user_id) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });

    const workDate = getWorkDateISO();
    const items = normalizeItems(req.body.items);
    if (items.length === 0) return res.status(400).json({ ok: false, error: "NO_ITEMS" });

    const projectId = await getTodayProjectIdFromAttendance(client, employee_id, req.user.company_id, workDate);
    if (!projectId) return res.status(409).json({ ok: false, error: "NO_TODAY_PROJECT" });

    const foremanEmployeeId = await getForemanForProject(client, projectId);

    await client.query("BEGIN");

    const insReq = `
      INSERT INTO public.materials_requests
        (work_date, project_id, created_by_employee_id, created_by_user_id, status, submitted_at, foreman_employee_id, foreman_routed_at, note)
      VALUES
        ($1, $2, $3, $4, 'SUBMITTED', NOW(), $5, NOW(), NULL)
      RETURNING id
    `;
    const reqR = await client.query(insReq, [workDate, projectId, employee_id, user_id, foremanEmployeeId]);
    const requestId = reqR.rows[0].id;

    const insItem = `
      INSERT INTO public.materials_request_items
        (request_id, item_text, qty, unit, note)
      VALUES
        ($1, $2, $3, $4, $5)
    `;
    for (const it of items) {
      await client.query(insItem, [requestId, it.item_text, it.qty, it.unit, it.note]);
    }

    await client.query("COMMIT");
    return res.json({ ok: true, request_id: requestId, project_id: projectId, work_date: workDate });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(e);
    return res.status(500).json({ ok: false, error: e.message || "SERVER_ERROR" });
  } finally {
    client.release();
  }
});

// ==========================================================
//  Existing: Foreman Board (legacy list of requests)
//  GET /api/materials/foreman/today?project_id=..&work_date=..
// ==========================================================
router.get("/foreman/today", requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    await requireForemanCap(client, req.user);

    const { employee_id } = req.user;

    const workDate = String(req.query.work_date || getWorkDateISO()).slice(0, 10);
    const manualProjectId = req.query.project_id ? Number(req.query.project_id) : null;

    const projectId = await resolveProjectIdForMaterials(client, {
      isForeman: true,
      employeeId: employee_id,
      companyId: req.user.company_id,
      workDate,
      manualProjectId,
    });

    if (!projectId) return res.status(409).json({ ok: false, error: "NO_PROJECT_CONTEXT" });

    const q = `
      SELECT
        mr.id AS request_id,
        mr.created_by_employee_id AS worker_employee_id,
        mr.project_id,
        mr.work_date,
        mr.status,
        mr.submitted_at,
        i.id AS item_id,
        i.item_text,
        i.qty,
        i.unit,
        i.note
      FROM public.materials_requests mr
      LEFT JOIN public.materials_request_items i
        ON i.request_id = mr.id
      WHERE mr.project_id = $1
        AND mr.work_date = $2
        AND mr.status IN ('SUBMITTED','FOREMAN_EDITED','FOREMAN_ADDED','PENDING')
      ORDER BY mr.submitted_at ASC NULLS LAST, mr.id ASC, i.id ASC
    `;
    const r = await client.query(q, [projectId, workDate]);

    return res.json({ ok: true, project_id: projectId, work_date: workDate, rows: r.rows });
  } catch (e) {
    console.error(e);
    return res.status(e.status || 500).json({ ok: false, error: e.message || "SERVER_ERROR" });
  } finally {
    client.release();
  }
});

// ==========================================================
//  Existing: Foreman Add Own Items (legacy)
//  POST /api/materials/foreman/items
//  (kept for backward compatibility; Option-1 uses ticket draft endpoints below)
// ==========================================================
router.post("/foreman/items", requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    await requireForemanCap(client, req.user);

    const { employee_id, user_id } = req.user || {};
    if (!employee_id || !user_id) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });

    const workDate = String(req.body.work_date || getWorkDateISO()).slice(0, 10);
    const manualProjectId = req.body.project_id ? Number(req.body.project_id) : null;

    const items = normalizeItems(req.body.items);
    if (items.length === 0) return res.status(400).json({ ok: false, error: "NO_ITEMS" });

    const projectId = await resolveProjectIdForMaterials(client, {
      isForeman: true,
      employeeId: employee_id,
      companyId: req.user.company_id,
      workDate,
      manualProjectId,
    });
    if (!projectId) return res.status(409).json({ ok: false, error: "NO_PROJECT_CONTEXT" });

    await client.query("BEGIN");

    const insReq = `
      INSERT INTO public.materials_requests
        (work_date, project_id, created_by_employee_id, created_by_user_id, status, submitted_at, foreman_employee_id, foreman_routed_at, note)
      VALUES
        ($1, $2, $3, $4, 'FOREMAN_ADDED', NOW(), $3, NOW(), NULL)
      RETURNING id
    `;
    const reqR = await client.query(insReq, [workDate, projectId, employee_id, user_id]);
    const requestId = reqR.rows[0].id;

    const insItem = `
      INSERT INTO public.materials_request_items
        (request_id, item_text, qty, unit, note)
      VALUES
        ($1, $2, $3, $4, $5)
    `;
    for (const it of items) {
      await client.query(insItem, [requestId, it.item_text, it.qty, it.unit, it.note]);
    }

    await client.query("COMMIT");
    return res.json({ ok: true, request_id: requestId, project_id: projectId, work_date: workDate });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(e);
    return res.status(e.status || 500).json({ ok: false, error: e.message || "SERVER_ERROR" });
  } finally {
    client.release();
  }
});

// ==========================================================
//  OPTION 1 - New endpoints
// ==========================================================

/**
 * Upsert ticket (DRAFT) for work_date + project_id
 */
async function ensureDraftTicket(client, { workDate, projectId, employeeId, userId }) {
  // Try select
  const sel = `
    SELECT id, status, sent_at
    FROM public.materials_tickets
    WHERE work_date = $1 AND project_id = $2
    LIMIT 1
  `;
  const s = await client.query(sel, [workDate, projectId]);
  if (s.rowCount > 0) {
    return s.rows[0];
  }

  // Create new draft
  const ins = `
    INSERT INTO public.materials_tickets
      (work_date, project_id, created_by_employee_id, created_by_user_id, status, note)
    VALUES
      ($1, $2, $3, $4, 'DRAFT', NULL)
    RETURNING id, status, sent_at
  `;
  const r = await client.query(ins, [workDate, projectId, employeeId, userId]);
  return r.rows[0];
}

async function getTicketWithItems(client, ticketId) {
  const t = await client.query(
    `SELECT id, work_date, project_id, status, sent_at, note, created_by_employee_id, created_by_user_id
     FROM public.materials_tickets WHERE id = $1 LIMIT 1`,
    [ticketId]
  );
  const items = await client.query(
    `SELECT id, ticket_id, item_text, qty, unit, note, source, source_request_id, created_at
     FROM public.materials_ticket_items
     WHERE ticket_id = $1
     ORDER BY id ASC`,
    [ticketId]
  );
  return { ticket: t.rows[0] || null, ticket_items: items.rows || [] };
}

/**
 * Foreman Workspace
 * GET /api/materials/foreman/workspace?project_id=&work_date=
 * Returns:
 * - requests + items (today)
 * - draft ticket + items (if exists/created)
 * - merged preview (server-side)
 */
router.get("/foreman/workspace", requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    await requireForemanCap(client, req.user);

    const { employee_id, user_id } = req.user || {};
    if (!employee_id || !user_id) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });

    const workDate = String(req.query.work_date || getWorkDateISO()).slice(0, 10);
    const manualProjectId = req.query.project_id ? Number(req.query.project_id) : null;

    const projectId = await resolveProjectIdForMaterials(client, {
      isForeman: true,
      employeeId: employee_id,
      companyId: req.user.company_id,
      workDate,
      manualProjectId,
    });
    if (!projectId) return res.status(409).json({ ok: false, error: "NO_PROJECT_CONTEXT" });

    // Ensure draft ticket (one per work_date/project)
    const ticketRow = await ensureDraftTicket(client, {
      workDate,
      projectId,
      employeeId: employee_id,
      userId: user_id,
    });

    // Load requests + items for today/project
    const rq = await client.query(
      `
      SELECT
        mr.id AS request_id,
        mr.created_by_employee_id AS worker_employee_id,
        mr.status,
        mr.submitted_at,
        i.id AS item_id,
        i.item_text,
        i.qty,
        i.unit,
        i.note
      FROM public.materials_requests mr
      LEFT JOIN public.materials_request_items i ON i.request_id = mr.id
      WHERE mr.project_id = $1
        AND mr.work_date = $2
        AND mr.status IN ('SUBMITTED','FOREMAN_EDITED','FOREMAN_ADDED','PENDING')
      ORDER BY mr.submitted_at ASC NULLS LAST, mr.id ASC, i.id ASC
      `,
      [projectId, workDate]
    );

    // Ticket + items
    const { ticket, ticket_items } = await getTicketWithItems(client, ticketRow.id);

    // Merged preview:
    // - Take ticket items as the "final list" draft (since foreman will edit worker items and add foreman items into ticket)
    // - We still include request snapshot for reference.
    const preview = ticket_items.map((x) => ({
      item_text: x.item_text,
      qty: x.qty,
      unit: x.unit,
      note: x.note,
      source: x.source,
      source_request_id: x.source_request_id,
    }));

    return res.json({
      ok: true,
      work_date: workDate,
      project_id: projectId,
      requests_rows: rq.rows,
      ticket,
      ticket_items,
      merged_preview: preview,
    });
  } catch (e) {
    console.error(e);
    return res.status(e.status || 500).json({ ok: false, error: e.message || "SERVER_ERROR" });
  } finally {
    client.release();
  }
});

/**
 * Edit a worker request item (foreman review)
 * PUT /api/materials/foreman/requests/:request_id/items/:item_id
 * Body: { item_text?, qty?, unit?, note? }
 */
router.put("/foreman/requests/:request_id/items/:item_id", requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    await requireForemanCap(client, req.user);

    const { employee_id } = req.user || {};
    const requestId = Number(req.params.request_id);
    const itemId = Number(req.params.item_id);

    if (!Number.isFinite(requestId) || !Number.isFinite(itemId)) {
      return res.status(400).json({ ok: false, error: "BAD_ID" });
    }

    // Ensure item belongs to request, and request belongs to a project this foreman is assigned to
    const check = await client.query(
      `
      SELECT mr.project_id, mr.work_date, mr.status
      FROM public.materials_requests mr
      JOIN public.materials_request_items i ON i.request_id = mr.id
      WHERE mr.id = $1 AND i.id = $2
      LIMIT 1
      `,
      [requestId, itemId]
    );
    if (check.rowCount === 0) return res.status(404).json({ ok: false, error: "NOT_FOUND" });

    const projectId = check.rows[0].project_id;
    const ok = await isEmployeeForemanForProject(client, employee_id, projectId);
    if (!ok) return res.status(403).json({ ok: false, error: "FOREMAN_NOT_ASSIGNED_TO_PROJECT" });

    const item_text = req.body.item_text !== undefined ? String(req.body.item_text).trim() : undefined;
    const qty = req.body.qty !== undefined ? Number(req.body.qty) : undefined;
    const unit = req.body.unit !== undefined ? String(req.body.unit).trim() : undefined;
    const note = req.body.note !== undefined ? String(req.body.note).trim() : undefined;

    // Build dynamic update
    const sets = [];
    const vals = [];
    let idx = 1;

    if (item_text !== undefined) { sets.push(`item_text = $${idx++}`); vals.push(item_text); }
    if (qty !== undefined) { sets.push(`qty = $${idx++}`); vals.push(qty); }
    if (unit !== undefined) { sets.push(`unit = $${idx++}`); vals.push(unit); }
    if (note !== undefined) { sets.push(`note = $${idx++}`); vals.push(note); }

    if (sets.length === 0) return res.status(400).json({ ok: false, error: "NO_FIELDS" });

    vals.push(itemId);
    const upd = `
      UPDATE public.materials_request_items
      SET ${sets.join(", ")}
      WHERE id = $${idx}
      RETURNING id, request_id, item_text, qty, unit, note
    `;
    const u = await client.query(upd, vals);

    // Mark request as FOREMAN_EDITED (optional but useful)
    await client.query(
      `UPDATE public.materials_requests SET status = 'FOREMAN_EDITED' WHERE id = $1 AND status = 'SUBMITTED'`,
      [requestId]
    );

    return res.json({ ok: true, item: u.rows[0] });
  } catch (e) {
    console.error(e);
    return res.status(e.status || 500).json({ ok: false, error: e.message || "SERVER_ERROR" });
  } finally {
    client.release();
  }
});

/**
 * Delete a worker request item (foreman review)
 * DELETE /api/materials/foreman/requests/:request_id/items/:item_id
 */
router.delete("/foreman/requests/:request_id/items/:item_id", requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    await requireForemanCap(client, req.user);

    const { employee_id } = req.user || {};
    const requestId = Number(req.params.request_id);
    const itemId = Number(req.params.item_id);

    if (!Number.isFinite(requestId) || !Number.isFinite(itemId)) {
      return res.status(400).json({ ok: false, error: "BAD_ID" });
    }

    const check = await client.query(
      `
      SELECT mr.project_id
      FROM public.materials_requests mr
      JOIN public.materials_request_items i ON i.request_id = mr.id
      WHERE mr.id = $1 AND i.id = $2
      LIMIT 1
      `,
      [requestId, itemId]
    );
    if (check.rowCount === 0) return res.status(404).json({ ok: false, error: "NOT_FOUND" });

    const projectId = check.rows[0].project_id;
    const ok = await isEmployeeForemanForProject(client, employee_id, projectId);
    if (!ok) return res.status(403).json({ ok: false, error: "FOREMAN_NOT_ASSIGNED_TO_PROJECT" });

    await client.query(`DELETE FROM public.materials_request_items WHERE id = $1`, [itemId]);

    await client.query(
      `UPDATE public.materials_requests SET status = 'FOREMAN_EDITED' WHERE id = $1 AND status = 'SUBMITTED'`,
      [requestId]
    );

    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(e.status || 500).json({ ok: false, error: e.message || "SERVER_ERROR" });
  } finally {
    client.release();
  }
});

/**
 * Add items to Draft Ticket (foreman adds/merges into the final ticket)
 * POST /api/materials/foreman/ticket/items
 * Body:
 * {
 *   project_id?: number,
 *   work_date?: "YYYY-MM-DD",
 *   items: [{ item_text, qty, unit, note, source, source_request_id? }]
 * }
 * source must be 'FOREMAN' or 'WORKER'
 */
router.post("/foreman/ticket/items", requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    await requireForemanCap(client, req.user);

    const { employee_id, user_id } = req.user || {};
    if (!employee_id || !user_id) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });

    const workDate = String(req.body.work_date || getWorkDateISO()).slice(0, 10);
    const manualProjectId = req.body.project_id ? Number(req.body.project_id) : null;

    const projectId = await resolveProjectIdForMaterials(client, {
      isForeman: true,
      employeeId: employee_id,
      companyId: req.user.company_id,
      workDate,
      manualProjectId,
    });
    if (!projectId) return res.status(409).json({ ok: false, error: "NO_PROJECT_CONTEXT" });

    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (items.length === 0) return res.status(400).json({ ok: false, error: "NO_ITEMS" });

    await client.query("BEGIN");

    const ticketRow = await ensureDraftTicket(client, {
      workDate,
      projectId,
      employeeId: employee_id,
      userId: user_id,
    });

    // Lock check
    if (ticketRow.status === "SENT_TO_OFFICE") {
      await client.query("ROLLBACK");
      return res.status(409).json({ ok: false, error: "TICKET_ALREADY_SENT" });
    }

    const ins = `
      INSERT INTO public.materials_ticket_items
        (ticket_id, item_text, qty, unit, note, source, source_request_id)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, ticket_id, item_text, qty, unit, note, source, source_request_id, created_at
    `;

    const created = [];
    for (const it of items) {
      const item_text = String(it.item_text || "").trim();
      if (!item_text) continue;
      const qty = Number(it.qty ?? 0);
      const unit = String(it.unit || "pcs").trim();
      const note = it.note !== undefined ? String(it.note || "").trim() : null;
      const source = String(it.source || "FOREMAN").trim().toUpperCase();
      const source_request_id = it.source_request_id ? Number(it.source_request_id) : null;

      if (source !== "WORKER" && source !== "FOREMAN") {
        await client.query("ROLLBACK");
        return res.status(400).json({ ok: false, error: "BAD_SOURCE" });
      }

      const r = await client.query(ins, [
        ticketRow.id,
        item_text,
        qty,
        unit,
        note,
        source,
        source_request_id,
      ]);
      created.push(r.rows[0]);
    }

    await client.query("COMMIT");

    return res.json({ ok: true, ticket_id: ticketRow.id, items: created });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(e);
    return res.status(e.status || 500).json({ ok: false, error: e.message || "SERVER_ERROR" });
  } finally {
    client.release();
  }
});

/**
 * Delete draft ticket item
 * DELETE /api/materials/foreman/ticket/items/:id
 */
router.delete("/foreman/ticket/items/:id", requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    await requireForemanCap(client, req.user);

    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: "BAD_ID" });

    // Optional: we can also verify ownership via ticket->project->foreman mapping, but keep minimal now
    await client.query(`DELETE FROM public.materials_ticket_items WHERE id = $1`, [id]);
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(e.status || 500).json({ ok: false, error: e.message || "SERVER_ERROR" });
  } finally {
    client.release();
  }
});

/**
 * Send ticket to office (lock)
 * POST /api/materials/foreman/ticket/send
 * Body: { project_id?: number, work_date?: "YYYY-MM-DD", note?: string }
 */
router.post("/foreman/ticket/send", requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    await requireForemanCap(client, req.user);

    const { employee_id, user_id } = req.user || {};
    if (!employee_id || !user_id) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });

    const workDate = String(req.body.work_date || getWorkDateISO()).slice(0, 10);
    const manualProjectId = req.body.project_id ? Number(req.body.project_id) : null;

    const projectId = await resolveProjectIdForMaterials(client, {
      isForeman: true,
      employeeId: employee_id,
      companyId: req.user.company_id,
      workDate,
      manualProjectId,
    });
    if (!projectId) return res.status(409).json({ ok: false, error: "NO_PROJECT_CONTEXT" });

    await client.query("BEGIN");

    const ticketRow = await ensureDraftTicket(client, {
      workDate,
      projectId,
      employeeId: employee_id,
      userId: user_id,
    });

    // Must have at least 1 item
    const cnt = await client.query(
      `SELECT COUNT(*)::int AS c FROM public.materials_ticket_items WHERE ticket_id = $1`,
      [ticketRow.id]
    );
    if ((cnt.rows[0]?.c ?? 0) <= 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ ok: false, error: "EMPTY_TICKET" });
    }

    // Lock
    const note = req.body.note !== undefined ? String(req.body.note || "").trim() : null;

    const upd = `
      UPDATE public.materials_tickets
      SET status = 'SENT_TO_OFFICE',
          sent_at = NOW(),
          note = $3,
          updated_at = NOW()
      WHERE id = $1 AND status = 'DRAFT'
      RETURNING id, work_date, project_id, status, sent_at, note
    `;
    const u = await client.query(upd, [ticketRow.id, null, note]);

    if (u.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ ok: false, error: "TICKET_ALREADY_SENT" });
    }

    await client.query("COMMIT");
    return res.json({ ok: true, ticket: u.rows[0] });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(e);
    return res.status(e.status || 500).json({ ok: false, error: e.message || "SERVER_ERROR" });
  } finally {
    client.release();
  }
});

module.exports = router;
