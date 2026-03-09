// routes/assignments_v2.js
// Read-only Assignments V2 endpoint (from new public.assignments table)
// GET /api/assignments_v2

const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");

// MC-1.4.3 hotfix: assignments_v2 uses auth middleware directly (router.use(auth)),
// but some routes reference authRequired + requireRole. Define safe aliases here.
const authRequired = auth;

function requireRole(allowedRoles) {
  return (req, res, next) => {
    const role = req?.user?.role;
    if (!role || !allowedRoles.includes(role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    return next();
  };
}

const { pool } = require("../db");

router.use(auth);

function getCompanyId(req) {
  const cid = req && req.user ? req.user.company_id : null;
  return (cid === undefined || cid === null) ? null : cid;
}

// Cache detected column mapping to avoid querying information_schema every request
let EMP_COLS_CACHE = null;
let PROJ_COLS_CACHE = null;

async function detectEmployeeColumns() {
  if (EMP_COLS_CACHE) return EMP_COLS_CACHE;

  const { rows } = await pool.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='employees'
    ORDER BY ordinal_position
  `);

  const cols = new Set(rows.map(r => r.column_name));

  const map = {
    id: cols.has("id") ? "id" : (cols.has("employee_id") ? "employee_id" : null),
    is_active: cols.has("is_active") ? "is_active" : null,
    employee_code: cols.has("employee_code") ? "employee_code"
                 : (cols.has("code") ? "code"
                 : (cols.has("emp_code") ? "emp_code" : null)),
    full_name: cols.has("full_name") ? "full_name" : null,
    first_name: cols.has("first_name") ? "first_name" : (cols.has("firstname") ? "firstname" : null),
    last_name: cols.has("last_name") ? "last_name" : (cols.has("lastname") ? "lastname" : null),
  };

  if (!map.id) throw new Error('employees table must have "id" or "employee_id".');

  EMP_COLS_CACHE = { cols, map };
  return EMP_COLS_CACHE;
}

async function detectProjectColumns() {
  if (PROJ_COLS_CACHE) return PROJ_COLS_CACHE;

  const { rows } = await pool.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='projects'
    ORDER BY ordinal_position
  `);

  const cols = new Set(rows.map(r => r.column_name));

  const map = {
    id: cols.has("id") ? "id" : (cols.has("project_id") ? "project_id" : null),
    project_code: cols.has("project_code") ? "project_code"
                : (cols.has("code") ? "code"
                : (cols.has("proj_code") ? "proj_code" : null)),
    name: cols.has("name") ? "name"
       : (cols.has("project_name") ? "project_name" : null),
  };

  if (!map.id) throw new Error('projects table must have "id" or "project_id".');

  PROJ_COLS_CACHE = { cols, map };
  return PROJ_COLS_CACHE;
}

router.get("/", async (req, res) => {
  try {
    const { map: e } = await detectEmployeeColumns();
    const { map: p } = await detectProjectColumns();

    const employeeNameExpr = e.full_name
      ? `e.${e.full_name}`
      : `TRIM(COALESCE(e.${e.first_name || "NULL"}::text,'') || ' ' || COALESCE(e.${e.last_name || "NULL"}::text,''))`;

    const employeeCodeExpr = e.employee_code ? `e.${e.employee_code}` : "NULL";

    const projectCodeExpr = p.project_code ? `p.${p.project_code}` : "NULL";
    const projectNameExpr = p.name ? `p.${p.name}` : "NULL";

const date = (req.query.date || "").trim();
    const hasDate = /^\d{4}-\d{2}-\d{2}$/.test(date);

    const companyId = getCompanyId(req);
    if (companyId === null) {
      return res.status(400).json({ ok: false, error: 'company_id_missing' });
    }

    const params = [companyId];
    let where = `WHERE a.company_id = $1 AND e.company_id = $1 AND p.company_id = $1`;

    if (hasDate) {
      params.push(date);
      where += ` AND a.start_date <= $${params.length} AND (a.end_date IS NULL OR a.end_date >= $${params.length})`;
    }

    const sql = `
      SELECT
        a.id,
        a.employee_id,
        a.project_id,
        a.start_date,
        a.end_date,
        a.shift,
        ${employeeCodeExpr} AS employee_code,
        ${employeeNameExpr} AS employee_name,
        ${projectCodeExpr} AS project_code,
        ${projectNameExpr} AS project_name,
        p.site_address,
        p.site_lat,
        p.site_lng
      FROM public.assignments a
      LEFT JOIN public.employees e ON e.${e.id} = a.employee_id
      LEFT JOIN public.projects  p ON p.${p.id} = a.project_id
      ${where}
      ORDER BY a.start_date DESC, a.id DESC
      LIMIT 5000;
    `;


    const result = await pool.query(sql, params);
    return res.json({ ok: true, rows: result.rows });
  } catch (err) {
    console.error("GET /api/assignments_v2 error:", err);
    return res.status(500).json({ ok: false, error: "ASSIGNMENTS_V2_FAILED", message: err.message });
  }
});

// GET /api/assignments_v2/unassigned?date=YYYY-MM-DD
// Returns employees who have no assignment overlapping the given date (safe helper for Board UI)
router.get("/unassigned", async (req, res) => {
  try {
    const date = (req.query.date || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ ok: false, error: "BAD_DATE", message: "date must be YYYY-MM-DD" });
    }

    const e = await detectEmployeeColumns();
    if (!e || !e.id) {
      return res.status(500).json({ ok: false, error: "EMP_SCHEMA_UNSUPPORTED", message: "employees id column not detected" });
    }

    const employeeCodeExpr = e.employee_code ? `e.${e.employee_code}` : "NULL";
    const employeeNameExpr = e.full_name
      ? `e.${e.full_name}`
      : `TRIM(COALESCE(e.${e.first_name || "NULL"}::text,'') || ' ' || COALESCE(e.${e.last_name || "NULL"}::text,''))`;

    const activeClause = e.is_active ? `AND COALESCE(e.${e.is_active}, true) = true` : ``;
    const companyId = getCompanyId(req);
    if (companyId === null) {
      return res.status(400).json({ ok: false, error: 'company_id_missing' });
    }


    const sql = `
      SELECT
        e.${e.id} AS employee_id,
        ${employeeCodeExpr} AS employee_code,
        ${employeeNameExpr} AS employee_name
      FROM public.employees e
      WHERE 1=1
        ${activeClause}
        AND e.company_id = $2
        AND NOT EXISTS (
          SELECT 1
          FROM public.assignments a
          WHERE a.employee_id = e.${e.id}
            AND a.company_id = $2
            AND a.start_date <= $1
            AND (a.end_date IS NULL OR a.end_date >= $1)
        )
      ORDER BY ${employeeNameExpr} ASC NULLS LAST
      LIMIT 5000;
    `;

    const result = await pool.query(sql, [date, companyId]);
    return res.json({ ok: true, rows: result.rows });
  } catch (err) {
    console.error("GET /api/assignments_v2/unassigned error:", err);
    return res.status(500).json({ ok: false, error: "UNASSIGNED_FAILED", message: err.message });
  }
});


