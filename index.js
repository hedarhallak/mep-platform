// index.js
"use strict";

require("dotenv").config();
const express = require("express");
const path    = require("path");
const helmet  = require("helmet");
const rateLimit = require("express-rate-limit");
const { pool } = require("./db");
const app = express();

// --- Trust the first reverse proxy (Nginx) ---
// Required so req.ip and rate-limit key generation use the real client IP
// from X-Forwarded-For instead of Nginx's loopback address.
app.set('trust proxy', 1);

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
      objectSrc:      ["'self'"],
      imgSrc:         ["'self'", "data:", "blob:", "https://api.mapbox.com"],
      workerSrc:      ["'self'", "blob:"],
    },
  },
}));

// --- Body parsing ---
app.use(express.json());

// --- Rate limiting ---
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "TOO_MANY_REQUESTS", message: "Too many attempts, please try again later." },
});

// Refresh endpoint — moderate limit to prevent token brute-force
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "TOO_MANY_REQUESTS" },
});

// PIN change — strict (prevents stolen-token PIN reset abuse)
const changePinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "TOO_MANY_REQUESTS" },
});

// Public onboarding / activation — strict (prevents invite-token brute-force)
const onboardingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "TOO_MANY_REQUESTS" },
});

// SUPER_ADMIN endpoints — moderate (defense in depth even though SA is auth-gated)
const superAdminLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "TOO_MANY_REQUESTS" },
});

app.use("/api/auth/login",      authLimiter);
app.use("/api/auth/signup",     authLimiter);
app.use("/api/auth/refresh",    refreshLimiter);
app.use("/api/auth/change-pin", changePinLimiter);
app.use("/api/onboarding",      onboardingLimiter);
app.use("/activate",            onboardingLimiter);
app.use("/api/super",           superAdminLimiter);

function loadRouter(modPath) {
  const mod = require(modPath);
  if (typeof mod === "function") return mod;
  if (mod && typeof mod.router   === "function") return mod.router;
  if (mod && typeof mod.default  === "function") return mod.default;
  throw new Error(`Route module "${modPath}" did not export an Express router function.`);
}

const auth       = require("./middleware/auth");
const superAdmin = require("./middleware/super_admin");
if (typeof auth !== "function") {
  throw new Error(`"./middleware/auth" must export a middleware function, got ${typeof auth}`);
}

// ── Public endpoints ──────────────────────────────────────────

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
    ok:           true,
    mapbox_token: process.env.MAPBOX_ACCESS_TOKEN || null,
  });
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "mep-site-workforce", time: new Date().toISOString() });
});

// ── Auth (public) ─────────────────────────────────────────────
app.use("/api/auth",       loadRouter("./routes/auth"));
app.use("/api/onboarding", require("./routes/onboarding")); // public — no auth
app.use("/activate",       loadRouter("./routes/activate")); // public — activation link

// ── Super admin ───────────────────────────────────────────────
app.use("/api/super",           auth, superAdmin, loadRouter("./routes/super_admin"));
app.use("/api/super/ccq-rates", auth, superAdmin, require("./routes/ccq_rates"));

// ── Core business routes ──────────────────────────────────────
app.use("/api/employees",       auth, loadRouter("./routes/employees"));
app.use("/api/projects",        auth, loadRouter("./routes/projects"));
app.use("/api/suppliers",       auth, require("./routes/suppliers"));
app.use("/api/assignments",     auth, loadRouter("./routes/assignments"));
app.use("/api/assignments",     auth, require("./routes/auto_assign"));
app.use("/api/attendance",      auth, loadRouter("./routes/attendance"));
app.use("/api/profile",         auth, loadRouter("./routes/profile"));
app.use("/api/profile",         auth, require("./routes/push_tokens_route"));

// ── Project structure ─────────────────────────────────────────
app.use("/api/project-trades",  auth, require("./routes/project_trades"));
app.use("/api/project-foremen", auth, require("./routes/project_foremen"));

// ── Materials & Purchase Orders ───────────────────────────────
app.use("/api/materials", auth, loadRouter("./routes/materials"));
app.use("/api/materials", auth, require("./routes/material_requests"));

// ── Business Intelligence ─────────────────────────────────────
app.use("/api/bi",      auth, require("./routes/bi"));
app.use("/api/reports", auth, loadRouter("./routes/reports"));

// ── Daily operations ──────────────────────────────────────────
app.use("/api/daily-dispatch", auth, loadRouter("./routes/daily_dispatch"));

// ── User & invite management ──────────────────────────────────
app.use("/api/invite-employee",  auth, require("./routes/invite_employee"));

app.use("/api/user-invites",     auth, loadRouter("./routes/user_invites"));
app.use("/api/admin/users",      auth, loadRouter("./routes/admin_users"));

// ── RBAC Permissions ──────────────────────────────────────────
app.use("/api/users",       auth, require("./routes/user_management"));
app.use("/api/permissions", auth, require("./routes/permissions"));

// ── Hub (Tasks & Blueprints) ──────────────────────────────────
app.use("/api/hub",       auth, require("./routes/hub"));

// ── Daily Standup ─────────────────────────────────────────────
app.use("/api/standup",   auth, require("./routes/standup"));
app.use("/uploads/hub",   require("express").static(path.join(__dirname, "uploads/hub")));

// ── Start ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Health: http://localhost:${PORT}/api/health`);

  // Weekly employee report job (every Monday 18:00 Quebec time)
  require("./jobs/weeklyReportJob")(pool);

  // Monthly CCQ travel rates expiry reminder (1st of month, 09:00 Quebec)
  require("./jobs/ccqRatesReminderJob")(pool);
});
