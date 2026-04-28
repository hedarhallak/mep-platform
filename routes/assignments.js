'use strict';

/**
 * routes/assignments.js
 * Assignment request workflow:
 *   PM  â†’ POST /api/assignments/requests        (create request)
 *   ADMIN â†’ PATCH /api/assignments/requests/:id/approve
 *   ADMIN â†’ PATCH /api/assignments/requests/:id/reject
 *   ALL  â†’ GET  /api/assignments/requests        (list requests)
 *   ALL  â†’ GET  /api/assignments                 (list active assignments)
 *   ADMIN â†’ DELETE /api/assignments/:id          (cancel assignment)
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { audit, ACTIONS } = require('../lib/audit');
const { can } = require('../middleware/permissions');
const { sendAssignmentEmployee, sendAssignmentForeman } = require('../lib/email');

// â”€â”€ notifyAssignment â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Sends email to the assigned employee + foreman (same project, same trade)
// Never throws â€” errors are logged only.
async function notifyAssignment(pool, assignmentRequestId, companyId) {
  try {
    // Load this assignment's details
    const { rows } = await pool.query(
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
    if (!rows.length) return;
    const a = rows[0];

    // Load all APPROVED assignments on the same project overlapping this period
    const teamRes = await pool.query(
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
    const team = teamRes.rows;

    // Find foreman on this project (same period)
    const foreman = team.find((t) => t.assignment_role === 'FOREMAN');

    if (a.assignment_role === 'FOREMAN') {
      // â”€â”€ Foreman assigned â”€â”€
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
      // 2) Notify existing workers â€” update them with foreman contact
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
      // â”€â”€ Worker / Journeyman assigned â”€â”€
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
      // 2) Notify foreman â€” new team member added
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
  } catch (err) {
    console.error('[notifyAssignment] error:', err.message);
  }
}

// â”€â”€ Role helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const { normalizeRole } = require('../middleware/roles');

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
const ADMIN_ONLY = requireRoles(['COMPANY_ADMIN']);
const ADMIN_PM = requireRoles(['COMPANY_ADMIN', 'TRADE_ADMIN', 'TRADE_PROJECT_MANAGER']);

// â”€â”€ Time slots helper (every 30 min) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ GET /api/assignments/timeslots â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get('/timeslots', can('assignments.view'), (req, res) => {
  return res.json({ ok: true, slots: generateTimeSlots() });
});

// â”€â”€ GET /api/assignments/employees-map â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Employees with home coords + availability for given period
router.get('/employees-map', can('assignments.view'), async (req, res) => {
  try {
    const { start, end } = req.query;
    const companyId = req.user.company_id;

    const { rows } = await pool.query(
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
    const { rows } = await pool.query(
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

// â”€â”€ GET /api/assignments/defaults â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Returns company default shift times
router.get('/defaults', can('assignments.view'), async (req, res) => {
  try {
    const { rows } = await pool.query(
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

// â”€â”€ GET /api/assignments/my-today â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Returns the current user's active assignment for today
// Used by MaterialRequest, TaskRequest, Standup to auto-select project
router.get('/my-today', async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const userId = req.user.user_id;
    const today = new Date().toISOString().split('T')[0];

    const { rows } = await pool.query(
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

// â”€â”€ GET /api/assignments/requests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
      JOIN public.app_users         requester ON requester.id   = ar.requested_by_user_id
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

    const { rows } = await pool.query(query, params);
    return res.json({ ok: true, requests: rows });
  } catch (err) {
    console.error('GET /assignments/requests error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// â”€â”€ POST /api/assignments/requests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
    const project = await pool.query(
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
    const employee = await pool.query(
      `SELECT ep.employee_id, ep.full_name
       FROM public.employee_profiles ep
       JOIN public.app_users au ON au.employee_id = ep.employee_id
       WHERE ep.employee_id = $1 AND au.company_id = $2 LIMIT 1`,
      [employee_id, companyId]
    );
    if (!employee.rows.length)
      return res.status(400).json({ ok: false, error: 'EMPLOYEE_NOT_FOUND' });

    // Check for overlapping APPROVED assignments for this employee
    const overlap = await pool.query(
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
    const pendingOverlap = await pool.query(
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

    const { rows } = await pool.query(
      `INSERT INTO public.assignment_requests
         (company_id, project_id, requested_for_employee_id, requested_by_user_id,
          start_date, end_date, shift_start, shift_end, notes, assignment_role,
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

    await audit(pool, req, {
      action: ACTIONS.ASSIGNMENT_CREATED,
      entity_type: 'assignment_request',
      entity_id: rows[0].id,
      entity_name: `${employee.rows[0].full_name} â†’ ${project.rows[0].project_name}`,
      new_values: { status, start_date, end_date, shift_start, shift_end },
    });

    // Calculate and store distance for auto-approved assignments
    if (isAdmin) {
      notifyAssignment(pool, rows[0].id, companyId);
      // Fire and forget distance calculation
      calcDistanceKm(employee_id, project_id, companyId).then((km) => {
        if (km !== null) {
          pool
            .query('UPDATE public.assignment_requests SET distance_km = $1 WHERE id = $2', [
              km,
              rows[0].id,
            ])
            .catch((e) => console.error('distance update error:', e.message));
        }
      });
    }

    return res.status(201).json({ ok: true, request: rows[0], auto_approved: isAdmin });
  } catch (err) {
    console.error('POST /assignments/requests error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// â”€â”€ Mapbox Distance Helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const MAPBOX_TOKEN = process.env.MAPBOX_ACCESS_TOKEN || '';

async function calcDistanceKm(employeeId, projectId, companyId) {
  try {
    const empRes = await pool.query(
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
    const projRes = await pool.query(
      `SELECT site_lat, site_lng FROM public.projects
       WHERE id = $1 AND company_id = $2 LIMIT 1`,
      [projectId, companyId]
    );
    const proj = projRes.rows[0];
    if (!proj || !proj.site_lat || !proj.site_lng) return null;

    // Call Mapbox Directions API (driving distance)
    const url =
      `https://api.mapbox.com/directions/v5/mapbox/driving/` +
      `${emp.home_lng},${emp.home_lat};${proj.site_lng},${proj.site_lat}` +
      `?access_token=${MAPBOX_TOKEN}&overview=false`;

    const https = require('https');
    const data = await new Promise((resolve, reject) => {
      https
        .get(url, (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => {
            try {
              resolve(JSON.parse(body));
            } catch (e) {
              reject(e);
            }
          });
        })
        .on('error', reject);
    });

    if (data.routes && data.routes[0]) {
      const meters = data.routes[0].distance;
      return Math.round((meters / 1000) * 100) / 100; // km rounded to 2 decimals
    }
    return null;
  } catch (err) {
    console.error('calcDistanceKm error:', err.message);
    return null;
  }
}

// â”€â”€ PATCH /api/assignments/requests/:id/approve â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.patch('/requests/:id/approve', can('assignments.edit'), async (req, res) => {
  try {
    const reqId = Number(req.params.id);
    const companyId = req.user.company_id;

    const existing = await pool.query(
      'SELECT * FROM public.assignment_requests WHERE id = $1 AND company_id = $2 LIMIT 1',
      [reqId, companyId]
    );
    if (!existing.rows.length)
      return res.status(404).json({ ok: false, error: 'REQUEST_NOT_FOUND' });

    if (existing.rows[0].status !== 'PENDING')
      return res.status(409).json({ ok: false, error: 'REQUEST_NOT_PENDING' });

    const r = existing.rows[0];

    // Re-check overlap before approving
    const overlap = await pool.query(
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

    const { rows } = await pool.query(
      `UPDATE public.assignment_requests
       SET status = 'APPROVED', decision_by_user_id = $1, decision_at = NOW(), updated_at = NOW()
       WHERE id = $2 AND company_id = $3
       RETURNING *`,
      [req.user.user_id, reqId, companyId]
    );

    await audit(pool, req, {
      action: ACTIONS.ASSIGNMENT_UPDATED,
      entity_type: 'assignment_request',
      entity_id: reqId,
      details: { action: 'APPROVED' },
    });

    // Send notification emails
    notifyAssignment(pool, reqId, companyId);

    // Calculate and store distance
    calcDistanceKm(r.requested_for_employee_id, r.project_id, companyId).then((km) => {
      if (km !== null) {
        pool
          .query('UPDATE public.assignment_requests SET distance_km = $1 WHERE id = $2', [
            km,
            reqId,
          ])
          .catch((e) => console.error('distance update error:', e.message));
      }
    });

    return res.json({ ok: true, request: rows[0] });
  } catch (err) {
    console.error('PATCH approve error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// â”€â”€ PATCH /api/assignments/requests/:id/reject â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.patch('/requests/:id/reject', can('assignments.edit'), async (req, res) => {
  try {
    const reqId = Number(req.params.id);
    const companyId = req.user.company_id;
    const { reason } = req.body || {};

    const existing = await pool.query(
      'SELECT id, status FROM public.assignment_requests WHERE id = $1 AND company_id = $2 LIMIT 1',
      [reqId, companyId]
    );
    if (!existing.rows.length)
      return res.status(404).json({ ok: false, error: 'REQUEST_NOT_FOUND' });
    if (existing.rows[0].status !== 'PENDING')
      return res.status(409).json({ ok: false, error: 'REQUEST_NOT_PENDING' });

    const { rows } = await pool.query(
      `UPDATE public.assignment_requests
       SET status = 'REJECTED', decision_by_user_id = $1, decision_at = NOW(),
           decision_note = $2, updated_at = NOW()
       WHERE id = $3 AND company_id = $4
       RETURNING *`,
      [req.user.user_id, reason || null, reqId, companyId]
    );

    await audit(pool, req, {
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

// â”€â”€ PATCH /api/assignments/requests/:id/cancel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// PM can cancel their own PENDING request
router.patch('/requests/:id/cancel', can('assignments.edit'), async (req, res) => {
  try {
    const reqId = Number(req.params.id);
    const companyId = req.user.company_id;

    const existing = await pool.query(
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

    const { rows } = await pool.query(
      `UPDATE public.assignment_requests
       SET status = 'CANCELLED', updated_at = NOW()
       WHERE id = $1 AND company_id = $2
       RETURNING *`,
      [reqId, companyId]
    );

    await audit(pool, req, {
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

// â”€â”€ GET /api/assignments â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Active (APPROVED) assignments â€” what's on site today/upcoming
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
      JOIN public.app_users         requester ON requester.id   = ar.requested_by_user_id
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

    const { rows } = await pool.query(query, params);
    return res.json({ ok: true, assignments: rows });
  } catch (err) {
    console.error('GET /assignments error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// â”€â”€ PATCH /api/assignments/requests/:id/reassign â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Atomically cancel old assignment + create new one in one transaction
// Avoids race condition of cancel-then-create with overlap check
router.patch('/requests/:id/reassign', can('assignments.edit'), async (req, res) => {
  const client = await pool.connect();
  try {
    const reqId = Number(req.params.id);
    const companyId = req.user.company_id;
    const { new_employee_id } = req.body || {};

    if (!new_employee_id)
      return res.status(400).json({ ok: false, error: 'NEW_EMPLOYEE_REQUIRED' });

    await client.query('BEGIN');

    // Get original assignment
    const orig = await client.query(
      `SELECT * FROM public.assignment_requests WHERE id = $1 AND company_id = $2 LIMIT 1`,
      [reqId, companyId]
    );
    if (!orig.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: 'REQUEST_NOT_FOUND' });
    }
    const r = orig.rows[0];
    if (r.status !== 'APPROVED') {
      await client.query('ROLLBACK');
      return res.status(409).json({ ok: false, error: 'CANNOT_REASSIGN' });
    }

    // Verify new employee belongs to company
    const emp = await client.query(
      `SELECT ep.employee_id, ep.full_name
       FROM public.employee_profiles ep
       JOIN public.app_users au ON au.employee_id = ep.employee_id
       WHERE ep.employee_id = $1 AND au.company_id = $2 LIMIT 1`,
      [new_employee_id, companyId]
    );
    if (!emp.rows.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, error: 'EMPLOYEE_NOT_FOUND' });
    }

    // Cancel old assignment
    await client.query(
      `UPDATE public.assignment_requests SET status = 'CANCELLED', updated_at = NOW() WHERE id = $1`,
      [reqId]
    );

    // Check overlap for new employee (excluding the row we just cancelled)
    const overlap = await client.query(
      `SELECT id FROM public.assignment_requests
       WHERE requested_for_employee_id = $1
         AND company_id = $2
         AND status IN ('APPROVED', 'PENDING')
         AND start_date <= $3
         AND end_date   >= $4`,
      [new_employee_id, companyId, r.end_date, r.start_date]
    );
    if (overlap.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        ok: false,
        error: 'EMPLOYEE_ALREADY_ASSIGNED',
        message: `${emp.rows[0].full_name} is already assigned to another project during this period.`,
      });
    }

    // Create new assignment
    const { rows } = await client.query(
      `INSERT INTO public.assignment_requests
         (company_id, project_id, requested_for_employee_id, requested_by_user_id,
          start_date, end_date, shift_start, shift_end, notes,
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

    await client.query('COMMIT');

    // Send notification to new employee + foreman
    notifyAssignment(pool, rows[0].id, companyId);

    return res.json({ ok: true, request: rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('PATCH reassign error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  } finally {
    client.release();
  }
});

// â”€â”€ PATCH /api/assignments/requests/:id/move â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Move an employee to a different project (same dates + shift)
router.patch('/requests/:id/move', can('assignments.edit'), async (req, res) => {
  const client = await pool.connect();
  try {
    const reqId = Number(req.params.id);
    const companyId = req.user.company_id;
    const { new_project_id } = req.body || {};

    if (!new_project_id) return res.status(400).json({ ok: false, error: 'NEW_PROJECT_REQUIRED' });

    await client.query('BEGIN');

    // Get original assignment
    const orig = await client.query(
      `SELECT ar.*, ep.full_name AS employee_name
       FROM public.assignment_requests ar
       JOIN public.employee_profiles ep ON ep.employee_id = ar.requested_for_employee_id
       WHERE ar.id = $1 AND ar.company_id = $2 LIMIT 1`,
      [reqId, companyId]
    );
    if (!orig.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: 'REQUEST_NOT_FOUND' });
    }
    const r = orig.rows[0];
    if (r.status !== 'APPROVED') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        ok: false,
        error: 'CANNOT_MOVE',
        message: 'Only APPROVED assignments can be moved.',
      });
    }
    if (r.project_id === Number(new_project_id)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        ok: false,
        error: 'SAME_PROJECT',
        message: 'Employee is already assigned to this project.',
      });
    }

    // Verify new project belongs to company and is ACTIVE
    const proj = await client.query(
      `SELECT p.id, p.project_name, p.project_code, ps.code AS status_code
       FROM public.projects p
       JOIN public.project_statuses ps ON ps.id = p.status_id
       WHERE p.id = $1 AND p.company_id = $2 LIMIT 1`,
      [new_project_id, companyId]
    );
    if (!proj.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: 'PROJECT_NOT_FOUND' });
    }
    if (proj.rows[0].status_code !== 'ACTIVE') {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, error: 'PROJECT_NOT_ACTIVE' });
    }

    // Check employee not already assigned to new project during same period
    const overlap = await client.query(
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
      await client.query('ROLLBACK');
      return res.status(409).json({
        ok: false,
        error: 'EMPLOYEE_ALREADY_ON_PROJECT',
        message: `${r.employee_name} is already assigned to this project during this period.`,
      });
    }

    // Update project_id in-place (no need to cancel + recreate)
    const { rows } = await client.query(
      `UPDATE public.assignment_requests
       SET project_id = $1, updated_at = NOW()
       WHERE id = $2 AND company_id = $3
       RETURNING *`,
      [new_project_id, reqId, companyId]
    );

    await client.query('COMMIT');

    await audit(pool, req, {
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

    // Notify employee of new project assignment
    notifyAssignment(pool, reqId, companyId);

    return res.json({ ok: true, request: rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('PATCH /move error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  } finally {
    client.release();
  }
});

// â”€â”€ POST /api/assignments/repeat-preview â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Shows what would be repeated from today to target_date
router.post('/repeat-preview', can('assignments.create'), async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const { target_date } = req.body || {};
    if (!target_date) return res.status(400).json({ ok: false, error: 'TARGET_DATE_REQUIRED' });

    const today = new Date().toISOString().split('T')[0];

    // Get today's APPROVED assignments
    const { rows: todayRows } = await pool.query(
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
    const { rows: busyRows } = await pool.query(
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

// â”€â”€ POST /api/assignments/repeat-confirm â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Creates assignments for target_date based on today's assignments (skips already assigned)
router.post('/repeat-confirm', can('assignments.create'), async (req, res) => {
  const client = await pool.connect();
  try {
    const companyId = req.user.company_id;
    const { target_date } = req.body || {};
    if (!target_date) return res.status(400).json({ ok: false, error: 'TARGET_DATE_REQUIRED' });

    const today = new Date().toISOString().split('T')[0];

    // Get today's assignments
    const { rows: todayRows } = await pool.query(
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
    const { rows: busyRows } = await pool.query(
      `SELECT DISTINCT requested_for_employee_id
       FROM public.assignment_requests
       WHERE company_id = $1
         AND status IN ('APPROVED','PENDING')
         AND start_date <= $2
         AND end_date   >= $2`,
      [companyId, target_date]
    );
    const busyIds = new Set(busyRows.map((r) => r.requested_for_employee_id));

    await client.query('BEGIN');

    let created = 0;
    let skipped = 0;
    const createdIds = [];

    for (const a of todayRows) {
      if (busyIds.has(a.employee_id)) {
        skipped++;
        continue;
      }

      const { rows } = await client.query(
        `INSERT INTO public.assignment_requests
           (company_id, project_id, requested_for_employee_id, requested_by_user_id,
            start_date, end_date, shift_start, shift_end, notes, assignment_role,
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
      createdIds.push(rows[0].id);
      created++;
    }

    await client.query('COMMIT');

    // Send notifications (fire and forget)
    for (const id of createdIds) {
      notifyAssignment(pool, id, companyId);
    }

    return res.json({ ok: true, created, skipped });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('POST /repeat-confirm error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  } finally {
    client.release();
  }
});

module.exports = router;

// â”€â”€ GET /api/assignments/suggest/:project_id â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
    const projRes = await pool.query(
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
    const empRes = await pool.query(
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
    const busyRes = await pool.query(
      `SELECT DISTINCT requested_for_employee_id
       FROM public.assignment_requests
       WHERE company_id = $1
         AND status IN ('APPROVED', 'PENDING')
         AND start_date <= $2
         AND end_date   >= $3`,
      [companyId, end_date, start_date]
    );
    const busyIds = new Set(busyRes.rows.map((r) => r.requested_for_employee_id));

    // Get team frequency â€” who worked together on same projects before
    const freqRes = await pool.query(
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
