'use strict';

/**
 * routes/auto_assign.js
 *
 * POST /api/assignments/auto-suggest  → generate smart suggestions for a target date
 * POST /api/assignments/auto-confirm  → confirm suggestions, create assignments, send emails
 */

const router = require('express').Router();
const { pool } = require('../db');
const { sendEmail } = require('../lib/email');

const { can } = require('../middleware/permissions');

// ─────────────────────────────────────────────────────────────
// Email Templates
// ─────────────────────────────────────────────────────────────

function assignmentEmployeeEmailHtml({
  employeeName,
  projectCode,
  projectName,
  siteAddress,
  startDate,
  endDate,
  shiftStart,
  shiftEnd,
  notes,
  appName,
  companyName,
  foremanName,
  foremanPhone,
  foremanEmail,
  foremanTrade,
}) {
  const fmtDate = (d) =>
    d
      ? new Date(d).toLocaleDateString('en-CA', {
          weekday: 'short',
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        })
      : '—';
  const fmtTime = (t) => {
    if (!t) return t;
    const [h, m] = t.split(':').map(Number);
    const ap = h < 12 ? 'AM' : 'PM';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ap}`;
  };

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #f1f5f9; padding: 40px 16px; }
    .wrapper { max-width: 560px; margin: 0 auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 32px rgba(0,0,0,0.08); }
    .header { background: #0f172a; padding: 36px 40px; text-align: center; }
    .header-logo { display: inline-flex; align-items: center; justify-content: center; width: 52px; height: 52px; background: #1e3a5f; border-radius: 14px; margin-bottom: 16px; }
    .header h1 { color: #fff; font-size: 20px; font-weight: 700; }
    .header p  { color: #94a3b8; font-size: 13px; margin-top: 4px; }
    .body { padding: 40px; }
    .greeting { font-size: 22px; font-weight: 700; color: #0f172a; margin-bottom: 12px; }
    .text { font-size: 15px; color: #475569; line-height: 1.7; margin-bottom: 24px; }
    .info-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px 24px; margin-bottom: 28px; }
    .info-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #f1f5f9; }
    .info-row:last-child { border-bottom: none; padding-bottom: 0; }
    .info-label { font-size: 12px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.8px; font-weight: 600; }
    .info-value { font-size: 14px; color: #1e293b; font-weight: 600; }
    .badge { display: inline-block; background: #dcfce7; color: #15803d; font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 20px; }
    .notes-box { background: #fefce8; border: 1px solid #fde68a; border-radius: 10px; padding: 14px 18px; margin-bottom: 24px; font-size: 14px; color: #92400e; }
    .notes-title { font-size: 11px; font-weight: 700; text-transform: uppercase; color: #d97706; margin-bottom: 6px; }
    .footer { background: #f8fafc; padding: 20px 40px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #f1f5f9; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <div class="header-logo">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
      </div>
      <h1>${appName}</h1>
      <p>${companyName}</p>
    </div>
    <div class="body">
      <div class="greeting">Hi ${employeeName} 👷</div>
      <p class="text">
        You have a new assignment scheduled. Please review the details below and make sure you're on site on time.
      </p>
      <div class="info-box">
        <div class="info-row">
          <span class="info-label">Project</span>
          <span class="info-value">${projectCode}${projectName ? ' — ' + projectName : ''}</span>
        </div>
        ${
          siteAddress
            ? `
        <div class="info-row">
          <span class="info-label">Site Address</span>
          <span class="info-value">${siteAddress}</span>
        </div>`
            : ''
        }
        <div class="info-row">
          <span class="info-label">Start Date</span>
          <span class="info-value">${fmtDate(startDate)}</span>
        </div>
        <div class="info-row">
          <span class="info-label">End Date</span>
          <span class="info-value">${fmtDate(endDate)}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Shift</span>
          <span class="info-value">${fmtTime(shiftStart)} – ${fmtTime(shiftEnd)}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Status</span>
          <span class="info-value"><span class="badge">✓ Confirmed</span></span>
        </div>
      </div>
      ${
        notes
          ? `
      <div class="notes-box">
        <div class="notes-title">📋 Notes from Manager</div>
        ${notes}
      </div>`
          : ''
      }

      <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#0369a1;letter-spacing:0.8px;margin-bottom:14px;">
          👷 Your Foreman${foremanTrade ? ` — ${foremanTrade}` : ''}
        </div>
        ${
          foremanName
            ? `
        <div style="display:flex;align-items:center;gap:14px;">
          <div style="width:44px;height:44px;background:#1e3a5f;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:18px;font-weight:700;flex-shrink:0;">
            ${foremanName[0]}
          </div>
          <div>
            <div style="font-size:15px;font-weight:700;color:#0f172a;">${foremanName}</div>
            ${foremanPhone ? `<div style="font-size:13px;color:#475569;margin-top:2px;">📞 ${foremanPhone}</div>` : '<div style="font-size:12px;color:#94a3b8;margin-top:2px;">No phone on file</div>'}
            ${foremanEmail ? `<div style="font-size:13px;color:#1e3a5f;margin-top:2px;">✉ ${foremanEmail}</div>` : '<div style="font-size:12px;color:#94a3b8;margin-top:2px;">No email on file</div>'}
          </div>
        </div>
        <div style="margin-top:12px;font-size:12px;color:#64748b;">
          Please contact your foreman before arriving on site.
        </div>`
            : `
        <div style="font-size:13px;color:#94a3b8;font-style:italic;">
          No foreman assigned to this trade yet. Please contact your supervisor for site coordination.
        </div>`
        }
      </div>
    </div>
    <div class="footer">
      This notification was sent automatically by ${appName}.<br>
      Please do not reply to this email.
    </div>
  </div>
</body>
</html>`;
}

