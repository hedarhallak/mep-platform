// routes/daily_dispatch.js
// E2: Prepare Daily Dispatch snapshot (DB only usage, NO emails)
"use strict";

const express = require("express");
const router = express.Router();

const db = require("../db");
const pool = db && db.pool ? db.pool : db;

function assertPool(p) {
  return p && typeof p.query === "function";
}

// POST /api/daily-dispatch/prepare?date=YYYY-MM-DD
// Creates a STARTED run and stores per-employee snapshot in employee_daily_dispatch_state (last_sent_payload_json)
// Does NOT approve requests and does NOT send emails.
router.post("/prepare", async (req, res) => {
  try {
    if (!assertPool(pool)) {
      console.error("DB pool invalid in routes/daily_dispatch.js:", db);
      return res.status(500).json({ ok: false, error: "internal_error" });
    }

    const qDate = String(req.query.date || "").trim();
    const date = qDate || new Date().toISOString().slice(0, 10); // YYYY-MM-DD (server local/utc)
    const companyId = req.user && req.user.company_id ? Number(req.user.company_id) : null;
    if (companyId === null) {
      return res.status(400).json({ ok: false, error: "company_required" });
    }


// If company_id is NULL in this baseline, enforce "one run per date" at the application layer.
// Otherwise Postgres UNIQUE(company_id, dispatch_date) allows duplicates when company_id is NULL.
if (companyId === null) {
  const { rows: existingRows } = await pool.query(
    `SELECT * FROM public.daily_dispatch_runs
     WHERE company_id IS NULL AND dispatch_date = $1::date
     ORDER BY started_at DESC
     LIMIT 1`,
    [date, companyId]
    );
  const existing = existingRows[0] || null;
  if (existing && String(existing.status).toUpperCase() !== "FAILED") {
    return res.status(409).json({
      ok: false,
      error: "already_prepared",
      run: { id: existing.id, company_id: existing.company_id, dispatch_date: existing.dispatch_date, status: existing.status },
    });
  }
}


    const triggeredBy = req.user && req.user.user_id ? Number(req.user.user_id) : null;

    // 1) Create run (STARTED). If already exists for company/date, return 409 with run id.
    let runRow = null;
    try {
      const ins = await pool.query(
        `
        INSERT INTO public.daily_dispatch_runs (company_id, dispatch_date, status, triggered_by_user_id, summary_json)
        VALUES ($1, $2::date, 'STARTED', $3, '{}'::jsonb)
        RETURNING *
        `,
        [companyId, date, triggeredBy]
      );
      runRow = ins.rows[0] || null;
    } catch (e) {
      // Unique per company/day may throw; handle gracefully.
      const { rows } = await pool.query(
        `SELECT * FROM public.daily_dispatch_runs WHERE company_id IS NOT DISTINCT FROM $1 AND dispatch_date = $2::date LIMIT 1`,
        [companyId, date]
      );
      const existing = rows[0] || null;
      if (existing) {
        return res.status(409).json({
          ok: false,
          error: "already_prepared",
          run: { id: existing.id, company_id: existing.company_id, dispatch_date: existing.dispatch_date, status: existing.status },
        });
      }
      throw e;
    }

    // 2) Build snapshot from APPROVED assignments that cover the date
    // We assume "assignments" table is the source of truth.
    const { rows } = await pool.query(
      `
      SELECT
  a.id AS assignment_id,
  a.employee_id,
  e.employee_code,
  (COALESCE(e.first_name,'') || ' ' || COALESCE(e.last_name,''))::text AS employee_name,
  a.project_id,
  p.project_code,
  p.project_name,
  p.site_address,
  a.start_date,
  a.end_date,
  a.shift,
  NULLIF(split_part(COALESCE(a.shift,''), '-', 1), '')::time AS shift_start
FROM public.assignments a
      JOIN public.employees e ON e.id = a.employee_id
      JOIN public.projects  p ON p.id = a.project_id
      WHERE a.start_date <= $1::date AND a.end_date >= $1::date
        AND a.company_id IS NOT DISTINCT FROM $2
      ORDER BY a.employee_id, shift_start, p.project_code, a.id
      `,
      [date, companyId]
    );

    // 3) Group per employee
    const byEmp = new Map();
    for (const r of rows) {
      const empId = Number(r.employee_id);
      if (!byEmp.has(empId)) {
        byEmp.set(empId, {
          employee_id: empId,
          employee_code: r.employee_code,
          employee_name: r.employee_name,
          tasks: [],
        });
      }
      byEmp.get(empId).tasks.push({
        assignment_id: Number(r.assignment_id),
        project_id: Number(r.project_id),
        project_code: r.project_code,
        project_name: r.project_name,
        site_address: r.site_address,
        shift: r.shift,
        date: date,
      });
    }

    // 4) Upsert employee_daily_dispatch_state with version bump (but keep last_sent_at NULL for E2)
    let upserted = 0;
    for (const emp of byEmp.values()) {
      const payload = JSON.stringify(emp.tasks);
      await pool.query(
        `
        INSERT INTO public.employee_daily_dispatch_state
          (company_id, employee_id, work_date, last_sent_version, last_sent_payload_json, last_sent_at)
        VALUES
          ($1, $2, $3::date, 1, $4::jsonb, NULL)
        ON CONFLICT (company_id, employee_id, work_date)
        DO UPDATE SET
          company_id = EXCLUDED.company_id,
          last_sent_version = public.employee_daily_dispatch_state.last_sent_version + 1,
          last_sent_payload_json = EXCLUDED.last_sent_payload_json,
          last_sent_at = NULL
        `,
        [companyId, emp.employee_id, date, payload]
      );
      upserted += 1;
    }

    // 5) Update run summary
    await pool.query(
      `
      UPDATE public.daily_dispatch_runs
      SET summary_json = jsonb_build_object(
        'date', $2::text,
        'employees', $1::int,
        'assignments', $3::int
      )
      WHERE id = $4
      `,
      [upserted, date, rows.length, runRow.id]
    );

    return res.json({
      ok: true,
      run: { id: runRow.id, company_id: runRow.company_id, dispatch_date: runRow.dispatch_date, status: runRow.status },
      date,
      employees: upserted,
      assignments: rows.length,
    });
  } catch (err) {
    console.error("POST /api/daily-dispatch/prepare error:", err);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});


function mustEnv(name) {
  const v = process.env[name];
  if (!v || !String(v).trim()) return null;
  return String(v).trim();
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildDigestHtml({ date, employeeName, tasks }) {
  const safeName = escapeHtml(employeeName || "Employee");
  const rows = (tasks || []).map((t) => {
    const shift = escapeHtml(t.shift || "");
    const pName = escapeHtml(t.project_name || t.project_code || "");
    const addr = escapeHtml(t.site_address || "");
    return `
      <tr>
        <td style="padding:6px 8px; border-bottom:1px solid #eee; white-space:nowrap;">${shift}</td>
        <td style="padding:6px 8px; border-bottom:1px solid #eee;">${pName}<div style="color:#666; font-size:12px;">${addr}</div></td>
      </tr>`;
  }).join("");

  return `
    <div style="font-family: Arial, sans-serif; line-height:1.4">
      <h2 style="margin:0 0 8px 0;">Daily Assignments</h2>
      <div style="color:#555; margin:0 0 14px 0;">Date: <b>${escapeHtml(date)}</b></div>
      <div style="margin:0 0 10px 0;">Hello <b>${safeName}</b>, here are your assignments for today:</div>
      <table style="border-collapse:collapse; width:100%; max-width:640px;">
        <thead>
          <tr>
            <th align="left" style="padding:6px 8px; border-bottom:2px solid #ddd;">Shift</th>
            <th align="left" style="padding:6px 8px; border-bottom:2px solid #ddd;">Project</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="2" style="padding:8px;">No assignments.</td></tr>`}
        </tbody>
      </table>
      <div style="color:#777; margin-top:14px; font-size:12px;">This message was sent by MEP Site Workforce.</div>
    </div>
  `;
}

async function getEmployeesEmailColumn(pool) {
  const { rows } = await pool.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema='public' AND table_name='employees'`
  );
  const cols = new Set(rows.map((r) => String(r.column_name)));
  if (cols.has("contact_email")) return "contact_email";
  if (cols.has("email")) return "email";
  // fallback candidates
  if (cols.has("work_email")) return "work_email";
  return null;
}

