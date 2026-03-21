const express = require("express");
const router = express.Router();
// DB (robust import)
const db = require("../db");
const pool = db && db.pool ? db.pool : db;

// Optional guard (keeps crash message clear)
if (!pool || typeof pool.query !== "function") {
  throw new Error("DB pool is not initialized correctly. Expected pool.query to be a function.");
}


const { can } = require("../middleware/permissions");

// ---------- Auth middleware (robust) ----------
let requireAuth = null;
try {
  const mod = require("../middleware/auth");
  if (typeof mod === "function") requireAuth = mod;
  else if (mod && typeof mod === "object") {
    const candidates = ["requireAuth","authMiddleware","authenticateToken","verifyToken","tokenMiddleware","authenticate"];
    for (const k of candidates) {
      if (typeof mod[k] === "function") { requireAuth = mod[k]; break; }
    }
  }
} catch (e) {
  console.error("[attendance] auth middleware load failed:", e.message);
}

router.use((req, res, next) => {
  if (!requireAuth) return res.status(500).json({ ok: false, error: "AUTH_MIDDLEWARE_NOT_FOUND" });
  return requireAuth(req, res, next);
});

// ---------- Helpers ----------
const UNKNOWN_POINT_SQL = "ST_SetSRID(ST_MakePoint(0,0),4326)";

async function resolveEmployeeId(req) {
  if (req.user?.employee_id) return Number(req.user.employee_id);
  const userId = req.user?.user_id || req.user?.id;
  if (userId) {
    const r = await pool.query(`SELECT employee_id FROM public.app_users WHERE id = $1 LIMIT 1`, [userId]);
    const emp = r.rows[0]?.employee_id;
    if (emp) return Number(emp);
  }
  return null;
}

async function resolveUserId(req) {
  return req.user?.id || req.user?.user_id || null;
}

async function getOpenRow(employeeId, companyId) {
  const r = await pool.query(
    `
    SELECT attendance_id, employee_id, project_id, check_in_at, check_out_at, status, work_date
    FROM public.attendance_logs
    WHERE employee_id = $1
      AND company_id = $2
      AND check_out_at IS NULL
    ORDER BY check_in_at DESC
    LIMIT 1
    `,
    [employeeId, companyId]
  );
  return r.rows[0] || null;
}

async function getTodayRows(employeeId, companyId) {
  const r = await pool.query(
    `
    SELECT attendance_id, employee_id, project_id, check_in_at, check_out_at, status, work_date, approval_note
    FROM public.attendance_logs
    WHERE employee_id = $1
      AND company_id = $2
      AND work_date = CURRENT_DATE
    ORDER BY created_at ASC
    `,
    [employeeId, companyId]
  );
  return r.rows;
}

// Assignment lookup — source of truth is assignment_requests
async function getTodayAssignment(employeeId, companyId) {
  const r = await pool.query(
    `SELECT
       ar.id           AS assignment_id,
       ar.project_id,
       ar.shift_start  AS shift_start_time,
       ar.shift_end    AS shift_end_time,
       ar.assignment_role,
       ar.notes
     FROM public.assignment_requests ar
     WHERE ar.requested_for_employee_id = $1
       AND ar.company_id  = $2
       AND ar.status      = 'APPROVED'
       AND ar.start_date <= CURRENT_DATE
       AND ar.end_date   >= CURRENT_DATE
     ORDER BY ar.start_date DESC
     LIMIT 1`,
    [employeeId, companyId]
  );
  return r.rows[0] || null;
}

function computeStep(openRow) {
  return openRow ? "ON_SITE" : "NOT_ARRIVED";
}

function nextAction(openRow) {
  return openRow ? { key: "END", label: "End" } : { key: "ARRIVE", label: "Arrive" };
}

