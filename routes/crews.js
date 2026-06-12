// routes/crews.js — Assignments Phase 2, CREW concept (DECISIONS §131.2, Slice 1).
//
// Static-roster crews: a named team = foreman + a fixed member list. Slice 2
// will let the bulk-assign wizard deploy a crew onto a project (expanding the
// roster into individual assignment_requests). This file is the CRUD backend.
//
// Mounted at /api/crews with `auth, tenantDb` (app.js), so every query runs on
// req.db (the RLS-bound, per-request transaction client — company_id GUC set).
// crews + crew_members are both under strict RLS (migration 033).
//
// DEFENSE-IN-DEPTH (§142.4 lesson): every query ALSO carries an explicit
// `company_id = req.user.company_id` predicate — we do NOT rely on RLS alone.
// Besides being the right discipline, it's what makes tenant isolation hold in
// CI too, where the test pool connects as a BYPASSRLS role (Pitfall #14) and
// RLS is silently inert.
//
// Permissions reuse the existing `assignments.*` module (no new seeding):
//   GET -> assignments.view   POST -> assignments.create   PATCH/DELETE -> assignments.edit
//
// Employee-ownership is validated explicitly (not left to FK + RLS): a foreman/
// member id that isn't an employee of the caller's company is rejected 400.

const express = require('express');
const router = express.Router();
const { can } = require('../middleware/permissions');
const { estimateRoadKm, loadRateTable, allowanceCentsFor } = require('../lib/ccq_travel');

