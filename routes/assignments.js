"use strict";

/**
 * routes/assignments.js
 * Assignment request workflow:
 *   PM  → POST /api/assignments/requests        (create request)
 *   ADMIN → PATCH /api/assignments/requests/:id/approve
 *   ADMIN → PATCH /api/assignments/requests/:id/reject
 *   ALL  → GET  /api/assignments/requests        (list requests)
 *   ALL  → GET  /api/assignments                 (list active assignments)
 *   ADMIN → DELETE /api/assignments/:id          (cancel assignment)
 */

const express = require("express");
const router  = express.Router();
const { pool }           = require("../db");
const { audit, ACTIONS } = require("../lib/audit");

// ── Role helpers ─────────────────────────────────────────
function requireRoles(allowed) {
  return (req, res, next) => {
    if (!allowed.includes(req.user?.role))
      return res.status(403).json({ ok: false, error: "FORBIDDEN" });
    return next();
  };
}
const ADMIN_ONLY = requireRoles(["ADMIN"]);
const ADMIN_PM   = requireRoles(["ADMIN", "PM"]);

// ── Time slots helper (every 30 min) ─────────────────────
function generateTimeSlots() {
  const slots = [];
  for (let h = 0; h < 24; h++) {
    for (let m of [0, 30]) {
      const hh  = String(h).padStart(2, "0");
      const mm  = String(m).padStart(2, "0");
      const ampm = h < 12 ? "AM" : "PM";
      const h12  = h === 0 ? 12 : h > 12 ? h - 12 : h;
      slots.push({
        value: `${hh}:${mm}`,
        label: `${String(h12).padStart(2,"0")}:${mm} ${ampm}`,
      });
    }
  }
  return slots;
}

// ── GET /api/assignments/timeslots ────────────────────────
router.get("/timeslots", (req, res) => {
  return res.json({ ok: true, slots: generateTimeSlots() });
});