// ---------- GET /today ----------
router.get("/today", can("attendance.view_self"), async (req, res) => {
  try {
    const employeeId = await resolveEmployeeId(req);
    if (!employeeId) return res.status(400).json({ ok: false, error: "MISSING_EMPLOYEE" });

    const companyId = req.user.company_id;
    if (!companyId) return res.status(400).json({ ok: false, error: "NO_COMPANY_ID" });

    const openRow = await getOpenRow(employeeId, req.user.company_id);
    const log = await getTodayRows(employeeId, req.user.company_id);

    const assignment = await getTodayAssignment(employeeId, req.user.company_id);

    return res.json({
      ok: true,
      step: computeStep(openRow),
      action: nextAction(openRow),
      today_project_id: openRow?.project_id || assignment?.project_id || null,
      shift_start_time: assignment?.shift_start_time || null,
      shift_end_time: assignment?.shift_end_time || null,
      assignment_id: assignment?.assignment_id || null,
      has_assignment_today: !!assignment,
      log,
      open_row: openRow,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "TODAY_FAILED" });
  }
});

// ---------- POST /today/action ----------
router.post("/today/action", can("attendance.checkin"), async (req, res) => {
  try {
    const employeeId = await resolveEmployeeId(req);
    if (!employeeId) return res.status(400).json({ ok: false, error: "MISSING_EMPLOYEE" });

    const companyId = req.user.company_id;
    if (!companyId) return res.status(400).json({ ok: false, error: "NO_COMPANY_ID" });

    const openRow = await getOpenRow(employeeId, req.user.company_id);

    if (!openRow) {
      const assignment = await getTodayAssignment(employeeId, req.user.company_id);
      if (!assignment?.project_id) {
        return res.status(409).json({ ok: false, error: "NO_ASSIGNMENT_TODAY" });
      }

      await pool.query(
        `INSERT INTO public.attendance_logs
           (employee_id, company_id, project_id, assignment_request_id,
            check_in_at, check_in_location, status, approval_note,
            created_at, inside_geofence, distance_to_site_m)
         VALUES
           ($1, $2, $3, $4, NOW(), ${UNKNOWN_POINT_SQL}, 'PENDING', 'UI_ARRIVE', NOW(), false, NULL)`,
        [employeeId, req.user.company_id, assignment.project_id, assignment.assignment_id]
      );

      return res.json({ ok: true, did: "ARRIVE", project_id: assignment.project_id });
    }

    await pool.query(
      `
      UPDATE public.attendance_logs
      SET check_out_at = NOW(),
          check_out_location = ${UNKNOWN_POINT_SQL},
          auto_closed_at = NULL,
          auto_close_reason = NULL
      WHERE attendance_id = $1
        AND company_id = $2
      `,
      [openRow.attendance_id, req.user.company_id]
    );

    return res.json({ ok: true, did: "END", closed_attendance_id: openRow.attendance_id });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "TODAY_ACTION_FAILED" });
  }
});

// ---------- NEW: POST /absence (assignment_id based) ----------
/**
 * Body:
 * {
 *   assignment_id: number,
 *   work_date: "YYYY-MM-DD" (optional, default CURRENT_DATE),
 *   reason_code: "SICK" | ...,
 *   note: "optional"
 * }
 *
 * DB triggers enforce:
 * - assignment exists
 * - work_date within assignment range
 * - cannot submit after check-in
 * - cannot check-in after absence (via attendance_logs trigger)
 */
router.post("/absence", can("attendance.checkin"), async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    const assignmentId = Number(req.body?.assignment_id);
    const reasonCode = String(req.body?.reason_code || "").trim();
    const note = req.body?.note !== undefined ? String(req.body.note || "").trim() : null;
    const workDate = req.body?.work_date ? String(req.body.work_date).slice(0,10) : null;

    if (!Number.isFinite(assignmentId) || assignmentId <= 0) {
      return res.status(400).json({ ok: false, error: "BAD_ASSIGNMENT_ID" });
    }
    if (!reasonCode) {
      return res.status(400).json({ ok: false, error: "MISSING_REASON" });
    }

    const q = `
      INSERT INTO public.attendance_absences
        (assignment_id, work_date, reason_code, note, submitted_by_user_id, company_id)
      VALUES
        ($1, COALESCE($2::date, CURRENT_DATE), $3, $4, $5, $6)
      RETURNING absence_id, assignment_id, work_date, employee_id, project_id, reason_code, note, submitted_at
    `;
    const r = await pool.query(q, [assignmentId, workDate, reasonCode, note, userId, req.user.company_id]);

    return res.json({ ok: true, absence: r.rows[0] });
  } catch (e) {
    // Surface trigger errors clearly
    const msg = String(e.message || "");
    if (msg.includes("NO_ASSIGNMENT_FOR_ABSENCE") || msg.includes("ASSIGNMENT_NOT_FOUND")) {
      return res.status(409).json({ ok: false, error: "ASSIGNMENT_NOT_FOUND" });
    }
    if (msg.includes("ABSENCE_DATE_OUTSIDE_ASSIGNMENT_RANGE")) {
      return res.status(409).json({ ok: false, error: "ABSENCE_DATE_OUTSIDE_ASSIGNMENT_RANGE" });
    }
    if (msg.includes("CANNOT_SUBMIT_ABSENCE_AFTER_CHECKIN")) {
      return res.status(409).json({ ok: false, error: "CANNOT_SUBMIT_ABSENCE_AFTER_CHECKIN" });
    }
    console.error(e);
    return res.status(500).json({ ok: false, error: "ABSENCE_SUBMIT_FAILED" });
  }
});

