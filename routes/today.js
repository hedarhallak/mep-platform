const express = require("express");
const router = express.Router();
const pool = require("../db");
const auth = require("../middleware/auth");

/**
 * GET /api/attendance/today
 */
router.get("/today", auth, can("attendance.view_self"), async (req, res) => {
  try {
    const employeeId = req.user.employee_id;
    const companyId = req.user.company_id;
    if (!employeeId) return res.status(400).json({ ok: false, error: "NO_EMPLOYEE_ID" });
    if (!companyId) return res.status(400).json({ ok: false, error: "NO_COMPANY_ID" });
    if (!companyId) return res.status(400).json({ ok: false, error: "NO_COMPANY_ID" });

    const { rows } = await pool.query(
      `
      SELECT
        attendance_id,
        project_id,
        check_in_at,
        check_out_at,
        work_date,
        status
      FROM public.attendance_logs
      WHERE employee_id = $1
        AND company_id = $2
        AND work_date = CURRENT_DATE
      ORDER BY attendance_id DESC
      LIMIT 1
      `,
      [employeeId, companyId]
    );

    if (!rows.length) return res.json({ ok: true, step: null, lastEventAt: null, log: [] });

    const a = rows[0];
    const log = [];
    if (a.check_in_at) log.push({ type: "ARRIVED", at: a.check_in_at, project: String(a.project_id) });
    if (a.check_out_at) log.push({ type: "ENDED", at: a.check_out_at, project: String(a.project_id) });

    let step = null;
    if (a.check_in_at && !a.check_out_at) step = "ARRIVED";
    if (a.check_in_at && a.check_out_at) step = "ENDED";

    res.json({
      ok: true,
      step,
      lastEventAt: a.check_out_at || a.check_in_at || null,
      log,
    });
  } catch (err) {
    console.error("GET /api/attendance/today error:", err);
    res.status(500).json({ ok: false, error: "TODAY_FAILED" });
  }
});

/**
 * POST /api/attendance/today/action
 * Body: { action: "arrive"|"end", project_id?, lat, lng }
 */
router.post("/today/action", auth, can("attendance.checkin"), async (req, res) => {
  try {
    const employeeId = req.user.employee_id;
    const companyId = req.user.company_id;
    const companyId = req.user.company_id;
    if (!employeeId) return res.status(400).json({ ok: false, error: "NO_EMPLOYEE_ID" });
    if (!companyId) return res.status(400).json({ ok: false, error: "NO_COMPANY_ID" });

    const { action, project_id, lat, lng } = req.body || {};
    const a = String(action || "").toLowerCase();

    if (a !== "arrive" && a !== "end") return res.status(400).json({ ok: false, error: "INVALID_ACTION" });
    if (lat == null || lng == null) return res.status(400).json({ ok: false, error: "MISSING_LOCATION" });

    // ARRIVE (✅ no work_date insert because it's GENERATED)
    if (a === "arrive") {
      if (!project_id) return res.status(400).json({ ok: false, error: "MISSING_PROJECT" });

      const { rows } = await pool.query(
        `
        INSERT INTO public.attendance_logs (
          employee_id,
          company_id,
          project_id,
          check_in_at,
          check_in_location,
          status,
          created_at
        )
        VALUES (
          $1,
          $2,
          $3,
          now(),
          ST_SetSRID(ST_MakePoint($4, $5), 4326),
          'PENDING',
          now()
        )
        RETURNING *
        `,
        [employeeId, companyId, project_id, lng, lat]
      );

      return res.json({ ok: true, attendance: rows[0] });
    }

    // END
    const { rows } = await pool.query(
      `
      UPDATE public.attendance_logs
      SET
        check_out_at = now(),
        check_out_location = ST_SetSRID(ST_MakePoint($3, $4), 4326)
      WHERE employee_id = $1
        AND company_id = $2
        AND work_date = CURRENT_DATE
        AND check_out_at IS NULL
      RETURNING *
      `,
      [employeeId, companyId, lng, lat]
    );

    if (!rows.length) return res.status(400).json({ ok: false, error: "NO_OPEN_ATTENDANCE" });
    return res.json({ ok: true, attendance: rows[0] });
  } catch (err) {
    console.error("POST /api/attendance/today/action error:", err);
    res.status(500).json({ ok: false, error: "ACTION_FAILED" });
  }
});

/**
 * POST /api/attendance/today/reset
 * Admin-only.
 * Body optional: { employee_id }
 */
router.post("/today/reset", auth, can("attendance.approve"), async (req, res) => {
  try {
    const role = String(req.user.role || "").toUpperCase();
    // Role check handled by can() middleware

    const companyId = req.user.company_id;
    if (!companyId) return res.status(400).json({ ok: false, error: "NO_COMPANY_ID" });

    const fallbackEmpId = req.user.employee_id ? Number(req.user.employee_id) : null;
    const targetEmpId = req.body?.employee_id ? Number(req.body.employee_id) : fallbackEmpId;
    if (!targetEmpId) return res.status(400).json({ ok: false, error: "NO_EMPLOYEE_ID" });

    const { rowCount } = await pool.query(
      `
      DELETE FROM public.attendance_logs
      WHERE employee_id = $1
        AND company_id = $2
        AND work_date = CURRENT_DATE
      `,
      [targetEmpId, companyId]
    );

    res.json({ ok: true, deleted: rowCount });
  } catch (err) {
    console.error("POST /api/attendance/today/reset error:", err);
    res.status(500).json({ ok: false, error: "RESET_FAILED" });
  }
});

module.exports = router;
