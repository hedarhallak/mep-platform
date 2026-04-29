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
const { pool } = require('../db');
const { normalizeRole } = require('../middleware/roles');
const { can } = require('../middleware/permissions');

function requireRoles(allowed) {
  const normalized = allowed.map((r) => normalizeRole(r));
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });
    const userRole = normalizeRole(req.user.role);
    if (userRole === 'SUPER_ADMIN') return next();
    if (!normalized.includes(userRole))
      return res.status(403).json({ ok: false, error: 'FORBIDDEN' });
    return next();
  };
}
// NOTE: ADMIN_ONLY guard previously defined here was unused — removed
// in Phase 11a cleanup. Use can('permission_code') for new routes.

const FAR_THRESHOLD_KM = 65; // flag assignments beyond this distance

// ── GET /api/bi/workforce-suggestions ────────────────────────
router.get('/workforce-suggestions', can('bi.access_full'), async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const today = new Date().toISOString().split('T')[0];

    // 1. Get all active projects with coordinates
    const { rows: projects } = await pool.query(
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
    const { rows: current } = await pool.query(
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
