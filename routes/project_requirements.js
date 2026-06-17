// routes/project_requirements.js — Project-centric assignment redesign, Phase 0
// (DECISIONS §147). CRUD for a project's time-phased labor demand, plus a
// coverage endpoint (required vs assigned vs gap, per trade, on a given day).
//
// Mounted at /api/projects (after the projects router) so the URLs read
// naturally: /api/projects/:projectId/requirements[/...] and
// /api/projects/:projectId/coverage. Express resolves by path-segment count,
// so these never collide with the projects router's own '/:id' route.
//
// Runs on req.db (RLS-bound, company_id GUC set by tenantDb). DEFENSE-IN-DEPTH
// (§142.4): every query also carries an explicit company_id predicate, and the
// parent project is verified to belong to the caller's company before any
// requirement write — RLS is never trusted alone (CI's pool is BYPASSRLS,
// Pitfall #14).
//
// Permissions reuse the existing `assignments.*` module (no new seeding):
//   GET -> assignments.view   POST -> assignments.create   PATCH/DELETE -> assignments.edit

const express = require('express');
const router = express.Router();
const { can } = require('../middleware/permissions');

// Verify a project belongs to the caller's company. Returns true/false.
async function projectInCompany(db, projectId, companyId) {
  const { rows } = await db.query(
    `SELECT 1 FROM public.projects WHERE id = $1 AND company_id = $2`,
    [projectId, companyId]
  );
  return rows.length > 0;
}

