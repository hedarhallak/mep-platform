'use strict';

/**
 * lib/weeklyReport.js
 *
 * Generates and emails weekly attendance reports.
 *
 * Runs every Monday at 18:00 (Quebec time) covering the previous week (Mon-Sun).
 *
 * For each employee who had at least one assignment last week:
 *   - Sends a personal PDF-style HTML report to their email
 *
 * For each foreman who has CHECKED_OUT (unconfirmed) records:
 *   - Sends a reminder to confirm those hours
 */

const sgMail = require('@sendgrid/mail');

// ── CCQ zone helper ───────────────────────────────────────────
function ccqZone(km) {
  if (!km || km < 41) return { zone: null, rate: 0, label: 'Not eligible' };
  if (km < 65) return { zone: 'T2200', rate: 0, label: '41–65 km — T2200 tax form' };
  if (km < 76) return { zone: 'A', rate: 15.61, label: '65–75 km' };
  if (km < 101) return { zone: 'B', rate: 20.82, label: '76–100 km' };
  if (km < 126) return { zone: 'C', rate: 26.02, label: '101–125 km' };
  if (km < 151) return { zone: 'D', rate: 31.23, label: '126–150 km' };
  if (km < 176) return { zone: 'E', rate: 36.43, label: '151–175 km' };
  if (km < 201) return { zone: 'F', rate: 41.64, label: '176–200 km' };
  return { zone: 'G', rate: 46.84, label: '200+ km' };
}

function fmtCAD(n) {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(n || 0);
}

function fmtTime(t) {
  if (!t) return '—';
  const s = String(t).substring(0, 5);
  const [h, m] = s.split(':').map(Number);
  const ap = h < 12 ? 'AM' : 'PM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ap}`;
}