// ---- Enriched Requests (for Dispatch UI) ----
// GET /api/assignments_v2/requests?date=YYYY-MM-DD[&project_id=...]
router.get("/requests", async (req, res) => {
  try {
    if (!req.user || req.user.role !== "ADMIN") {
      return res.status(403).json({ ok: false, error: "Forbidden" });
    }

    const { map: e } = await detectEmployeeColumns();
    const { map: p } = await detectProjectColumns();

    const employeeNameExpr = e.full_name
      ? `e.${e.full_name}`
      : `TRIM(COALESCE(e.${e.first_name || "NULL"}::text,'') || ' ' || COALESCE(e.${e.last_name || "NULL"}::text,''))`;

    const projectNameExpr = p.name ? `p.${p.name}` : "NULL";

    const date = (req.query.date || "").trim();
    const projectId = (req.query.project_id || "").trim();

    const where = [];
    const params = [];
    const companyId = getCompanyId(req);

    // keep only active-ish requests for dispatch planning
    where.push(`ar.status NOT IN ('REJECTED','CANCELED')`);

    if (companyId !== null) {
      params.push(companyId);
      where.push(`ar.company_id = $${params.length}::bigint`);
    }

    if (date) {
      params.push(date);
      // overlap: date between start_date and end_date, handling nulls
      where.push(`$${params.length}::date BETWEEN COALESCE(ar.start_date, $${params.length}::date) AND COALESCE(ar.end_date, $${params.length}::date)`);
    }

    if (projectId) {
      params.push(projectId);
      where.push(`ar.project_id = $${params.length}::bigint`);
    }

    const sql = `
      SELECT
        ar.id,
        ar.request_type,
        ar.status,
        ar.project_id,
        ar.requested_for_employee_id AS employee_id,
        ar.start_date,
        ar.end_date,
        ar.payload_json,
        ${employeeNameExpr} AS employee_name,
        ${projectNameExpr} AS project_name
      FROM public.assignment_requests ar
      JOIN public.employees e ON e.${e.id} = ar.requested_for_employee_id
      JOIN public.projects p ON p.${p.id} = ar.project_id
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY
        CASE ar.status WHEN 'PENDING' THEN 0 ELSE 1 END,
        ar.created_at DESC
      LIMIT 2000
    `;

    const { rows } = await pool.query(sql, params);

    return res.json({
      ok: true,
      items: rows.map(r => ({
        id: r.id,
        request_type: r.request_type,
        status: r.status,
        project_id: r.project_id,
        employee_id: r.employee_id,
        start_date: r.start_date,
        end_date: r.end_date,
        payload: r.payload_json || {},
        employee_name: r.employee_name,
        project_name: r.project_name
      }))
    });
  } catch (err) {
    console.error("GET /api/assignments_v2/requests error:", err);
    return res.status(500).json({ ok: false, error: "REQUESTS_FAILED", message: err.message });
  }
});