// ---------- SHIFT + CLOCKIN (kept) ----------
router.get("/shift", can("attendance.view_self"), async (req, res) => {
  try {
    const employeeId = await resolveEmployeeId(req);
    if (!employeeId) return res.status(400).json({ ok: false, error: "Missing employee" });

    const companyId = req.user.company_id;
    if (!companyId) return res.status(400).json({ ok: false, error: "NO_COMPANY_ID" });

    const a = await getTodayAssignment(employeeId, req.user.company_id);
    if (!a) return res.json({ ok: true, project_id: null, shift_start_time: null });

    return res.json({ ok: true, project_id: a.project_id, shift_start_time: a.shift_start_time });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "SHIFT_LOOKUP_FAILED" });
  }
});

router.post("/clockin", can("attendance.checkin"), async (req, res) => {
  try {
    const employeeId = await resolveEmployeeId(req);
    if (!employeeId) return res.status(400).json({ ok: false, error: "Missing employee" });

    const companyId = req.user.company_id;
    if (!companyId) return res.status(400).json({ ok: false, error: "NO_COMPANY_ID" });

    const projectId = Number(req.body?.project_id);
    const startTime = String(req.body?.start_time || "").trim();
    if (!Number.isFinite(projectId) || projectId <= 0) return res.status(400).json({ ok: false, error: "BAD_PROJECT_ID" });
    if (!/^\d{2}:\d{2}(:\d{2})?$/.test(startTime)) return res.status(400).json({ ok: false, error: "BAD_START_TIME" });

    const open = await pool.query(
      `
      SELECT attendance_id, project_id, check_in_at, status
      FROM public.attendance_logs
      WHERE employee_id = $1 AND company_id = $2 AND check_out_at IS NULL
      ORDER BY check_in_at DESC
      LIMIT 1
      `,
      [employeeId, companyId]
    );
    if (open.rowCount > 0) return res.json({ ok: true, duplicate_open: true, open_row: open.rows[0] });

    const insQ = `
      INSERT INTO public.attendance_logs
        (employee_id, company_id, project_id, check_in_at, check_in_location, status, approval_note, created_at, inside_geofence, distance_to_site_m)
      VALUES
        ($1, $2, $3, (CURRENT_DATE::timestamp + $4::time), ${UNKNOWN_POINT_SQL}, 'PENDING', 'AUTO_CLOCKIN', NOW(), false, NULL)
      RETURNING attendance_id, employee_id, project_id, check_in_at, status, work_date, approval_note
    `;
    const r = await pool.query(insQ, [employeeId, companyId, projectId, startTime]);
    return res.json({ ok: true, row: r.rows[0] });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "CLOCKIN_FAILED" });
  }
});

