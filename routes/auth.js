"use strict";

const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const { pool } = require("../db");
const { JWT_SECRET, hashPin, verifyPin } = require("../lib/auth_utils");
const { audit, ACTIONS } = require("../lib/audit");

const JWT_EXPIRES_IN = "7d"; // Reduced from 30d for better security

// ===== Helpers =====
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

// Validate PIN: must be 4–8 characters
function isValidPin(pin, role) {
  const s = String(pin || "");
  if (role === "SUPER_ADMIN") return s.length >= 8 && s.length <= 32;
  return s.length >= 4 && s.length <= 8;
}

// ===================
// LOGIN (unchanged)
// ===================
router.post("/login", async (req, res) => {
  try {
    const { username, pin } = req.body || {};

    if (!username || !pin) {
      return res.status(400).json({ ok: false, error: "MISSING_FIELDS" });
    }

    const { rows } = await pool.query(
      `
      SELECT id, username, employee_id, company_id, role, is_active, pin_hash, must_change_pin
      FROM public.app_users
      WHERE username = $1
      LIMIT 1
      `,
      [username]
    );

    const user = rows[0];

    // Validate PIN format based on role
    const fetchedRole = user ? String(user.role || "").toUpperCase() : null;
    if (!isValidPin(pin, fetchedRole)) {
      return res.status(400).json({ ok: false, error: "INVALID_PIN_FORMAT" });
    }

    const pinOk = user ? await verifyPin(pin, user.pin_hash) : false;
    if (!user || !pinOk) {
      await audit(pool, req, {
        action:      ACTIONS.LOGIN_FAILED,
        entity_type: "user",
        entity_name: username,
        details:     { reason: "INVALID_CREDENTIALS" },
      });
      return res.status(401).json({ ok: false, error: "INVALID_CREDENTIALS" });
    }

    if (user.is_active === false) {
      return res.status(403).json({ ok: false, error: "USER_DISABLED" });
    }

    //     —       
    // SUPER_ADMIN      
    const userRole = user.role ? String(user.role).toUpperCase() : null;
    if (userRole !== "SUPER_ADMIN" && user.company_id) {
      const company = await pool.query(
        "SELECT status FROM public.companies WHERE company_id = $1 LIMIT 1",
        [user.company_id]
      );
      if (company.rows.length && company.rows[0].status === "SUSPENDED") {
        return res.status(403).json({ ok: false, error: "COMPANY_SUSPENDED", message: "Company account is suspended, contact support" });
      }
    }

    const role = user.role ? String(user.role).toUpperCase() : null;

    const mustChangePin = user.must_change_pin === true;

    const token = signToken({
      user_id: String(user.id),
      username: user.username,
      employee_id: user.employee_id ? String(user.employee_id) : null,
      company_id: user.company_id ? String(user.company_id) : null,
      role,
      must_change_pin: mustChangePin,
    });

    await audit(pool, req, {
      action:      ACTIONS.LOGIN_SUCCESS,
      entity_type: "user",
      entity_id:   user.id,
      entity_name: user.username,
      details:     { role },
    });

    return res.json({
      ok: true,
      token,
      must_change_pin: mustChangePin,
      user: {
        user_id: user.id,
        username: user.username,
        employee_id: user.employee_id,
        company_id: user.company_id,
        role,
        must_change_pin: mustChangePin,
      },
    });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

// ===================
// SIGN UP (Policy A)
// ===================
router.post("/signup", async (req, res) => {
  try {
    const { company_code, employee_code, username, pin } = req.body || {};

    if (!company_code || !employee_code || !username || !pin) {
      return res.status(400).json({ ok: false, error: "MISSING_FIELDS" });
    }

    if (!isValidPin(pin)) {
      return res.status(400).json({ ok: false, error: "INVALID_PIN_FORMAT", message: "PIN must be 4–8 characters." });
    }

    const companyCode = String(company_code).trim();
    const employeeCode = String(employee_code).trim();
    const uname = String(username).trim();

    // 1) Find company
    const c = await pool.query(
      `SELECT company_id FROM public.companies WHERE company_code = $1 LIMIT 1`,
      [companyCode]
    );
    if (!c.rows.length) {
      return res.status(400).json({ ok: false, error: "INVALID_COMPANY_CODE" });
    }
    const companyId = c.rows[0].company_id;

    // 2) Find employee
    const e = await pool.query(
      `
      SELECT id
      FROM public.employees
      WHERE company_id = $1
        AND employee_code ILIKE $2
      LIMIT 1
      `,
      [companyId, employeeCode]
    );
    if (!e.rows.length) {
      return res.status(400).json({ ok: false, error: "INVALID_EMPLOYEE_CODE" });
    }
    const employeeId = e.rows[0].id;

    // 3) Prevent duplicate registration
    const exists = await pool.query(
      `SELECT 1 FROM public.app_users WHERE employee_id = $1 LIMIT 1`,
      [employeeId]
    );
    if (exists.rows.length) {
      return res.status(409).json({ ok: false, error: "EMPLOYEE_ALREADY_REGISTERED" });
    }

    // 4) Username uniqueness
    const u = await pool.query(
      `SELECT 1 FROM public.app_users WHERE username = $1 LIMIT 1`,
      [uname]
    );
    if (u.rows.length) {
      return res.status(409).json({ ok: false, error: "USERNAME_TAKEN" });
    }

    // 5) Create user
    const pinHash = await hashPin(pin);

    const ins = await pool.query(
      `
      INSERT INTO public.app_users
        (username, pin_hash, employee_id, company_id, role, is_active)
      VALUES
        ($1, $2, $3, $4, 'WORKER', true)
      RETURNING id, username, employee_id, company_id, role
      `,
      [uname, pinHash, employeeId, companyId]
    );

    const newUser = ins.rows[0];
    const role = newUser.role ? String(newUser.role).toUpperCase() : null;

    const token = signToken({
      user_id: String(newUser.id),
      username: newUser.username,
      employee_id: String(newUser.employee_id),
      company_id: String(newUser.company_id),
      role,
    });

    return res.status(201).json({
      ok: true,
      token,
      user: {
        user_id: newUser.id,
        username: newUser.username,
        employee_id: newUser.employee_id,
        company_id: newUser.company_id,
        role,
      },
    });
  } catch (err) {
    console.error("SIGNUP ERROR:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});


// ===================
// SIGN UP (Invite Code)
// ===================
router.post("/signup-invite", async (req, res) => {
  try {
    const { invite_code, username, pin } = req.body || {};

    if (!invite_code || !username || !pin) {
      return res.status(400).json({ ok: false, error: "MISSING_FIELDS" });
    }

    if (!isValidPin(pin)) {
      return res.status(400).json({ ok: false, error: "INVALID_PIN_FORMAT", message: "PIN must be 4–8 characters." });
    }

    const code = String(invite_code).trim();
    const uname = String(username).trim();

    // 1) Load invite (must be ACTIVE, not used, not expired)
    const inv = await pool.query(
      `
      SELECT id, employee_id, status, expires_at, used_at
      FROM public.employee_invites
      WHERE invite_code = $1
      LIMIT 1
      `,
      [code]
    );

    if (!inv.rows.length) {
      return res.status(400).json({ ok: false, error: "INVALID_INVITE_CODE" });
    }

    const invite = inv.rows[0];

    if (invite.used_at) {
      return res.status(409).json({ ok: false, error: "INVITE_ALREADY_USED" });
    }

    const status = String(invite.status || "").toUpperCase();
    if (status !== "ACTIVE") {
      return res.status(400).json({ ok: false, error: "INVITE_NOT_ACTIVE" });
    }

    const exp = new Date(invite.expires_at).getTime();
    if (!Number.isFinite(exp) || exp <= Date.now()) {
      // Mark as expired for audit (best effort)
      await pool.query(
        `UPDATE public.employee_invites SET status='EXPIRED' WHERE id=$1 AND status='ACTIVE'`,
        [invite.id]
      );
      return res.status(400).json({ ok: false, error: "INVITE_EXPIRED" });
    }

    const employeeId = Number(invite.employee_id);

    // 2) Prevent duplicate registration by employee_id
    const exists = await pool.query(
      `SELECT 1 FROM public.app_users WHERE employee_id = $1 LIMIT 1`,
      [employeeId]
    );
    if (exists.rows.length) {
      return res.status(409).json({ ok: false, error: "EMPLOYEE_ALREADY_REGISTERED" });
    }

    // 3) Username uniqueness
    const u = await pool.query(
      `SELECT 1 FROM public.app_users WHERE username = $1 LIMIT 1`,
      [uname]
    );
    if (u.rows.length) {
      return res.status(409).json({ ok: false, error: "USERNAME_TAKEN" });
    }

    // 4) Load company_id from employees (must exist)
    const emp = await pool.query(
      `SELECT company_id FROM public.employees WHERE id = $1 LIMIT 1`,
      [employeeId]
    );
    if (!emp.rows.length || emp.rows[0].company_id == null) {
      return res.status(400).json({ ok: false, error: "EMPLOYEE_MISSING_COMPANY" });
    }
    const companyId = emp.rows[0].company_id;

    // 5) Create user
    const pinHash = await hashPin(pin);

    const ins = await pool.query(
      `
      INSERT INTO public.app_users
        (username, pin_hash, employee_id, company_id, role, is_active)
      VALUES
        ($1, $2, $3, $4, 'WORKER', true)
      RETURNING id, username, employee_id, company_id, role
      `,
      [uname, pinHash, employeeId, companyId]
    );

    const newUser = ins.rows[0];
    const role = newUser.role ? String(newUser.role).toUpperCase() : null;

    // 6) Mark invite as USED (best effort)
    await pool.query(
      `UPDATE public.employee_invites SET status='USED', used_at=NOW() WHERE id=$1`,
      [invite.id]
    );

    const token = signToken({
      user_id: String(newUser.id),
      username: newUser.username,
      employee_id: String(newUser.employee_id),
      company_id: String(newUser.company_id),
      role,
    });

    return res.status(201).json({
      ok: true,
      token,
      user: {
        user_id: newUser.id,
        username: newUser.username,
        employee_id: newUser.employee_id,
        company_id: newUser.company_id,
        role,
      },
    });
  } catch (err) {
    console.error("SIGNUP-INVITE ERROR:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

// ===================
// WHOAMI
// ===================
router.get("/whoami", async (req, res) => {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;

  if (!token) {
    return res.status(401).json({ ok: false, error: "MISSING_TOKEN" });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const userId = payload?.user_id;
    const { normalizeRole } = require("../middleware/roles");

    if (userId) {
      try {
        const q = await pool.query(
          "SELECT profile_status, role, company_id FROM public.app_users au LEFT JOIN public.companies c ON c.company_id = au.company_id WHERE au.id = $1",
          [String(userId)]
        );
        const row = q.rows?.[0] || {};
        return res.json({
          ok: true,
          user: {
            ...payload,
            role: normalizeRole(row.role || payload.role),
            profile_status: row.profile_status || null,
          }
        });
      } catch {
        return res.json({ ok: true, user: { ...payload, role: normalizeRole(payload.role) } });
      }
    }

    return res.json({ ok: true, user: { ...payload, role: normalizeRole(payload.role) } });
  } catch {
    return res.status(401).json({ ok: false, error: "INVALID_TOKEN" });
  }
});

// ===================
// CHANGE PIN
// ===================
// Used on first login (must_change_pin = true) or voluntary change.
// Requires valid Bearer token.
router.post("/change-pin", async (req, res) => {
  const authHeader = req.headers.authorization || "";
  const token      = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ ok: false, error: "MISSING_TOKEN" });
  }

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ ok: false, error: "INVALID_TOKEN" });
  }

  try {
    const { current_pin, new_pin } = req.body || {};

    if (!current_pin || !new_pin) {
      return res.status(400).json({ ok: false, error: "MISSING_FIELDS" });
    }

    const newPinStr = String(new_pin);
    const role      = payload.role ? String(payload.role).toUpperCase() : null;

    if (!isValidPin(newPinStr, role)) {
      return res.status(400).json({ ok: false, error: "INVALID_PIN_FORMAT", message: "PIN must be 4-8 characters" });
    }

    if (String(current_pin) === newPinStr) {
      return res.status(400).json({ ok: false, error: "SAME_PIN", message: "New PIN must be different from current PIN" });
    }

    // Load current user
    const { rows } = await pool.query(
      "SELECT id, pin_hash, must_change_pin FROM public.app_users WHERE id = $1 LIMIT 1",
      [String(payload.user_id)]
    );

    if (!rows.length) {
      return res.status(404).json({ ok: false, error: "USER_NOT_FOUND" });
    }

    const user  = rows[0];
    const pinOk = await verifyPin(String(current_pin), user.pin_hash);

    if (!pinOk) {
      return res.status(401).json({ ok: false, error: "WRONG_CURRENT_PIN" });
    }

    const newHash = await hashPin(newPinStr);

    await pool.query(
      `UPDATE public.app_users
       SET pin_hash = $1, must_change_pin = false, is_temp_pin = false
       WHERE id = $2`,
      [newHash, String(payload.user_id)]
    );

    await audit(pool, req, {
      action:      ACTIONS.PIN_CHANGED,
      entity_type: "user",
      entity_id:   payload.user_id,
      entity_name: payload.username,
    });

    return res.json({ ok: true, message: "PIN changed successfully" });
  } catch (err) {
    console.error("CHANGE-PIN ERROR:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

module.exports = router;
