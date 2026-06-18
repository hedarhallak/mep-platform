'use strict';

/**
 * routes/assignments.js
 * Assignment request workflow:
 *   PM    → POST   /api/assignments/requests        (create request)
 *   ADMIN → PATCH  /api/assignments/requests/:id/approve
 *   ADMIN → PATCH  /api/assignments/requests/:id/reject
 *   ALL   → GET    /api/assignments/requests        (list requests)
 *   ALL   → GET    /api/assignments                 (list active assignments)
 *   ADMIN → DELETE /api/assignments/:id             (cancel assignment)
 *
 * Section 89-C/11: in-handler queries migrated from `pool.query` to
 * `req.db.query`. The `tenantDb` middleware (mounted in app.js) wraps
 * every request in a per-request transaction with `app.company_id` set
 * on the GUC, so RLS policies enforce cross-tenant isolation
 * automatically. Three pre-existing manual `pool.connect()/BEGIN/COMMIT`
 * blocks (PATCH /:id/reassign, PATCH /:id/move, POST /repeat-confirm)
 * collapsed to plain sequences of `req.db.query` calls — same pattern
 * as 89-C/4 (auto_assign), 89-C/9 (daily_dispatch), 89-C/10
 * (material_requests). The fire-and-forget helpers
 * (`notifyAssignment`, `calcDistanceKm`, `audit(pool, …)`) stay on
 * `pool` because they run **after** `res.end()` has fired, by which
 * point tenantDb has already committed and released the connection.
 * They each pass `companyId` and filter on `WHERE company_id = $…` so
 * tenant scoping is preserved without RLS.
 */

const express = require('express');
const router = express.Router();
const { audit, ACTIONS } = require('../lib/audit');
const { snapshotAssignmentLocation } = require('../lib/assignment_snapshot');
const {
  computeAndPersistAllowance,
  backfillDistanceAllowance,
} = require('../lib/assignment_allowance');
const { roadDistanceKm } = require('../lib/road_distance');
const { can } = require('../middleware/permissions');
const { sendAssignmentEmployee, sendAssignmentForeman } = require('../lib/email');

// ── notifyAssignment ──────────────────────────────────────────────
// Sends email to the assigned employee + foreman (same project, same trade).
// Never throws — errors are logged only.
//
// Section 89-E/1 (May 8, 2026): split into DB-read phase and
// email-send phase. Callers now invoke
// `await notifyAssignment(req.db, id, companyId)` — the await blocks
// only on the DB reads (fast). Email sends are launched as a detached
// promise inside this function and fire after the function returns,
// so the route handler's response time only includes the DB-read
// portion. This unblocks Stage 3 strict RLS: under strict mode,
// queries on the global pool with no GUC return zero rows, so the
// pre-89-E/1 fire-and-forget-on-pool pattern would have silently
// skipped notifications. By doing the reads on the request-scoped
// `req.db` (with the GUC set by tenantDb), they survive strict mode.
async function notifyAssignment(db, assignmentRequestId, companyId) {
  let data;
  try {
    data = await prepareNotifyData(db, assignmentRequestId, companyId);
  } catch (err) {
    console.error('[notifyAssignment] DB-read error:', err.message);
    return;
  }
  if (!data) return;

  // Detached: emails fly off independently of the request lifecycle.
  // No DB calls inside fireNotifyEmails — only sendgrid network I/O —
  // so survival past `res.end()` is fine.
  fireNotifyEmails(data).catch((err) =>
    console.error('[notifyAssignment] email error:', err.message)
  );
}

async function prepareNotifyData(db, assignmentRequestId, companyId) {
  // Load this assignment's details
  const { rows } = await db.query(
    `SELECT
       ar.start_date, ar.end_date, ar.shift_start, ar.shift_end, ar.decision_note AS notes,
       ar.assignment_role,
       ar.requested_for_employee_id AS employee_id,
       ar.project_id,
       ep.full_name    AS employee_name,
       ep.trade_code,
       ep.phone        AS employee_phone,
       ep.contact_email AS employee_email,
       p.project_code, p.project_name, p.site_address
     FROM public.assignment_requests ar
     JOIN public.employee_profiles ep ON ep.employee_id = ar.requested_for_employee_id
     JOIN public.projects           p  ON p.id          = ar.project_id
     WHERE ar.id = $1 AND ar.company_id = $2
     LIMIT 1`,
    [assignmentRequestId, companyId]
  );
  if (!rows.length) return null;
  const a = rows[0];

  // Load all APPROVED assignments on the same project overlapping this period
  const teamRes = await db.query(
    `SELECT
       ep.full_name    AS name,

       ep.contact_email,
       ar.assignment_role,
       ar.id
     FROM public.assignment_requests ar
     JOIN public.employee_profiles ep ON ep.employee_id = ar.requested_for_employee_id
     WHERE ar.project_id  = $1
       AND ar.company_id  = $2
       AND ar.status      = 'APPROVED'
       AND ar.id         != $3
       AND ar.start_date <= $4
       AND ar.end_date   >= $5`,
    [a.project_id, companyId, assignmentRequestId, a.end_date, a.start_date]
  );
  return { a, team: teamRes.rows };
}

