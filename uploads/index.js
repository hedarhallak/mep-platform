// index.js (REPLACEMENT: add /api/assignments_v2 without touching existing /api/assignments)
"use strict";

require("dotenv").config();
const express = require("express");
const path = require("path");
const { pool } = require("./db");
const borrowRequestsRouter = require("./routes/borrow_requests");
const app = express();
app.use(express.json());

function loadRouter(modPath) {
  const mod = require(modPath);
  if (typeof mod === "function") return mod;
  if (mod && typeof mod.router === "function") return mod.router;
  if (mod && typeof mod.default === "function") return mod.default;
  throw new Error(`Route module "${modPath}" did not export an Express router function.`);
}

const auth = require("./middleware/auth");
if (typeof auth !== "function") {
  throw new Error(`"./middleware/auth" must export a middleware function, got ${typeof auth}`);
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "mep-site-workforce", time: new Date().toISOString() });
});

// --- Routes (existing) ---
app.use("/api/auth", loadRouter("./routes/auth"));
app.use("/api/attendance", auth, loadRouter("./routes/attendance"));
app.use("/api/assignments", auth, loadRouter("./routes/assignments")); // legacy
app.use("/api/projects", auth, loadRouter("./routes/projects"));
app.use("/api/profile", auth, loadRouter("./routes/profile"));
app.use("/api/reports", loadRouter("./routes/reports"));
app.use("/api/borrow_requests", auth, borrowRequestsRouter);

// --- NEW: Assignments V2 read endpoint (from new public.assignments table) ---
app.use("/api/assignments_v2", auth, loadRouter("./routes/assignments_v2"));

// --- Assignment Requests (Inbox) ---
app.use("/api/assignment-requests", auth, loadRouter("./routes/assignment_requests"));

// --- Employees endpoint (ONE FILE: index.js) ---
function requireRoles(allowed) {
  return (req, res, next) => {
    const role = String(req.user?.role || "").toUpperCase();
    if (!allowed.includes(role)) {
      return res.status(403).json({ ok: false, error: "Forbidden" });
    }
    next();
  };
}

let EMP_COLS_CACHE = null;

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
    employee_code: cols.has("employee_code") ? "employee_code"
                 : (cols.has("code") ? "code"
                 : (cols.has("emp_code") ? "emp_code" : null)),
    first_name: cols.has("first_name") ? "first_name"
              : (cols.has("firstname") ? "firstname" : null),
    last_name: cols.has("last_name") ? "last_name"
             : (cols.has("lastname") ? "lastname" : null),
    full_name: cols.has("full_name") ? "full_name" : null,
    role: cols.has("role") ? "role"
        : (cols.has("trade_role") ? "trade_role" : null),
    is_active: cols.has("is_active") ? "is_active"
             : (cols.has("active") ? "active" : null),
  };

  if (!map.id) {
    throw new Error('employees table must have "id" or "employee_id".');
  }

  EMP_COLS_CACHE = { cols, map };
  return EMP_COLS_CACHE;
}

app.get("/api/employees", auth, requireRoles(["ADMIN", "PM", "FOREMAN"]), async (req, res) => {
  try {
    const { map } = await detectEmployeeColumns();

    const q = (req.query.q || "").toString().trim();
    const activeOnly = (req.query.active_only || "").toString() === "1";

    const selectParts = [];
    selectParts.push(`${map.id} AS id`);
    if (map.employee_code) selectParts.push(`${map.employee_code} AS employee_code`);
    if (map.first_name) selectParts.push(`${map.first_name} AS first_name`);
    if (map.last_name) selectParts.push(`${map.last_name} AS last_name`);
    if (map.full_name) selectParts.push(`${map.full_name} AS full_name`);
    if (map.role) selectParts.push(`${map.role} AS role`);
    if (map.is_active) selectParts.push(`${map.is_active} AS is_active`);

    const where = [];
    const params = [];

    if (activeOnly && map.is_active) {
      where.push(`${map.is_active} = true`);
    }

    if (q) {
      const like = `%${q}%`;
      const ors = [];
      if (map.employee_code) { params.push(like); ors.push(`${map.employee_code} ILIKE $${params.length}`); }
      if (map.full_name)     { params.push(like); ors.push(`${map.full_name} ILIKE $${params.length}`); }
      if (map.first_name)    { params.push(like); ors.push(`${map.first_name} ILIKE $${params.length}`); }
      if (map.last_name)     { params.push(like); ors.push(`${map.last_name} ILIKE $${params.length}`); }
      if (ors.length) where.push(`(${ors.join(" OR ")})`);
    }

    const sql = `
      SELECT ${selectParts.join(", ")}
      FROM public.employees
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY ${map.employee_code ? "employee_code" : "id"}
      LIMIT 1000
    `;

    const result = await pool.query(sql, params);

    const normalized = result.rows.map(r => {
      const fn = (r.first_name || "").toString().trim();
      const ln = (r.last_name || "").toString().trim();
      const computed = (fn || ln) ? `${fn} ${ln}`.trim() : null;

      return {
        id: r.id,
        employee_code: r.employee_code || null,
        first_name: r.first_name || null,
        last_name: r.last_name || null,
        full_name: r.full_name || computed,
        role: r.role || null,
        is_active: (typeof r.is_active === "boolean") ? r.is_active : null
      };
    });

    return res.json({ ok: true, rows: normalized });
  } catch (err) {
    console.error("GET /api/employees error:", err);
    return res.status(500).json({ ok: false, error: "EMPLOYEES_FAILED", message: err.message });
  }
});


// --- Employee Invites (ADMIN only) ---
app.use(
  "/api/employee-invites",
  auth,
  requireRoles(["ADMIN"]),
  loadRouter("./routes/employee_invites")
);

// --- User Invites (Email Link Token) (ADMIN only) ---
app.use(
  "/api/user-invites",
  auth,
  requireRoles(["ADMIN"]),
  loadRouter("./routes/user_invites")
);

// --- Activation Page (Email Link Token) (public) ---
app.use("/activate", loadRouter("./routes/activate"));

// Static
app.use("/", express.static(path.join(__dirname, "public")));

// Start
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Health: http://localhost:${PORT}/api/health`);
});