// ── GET /api/assignments/employees-map ───────────────────
// Employees with home coords + availability for given period
router.get("/employees-map", async (req, res) => {
  try {
    const { start, end } = req.query;
    const companyId = req.user.company_id;

    const { rows } = await pool.query(
      `SELECT
         ep.employee_id AS id,
         ep.full_name,
         ep.trade_code,
         ep.rank_code,
         ST_X(ep.home_location::geometry) AS home_lng,
         ST_Y(ep.home_location::geometry) AS home_lat,
         CASE
           WHEN EXISTS (
             SELECT 1 FROM public.assignment_requests ar
             WHERE ar.requested_for_employee_id = ep.employee_id
               AND ar.company_id = $1
               AND ar.status = 'APPROVED'
               AND ($2::date IS NULL OR ar.start_date <= $3::date)
               AND ($3::date IS NULL OR ar.end_date   >= $2::date)
           ) THEN false
           ELSE true
         END AS is_available
       FROM public.employee_profiles ep
       JOIN public.app_users au ON au.employee_id = ep.employee_id
       WHERE au.company_id = $1
         AND au.employee_id IS NOT NULL
         AND ep.home_location IS NOT NULL
         AND ST_X(ep.home_location::geometry) != 0
         AND ST_Y(ep.home_location::geometry) != 0
       ORDER BY ep.full_name`,
      [companyId, start || null, end || null]
    );

    return res.json({ ok: true, employees: rows });
  } catch (err) {
    console.error("GET /assignments/employees-map error:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});
// List employees that have a profile (employee_id not null)
router.get("/employees", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ep.employee_id AS id, ep.full_name, ep.trade_code, ep.role_code, ep.rank_code,
              au.username
       FROM public.app_users au
       JOIN public.employee_profiles ep ON ep.employee_id = au.employee_id
       WHERE au.company_id = $1
         AND au.employee_id IS NOT NULL
         AND au.role NOT IN ('ADMIN','SUPER_ADMIN')
       ORDER BY ep.full_name`,
      [req.user.company_id]
    );
    return res.json({ ok: true, employees: rows });
  } catch (err) {
    console.error("GET /assignments/employees error:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

// ── GET /api/assignments/defaults ────────────────────────
// Returns company default shift times
router.get("/defaults", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT default_shift_start, default_shift_end
       FROM public.companies WHERE company_id = $1 LIMIT 1`,
      [req.user.company_id]
    );
    const defaults = rows[0] || {};
    return res.json({
      ok:          true,
      shift_start: defaults.default_shift_start || "06:00",
      shift_end:   defaults.default_shift_end   || "14:30",
    });
  } catch (err) {
    console.error("GET /assignments/defaults error:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

// ── GET /api/assignments/requests ────────────────────────
router.get("/requests", async (req, res) => {
  try {
    const { status } = req.query;
    const companyId  = req.user.company_id;

    let query = `
      SELECT
        ar.id,
        ar.status,
        ar.start_date,
        ar.end_date,
        ar.shift_start,
        ar.shift_end,
        ar.notes,
        ar.created_at,
        ar.decision_note,
        ar.decision_at,
        p.project_code,
        p.project_name,
        ep.full_name   AS employee_name,
        ep.trade_code  AS employee_trade,
        requester.username AS requested_by_name,
        reviewer.username  AS reviewed_by_name
      FROM public.assignment_requests ar
      JOIN public.projects         p        ON p.id            = ar.project_id
      JOIN public.employee_profiles ep       ON ep.employee_id  = ar.requested_for_employee_id
      JOIN public.app_users         requester ON requester.id   = ar.requested_by_user_id
      LEFT JOIN public.app_users    reviewer  ON reviewer.id    = ar.decision_by_user_id
      WHERE ar.company_id = $1
    `;

    const params = [companyId];

    if (status) {
      params.push(String(status).toUpperCase());
      query += ` AND ar.status = $${params.length}`;
    }

    // PM sees only their own requests
    if (req.user.role === "PM") {
      params.push(req.user.user_id);
      query += ` AND ar.requested_by_user_id = $${params.length}`;
    }

    query += " ORDER BY ar.created_at DESC";

    const { rows } = await pool.query(query, params);
    return res.json({ ok: true, requests: rows });
  } catch (err) {
    console.error("GET /assignments/requests error:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

// ── POST /api/assignments/requests ───────────────────────
router.post("/requests", ADMIN_PM, async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const {
      project_id,
      employee_id,
      start_date,
      end_date,
      shift_start,
      shift_end,
      notes,
    } = req.body || {};

    // Validate required fields
    if (!project_id)   return res.status(400).json({ ok: false, error: "PROJECT_REQUIRED" });
    if (!employee_id)  return res.status(400).json({ ok: false, error: "EMPLOYEE_REQUIRED" });
    if (!start_date)   return res.status(400).json({ ok: false, error: "START_DATE_REQUIRED" });
    if (!end_date)     return res.status(400).json({ ok: false, error: "END_DATE_REQUIRED" });
    if (!shift_start)  return res.status(400).json({ ok: false, error: "SHIFT_START_REQUIRED" });
    if (!shift_end)    return res.status(400).json({ ok: false, error: "SHIFT_END_REQUIRED" });

    if (new Date(end_date) < new Date(start_date))
      return res.status(400).json({ ok: false, error: "END_DATE_BEFORE_START" });

    // Verify project belongs to company and is ACTIVE
    const project = await pool.query(
      `SELECT p.id, p.project_name, ps.code AS status_code
       FROM public.projects p
       JOIN public.project_statuses ps ON ps.id = p.status_id
       WHERE p.id = $1 AND p.company_id = $2 LIMIT 1`,
      [project_id, companyId]
    );
    if (!project.rows.length)
      return res.status(400).json({ ok: false, error: "PROJECT_NOT_FOUND" });
    if (project.rows[0].status_code !== "ACTIVE")
      return res.status(400).json({ ok: false, error: "PROJECT_NOT_ACTIVE" });

    // Verify employee belongs to company
    const employee = await pool.query(
      `SELECT ep.employee_id, ep.full_name
       FROM public.employee_profiles ep
       JOIN public.app_users au ON au.employee_id = ep.employee_id
       WHERE ep.employee_id = $1 AND au.company_id = $2 LIMIT 1`,
      [employee_id, companyId]
    );
    if (!employee.rows.length)
      return res.status(400).json({ ok: false, error: "EMPLOYEE_NOT_FOUND" });

    // Check for overlapping APPROVED assignments for this employee
    const overlap = await pool.query(
      `SELECT ar.id FROM public.assignment_requests ar
       WHERE ar.requested_for_employee_id = $1
         AND ar.company_id = $2
         AND ar.status = 'APPROVED'
         AND ar.start_date <= $3
         AND ar.end_date   >= $4`,
      [employee_id, companyId, end_date, start_date]
    );
    if (overlap.rows.length > 0)
      return res.status(409).json({
        ok: false,
        error: "EMPLOYEE_ALREADY_ASSIGNED",
        message: `${employee.rows[0].full_name} is already assigned to another project during this period.`,
      });

    // Also check for PENDING requests that overlap
    const pendingOverlap = await pool.query(
      `SELECT ar.id FROM public.assignment_requests ar
       WHERE ar.requested_for_employee_id = $1
         AND ar.company_id = $2
         AND ar.status = 'PENDING'
         AND ar.start_date <= $3
         AND ar.end_date   >= $4`,
      [employee_id, companyId, end_date, start_date]
    );
    if (pendingOverlap.rows.length > 0)
      return res.status(409).json({
        ok: false,
        error: "EMPLOYEE_HAS_PENDING_REQUEST",
        message: `${employee.rows[0].full_name} already has a pending request for this period.`,
      });

    // Create request
    // ADMIN requests are auto-approved
    const isAdmin  = req.user.role === "ADMIN";
    const status   = isAdmin ? "APPROVED" : "PENDING";

    const { rows } = await pool.query(
      `INSERT INTO public.assignment_requests
         (company_id, project_id, requested_for_employee_id, requested_by_user_id,
          start_date, end_date, shift_start, shift_end, notes,
          status, request_type, payload_json,
          decision_by_user_id, decision_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'CREATE_ASSIGNMENT','{}',
               $11, $12, NOW(), NOW())
       RETURNING *`,
      [
        companyId,
        project_id,
        employee_id,
        req.user.user_id,
        start_date,
        end_date,
        shift_start,
        shift_end,
        notes || null,
        status,
        isAdmin ? req.user.user_id : null,
        isAdmin ? new Date() : null,
      ]
    );

    await audit(pool, req, {
      action:      ACTIONS.ASSIGNMENT_CREATED,
      entity_type: "assignment_request",
      entity_id:   rows[0].id,
      entity_name: `${employee.rows[0].full_name} → ${project.rows[0].project_name}`,
      new_values:  { status, start_date, end_date, shift_start, shift_end },
    });

    return res.status(201).json({ ok: true, request: rows[0], auto_approved: isAdmin });
  } catch (err) {
    console.error("POST /assignments/requests error:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

// ── PATCH /api/assignments/requests/:id/approve ──────────
router.patch("/requests/:id/approve", ADMIN_ONLY, async (req, res) => {
  try {
    const reqId     = Number(req.params.id);
    const companyId = req.user.company_id;

    const existing = await pool.query(
      "SELECT * FROM public.assignment_requests WHERE id = $1 AND company_id = $2 LIMIT 1",
      [reqId, companyId]
    );
    if (!existing.rows.length)
      return res.status(404).json({ ok: false, error: "REQUEST_NOT_FOUND" });

    if (existing.rows[0].status !== "PENDING")
      return res.status(409).json({ ok: false, error: "REQUEST_NOT_PENDING" });

    const r = existing.rows[0];

    // Re-check overlap before approving
    const overlap = await pool.query(
      `SELECT id FROM public.assignment_requests
       WHERE requested_for_employee_id = $1
         AND company_id = $2
         AND status = 'APPROVED'
         AND id != $3
         AND start_date <= $4
         AND end_date   >= $5`,
      [r.requested_for_employee_id, companyId, reqId, r.end_date, r.start_date]
    );
    if (overlap.rows.length > 0)
      return res.status(409).json({ ok: false, error: "EMPLOYEE_ALREADY_ASSIGNED" });

    const { rows } = await pool.query(
      `UPDATE public.assignment_requests
       SET status = 'APPROVED', decision_by_user_id = $1, decision_at = NOW(), updated_at = NOW()
       WHERE id = $2 AND company_id = $3
       RETURNING *`,
      [req.user.user_id, reqId, companyId]
    );

    await audit(pool, req, {
      action:      ACTIONS.ASSIGNMENT_UPDATED,
      entity_type: "assignment_request",
      entity_id:   reqId,
      details:     { action: "APPROVED" },
    });

    return res.json({ ok: true, request: rows[0] });
  } catch (err) {
    console.error("PATCH approve error:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

// ── PATCH /api/assignments/requests/:id/reject ───────────
router.patch("/requests/:id/reject", ADMIN_ONLY, async (req, res) => {
  try {
    const reqId     = Number(req.params.id);
    const companyId = req.user.company_id;
    const { reason } = req.body || {};

    const existing = await pool.query(
      "SELECT id, status FROM public.assignment_requests WHERE id = $1 AND company_id = $2 LIMIT 1",
      [reqId, companyId]
    );
    if (!existing.rows.length)
      return res.status(404).json({ ok: false, error: "REQUEST_NOT_FOUND" });
    if (existing.rows[0].status !== "PENDING")
      return res.status(409).json({ ok: false, error: "REQUEST_NOT_PENDING" });

    const { rows } = await pool.query(
      `UPDATE public.assignment_requests
       SET status = 'REJECTED', decision_by_user_id = $1, decision_at = NOW(),
           decision_note = $2, updated_at = NOW()
       WHERE id = $3 AND company_id = $4
       RETURNING *`,
      [req.user.user_id, reason || null, reqId, companyId]
    );

    await audit(pool, req, {
      action:      ACTIONS.ASSIGNMENT_UPDATED,
      entity_type: "assignment_request",
      entity_id:   reqId,
      details:     { action: "REJECTED", reason },
    });

    return res.json({ ok: true, request: rows[0] });
  } catch (err) {
    console.error("PATCH reject error:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

// ── PATCH /api/assignments/requests/:id/cancel ───────────
// PM can cancel their own PENDING request
router.patch("/requests/:id/cancel", ADMIN_PM, async (req, res) => {
  try {
    const reqId     = Number(req.params.id);
    const companyId = req.user.company_id;

    const existing = await pool.query(
      "SELECT * FROM public.assignment_requests WHERE id = $1 AND company_id = $2 LIMIT 1",
      [reqId, companyId]
    );
    if (!existing.rows.length)
      return res.status(404).json({ ok: false, error: "REQUEST_NOT_FOUND" });

    const r = existing.rows[0];

    // PM can only cancel own requests
    if (req.user.role === "PM" && r.requested_by_user_id !== req.user.user_id)
      return res.status(403).json({ ok: false, error: "FORBIDDEN" });

    if (!["PENDING", "APPROVED"].includes(r.status))
      return res.status(409).json({ ok: false, error: "CANNOT_CANCEL" });

    const { rows } = await pool.query(
      `UPDATE public.assignment_requests
       SET status = 'CANCELLED', updated_at = NOW()
       WHERE id = $1 AND company_id = $2
       RETURNING *`,
      [reqId, companyId]
    );

    await audit(pool, req, {
      action:      ACTIONS.ASSIGNMENT_DELETED,
      entity_type: "assignment_request",
      entity_id:   reqId,
      details:     { cancelled_by: req.user.username },
    });

    return res.json({ ok: true, request: rows[0] });
  } catch (err) {
    console.error("PATCH cancel error:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

// ── GET /api/assignments ──────────────────────────────────
// Active (APPROVED) assignments — what's on site today/upcoming
router.get("/", async (req, res) => {
  try {
    const { project_id, employee_id, date } = req.query;
    const companyId = req.user.company_id;

    let query = `
      SELECT
        ar.id,
        ar.start_date,
        ar.end_date,
        ar.shift_start,
        ar.shift_end,
        ar.notes,
        ar.created_at,
        p.id           AS project_id,
        p.project_code,
        p.project_name,
        p.site_address,
        ep.employee_id,
        ep.full_name   AS employee_name,
        ep.trade_code,
        ep.rank_code,
        requester.username AS assigned_by
      FROM public.assignment_requests ar
      JOIN public.projects          p         ON p.id           = ar.project_id
      JOIN public.employee_profiles ep        ON ep.employee_id = ar.requested_for_employee_id
      JOIN public.app_users         requester ON requester.id   = ar.requested_by_user_id
      WHERE ar.company_id = $1 AND ar.status = 'APPROVED'
    `;

    const params = [companyId];

    if (project_id) {
      params.push(project_id);
      query += ` AND ar.project_id = $${params.length}`;
    }

    if (employee_id) {
      params.push(employee_id);
      query += ` AND ar.requested_for_employee_id = $${params.length}`;
    }

    if (date) {
      params.push(date);
      query += ` AND ar.start_date <= $${params.length} AND ar.end_date >= $${params.length}`;
    }

    query += " ORDER BY ar.start_date ASC, ep.full_name ASC";

    const { rows } = await pool.query(query, params);
    return res.json({ ok: true, assignments: rows });
  } catch (err) {
    console.error("GET /assignments error:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

module.exports = router;

// ── GET /api/assignments/suggest/:project_id ──────────────
// Smart suggestions: available employees ranked by distance + compatibility
router.get("/suggest/:project_id", async (req, res) => {
  try {
    const projectId = Number(req.params.project_id);
    const companyId = req.user.company_id;
    const { start_date, end_date } = req.query;

    if (!projectId) return res.status(400).json({ ok: false, error: "INVALID_ID" });
    if (!start_date || !end_date)
      return res.status(400).json({ ok: false, error: "DATES_REQUIRED" });

    // Get project details + coords
    const projRes = await pool.query(
      `SELECT p.id, p.project_name, p.project_code, p.trade_type_id,
              p.site_lat, p.site_lng,
              tt.code AS trade_code
       FROM public.projects p
       LEFT JOIN public.trade_types tt ON tt.id = p.trade_type_id
       WHERE p.id = $1 AND p.company_id = $2 LIMIT 1`,
      [projectId, companyId]
    );
    if (!projRes.rows.length)
      return res.status(404).json({ ok: false, error: "PROJECT_NOT_FOUND" });

    const project = projRes.rows[0];

    // Get all employees with profiles for this company
    const empRes = await pool.query(
      `SELECT
         ep.employee_id AS id,
         ep.full_name,
         ep.trade_code,
         ep.role_code,
         ep.rank_code,
         ep.home_address,
         ST_X(ep.home_location::geometry) AS home_lng,
         ST_Y(ep.home_location::geometry) AS home_lat,
         au.username,
         CASE
           WHEN ep.home_location IS NOT NULL
                AND ST_X(ep.home_location::geometry) != 0
                AND ST_Y(ep.home_location::geometry) != 0
                AND $2::float IS NOT NULL
           THEN ROUND(
             (ST_Distance(
               ep.home_location::geography,
               ST_SetSRID(ST_MakePoint($2::float, $3::float), 4326)::geography
             ) / 1000)::numeric, 1
           )
           ELSE NULL
         END AS distance_km
       FROM public.employee_profiles ep
       JOIN public.app_users au ON au.employee_id = ep.employee_id
       WHERE au.company_id = $1
         AND au.employee_id IS NOT NULL
         AND au.role NOT IN ('ADMIN','SUPER_ADMIN')
       ORDER BY ep.full_name`,
      [companyId, project.site_lng, project.site_lat]
    );

    // Get employees already assigned during this period
    const busyRes = await pool.query(
      `SELECT DISTINCT requested_for_employee_id
       FROM public.assignment_requests
       WHERE company_id = $1
         AND status IN ('APPROVED', 'PENDING')
         AND start_date <= $2
         AND end_date   >= $3`,
      [companyId, end_date, start_date]
    );
    const busyIds = new Set(busyRes.rows.map(r => r.requested_for_employee_id));

    // Get team frequency — who worked together on same projects before
    const freqRes = await pool.query(
      `SELECT ar.requested_for_employee_id AS employee_id,
              COUNT(*) AS times_together
       FROM public.assignment_requests ar
       WHERE ar.company_id = $1
         AND ar.project_id = $2
         AND ar.status = 'APPROVED'
       GROUP BY ar.requested_for_employee_id`,
      [companyId, projectId]
    );
    const freqMap = {};
    freqRes.rows.forEach(r => { freqMap[r.employee_id] = parseInt(r.times_together); });

    // Build suggestions with scores
    const suggestions = empRes.rows.map(emp => {
      const isAvailable  = !busyIds.has(emp.id);
      const tradeMatch   = emp.trade_code === project.trade_code;
      const timesTogether = freqMap[emp.id] || 0;

      // Score (higher = better suggestion)
      let score = 0;
      if (isAvailable)    score += 100;
      if (tradeMatch)     score += 50;
      score += timesTogether * 10;
      if (emp.distance_km !== null) {
        // Closer = higher score (max 40 points for 0km, 0 for 50km+)
        score += Math.max(0, 40 - emp.distance_km);
      }

      return {
        ...emp,
        is_available:   isAvailable,
        trade_match:    tradeMatch,
        times_together: timesTogether,
        score:          Math.round(score),
      };
    });

    // Sort: available first, then by score desc
    suggestions.sort((a, b) => {
      if (a.is_available !== b.is_available) return a.is_available ? -1 : 1;
      return b.score - a.score;
    });

    return res.json({
      ok:          true,
      project,
      suggestions,
    });
  } catch (err) {
    console.error("GET /assignments/suggest error:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});
