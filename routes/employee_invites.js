"use strict";

const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const { pool } = require("../db");

/**
 * ADMIN: Generate (or regenerate) an invite code linked to an existing employee_id.
 *
 * POST /api/employee-invites/generate
 * Body:
 *  - employee_id (required)
 *  - note (required if regeneration / previous invite exists)
 *  - expires_hours (optional, default 48; max 168)
 *
 * Behavior:
 *  - If there is an existing ACTIVE invite for the employee, it will be REVOKED (kept for audit)
 *  - A new ACTIVE invite is created with expires_at = now + expires_hours
 *  - If any prior invite exists for that employee, note is REQUIRED (audit)
 */
function randomCode(len = 24) {
  // URL-safe base64-like (hex) code
  return crypto.randomBytes(Math.ceil(len / 2)).toString("hex").slice(0, len);
}

function clampInt(n, min, max, fallback) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  const i = Math.floor(x);
  return Math.max(min, Math.min(max, i));
}

router.post("/generate", async (req, res) => {
  try {
    const { employee_id, note, expires_hours } = req.body || {};
    const employeeId = employee_id != null ? Number(employee_id) : NaN;

    if (!Number.isFinite(employeeId) || employeeId <= 0) {
      return res.status(400).json({ ok: false, error: "INVALID_EMPLOYEE_ID" });
    }

    const expiresHours = clampInt(expires_hours, 1, 168, 48); // default 48h, max 7 days
    const adminUserId = req.user?.user_id ? Number(req.user.user_id) : null;

    // Ensure employee exists AND belongs to the same company as the admin
    const adminCompanyId = req.user?.company_id ? Number(req.user.company_id) : null;
    if (!adminCompanyId) {
      return res.status(403).json({ ok: false, error: "COMPANY_CONTEXT_REQUIRED" });
    }

    const emp = await pool.query(
      `SELECT id, company_id FROM public.employees WHERE id = $1 LIMIT 1`,
      [employeeId]
    );
    if (!emp.rows.length) {
      return res.status(404).json({ ok: false, error: "EMPLOYEE_NOT_FOUND" });
    }

    //        ADMIN
    if (Number(emp.rows[0].company_id) !== adminCompanyId) {
      return res.status(403).json({ ok: false, error: "EMPLOYEE_COMPANY_MISMATCH" });
    }

    // Any prior invite?
    const prior = await pool.query(
      `SELECT id, status, created_at FROM public.employee_invites WHERE employee_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [employeeId]
    );
    const hasPrior = prior.rows.length > 0;

    if (hasPrior) {
      const n = (note || "").toString().trim();
      if (!n) {
        return res.status(400).json({ ok: false, error: "NOTE_REQUIRED_FOR_REGENERATION" });
      }
    }

    // Revoke existing ACTIVE invites for this employee (keep audit trail)
    await pool.query(
      `
      UPDATE public.employee_invites
      SET status = 'REVOKED'
      WHERE employee_id = $1
        AND status = 'ACTIVE'
        AND used_at IS NULL
      `,
      [employeeId]
    );

    // Create new invite
    // Ensure uniqueness by retrying a few times if collision (very unlikely)
    let inviteCode = null;
    for (let i = 0; i < 5; i++) {
      const candidate = randomCode(24);
      const exists = await pool.query(
        `SELECT 1 FROM public.employee_invites WHERE invite_code = $1 LIMIT 1`,
        [candidate]
      );
      if (!exists.rows.length) {
        inviteCode = candidate;
        break;
      }
    }
    if (!inviteCode) {
      return res.status(500).json({ ok: false, error: "INVITE_CODE_GENERATION_FAILED" });
    }

    const expiresAt = new Date(Date.now() + expiresHours * 3600 * 1000).toISOString();

    const ins = await pool.query(
      `
      INSERT INTO public.employee_invites
        (invite_code, employee_id, status, note, created_by_user_id, expires_at)
      VALUES
        ($1, $2, 'ACTIVE', $3, $4, $5)
      RETURNING id, invite_code, employee_id, status, note, created_by_user_id, created_at, expires_at, used_at
      `,
      [inviteCode, employeeId, (note || null), adminUserId, expiresAt]
    );

    return res.status(201).json({ ok: true, invite: ins.rows[0] });
  } catch (err) {
    console.error("POST /api/employee-invites/generate error:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR", message: err.message });
  }
});

/**
 * ADMIN: List invites (optional filtering by employee_id)
 * GET /api/employee-invites?employee_id=123
 */
router.get("/", async (req, res) => {
  try {
    const adminCompanyId = req.user?.company_id ? Number(req.user.company_id) : null;
    if (!adminCompanyId) {
      return res.status(403).json({ ok: false, error: "COMPANY_CONTEXT_REQUIRED" });
    }

    const employeeId = req.query.employee_id != null ? Number(req.query.employee_id) : null;
    const where = [];
    const params = [];

    //    company_id   employees
    params.push(adminCompanyId);
    where.push(`ei.employee_id IN (SELECT id FROM public.employees WHERE company_id = $${params.length})`);

    if (employeeId && Number.isFinite(employeeId)) {
      params.push(employeeId);
      where.push(`ei.employee_id = $${params.length}`);
    }

    const sql = `
      SELECT ei.id, ei.invite_code, ei.employee_id, ei.status, ei.note, ei.created_by_user_id, ei.created_at, ei.expires_at, ei.used_at
      FROM public.employee_invites ei
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY ei.created_at DESC
      LIMIT 200
    `;

    const { rows } = await pool.query(sql, params);
    return res.json({ ok: true, rows });
  } catch (err) {
    console.error("GET /api/employee-invites error:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR", message: err.message });
  }
});


/**
 * ADMIN: List recent invites (for Admin UI convenience).
 * GET /api/employee-invites/recent?limit=20
 */
router.get("/recent", async (req, res) => {
  try {
    // Require auth + ADMIN
    if (!req.user) return res.status(401).json({ ok: false, error: "MISSING_TOKEN" });
    if (req.user.role !== "ADMIN") return res.status(403).json({ ok: false, error: "FORBIDDEN" });

    const limit = Math.max(1, Math.min(parseInt(req.query.limit || "20", 10) || 20, 100));
    const q = `
      SELECT id, invite_code, employee_id, status, note, created_by_user_id, created_at, expires_at, used_at
      FROM public.employee_invites
      ORDER BY created_at DESC
      LIMIT $1
    `;
    const r = await pool.query(q, [limit]);
    return res.json({ ok: true, invites: r.rows });
  } catch (e) {
    console.error("employee-invites/recent error:", e);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

module.exports = router;
