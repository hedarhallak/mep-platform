const express = require("express");
const router = express.Router();

const { pool } = require("../db");
// Token auth middleware (single source of truth): middleware/auth.js
// Note: auth_token.js does not exist in this codebase.
const auth = require("../middleware/auth");

function getCompanyId(req) {
  const v = req?.user?.company_id;
  if (v === undefined || v === null) return null;
  return Number(v);
}

async function assertEmployeeAndProjectInCompany({ employeeId, projectId, companyId }) {
  const emp = await pool.query(
    `SELECT id FROM public.employees WHERE id = $1 AND company_id = $2`,
    [employeeId, companyId]
  );
  if (emp.rowCount === 0) {
    const err = new Error("employee_not_in_company");
    err.code = "employee_not_in_company";
    throw err;
  }

  const proj = await pool.query(
    `SELECT id FROM public.projects WHERE id = $1 AND company_id = $2`,
    [projectId, companyId]
  );
  if (proj.rowCount === 0) {
    const err = new Error("project_not_in_company");
    err.code = "project_not_in_company";
    throw err;
  }
}

// All endpoints here require auth token
router.use(auth);

/**
 * Create assignment request (PENDING)
 * Body: requested_for_employee_id, project_id, start_date, end_date, shift
 *
 * Notes:
 * - assignment_requests table in this baseline does NOT have a physical "shift" column.
 * - We store request-time extra details inside payload_json.
 */
router.post("/", async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    if (companyId === null) {
      return res.status(400).json({ ok: false, error: "company_id_missing" });
    }

    const requestedByUserId = req.user.user_id;
    const role = req.user.role;

    if (role !== "ADMIN") {
      return res.status(403).json({ ok: false, error: "forbidden" });
    }

    const {
      requested_for_employee_id,
      project_id,
      start_date,
      end_date,
      shift,
    } = req.body || {};

    if (!requested_for_employee_id || !project_id || !start_date) {
      return res.status(400).json({ ok: false, error: "missing_fields" });
    }

    await assertEmployeeAndProjectInCompany({
      employeeId: requested_for_employee_id,
      projectId: project_id,
      companyId,
    });

    const shiftValue =
      shift && String(shift).trim() ? String(shift).trim() : "06:00-14:30";

    const payload = {
      shift: shiftValue,
    };

    const r = await pool.query(
      `INSERT INTO public.assignment_requests
        (
          request_type,
          status,
          requested_by_user_id,
          requested_for_employee_id,
          project_id,
          start_date,
          end_date,
          payload_json,
          company_id,
          created_at,
          updated_at
        )
       VALUES
        (
          'ASSIGNMENT',
          'PENDING',
          $1,
          $2,
          $3,
          $4::date,
          $5::date,
          $6::jsonb,
          $7,
          NOW(),
          NOW()
        )
       RETURNING id`,
      [
        requestedByUserId,
        requested_for_employee_id,
        project_id,
        start_date,
        end_date || null,
        JSON.stringify(payload),
        companyId,
      ]
    );

    return res.json({ ok: true, request_id: r.rows[0].id });
  } catch (err) {
    console.error("assignment_requests/create error", err);
    if (err.code === "employee_not_in_company" || err.code === "project_not_in_company") {
      return res.status(403).json({ ok: false, error: err.code });
    }
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});

/**
 * My requests (created by current user) - company scoped via joins
 */
router.get("/mine", async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    if (companyId === null) {
      return res.status(400).json({ ok: false, error: "company_id_missing" });
    }

    const requestedByUserId = req.user.user_id;

    const r = await pool.query(
      `SELECT
          ar.*,
          e.employee_code,
          e.first_name,
          e.last_name,
          p.project_code,
          p.project_name
       FROM public.assignment_requests ar
       JOIN public.employees e ON e.id = ar.requested_for_employee_id
       JOIN public.projects p ON p.id = ar.project_id
       WHERE ar.requested_by_user_id = $1
         AND ar.company_id = $2
         AND e.company_id = $2
         AND p.company_id = $2
       ORDER BY ar.created_at DESC`,
      [requestedByUserId, companyId]
    );

    return res.json({ ok: true, rows: r.rows });
  } catch (err) {
    console.error("assignment_requests/mine error", err);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});

/**
 * Admin inbox (pending) - company scoped via joins
 */
