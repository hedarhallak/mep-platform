'use strict';

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

const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { can, canAny } = require('../middleware/permissions');

// ── Date helpers ───────────────────────────────────────────────
function parseRange(req, res) {
  const { from, to } = req.query;
  if (!from || !to) {
    res.status(400).json({ ok: false, error: 'from and to dates are required' });
    return null;
  }
  if (from > to) {
    res.status(400).json({ ok: false, error: 'from must be <= to' });
    return null;
  }
  return { from, to };
}

// ── CCQ Zone lookup from DB ───────────────────────────────────
// Fetches rate from ccq_travel_rates table (managed by SUPER_ADMIN)
// Falls back to tax form for 41-65km, returns 0 if no rate found
async function ccqZoneFromDB(pool, km, tradeCode, sector, dateStr) {
  const distKm = parseFloat(km || 0);
  if (distKm < 41) return { zone: null, rate: 0, label: 'Not eligible (<41 km)', tax_form: null };

  // 41-65km → always tax form only, no company payment regardless of trade
  if (distKm < 65)
    return {
      zone: 'T2200/TP-64.3',
      rate: 0,
      label: `${distKm.toFixed(1)} km — T2200 + TP-64.3 (tax declaration)`,
      tax_form: 'T2200 + TP-64.3',
    };

  const date = dateStr || new Date().toISOString().split('T')[0];
  const trade = (tradeCode || 'GENERAL').toUpperCase();
  const sec = (sector || 'IC').toUpperCase();

  try {
    // Find the highest min_km threshold that applies for this distance (65km+)
    const { rows } = await pool.query(
      `
      SELECT rate_cad, tax_form, min_km
      FROM public.ccq_travel_rates
      WHERE trade_code     = $1
        AND sector         = $2
        AND min_km         <= $3
        AND min_km         >= 65
        AND effective_from <= $4
        AND effective_to   >= $4
      ORDER BY min_km DESC
      LIMIT 1
    `,
      [trade, sec, distKm, date]
    );

    if (!rows.length) {
      // Try GENERAL as fallback
      const { rows: fallback } = await pool.query(
        `
        SELECT rate_cad, tax_form, min_km
        FROM public.ccq_travel_rates
        WHERE trade_code     = 'GENERAL'
          AND sector         = $1
          AND min_km         <= $2
          AND min_km         >= 65
          AND effective_from <= $3
          AND effective_to   >= $3
        ORDER BY min_km DESC
        LIMIT 1
      `,
        [sec, distKm, date]
      );

      if (!fallback.length)
        return { zone: null, rate: 0, label: 'No rate configured', tax_form: null };
      rows.push(fallback[0]);
    }

    const r = rows[0];
    const rate = parseFloat(r.rate_cad);
    const taxForm = r.tax_form || null;

    if (taxForm)
      return {
        zone: 'T2200/TP-64.3',
        rate: 0,
        label: `${distKm.toFixed(1)} km — ${taxForm} (tax declaration)`,
        tax_form: taxForm,
      };

    return {
      zone: `${distKm.toFixed(1)}km`,
      rate,
      label: `${distKm.toFixed(1)} km — $${rate.toFixed(2)}/day`,
      tax_form: null,
    };
  } catch (err) {
    console.error('ccqZoneFromDB error:', err.message);
    return { zone: null, rate: 0, label: 'Rate lookup error', tax_form: null };
  }
}

// Sync wrapper used in map() — pre-fetch rates then apply
// Use ccqZoneFromDB directly in async contexts
function ccqZone(km, tradeCode, sector, dateStr) {
  // Kept for backward compatibility — returns basic zone without DB
  const distKm = parseFloat(km || 0);
  if (distKm < 41) return { zone: null, rate: 0, label: 'Not eligible (<41 km)', tax_form: null };
  if (distKm < 65)
    return {
      zone: 'T2200/TP-64.3',
      rate: 0,
      label: `${distKm.toFixed(1)} km — T2200 + TP-64.3 (tax declaration)`,
      tax_form: 'T2200 + TP-64.3',
    };
  return {
    zone: `${distKm.toFixed(1)}km`,
    rate: 0,
    label: 'Use ccqZoneFromDB for rates',
    tax_form: null,
  };
}

