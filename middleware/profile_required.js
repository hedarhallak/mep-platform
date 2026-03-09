// middleware/profile_required.js
"use strict";

const db = require("../db");
const pool = db && db.pool ? db.pool : db;

// Phase 5: Profile Completion (SAFE)
// Blocks protected modules until employee profile is completed.
// ADMIN bypass (keeps admin tools usable even if profile not filled yet).
module.exports = async function requireProfile(req, res, next) {
  try {
    const role = req.user?.role || req.user?.role_code || null;
    if (role === "ADMIN") return next();

    const employeeId = req.user?.employee_id || req.user?.employeeId || null;
    if (!employeeId) return res.status(401).json({ ok: false, error: "MISSING_EMPLOYEE_ID" });

    const r = await pool.query(
      "SELECT 1 FROM public.employee_profiles WHERE employee_id = $1 LIMIT 1",
      [employeeId]
    );
    if (r.rowCount === 0) return res.status(412).json({ ok: false, error: "PROFILE_INCOMPLETE" });

    return next();
  } catch (e) {
    console.error("[requireProfile]", e);
    return res.status(500).json({ ok: false, error: "PROFILE_CHECK_FAILED" });
  }
};