// ── POST /foreman-checkin ────────────────────────────────────
// Foreman checks in an employee on their behalf
router.post("/foreman-checkin", can("attendance.checkin"), async (req, res) => {
  try {
    const companyId  = req.user.company_id;
    const projectId  = Number(req.body?.project_id);
    const employeeId = Number(req.body?.employee_id);
    const startTime  = String(req.body?.start_time || "").trim();

    if (!projectId)  return res.status(400).json({ ok: false, error: "BAD_PROJECT_ID" });
    if (!employeeId) return res.status(400).json({ ok: false, error: "BAD_EMPLOYEE_ID" });
    if (!/^\d{2}:\d{2}(:\d{2})?$/.test(startTime))
      return res.status(400).json({ ok: false, error: "BAD_START_TIME" });

    // Check no open session
    const open = await pool.query(
      `SELECT attendance_id FROM public.attendance_logs
       WHERE employee_id = $1 AND company_id = $2 AND check_out_at IS NULL LIMIT 1`,
      [employeeId, companyId]
    );
    if (open.rowCount > 0)
      return res.json({ ok: true, duplicate_open: true, open_row: open.rows[0] });

    // Get assignment_request_id for today
    const asgn = await pool.query(
      `SELECT id FROM public.assignment_requests
       WHERE requested_for_employee_id = $1 AND company_id = $2
         AND status = 'APPROVED' AND start_date <= CURRENT_DATE AND end_date >= CURRENT_DATE
       ORDER BY start_date DESC LIMIT 1`,
      [employeeId, companyId]
    );

    const { rows } = await pool.query(
      `INSERT INTO public.attendance_logs
         (employee_id, company_id, project_id, assignment_request_id,
          check_in_at, check_in_location, status, approval_note,
          created_at, inside_geofence, distance_to_site_m)
       VALUES
         ($1, $2, $3, $4,
          (CURRENT_DATE::timestamp + $5::time), ${UNKNOWN_POINT_SQL},
          'PENDING', 'FOREMAN_CHECKIN', NOW(), false, NULL)
       RETURNING attendance_id, employee_id, project_id, check_in_at`,
      [employeeId, companyId, projectId, asgn.rows[0]?.id || null, startTime]
    );
    return res.json({ ok: true, row: rows[0] });
  } catch (e) {
    console.error("POST /foreman-checkin error:", e);
    return res.status(500).json({ ok: false, error: "FOREMAN_CHECKIN_FAILED" });
  }
});

// ── POST /foreman-checkout ───────────────────────────────────
// Foreman checks out an employee on their behalf
router.post("/foreman-checkout", can("attendance.checkin"), async (req, res) => {
  try {
    const companyId    = req.user.company_id;
    const employeeId   = Number(req.body?.employee_id);
    const overtimeHours = req.body?.overtime_hours ? Number(req.body.overtime_hours) : null;

    if (!employeeId) return res.status(400).json({ ok: false, error: "BAD_EMPLOYEE_ID" });

    // Find open session
    const open = await pool.query(
      `SELECT attendance_id FROM public.attendance_logs
       WHERE employee_id = $1 AND company_id = $2 AND check_out_at IS NULL
       ORDER BY check_in_at DESC LIMIT 1`,
      [employeeId, companyId]
    );
    if (!open.rowCount)
      return res.status(409).json({ ok: false, error: "NO_OPEN_SESSION" });

    const attendanceId = open.rows[0].attendance_id;

    await pool.query(
      `UPDATE public.attendance_logs
       SET check_out_at = NOW(),
           check_out_location = ${UNKNOWN_POINT_SQL},
           overtime_hours = COALESCE($1, overtime_hours)
       WHERE attendance_id = $2 AND company_id = $3`,
      [overtimeHours, attendanceId, companyId]
    );

    return res.json({ ok: true, attendance_id: attendanceId });
  } catch (e) {
    console.error("POST /foreman-checkout error:", e);
    return res.status(500).json({ ok: false, error: "FOREMAN_CHECKOUT_FAILED" });
  }
});
// Foreman requests overtime approval for a completed attendance log
router.post("/overtime/request", can("attendance.checkin"), async (req, res) => {
  try {
    const companyId      = req.user.company_id;
    const { attendance_id, overtime_hours, note } = req.body || {};

    if (!attendance_id || !overtime_hours)
      return res.status(400).json({ ok: false, error: "MISSING_FIELDS" });

    const hours = Number(overtime_hours);
    if (!Number.isFinite(hours) || hours <= 0 || hours > 12)
      return res.status(400).json({ ok: false, error: "INVALID_OVERTIME_HOURS" });

    // Verify log exists and is closed
    const { rows } = await pool.query(
      `SELECT attendance_id, check_in_at, check_out_at, employee_id
       FROM public.attendance_logs
       WHERE attendance_id = $1 AND company_id = $2 LIMIT 1`,
      [attendance_id, companyId]
    );
    if (!rows.length)
      return res.status(404).json({ ok: false, error: "LOG_NOT_FOUND" });
    if (!rows[0].check_out_at)
      return res.status(409).json({ ok: false, error: "SESSION_STILL_OPEN" });

    await pool.query(
      `UPDATE public.attendance_logs
       SET overtime_hours = $1, approval_note = $2
       WHERE attendance_id = $3 AND company_id = $4`,
      [hours, note || null, attendance_id, companyId]
    );

    return res.json({ ok: true, attendance_id, overtime_hours: hours });
  } catch (e) {
    console.error("POST /overtime/request error:", e);
    return res.status(500).json({ ok: false, error: "OVERTIME_REQUEST_FAILED" });
  }
});