// ─────────────────────────────────────────────────────────────
// GET /api/reports/hours
// Regular + OT per employee over date range
// ─────────────────────────────────────────────────────────────
router.get('/hours', canAny(['reports.view', 'reports.view_self']), async (req, res) => {
  try {
    const range = parseRange(req, res);
    if (!range) return;
    const { from, to } = range;
    const companyId = req.user.company_id;
    const params = [companyId, from, to];
    let extra = '';

    // view_self: force filter to own employee_id only
    const isSelfOnly = !req.user.permissions?.reports?.view;
    if (isSelfOnly) {
      const { rows: emp } = await pool.query(
        `SELECT employee_id FROM public.app_users WHERE id = $1 LIMIT 1`,
        [req.user.user_id]
      );
      if (!emp.length || !emp[0].employee_id)
        return res.json({
          ok: true,
          from,
          to,
          records: [],
          totals: { days_worked: 0, total_regular: 0, total_overtime: 0, total_hours: 0 },
        });
      params.push(emp[0].employee_id);
      extra += ` AND atr.employee_id = $${params.length}`;
    } else {
      if (req.query.project_id) {
        params.push(req.query.project_id);
        extra += ` AND atr.project_id = $${params.length}`;
      }
      if (req.query.employee_id) {
        params.push(req.query.employee_id);
        extra += ` AND atr.employee_id = $${params.length}`;
      }
    }

    const { rows } = await pool.query(
      `
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
    `,
      params
    );

    const totals = rows.reduce(
      (acc, r) => ({
        days_worked: acc.days_worked + Number(r.days_worked),
        total_regular: acc.total_regular + Number(r.total_regular),
        total_overtime: acc.total_overtime + Number(r.total_overtime),
        total_hours: acc.total_hours + Number(r.total_hours),
      }),
      { days_worked: 0, total_regular: 0, total_overtime: 0, total_hours: 0 }
    );

    return res.json({ ok: true, from, to, records: rows, totals });
  } catch (err) {
    console.error('GET /reports/hours error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/reports/attendance
// Daily presence/absence summary per project
// ─────────────────────────────────────────────────────────────
router.get('/attendance', can('reports.view'), async (req, res) => {
  try {
    const range = parseRange(req, res);
    if (!range) return;
    const { from, to } = range;
    const companyId = req.user.company_id;
    const params = [companyId, from, to];
    let extra = '';
    if (req.query.project_id) {
      params.push(req.query.project_id);
      extra += ` AND ar.project_id = $${params.length}`;
    }

    const { rows } = await pool.query(
      `
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
    `,
      params
    );

    return res.json({ ok: true, from, to, records: rows });
  } catch (err) {
    console.error('GET /reports/attendance error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/reports/travel
// CCQ travel allowance — employees who worked + have distance_km
// ─────────────────────────────────────────────────────────────
router.get('/travel', canAny(['reports.view', 'reports.view_self']), async (req, res) => {
  try {
    const range = parseRange(req, res);
    if (!range) return;
    const { from, to } = range;
    const companyId = req.user.company_id;
    const params = [companyId, from, to];
    let extra = '';

    const isSelfOnly = !req.user.permissions?.reports?.view;
    if (isSelfOnly) {
      const { rows: emp } = await pool.query(
        `SELECT employee_id FROM public.app_users WHERE id = $1 LIMIT 1`,
        [req.user.user_id]
      );
      if (!emp.length || !emp[0].employee_id)
        return res.json({ ok: true, from, to, records: [], grand_total: 0 });
      params.push(emp[0].employee_id);
      extra += ` AND ar.requested_for_employee_id = $${params.length}`;
    } else {
      if (req.query.project_id) {
        params.push(req.query.project_id);
        extra += ` AND ar.project_id = $${params.length}`;
      }
      if (req.query.employee_id) {
        params.push(req.query.employee_id);
        extra += ` AND ar.requested_for_employee_id = $${params.length}`;
      }
    }

    const { rows } = await pool.query(
      `
      SELECT
        ep.employee_id,
        ep.full_name,
        ep.trade_code,
        p.project_code,
        p.project_name,
        p.ccq_sector,
        ar.distance_km,
        COUNT(DISTINCT atr.attendance_date)::int AS days_worked,
        MIN(atr.attendance_date::text) AS first_date
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
               p.project_code, p.project_name, p.ccq_sector, ar.distance_km
      ORDER BY ar.distance_km DESC NULLS LAST, ep.full_name
    `,
      params
    );

    // Add CCQ zone + computed allowance from DB
    const enriched = await Promise.all(
      rows.map(async (r) => {
        const { zone, rate, label, tax_form } = await ccqZoneFromDB(
          pool,
          r.distance_km,
          r.trade_code,
          r.ccq_sector,
          r.first_date
        );
        const days = Number(r.days_worked);
        const total_allowance = parseFloat((rate * days).toFixed(2));
        return { ...r, zone, rate_per_day: rate, zone_label: label, tax_form, total_allowance };
      })
    );

    const grand_total = parseFloat(enriched.reduce((s, r) => s + r.total_allowance, 0).toFixed(2));

    return res.json({ ok: true, from, to, records: enriched, grand_total });
  } catch (err) {
    console.error('GET /reports/travel error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/reports/assignments
// Full assignment roster with dates + shifts
// ─────────────────────────────────────────────────────────────
router.get('/assignments', can('reports.view'), async (req, res) => {
  try {
    const range = parseRange(req, res);
    if (!range) return;
    const { from, to } = range;
    const companyId = req.user.company_id;
    const params = [companyId, from, to];
    let extra = '';
    if (req.query.project_id) {
      params.push(req.query.project_id);
      extra += ` AND ar.project_id = $${params.length}`;
    }
    if (req.query.employee_id) {
      params.push(req.query.employee_id);
      extra += ` AND ar.requested_for_employee_id = $${params.length}`;
    }

    const { rows } = await pool.query(
      `
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
      LEFT JOIN public.app_users au_req ON au_req.id = ar.requested_by_user_id
      WHERE ar.company_id = $1
        AND ar.status     = 'APPROVED'
        AND ar.start_date <= $3
        AND ar.end_date   >= $2
        ${extra}
      ORDER BY p.project_code, ar.start_date, ep.full_name
    `,
      params
    );

    return res.json({ ok: true, from, to, records: rows });
  } catch (err) {
    console.error('GET /reports/assignments error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/reports/distance
// Employees with distance >= 41km (T2200 or company allowance)
// ─────────────────────────────────────────────────────────────
router.get('/distance', can('reports.view'), async (req, res) => {
  try {
    const range = parseRange(req, res);
    if (!range) return;
    const { from, to } = range;
    const companyId = req.user.company_id;
    const params = [companyId, from, to];
    let extra = '';
    if (req.query.project_id) {
      params.push(req.query.project_id);
      extra += ` AND ar.project_id = $${params.length}`;
    }

    const { rows } = await pool.query(
      `
      SELECT
        ep.employee_id,
        ep.full_name,
        ep.trade_code,
        ep.home_address,
        p.project_code,
        p.project_name,
        p.site_address,
        p.ccq_sector,
        ar.distance_km,
        ar.start_date,
        ar.end_date,
        COUNT(DISTINCT atr.attendance_date)::int AS days_worked,
        MIN(atr.attendance_date::text) AS first_date
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
               p.project_code, p.project_name, p.site_address, p.ccq_sector,
               ar.distance_km, ar.start_date, ar.end_date
      ORDER BY ar.distance_km DESC, ep.full_name
    `,
      params
    );

    const enriched = await Promise.all(
      rows.map(async (r) => {
        const { zone, rate, label, tax_form } = await ccqZoneFromDB(
          pool,
          r.distance_km,
          r.trade_code,
          r.ccq_sector,
          r.first_date
        );
        return {
          ...r,
          zone,
          zone_label: label,
          tax_form,
          rate_per_day: rate,
          needs_t2200: parseFloat(r.distance_km) >= 41 && parseFloat(r.distance_km) < 65,
          needs_allowance: parseFloat(r.distance_km) >= 65,
          total_allowance: parseFloat((rate * Number(r.days_worked)).toFixed(2)),
        };
      })
    );

    return res.json({ ok: true, from, to, records: enriched });
  } catch (err) {
    console.error('GET /reports/distance error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/reports/my-daily
// Daily attendance records for the current employee
// Returns: date, project, check_in, check_out, distance_km, travel_allowance
// ─────────────────────────────────────────────────────────────
router.get('/my-daily', canAny(['reports.view', 'reports.view_self']), async (req, res) => {
  try {
    const range = parseRange(req, res);
    if (!range) return;
    const { from, to } = range;
    const companyId = req.user.company_id;

    // Get current user's employee_id
    const { rows: empRows } = await pool.query(
      `SELECT employee_id FROM public.app_users WHERE id = $1 LIMIT 1`,
      [req.user.user_id]
    );
    if (!empRows.length || !empRows[0].employee_id)
      return res.json({ ok: true, from, to, records: [] });

    const employeeId = empRows[0].employee_id;

    const { rows } = await pool.query(
      `
      SELECT
        atr.attendance_date::text,
        p.project_code,
        p.project_name,
        p.ccq_sector,
        ep.trade_code,
        atr.check_in_time,
        atr.check_out_time,
        COALESCE(atr.confirmed_regular_hours,  atr.regular_hours,  0)::numeric(10,2) AS regular_hours,
        COALESCE(atr.confirmed_overtime_hours, atr.overtime_hours, 0)::numeric(10,2) AS overtime_hours,
        atr.late_minutes,
        atr.status,
        ar.distance_km,
        ar.shift_start,
        ar.shift_end
      FROM public.attendance_records atr
      JOIN public.projects p ON p.id = atr.project_id
      JOIN public.employee_profiles ep ON ep.employee_id = atr.employee_id
      LEFT JOIN public.assignment_requests ar
        ON ar.id = atr.assignment_request_id
      WHERE atr.company_id      = $1
        AND atr.employee_id     = $2
        AND atr.attendance_date >= $3
        AND atr.attendance_date <= $4
        AND atr.status NOT IN ('OPEN')
      ORDER BY atr.attendance_date ASC
    `,
      [companyId, employeeId, from, to]
    );

    // Enrich with travel allowance per day from DB
    const enriched = await Promise.all(
      rows.map(async (r) => {
        const { zone, rate, label, tax_form } = await ccqZoneFromDB(
          pool,
          r.distance_km,
          r.trade_code,
          r.ccq_sector,
          r.attendance_date
        );
        const distKm = parseFloat(r.distance_km || 0);
        return {
          ...r,
          zone,
          zone_label: label,
          tax_form,
          rate_per_day: rate,
          daily_allowance: rate > 0 ? parseFloat(rate.toFixed(2)) : 0,
          eligible_travel: distKm >= 41,
          needs_t2200: distKm >= 41 && distKm < 65,
          needs_allowance: distKm >= 65,
        };
      })
    );

    const totals = {
      days_worked: enriched.length,
      total_regular: parseFloat(
        enriched.reduce((s, r) => s + parseFloat(r.regular_hours || 0), 0).toFixed(2)
      ),
      total_overtime: parseFloat(
        enriched.reduce((s, r) => s + parseFloat(r.overtime_hours || 0), 0).toFixed(2)
      ),
      total_allowance: parseFloat(enriched.reduce((s, r) => s + r.daily_allowance, 0).toFixed(2)),
    };

    return res.json({ ok: true, from, to, records: enriched, totals });
  } catch (err) {
    console.error('GET /reports/my-daily error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

module.exports = router;