// POST /api/daily-dispatch/commit?date=YYYY-MM-DD
// Sends one email per employee (daily digest) using snapshots stored in employee_daily_dispatch_state.
// Marks run as SENT and sets last_sent_at for each employee row.
router.post("/commit", async (req, res) => {
  const startedAt = Date.now();
  try {
    if (!assertPool(pool)) {
      console.error("DB pool invalid in routes/daily_dispatch.js:", db);
      return res.status(500).json({ ok: false, error: "internal_error" });
    }

    const SENDGRID_API_KEY = mustEnv("SENDGRID_API_KEY");
    const SENDGRID_FROM_EMAIL = mustEnv("SENDGRID_FROM_EMAIL");
    if (!SENDGRID_API_KEY || !SENDGRID_FROM_EMAIL) {
      return res.status(500).json({
        ok: false,
        error: "EMAIL_NOT_CONFIGURED",
        message: "Missing SENDGRID_API_KEY / SENDGRID_FROM_EMAIL in .env",
      });
    }

    const sgMail = require("@sendgrid/mail");
    sgMail.setApiKey(SENDGRID_API_KEY);

    const qDate = String(req.query.date || "").trim();
    const date = qDate || new Date().toISOString().slice(0, 10);
    const companyId = req.user && req.user.company_id ? Number(req.user.company_id) : null;
    if (companyId === null) {
      return res.status(400).json({ ok: false, error: "company_required" });
    }

    const triggeredBy = req.user && req.user.user_id ? Number(req.user.user_id) : null;

    // 1) Find run
    const runSel = await pool.query(
  `SELECT * FROM public.daily_dispatch_runs
   WHERE company_id IS NOT DISTINCT FROM $1 AND dispatch_date = $2::date
   ORDER BY (CASE WHEN UPPER(status) = 'SENT' THEN 1 ELSE 0 END), started_at DESC
   LIMIT 1`,
  [companyId, date]
);
const run = runSel.rows[0] || null;

    if (!run) {
      return res.status(404).json({ ok: false, error: "not_prepared" });
    }
    if (String(run.status).toUpperCase() === "SENT") {
      return res.status(409).json({ ok: false, error: "already_sent", run_id: run.id });
    }

    // 2) Load snapshots for this date
    const snapSel = await pool.query(
      `SELECT employee_id, work_date, last_sent_payload_json, last_sent_version
       FROM public.employee_daily_dispatch_state
       WHERE company_id IS NOT DISTINCT FROM $1 AND work_date = $2::date
       ORDER BY employee_id`,
      [companyId, date]
    );
    const snaps = snapSel.rows || [];
    if (!snaps.length) {
      return res.status(400).json({ ok: false, error: "no_snapshots" });
    }

    // 3) Load employee emails
    const emailCol = await getEmployeesEmailColumn(pool);
    if (!emailCol) {
      return res.status(500).json({ ok: false, error: "employees_email_column_missing" });
    }

    const empIds = snaps.map((s) => Number(s.employee_id));
    const empSel = await pool.query(
      `
      SELECT id AS employee_id,
             employee_code,
             first_name,
             last_name,
             ${emailCol} AS email
      FROM public.employees
      WHERE id = ANY($1::int[])
      `,
      [empIds]
    );
    const empMap = new Map();
    for (const e of empSel.rows || []) {
      empMap.set(Number(e.employee_id), e);
    }

    // 4) Send one email per employee
    let sent = 0;
    let missingEmail = 0;

    for (const s of snaps) {
      const emp = empMap.get(Number(s.employee_id));
      const rawEmail = emp ? emp.email : null;
      const email = normalizeEmail(rawEmail);
      if (!email || !isValidEmail(email)) {
        missingEmail += 1;
        continue;
      }

      let tasks = [];
      try {
        tasks = Array.isArray(s.last_sent_payload_json) ? s.last_sent_payload_json : JSON.parse(String(s.last_sent_payload_json || "[]"));
      } catch (_) {
        tasks = [];
      }

      const employeeName = emp ? `${(emp.first_name || "").trim()} ${(emp.last_name || "").trim()}`.trim() : `Employee ${s.employee_id}`;
      const html = buildDigestHtml({ date, employeeName, tasks });
      const subject = `Daily Assignments - ${date}`;

      await sgMail.send({
        to: email,
        from: SENDGRID_FROM_EMAIL,
        subject,
        html,
      });

      // Mark sent time for that employee snapshot row
      await pool.query(
        `UPDATE public.employee_daily_dispatch_state
         SET last_sent_at = NOW()
         WHERE company_id IS NOT DISTINCT FROM $3 AND employee_id = $1 AND work_date = $2::date`,
        [Number(s.employee_id), date, companyId]
      );

      sent += 1;
    }

    // 5) Mark run SENT
    await pool.query(
      `
      UPDATE public.daily_dispatch_runs
      SET status='SENT',
          finished_at=NOW(),
          triggered_by_user_id = COALESCE(triggered_by_user_id, $2),
          summary_json = jsonb_set(
            jsonb_set(
              COALESCE(summary_json, '{}'::jsonb),
              '{sent_emails}', to_jsonb($3::int), true
            ),
            '{missing_email}', to_jsonb($4::int), true
          )
      WHERE id = $1
      `,
      [run.id, triggeredBy, sent, missingEmail]
    );

    return res.json({
      ok: true,
      run: { id: run.id, company_id: run.company_id, dispatch_date: run.dispatch_date, status: "SENT" },
      date,
      sent_emails: sent,
      missing_email: missingEmail,
      ms: Date.now() - startedAt,
    });
  } catch (err) {
    console.error("POST /api/daily-dispatch/commit error:", err);

    // Best-effort: mark run FAILED if possible
    try {
      const qDate = String(req.query.date || "").trim();
      const date = qDate || new Date().toISOString().slice(0, 10);
      const companyId = req.user && req.user.company_id ? Number(req.user.company_id) : null;
    if (companyId === null) {
      return res.status(400).json({ ok: false, error: "company_required" });
    }


      await pool.query(
        `
        UPDATE public.daily_dispatch_runs
        SET status='FAILED',
            finished_at=NOW(),
            summary_json = jsonb_set(COALESCE(summary_json, '{}'::jsonb), '{error}', to_jsonb($3::text), true)
        WHERE company_id IS NOT DISTINCT FROM $1 AND dispatch_date = $2::date AND status <> 'SENT'
        `,
        [companyId, date, String(err && err.message ? err.message : err)]
      );
    } catch (_) {
      // ignore
    }

    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});



// GET /api/daily-dispatch/preview?date=YYYY-MM-DD&view=summary|exceptions|projects|employee
// F1: Preview the digest content BEFORE commit (no emails, no status changes).
router.get("/preview", async (req, res) => {
  try {
    if (!assertPool(pool)) {
      console.error("DB pool invalid in routes/daily_dispatch.js:", db);
      return res.status(500).json({ ok: false, error: "internal_error" });
    }

    const qDate = String(req.query.date || "").trim();
    const date = qDate || new Date().toISOString().slice(0, 10);
    const view = String(req.query.view || "summary").trim().toLowerCase();

    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.page_size || "20"), 10) || 20));
    const q = String(req.query.q || "").trim().toLowerCase();

    const projectId = req.query.project_id ? Number(req.query.project_id) : null;
    const employeeId = req.query.employee_id ? Number(req.query.employee_id) : null;

    const companyId = req.user && req.user.company_id ? Number(req.user.company_id) : null;
    if (companyId === null) {
      return res.status(400).json({ ok: false, error: "company_required" });
    }


    // Load run status (latest, prefer non-SENT first; otherwise most recent)
    const runSel = await pool.query(
      `SELECT * FROM public.daily_dispatch_runs
       WHERE company_id IS NOT DISTINCT FROM $1 AND dispatch_date = $2::date
       ORDER BY (CASE WHEN UPPER(status) = 'SENT' THEN 1 ELSE 0 END), started_at DESC
       LIMIT 1`,
      [companyId, date]
    );
    const run = runSel.rows[0] || null;
    const runStatus = run ? String(run.status).toUpperCase() : "NOT_PREPARED";

    // Helpers to detect schema columns safely
    async function getEmployeesEmailColumn() {
      const { rows } = await pool.query(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema='public' AND table_name='employees'`
      );
      const cols = new Set(rows.map((r) => String(r.column_name)));
      if (cols.has("contact_email")) return "contact_email";
      if (cols.has("email")) return "email";
      if (cols.has("work_email")) return "work_email";
      return null;
    }

    async function hasEmployeesIsActive() {
      const { rows } = await pool.query(
        `SELECT 1
         FROM information_schema.columns
         WHERE table_schema='public' AND table_name='employees' AND column_name='is_active'
         LIMIT 1`
      );
      return (rows || []).length > 0;
    }

    function normalizeEmail(email) {
      return String(email || "").trim().toLowerCase();
    }
    function isValidEmail(email) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    // Load snapshots/state for that date (prepared via /prepare)
    const snapSel = await pool.query(
      `SELECT employee_id, work_date, last_sent_payload_json, last_sent_version, last_sent_at
       FROM public.employee_daily_dispatch_state
       WHERE company_id IS NOT DISTINCT FROM $1 AND work_date = $2::date
       ORDER BY employee_id`,
      [companyId, date]
    );
    const snaps = snapSel.rows || [];

    const emailCol = await getEmployeesEmailColumn();

    const empIds = snaps.map((s) => Number(s.employee_id));
    let empRows = [];
    if (empIds.length) {
      const emailSelect = emailCol ? `${emailCol} AS email` : `NULL::text AS email`;
      const { rows } = await pool.query(
        `
        SELECT id AS employee_id,
               employee_code,
               first_name,
               last_name,
               ${emailSelect}
        FROM public.employees
        WHERE id = ANY($1::int[])
        `,
        [empIds]
      );
      empRows = rows || [];
    }
    const empMap = new Map(empRows.map((e) => [Number(e.employee_id), e]));

    // Parse tasks per employee from jsonb payload
    const employees = [];
    for (const s of snaps) {
      const emp = empMap.get(Number(s.employee_id));
      const name = emp ? `${(emp.first_name || "").trim()} ${(emp.last_name || "").trim()}`.trim() : `Employee ${s.employee_id}`;
      const code = emp ? emp.employee_code : null;
      const email = emp ? normalizeEmail(emp.email) : "";
      let tasks = [];
      try {
        tasks = Array.isArray(s.last_sent_payload_json) ? s.last_sent_payload_json : JSON.parse(String(s.last_sent_payload_json || "[]"));
      } catch (_) {
        tasks = [];
      }

      // Optional search filter by employee name/code
      if (q) {
        const hay = `${String(code || "").toLowerCase()} ${String(name || "").toLowerCase()}`;
        if (!hay.includes(q)) continue;
      }

      employees.push({
        employee_id: Number(s.employee_id),
        employee_code: code,
        employee_name: name,
        contact_email: emailCol === "contact_email" ? email : null,
        email: emailCol && emailCol !== "contact_email" ? email : null,
        email_valid: !!email && isValidEmail(email),
        tasks,
        tasks_count: Array.isArray(tasks) ? tasks.length : 0,
      });
    }

    // Compute exception sets
    const missingEmail = employees.filter((e) => !e.email_valid).map((e) => e.employee_id);
    const multiAssignment = employees.filter((e) => e.tasks_count > 1).map((e) => e.employee_id);

    // Unassigned (best-effort, if employees table has is_active)
    let unassignedCount = null;
    try {
      const hasActive = await hasEmployeesIsActive();
      if (hasActive) {
        const { rows } = await pool.query(
          `SELECT COUNT(*)::int AS n
           FROM public.employees
           WHERE is_active = true`
        );
        const totalActive = (rows[0] && rows[0].n) ? Number(rows[0].n) : 0;
        const assignedIds = new Set(employees.map((e) => e.employee_id));
        unassignedCount = Math.max(0, totalActive - assignedIds.size);
      }
    } catch (_) {
      unassignedCount = null;
    }

    // Build by-project grouping (from tasks)
    const projectMap = new Map(); // project_id -> {project_id, project_code, project_name, site_address, employee_ids:Set, exceptions:int}
    for (const e of employees) {
      for (const t of (e.tasks || [])) {
        const pid = t.project_id != null ? Number(t.project_id) : null;
        if (projectId !== null && pid !== projectId) continue;

        const key = pid != null ? String(pid) : `null:${t.project_code || ""}:${t.project_name || ""}`;
        if (!projectMap.has(key)) {
          projectMap.set(key, {
            project_id: pid,
            project_code: t.project_code || null,
            project_name: t.project_name || null,
            site_address: t.site_address || null,
            employee_ids: new Set(),
            exceptions: 0,
          });
        }
        const p = projectMap.get(key);
        p.employee_ids.add(e.employee_id);
      }
    }
    // exceptions per project = count employees in that project with missing email or multi assignment
    const missingSet = new Set(missingEmail);
    const multiSet = new Set(multiAssignment);
    for (const p of projectMap.values()) {
      let ex = 0;
      for (const eid of p.employee_ids) {
        if (missingSet.has(eid) || multiSet.has(eid)) ex += 1;
      }
      p.exceptions = ex;
    }

    function paginate(list) {
      const total = list.length;
      const start = (page - 1) * pageSize;
      const end = start + pageSize;
      return { total, page, page_size: pageSize, items: list.slice(start, end) };
    }

    // Summary (default)
    if (view === "summary") {
      const willSend = employees.filter((e) => e.email_valid).length;
      const summary = {
        date,
        run_status: runStatus,
        run_id: run ? run.id : null,
        will_send_count: willSend,
        missing_email_count: missingEmail.length,
        multi_assignment_count: multiAssignment.length,
        unassigned_count: unassignedCount,
        projects_count: projectMap.size,
        email_column: emailCol,
      };
      return res.json({ ok: true, view: "summary", summary });
    }

    // Exceptions view
    if (view === "exceptions") {
      const list = employees
        .filter((e) => !e.email_valid || e.tasks_count > 1)
        .map((e) => ({
          employee_id: e.employee_id,
          employee_code: e.employee_code,
          employee_name: e.employee_name,
          issues: [
            !e.email_valid ? "MISSING_EMAIL" : null,
            e.tasks_count > 1 ? "MULTI_ASSIGNMENT" : null,
          ].filter(Boolean),
          tasks_count: e.tasks_count,
        }));
      return res.json({
        ok: true,
        view: "exceptions",
        date,
        run_status: runStatus,
        run_id: run ? run.id : null,
        ...paginate(list),
      });
    }

    // Projects view
    if (view === "projects") {
      let projects = Array.from(projectMap.values()).map((p) => ({
        project_id: p.project_id,
        project_code: p.project_code,
        project_name: p.project_name,
        site_address: p.site_address,
        employees_count: p.employee_ids.size,
        exceptions_count: p.exceptions,
      }));

      // Optional search filter by project code/name/address
      if (q) {
        projects = projects.filter((p) => {
          const hay = `${String(p.project_code || "").toLowerCase()} ${String(p.project_name || "").toLowerCase()} ${String(p.site_address || "").toLowerCase()}`;
          return hay.includes(q);
        });
      }

      // Sort: most exceptions first, then most employees
      projects.sort((a, b) => (b.exceptions_count - a.exceptions_count) || (b.employees_count - a.employees_count));
      return res.json({
        ok: true,
        view: "projects",
        date,
        run_status: runStatus,
        run_id: run ? run.id : null,
        ...paginate(projects),
      });
    }

    // Employee preview view
    if (view === "employee") {
      if (!employeeId) {
        return res.status(400).json({ ok: false, error: "employee_id_required" });
      }
      const e = employees.find((x) => x.employee_id === employeeId);
      if (!e) {
        return res.status(404).json({ ok: false, error: "employee_not_found_in_snapshots" });
      }
      // Optional filter by project_id within tasks
      let tasks = Array.isArray(e.tasks) ? e.tasks : [];
      if (projectId !== null) tasks = tasks.filter((t) => Number(t.project_id) === projectId);

      // Sort tasks by shift (string sort is fine for HH:MM-HH:MM) then project
      tasks = tasks.slice().sort((a, b) => {
        const s1 = String(a.shift || "");
        const s2 = String(b.shift || "");
        if (s1 !== s2) return s1.localeCompare(s2);
        return String(a.project_code || "").localeCompare(String(b.project_code || ""));
      });

      return res.json({
        ok: true,
        view: "employee",
        date,
        run_status: runStatus,
        run_id: run ? run.id : null,
        employee: {
          employee_id: e.employee_id,
          employee_code: e.employee_code,
          employee_name: e.employee_name,
          email_column: emailCol,
          email: emailCol ? (emailCol === "contact_email" ? e.contact_email : e.email) : null,
          email_valid: e.email_valid,
        },
        tasks,
      });
    }

    // Unknown view
    return res.status(400).json({ ok: false, error: "invalid_view" });
  } catch (err) {
    console.error("GET /api/daily-dispatch/preview error:", err);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

module.exports = router;