function assignmentAdminSummaryEmailHtml({
  targetDate,
  projectCode,
  projectName,
  siteAddress,
  assignments,
  appName,
  companyName,
}) {
  const fmtDate = (d) =>
    d
      ? new Date(d).toLocaleDateString('en-CA', {
          weekday: 'short',
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        })
      : '—';
  const fmtTime = (t) => {
    if (!t) return t;
    const [h, m] = t.split(':').map(Number);
    const ap = h < 12 ? 'AM' : 'PM';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ap}`;
  };

  const carryOver = assignments.filter((a) => a.type === 'carry_over').length;
  const newAssign = assignments.filter((a) => a.type === 'new').length;

  const rows = assignments
    .map(
      (a) => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:14px;color:#1e293b;font-weight:600;">${a.employee_name}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#475569;">${a.trade_code || '—'}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;">
        <span style="display:inline-block;padding:3px 8px;border-radius:12px;font-size:11px;font-weight:700;
          background:${a.type === 'carry_over' ? '#dbeafe' : '#dcfce7'};
          color:${a.type === 'carry_over' ? '#1d4ed8' : '#15803d'};">
          ${a.type === 'carry_over' ? '↩ Carry-over' : '🆕 New'}
        </span>
      </td>
    </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #f1f5f9; padding: 40px 16px; }
    .wrapper { max-width: 600px; margin: 0 auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 32px rgba(0,0,0,0.08); }
    .header { background: #0f172a; padding: 32px 40px; text-align: center; }
    .header h1 { color: #fff; font-size: 20px; font-weight: 700; }
    .header p  { color: #94a3b8; font-size: 13px; margin-top: 4px; }
    .body { padding: 36px 40px; }
    .title { font-size: 20px; font-weight: 700; color: #0f172a; margin-bottom: 6px; }
    .subtitle { font-size: 14px; color: #64748b; margin-bottom: 24px; }
    .stats { display: flex; gap: 12px; margin-bottom: 24px; }
    .stat { flex: 1; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; text-align: center; }
    .stat-num { font-size: 24px; font-weight: 800; color: #1e3a5f; }
    .stat-label { font-size: 11px; color: #94a3b8; text-transform: uppercase; font-weight: 600; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; border-radius: 10px; overflow: hidden; border: 1px solid #e2e8f0; margin-bottom: 24px; }
    thead tr { background: #f8fafc; }
    th { padding: 10px 12px; text-align: left; font-size: 11px; text-transform: uppercase; color: #94a3b8; font-weight: 700; letter-spacing: 0.6px; }
    .footer { background: #f8fafc; padding: 20px 40px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #f1f5f9; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>${appName}</h1>
      <p>Assignment Summary — ${fmtDate(targetDate)}</p>
    </div>
    <div class="body">
      <div class="title">📋 ${projectCode}${projectName ? ' — ' + projectName : ''}</div>
      <div class="subtitle">${siteAddress || ''}</div>

      <div class="stats">
        <div class="stat">
          <div class="stat-num">${assignments.length}</div>
          <div class="stat-label">Total Assigned</div>
        </div>
        <div class="stat">
          <div class="stat-num" style="color:#1d4ed8;">${carryOver}</div>
          <div class="stat-label">Carry-over</div>
        </div>
        <div class="stat">
          <div class="stat-num" style="color:#15803d;">${newAssign}</div>
          <div class="stat-label">New</div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Employee</th>
            <th>Trade</th>
            <th>Type</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>

      <p style="font-size:13px;color:#94a3b8;">
        All employees have been notified by email. You can manage these assignments from the Assignments page.
      </p>
    </div>
    <div class="footer">
      Auto-generated by ${appName} Smart Assignment System.<br>
      ${companyName}
    </div>
  </div>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────
// POST /auto-suggest
// Body: { target_date }
// Returns suggested assignments per project grouped
// ─────────────────────────────────────────────────────────────
router.post('/auto-suggest', can('assignments.smart_assign'), async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const { target_date } = req.body || {};

    if (!target_date) return res.status(400).json({ ok: false, error: 'TARGET_DATE_REQUIRED' });

    // 1. Get all ACTIVE projects for this company
    const projRes = await pool.query(
      `SELECT p.id, p.project_code, p.project_name, p.site_address,
              p.site_lat, p.site_lng,
              c.default_shift_start AS shift_start,
              c.default_shift_end   AS shift_end
       FROM public.projects p
       JOIN public.project_statuses ps ON ps.id = p.status_id
       JOIN public.companies c ON c.company_id = p.company_id
       WHERE p.company_id = $1 AND ps.code = 'ACTIVE'`,
      [companyId]
    );
    const projects = projRes.rows;
    if (!projects.length)
      return res.json({ ok: true, suggestions: [], message: 'No active projects found.' });

    // 2. Get today's assignments (who is working today per project)
    const today = new Date().toISOString().split('T')[0];
    const todayAssignRes = await pool.query(
      `SELECT ar.project_id, ar.requested_for_employee_id AS employee_id,
              ep.full_name AS employee_name, ep.trade_code,
              ar.shift_start, ar.shift_end, ar.assignment_role
       FROM public.assignment_requests ar
       JOIN public.employee_profiles ep ON ep.employee_id = ar.requested_for_employee_id
       WHERE ar.company_id = $1
         AND ar.status = 'APPROVED'
         AND ar.start_date <= $2
         AND ar.end_date   >= $2`,
      [companyId, today]
    );

    // Group today's workers by project
    const todayByProject = {};
    for (const row of todayAssignRes.rows) {
      if (!todayByProject[row.project_id]) todayByProject[row.project_id] = [];
      todayByProject[row.project_id].push(row);
    }

    // 3. Get who is already assigned on target_date (busy)
    const busyRes = await pool.query(
      `SELECT DISTINCT requested_for_employee_id
       FROM public.assignment_requests
       WHERE company_id = $1
         AND status IN ('APPROVED', 'PENDING')
         AND start_date <= $2
         AND end_date   >= $2`,
      [companyId, target_date]
    );
    const busyOnTarget = new Set(busyRes.rows.map((r) => r.requested_for_employee_id));

    // 3b. Get foremen from today's assignments (assignment_role = 'FOREMAN')
    const foremenRes = await pool.query(
      `SELECT ar.project_id, ep.trade_code,
              ep.full_name     AS foreman_name,
              ep.contact_email AS foreman_email,
              ep.phone         AS foreman_phone
       FROM public.assignment_requests ar
       JOIN public.employee_profiles ep ON ep.employee_id = ar.requested_for_employee_id
       WHERE ar.company_id      = $1
         AND ar.status          = 'APPROVED'
         AND ar.assignment_role = 'FOREMAN'
         AND ar.start_date     <= $2
         AND ar.end_date       >= $2`,
      [companyId, today]
    );
    // Map: projectId -> { trade -> foremanInfo }
    const foremenByProject = {};
    for (const f of foremenRes.rows) {
      if (!foremenByProject[f.project_id]) foremenByProject[f.project_id] = {};
      foremenByProject[f.project_id][f.trade_code] = f;
    }

    // 4. Get all available employees with profiles + coords
    const empRes = await pool.query(
      `SELECT ep.employee_id AS id, ep.full_name, ep.trade_code, ep.rank_code,
              ep.contact_email,
              ST_X(ep.home_location::geometry) AS home_lng,
              ST_Y(ep.home_location::geometry) AS home_lat
       FROM public.employee_profiles ep
       JOIN public.app_users au ON au.employee_id = ep.employee_id
       WHERE au.company_id = $1 AND au.employee_id IS NOT NULL
         AND au.role NOT IN ('COMPANY_ADMIN','SUPER_ADMIN','IT_ADMIN')
       ORDER BY ep.full_name`,
      [companyId]
    );
    const allEmployees = empRes.rows;

    // 5. Build suggestions per project
    const suggestions = [];

    for (const project of projects) {
      const todayTeam = todayByProject[project.id] || [];
      const projSuggestions = [];
      const usedInThisRound = new Set(); // avoid double-assigning in same run

      // Already assigned on target_date for THIS project (skip them)
      const alreadyOnProject = new Set(
        busyOnTarget // we'll refine per employee below
      );

      // --- Step A: Try to carry over today's team ---
      for (const worker of todayTeam) {
        if (busyOnTarget.has(worker.employee_id)) {
          // Busy — find best available replacement with same trade
          const replacement =
            allEmployees.find(
              (e) =>
                !busyOnTarget.has(e.id) &&
                !usedInThisRound.has(e.id) &&
                e.trade_code === worker.trade_code
            ) || allEmployees.find((e) => !busyOnTarget.has(e.id) && !usedInThisRound.has(e.id));

          if (replacement) {
            usedInThisRound.add(replacement.id);
            projSuggestions.push({
              employee_id: replacement.id,
              employee_name: replacement.full_name,
              trade_code: replacement.trade_code,
              contact_email: replacement.contact_email,
              assignment_role: worker.assignment_role || 'WORKER',
              type: 'replacement',
              replacing: worker.employee_name,
              score: scoreEmployee(replacement, project),
            });
          } else {
            projSuggestions.push({
              employee_id: null,
              employee_name: null,
              trade_code: worker.trade_code,
              contact_email: null,
              assignment_role: worker.assignment_role || 'WORKER',
              type: 'gap',
              replacing: worker.employee_name,
              score: 0,
            });
          }
        } else {
          usedInThisRound.add(worker.employee_id);
          projSuggestions.push({
            employee_id: worker.employee_id,
            employee_name: worker.employee_name,
            trade_code: worker.trade_code,
            contact_email: allEmployees.find((e) => e.id === worker.employee_id)?.contact_email,
            assignment_role: worker.assignment_role || 'WORKER',
            type: 'carry_over',
            replacing: null,
            score:
              100 +
              scoreEmployee(allEmployees.find((e) => e.id === worker.employee_id) || {}, project),
          });
        }
      }

      // --- Step B: New project (no one working today) ---
      if (todayTeam.length === 0) {
        // Suggest top 3 available employees by score
        const candidates = allEmployees
          .filter((e) => !busyOnTarget.has(e.id) && !usedInThisRound.has(e.id))
          .map((e) => ({ ...e, score: scoreEmployee(e, project) }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 3);

        for (const c of candidates) {
          usedInThisRound.add(c.id);
          projSuggestions.push({
            employee_id: c.id,
            employee_name: c.full_name,
            trade_code: c.trade_code,
            contact_email: c.contact_email,
            type: 'new',
            replacing: null,
            score: c.score,
          });
        }
      }

      suggestions.push({
        project_id: project.id,
        project_code: project.project_code,
        project_name: project.project_name,
        site_address: project.site_address,
        shift_start: project.shift_start || '06:00',
        shift_end: project.shift_end || '14:30',
        today_count: todayTeam.length,
        employees: projSuggestions,
        foremen: foremenByProject[project.id] || {},
      });
    }

    return res.json({ ok: true, target_date, suggestions });
  } catch (err) {
    console.error('POST /auto-suggest error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR', message: err.message });
  }
});

// Score helper — distance + trade match (no availability check needed here)
function scoreEmployee(emp, project) {
  let score = 0;
  if (emp.home_lat && emp.home_lng && project.site_lat && project.site_lng) {
    const dist = haversineKm(emp.home_lat, emp.home_lng, project.site_lat, project.site_lng);
    score += Math.max(0, 40 - dist);
  }
  return Math.round(score);
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─────────────────────────────────────────────────────────────
// POST /auto-confirm
// Body: { target_date, confirmed: [ { project_id, shift_start, shift_end, notes, employees: [{employee_id, trade_code, contact_email, employee_name, type}] } ] }
// ─────────────────────────────────────────────────────────────
router.post('/auto-confirm', can('assignments.smart_assign'), async (req, res) => {
  const client = await pool.connect();
  try {
    const companyId = req.user.company_id;
    const { target_date, confirmed } = req.body || {};

    if (!target_date || !Array.isArray(confirmed) || !confirmed.length)
      return res.status(400).json({ ok: false, error: 'INVALID_PAYLOAD' });

    const appName = process.env.APP_NAME || 'MEP Platform';
    const appBaseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';

    // Get company name + admin email
    const companyRes = await pool.query(
      `SELECT c.name AS company_name, au.email AS admin_email
       FROM public.companies c
       JOIN public.app_users au ON au.company_id = c.company_id
       WHERE c.company_id = $1 AND au.role IN ('COMPANY_ADMIN','IT_ADMIN')
       ORDER BY au.created_at ASC LIMIT 1`,
      [companyId]
    );
    const companyName = companyRes.rows[0]?.company_name || 'Your Company';
    const adminEmail = companyRes.rows[0]?.admin_email || null;

    await client.query('BEGIN');

    const allCreated = [];
    const emailQueue = []; // collect after commit

    for (const proj of confirmed) {
      const { project_id, shift_start, shift_end, notes, employees } = proj;
      if (!project_id || !Array.isArray(employees)) continue;

      // Get project info
      const projRes = await client.query(
        `SELECT id, project_code, project_name, site_address FROM public.projects WHERE id=$1 AND company_id=$2 LIMIT 1`,
        [project_id, companyId]
      );
      if (!projRes.rows.length) continue;
      const project = projRes.rows[0];

      const projAssignments = [];

      for (const emp of employees) {
        if (!emp.employee_id) continue; // skip gaps

        // Check overlap
        const overlap = await client.query(
          `SELECT id FROM public.assignment_requests
           WHERE requested_for_employee_id=$1 AND company_id=$2
             AND status IN ('APPROVED','PENDING')
             AND start_date<=$3 AND end_date>=$3`,
          [emp.employee_id, companyId, target_date]
        );
        if (overlap.rows.length) continue; // skip, already assigned

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
            project_id,
            emp.employee_id,
            req.user.user_id,
            target_date,
            shift_start || '06:00',
            shift_end || '14:30',
            notes || null,
            ['WORKER', 'FOREMAN', 'JOURNEYMAN'].includes(emp.assignment_role)
              ? emp.assignment_role
              : 'WORKER',
          ]
        );

        const assignId = rows[0].id;
        allCreated.push(assignId);
        projAssignments.push({ ...emp, assignment_id: assignId });

        // Queue employee email
        if (emp.contact_email) {
          // Find foreman for this employee's trade on this project
          const foremanInfo = (proj.foremen || {})[emp.trade_code] || null;
          emailQueue.push({
            type: 'employee',
            to: emp.contact_email,
            data: {
              employeeName: emp.employee_name,
              projectCode: project.project_code,
              projectName: project.project_name,
              siteAddress: project.site_address,
              startDate: target_date,
              endDate: target_date,
              shiftStart: shift_start || '06:00',
              shiftEnd: shift_end || '14:30',
              notes: notes || null,
              appName,
              companyName,
              foremanName: foremanInfo?.foreman_name || null,
              foremanEmail: foremanInfo?.foreman_email || null,
              foremanPhone: foremanInfo?.foreman_phone || null,
              foremanTrade: emp.trade_code,
            },
          });
        }
      }

      // Queue foreman emails (one per trade group on this project)
      if (proj.foremen && projAssignments.length) {
        const tradeGroups = {};
        for (const a of projAssignments) {
          if (!tradeGroups[a.trade_code]) tradeGroups[a.trade_code] = [];
          tradeGroups[a.trade_code].push(a);
        }
        for (const [tradeCode, workers] of Object.entries(tradeGroups)) {
          const foremanInfo = (proj.foremen || {})[tradeCode];
          if (foremanInfo?.foreman_email) {
            emailQueue.push({
              type: 'admin',
              to: foremanInfo.foreman_email,
              data: {
                targetDate: target_date,
                projectCode: project.project_code,
                projectName: project.project_name,
                siteAddress: project.site_address,
                assignments: workers,
                appName,
                companyName,
              },
            });
          }
        }
      }

      // Queue admin summary email per project
      if (adminEmail && projAssignments.length) {
        emailQueue.push({
          type: 'admin',
          to: adminEmail,
          data: {
            targetDate: target_date,
            projectCode: project.project_code,
            projectName: project.project_name,
            siteAddress: project.site_address,
            assignments: projAssignments,
            appName,
            companyName,
          },
        });
      }
    }

    await client.query('COMMIT');

    // Send emails after commit (fire and forget — don't fail assignment if email fails)
    const emailResults = await Promise.allSettled(
      emailQueue.map((e) => {
        if (e.type === 'employee') {
          return sendEmail({
            to: e.to,
            subject: `Assignment Confirmed — ${e.data.projectCode} · ${e.data.startDate}`,
            html: assignmentEmployeeEmailHtml(e.data),
            text: `Hi ${e.data.employeeName}, you have a new assignment on ${e.data.projectCode} starting ${e.data.startDate}. Shift: ${e.data.shiftStart}–${e.data.shiftEnd}.`,
          });
        } else {
          return sendEmail({
            to: e.to,
            subject: `Auto-Assignment Summary — ${e.data.projectCode} · ${e.data.targetDate}`,
            html: assignmentAdminSummaryEmailHtml(e.data),
            text: `Assignment summary for ${e.data.projectCode} on ${e.data.targetDate}: ${e.data.assignments.length} employees assigned.`,
          });
        }
      })
    );

    const emailsSent = emailResults.filter((r) => r.status === 'fulfilled').length;
    const emailsFailed = emailResults.filter((r) => r.status === 'rejected').length;

    return res.json({
      ok: true,
      assignments_created: allCreated.length,
      emails_sent: emailsSent,
      emails_failed: emailsFailed,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('POST /auto-confirm error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR', message: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