async function fireNotifyEmails({ a, team }) {
  const foreman = team.find((t) => t.assignment_role === 'FOREMAN');

  if (a.assignment_role === 'FOREMAN') {
    // ── Foreman assigned ──
    // 1) Send foreman their own assignment details + list of workers
    const workers = team.filter((t) => t.assignment_role !== 'FOREMAN');
    if (a.employee_email) {
      await sendAssignmentForeman({
        to: a.employee_email,
        foremanName: a.employee_name,
        employeeName: null, // foreman is the one being assigned
        projectCode: a.project_code,
        projectName: a.project_name,
        siteAddress: a.site_address,
        startDate: a.start_date,
        endDate: a.end_date,
        shiftStart: a.shift_start,
        shiftEnd: a.shift_end,
        tradeCode: a.trade_code,
        teamList: workers,
        isSelfNotice: true,
      });
    }
    // 2) Notify existing workers — update them with foreman contact
    for (const worker of workers) {
      if (worker.contact_email) {
        await sendAssignmentEmployee({
          to: worker.contact_email,
          employeeName: worker.name,
          projectCode: a.project_code,
          projectName: a.project_name,
          siteAddress: a.site_address,
          startDate: a.start_date,
          endDate: a.end_date,
          shiftStart: a.shift_start,
          shiftEnd: a.shift_end,
          foremanName: a.employee_name,
          foremanPhone: a.employee_phone,
          updateType: 'foreman_assigned',
        });
      }
    }
  } else {
    // ── Worker / Journeyman assigned ──
    // 1) Send worker their assignment + foreman info if available
    if (a.employee_email) {
      await sendAssignmentEmployee({
        to: a.employee_email,
        employeeName: a.employee_name,
        projectCode: a.project_code,
        projectName: a.project_name,
        siteAddress: a.site_address,
        startDate: a.start_date,
        endDate: a.end_date,
        shiftStart: a.shift_start,
        shiftEnd: a.shift_end,
        notes: a.notes,
        foremanName: foreman?.name || null,
        foremanPhone: foreman?.phone || null,
      });
    }
    // 2) Notify foreman — new team member added
    if (foreman?.contact_email) {
      await sendAssignmentForeman({
        to: foreman.contact_email,
        foremanName: foreman.name,
        employeeName: a.employee_name,
        projectCode: a.project_code,
        projectName: a.project_name,
        siteAddress: a.site_address,
        startDate: a.start_date,
        endDate: a.end_date,
        shiftStart: a.shift_start,
        shiftEnd: a.shift_end,
        tradeCode: a.trade_code,
        teamList: null,
        isSelfNotice: false,
      });
    }
  }
}

// ── Role helpers ──────────────────────────────────────────────────
const { normalizeRole } = require('../middleware/roles');

// NOTE: a local requireRoles + ADMIN_ONLY + ADMIN_PM guards were
// previously defined here but never wired into any route — orphan from
// earlier permission-system refactors. Removed in Phase 11a cleanup.
// Use can('permission_code') from middleware/permissions.js for new routes.

// ── Time slots helper (every 30 min) ──────────────────────────────
function generateTimeSlots() {
  const slots = [];
  for (let h = 0; h < 24; h++) {
    for (let m of [0, 30]) {
      const hh = String(h).padStart(2, '0');
      const mm = String(m).padStart(2, '0');
      const ampm = h < 12 ? 'AM' : 'PM';
      const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
      slots.push({
        value: `${hh}:${mm}`,
        label: `${String(h12).padStart(2, '0')}:${mm} ${ampm}`,
      });
    }
  }
  return slots;
}

// ── GET /api/assignments/timeslots ────────────────────────────────
router.get('/timeslots', can('assignments.view'), (req, res) => {
  return res.json({ ok: true, slots: generateTimeSlots() });
});