router.get("/inbox", async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    if (companyId === null) {
      return res.status(400).json({ ok: false, error: "company_id_missing" });
    }

    if (req.user.role !== "ADMIN") {
      return res.status(403).json({ ok: false, error: "forbidden" });
    }

    const r = await pool.query(
      `SELECT
          ar.*,
          e.employee_code,
          e.first_name,
          e.last_name,
          p.project_code,
          p.project_name
       FROM public.assignment_requests ar
       JOIN public.employees e ON e.id = ar.requested_for_employee_id
       JOIN public.projects p ON p.id = ar.project_id
       WHERE ar.status = 'PENDING'
         AND ar.company_id = $1
         AND e.company_id = $1
         AND p.company_id = $1
       ORDER BY ar.created_at DESC`,
      [companyId]
    );

    return res.json({ ok: true, rows: r.rows });
  } catch (err) {
    console.error("assignment_requests/inbox error", err);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});

/**
 * Admin decision: approve/reject
 * Body: decision = 'APPROVE' | 'REJECT'
 */
router.post("/:id/decision", async (req, res) => {
  const client = await pool.connect();
  try {
    const companyId = getCompanyId(req);
    if (companyId === null) {
      return res.status(400).json({ ok: false, error: "company_id_missing" });
    }

    if (req.user.role !== "ADMIN") {
      return res.status(403).json({ ok: false, error: "forbidden" });
    }

    const requestId = Number(req.params.id);
    const decision = String(req.body?.decision || "").toUpperCase();

    if (!requestId || (decision !== "APPROVE" && decision !== "REJECT")) {
      return res.status(400).json({ ok: false, error: "invalid_request" });
    }

    await client.query("BEGIN");

    // Lock request row and validate it is in this company via joins
    const reqRow = await client.query(
      `SELECT
          ar.*,
          e.company_id AS employee_company_id,
          p.company_id AS project_company_id
       FROM public.assignment_requests ar
       JOIN public.employees e ON e.id = ar.requested_for_employee_id
       JOIN public.projects p ON p.id = ar.project_id
       WHERE ar.id = $1
       FOR UPDATE`,
      [requestId]
    );

    if (reqRow.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ ok: false, error: "not_found" });
    }

    const ar = reqRow.rows[0];

    if (
      Number(ar.company_id) !== Number(companyId) ||
      Number(ar.employee_company_id) !== Number(companyId) ||
      Number(ar.project_company_id) !== Number(companyId)
    ) {
      await client.query("ROLLBACK");
      return res.status(403).json({ ok: false, error: "cross_company_request" });
    }

    if (ar.status !== "PENDING") {
      await client.query("ROLLBACK");
      return res.status(409).json({ ok: false, error: "already_decided" });
    }

    const requestedShift =
      ar?.payload_json && typeof ar.payload_json === "object"
        ? String(ar.payload_json.shift || "").trim()
        : "";

    const shiftValue = requestedShift || "06:00-14:30";

    if (decision === "APPROVE") {
      // overlap check (company scoped)
      const overlap = await client.query(
        `SELECT id
           FROM public.assignments a
          WHERE a.company_id = $1
            AND a.employee_id = $2
            AND a.start_date <= $3::date
            AND (a.end_date IS NULL OR a.end_date >= $3::date)
          LIMIT 1`,
        [companyId, ar.requested_for_employee_id, ar.start_date]
      );
      if (overlap.rowCount > 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({ ok: false, error: "employee_already_assigned" });
      }

      const ins = await client.query(
        `INSERT INTO public.assignments
          (employee_id, project_id, start_date, end_date, shift, created_by_user_id, company_id, source_request_id, created_at, updated_at)
         VALUES ($1, $2, $3::date, $4::date, $5, $6, $7, $8, NOW(), NOW())
         RETURNING id`,
        [
          ar.requested_for_employee_id,
          ar.project_id,
          ar.start_date,
          ar.end_date,
          shiftValue,
          req.user.user_id,
          companyId,
          ar.id,
        ]
      );

      await client.query(
        `UPDATE public.assignment_requests
            SET status = 'APPROVED',
                decision_by_user_id = $2,
                decision_at = NOW(),
                updated_at = NOW()
          WHERE id = $1`,
        [ar.id, req.user.user_id]
      );

      await client.query("COMMIT");
      return res.json({ ok: true, status: "APPROVED", assignment_id: ins.rows[0].id });
    }

    // REJECT
    await client.query(
      `UPDATE public.assignment_requests
          SET status = 'REJECTED',
              decision_by_user_id = $2,
              decision_at = NOW(),
              updated_at = NOW()
        WHERE id = $1`,
      [ar.id, req.user.user_id]
    );

    await client.query("COMMIT");
    return res.json({ ok: true, status: "REJECTED" });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("assignment_requests/decision error", err);
    return res.status(500).json({ ok: false, error: "server_error" });
  } finally {
    client.release();
  }
});

module.exports = router;