function parseProjectId(req) {
  const id = Number(req.params.projectId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// Validate + normalize a requirement payload. Returns { value } or { error }.
function normalizeRequirement(body, { partial = false } = {}) {
  const out = {};
  const has = (k) => body[k] !== undefined;

  if (!partial || has('trade_code')) {
    const tc = (body.trade_code || '').toString().trim();
    if (!tc) return { error: 'TRADE_CODE_REQUIRED' };
    out.trade_code = tc.toUpperCase();
  }
  if (!partial || has('required_count')) {
    const n = Number(body.required_count);
    if (!Number.isInteger(n) || n < 0) return { error: 'INVALID_COUNT' };
    out.required_count = n;
  }
  if (!partial || has('start_date')) {
    if (!body.start_date) return { error: 'START_DATE_REQUIRED' };
    out.start_date = body.start_date;
  }
  if (!partial || has('end_date')) {
    if (!body.end_date) return { error: 'END_DATE_REQUIRED' };
    out.end_date = body.end_date;
  }
  if (has('note')) out.note = body.note ? String(body.note) : null;

  // Range sanity when both ends are known in this payload.
  if (out.start_date && out.end_date && out.start_date > out.end_date) {
    return { error: 'INVALID_DATE_RANGE' };
  }
  return { value: out };
}

// ── GET /:projectId/requirements ── list a project's requirement rows ────────
router.get('/:projectId/requirements', can('assignments.view'), async (req, res) => {
  try {
    const projectId = parseProjectId(req);
    if (!projectId) return res.status(400).json({ ok: false, error: 'INVALID_PROJECT_ID' });
    const companyId = req.user.company_id;
    if (!(await projectInCompany(req.db, projectId, companyId)))
      return res.status(404).json({ ok: false, error: 'PROJECT_NOT_FOUND' });

    const { rows } = await req.db.query(
      `SELECT id, project_id, trade_code, required_count, start_date, end_date, note,
              created_at, updated_at
         FROM public.project_labor_requirements
        WHERE project_id = $1 AND company_id = $2
        ORDER BY start_date, trade_code`,
      [projectId, companyId]
    );
    return res.json({ ok: true, requirements: rows });
  } catch (err) {
    console.error('GET project requirements error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// ── POST /:projectId/requirements ── add a requirement row ───────────────────
router.post('/:projectId/requirements', can('assignments.create'), async (req, res) => {
  try {
    const projectId = parseProjectId(req);
    if (!projectId) return res.status(400).json({ ok: false, error: 'INVALID_PROJECT_ID' });
    const companyId = req.user.company_id;
    if (!(await projectInCompany(req.db, projectId, companyId)))
      return res.status(404).json({ ok: false, error: 'PROJECT_NOT_FOUND' });

    const { value, error } = normalizeRequirement(req.body || {});
    if (error) return res.status(400).json({ ok: false, error });

    const { rows } = await req.db.query(
      `INSERT INTO public.project_labor_requirements
         (company_id, project_id, trade_code, required_count, start_date, end_date, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, project_id, trade_code, required_count, start_date, end_date, note,
                 created_at, updated_at`,
      [
        companyId,
        projectId,
        value.trade_code,
        value.required_count,
        value.start_date,
        value.end_date,
        value.note ?? null,
      ]
    );
    return res.status(201).json({ ok: true, requirement: rows[0] });
  } catch (err) {
    console.error('POST project requirement error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// ── PATCH /:projectId/requirements/:id ── edit a requirement row ─────────────
router.patch('/:projectId/requirements/:id', can('assignments.edit'), async (req, res) => {
  try {
    const projectId = parseProjectId(req);
    const id = Number(req.params.id);
    if (!projectId || !Number.isInteger(id) || id <= 0)
      return res.status(400).json({ ok: false, error: 'INVALID_ID' });
    const companyId = req.user.company_id;

    const { value, error } = normalizeRequirement(req.body || {}, { partial: true });
    if (error) return res.status(400).json({ ok: false, error });
    const keys = Object.keys(value);
    if (!keys.length) return res.status(400).json({ ok: false, error: 'NO_FIELDS' });

    const sets = [];
    const params = [];
    let p = 1;
    for (const k of keys) {
      sets.push(`${k} = $${p++}`);
      params.push(value[k]);
    }
    sets.push('updated_at = NOW()');
    params.push(id, projectId, companyId);

    const { rows } = await req.db.query(
      `UPDATE public.project_labor_requirements
          SET ${sets.join(', ')}
        WHERE id = $${p++} AND project_id = $${p++} AND company_id = $${p}
        RETURNING id, project_id, trade_code, required_count, start_date, end_date, note,
                  created_at, updated_at`,
      params
    );
    if (!rows.length) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
    // Guard: if only one end of the range was patched, re-check ordering.
    if (rows[0].start_date > rows[0].end_date) {
      return res.status(400).json({ ok: false, error: 'INVALID_DATE_RANGE' });
    }
    return res.json({ ok: true, requirement: rows[0] });
  } catch (err) {
    console.error('PATCH project requirement error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// ── DELETE /:projectId/requirements/:id ──────────────────────────────────────
router.delete('/:projectId/requirements/:id', can('assignments.edit'), async (req, res) => {
  try {
    const projectId = parseProjectId(req);
    const id = Number(req.params.id);
    if (!projectId || !Number.isInteger(id) || id <= 0)
      return res.status(400).json({ ok: false, error: 'INVALID_ID' });
    const { rowCount } = await req.db.query(
      `DELETE FROM public.project_labor_requirements
        WHERE id = $1 AND project_id = $2 AND company_id = $3`,
      [id, projectId, req.user.company_id]
    );
    if (!rowCount) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
    return res.json({ ok: true });
  } catch (err) {
    console.error('DELETE project requirement error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// ── GET /:projectId/coverage?date=YYYY-MM-DD ── required vs assigned vs gap ───
// Per trade, for ONE day (defaults to today). required = sum of requirement
// rows covering that day; assigned = distinct APPROVED assignees on the project
// overlapping that day, by their profile trade; gap = required - assigned.
router.get('/:projectId/coverage', can('assignments.view'), async (req, res) => {
  try {
    const projectId = parseProjectId(req);
    if (!projectId) return res.status(400).json({ ok: false, error: 'INVALID_PROJECT_ID' });
    const companyId = req.user.company_id;
    if (!(await projectInCompany(req.db, projectId, companyId)))
      return res.status(404).json({ ok: false, error: 'PROJECT_NOT_FOUND' });

    const date = req.query.date || new Date().toISOString().slice(0, 10);

    const { rows: reqRows } = await req.db.query(
      `SELECT trade_code, COALESCE(SUM(required_count), 0)::int AS required
         FROM public.project_labor_requirements
        WHERE project_id = $1 AND company_id = $2
          AND start_date <= $3 AND end_date >= $3
        GROUP BY trade_code`,
      [projectId, companyId, date]
    );

    const { rows: asgRows } = await req.db.query(
      `SELECT COALESCE(ep.trade_code, 'UNKNOWN') AS trade_code,
              COUNT(DISTINCT ar.requested_for_employee_id)::int AS assigned
         FROM public.assignment_requests ar
         LEFT JOIN public.employee_profiles ep
           ON ep.employee_id = ar.requested_for_employee_id
        WHERE ar.project_id = $1 AND ar.company_id = $2
          AND ar.status = 'APPROVED'
          AND ar.start_date <= $3 AND ar.end_date >= $3
        GROUP BY COALESCE(ep.trade_code, 'UNKNOWN')`,
      [projectId, companyId, date]
    );

    // Merge required + assigned across the union of trades.
    const byTrade = new Map();
    for (const r of reqRows)
      byTrade.set(r.trade_code, { trade_code: r.trade_code, required: r.required, assigned: 0 });
    for (const a of asgRows) {
      const cur = byTrade.get(a.trade_code) || {
        trade_code: a.trade_code,
        required: 0,
        assigned: 0,
      };
      cur.assigned = a.assigned;
      byTrade.set(a.trade_code, cur);
    }
    const coverage = [...byTrade.values()]
      .map((c) => ({ ...c, gap: c.required - c.assigned }))
      .sort((a, b) => a.trade_code.localeCompare(b.trade_code));

    const totals = coverage.reduce(
      (t, c) => ({
        required: t.required + c.required,
        assigned: t.assigned + c.assigned,
        gap: t.gap + Math.max(0, c.gap),
      }),
      { required: 0, assigned: 0, gap: 0 }
    );

    return res.json({ ok: true, project_id: projectId, date, coverage, totals });
  } catch (err) {
    console.error('GET project coverage error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

module.exports = router;