// ── GET /api/assignments/employees-map ────────────────────────────
// Employees with home coords + availability for given period
router.get('/employees-map', can('assignments.view'), async (req, res) => {
  try {
    const { start, end } = req.query;
    const companyId = req.user.company_id;

    const { rows } = await req.db.query(
      `SELECT
         ep.employee_id AS id,
         ep.full_name,
         ep.trade_code,

         ST_X(ep.home_location::geometry) AS home_lng,
         ST_Y(ep.home_location::geometry) AS home_lat,
         CASE
           WHEN EXISTS (
             SELECT 1 FROM public.assignment_requests ar
             WHERE ar.requested_for_employee_id = ep.employee_id
               AND ar.company_id = $1
               AND ar.status = 'APPROVED'
               AND ($2::date IS NULL OR ar.start_date <= $3::date)
               AND ($3::date IS NULL OR ar.end_date   >= $2::date)
           ) THEN false
           ELSE true
         END AS is_available
       FROM public.employee_profiles ep
       JOIN public.app_users au ON au.employee_id = ep.employee_id
       WHERE au.company_id = $1
         AND au.employee_id IS NOT NULL
         AND ep.home_location IS NOT NULL
         AND ST_X(ep.home_location::geometry) != 0
         AND ST_Y(ep.home_location::geometry) != 0
       ORDER BY ep.full_name`,
      [companyId, start || null, end || null]
    );

    return res.json({ ok: true, employees: rows });
  } catch (err) {
    console.error('GET /assignments/employees-map error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});
// List employees that have a profile (employee_id not null)
router.get('/employees', can('assignments.view'), async (req, res) => {
  try {
    const { rows } = await req.db.query(
      `SELECT ep.employee_id AS id, ep.full_name, ep.trade_code, ep.role_code, ep.rank_code,
              au.username
       FROM public.app_users au
       JOIN public.employee_profiles ep ON ep.employee_id = au.employee_id
       WHERE au.company_id = $1
         AND au.employee_id IS NOT NULL
         AND au.role NOT IN ('ADMIN','SUPER_ADMIN')
       ORDER BY ep.full_name`,
      [req.user.company_id]
    );
    return res.json({ ok: true, employees: rows });
  } catch (err) {
    console.error('GET /assignments/employees error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// ── GET /api/assignments/defaults ─────────────────────────────────
// Returns company default shift times
router.get('/defaults', can('assignments.view'), async (req, res) => {
  try {
    const { rows } = await req.db.query(
      `SELECT default_shift_start, default_shift_end
       FROM public.companies WHERE company_id = $1 LIMIT 1`,
      [req.user.company_id]
    );
    const defaults = rows[0] || {};
    return res.json({
      ok: true,
      shift_start: defaults.default_shift_start || '06:00',
      shift_end: defaults.default_shift_end || '14:30',
    });
  } catch (err) {
    console.error('GET /assignments/defaults error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// ── GET /api/assignments/my-today ─────────────────────────────────
// Returns the current user's active assignment for today
// Used by MaterialRequest, TaskRequest, Standup to auto-select project
router.get('/my-today', async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const userId = req.user.user_id;
    const today = new Date().toISOString().split('T')[0];

    const { rows } = await req.db.query(
      `SELECT
         ar.id AS assignment_id,
         ar.project_id,
         ar.assignment_role,
         ar.shift_start,
         ar.shift_end,
         p.project_code,
         p.project_name,
         p.site_address
       FROM public.assignment_requests ar
       JOIN public.app_users au ON au.employee_id = ar.requested_for_employee_id
       JOIN public.projects   p  ON p.id = ar.project_id
       WHERE ar.company_id = $1
         AND au.id         = $2
         AND ar.status     = 'APPROVED'
         AND ar.start_date <= $3
         AND ar.end_date   >= $3
       ORDER BY ar.start_date DESC
       LIMIT 1`,
      [companyId, userId, today]
    );

    return res.json({
      ok: true,
      assignment: rows[0] || null,
    });
  } catch (err) {
    console.error('GET /assignments/my-today error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// ── GET /api/assignments/requests ─────────────────────────────────
router.get('/requests', can('assignments.view'), async (req, res) => {
  try {
    const { status } = req.query;
    const companyId = req.user.company_id;

    let query = `
      SELECT
        ar.id,
        ar.status,
        ar.start_date,
        ar.end_date,
        ar.shift_start,
        ar.shift_end,
        ar.decision_note AS notes,
        ar.created_at,
        ar.decision_note,
        ar.decision_at,
        p.project_code,
        p.project_name,
        ep.full_name   AS employee_name,
        ep.trade_code  AS employee_trade,
        requester.username AS requested_by_name,
        reviewer.username  AS reviewed_by_name
      FROM public.assignment_requests ar
      JOIN public.projects         p        ON p.id            = ar.project_id
      JOIN public.employee_profiles ep       ON ep.employee_id  = ar.requested_for_employee_id
      LEFT JOIN public.app_users    requester ON requester.id   = ar.requested_by_user_id
      LEFT JOIN public.app_users    reviewer  ON reviewer.id    = ar.decision_by_user_id
      WHERE ar.company_id = $1
    `;

    const params = [companyId];

    if (status) {
      params.push(String(status).toUpperCase());
      query += ` AND ar.status = $${params.length}`;
    }

    // PM sees only their own requests
    if (normalizeRole(req.user.role) === 'TRADE_PROJECT_MANAGER') {
      params.push(req.user.user_id);
      query += ` AND ar.requested_by_user_id = $${params.length}`;
    }

    query += ' ORDER BY ar.created_at DESC';

    const { rows } = await req.db.query(query, params);
    return res.json({ ok: true, requests: rows });
  } catch (err) {
    console.error('GET /assignments/requests error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// ── POST /api/assignments/requests ────────────────────────────────
router.post('/requests', can('assignments.create'), async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const {
      project_id,
      employee_id,
      start_date,
      end_date,
      shift_start,
      shift_end,
      notes,
      assignment_role,
    } = req.body || {};

    const role = ['WORKER', 'FOREMAN', 'JOURNEYMAN'].includes((assignment_role || '').toUpperCase())
      ? assignment_role.toUpperCase()
      : 'WORKER';

    // Validate required fields
    if (!project_id) return res.status(400).json({ ok: false, error: 'PROJECT_REQUIRED' });
    if (!employee_id) return res.status(400).json({ ok: false, error: 'EMPLOYEE_REQUIRED' });
    if (!start_date) return res.status(400).json({ ok: false, error: 'START_DATE_REQUIRED' });
    if (!end_date) return res.status(400).json({ ok: false, error: 'END_DATE_REQUIRED' });
    if (!shift_start) return res.status(400).json({ ok: false, error: 'SHIFT_START_REQUIRED' });
    if (!shift_end) return res.status(400).json({ ok: false, error: 'SHIFT_END_REQUIRED' });

    if (new Date(end_date) < new Date(start_date))
      return res.status(400).json({ ok: false, error: 'END_DATE_BEFORE_START' });

    // Verify project belongs to company and is ACTIVE
    const project = await req.db.query(
      `SELECT p.id, p.project_name, ps.code AS status_code
       FROM public.projects p
       JOIN public.project_statuses ps ON ps.id = p.status_id
       WHERE p.id = $1 AND p.company_id = $2 LIMIT 1`,
      [project_id, companyId]
    );
    if (!project.rows.length)
      return res.status(400).json({ ok: false, error: 'PROJECT_NOT_FOUND' });
    if (project.rows[0].status_code !== 'ACTIVE')
      return res.status(400).json({ ok: false, error: 'PROJECT_NOT_ACTIVE' });

    // Verify employee belongs to company
    const employee = await req.db.query(
      `SELECT ep.employee_id, ep.full_name
       FROM public.employee_profiles ep
       JOIN public.app_users au ON au.employee_id = ep.employee_id
       WHERE ep.employee_id = $1 AND au.company_id = $2 LIMIT 1`,
      [employee_id, companyId]
    );
    if (!employee.rows.length)
      return res.status(400).json({ ok: false, error: 'EMPLOYEE_NOT_FOUND' });

    // Check for overlapping APPROVED assignments for this employee
    const overlap = await req.db.query(
      `SELECT ar.id FROM public.assignment_requests ar
       WHERE ar.requested_for_employee_id = $1
         AND ar.company_id = $2
         AND ar.status = 'APPROVED'
         AND ar.start_date <= $3
         AND ar.end_date   >= $4`,
      [employee_id, companyId, end_date, start_date]
    );
    if (overlap.rows.length > 0)
      return res.status(409).json({
        ok: false,
        error: 'EMPLOYEE_ALREADY_ASSIGNED',
        message: `${employee.rows[0].full_name} is already assigned to another project during this period.`,
      });

    // Also check for PENDING requests that overlap
    const pendingOverlap = await req.db.query(
      `SELECT ar.id FROM public.assignment_requests ar
       WHERE ar.requested_for_employee_id = $1
         AND ar.company_id = $2
         AND ar.status = 'PENDING'
         AND ar.start_date <= $3
         AND ar.end_date   >= $4`,
      [employee_id, companyId, end_date, start_date]
    );
    if (pendingOverlap.rows.length > 0)
      return res.status(409).json({
        ok: false,
        error: 'EMPLOYEE_HAS_PENDING_REQUEST',
        message: `${employee.rows[0].full_name} already has a pending request for this period.`,
      });

    // Create request
    // COMPANY_ADMIN and TRADE_ADMIN requests are auto-approved
    const autoApproveRoles = ['COMPANY_ADMIN', 'TRADE_ADMIN', 'TRADE_PROJECT_MANAGER'];
    const isAdmin = autoApproveRoles.includes(normalizeRole(req.user.role));
    const status = isAdmin ? 'APPROVED' : 'PENDING';

    const { rows } = await req.db.query(
      `INSERT INTO public.assignment_requests
         (company_id, project_id, requested_for_employee_id, requested_by_user_id,
          start_date, end_date, shift_start, shift_end, decision_note, assignment_role,
          status, request_type, payload_json,
          decision_by_user_id, decision_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'CREATE_ASSIGNMENT','{}',
               $12, $13, NOW(), NOW())
       RETURNING *`,
      [
        companyId,
        project_id,
        employee_id,
        req.user.user_id,
        start_date,
        end_date,
        shift_start,
        shift_end,
        notes || null,
        role,
        status,
        isAdmin ? req.user.user_id : null,
        isAdmin ? new Date() : null,
      ]
    );

    // §132 snapshot: lock the project's location onto the new assignment so a
    // later project-address edit can't retroactively change its allowance.
    await snapshotAssignmentLocation(req.db, rows[0].id, companyId);

    await audit(req.db, req, {
      action: ACTIONS.ASSIGNMENT_CREATED,
      entity_type: 'assignment_request',
      entity_id: rows[0].id,
      entity_name: `${employee.rows[0].full_name} → ${project.rows[0].project_name}`,
      new_values: { status, start_date, end_date, shift_start, shift_end },
    });

    // Calculate and store distance + CCQ allowance for auto-approved assignments
    if (isAdmin) {
      await notifyAssignment(req.db, rows[0].id, companyId);
      // 89-E/2 / §144: synchronous real-road-distance + allowance calc. Adds
      // ~200-500ms to response time but works under Stage 3 strict RLS (pool
      // path would return 0 rows). Writes through req.db so it's covered by
      // the request transaction.
      await persistDistanceAndAllowance(req.db, rows[0].id, employee_id, project_id, companyId);
    }

    return res.status(201).json({ ok: true, request: rows[0], auto_approved: isAdmin });
  } catch (err) {
    console.error('POST /assignments/requests error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// ── Mapbox Distance Helper ────────────────────────────────────────
//
// Section 89-E/2 (May 8, 2026): refactored from fire-and-forget on
// `pool` to await + `req.db`. The Mapbox API call between the DB
// reads and the post-call UPDATE adds ~200-500ms to caller response
// time, but this is the cost of correctness under Stage 3 strict RLS:
// pool reads with no GUC return zero rows.
//
// Caller pattern changes from
//   calcDistanceKm(empId, projId, companyId).then(km => pool.query(UPDATE…));
// to
//   const km = await calcDistanceKm(req.db, empId, projId, companyId);
//   if (km !== null) await req.db.query('UPDATE…');
//
// (The post-Mapbox UPDATE is the caller's responsibility now — the
// helper just returns the km. Keeps the helper simple and lets the
// caller pick the right tx for the UPDATE.)
//
// §131.3 / G5: the actual road-distance call is now delegated to
// lib/road_distance.js (Google Routes API → Mapbox → haversine fallback) so
// the committed distance matches what employees verify on Google Maps.
async function calcDistanceKm(db, employeeId, projectId, companyId) {
  try {
    const empRes = await db.query(
      `SELECT ST_Y(home_location::geometry) AS home_lat,
              ST_X(home_location::geometry) AS home_lng
       FROM public.employee_profiles
       WHERE employee_id = $1
         AND home_location IS NOT NULL
       LIMIT 1`,
      [employeeId]
    );
    const emp = empRes.rows[0];
    if (!emp || !emp.home_lat || !emp.home_lng) return null;

    // Get project site coords
    const projRes = await db.query(
      `SELECT site_lat, site_lng FROM public.projects
       WHERE id = $1 AND company_id = $2 LIMIT 1`,
      [projectId, companyId]
    );
    const proj = projRes.rows[0];
    if (!proj || !proj.site_lat || !proj.site_lng) return null;

    // Google Routes → Mapbox → haversine (lib/road_distance.js).
    return await roadDistanceKm(emp.home_lat, emp.home_lng, proj.site_lat, proj.site_lng);
  } catch (err) {
    console.error('calcDistanceKm error:', err.message);
    return null;
  }
}

// ── Distance + CCQ allowance persistence ──────────────────────────
//
// §131.3 / G5 / §144: every time an assignment becomes APPROVED or is moved
// to a different project, recompute the REAL road distance (Google Routes) and
// the payroll-grade daily CCQ allowance, and persist both. The allowance reads
// the §132 location snapshot (sector frozen at assignment time) + the rate
// effective on start_date, so it is both dispute-proof and tamper-proof.
//
// Single orchestrator so the four single-assignment write paths (create
// auto-approve, approve, reassign, move) stay DRY — each is one await. The
// snapshot MUST already be captured for this assignment before calling this
// (allowance reads snapshot_ccq_sector). Never throws.
async function persistDistanceAndAllowance(db, assignmentId, employeeId, projectId, companyId) {
  try {
    const km = await calcDistanceKm(db, employeeId, projectId, companyId);
    if (km === null) return;
    await db.query('UPDATE public.assignment_requests SET distance_km = $1 WHERE id = $2', [
      km,
      assignmentId,
    ]);
    await computeAndPersistAllowance(db, assignmentId, companyId, km);
  } catch (e) {
    console.error('persistDistanceAndAllowance error:', e.message);
  }
}

// ── PATCH /api/assignments/requests/:id/approve ──────────────────
router.patch('/requests/:id/approve', can('assignments.edit'), async (req, res) => {
  try {
    const reqId = Number(req.params.id);
    const companyId = req.user.company_id;

    const existing = await req.db.query(
      'SELECT * FROM public.assignment_requests WHERE id = $1 AND company_id = $2 LIMIT 1',
      [reqId, companyId]
    );
    if (!existing.rows.length)
      return res.status(404).json({ ok: false, error: 'REQUEST_NOT_FOUND' });

    if (existing.rows[0].status !== 'PENDING')
      return res.status(409).json({ ok: false, error: 'REQUEST_NOT_PENDING' });

    const r = existing.rows[0];

    // Re-check overlap before approving
    const overlap = await req.db.query(
      `SELECT id FROM public.assignment_requests
       WHERE requested_for_employee_id = $1
         AND company_id = $2
         AND status = 'APPROVED'
         AND id != $3
         AND start_date <= $4
         AND end_date   >= $5`,
      [r.requested_for_employee_id, companyId, reqId, r.end_date, r.start_date]
    );
    if (overlap.rows.length > 0)
      return res.status(409).json({ ok: false, error: 'EMPLOYEE_ALREADY_ASSIGNED' });

    const { rows } = await req.db.query(
      `UPDATE public.assignment_requests
       SET status = 'APPROVED', decision_by_user_id = $1, decision_at = NOW(), updated_at = NOW()
       WHERE id = $2 AND company_id = $3
       RETURNING *`,
      [req.user.user_id, reqId, companyId]
    );

    await audit(req.db, req, {
      action: ACTIONS.ASSIGNMENT_UPDATED,
      entity_type: 'assignment_request',
      entity_id: reqId,
      details: { action: 'APPROVED' },
    });

    // Send notification emails
    await notifyAssignment(req.db, reqId, companyId);

    // 89-E/2 / §144: synchronous real-road-distance + allowance calc. ~200-500ms.
    await persistDistanceAndAllowance(
      req.db,
      reqId,
      r.requested_for_employee_id,
      r.project_id,
      companyId
    );

    return res.json({ ok: true, request: rows[0] });
  } catch (err) {
    console.error('PATCH approve error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// ── PATCH /api/assignments/requests/:id/reject ───────────────────
router.patch('/requests/:id/reject', can('assignments.edit'), async (req, res) => {
  try {
    const reqId = Number(req.params.id);
    const companyId = req.user.company_id;
    const { reason } = req.body || {};

    const existing = await req.db.query(
      'SELECT id, status FROM public.assignment_requests WHERE id = $1 AND company_id = $2 LIMIT 1',
      [reqId, companyId]
    );
    if (!existing.rows.length)
      return res.status(404).json({ ok: false, error: 'REQUEST_NOT_FOUND' });
    if (existing.rows[0].status !== 'PENDING')
      return res.status(409).json({ ok: false, error: 'REQUEST_NOT_PENDING' });

    const { rows } = await req.db.query(
      `UPDATE public.assignment_requests
       SET status = 'REJECTED', decision_by_user_id = $1, decision_at = NOW(),
           decision_note = $2, updated_at = NOW()
       WHERE id = $3 AND company_id = $4
       RETURNING *`,
      [req.user.user_id, reason || null, reqId, companyId]
    );

    await audit(req.db, req, {
      action: ACTIONS.ASSIGNMENT_UPDATED,
      entity_type: 'assignment_request',
      entity_id: reqId,
      details: { action: 'REJECTED', reason },
    });

    return res.json({ ok: true, request: rows[0] });
  } catch (err) {
    console.error('PATCH reject error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// ── PATCH /api/assignments/requests/:id/cancel ───────────────────
// PM can cancel their own PENDING request
router.patch('/requests/:id/cancel', can('assignments.edit'), async (req, res) => {
  try {
    const reqId = Number(req.params.id);
    const companyId = req.user.company_id;

    const existing = await req.db.query(
      'SELECT * FROM public.assignment_requests WHERE id = $1 AND company_id = $2 LIMIT 1',
      [reqId, companyId]
    );
    if (!existing.rows.length)
      return res.status(404).json({ ok: false, error: 'REQUEST_NOT_FOUND' });

    const r = existing.rows[0];

    // PM can only cancel own requests
    if (
      normalizeRole(req.user.role) === 'TRADE_PROJECT_MANAGER' &&
      r.requested_by_user_id !== req.user.user_id
    )
      return res.status(403).json({ ok: false, error: 'FORBIDDEN' });

    if (!['PENDING', 'APPROVED'].includes(r.status))
      return res.status(409).json({ ok: false, error: 'CANNOT_CANCEL' });

    const { rows } = await req.db.query(
      `UPDATE public.assignment_requests
       SET status = 'CANCELLED', updated_at = NOW()
       WHERE id = $1 AND company_id = $2
       RETURNING *`,
      [reqId, companyId]
    );

    await audit(req.db, req, {
      action: ACTIONS.ASSIGNMENT_DELETED,
      entity_type: 'assignment_request',
      entity_id: reqId,
      details: { cancelled_by: req.user.username },
    });

    return res.json({ ok: true, request: rows[0] });
  } catch (err) {
    console.error('PATCH cancel error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// ── GET /api/assignments ──────────────────────────────────────────
// Active (APPROVED) assignments — what's on site today/upcoming
router.get('/', can('assignments.view'), async (req, res) => {
  try {
    const { project_id, employee_id, date } = req.query;
    const companyId = req.user.company_id;

    let query = `
      SELECT
        ar.id,
        ar.start_date,
        ar.end_date,
        ar.shift_start,
        ar.shift_end,
        ar.decision_note AS notes,
        ar.assignment_role,
        ar.created_at,
        p.id           AS project_id,
        p.project_code,
        p.project_name,
        p.site_address,
        ep.employee_id,
        ep.full_name   AS employee_name,
        ep.trade_code,


        requester.username AS assigned_by
      FROM public.assignment_requests ar
      JOIN public.projects          p         ON p.id           = ar.project_id
      JOIN public.employee_profiles ep        ON ep.employee_id = ar.requested_for_employee_id
      LEFT JOIN public.app_users    requester ON requester.id   = ar.requested_by_user_id
      WHERE ar.company_id = $1 AND ar.status = 'APPROVED'
    `;

    const params = [companyId];

    if (project_id) {
      params.push(project_id);
      query += ` AND ar.project_id = $${params.length}`;
    }

    if (employee_id) {
      params.push(employee_id);
      query += ` AND ar.requested_for_employee_id = $${params.length}`;
    }

    if (date) {
      params.push(date);
      query += ` AND ar.start_date <= $${params.length} AND ar.end_date >= $${params.length}`;
    }

    query += ' ORDER BY ar.start_date ASC, ep.full_name ASC';

    const { rows } = await req.db.query(query, params);
    return res.json({ ok: true, assignments: rows });
  } catch (err) {
    console.error('GET /assignments error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// ── PATCH /api/assignments/requests/:id/reassign ─────────────────
// Atomically cancel old assignment + create new one. Under tenantDb,
// the request is already wrapped in one transaction — no manual BEGIN
// needed. Pre-existing pool.connect()/BEGIN/COMMIT was flattened in
// 89-C/11.
router.patch('/requests/:id/reassign', can('assignments.edit'), async (req, res) => {
  try {
    const reqId = Number(req.params.id);
    const companyId = req.user.company_id;
    const { new_employee_id } = req.body || {};

    if (!new_employee_id)
      return res.status(400).json({ ok: false, error: 'NEW_EMPLOYEE_REQUIRED' });

    // Get original assignment
    const orig = await req.db.query(
      `SELECT * FROM public.assignment_requests WHERE id = $1 AND company_id = $2 LIMIT 1`,
      [reqId, companyId]
    );
    if (!orig.rows.length) {
      return res.status(404).json({ ok: false, error: 'REQUEST_NOT_FOUND' });
    }
    const r = orig.rows[0];
    if (r.status !== 'APPROVED') {
      return res.status(409).json({ ok: false, error: 'CANNOT_REASSIGN' });
    }

    // Verify new employee belongs to company
    const emp = await req.db.query(
      `SELECT ep.employee_id, ep.full_name
       FROM public.employee_profiles ep
       JOIN public.app_users au ON au.employee_id = ep.employee_id
       WHERE ep.employee_id = $1 AND au.company_id = $2 LIMIT 1`,
      [new_employee_id, companyId]
    );
    if (!emp.rows.length) {
      return res.status(400).json({ ok: false, error: 'EMPLOYEE_NOT_FOUND' });
    }

    // Cancel old assignment
    await req.db.query(
      `UPDATE public.assignment_requests SET status = 'CANCELLED', updated_at = NOW() WHERE id = $1`,
      [reqId]
    );

    // Check overlap for new employee (excluding the row we just cancelled)
    const overlap = await req.db.query(
      `SELECT id FROM public.assignment_requests
       WHERE requested_for_employee_id = $1
         AND company_id = $2
         AND status IN ('APPROVED', 'PENDING')
         AND start_date <= $3
         AND end_date   >= $4`,
      [new_employee_id, companyId, r.end_date, r.start_date]
    );
    if (overlap.rows.length > 0) {
      // Throw so tenantDb rolls back the cancellation we just did.
      const err = new Error('EMPLOYEE_ALREADY_ASSIGNED');
      err.statusCode = 409;
      err.body = {
        ok: false,
        error: 'EMPLOYEE_ALREADY_ASSIGNED',
        message: `${emp.rows[0].full_name} is already assigned to another project during this period.`,
      };
      throw err;
    }

    // Create new assignment
    const { rows } = await req.db.query(
      `INSERT INTO public.assignment_requests
         (company_id, project_id, requested_for_employee_id, requested_by_user_id,
          start_date, end_date, shift_start, shift_end, decision_note,
          status, request_type, payload_json,
          decision_by_user_id, decision_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'APPROVED','CREATE_ASSIGNMENT','{}',
               $4, NOW(), NOW(), NOW())
       RETURNING *`,
      [
        companyId,
        r.project_id,
        new_employee_id,
        req.user.user_id,
        r.start_date,
        r.end_date,
        r.shift_start,
        r.shift_end,
        r.notes || null,
      ]
    );

    // §132 snapshot: reassign creates a NEW row → capture its location.
    await snapshotAssignmentLocation(req.db, rows[0].id, companyId);

    // §144: new approved assignment → compute its real distance + allowance.
    await persistDistanceAndAllowance(req.db, rows[0].id, new_employee_id, r.project_id, companyId);

    // Send notification to new employee + foreman (fire-and-forget after
    // tenantDb commits)
    await notifyAssignment(req.db, rows[0].id, companyId);

    return res.json({ ok: true, request: rows[0] });
  } catch (err) {
    if (err.statusCode && err.body) {
      return res.status(err.statusCode).json(err.body);
    }
    console.error('PATCH reassign error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// ── PATCH /api/assignments/requests/:id/move ─────────────────────
// Move an employee to a different project (same dates + shift).
// 89-C/11: manual transaction flattened to req.db sequence.
router.patch('/requests/:id/move', can('assignments.edit'), async (req, res) => {
  try {
    const reqId = Number(req.params.id);
    const companyId = req.user.company_id;
    const { new_project_id } = req.body || {};

    if (!new_project_id) return res.status(400).json({ ok: false, error: 'NEW_PROJECT_REQUIRED' });

    // Get original assignment
    const orig = await req.db.query(
      `SELECT ar.*, ep.full_name AS employee_name
       FROM public.assignment_requests ar
       JOIN public.employee_profiles ep ON ep.employee_id = ar.requested_for_employee_id
       WHERE ar.id = $1 AND ar.company_id = $2 LIMIT 1`,
      [reqId, companyId]
    );
    if (!orig.rows.length) {
      return res.status(404).json({ ok: false, error: 'REQUEST_NOT_FOUND' });
    }
    const r = orig.rows[0];
    if (r.status !== 'APPROVED') {
      return res.status(409).json({
        ok: false,
        error: 'CANNOT_MOVE',
        message: 'Only APPROVED assignments can be moved.',
      });
    }
    // Bug 9 fix (May 3, 2026): node-pg returns bigint columns as strings,
    // so `r.project_id` is a string while `Number(new_project_id)` is a JS
    // Number. Strict === between "5" and 5 is always false, making this
    // guard dead code. Coerce both sides to Number for a correct compare.
    // See DECISIONS.md Section 41 for the original Bug 9 pin.
    if (Number(r.project_id) === Number(new_project_id)) {
      return res.status(400).json({
        ok: false,
        error: 'SAME_PROJECT',
        message: 'Employee is already assigned to this project.',
      });
    }

    // Verify new project belongs to company and is ACTIVE
    const proj = await req.db.query(
      `SELECT p.id, p.project_name, p.project_code, ps.code AS status_code
       FROM public.projects p
       JOIN public.project_statuses ps ON ps.id = p.status_id
       WHERE p.id = $1 AND p.company_id = $2 LIMIT 1`,
      [new_project_id, companyId]
    );
    if (!proj.rows.length) {
      return res.status(404).json({ ok: false, error: 'PROJECT_NOT_FOUND' });
    }
    if (proj.rows[0].status_code !== 'ACTIVE') {
      return res.status(400).json({ ok: false, error: 'PROJECT_NOT_ACTIVE' });
    }

    // Check employee not already assigned to new project during same period
    const overlap = await req.db.query(
      `SELECT id FROM public.assignment_requests
       WHERE requested_for_employee_id = $1
         AND project_id = $2
         AND company_id = $3
         AND status IN ('APPROVED', 'PENDING')
         AND id != $4
         AND start_date <= $5
         AND end_date   >= $6`,
      [r.requested_for_employee_id, new_project_id, companyId, reqId, r.end_date, r.start_date]
    );
    if (overlap.rows.length > 0) {
      return res.status(409).json({
        ok: false,
        error: 'EMPLOYEE_ALREADY_ON_PROJECT',
        message: `${r.employee_name} is already assigned to this project during this period.`,
      });
    }

    // Update project_id in-place (no need to cancel + recreate)
    const { rows } = await req.db.query(
      `UPDATE public.assignment_requests
       SET project_id = $1, updated_at = NOW()
       WHERE id = $2 AND company_id = $3
       RETURNING *`,
      [new_project_id, reqId, companyId]
    );

    // §132 snapshot: the project changed → re-capture the new project's
    // location so the allowance follows the project the worker is now on.
    await snapshotAssignmentLocation(req.db, reqId, companyId);

    // §144: project changed → recompute real distance + allowance for the
    // project the worker is now on.
    await persistDistanceAndAllowance(
      req.db,
      reqId,
      r.requested_for_employee_id,
      new_project_id,
      companyId
    );

    await audit(req.db, req, {
      action: ACTIONS.ASSIGNMENT_UPDATED,
      entity_type: 'assignment_request',
      entity_id: reqId,
      details: {
        action: 'MOVED',
        from_project: r.project_id,
        to_project: new_project_id,
        employee: r.employee_name,
      },
    });

    // Notify employee of new project assignment (DB reads await'd; emails detached)
    await notifyAssignment(req.db, reqId, companyId);

    return res.json({ ok: true, request: rows[0] });
  } catch (err) {
    console.error('PATCH /move error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// ── POST /api/assignments/repeat-preview ──────────────────────────
// Shows what would be repeated from today to target_date
router.post('/repeat-preview', can('assignments.create'), async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const { target_date } = req.body || {};
    if (!target_date) return res.status(400).json({ ok: false, error: 'TARGET_DATE_REQUIRED' });

    const today = new Date().toISOString().split('T')[0];

    // Get today's APPROVED assignments
    const { rows: todayRows } = await req.db.query(
      `SELECT
         ar.id, ar.requested_for_employee_id AS employee_id,
         ar.project_id, ar.shift_start, ar.shift_end, ar.decision_note AS notes, ar.assignment_role,
         ep.full_name  AS employee_name,
         ep.trade_code,
         p.project_code
       FROM public.assignment_requests ar
       JOIN public.employee_profiles ep ON ep.employee_id = ar.requested_for_employee_id
       JOIN public.projects           p  ON p.id          = ar.project_id
       WHERE ar.company_id = $1
         AND ar.status     = 'APPROVED'
         AND ar.start_date <= $2
         AND ar.end_date   >= $2`,
      [companyId, today]
    );

    if (!todayRows.length)
      return res.json({
        ok: true,
        to_assign: [],
        already_set: [],
        message: 'No assignments today.',
      });

    // Check which employees already have an assignment on target_date
    const { rows: busyRows } = await req.db.query(
      `SELECT DISTINCT requested_for_employee_id
       FROM public.assignment_requests
       WHERE company_id = $1
         AND status IN ('APPROVED','PENDING')
         AND start_date <= $2
         AND end_date   >= $2`,
      [companyId, target_date]
    );
    const busyIds = new Set(busyRows.map((r) => r.requested_for_employee_id));

    const to_assign = todayRows.filter((a) => !busyIds.has(a.employee_id));
    const already_set = todayRows.filter((a) => busyIds.has(a.employee_id));

    return res.json({ ok: true, to_assign, already_set });
  } catch (err) {
    console.error('POST /repeat-preview error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// ── POST /api/assignments/repeat-confirm ──────────────────────────
// Creates assignments for target_date based on today's assignments (skips already assigned).
// 89-C/11: manual transaction flattened to req.db sequence.
router.post('/repeat-confirm', can('assignments.create'), async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const { target_date } = req.body || {};
    if (!target_date) return res.status(400).json({ ok: false, error: 'TARGET_DATE_REQUIRED' });

    const today = new Date().toISOString().split('T')[0];

    // Get today's assignments
    const { rows: todayRows } = await req.db.query(
      `SELECT
         ar.requested_for_employee_id AS employee_id,
         ar.project_id, ar.shift_start, ar.shift_end, ar.decision_note AS notes, ar.assignment_role
       FROM public.assignment_requests ar
       WHERE ar.company_id = $1
         AND ar.status     = 'APPROVED'
         AND ar.start_date <= $2
         AND ar.end_date   >= $2`,
      [companyId, today]
    );
    if (!todayRows.length) return res.json({ ok: true, created: 0, skipped: 0 });

    // Get already assigned on target_date
    const { rows: busyRows } = await req.db.query(
      `SELECT DISTINCT requested_for_employee_id
       FROM public.assignment_requests
       WHERE company_id = $1
         AND status IN ('APPROVED','PENDING')
         AND start_date <= $2
         AND end_date   >= $2`,
      [companyId, target_date]
    );
    const busyIds = new Set(busyRows.map((r) => r.requested_for_employee_id));

    let created = 0;
    let skipped = 0;
    const createdIds = [];

    for (const a of todayRows) {
      if (busyIds.has(a.employee_id)) {
        skipped++;
        continue;
      }

      const { rows } = await req.db.query(
        `INSERT INTO public.assignment_requests
           (company_id, project_id, requested_for_employee_id, requested_by_user_id,
            start_date, end_date, shift_start, shift_end, decision_note, assignment_role,
            status, request_type, payload_json,
            decision_by_user_id, decision_at, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$5,$6,$7,$8,$9,'APPROVED','CREATE_ASSIGNMENT','{}',
                 $4,NOW(),NOW(),NOW())
         RETURNING id`,
        [
          companyId,
          a.project_id,
          a.employee_id,
          req.user.user_id,
          target_date,
          a.shift_start,
          a.shift_end,
          a.notes || null,
          a.assignment_role || 'WORKER',
        ]
      );
      // §132 snapshot: capture the project's location for this new row.
      // §144: distance/allowance NOT computed per-row here (a Google call inside
      // this loop = N sequential round-trips, §4.5) — done in one concurrency-
      // capped batch after the loop instead.
      await snapshotAssignmentLocation(req.db, rows[0].id, companyId);
      createdIds.push(rows[0].id);
      created++;
    }

    // §144.3: batch payroll-grade real-road-distance + CCQ allowance for all
    // created rows (concurrency-capped). On req.db — sees its own uncommitted
    // inserts; the UPDATEs commit with the request at res.end.
    await backfillDistanceAllowance(req.db, createdIds, companyId);

    // Send notifications (DB reads await'd inside the loop; emails fire detached
    // per-assignment after each notifyAssignment returns)
    for (const id of createdIds) {
      await notifyAssignment(req.db, id, companyId);
    }

    return res.json({ ok: true, created, skipped });
  } catch (err) {
    console.error('POST /repeat-confirm error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// ── GET /api/assignments/suggest/:project_id ─────────────────────
// Smart suggestions: available employees ranked by distance + compatibility
router.get('/suggest/:project_id', can('assignments.view'), async (req, res) => {
  try {
    const projectId = Number(req.params.project_id);
    const companyId = req.user.company_id;
    const { start_date, end_date } = req.query;

    if (!projectId) return res.status(400).json({ ok: false, error: 'INVALID_ID' });
    if (!start_date || !end_date)
      return res.status(400).json({ ok: false, error: 'DATES_REQUIRED' });

    // Get project details + coords
    const projRes = await req.db.query(
      `SELECT p.id, p.project_name, p.project_code, p.trade_type_id,
              p.site_lat, p.site_lng,
              tt.code AS trade_code
       FROM public.projects p
       LEFT JOIN public.trade_types tt ON tt.id = p.trade_type_id
       WHERE p.id = $1 AND p.company_id = $2 LIMIT 1`,
      [projectId, companyId]
    );
    if (!projRes.rows.length)
      return res.status(404).json({ ok: false, error: 'PROJECT_NOT_FOUND' });

    const project = projRes.rows[0];

    // Get all employees with profiles for this company
    const empRes = await req.db.query(
      `SELECT
         ep.employee_id AS id,
         ep.full_name,
         ep.trade_code,
         ep.role_code,

         ep.home_address,
         ST_X(ep.home_location::geometry) AS home_lng,
         ST_Y(ep.home_location::geometry) AS home_lat,
         au.username,
         CASE
           WHEN ep.home_location IS NOT NULL
                AND ST_X(ep.home_location::geometry) != 0
                AND ST_Y(ep.home_location::geometry) != 0
                AND $2::float IS NOT NULL
           THEN ROUND(
             (ST_Distance(
               ep.home_location::geography,
               ST_SetSRID(ST_MakePoint($2::float, $3::float), 4326)::geography
             ) / 1000)::numeric, 1
           )
           ELSE NULL
         END AS distance_km
       FROM public.employee_profiles ep
       JOIN public.app_users au ON au.employee_id = ep.employee_id
       WHERE au.company_id = $1
         AND au.employee_id IS NOT NULL
         AND au.role NOT IN ('ADMIN','SUPER_ADMIN')
       ORDER BY ep.full_name`,
      [companyId, project.site_lng, project.site_lat]
    );

    // Get employees already assigned during this period
    const busyRes = await req.db.query(
      `SELECT DISTINCT requested_for_employee_id
       FROM public.assignment_requests
       WHERE company_id = $1
         AND status IN ('APPROVED', 'PENDING')
         AND start_date <= $2
         AND end_date   >= $3`,
      [companyId, end_date, start_date]
    );
    const busyIds = new Set(busyRes.rows.map((r) => r.requested_for_employee_id));

    // Get team frequency — who worked together on same projects before
    const freqRes = await req.db.query(
      `SELECT ar.requested_for_employee_id AS employee_id,
              COUNT(*) AS times_together
       FROM public.assignment_requests ar
       WHERE ar.company_id = $1
         AND ar.project_id = $2
         AND ar.status = 'APPROVED'
       GROUP BY ar.requested_for_employee_id`,
      [companyId, projectId]
    );
    const freqMap = {};
    freqRes.rows.forEach((r) => {
      freqMap[r.employee_id] = parseInt(r.times_together);
    });

    // Build suggestions with scores
    const suggestions = empRes.rows.map((emp) => {
      const isAvailable = !busyIds.has(emp.id);
      const tradeMatch = emp.trade_code === project.trade_code;
      const timesTogether = freqMap[emp.id] || 0;

      // Score (higher = better suggestion)
      let score = 0;
      if (isAvailable) score += 100;
      if (tradeMatch) score += 50;
      score += timesTogether * 10;
      if (emp.distance_km !== null) {
        // Closer = higher score (max 40 points for 0km, 0 for 50km+)
        score += Math.max(0, 40 - emp.distance_km);
      }

      return {
        ...emp,
        is_available: isAvailable,
        trade_match: tradeMatch,
        times_together: timesTogether,
        score: Math.round(score),
      };
    });

    // Sort: available first, then by score desc
    suggestions.sort((a, b) => {
      if (a.is_available !== b.is_available) return a.is_available ? -1 : 1;
      return b.score - a.score;
    });

    return res.json({
      ok: true,
      project,
      suggestions,
    });
  } catch (err) {
    console.error('GET /assignments/suggest error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

module.exports = router;