// POST /api/assignments_v2/requests/:id/cancel
router.post("/requests/:id/cancel", async (req, res) => {
  try {
    if (!req.user || req.user.role !== "ADMIN") {
      return res.status(403).json({ ok: false, error: "Forbidden" });
    }

    const id = req.params.id;
    const { rowCount } = await pool.query(
      `UPDATE public.assignment_requests
       SET status='CANCELED', updated_at=NOW()
       WHERE id=$1::bigint AND status='PENDING'
       `,
      [id]
    );

    if (!rowCount) {
      return res.status(400).json({ ok: false, error: "NOT_CANCELABLE", message: "Only PENDING requests can be canceled." });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("POST /api/assignments_v2/requests/:id/cancel error:", err);
    return res.status(500).json({ ok: false, error: "CANCEL_FAILED", message: err.message });
  }
});




// ============================================
// DIRECT DISPATCH API (Batch + Atomic + Strict)
// ============================================
router.post("/direct", authRequired, requireRole(["ADMIN"]), async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    if (companyId === null) {
      return res.status(400).json({ ok: false, error: "company_id_missing" });
    }

    const { employee_ids, project_id, start_date, end_date, shift } = req.body || {};

    if (!Array.isArray(employee_ids) || employee_ids.length === 0) {
      return res.status(400).json({ ok: false, error: "employee_ids_required" });
    }
    if (!project_id || !start_date) {
      return res.status(400).json({ ok: false, error: "project_id_and_start_date_required" });
    }

    // Default shift if not provided
    const shiftValue = (shift && String(shift).trim()) ? String(shift).trim() : "06:00-14:30";

    // Validate project belongs to this company
    const proj = await pool.query(
      `SELECT id, company_id FROM public.projects WHERE id = $1`,
      [project_id]
    );
    if (proj.rowCount === 0) {
      return res.status(404).json({ ok: false, error: "project_not_found" });
    }
    if (Number(proj.rows[0].company_id) !== Number(companyId)) {
      return res.status(403).json({ ok: false, error: "cross_company_project" });
    }

    // Validate employees belong to this company
    const emp = await pool.query(
      `SELECT id FROM public.employees WHERE id = ANY($1::int[]) AND company_id = $2`,
      [employee_ids, companyId]
    );
    if (emp.rowCount !== employee_ids.length) {
      return res.status(403).json({ ok: false, error: "cross_company_employee" });
    }

    // Check overlap within the same company (active date ranges)
    const overlap = await pool.query(
      `SELECT a.employee_id, a.project_id, a.start_date, a.end_date
         FROM public.assignments a
        WHERE a.company_id = $1
          AND a.employee_id = ANY($2::bigint[])
          AND a.start_date <= $3::date
          AND (a.end_date IS NULL OR a.end_date >= $3::date)`,
      [companyId, employee_ids, start_date]
    );
    if (overlap.rowCount > 0) {
      return res.status(409).json({ ok: false, error: "employee_already_assigned", conflicts: overlap.rows });
    }

    const inserted = [];
    for (const empId of employee_ids) {
      const r = await pool.query(
        `INSERT INTO public.assignments
          (employee_id, project_id, start_date, end_date, shift, created_by_user_id, company_id, created_at, updated_at)
         VALUES ($1, $2, $3::date, $4::date, $5, $6, $7, NOW(), NOW())
         RETURNING id`,
        [empId, project_id, start_date, end_date || null, shiftValue, req.user.user_id, companyId]
      );
      inserted.push({ assignment_id: r.rows[0].id, employee_id: empId });
    }

    return res.json({ ok: true, inserted });
  } catch (err) {
    console.error("assignments_v2/direct error", err);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});

