"use strict";

/**
 * routes/attendance.js
 *
 * Daily attendance workflow:
 *   WORKER  -> POST   /api/attendance/checkin          (check in)
 *   WORKER  -> PATCH  /api/attendance/:id/checkout     (check out)
 *   FOREMAN -> PATCH  /api/attendance/:id/confirm      (confirm or adjust hours)
 *   ALL     -> GET    /api/attendance                  (list by date + project)
 *   ALL     -> GET    /api/attendance/projects         (projects with assignments today)
 *
 * Hours calculation:
 *   raw     = checkout - checkin (minutes)
 *   paid    = raw + 15           (paid break always added)
 *   if raw >= 480: paid -= 30    (unpaid 30min lunch deducted for full shift)
 *   regular = min(8h, paid)
 *   overtime= max(0, paid - 8h)
 */

const express = require("express");
const router  = express.Router();
const { pool }           = require("../db");
const { can, canAny }    = require("../middleware/permissions");
const { audit, ACTIONS } = require("../lib/audit");

// ── Hours calculation ─────────────────────────────────────────
function timeToMin(t) {
  if (!t) return 0;
  const str = String(t).substring(0, 5);
  const [h, m] = str.split(":").map(Number);
  return h * 60 + m;
}

function calcHours(shiftStart, checkInTime, checkOutTime) {
  const shiftStartMin = timeToMin(shiftStart);
  const checkInMin    = timeToMin(checkInTime);
  const checkOutMin   = timeToMin(checkOutTime);

  const rawMinutes = checkOutMin - checkInMin;
  if (rawMinutes <= 0) return { rawMinutes: 0, paidMinutes: 0, regularHours: 0, overtimeHours: 0, lateMinutes: 0 };

  let paidMinutes = rawMinutes + 15;
  if (rawMinutes >= 480) paidMinutes -= 30;

  const totalHours     = paidMinutes / 60;
  const regularHours   = parseFloat(Math.min(8, totalHours).toFixed(2));
  const overtimeHours  = parseFloat(Math.max(0, totalHours - 8).toFixed(2));
  const lateMinutes    = Math.max(0, checkInMin - shiftStartMin);

  return { rawMinutes, paidMinutes, regularHours, overtimeHours, lateMinutes };
}

// ── Foreman notification (fire and forget) ────────────────────
async function notifyForeman(pool, attendanceId, eventType) {
  try {
    const { rows } = await pool.query(
      `SELECT
         atr.check_in_time, atr.check_out_time,
         atr.regular_hours, atr.overtime_hours,
         atr.attendance_date,
         ep.full_name    AS employee_name,
         p.project_code, p.project_name,
         fe.contact_email AS foreman_email,
         fe.full_name     AS foreman_name
       FROM public.attendance_records atr
       JOIN public.employee_profiles ep ON ep.employee_id = atr.employee_id
       JOIN public.projects p ON p.id = atr.project_id
       LEFT JOIN (
         SELECT ar2.project_id, ar2.company_id,
                ep2.full_name, ep2.contact_email
         FROM public.assignment_requests ar2
         JOIN public.employee_profiles ep2 ON ep2.employee_id = ar2.requested_for_employee_id
         WHERE ar2.assignment_role = 'FOREMAN' AND ar2.status = 'APPROVED'
       ) fe ON fe.project_id = atr.project_id AND fe.company_id = atr.company_id
       WHERE atr.id = $1 LIMIT 1`,
      [attendanceId]
    );
    if (!rows.length || !rows[0].foreman_email) return;
    const r = rows[0];

    const sgMail = require("@sendgrid/mail");
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);

    const subject = eventType === "CHECKIN"
      ? `[MEP Platform] Check-In — ${r.employee_name} @ ${r.project_code}`
      : `[MEP Platform] Check-Out — ${r.employee_name} @ ${r.project_code}`;

    const timeStr = eventType === "CHECKIN"
      ? `Checked in at: ${String(r.check_in_time).substring(0,5)}`
      : `Checked out at: ${String(r.check_out_time).substring(0,5)}\nRegular hours: ${r.regular_hours}h\nOvertime: ${r.overtime_hours}h`;

    await sgMail.send({
      to:      r.foreman_email,
      from:    process.env.SENDGRID_FROM_EMAIL,
      subject,
      text:    `Hi ${r.foreman_name},\n\n${r.employee_name} — ${r.project_code} (${r.attendance_date})\n\n${timeStr}\n\nPlease confirm hours on the MEP Platform.\n\n— MEP Platform`,
    });
  } catch (err) {
    console.error("[attendance notify] error:", err.message);
  }
}

