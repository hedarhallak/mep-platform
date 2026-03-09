// index.js
"use strict";

require("dotenv").config();
const express = require("express");
const path = require("path");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { pool } = require("./db");
const borrowRequestsRouter = require("./routes/borrow_requests");
const app = express();

// --- Security headers ---
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:     ["'self'"],
      scriptSrc:      ["'self'", "'unsafe-inline'", "https://api.mapbox.com"],
      scriptSrcAttr:  ["'unsafe-inline'"],
      styleSrc:       ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://api.mapbox.com"],
      fontSrc:        ["'self'", "https://fonts.gstatic.com"],
      connectSrc:     ["'self'", "https://api.mapbox.com", "https://events.mapbox.com"],
      imgSrc:         ["'self'", "data:", "blob:", "https://api.mapbox.com"],
      workerSrc:      ["'self'", "blob:"],
    },
  },
}));

// --- Body parsing ---
app.use(express.json());

// --- Rate limiting on auth endpoints ---
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,                   // max 20 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "TOO_MANY_REQUESTS", message: "Too many attempts, please try again later." },
});
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/signup", authLimiter);

function loadRouter(modPath) {
  const mod = require(modPath);
  if (typeof mod === "function") return mod;
  if (mod && typeof mod.router === "function") return mod.router;
  if (mod && typeof mod.default === "function") return mod.default;
  throw new Error(`Route module "${modPath}" did not export an Express router function.`);
}

const auth = require("./middleware/auth");
const superAdmin = require("./middleware/super_admin");
if (typeof auth !== "function") {
  throw new Error(`"./middleware/auth" must export a middleware function, got ${typeof auth}`);
}