// Local haversine (auto_assign.js keeps its own copy; ccq_travel exports the
// road-km estimate that consumes it). Great-circle km between two lat/lng.
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Validate that every id in `ids` is an employee of the caller's company.
// Returns the set of valid ids (numbers).
async function validCompanyEmployeeIds(db, companyId, ids) {
  const unique = [...new Set(ids.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (unique.length === 0) return new Set();
  const { rows } = await db.query(
    `SELECT id FROM public.employees WHERE id = ANY($1::int[]) AND company_id = $2`,
    [unique, companyId]
  );
  return new Set(rows.map((r) => Number(r.id)));
}

// Shape a crew row + its members for the response. company_id-scoped.
async function loadCrewWithMembers(db, crewId, companyId) {
  const { rows: crewRows } = await db.query(
    `SELECT c.id, c.name, c.foreman_employee_id, c.trade_code, c.is_active,
            c.created_at, c.updated_at,
            fe.full_name AS foreman_name
       FROM public.crews c
       LEFT JOIN public.employees fe ON fe.id = c.foreman_employee_id
      WHERE c.id = $1 AND c.company_id = $2`,
    [crewId, companyId]
  );
  if (!crewRows.length) return null;
  const crew = crewRows[0];
  const { rows: members } = await db.query(
    `SELECT cm.employee_id, e.full_name, e.employee_code
       FROM public.crew_members cm
       JOIN public.employees e ON e.id = cm.employee_id
      WHERE cm.crew_id = $1 AND cm.company_id = $2
      ORDER BY e.full_name`,
    [crewId, companyId]
  );
  crew.members = members;
  return crew;
}

// ── GET /api/crews ── list crews (with foreman name + member count) ──────────
router.get('/', can('assignments.view'), async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const { rows } = await req.db.query(
      `SELECT c.id, c.name, c.foreman_employee_id, c.trade_code, c.is_active,
              c.created_at, c.updated_at,
              fe.full_name AS foreman_name,
              COUNT(cm.id)::int AS member_count
         FROM public.crews c
         LEFT JOIN public.employees fe ON fe.id = c.foreman_employee_id
         LEFT JOIN public.crew_members cm ON cm.crew_id = c.id
        WHERE c.company_id = $1
        GROUP BY c.id, fe.full_name
        ORDER BY c.is_active DESC, c.name`,
      [companyId]
    );
    return res.json({ ok: true, crews: rows });
  } catch (err) {
    console.error('GET /crews error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// ── GET /api/crews/:id ── one crew with its roster ───────────────────────────
router.get('/:id', can('assignments.view'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0)
      return res.status(400).json({ ok: false, error: 'INVALID_ID' });
    const crew = await loadCrewWithMembers(req.db, id, req.user.company_id);
    if (!crew) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
    return res.json({ ok: true, crew });
  } catch (err) {
    console.error('GET /crews/:id error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// ── POST /api/crews ── create a crew + initial roster ────────────────────────
router.post('/', can('assignments.create'), async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const { name, foreman_employee_id, trade_code, member_ids } = req.body || {};

    if (!name || !String(name).trim())
      return res.status(400).json({ ok: false, error: 'NAME_REQUIRED' });
    const crewName = String(name).trim();
    const members = Array.isArray(member_ids) ? member_ids : [];

    // Validate foreman + members all belong to this company.
    const idsToCheck = [...members];
    if (foreman_employee_id != null) idsToCheck.push(foreman_employee_id);
    const valid = await validCompanyEmployeeIds(req.db, companyId, idsToCheck);

    if (foreman_employee_id != null && !valid.has(Number(foreman_employee_id)))
      return res.status(400).json({ ok: false, error: 'INVALID_FOREMAN' });
    const badMember = members.find((m) => !valid.has(Number(m)));
    if (badMember != null) return res.status(400).json({ ok: false, error: 'INVALID_MEMBER' });

    // Create the crew (company_id stamped server-side; RLS WITH CHECK enforces it too).
    let crewId;
    try {
      const { rows } = await req.db.query(
        `INSERT INTO public.crews (company_id, name, foreman_employee_id, trade_code)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [companyId, crewName, foreman_employee_id || null, trade_code || null]
      );
      crewId = rows[0].id;
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ ok: false, error: 'NAME_TAKEN' });
      throw e;
    }

    // Insert the roster (dedup; ON CONFLICT no-op for safety).
    const uniqueMembers = [...new Set(members.map(Number))];
    for (const empId of uniqueMembers) {
      await req.db.query(
        `INSERT INTO public.crew_members (company_id, crew_id, employee_id)
         VALUES ($1, $2, $3) ON CONFLICT (crew_id, employee_id) DO NOTHING`,
        [companyId, crewId, empId]
      );
    }

    const crew = await loadCrewWithMembers(req.db, crewId, companyId);
    return res.status(201).json({ ok: true, crew });
  } catch (err) {
    console.error('POST /crews error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// ── PATCH /api/crews/:id ── edit fields and/or replace the roster ────────────
router.patch('/:id', can('assignments.edit'), async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0)
      return res.status(400).json({ ok: false, error: 'INVALID_ID' });

    // Explicit company_id scope (defense-in-depth) — a foreign id → 404.
    const { rows: exists } = await req.db.query(
      `SELECT id FROM public.crews WHERE id = $1 AND company_id = $2`,
      [id, companyId]
    );
    if (!exists.length) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });

    const { name, foreman_employee_id, trade_code, is_active, member_ids } = req.body || {};

    // Validate any employee ids referenced in this edit.
    const idsToCheck = [];
    if (Array.isArray(member_ids)) idsToCheck.push(...member_ids);
    if (foreman_employee_id != null) idsToCheck.push(foreman_employee_id);
    if (idsToCheck.length) {
      const valid = await validCompanyEmployeeIds(req.db, companyId, idsToCheck);
      if (foreman_employee_id != null && !valid.has(Number(foreman_employee_id)))
        return res.status(400).json({ ok: false, error: 'INVALID_FOREMAN' });
      if (Array.isArray(member_ids)) {
        const badMember = member_ids.find((m) => !valid.has(Number(m)));
        if (badMember != null) return res.status(400).json({ ok: false, error: 'INVALID_MEMBER' });
      }
    }

    // Build a partial UPDATE for the scalar fields actually provided.
    const sets = [];
    const params = [];
    let p = 1;
    if (name !== undefined) {
      if (!String(name).trim()) return res.status(400).json({ ok: false, error: 'NAME_REQUIRED' });
      sets.push(`name = $${p++}`);
      params.push(String(name).trim());
    }
    if (foreman_employee_id !== undefined) {
      sets.push(`foreman_employee_id = $${p++}`);
      params.push(foreman_employee_id || null);
    }
    if (trade_code !== undefined) {
      sets.push(`trade_code = $${p++}`);
      params.push(trade_code || null);
    }
    if (is_active !== undefined) {
      sets.push(`is_active = $${p++}`);
      params.push(!!is_active);
    }
    if (sets.length) {
      sets.push(`updated_at = NOW()`);
      params.push(id);
      params.push(companyId);
      try {
        await req.db.query(
          `UPDATE public.crews SET ${sets.join(', ')} WHERE id = $${p++} AND company_id = $${p}`,
          params
        );
      } catch (e) {
        if (e.code === '23505') return res.status(409).json({ ok: false, error: 'NAME_TAKEN' });
        throw e;
      }
    }

    // Replace the roster only when member_ids was explicitly provided.
    if (Array.isArray(member_ids)) {
      await req.db.query(`DELETE FROM public.crew_members WHERE crew_id = $1 AND company_id = $2`, [
        id,
        companyId,
      ]);
      const uniqueMembers = [...new Set(member_ids.map(Number))];
      for (const empId of uniqueMembers) {
        await req.db.query(
          `INSERT INTO public.crew_members (company_id, crew_id, employee_id)
           VALUES ($1, $2, $3) ON CONFLICT (crew_id, employee_id) DO NOTHING`,
          [companyId, id, empId]
        );
      }
    }

    const crew = await loadCrewWithMembers(req.db, id, companyId);
    return res.json({ ok: true, crew });
  } catch (err) {
    console.error('PATCH /crews/:id error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// ── DELETE /api/crews/:id ── remove a crew (members cascade) ──────────────────
router.delete('/:id', can('assignments.edit'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0)
      return res.status(400).json({ ok: false, error: 'INVALID_ID' });
    // Explicit company_id scope (defense-in-depth) — rowCount 0 → not the caller's crew.
    const { rowCount } = await req.db.query(
      `DELETE FROM public.crews WHERE id = $1 AND company_id = $2`,
      [id, req.user.company_id]
    );
    if (!rowCount) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
    return res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /crews/:id error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// ── POST /api/crews/:id/plan ── expand a crew roster into a wizard-compatible
// preview block for ONE project + target date (CREWS Slice 2, §143.3).
//
// The returned `suggestions[0]` block is shaped to drop straight into
// /api/assignments/auto-confirm as confirmed[0] (identical employees[] row
// shape), so crew deploy reuses the existing confirm + email + dedup + §132
// location-snapshot pipeline unchanged. Foreman → assignment_role FOREMAN;
// other members → WORKER. Roster members already assigned over target_date are
// marked type 'already_assigned' (auto-confirm re-checks overlap and skips
// them too, §131.12). Distance/allowance reuse lib/ccq_travel (estimate).
router.post('/:id/plan', can('assignments.create'), async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0)
      return res.status(400).json({ ok: false, error: 'INVALID_ID' });

    const { project_id, target_date } = req.body || {};
    if (!target_date) return res.status(400).json({ ok: false, error: 'TARGET_DATE_REQUIRED' });
    if (!project_id) return res.status(400).json({ ok: false, error: 'PROJECT_ID_REQUIRED' });

    // Crew (company-scoped) + roster.
    const { rows: crewRows } = await req.db.query(
      `SELECT id, name, foreman_employee_id FROM public.crews WHERE id = $1 AND company_id = $2`,
      [id, companyId]
    );
    if (!crewRows.length) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
    const crew = crewRows[0];

    const { rows: memberRows } = await req.db.query(
      `SELECT employee_id FROM public.crew_members WHERE crew_id = $1 AND company_id = $2`,
      [id, companyId]
    );
    const rosterIds = [
      ...new Set([
        ...memberRows.map((m) => Number(m.employee_id)),
        ...(crew.foreman_employee_id != null ? [Number(crew.foreman_employee_id)] : []),
      ]),
    ];
    if (!rosterIds.length) return res.status(400).json({ ok: false, error: 'EMPTY_CREW' });

    // Project (company-scoped) with coords + shift defaults.
    const { rows: projRows } = await req.db.query(
      `SELECT p.id, p.project_code, p.project_name, p.site_address, p.site_lat, p.site_lng,
              c.default_shift_start AS shift_start, c.default_shift_end AS shift_end
         FROM public.projects p
         JOIN public.companies c ON c.company_id = p.company_id
        WHERE p.id = $1 AND p.company_id = $2`,
      [Number(project_id), companyId]
    );
    if (!projRows.length) return res.status(404).json({ ok: false, error: 'PROJECT_NOT_FOUND' });
    const project = projRows[0];

    // Roster profiles + coords. The ids are already company-scoped (they came
    // from crews/crew_members), so querying the policy-less employee_profiles by
    // those ids is safe.
    const { rows: profiles } = await req.db.query(
      `SELECT ep.employee_id AS id, ep.full_name, ep.trade_code, ep.contact_email,
              ST_X(ep.home_location::geometry) AS home_lng,
              ST_Y(ep.home_location::geometry) AS home_lat
         FROM public.employee_profiles ep
        WHERE ep.employee_id = ANY($1::int[])`,
      [rosterIds]
    );
    const profileById = new Map(profiles.map((p) => [Number(p.id), p]));

    // Roster members already assigned anywhere over target_date.
    const { rows: busyRows } = await req.db.query(
      `SELECT DISTINCT requested_for_employee_id AS id
         FROM public.assignment_requests
        WHERE company_id = $1 AND status IN ('APPROVED','PENDING')
          AND start_date <= $2 AND end_date >= $2
          AND requested_for_employee_id = ANY($3::int[])`,
      [companyId, target_date, rosterIds]
    );
    const busy = new Set(busyRows.map((r) => Number(r.id)));

    const rateTable = await loadRateTable(req.db, target_date);
    const annotate = (emp) => {
      if (
        !emp ||
        emp.home_lat == null ||
        emp.home_lng == null ||
        project.site_lat == null ||
        project.site_lng == null
      ) {
        return { distance_km: null, allowance_cents: null };
      }
      const road_km = estimateRoadKm(
        haversineKm(emp.home_lat, emp.home_lng, project.site_lat, project.site_lng)
      );
      return {
        distance_km: road_km,
        allowance_cents: allowanceCentsFor(rateTable, emp.trade_code, road_km),
      };
    };

    let allowanceTotal = 0;
    const employees = rosterIds.map((empId) => {
      const prof = profileById.get(empId) || {};
      const isForeman =
        crew.foreman_employee_id != null && Number(crew.foreman_employee_id) === empId;
      const already = busy.has(empId);
      const ann = annotate(prof);
      if (!already) allowanceTotal += ann.allowance_cents || 0;
      return {
        employee_id: empId,
        employee_name: prof.full_name || null,
        trade_code: prof.trade_code || null,
        contact_email: prof.contact_email || null,
        assignment_role: isForeman ? 'FOREMAN' : 'WORKER',
        type: already ? 'already_assigned' : 'crew',
        replacing: null,
        score: 0,
        ...ann,
      };
    });

    const block = {
      project_id: project.id,
      project_code: project.project_code,
      project_name: project.project_name,
      site_address: project.site_address,
      shift_start: project.shift_start || '06:00',
      shift_end: project.shift_end || '14:30',
      today_count: 0,
      employees,
      foremen: {},
      allowance_total_cents: allowanceTotal,
    };

    return res.json({
      ok: true,
      target_date,
      crew: { id: crew.id, name: crew.name },
      suggestions: [block],
      totals: {
        headcount: employees.filter((e) => e.type !== 'already_assigned').length,
        allowance_total_cents: allowanceTotal,
      },
    });
  } catch (err) {
    console.error('POST /crews/:id/plan error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

module.exports = router;
