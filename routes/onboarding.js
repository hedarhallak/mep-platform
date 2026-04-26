"use strict";

/**
 * routes/onboarding.js
 *
 * GET  /api/onboarding/verify?token=   — verify invite token, return invite info
 * POST /api/onboarding/complete        — complete account setup
 */

const router = require("express").Router();
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { pool } = require("../db");

const hashToken = t => crypto.createHash("sha256").update(t).digest("hex");

// ── GET /api/onboarding/verify ────────────────────────────────
router.get("/verify", async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ ok: false, error: "TOKEN_REQUIRED" });

    const tokenHash = hashToken(token);

    const result = await pool.query(
      `SELECT
         ui.id, ui.email, ui.role, ui.employee_id, ui.company_id,
         ui.expires_at, ui.status, ui.used_at,
         e.first_name, e.last_name,
         tt.name AS trade_name
       FROM public.user_invites ui
       LEFT JOIN public.employees e  ON e.id = ui.employee_id
       LEFT JOIN public.trade_types tt ON tt.code = (
         SELECT ep.trade_code FROM public.employee_profiles ep
         WHERE ep.employee_id = ui.employee_id LIMIT 1
       )
       WHERE ui.token_hash = $1 LIMIT 1`,
      [tokenHash]
    );

    if (!result.rows.length)
      return res.status(404).json({ ok: false, error: "TOKEN_NOT_FOUND" });

    const invite = result.rows[0];

    if (invite.status !== "ACTIVE")
      return res.status(410).json({ ok: false, error: "TOKEN_ALREADY_USED" });

    if (new Date(invite.expires_at) < new Date())
      return res.status(410).json({ ok: false, error: "TOKEN_EXPIRED" });

    return res.json({
      ok: true,
      invite: {
        email:      invite.email,
        role:       invite.role,
        first_name: invite.first_name,
        last_name:  invite.last_name,
        trade_name: invite.trade_name,
      }
    });
  } catch (err) {
    console.error("GET /onboarding/verify error:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

// ── POST /api/onboarding/complete ─────────────────────────────
router.post("/complete", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { token, username, pin, phone, home_address, home_lat, home_lng } = req.body;

    if (!token)    return res.status(400).json({ ok: false, error: "TOKEN_REQUIRED" });
    if (!username) return res.status(400).json({ ok: false, error: "USERNAME_REQUIRED" });
    if (!pin)      return res.status(400).json({ ok: false, error: "PIN_REQUIRED" });

    const tokenHash = hashToken(token);

    // ── Verify token (FOR UPDATE prevents race-condition double-use) ──
    const inviteRes = await client.query(
      `SELECT * FROM public.user_invites WHERE token_hash = $1 LIMIT 1 FOR UPDATE`,
      [tokenHash]
    );

    if (!inviteRes.rows.length)
      return res.status(404).json({ ok: false, error: "TOKEN_NOT_FOUND" });

    const invite = inviteRes.rows[0];

    if (invite.status !== "ACTIVE")
      return res.status(410).json({ ok: false, error: "TOKEN_ALREADY_USED" });

    if (new Date(invite.expires_at) < new Date())
      return res.status(410).json({ ok: false, error: "TOKEN_EXPIRED" });

    // ── Check username not taken ──────────────────────────────
    const userExists = await client.query(
      `SELECT id FROM public.app_users WHERE username = $1 LIMIT 1`,
      [username.toLowerCase().trim()]
    );
    if (userExists.rows.length)
      return res.status(409).json({ ok: false, error: "USERNAME_TAKEN" });

    // ── Hash PIN ──────────────────────────────────────────────
    const pinHash = await bcrypt.hash(pin, 12);

    // ── Create app_user ───────────────────────────────────────
    await client.query(
      `INSERT INTO public.app_users
         (username, pin_hash, employee_id, company_id, role, is_active, must_change_pin)
       VALUES ($1, $2, $3, $4, $5, true, false)`,
      [
        username.toLowerCase().trim(),
        pinHash,
        invite.employee_id,
        invite.company_id,
        invite.role,
      ]
    );

    // ── Activate employee in public.employees ─────────────────
    await client.query(
      `UPDATE public.employees SET is_active = true WHERE id = $1`,
      [invite.employee_id]
    );

    // ── Update employee_profiles with phone + home address ────
    // Check if profile exists first
    const profileExists = await client.query(
      `SELECT employee_id FROM public.employee_profiles WHERE employee_id = $1 LIMIT 1`,
      [invite.employee_id]
    );

    if (profileExists.rows.length) {
      // Update existing profile
      const updates = [];
      const params  = [];

      if (phone) {
        params.push(phone.trim());
        updates.push(`phone = $${params.length}`);
      }
      if (home_address) {
        params.push(home_address);
        updates.push(`home_address = $${params.length}`);
      }
      if (home_lat && home_lng) {
        params.push(home_lat);
        updates.push(`home_lat = $${params.length}`);
        params.push(home_lng);
        updates.push(`home_lng = $${params.length}`);

        try {
          params.push(home_lng);
          params.push(home_lat);
          updates.push(`home_location = ST_SetSRID(ST_MakePoint($${params.length - 1}, $${params.length}), 4326)`);
        } catch (_) {}
      }

      if (updates.length) {
        params.push(invite.employee_id);
        await client.query(
          `UPDATE public.employee_profiles SET ${updates.join(', ')} WHERE employee_id = $${params.length}`,
          params
        );
      }
    } else {
      // Get full_name from employees table
      const empRow = await client.query(
        `SELECT first_name, last_name FROM public.employees WHERE id = $1 LIMIT 1`,
        [invite.employee_id]
      );
      const fullName = empRow.rows[0]
        ? `${empRow.rows[0].first_name} ${empRow.rows[0].last_name}`.trim()
        : "Unknown";

      // Create new profile
      await client.query(
        `INSERT INTO public.employee_profiles
           (employee_id, full_name, phone, home_address)
         VALUES ($1, $2, $3, $4)`,
        [
          invite.employee_id,
          fullName,
          phone?.trim() || null,
          home_address || null,
        ]
      );
    }

    // ── Mark invite as used ───────────────────────────────────
    await client.query(
      `UPDATE public.user_invites SET status = 'USED', used_at = NOW() WHERE token_hash = $1`,
      [tokenHash]
    );

    await client.query("COMMIT");

    return res.json({ ok: true, message: "Account created successfully" });

  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("POST /onboarding/complete error:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR", message: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
