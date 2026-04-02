"use strict";

/**
 * routes/reports.js
 *
 * All reports use attendance_records + assignment_requests tables.
 * Filters: ?from=YYYY-MM-DD&to=YYYY-MM-DD  (both required)
 *          &project_id=N  (optional)
 *          &employee_id=N (optional)
 *
 * GET /api/reports/hours            — Regular + OT per employee
 * GET /api/reports/attendance       — Presence/absence summary per project
 * GET /api/reports/travel           — CCQ travel allowance (distance-based)
 * GET /api/reports/assignments      — Assignment roster (from → to)
 * GET /api/reports/distance         — Employees 41km+ from project site
 */

const express = require("express");
const router  = express.Router();
const { pool } = require("../db");
const { can }  = require("../middleware/permissions");

// ── Date helpers ───────────────────────────────────────────────
function parseRange(req, res) {
  const { from, to } = req.query;
  if (!from || !to) {
    res.status(400).json({ ok: false, error: "from and to dates are required" });
    return null;
  }
  if (from > to) {
    res.status(400).json({ ok: false, error: "from must be <= to" });
    return null;
  }
  return { from, to };
}

// ── CCQ Travel Allowance rates (per day, CAD) ─────────────────
// Source: ACQ/CCQ collective agreement schedule
// Zone determined by distance_km from employee home to project site
// 41-65 km  → T2200 tax form only (no direct payment)
// 65-75 km  → $15.61 / day
// 76-100 km → $20.82 / day
// 101-125   → $26.02 / day
// 126-150   → $31.23 / day
// 151-175   → $36.43 / day
// 176-200   → $41.64 / day
// 200+      → $46.84 / day
function ccqZone(km) {
  if (!km || km < 41)  return { zone: null,   rate: 0,     label: "N/A" };
  if (km < 65)         return { zone: "T2200", rate: 0,     label: "41–65 km — T2200 form" };
  if (km < 76)         return { zone: "A",     rate: 15.61, label: "65–75 km" };
  if (km < 101)        return { zone: "B",     rate: 20.82, label: "76–100 km" };
  if (km < 126)        return { zone: "C",     rate: 26.02, label: "101–125 km" };
  if (km < 151)        return { zone: "D",     rate: 31.23, label: "126–150 km" };
  if (km < 176)        return { zone: "E",     rate: 36.43, label: "151–175 km" };
  if (km < 201)        return { zone: "F",     rate: 41.64, label: "176–200 km" };
  return               { zone: "G",     rate: 46.84, label: "200+ km" };
}