router.put("/:id", authRequired, requireRole(["ADMIN"]), async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    if (companyId === null) {
      return res.status(400).json({ ok: false, error: "company_id_missing" });
    }

    const assignmentId = Number(req.params.id);
    if (!Number.isFinite(assignmentId) || assignmentId <= 0) {
      return res.status(400).json({ ok: false, error: "invalid_assignment_id" });
    }

    const { employee_id, project_id, start_date, end_date, shift } = req.body || {};

    const hasAnyField = [employee_id, project_id, start_date, end_date, shift].some((v) => v !== undefined);
    if (!hasAnyField) {
      return res.status(400).json({ ok: false, error: "no_fields_to_update" });
    }

    if (project_id !== undefined) {
      const proj = await pool.query(
        `SELECT id, company_id FROM public.projects WHERE id = $1`,
        [project_id]
      );
      if (proj.rowCount === 0) {
        return res.status(404).json({ ok: false, error: "project_not_found" });
      }
      if (Number(proj.rows[0].company_id) !== Number(companyId)) {
        return res.status(403).json({ ok: false, error: "cross_company_project" });
      }
    }

    if (employee_id !== undefined) {
      const emp = await pool.query(
        `SELECT id FROM public.employees WHERE id = $1 AND company_id = $2`,
        [employee_id, companyId]
      );
      if (emp.rowCount === 0) {
        return res.status(403).json({ ok: false, error: "cross_company_employee" });
      }
    }

    const result = await pool.query(
      `UPDATE public.assignments
          SET employee_id = COALESCE($1, employee_id),
              project_id = COALESCE($2, project_id),
              start_date = COALESCE($3::date, start_date),
              end_date = COALESCE($4::date, end_date),
              shift = COALESCE($5, shift),
              updated_at = NOW()
        WHERE id = $6
          AND company_id = $7
        RETURNING *`,
      [
        employee_id ?? null,
        project_id ?? null,
        start_date ?? null,
        end_date ?? null,
        shift ?? null,
        assignmentId,
        companyId,
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ ok: false, error: "assignment_not_found" });
    }

    return res.json({ ok: true, assignment: result.rows[0] });
  } catch (err) {
    console.error("assignments_v2/update error", err);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});

router.post("/cancel/:id", authRequired, requireRole(["ADMIN"]), async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    if (companyId === null) {
      return res.status(400).json({ ok: false, error: "company_id_missing" });
    }

    const assignmentId = req.params.id;
    const result = await pool.query(
      `UPDATE public.assignments
          SET end_date = CURRENT_DATE, updated_at = NOW()
        WHERE id = $1 AND company_id = $2
        RETURNING id`,
      [assignmentId, companyId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ ok: false, error: "assignment_not_found" });
    }

    return res.json({ ok: true, assignment_id: result.rows[0].id });
  } catch (err) {
    console.error("assignments_v2/cancel error", err);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});

module.exports = router;
