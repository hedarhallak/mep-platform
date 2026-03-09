// routes/borrow_requests.js
"use strict";

const express = require("express");
const router = express.Router();
const { pool } = require("../db");

// Roles:
// - Create: FOREMAN / PM / ADMIN
// - Approve/Reject: PM / ADMIN
function requireCreateAccess(req, res, next) {
  const role = req.user?.role;
  if (!["FOREMAN", "PM", "ADMIN"].includes(role)) {
    return res.status(403).json({ ok: false, error: "Forbidden" });
  }
  next();
}

function requireDecisionAccess(req, res, next) {
  const role = req.user?.role;
  if (!["PM", "ADMIN"].includes(role)) {
    return res.status(403).json({ ok: false, error: "Forbidden" });
  }
  next();
}

// GET /api/borrow_requests?status=PENDING&employee_id=1
router.get("/", requireCreateAccess, async (req, res) => {
  try {
    const companyId = req.user?.company_id ? Number(req.user.company_id) : null;
    if (!companyId) return res.status(403).json({ ok: false, error: "COMPANY_CONTEXT_REQUIRED" });

    const status = req.query.status ? String(req.query.status).trim() : null;
    const employeeId = req.query.employee_id ? Number(req.query.employee_id) : null;

    const sql = `
      SELECT
        id, created_at, status, decided_at, decided_by_user_id, decision_note,
        requested_by_user_id, requested_by_employee_id,
        employee_id, from_project_id, to_project_id,
        requested_from, requested_to, note
      FROM public.borrow_requests
      WHERE company_id = $3
        AND ($1::text IS NULL OR status = $1)
        AND ($2::bigint IS NULL OR employee_id = $2)
      ORDER BY created_at DESC
      LIMIT 200
    `;

    const { rows } = await pool.query(sql, [status, employeeId, companyId]);
    return res.json({ ok: true, rows });
  } catch (err) {
    console.error("GET /api/borrow_requests error:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// POST /api/borrow_requests
router.post("/", requireCreateAccess, async (req, res) => {
  try {
    const {
      employee_id,
      from_project_id,
      to_project_id,
      requested_from,
      requested_to,
      note = null
    } = req.body || {};

    if (!employee_id || !from_project_id || !to_project_id || !requested_from || !requested_to) {
      return res.status(400).json({
        ok: false,
        error: "Missing required fields: employee_id, from_project_id, to_project_id, requested_from, requested_to",
      });
    }

    if (String(to_project_id) === String(from_project_id)) {
      return res.status(400).json({ ok: false, error: "to_project_id must be different from from_project_id" });
    }

    if (String(requested_to) < String(requested_from)) {
      return res.status(400).json({ ok: false, error: "requested_to must be >= requested_from" });
    }

    const sql = `
      INSERT INTO public.borrow_requests (
        requested_by_user_id,
        requested_by_employee_id,
        employee_id,
        from_project_id,
        to_project_id,
        requested_from,
        requested_to,
        note
      ) VALUES ($1, $2, $3, $4, $5, $6::date, $7::date, $8)
      RETURNING *
    `;

    const requestedByUserId = Number(req.user?.user_id);
    const requestedByEmployeeId = req.user?.employee_id ? Number(req.user.employee_id) : null;

    const { rows } = await pool.query(sql, [
      requestedByUserId,
      requestedByEmployeeId,
      Number(employee_id),
      Number(from_project_id),
      Number(to_project_id),
      requested_from,
      requested_to,
      note
    ]);

    return res.status(201).json({ ok: true, row: rows[0] });
  } catch (err) {
    console.error("POST /api/borrow_requests error:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// PUT /api/borrow_requests/:id/approve
router.put("/:id/approve", requireDecisionAccess, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: "INVALID_ID" });

    const decision_note = (req.body?.decision_note ?? null);

    const sql = `
      UPDATE public.borrow_requests
      SET status='APPROVED',
          decided_at=now(),
          decided_by_user_id=$1,
          decision_note=$2
      WHERE id=$3 AND status='PENDING'
      RETURNING *
    `;
    const { rows } = await pool.query(sql, [Number(req.user.user_id), decision_note, id]);

    if (!rows.length) return res.status(404).json({ ok: false, error: "NOT_FOUND_OR_NOT_PENDING" });
    return res.json({ ok: true, row: rows[0] });
  } catch (err) {
    console.error("PUT /api/borrow_requests/:id/approve error:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// PUT /api/borrow_requests/:id/reject
router.put("/:id/reject", requireDecisionAccess, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: "INVALID_ID" });

    const decision_note = (req.body?.decision_note ?? null);

    const sql = `
      UPDATE public.borrow_requests
      SET status='REJECTED',
          decided_at=now(),
          decided_by_user_id=$1,
          decision_note=$2
      WHERE id=$3 AND status='PENDING'
      RETURNING *
    `;
    const { rows } = await pool.query(sql, [Number(req.user.user_id), decision_note, id]);

    if (!rows.length) return res.status(404).json({ ok: false, error: "NOT_FOUND_OR_NOT_PENDING" });
    return res.json({ ok: true, row: rows[0] });
  } catch (err) {
    console.error("PUT /api/borrow_requests/:id/reject error:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

module.exports = router;