// ─────────────────────────────────────────────────────────────
// GET /api/reports/hours
// Regular + OT per employee over date range
// ─────────────────────────────────────────────────────────────
router.get("/hours", can("reports.view"), async (req, res) => {
  try {
    const range = parseRange(req, res); if (!range) return;
    const { from, to } = range;
    const companyId = req.user.company_id;
    const params = [companyId, from, to];
    let extra = "";
    if (req.query.project_id)  { params.push(req.query.project_id);  extra += ` AND atr.project_id = $${params.length}`; }
    if (req.query.employee_id) { params.push(req.query.employee_id); extra += ` AND atr.employee_id = $${params.length}`; }

    const { rows } = await pool.query(`
      SELECT
        ep.employee_id,
        ep.full_name,
        ep.trade_code,
        p.project_code,
        p.project_name,
        COUNT(atr.id)::int                                                AS days_worked,
        SUM(COALESCE(atr.confirmed_regular_hours,  atr.regular_hours,  0))::numeric(10,2) AS total_regular,
        SUM(COALESCE(atr.confirmed_overtime_hours, atr.overtime_hours, 0))::numeric(10,2) AS total_overtime,
        SUM(COALESCE(atr.confirmed_regular_hours,  atr.regular_hours,  0)
          + COALESCE(atr.confirmed_overtime_hours, atr.overtime_hours, 0))::numeric(10,2) AS total_hours,
        COUNT(CASE WHEN atr.status IN ('CONFIRMED','ADJUSTED') THEN 1 END)::int AS confirmed_days,
        COUNT(CASE WHEN atr.late_minutes > 15 THEN 1 END)::int AS late_days
      FROM public.attendance_records atr
      JOIN public.employee_profiles ep ON ep.employee_id = atr.employee_id
      JOIN public.projects p           ON p.id = atr.project_id
      WHERE atr.company_id      = $1
        AND atr.attendance_date >= $2
        AND atr.attendance_date <= $3
        AND atr.status NOT IN ('OPEN')
        ${extra}
      GROUP BY ep.employee_id, ep.full_name, ep.trade_code, p.project_code, p.project_name
      ORDER BY p.project_code, ep.full_name
    `, params);

    const totals = rows.reduce((acc, r) => ({
      days_worked:   acc.days_worked   + Number(r.days_worked),
      total_regular: acc.total_regular + Number(r.total_regular),
      total_overtime:acc.total_overtime+ Number(r.total_overtime),
      total_hours:   acc.total_hours   + Number(r.total_hours),
    }), { days_worked: 0, total_regular: 0, total_overtime: 0, total_hours: 0 });

    return res.json({ ok: true, from, to, records: rows, totals });
  } catch (err) {
    console.error("GET /reports/hours error:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/reports/attendance
// Daily presence/absence summary per project
// ─────────────────────────────────────────────────────────────
router.get("/attendance", can("reports.view"), async (req, res) => {
  try {
    const range = parseRange(req, res); if (!range) return;
    const { from, to } = range;
    const companyId = req.user.company_id;
    const params = [companyId, from, to];
    let extra = "";
    if (req.query.project_id) { params.push(req.query.project_id); extra += ` AND ar.project_id = $${params.length}`; }

    const { rows } = await pool.query(`
      SELECT
        p.id AS project_id,
        p.project_code,
        p.project_name,
        ep.employee_id,
        ep.full_name,
        ep.trade_code,
        ar.assignment_role,
        ar.start_date,
        ar.end_date,
        COUNT(DISTINCT d.day)::int                  AS scheduled_days,
        COUNT(DISTINCT atr.attendance_date)::int     AS present_days,
        COUNT(DISTINCT d.day)::int
          - COUNT(DISTINCT atr.attendance_date)::int AS absent_days,
        COUNT(CASE WHEN atr.late_minutes > 15 THEN 1 END)::int AS late_days
      FROM public.assignment_requests ar
      JOIN public.employee_profiles ep ON ep.employee_id = ar.requested_for_employee_id
      JOIN public.projects p           ON p.id = ar.project_id
      -- generate scheduled working days in range
      JOIN LATERAL (
        SELECT generate_series(
          GREATEST(ar.start_date, $2::date),
          LEAST(ar.end_date,      $3::date),
          '1 day'
        )::date AS day
      ) d ON EXTRACT(DOW FROM d.day) NOT IN (0, 6) -- exclude weekends
      LEFT JOIN public.attendance_records atr
        ON atr.assignment_request_id = ar.id
       AND atr.attendance_date = d.day
       AND atr.status NOT IN ('OPEN')
      WHERE ar.company_id = $1
        AND ar.status     = 'APPROVED'
        AND ar.start_date <= $3
        AND ar.end_date   >= $2
        ${extra}
      GROUP BY p.id, p.project_code, p.project_name,
               ep.employee_id, ep.full_name, ep.trade_code,
               ar.assignment_role, ar.start_date, ar.end_date
      ORDER BY p.project_code, ep.full_name
    `, params);

    return res.json({ ok: true, from, to, records: rows });
  } catch (err) {
    console.error("GET /reports/attendance error:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/reports/travel
// CCQ travel allowance — employees who worked + have distance_km
// ─────────────────────────────────────────────────────────────
router.get("/travel", can("reports.view"), async (req, res) => {
  try {
    const range = parseRange(req, res); if (!range) return;
    const { from, to } = range;
    const companyId = req.user.company_id;
    const params = [companyId, from, to];
    let extra = "";
    if (req.query.project_id)  { params.push(req.query.project_id);  extra += ` AND ar.project_id = $${params.length}`; }
    if (req.query.employee_id) { params.push(req.query.employee_id); extra += ` AND ar.requested_for_employee_id = $${params.length}`; }

    const { rows } = await pool.query(`
      SELECT
        ep.employee_id,
        ep.full_name,
        ep.trade_code,
        p.project_code,
        p.project_name,
        ar.distance_km,
        COUNT(DISTINCT atr.attendance_date)::int AS days_worked
      FROM public.assignment_requests ar
      JOIN public.employee_profiles ep ON ep.employee_id = ar.requested_for_employee_id
      JOIN public.projects p           ON p.id = ar.project_id
      JOIN public.attendance_records atr
        ON atr.assignment_request_id = ar.id
       AND atr.attendance_date >= $2
       AND atr.attendance_date <= $3
       AND atr.status NOT IN ('OPEN')
      WHERE ar.company_id = $1
        AND ar.status     = 'APPROVED'
        AND ar.distance_km IS NOT NULL
        ${extra}
      GROUP BY ep.employee_id, ep.full_name, ep.trade_code,
               p.project_code, p.project_name, ar.distance_km
      ORDER BY ar.distance_km DESC NULLS LAST, ep.full_name
    `, params);

    // Add CCQ zone + computed allowance
    const enriched = rows.map(r => {
      const { zone, rate, label } = ccqZone(parseFloat(r.distance_km));
      const days        = Number(r.days_worked);
      const total_allowance = parseFloat((rate * days).toFixed(2));
      return { ...r, zone, rate_per_day: rate, zone_label: label, total_allowance };
    });

    const grand_total = parseFloat(
      enriched.reduce((s, r) => s + r.total_allowance, 0).toFixed(2)
    );

    return res.json({ ok: true, from, to, records: enriched, grand_total });
  } catch (err) {
    console.error("GET /reports/travel error:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/reports/assignments
// Full assignment roster with dates + shifts
// ─────────────────────────────────────────────────────────────
router.get("/assignments", can("reports.view"), async (req, res) => {
  try {
    const range = parseRange(req, res); if (!range) return;
    const { from, to } = range;
    const companyId = req.user.company_id;
    const params = [companyId, from, to];
    let extra = "";
    if (req.query.project_id)  { params.push(req.query.project_id);  extra += ` AND ar.project_id = $${params.length}`; }
    if (req.query.employee_id) { params.push(req.query.employee_id); extra += ` AND ar.requested_for_employee_id = $${params.length}`; }

    const { rows } = await pool.query(`
      SELECT
        ar.id AS assignment_id,
        ep.full_name,
        ep.trade_code,
        ar.assignment_role,
        p.project_code,
        p.project_name,
        p.site_address,
        ar.start_date,
        ar.end_date,
        ar.shift_start,
        ar.shift_end,
        ar.distance_km,
        ar.notes,
        au_req.username AS requested_by_username,
        ar.created_at
      FROM public.assignment_requests ar
      JOIN public.employee_profiles ep ON ep.employee_id = ar.requested_for_employee_id
      JOIN public.projects p           ON p.id = ar.project_id
      LEFT JOIN public.app_users au_req ON au_req.id = ar.requested_by
      WHERE ar.company_id = $1
        AND ar.status     = 'APPROVED'
        AND ar.start_date <= $3
        AND ar.end_date   >= $2
        ${extra}
      ORDER BY p.project_code, ar.start_date, ep.full_name
    `, params);

    return res.json({ ok: true, from, to, records: rows });
  } catch (err) {
    console.error("GET /reports/assignments error:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/reports/distance
// Employees with distance >= 41km (T2200 or company allowance)
// ─────────────────────────────────────────────────────────────
router.get("/distance", can("reports.view"), async (req, res) => {
  try {
    const range = parseRange(req, res); if (!range) return;
    const { from, to } = range;
    const companyId = req.user.company_id;
    const params = [companyId, from, to];
    let extra = "";
    if (req.query.project_id) { params.push(req.query.project_id); extra += ` AND ar.project_id = $${params.length}`; }

    const { rows } = await pool.query(`
      SELECT
        ep.employee_id,
        ep.full_name,
        ep.trade_code,
        ep.home_address,
        p.project_code,
        p.project_name,
        p.site_address,
        ar.distance_km,
        ar.start_date,
        ar.end_date,
        COUNT(DISTINCT atr.attendance_date)::int AS days_worked
      FROM public.assignment_requests ar
      JOIN public.employee_profiles ep ON ep.employee_id = ar.requested_for_employee_id
      JOIN public.projects p           ON p.id = ar.project_id
      LEFT JOIN public.attendance_records atr
        ON atr.assignment_request_id = ar.id
       AND atr.attendance_date >= $2
       AND atr.attendance_date <= $3
       AND atr.status NOT IN ('OPEN')
      WHERE ar.company_id   = $1
        AND ar.status       = 'APPROVED'
        AND ar.distance_km  >= 41
        AND ar.start_date   <= $3
        AND ar.end_date     >= $2
        ${extra}
      GROUP BY ep.employee_id, ep.full_name, ep.trade_code, ep.home_address,
               p.project_code, p.project_name, p.site_address,
               ar.distance_km, ar.start_date, ar.end_date
      ORDER BY ar.distance_km DESC, ep.full_name
    `, params);

    const enriched = rows.map(r => {
      const { zone, rate, label } = ccqZone(parseFloat(r.distance_km));
      return {
        ...r,
        zone,
        zone_label:    label,
        rate_per_day:  rate,
        needs_t2200:   parseFloat(r.distance_km) >= 41 && parseFloat(r.distance_km) < 65,
        needs_allowance: parseFloat(r.distance_km) >= 65,
        total_allowance: parseFloat((rate * Number(r.days_worked)).toFixed(2)),
      };
    });

    return res.json({ ok: true, from, to, records: enriched });
  } catch (err) {
    console.error("GET /reports/distance error:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

module.exports = router;
