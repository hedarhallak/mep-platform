const express = require("express");
const router = express.Router();
// DB (robust import)
const db = require("../db");
const pool = db && db.pool ? db.pool : db;

// Optional guard (keeps crash message clear)
if (!pool || typeof pool.query !== "function") {
  throw new Error("DB pool is not initialized correctly. Expected pool.query to be a function.");
}


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

// Assignment lookup (source of truth)

async function getTodayAssignment(employeeId, companyId) {
  const r = await pool.query(
    `
    SELECT id AS assignment_id, project_id, shift
    FROM public.assignments
    WHERE employee_id = $1
      AND company_id = $2
      AND start_date <= CURRENT_DATE
      AND (end_date IS NULL OR end_date >= CURRENT_DATE)
    ORDER BY start_date DESC
    LIMIT 1
    `,
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
router.get("/today", async (req, res) => {
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
router.post("/today/action", async (req, res) => {
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
        `
        INSERT INTO public.attendance_logs
          (employee_id, company_id, project_id, check_in_at, check_in_location, status, approval_note, created_at, inside_geofence, distance_to_site_m)
        VALUES
          ($1, $2, $3, NOW(), ${UNKNOWN_POINT_SQL}, 'PENDING', 'UI_ARRIVE', NOW(), false, NULL)
        `,
        [employeeId, req.user.company_id, assignment.project_id]
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
router.post("/absence", async (req, res) => {
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
router.get("/shift", async (req, res) => {
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

router.post("/clockin", async (req, res) => {
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

module.exports = { router };
