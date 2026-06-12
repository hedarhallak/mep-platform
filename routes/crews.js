// routes/crews.js — Assignments Phase 2, CREW concept (DECISIONS §131.2, Slice 1).
//
// Static-roster crews: a named team = foreman + a fixed member list. Slice 2
// will let the bulk-assign wizard deploy a crew onto a project (expanding the
// roster into individual assignment_requests). This file is the CRUD backend.
//
// Mounted at /api/crews with `auth, tenantDb` (app.js), so every query runs on
// req.db (the RLS-bound, per-request transaction client — company_id GUC set).
// crews + crew_members are both under strict RLS (migration 033), so reads are
// auto-scoped to the caller's company and writes are WITH CHECK-enforced.
//
// Permissions reuse the existing `assignments.*` module (no new seeding):
//   GET  -> assignments.view   POST -> assignments.create   PATCH/DELETE -> assignments.edit
//
// Employee-ownership is validated explicitly (not left to FK + RLS alone): a
// foreman/member id that isn't an employee of the caller's company is rejected
// 400 — the §142.4 / project_foremen "validate the id belongs to the tenant"
// discipline.

const express = require('express');
const router = express.Router();
const { can } = require('../middleware/permissions');

// Validate that every id in `ids` is an active-or-existing employee of the
// caller's company. Returns the set of valid ids (as numbers). Uses req.db so
// RLS already scopes employees to the tenant; the explicit company_id check is
// belt-and-suspenders + makes intent obvious.
async function validCompanyEmployeeIds(db, companyId, ids) {
  const unique = [...new Set(ids.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (unique.length === 0) return new Set();
  const { rows } = await db.query(
    `SELECT id FROM public.employees WHERE id = ANY($1::int[]) AND company_id = $2`,
    [unique, companyId]
  );
  return new Set(rows.map((r) => Number(r.id)));
}

// Shape a crew row + its members for the response.
async function loadCrewWithMembers(db, crewId) {
  const { rows: crewRows } = await db.query(
    `SELECT c.id, c.name, c.foreman_employee_id, c.trade_code, c.is_active,
            c.created_at, c.updated_at,
            fe.full_name AS foreman_name
       FROM public.crews c
       LEFT JOIN public.employees fe ON fe.id = c.foreman_employee_id
      WHERE c.id = $1`,
    [crewId]
  );
  if (!crewRows.length) return null;
  const crew = crewRows[0];
  const { rows: members } = await db.query(
    `SELECT cm.employee_id, e.full_name, e.employee_code
       FROM public.crew_members cm
       JOIN public.employees e ON e.id = cm.employee_id
      WHERE cm.crew_id = $1
      ORDER BY e.full_name`,
    [crewId]
  );
  crew.members = members;
  return crew;
}

// ── GET /api/crews ── list crews (with foreman name + member count) ──────────
router.get('/', can('assignments.view'), async (req, res) => {
  try {
    const { rows } = await req.db.query(
      `SELECT c.id, c.name, c.foreman_employee_id, c.trade_code, c.is_active,
              c.created_at, c.updated_at,
              fe.full_name AS foreman_name,
              COUNT(cm.id)::int AS member_count
         FROM public.crews c
         LEFT JOIN public.employees fe ON fe.id = c.foreman_employee_id
         LEFT JOIN public.crew_members cm ON cm.crew_id = c.id
        GROUP BY c.id, fe.full_name
        ORDER BY c.is_active DESC, c.name`
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
    const crew = await loadCrewWithMembers(req.db, id);
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

    // Create the crew (company_id stamped server-side; RLS WITH CHECK enforces it).
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

    const crew = await loadCrewWithMembers(req.db, crewId);
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

    // RLS scopes this to the tenant — a foreign id returns no row → 404.
    const { rows: exists } = await req.db.query(`SELECT id FROM public.crews WHERE id = $1`, [id]);
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
      try {
        await req.db.query(`UPDATE public.crews SET ${sets.join(', ')} WHERE id = $${p}`, params);
      } catch (e) {
        if (e.code === '23505') return res.status(409).json({ ok: false, error: 'NAME_TAKEN' });
        throw e;
      }
    }

    // Replace the roster only when member_ids was explicitly provided.
    if (Array.isArray(member_ids)) {
      await req.db.query(`DELETE FROM public.crew_members WHERE crew_id = $1`, [id]);
      const uniqueMembers = [...new Set(member_ids.map(Number))];
      for (const empId of uniqueMembers) {
        await req.db.query(
          `INSERT INTO public.crew_members (company_id, crew_id, employee_id)
           VALUES ($1, $2, $3) ON CONFLICT (crew_id, employee_id) DO NOTHING`,
          [companyId, id, empId]
        );
      }
    }

    const crew = await loadCrewWithMembers(req.db, id);
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
    // RLS scopes the DELETE; rowCount 0 means it wasn't the caller's crew.
    const { rowCount } = await req.db.query(`DELETE FROM public.crews WHERE id = $1`, [id]);
    if (!rowCount) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
    return res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /crews/:id error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

module.exports = router;