// ── GET /api/attendance/projects ─────────────────────────────
// Projects that have assignments on a given date (for tabs)
router.get("/projects", can("attendance.view"), async (req, res) => {
  try {
    const companyId  = req.user.company_id;
    const date       = req.query.date || new Date().toISOString().split("T")[0];

    const { rows } = await pool.query(
      `SELECT DISTINCT p.id, p.project_code, p.project_name
       FROM public.assignment_requests ar
       JOIN public.projects p ON p.id = ar.project_id
       WHERE ar.company_id = $1
         AND ar.status     = 'APPROVED'
         AND ar.start_date <= $2
         AND ar.end_date   >= $2
       ORDER BY p.project_code`,
      [companyId, date]
    );

    return res.json({ ok: true, projects: rows });
  } catch (err) {
    console.error("GET /attendance/projects error:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

// ── GET /api/attendance ───────────────────────────────────────
// List assignments + attendance records for a project/date
router.get("/", canAny(["attendance.view", "attendance.view_self"]), async (req, res) => {
  try {
    const { project_id, date } = req.query;
    const companyId   = req.user.company_id;
    const targetDate  = date || new Date().toISOString().split("T")[0];
    const currentUserId = Number(req.user.user_id);

    const params = [companyId, targetDate, currentUserId];
    let extraFilters = "";

    if (project_id) {
      params.push(Number(project_id));
      extraFilters += ` AND ar.project_id = $${params.length}`;
    }

    // Workers see only themselves
    const role = (req.user.role || "").toUpperCase();
    if (role === "WORKER" || role === "JOURNEYMAN") {
      extraFilters += " AND au.id = $3";
    }

    const { rows } = await pool.query(
      `SELECT
         ar.id              AS assignment_request_id,
         ar.requested_for_employee_id AS employee_id,
         ar.shift_start,
         ar.shift_end,
         ar.assignment_role,
         ar.project_id,
         ep.full_name,
         ep.trade_code,
         p.project_code,
         p.project_name,
         au.id              AS user_id,
         atr.id             AS attendance_id,
         atr.check_in_time,
         atr.check_out_time,
         atr.raw_minutes,
         atr.paid_minutes,
         atr.regular_hours,
         atr.overtime_hours,
         atr.late_minutes,
         atr.status         AS attendance_status,
         atr.confirmed_by,
         atr.confirmed_at,
         atr.confirmed_regular_hours,
         atr.confirmed_overtime_hours,
         atr.foreman_note,
         confirmer.username AS confirmed_by_name,
         (au.id = $3)       AS is_mine
       FROM public.assignment_requests ar
       JOIN public.employee_profiles ep ON ep.employee_id = ar.requested_for_employee_id
       JOIN public.app_users         au ON au.employee_id = ep.employee_id
       JOIN public.projects           p ON p.id           = ar.project_id
       LEFT JOIN public.attendance_records atr
         ON atr.assignment_request_id = ar.id
        AND atr.attendance_date = $2
       LEFT JOIN public.app_users confirmer ON confirmer.id = atr.confirmed_by
       WHERE ar.company_id = $1
         AND ar.status     = 'APPROVED'
         AND ar.start_date <= $2
         AND ar.end_date   >= $2
         ${extraFilters}
       ORDER BY p.project_code, ep.full_name`,
      params
    );

    // Summary counts
    const total     = rows.length;
    const checkedIn = rows.filter(r => r.attendance_status === "CHECKED_IN").length;
    const checkedOut= rows.filter(r => ["CHECKED_OUT","CONFIRMED","ADJUSTED"].includes(r.attendance_status)).length;
    const confirmed = rows.filter(r => ["CONFIRMED","ADJUSTED"].includes(r.attendance_status)).length;

    return res.json({
      ok: true,
      date: targetDate,
      records: rows,
      summary: { total, checked_in: checkedIn, checked_out: checkedOut, confirmed },
    });
  } catch (err) {
    console.error("GET /attendance error:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

// ── POST /api/attendance/checkin ──────────────────────────────
router.post("/checkin", can("attendance.checkin"), async (req, res) => {
  try {
    const { assignment_request_id } = req.body || {};
    const companyId   = req.user.company_id;
    const currentUserId = Number(req.user.user_id);
    const today       = new Date().toISOString().split("T")[0];

    if (!assignment_request_id)
      return res.status(400).json({ ok: false, error: "ASSIGNMENT_REQUIRED" });

    // Verify assignment belongs to current user and is active today
    const asgn = await pool.query(
      `SELECT ar.id, ar.project_id, ar.requested_for_employee_id AS employee_id,
              ar.shift_start, ar.company_id
       FROM public.assignment_requests ar
       JOIN public.app_users au ON au.employee_id = ar.requested_for_employee_id
       WHERE ar.id = $1
         AND ar.company_id = $2
         AND ar.status = 'APPROVED'
         AND ar.start_date <= $3
         AND ar.end_date   >= $3
         AND au.id = $4
       LIMIT 1`,
      [assignment_request_id, companyId, today, currentUserId]
    );

    if (!asgn.rows.length)
      return res.status(403).json({ ok: false, error: "ASSIGNMENT_NOT_FOUND_OR_NOT_YOURS" });

    const a = asgn.rows[0];
    const checkInTime = new Date().toTimeString().substring(0, 5); // HH:MM

    // ── Shift time validation ──────────────────────────────────
    if (a.shift_end) {
      const toMin = (t) => {
        const [h, m] = String(t).substring(0, 5).split(":").map(Number);
        return h * 60 + m;
      };
      const nowMin      = toMin(checkInTime);
      const shiftEndMin = toMin(a.shift_end);

      // Block check-in after shift end
      if (nowMin > shiftEndMin) {
        return res.status(409).json({
          ok:      false,
          error:   "SHIFT_ENDED",
          message: `Check-in not allowed after shift end (${String(a.shift_end).substring(0, 5)}).`,
        });
      }

      // Warn if more than 120 minutes late (still allows check-in)
      if (a.shift_start) {
        const shiftStartMin = toMin(a.shift_start);
        const lateMinutes   = nowMin - shiftStartMin;
        if (lateMinutes > 120) {
          // Allowed but flagged — late_minutes will be recorded automatically
        }
      }
    }
    // ─────────────────────────────────────────────────────────

    // Upsert attendance record
    const { rows } = await pool.query(
      `INSERT INTO public.attendance_records
         (company_id, project_id, assignment_request_id, employee_id,
          attendance_date, shift_start, check_in_time, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'CHECKED_IN', NOW(), NOW())
       ON CONFLICT (company_id, employee_id, project_id, attendance_date)
       DO UPDATE SET
         check_in_time = EXCLUDED.check_in_time,
         status        = 'CHECKED_IN',
         updated_at    = NOW()
       RETURNING *`,
      [companyId, a.project_id, a.id, a.employee_id, today,
       a.shift_start || null, checkInTime]
    );

    await audit(pool, req, {
      action:      ACTIONS.ATTENDANCE_CHECKIN || "ATTENDANCE_CHECKIN",
      entity_type: "attendance_record",
      entity_id:   rows[0].id,
      new_values:  { check_in_time: checkInTime, date: today },
    });

    notifyForeman(pool, rows[0].id, "CHECKIN");

    return res.status(201).json({ ok: true, record: rows[0] });
  } catch (err) {
    console.error("POST /attendance/checkin error:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

// ── PATCH /api/attendance/:id/checkout ───────────────────────
router.patch("/:id/checkout", can("attendance.checkin"), async (req, res) => {
  try {
    const recordId    = Number(req.params.id);
    const companyId   = req.user.company_id;
    const currentUserId = Number(req.user.user_id);

    // Verify record belongs to current user
    const existing = await pool.query(
      `SELECT atr.*, au.id AS user_id
       FROM public.attendance_records atr
       JOIN public.app_users au ON au.employee_id = atr.employee_id
       WHERE atr.id = $1 AND atr.company_id = $2 AND au.id = $3
       LIMIT 1`,
      [recordId, companyId, currentUserId]
    );

    if (!existing.rows.length)
      return res.status(403).json({ ok: false, error: "RECORD_NOT_FOUND_OR_NOT_YOURS" });

    const rec = existing.rows[0];

    if (rec.status !== "CHECKED_IN")
      return res.status(409).json({ ok: false, error: "NOT_CHECKED_IN" });

    const checkOutTime = new Date().toTimeString().substring(0, 5);

    // Calculate hours
    const { rawMinutes, paidMinutes, regularHours, overtimeHours, lateMinutes } =
      calcHours(rec.shift_start, rec.check_in_time, checkOutTime);

    const { rows } = await pool.query(
      `UPDATE public.attendance_records
       SET check_out_time = $1,
           raw_minutes    = $2,
           paid_minutes   = $3,
           regular_hours  = $4,
           overtime_hours = $5,
           late_minutes   = $6,
           status         = 'CHECKED_OUT',
           updated_at     = NOW()
       WHERE id = $7 AND company_id = $8
       RETURNING *`,
      [checkOutTime, rawMinutes, paidMinutes, regularHours, overtimeHours,
       lateMinutes, recordId, companyId]
    );

    await audit(pool, req, {
      action:      ACTIONS.ATTENDANCE_CHECKOUT || "ATTENDANCE_CHECKOUT",
      entity_type: "attendance_record",
      entity_id:   recordId,
      new_values:  { check_out_time: checkOutTime, regular_hours: regularHours, overtime_hours: overtimeHours },
    });

    notifyForeman(pool, recordId, "CHECKOUT");

    return res.json({ ok: true, record: rows[0] });
  } catch (err) {
    console.error("PATCH /attendance/:id/checkout error:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

// ── PATCH /api/attendance/:id/confirm ────────────────────────
// Foreman confirms or adjusts hours
router.patch("/:id/confirm", can("attendance.approve"), async (req, res) => {
  try {
    const recordId  = Number(req.params.id);
    const companyId = req.user.company_id;
    const { regular_hours, overtime_hours, note } = req.body || {};

    const existing = await pool.query(
      "SELECT * FROM public.attendance_records WHERE id = $1 AND company_id = $2 LIMIT 1",
      [recordId, companyId]
    );

    if (!existing.rows.length)
      return res.status(404).json({ ok: false, error: "RECORD_NOT_FOUND" });

    const rec = existing.rows[0];

    if (!["CHECKED_OUT", "CONFIRMED", "ADJUSTED"].includes(rec.status))
      return res.status(409).json({ ok: false, error: "NOT_CHECKED_OUT_YET" });

    // Determine if foreman is adjusting or just confirming
    const isAdjusted =
      (regular_hours  !== undefined && parseFloat(regular_hours)  !== parseFloat(rec.regular_hours)) ||
      (overtime_hours !== undefined && parseFloat(overtime_hours) !== parseFloat(rec.overtime_hours));

    const confirmedRegular  = regular_hours  !== undefined ? parseFloat(regular_hours)  : rec.regular_hours;
    const confirmedOvertime = overtime_hours !== undefined ? parseFloat(overtime_hours) : rec.overtime_hours;
    const newStatus = isAdjusted ? "ADJUSTED" : "CONFIRMED";

    const { rows } = await pool.query(
      `UPDATE public.attendance_records
       SET confirmed_by             = $1,
           confirmed_at             = NOW(),
           confirmed_regular_hours  = $2,
           confirmed_overtime_hours = $3,
           foreman_note             = $4,
           status                   = $5,
           updated_at               = NOW()
       WHERE id = $6 AND company_id = $7
       RETURNING *`,
      [req.user.user_id, confirmedRegular, confirmedOvertime,
       note || null, newStatus, recordId, companyId]
    );

    await audit(pool, req, {
      action:      ACTIONS.ATTENDANCE_CONFIRMED || "ATTENDANCE_CONFIRMED",
      entity_type: "attendance_record",
      entity_id:   recordId,
      new_values:  { status: newStatus, confirmed_regular_hours: confirmedRegular, confirmed_overtime_hours: confirmedOvertime },
    });

    return res.json({ ok: true, record: rows[0] });
  } catch (err) {
    console.error("PATCH /attendance/:id/confirm error:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

module.exports = router;
