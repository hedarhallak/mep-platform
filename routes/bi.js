'use strict';

/**
 * routes/bi.js
 * Business Intelligence endpoints
 *
 * GET /api/bi/workforce-suggestions
 * Analyzes employee home locations vs active project sites
 * and suggests optimal reassignments to minimize travel distance.
 */

const router = require('express').Router();
const { can } = require('../middleware/permissions');

// Section 89-C/1 (Phase 4 Stage 2): this route now consumes req.db (RLS-
// enforced via middleware/tenant_db). The pool import was removed because
// every query is parameterized by the authenticated user's tenant via the
// SET LOCAL app.company_id GUC. WHERE company_id clauses kept for defense-
// in-depth — RLS does the actual filtering, the WHERE clause makes intent
// explicit + protects against any refactor that bypasses the middleware.

// NOTE: a local requireRoles + ADMIN_ONLY guard were previously defined
// here but never wired into any route — orphan from earlier permission-
// system refactors. Removed in Phase 11a cleanup. Use can('permission_code')
// from middleware/permissions.js when adding new authenticated routes.

const FAR_THRESHOLD_KM = 65; // flag assignments beyond this distance

// ── GET /api/bi/workforce-suggestions ────────────────────────
router.get('/workforce-suggestions', can('bi.access_full'), async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const today = new Date().toISOString().split('T')[0];

    // 1. Get all active projects with coordinates
    const { rows: projects } = await req.db.query(
      `SELECT p.id, p.project_code, p.project_name, p.site_address,
              p.site_lat, p.site_lng
       FROM public.projects p
       JOIN public.project_statuses ps ON ps.id = p.status_id
       WHERE p.company_id = $1
         AND ps.code = 'ACTIVE'
         AND p.site_lat IS NOT NULL
         AND p.site_lng IS NOT NULL`,
      [companyId]
    );
    if (!projects.length)
      return res.json({
        ok: true,
        current_assignments: [],
        suggestions: [],
        summary: { total_assignments: 0, far_assignments: 0, optimizable: 0 },
      });

    // 2. Get current active assignments with employee home coords + distances
    const { rows: current } = await req.db.query(
      `SELECT
         ar.id          AS assignment_id,
         ar.start_date,
         ar.end_date,
         ar.assignment_role,
         ep.employee_id,
         ep.full_name   AS employee_name,
         ep.trade_code,
         p.id           AS project_id,
         p.project_code,
         p.project_name,
         p.site_address,
         p.site_lat,
         p.site_lng,
         ep.home_lng,
         ep.home_lat,
         ROUND((ST_Distance(
           ST_SetSRID(ST_MakePoint(ep.home_lng, ep.home_lat), 4326)::geography,
           ST_SetSRID(ST_MakePoint(p.site_lng, p.site_lat), 4326)::geography
         ) / 1000)::numeric, 1) AS current_distance_km
       FROM public.assignment_requests ar
       JOIN public.employee_profiles ep ON ep.employee_id = ar.requested_for_employee_id
       JOIN public.projects           p  ON p.id          = ar.project_id
       WHERE ar.company_id = $1
         AND ar.status     = 'APPROVED'
         AND ar.start_date <= $2
         AND ar.end_date   >= $2
         AND ep.home_lat IS NOT NULL AND ep.home_lng IS NOT NULL
         AND p.site_lat IS NOT NULL`,
      [companyId, today]
    );

    // 3. For each employee, find their closest active project
    const suggestions = [];

    for (const a of current) {
      // Calculate distance to all projects
      const distances = projects
        .map((p) => {
          const dist = haversineKm(a.home_lat, a.home_lng, p.site_lat, p.site_lng);
          return { ...p, distance_km: Math.round(dist * 10) / 10 };
        })
        .sort((a, b) => a.distance_km - b.distance_km);

      const closest = distances[0];
      const saving = Math.round((a.current_distance_km - closest.distance_km) * 10) / 10;
      const isFar = a.current_distance_km >= FAR_THRESHOLD_KM;
      const canOptimize = closest.id !== a.project_id && saving > 5;

      suggestions.push({
        assignment_id: a.assignment_id,
        employee_id: a.employee_id,
        employee_name: a.employee_name,
        trade_code: a.trade_code,
        assignment_role: a.assignment_role,
        current_project_id: a.project_id,
        current_project: a.project_code,
        current_project_name: a.project_name,
        current_distance_km: a.current_distance_km,
        is_far: isFar,
        can_optimize: canOptimize,
        suggested_project_id: canOptimize ? closest.id : null,
        suggested_project: canOptimize ? closest.project_code : null,
        suggested_project_name: canOptimize ? closest.project_name : null,
        suggested_distance_km: canOptimize ? closest.distance_km : null,
        saving_km: canOptimize ? saving : null,
        reason: buildReason(a, closest, isFar, canOptimize, saving),
        all_distances: distances.map((d) => ({
          project_id: d.id,
          project_code: d.project_code,
          distance_km: d.distance_km,
        })),
      });
    }

    // Sort: far first, then by saving desc
    suggestions.sort((a, b) => {
      if (a.is_far !== b.is_far) return a.is_far ? -1 : 1;
      return (b.saving_km || 0) - (a.saving_km || 0);
    });

    const summary = {
      total_assignments: current.length,
      far_assignments: suggestions.filter((s) => s.is_far).length,
      optimizable: suggestions.filter((s) => s.can_optimize).length,
      total_saving_km:
        Math.round(suggestions.reduce((n, s) => n + (s.saving_km || 0), 0) * 10) / 10,
    };

    return res.json({ ok: true, suggestions, summary, threshold_km: FAR_THRESHOLD_KM });
  } catch (err) {
    console.error('GET /bi/workforce-suggestions error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR', message: err.message });
  }
});