// ── PATCH /overtime/:id/approve ──────────────────────────────
// Admin approves overtime
router.patch("/overtime/:id/approve", can("attendance.overtime_approve"), async (req, res) => {
  try {
    const companyId    = req.user.company_id;
    const attendanceId = Number(req.params.id);
    const { approved, note } = req.body || {};

    const { rows } = await pool.query(
      `UPDATE public.attendance_logs
       SET overtime_approved    = $1,
           overtime_approved_by = $2,
           approval_note        = COALESCE($3, approval_note)
       WHERE attendance_id = $4 AND company_id = $5
       RETURNING attendance_id, overtime_hours, overtime_approved`,
      [!!approved, req.user.user_id, note || null, attendanceId, companyId]
    );
    if (!rows.length)
      return res.status(404).json({ ok: false, error: "LOG_NOT_FOUND" });

    return res.json({ ok: true, log: rows[0] });
  } catch (e) {
    console.error("PATCH /overtime/approve error:", e);
    return res.status(500).json({ ok: false, error: "OVERTIME_APPROVE_FAILED" });
  }
});

// ── GET /report/daily ────────────────────────────────────────
// Daily attendance report for a project on a given date
// Query params: project_id, date (YYYY-MM-DD, default today)
router.get("/report/daily", can("attendance.view"), async (req, res) => {
  try {
    const companyId  = req.user.company_id;
    const projectId  = req.query.project_id ? Number(req.query.project_id) : null;
    const reportDate = req.query.date || new Date().toISOString().split("T")[0];

    let query = `
      SELECT
        al.attendance_id,
        al.work_date,
        al.check_in_at,
        al.check_out_at,
        al.overtime_hours,
        al.overtime_approved,
        al.manager_approved,
        al.attendance_id,
        al.overtime_approved,
        al.break_minutes,
        ep.full_name   AS employee_name,
        ep.trade_code,
        ar.assignment_role,
        p.project_code,
        p.project_name,
        CASE
          WHEN al.check_in_at IS NOT NULL AND al.check_out_at IS NOT NULL THEN
            ROUND(
              (EXTRACT(EPOCH FROM (al.check_out_at - al.check_in_at)) / 3600
               - COALESCE(al.break_minutes, 0) / 60.0
              )::numeric, 2
            )
          ELSE NULL
        END AS worked_hours
      FROM public.attendance_logs al
      JOIN public.employee_profiles ep ON ep.employee_id = al.employee_id
      JOIN public.projects            p  ON p.id          = al.project_id
      LEFT JOIN public.assignment_requests ar
             ON ar.id = al.assignment_request_id
      WHERE al.company_id = $1
        AND al.work_date  = $2::date
    `;

    const params = [companyId, reportDate];

    if (projectId) {
      params.push(projectId);
      query += ` AND al.project_id = $${params.length}`;
    }

    query += " ORDER BY p.project_code, ep.full_name";

    const { rows } = await pool.query(query, params);

    // Summary per project
    const summary = rows.reduce((acc, r) => {
      const key = r.project_code;
      if (!acc[key]) acc[key] = { project_code: key, project_name: r.project_name, present: 0, total_hours: 0, total_overtime: 0 };
      acc[key].present++;
      acc[key].total_hours    += Number(r.worked_hours || 0);
      acc[key].total_overtime += Number(r.overtime_hours || 0);
      return acc;
    }, {});

    return res.json({
      ok: true,
      date: reportDate,
      records: rows,
      summary: Object.values(summary),
    });
  } catch (e) {
    console.error("GET /report/daily error:", e);
    return res.status(500).json({ ok: false, error: "REPORT_FAILED" });
  }
});

module.exports = { router };