// Public config endpoint — exposes only safe public keys
// Geocode suggest — proxies Mapbox to avoid CSP issues
app.get("/api/geocode/suggest", async (req, res) => {
  try {
    const q     = String(req.query.q || "").trim();
    const token = process.env.MAPBOX_ACCESS_TOKEN;
    if (!q || q.length < 3) return res.json({ ok: true, features: [] });
    if (!token) return res.json({ ok: false, error: "MAPBOX_NOT_CONFIGURED" });

    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json`
      + `?access_token=${encodeURIComponent(token)}&country=ca&language=en&types=address&limit=5`;

    const r    = await fetch(url);
    const data = await r.json();

    return res.json({ ok: true, features: data.features || [] });
  } catch (err) {
    console.error("geocode/suggest error:", err.message);
    return res.status(500).json({ ok: false, error: "GEOCODE_ERROR" });
  }
});

app.get("/api/config", (req, res) => {
  return res.json({
    ok:            true,
    mapbox_token:  process.env.MAPBOX_ACCESS_TOKEN || null,
  });
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "mep-site-workforce", time: new Date().toISOString() });
});

// --- Routes (existing) ---
app.use("/api/auth", loadRouter("./routes/auth"));
app.use("/api/super", auth, superAdmin, loadRouter("./routes/super_admin"));
app.use("/api/attendance", auth, loadRouter("./routes/attendance"));
app.use("/api/assignments", auth, loadRouter("./routes/assignments"));
app.use("/api/projects", auth, loadRouter("./routes/projects"));
app.use("/api/profile", auth, loadRouter("./routes/profile"));
app.use("/api/reports", auth, loadRouter("./routes/reports"));
app.use("/api/borrow_requests", auth, borrowRequestsRouter);
app.use("/api/materials", auth, loadRouter("./routes/materials"));
app.use("/api", auth, loadRouter("./routes/parking"));

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

// --- Daily Dispatch (E2: prepare snapshot, no email) ---
app.use("/api/daily-dispatch", auth, requireRoles(["ADMIN"]), loadRouter("./routes/daily_dispatch"));

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

    // Legacy columns that may exist on employees (keep for fallback reads)
    email: cols.has("email") ? "email" : null,
    home_lat: cols.has("home_lat") ? "home_lat" : null,
    home_lng: cols.has("home_lng") ? "home_lng" : null,
    company_id: cols.has("company_id") ? "company_id" : null,
  };

  if (!map.id) {
    throw new Error('employees table must have "id" or "employee_id".');
  }

  EMP_COLS_CACHE = { cols, map };
  return EMP_COLS_CACHE;
}

let EMP_PROF_COLS_CACHE = null;

async function detectEmployeeProfileColumns() {
  if (EMP_PROF_COLS_CACHE) return EMP_PROF_COLS_CACHE;

  const { rows } = await pool.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='employee_profiles'
    ORDER BY ordinal_position
  `);

  const cols = new Set(rows.map(r => r.column_name));

  const map = {
    employee_id: cols.has("employee_id") ? "employee_id" : null,
    full_name: cols.has("full_name") ? "full_name" : null,
    phone: cols.has("phone") ? "phone" : null,
    phone_digits: cols.has("phone_digits") ? "phone_digits" : null,
    contact_email: cols.has("contact_email") ? "contact_email" : null,
    home_address: cols.has("home_address") ? "home_address" : null,
    city: cols.has("city") ? "city" : null,
    postal_code: cols.has("postal_code") ? "postal_code" : null,
    province: cols.has("province") ? "province" : null,
    country: cols.has("country") ? "country" : null,
    home_location: cols.has("home_location") ? "home_location" : null,
  };

  EMP_PROF_COLS_CACHE = { cols, map };
  return EMP_PROF_COLS_CACHE;
}

app.get("/api/employees", auth, requireRoles(["ADMIN", "PM", "FOREMAN"]), async (req, res) => {
  try {
    const { map } = await detectEmployeeColumns();
    const { map: profMap } = await detectEmployeeProfileColumns();

    const q = (req.query.q || "").toString().trim();
    const activeOnly = (req.query.active_only || "").toString() === "1";

    const selectParts = [];
    selectParts.push(`e.${map.id} AS id`);
    if (map.employee_code) selectParts.push(`e.${map.employee_code} AS employee_code`);
    if (map.first_name) selectParts.push(`e.${map.first_name} AS first_name`);
    if (map.last_name) selectParts.push(`e.${map.last_name} AS last_name`);
    if (map.full_name) selectParts.push(`e.${map.full_name} AS full_name`);
    if (map.role) selectParts.push(`e.${map.role} AS role`);
    if (map.is_active) selectParts.push(`e.${map.is_active} AS is_active`);
    if (map.company_id) selectParts.push(`e.${map.company_id} AS company_id`);
    if (map.email) selectParts.push(`e.${map.email} AS email`);
    if (map.home_lat) selectParts.push(`e.${map.home_lat} AS home_lat`);
    if (map.home_lng) selectParts.push(`e.${map.home_lng} AS home_lng`);

    // Optional profile fields (SoT reads) - added safely via column detection
    if (profMap.phone)         selectParts.push(`p.${profMap.phone} AS p_phone`);
    if (profMap.phone_digits)  selectParts.push(`p.${profMap.phone_digits} AS p_phone_digits`);
    if (profMap.contact_email) selectParts.push(`p.${profMap.contact_email} AS p_contact_email`);
    if (profMap.home_address)  selectParts.push(`p.${profMap.home_address} AS p_home_address`);
    if (profMap.city)          selectParts.push(`p.${profMap.city} AS p_city`);
    if (profMap.postal_code)   selectParts.push(`p.${profMap.postal_code} AS p_postal_code`);
    if (profMap.province)      selectParts.push(`p.${profMap.province} AS p_province`);
    if (profMap.country)       selectParts.push(`p.${profMap.country} AS p_country`);
    if (profMap.home_location) selectParts.push(`p.${profMap.home_location} AS p_home_location`);

    const where = [];
    const params = [];

    const companyId = (req.user && (req.user.company_id !== undefined)) ? req.user.company_id : null;
    if (companyId === null) {
      return res.status(403).json({ ok: false, error: "COMPANY_CONTEXT_REQUIRED" });
    }
    if (map.company_id) {
      params.push(companyId);
      where.push(`e.${map.company_id} = $${params.length}`);
    } else {
      return res.status(500).json({ ok: false, error: "EMPLOYEES_COMPANY_COLUMN_MISSING" });
    }

    if (activeOnly && map.is_active) {
      where.push(`e.${map.is_active} = true`);
    }

    if (q) {
      const like = `%${q}%`;
      const ors = [];
      if (map.employee_code) { params.push(like); ors.push(`e.${map.employee_code} ILIKE $${params.length}`); }
      if (map.full_name)     { params.push(like); ors.push(`e.${map.full_name} ILIKE $${params.length}`); }
      if (map.first_name)    { params.push(like); ors.push(`e.${map.first_name} ILIKE $${params.length}`); }
      if (map.last_name)     { params.push(like); ors.push(`e.${map.last_name} ILIKE $${params.length}`); }
      if (ors.length) where.push(`(${ors.join(" OR ")})`);
    }

    const sql = `
      SELECT ${selectParts.join(", ")}
      FROM public.employees e
      LEFT JOIN public.employee_profiles p ON p.employee_id = e.id
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
        is_active: (typeof r.is_active === "boolean") ? r.is_active : null,

        // Phase 1: normalized SoT payload (additive, does not remove existing fields)
        sot: {
          id: r.id,
          employee_code: r.employee_code || null,
          first_name: r.first_name || null,
          last_name: r.last_name || null,
          is_active: (typeof r.is_active === "boolean") ? r.is_active : null,
          company_id: r.company_id ?? null,
          contact: {
            phone: r.p_phone ?? null,
            contact_email: (r.p_contact_email ?? r.email ?? null),
          },
          home: {
            address: r.p_home_address ?? null,
            city: r.p_city ?? null,
            postal_code: r.p_postal_code ?? null,
            province: r.p_province ?? null,
            country: r.p_country ?? null,
            location_point: r.p_home_location ?? null,
          },
          legacy: {
            employees_email: r.email ?? null,
            home_lat: r.home_lat ?? null,
            home_lng: r.home_lng ?? null,
          }
        }
      };
    });

    return res.json({ ok: true, rows: normalized });
  } catch (err) {
    console.error("GET /api/employees error:", err);
    return res.status(500).json({ ok: false, error: "EMPLOYEES_FAILED", message: err.message });
  }
});
// --- NEW: Create Employee (ADMIN only) ---
app.post("/api/employees", auth, requireRoles(["ADMIN"]), async (req, res) => {
  try {
    const body = req.body || {};

    const employee_code = (body.employee_code || "").toString().trim() || null;
    const first_name = (body.first_name || "").toString().trim();
    const last_name = (body.last_name || "").toString().trim();
    const email = (body.email || "").toString().trim().toLowerCase();

    // Optional fields (only if provided)
    // company_id دائماً من الـ token — لا يُقبل من الـ body
    const company_id = req.user?.company_id ? Number(req.user.company_id) : null;
    if (!company_id) {
      return res.status(403).json({ ok: false, error: "COMPANY_CONTEXT_REQUIRED" });
    }
    const home_lat = (body.home_lat === null || body.home_lat === undefined || body.home_lat === "") ? null : Number(body.home_lat);
    const home_lng = (body.home_lng === null || body.home_lng === undefined || body.home_lng === "") ? null : Number(body.home_lng);
    const is_active = (body.is_active === undefined || body.is_active === null) ? true : Boolean(body.is_active);

    if (!first_name || !last_name) {
      return res.status(400).json({ ok: false, error: "FIRST_LAST_REQUIRED" });
    }
    if (!email || !email.includes("@")) {
      return res.status(400).json({ ok: false, error: "EMAIL_REQUIRED" });
    }

    // Prevent duplicates by email
    const existing = await pool.query(
      "SELECT id, employee_code, first_name, last_name, email, is_active FROM public.employees WHERE email = $1 LIMIT 1",
      [email]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ ok: false, error: "EMPLOYEE_EMAIL_EXISTS", employee: existing.rows[0] });
    }

    const ins = await pool.query(
      `INSERT INTO public.employees
        (employee_code, first_name, last_name, is_active, company_id, home_lat, home_lng, email)
       VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, employee_code, first_name, last_name, is_active, company_id, home_lat, home_lng, email, created_at`,
      [employee_code, first_name, last_name, is_active, company_id, home_lat, home_lng, email]
    );

    return res.json({ ok: true, employee: ins.rows[0] });
  } catch (err) {
    console.error("POST /api/employees error:", err);
    return res.status(500).json({ ok: false, error: "EMPLOYEE_CREATE_FAILED", message: err.message });
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

// --- Admin Users (Create user + send activation invite) (ADMIN only) ---
app.use(
  "/api/admin/users",
  auth,
  requireRoles(["ADMIN"]),
  loadRouter("./routes/admin_users")
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