function fmtHours(h) {
  if (h == null) return '—';
  const n = parseFloat(h);
  if (isNaN(n) || n === 0) return '0h';
  const hrs = Math.floor(n);
  const mins = Math.round((n - hrs) * 60);
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-CA', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function fmtShortDate(d) {
  return new Date(d).toLocaleDateString('en-CA', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ── Get Mon–Sun range for previous week ───────────────────────
function previousWeekRange() {
  const now = new Date();
  const day = now.getDay() || 7; // Mon=1 ... Sun=7
  // Last Monday
  const mon = new Date(now);
  mon.setDate(now.getDate() - day - 6);
  mon.setHours(0, 0, 0, 0);
  // Last Sunday
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  sun.setHours(23, 59, 59, 999);

  const fmt = (d) => d.toISOString().split('T')[0];
  return { from: fmt(mon), to: fmt(sun), monDate: mon, sunDate: sun };
}

// ── Generate all weekdays Mon–Sun ─────────────────────────────
function weekDays(from, to) {
  const days = [];
  const cur = new Date(from);
  const end = new Date(to);
  while (cur <= end) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) {
      // skip weekend
      days.push(cur.toISOString().split('T')[0]);
    }
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

// ── Build employee weekly report HTML ─────────────────────────
function buildEmployeeReportHtml({ employee, companyName, weekDays, attendanceMap, assignment }) {
  const { zone, rate, label } = ccqZone(parseFloat(assignment?.distance_km || 0));

  let totalRegular = 0;
  let totalOvertime = 0;
  let daysWorked = 0;
  let daysUnconfirmed = 0;

  const dayRows = weekDays
    .map((date) => {
      const atr = attendanceMap[date];
      const status = atr?.attendance_status || 'ABSENT';
      const isWorked = status !== 'ABSENT' && status !== 'OPEN';
      const isPending = status === 'CHECKED_OUT';

      if (isWorked) {
        daysWorked++;
        totalRegular += parseFloat(atr.confirmed_regular_hours ?? atr.regular_hours ?? 0);
        totalOvertime += parseFloat(atr.confirmed_overtime_hours ?? atr.overtime_hours ?? 0);
      }
      if (isPending) daysUnconfirmed++;

      const statusBadge =
        {
          CHECKED_IN: `<span style="background:#d1fae5;color:#065f46;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700">On Site</span>`,
          CHECKED_OUT: `<span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700">⏳ Pending</span>`,
          CONFIRMED: `<span style="background:#dbeafe;color:#1e40af;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700">✓ Confirmed</span>`,
          ADJUSTED: `<span style="background:#ede9fe;color:#5b21b6;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700">✓ Adjusted</span>`,
          ABSENT: `<span style="background:#f1f5f9;color:#64748b;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700">Absent</span>`,
        }[status] ||
        `<span style="background:#f1f5f9;color:#64748b;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700">${status}</span>`;

      const reg = isWorked ? fmtHours(atr.confirmed_regular_hours ?? atr.regular_hours) : '—';
      const ot = isWorked ? fmtHours(atr.confirmed_overtime_hours ?? atr.overtime_hours) : '—';
      const hin = isWorked ? fmtTime(atr.check_in_time) : '—';
      const hout = isWorked ? fmtTime(atr.check_out_time) : '—';

      const rowBg = !isWorked ? '#f8fafc' : isPending ? '#fffbeb' : '#fff';

      return `
      <tr style="background:${rowBg};border-bottom:1px solid #e2e8f0">
        <td style="padding:10px 14px;font-size:13px;color:#334155;font-weight:600">${fmtDate(date)}</td>
        <td style="padding:10px 14px;font-size:13px;color:#64748b">${hin}</td>
        <td style="padding:10px 14px;font-size:13px;color:#64748b">${hout}</td>
        <td style="padding:10px 14px;font-size:13px;color:#4f46e5;font-weight:700">${reg}</td>
        <td style="padding:10px 14px;font-size:13px;color:#d97706;font-weight:700">${ot}</td>
        <td style="padding:10px 14px">${statusBadge}</td>
      </tr>`;
    })
    .join('');

  // Travel allowance section
  const distKm = parseFloat(assignment?.distance_km || 0);
  const travelDays = daysWorked;
  const travelTotal = parseFloat((rate * travelDays).toFixed(2));

  let travelSection = '';
  if (distKm >= 41) {
    const zoneColor = zone === 'T2200' ? '#dbeafe' : '#d1fae5';
    const zoneTxt = zone === 'T2200' ? '#1e40af' : '#065f46';
    travelSection = `
      <div style="background:#fefce8;border:1px solid #fde68a;border-radius:10px;padding:18px;margin-bottom:20px">
        <div style="font-size:11px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px">
          🚗 CCQ Travel Allowance
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px">
          <div>
            <div style="font-size:11px;color:#92400e;margin-bottom:4px">Distance</div>
            <div style="font-size:16px;font-weight:800;color:#1e293b">${distKm.toFixed(1)} km</div>
          </div>
          <div>
            <div style="font-size:11px;color:#92400e;margin-bottom:4px">Zone</div>
            <div style="font-size:14px;font-weight:700;padding:2px 10px;background:${zoneColor};color:${zoneTxt};border-radius:8px;display:inline-block">${label}</div>
          </div>
          <div>
            <div style="font-size:11px;color:#92400e;margin-bottom:4px">Rate / Day</div>
            <div style="font-size:16px;font-weight:800;color:#1e293b">${rate > 0 ? fmtCAD(rate) : 'T2200 Form'}</div>
          </div>
          <div>
            <div style="font-size:11px;color:#92400e;margin-bottom:4px">This Week Total</div>
            <div style="font-size:16px;font-weight:800;color:${rate > 0 ? '#059669' : '#1e40af'}">${rate > 0 ? fmtCAD(travelTotal) : 'See T2200'}</div>
          </div>
        </div>
        ${zone === 'T2200' ? `<div style="margin-top:10px;font-size:11px;color:#6b7280">Your commute distance (41–65 km) qualifies you for a T2200 tax deduction. This information will be included in your annual tax declaration.</div>` : ''}
      </div>`;
  }

  // Unconfirmed warning
  const unconfirmedWarning =
    daysUnconfirmed > 0
      ? `
    <div style="background:#fef3c7;border:1px solid #fbbf24;border-radius:8px;padding:14px;margin-bottom:20px">
      <div style="font-size:13px;font-weight:700;color:#92400e">⏳ ${daysUnconfirmed} day${daysUnconfirmed > 1 ? 's' : ''} pending foreman confirmation</div>
      <div style="font-size:12px;color:#78350f;margin-top:4px">Your foreman has been notified. Hours shown are system-calculated and may be adjusted.</div>
    </div>`
      : '';

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Weekly Report — ${employee.full_name}</title></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc">
  <div style="max-width:700px;margin:0 auto;padding:32px 16px">

    <!-- Header -->
    <div style="background:#4f46e5;border-radius:12px;padding:24px 28px;margin-bottom:24px;color:white">
      <div style="font-size:13px;opacity:0.8;margin-bottom:4px">${companyName}</div>
      <div style="font-size:22px;font-weight:800">Weekly Work Report</div>
      <div style="font-size:14px;opacity:0.9;margin-top:6px">
        ${employee.full_name} · ${employee.trade_code || ''}
      </div>
      <div style="font-size:13px;opacity:0.75;margin-top:2px">
        ${fmtShortDate(assignment?.start_date || '')} — Week ending ${fmtShortDate(weekDays[weekDays.length - 1])}
      </div>
      ${assignment ? `<div style="font-size:13px;opacity:0.75;margin-top:2px">Project: ${assignment.project_code}${assignment.project_name ? ' — ' + assignment.project_name : ''}</div>` : ''}
    </div>

    <!-- Summary cards -->
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;margin-bottom:20px">
      ${[
        { label: 'Days Worked', value: `${daysWorked}d`, color: '#f8fafc', txt: '#1e293b' },
        { label: 'Regular Hours', value: fmtHours(totalRegular), color: '#eef2ff', txt: '#4338ca' },
        {
          label: 'Overtime',
          value: fmtHours(totalOvertime),
          color: totalOvertime > 0 ? '#fffbeb' : '#f8fafc',
          txt: totalOvertime > 0 ? '#d97706' : '#94a3b8',
        },
        {
          label: 'Total Hours',
          value: fmtHours(totalRegular + totalOvertime),
          color: '#f0fdf4',
          txt: '#166534',
        },
      ]
        .map(
          (s) => `
        <div style="background:${s.color};border:1px solid #e2e8f0;border-radius:10px;padding:14px">
          <div style="font-size:11px;color:#94a3b8;font-weight:600;margin-bottom:4px">${s.label}</div>
          <div style="font-size:20px;font-weight:800;color:${s.txt}">${s.value}</div>
        </div>`
        )
        .join('')}
    </div>

    ${unconfirmedWarning}
    ${travelSection}

    <!-- Daily table -->
    <div style="background:white;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;margin-bottom:20px">
      <div style="background:#f8fafc;padding:12px 14px;border-bottom:1px solid #e2e8f0">
        <div style="font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px">Daily Breakdown</div>
      </div>
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:#f8fafc">
            ${['Day', 'Check In', 'Check Out', 'Regular', 'Overtime', 'Status']
              .map(
                (h) =>
                  `<th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px">${h}</th>`
              )
              .join('')}
          </tr>
        </thead>
        <tbody>${dayRows}</tbody>
      </table>
    </div>

    <!-- Legal footer -->
    <div style="background:#f1f5f9;border-radius:8px;padding:14px;font-size:11px;color:#64748b;line-height:1.6">
      <strong>Official Document</strong> — This report is generated automatically by ${companyName}'s workforce management system.
      It serves as an official record of your work hours for the referenced week.
      If you believe there is an error, please contact your supervisor or HR department within 5 business days.
      <br><br>
      Generated: ${new Date().toLocaleString('en-CA', { timeZone: 'America/Toronto' })} (Eastern Time)
    </div>

  </div>
</body>
</html>`;
}

// ── Build foreman reminder HTML ───────────────────────────────
function buildForemanReminderHtml({ foreman, companyName, unconfirmedRecords, weekLabel }) {
  const rows = unconfirmedRecords
    .map(
      (r) => `
    <tr style="border-bottom:1px solid #e2e8f0">
      <td style="padding:10px 14px;font-size:13px;font-weight:600;color:#334155">${r.full_name}</td>
      <td style="padding:10px 14px;font-size:13px;color:#64748b">${fmtDate(r.attendance_date)}</td>
      <td style="padding:10px 14px;font-size:13px;color:#64748b">${fmtTime(r.check_in_time)} → ${fmtTime(r.check_out_time)}</td>
      <td style="padding:10px 14px;font-size:13px;color:#4f46e5;font-weight:700">${fmtHours(r.regular_hours)}</td>
    </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Action Required — Confirm Hours</title></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc">
  <div style="max-width:600px;margin:0 auto;padding:32px 16px">

    <div style="background:#dc2626;border-radius:12px;padding:24px 28px;margin-bottom:24px;color:white">
      <div style="font-size:13px;opacity:0.8;margin-bottom:4px">${companyName}</div>
      <div style="font-size:20px;font-weight:800">⚠️ Action Required — Confirm Hours</div>
      <div style="font-size:14px;opacity:0.9;margin-top:6px">${weekLabel}</div>
    </div>

    <div style="background:white;border:1px solid #fecaca;border-radius:10px;padding:18px;margin-bottom:20px">
      <p style="font-size:14px;color:#374151;margin:0 0 8px">
        Hi ${foreman.full_name},
      </p>
      <p style="font-size:14px;color:#374151;margin:0">
        The following employees have checked out but their hours have <strong>not yet been confirmed</strong>.
        Weekly reports have been sent to employees — please confirm all pending hours as soon as possible.
      </p>
    </div>

    <div style="background:white;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;margin-bottom:20px">
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:#fef2f2">
            ${['Employee', 'Date', 'Check In → Out', 'Regular Hours']
              .map(
                (h) =>
                  `<th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:#dc2626;text-transform:uppercase;letter-spacing:1px">${h}</th>`
              )
              .join('')}
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>

    <div style="text-align:center;margin-bottom:20px">
      <a href="${process.env.APP_URL || 'http://localhost:5173'}/my-hub"
         style="display:inline-block;background:#4f46e5;color:white;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:14px;font-weight:700">
        Confirm Hours in My Hub →
      </a>
    </div>

    <div style="font-size:11px;color:#94a3b8;text-align:center">
      Generated: ${new Date().toLocaleString('en-CA', { timeZone: 'America/Toronto' })} (Eastern Time)
    </div>
  </div>
</body>
</html>`;
}

// ── Main export: run the weekly report job ────────────────────
async function runWeeklyReports(pool) {
  const { from, to, monDate, sunDate } = previousWeekRange();
  const weekLabel = `Week of ${fmtShortDate(monDate)} — ${fmtShortDate(sunDate)}`;
  const days = weekDays(from, to);

  console.log(`[weeklyReport] Running for ${from} → ${to}`);

  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  const fromEmail = process.env.SENDGRID_FROM_EMAIL;

  // 1. Get all companies
  const { rows: companies } = await pool.query(`SELECT company_id, name FROM public.companies`);

  for (const company of companies) {
    const companyId = company.company_id;
    const companyName = company.name;

    try {
      // 2. Get all approved assignments overlapping the week
      const { rows: assignments } = await pool.query(
        `
        SELECT
          ar.id AS assignment_id,
          ar.requested_for_employee_id AS employee_id,
          ar.project_id,
          ar.distance_km,
          ar.start_date,
          ar.end_date,
          ep.full_name,
          ep.trade_code,
          ep.contact_email,
          p.project_code,
          p.project_name
        FROM public.assignment_requests ar
        JOIN public.employee_profiles ep ON ep.employee_id = ar.requested_for_employee_id
        JOIN public.projects p           ON p.id = ar.project_id
        WHERE ar.company_id = $1
          AND ar.status     = 'APPROVED'
          AND ar.start_date <= $3
          AND ar.end_date   >= $2
      `,
        [companyId, from, to]
      );

      if (!assignments.length) continue;

      // 3. Get all attendance records for the week
      const employeeIds = [...new Set(assignments.map((a) => a.employee_id))];
      const { rows: attendanceRows } = await pool.query(
        `
        SELECT
          atr.employee_id,
          atr.attendance_date::text,
          atr.check_in_time,
          atr.check_out_time,
          atr.regular_hours,
          atr.overtime_hours,
          atr.confirmed_regular_hours,
          atr.confirmed_overtime_hours,
          atr.status AS attendance_status,
          atr.late_minutes
        FROM public.attendance_records atr
        WHERE atr.company_id      = $1
          AND atr.employee_id     = ANY($2::int[])
          AND atr.attendance_date >= $3
          AND atr.attendance_date <= $4
      `,
        [companyId, employeeIds, from, to]
      );

      // 4. Build lookup: employee_id → { date → attendance }
      const attendanceLookup = {};
      for (const row of attendanceRows) {
        if (!attendanceLookup[row.employee_id]) attendanceLookup[row.employee_id] = {};
        attendanceLookup[row.employee_id][row.attendance_date] = row;
      }

      // 5. Send report to each employee
      for (const asgn of assignments) {
        if (!asgn.contact_email) continue;

        const empMap = attendanceLookup[asgn.employee_id] || {};
        const html = buildEmployeeReportHtml({
          employee: asgn,
          companyName,
          weekDays: days,
          attendanceMap: empMap,
          assignment: asgn,
        });

        try {
          await sgMail.send({
            to: asgn.contact_email,
            from: fromEmail,
            subject: `[${companyName}] Your Weekly Work Report — ${weekLabel}`,
            html,
          });
          console.log(`[weeklyReport] Sent to ${asgn.full_name} (${asgn.contact_email})`);
        } catch (e) {
          console.error(`[weeklyReport] Failed to send to ${asgn.contact_email}:`, e.message);
        }
      }

      // 6. Find unconfirmed records and notify foremen
      const unconfirmed = attendanceRows.filter((r) => r.attendance_status === 'CHECKED_OUT');
      if (!unconfirmed.length) continue;

      // Get foremen for the week
      const { rows: foremen } = await pool.query(
        `
        SELECT DISTINCT
          ar.requested_for_employee_id AS foreman_employee_id,
          ep.full_name,
          ep.contact_email,
          ar.project_id
        FROM public.assignment_requests ar
        JOIN public.employee_profiles ep ON ep.employee_id = ar.requested_for_employee_id
        WHERE ar.company_id     = $1
          AND ar.assignment_role = 'FOREMAN'
          AND ar.status          = 'APPROVED'
          AND ar.start_date     <= $3
          AND ar.end_date       >= $2
      `,
        [companyId, from, to]
      );

      for (const foreman of foremen) {
        if (!foreman.contact_email) continue;

        // Unconfirmed records for employees on this foreman's project
        const myUnconfirmed = unconfirmed.filter((r) => {
          const empAsgn = assignments.find(
            (a) => a.employee_id === r.employee_id && a.project_id === foreman.project_id
          );
          return !!empAsgn;
        });

        if (!myUnconfirmed.length) continue;

        // Enrich with employee name
        const enriched = myUnconfirmed.map((r) => ({
          ...r,
          full_name: assignments.find((a) => a.employee_id === r.employee_id)?.full_name || '—',
        }));

        const html = buildForemanReminderHtml({
          foreman,
          companyName,
          unconfirmedRecords: enriched,
          weekLabel,
        });

        try {
          await sgMail.send({
            to: foreman.contact_email,
            from: fromEmail,
            subject: `[ACTION REQUIRED] ${enriched.length} unconfirmed hour${enriched.length > 1 ? 's' : ''} — ${weekLabel}`,
            html,
          });
          console.log(`[weeklyReport] Foreman reminder sent to ${foreman.full_name}`);
        } catch (e) {
          console.error(`[weeklyReport] Failed to send foreman reminder:`, e.message);
        }
      }
    } catch (err) {
      console.error(`[weeklyReport] Error for company ${companyId}:`, err.message);
    }
  }

  console.log(`[weeklyReport] Done.`);
}

module.exports = { runWeeklyReports };
