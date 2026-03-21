"use strict";

const express = require("express");
const router = express.Router();
const db = require("../db");
const pool = db && db.pool ? db.pool : db;
const auth = require("../middleware/auth");
const { can } = require("../middleware/permissions");

if (!pool || typeof pool.query !== "function") {
  throw new Error("DB pool is not initialized correctly. Expected pool.query to be a function.");
}

function requireRoles(req, res, allowed) {
  const role = String(req.user?.role || "").toUpperCase();
  if (!allowed.includes(role)) {
    res.status(403).json({ ok: false, error: "FORBIDDEN_ROLE" });
    return false;
  }
  return true;
}

function requireCompany(req, res) {
  const raw = req.user?.company_id;
  if (raw === undefined || raw === null || raw === "") {
    res.status(400).json({ ok: false, error: "COMPANY_REQUIRED" });
    return null;
  }
  const companyId = Number(raw);
  if (!Number.isFinite(companyId) || companyId <= 0) {
    res.status(400).json({ ok: false, error: "COMPANY_REQUIRED" });
    return null;
  }
  return companyId;
}

function csvValue(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function csvRow(values) {
  return `${values.map(csvValue).join(",")}\n`;
}

let schemaCache = null;

async function getSchemaInfo() {
  if (schemaCache) return schemaCache;

  const { rows } = await pool.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('attendance_logs', 'attendance', 'projects', 'employees', 'parking_claims')
    ORDER BY table_name, ordinal_position
  `);

  const tables = new Map();
  for (const row of rows) {
    const t = String(row.table_name);
    const c = String(row.column_name);
    if (!tables.has(t)) tables.set(t, new Set());
    tables.get(t).add(c);
  }

  const attendanceTable = tables.has("attendance_logs")
    ? "attendance_logs"
    : (tables.has("attendance") ? "attendance" : null);

  if (!attendanceTable) {
    throw new Error("ATTENDANCE_TABLE_MISSING");
  }

  schemaCache = {
    tables,
    attendanceTable,
    attendanceCols: tables.get(attendanceTable) || new Set(),
    projectCols: tables.get("projects") || new Set(),
    employeeCols: tables.get("employees") || new Set(),
    parkingCols: tables.get("parking_claims") || new Set(),
  };

  return schemaCache;
}

async function queryTimesheet(companyId) {
  const { attendanceTable, attendanceCols } = await getSchemaInfo();

  if (!attendanceCols.has("company_id")) {
    throw new Error(`${attendanceTable}.company_id missing`);
  }

  const projectJoin = attendanceCols.has("project_id")
    ? `LEFT JOIN public.projects p ON p.id = a.project_id AND p.company_id = $1`
    : `LEFT JOIN public.projects p ON 1 = 0`;

  const sql = `
    SELECT
      a.work_date,
      e.employee_code,
      e.first_name,
      e.last_name,
      p.project_code,
      p.project_name,
      a.check_in_at,
      a.check_out_at
    FROM public.${attendanceTable} a
    JOIN public.employees e
      ON e.id = a.employee_id
     AND e.company_id = $1
    ${projectJoin}
    WHERE a.company_id = $1
    ORDER BY a.work_date DESC, a.check_in_at DESC NULLS LAST, e.employee_code ASC
  `;

  const { rows } = await pool.query(sql, [companyId]);
  return rows;
}

async function queryProjectSummary(companyId) {
  const { attendanceTable, attendanceCols } = await getSchemaInfo();

  if (!attendanceCols.has("company_id") || !attendanceCols.has("project_id")) {
    throw new Error(`${attendanceTable} missing company_id/project_id`);
  }

  const sql = `
    SELECT
      p.project_code,
      p.project_name,
      COUNT(a.*)::int AS entries
    FROM public.projects p
    LEFT JOIN public.${attendanceTable} a
      ON a.project_id = p.id
     AND a.company_id = $1
    WHERE p.company_id = $1
    GROUP BY p.project_code, p.project_name
    ORDER BY p.project_code
  `;

  const { rows } = await pool.query(sql, [companyId]);
  return rows;
}

async function queryTravelAllowance(companyId) {
  const { attendanceTable, attendanceCols } = await getSchemaInfo();

  if (!attendanceCols.has("company_id")) {
    throw new Error(`${attendanceTable}.company_id missing`);
  }

  const sql = `
    SELECT
      employee_id,
      COUNT(*)::int AS trips
    FROM public.${attendanceTable}
    WHERE company_id = $1
    GROUP BY employee_id
    ORDER BY employee_id
  `;

  const { rows } = await pool.query(sql, [companyId]);
  return rows;
}

async function queryParkingClaims(companyId) {
  const { parkingCols } = await getSchemaInfo();

  if (!parkingCols.size) {
    throw new Error("parking_claims table missing");
  }

  const workDateSelect = parkingCols.has("work_date")
    ? `pc.work_date`
    : `COALESCE(substring(COALESCE(pc.note, '') from '\\[work_date=([0-9]{4}-[0-9]{2}-[0-9]{2})\\]'), '')`;

  let joins = "";
  const where = [];
  const params = [companyId];

  if (parkingCols.has("company_id")) {
    where.push(`pc.company_id = $1`);
  } else if (parkingCols.has("project_id")) {
    joins += `\n      JOIN public.projects p ON p.id = pc.project_id`;
    where.push(`p.company_id = $1`);
  } else if (parkingCols.has("employee_id")) {
    joins += `\n      JOIN public.employees e ON e.id = pc.employee_id`;
    where.push(`e.company_id = $1`);
  } else {
    throw new Error("parking_claims missing company isolation path");
  }

  const projectIdSelect = parkingCols.has("project_id") ? `pc.project_id` : `NULL::int`;
  const employeeIdSelect = parkingCols.has("employee_id") ? `pc.employee_id` : `NULL::int`;
  const amountSelect = parkingCols.has("amount") ? `pc.amount` : `NULL::numeric`;
  const noteSelect = parkingCols.has("note") ? `pc.note` : `NULL::text`;

  const sql = `
    SELECT
      ${employeeIdSelect} AS employee_id,
      ${workDateSelect} AS work_date,
      ${projectIdSelect} AS project_id,
      ${amountSelect} AS amount,
      ${noteSelect} AS note
    FROM public.parking_claims pc
    ${joins}
    WHERE ${where.join(" AND ")}
    ORDER BY work_date DESC NULLS LAST, employee_id ASC NULLS LAST
  `;

  const { rows } = await pool.query(sql, params);
  return rows;
}

router.get("/timesheet.csv", auth, can("bi.access_full"), async (req, res) => {
  if (!requireRoles(req, res, ["ADMIN", "FOREMAN"])) return;

  const companyId = requireCompany(req, res);
  if (companyId === null) return;

  try {
    const rows = await queryTimesheet(companyId);

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=timesheet.csv");
    res.write(csvRow([
      "work_date",
      "employee_code",
      "first_name",
      "last_name",
      "project_code",
      "project_name",
      "check_in_at",
      "check_out_at",
    ]));

    for (const r of rows) {
      res.write(csvRow([
        r.work_date,
        r.employee_code,
        r.first_name,
        r.last_name,
        r.project_code,
        r.project_name,
        r.check_in_at,
        r.check_out_at,
      ]));
    }
    res.end();
  } catch (err) {
    console.error("timesheet.csv error:", err);
    res.status(500).json({ ok: false, error: "TIMESHEET_FAILED" });
  }
});

router.get("/project_summary.csv", auth, can("bi.access_full"), async (req, res) => {
  if (!requireRoles(req, res, ["ADMIN", "FOREMAN"])) return;

  const companyId = requireCompany(req, res);
  if (companyId === null) return;

  try {
    const rows = await queryProjectSummary(companyId);

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=project_summary.csv");
    res.write(csvRow(["project_code", "project_name", "entries"]));

    for (const r of rows) {
      res.write(csvRow([r.project_code, r.project_name, r.entries]));
    }
    res.end();
  } catch (err) {
    console.error("project_summary.csv error:", err);
    res.status(500).json({ ok: false, error: "PROJECT_SUMMARY_FAILED" });
  }
});

router.get("/travel_allowance.csv", auth, can("bi.access_full"), async (req, res) => {
  if (!requireRoles(req, res, ["ADMIN", "FOREMAN"])) return;

  const companyId = requireCompany(req, res);
  if (companyId === null) return;

  try {
    const rows = await queryTravelAllowance(companyId);

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=travel_allowance.csv");
    res.write(csvRow(["employee_id", "trips"]));

    for (const r of rows) {
      res.write(csvRow([r.employee_id, r.trips]));
    }
    res.end();
  } catch (err) {
    console.error("travel_allowance.csv error:", err);
    res.status(500).json({ ok: false, error: "TRAVEL_FAILED" });
  }
});

router.get("/parking_claims.csv", auth, can("bi.access_full"), async (req, res) => {
  if (!requireRoles(req, res, ["ADMIN", "FOREMAN"])) return;

  const companyId = requireCompany(req, res);
  if (companyId === null) return;

  try {
    const rows = await queryParkingClaims(companyId);

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=parking_claims.csv");
    res.write(csvRow(["employee_id", "work_date", "project_id", "amount", "note"]));

    for (const r of rows) {
      res.write(csvRow([r.employee_id, r.work_date, r.project_id, r.amount, r.note || ""]));
    }
    res.end();
  } catch (err) {
    console.error("parking_claims.csv error:", err);
    res.status(500).json({ ok: false, error: "PARKING_FAILED" });
  }
});

module.exports = router;