// ── GET /api/bi/overview ─────────────────────────────────────
// Company-wide BI dashboard data in four areas:
//   workforce (utilization), hours (& overtime), travel (CCQ distance bands),
//   coverage (active projects staffed today). Hours are summed over the last
//   `days` window (default 30); workforce/travel/coverage are today snapshots.
router.get('/overview', can('bi.access_full'), async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const today = new Date().toISOString().split('T')[0];
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 365);
    const fromDate = new Date(Date.now() - (days - 1) * 86400000).toISOString().split('T')[0];

    const [emp, assignedByTrade, hoursTotal, hoursByProject, travel, coverage] = await Promise.all([
      // total active employees
      req.db.query(
        `SELECT count(*)::int AS total
           FROM public.employees
          WHERE company_id = $1 AND is_active = true`,
        [companyId]
      ),
      // employees assigned today, grouped by trade
      req.db.query(
        `SELECT COALESCE(ep.trade_code, '—') AS trade,
                count(DISTINCT ar.requested_for_employee_id)::int AS assigned
           FROM public.assignment_requests ar
           LEFT JOIN public.employee_profiles ep
                  ON ep.employee_id = ar.requested_for_employee_id
          WHERE ar.company_id = $1
            AND ar.status      = 'APPROVED'
            AND ar.start_date <= $2 AND ar.end_date >= $2
          GROUP BY COALESCE(ep.trade_code, '—')
          ORDER BY assigned DESC`,
        [companyId, today]
      ),
      // hours over the window (prefer confirmed hours)
      req.db.query(
        `SELECT
            COALESCE(SUM(COALESCE(confirmed_regular_hours,  regular_hours)),  0)::numeric(12,1) AS regular,
            COALESCE(SUM(COALESCE(confirmed_overtime_hours, overtime_hours)), 0)::numeric(12,1) AS overtime
           FROM public.attendance_records
          WHERE company_id = $1
            AND attendance_date >= $2 AND attendance_date <= $3`,
        [companyId, fromDate, today]
      ),
      // hours by project (top 6) over the window
      req.db.query(
        `SELECT p.project_code, p.project_name,
                COALESCE(SUM(
                  COALESCE(a.confirmed_regular_hours,  a.regular_hours) +
                  COALESCE(a.confirmed_overtime_hours, a.overtime_hours)
                ), 0)::numeric(12,1) AS hours
           FROM public.attendance_records a
           JOIN public.projects p ON p.id = a.project_id
          WHERE a.company_id = $1
            AND a.attendance_date >= $2 AND a.attendance_date <= $3
          GROUP BY p.project_code, p.project_name
         HAVING COALESCE(SUM(
                  COALESCE(a.confirmed_regular_hours,  a.regular_hours) +
                  COALESCE(a.confirmed_overtime_hours, a.overtime_hours)
                ), 0) > 0
          ORDER BY hours DESC
          LIMIT 6`,
        [companyId, fromDate, today]
      ),
      // travel distance bands for assignments active today
      req.db.query(
        `SELECT
            count(*) FILTER (WHERE distance_km <  41)                    ::int AS under41,
            count(*) FILTER (WHERE distance_km >= 41 AND distance_km < 65)::int AS band_41_65,
            count(*) FILTER (WHERE distance_km >= 65)                    ::int AS over65,
            count(*) FILTER (WHERE distance_km IS NULL)                  ::int AS unknown,
            ROUND(AVG(distance_km) FILTER (WHERE distance_km IS NOT NULL)::numeric, 1) AS avg_km
           FROM public.assignment_requests
          WHERE company_id = $1
            AND status      = 'APPROVED'
            AND start_date <= $2 AND end_date >= $2`,
        [companyId, today]
      ),
      // active projects + headcount assigned today
      req.db.query(
        `SELECT p.project_code, p.project_name, p.ccq_sector,
                count(DISTINCT ar.requested_for_employee_id) FILTER (
                  WHERE ar.status = 'APPROVED'
                    AND ar.start_date <= $2 AND ar.end_date >= $2
                )::int AS assigned
           FROM public.projects p
           JOIN public.project_statuses ps ON ps.id = p.status_id
           LEFT JOIN public.assignment_requests ar
                  ON ar.project_id = p.id AND ar.company_id = p.company_id
          WHERE p.company_id = $1 AND ps.code = 'ACTIVE'
          GROUP BY p.project_code, p.project_name, p.ccq_sector
          ORDER BY assigned ASC, p.project_code`,
        [companyId, today]
      ),
    ]);

    const totalEmployees = emp.rows[0].total;
    const assignedToday = assignedByTrade.rows.reduce((n, r) => n + r.assigned, 0);
    const regular = Number(hoursTotal.rows[0].regular);
    const overtime = Number(hoursTotal.rows[0].overtime);
    const totalHours = Math.round((regular + overtime) * 10) / 10;
    const projects = coverage.rows;
    const covered = projects.filter((p) => p.assigned > 0).length;
    const t = travel.rows[0];

    return res.json({
      ok: true,
      period: { from: fromDate, to: today, days },
      workforce: {
        total_employees: totalEmployees,
        assigned_today: assignedToday,
        utilization_pct: totalEmployees ? Math.round((assignedToday / totalEmployees) * 100) : 0,
        by_trade: assignedByTrade.rows,
      },
      hours: {
        regular_hours: regular,
        overtime_hours: overtime,
        total_hours: totalHours,
        overtime_pct: totalHours ? Math.round((overtime / totalHours) * 100) : 0,
        by_project: hoursByProject.rows.map((r) => ({ ...r, hours: Number(r.hours) })),
      },
      travel: {
        under_41: t.under41,
        band_41_65: t.band_41_65,
        over_65: t.over65,
        unknown: t.unknown,
        avg_distance_km: t.avg_km === null ? null : Number(t.avg_km),
      },
      coverage: {
        active_projects: projects.length,
        covered,
        uncovered: projects.length - covered,
        projects,
      },
    });
  } catch (err) {
    console.error('GET /bi/overview error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR', message: err.message });
  }
});

// ── Haversine distance helper ────────────────────────────────
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Build human-readable reason ─────────────────────────────
function buildReason(a, closest, isFar, canOptimize, saving) {
  if (isFar && canOptimize) {
    return `${a.employee_name} is currently ${a.current_distance_km}km from ${a.project_code}, which exceeds the 65km threshold. Moving to ${closest.project_code} would reduce travel to ${closest.distance_km}km — saving ${saving}km per day.`;
  }
  if (isFar) {
    return `${a.employee_name} is ${a.current_distance_km}km from ${a.project_code}, exceeding the 65km threshold. No closer active project is available right now.`;
  }
  if (canOptimize) {
    return `${a.employee_name} is ${a.current_distance_km}km from ${a.project_code}. Moving to ${closest.project_code} would save ${saving}km per day.`;
  }
  return `${a.employee_name} is already optimally placed at ${a.current_distance_km}km from ${a.project_code}.`;
}

module.exports = router;
