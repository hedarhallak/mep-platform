"use strict";

// Email Link (Token) invites via SendGrid
// - Does NOT break existing invite_code flow.
// - Creates a row in public.user_invites, sends activation email.

const express = require("express");
const crypto = require("crypto");
const sgMail = require("@sendgrid/mail");
const { pool } = require("../db");

const router = express.Router();

function mustEnv(name) {
  const v = process.env[name];
  if (!v || !String(v).trim()) return null;
  return String(v).trim();
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isValidEmail(email) {
  // Simple, practical validation.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeRole(role) {
  return String(role || "").trim().toUpperCase();
}

// POST /api/user-invites/generate
// Body: { email, role, employee_id?, note? }
router.post("/generate", async (req, res) => {
  try {
    const SENDGRID_API_KEY = mustEnv("SENDGRID_API_KEY");
    const SENDGRID_FROM_EMAIL = mustEnv("SENDGRID_FROM_EMAIL");
    const APP_BASE_URL = mustEnv("APP_BASE_URL");

    if (!SENDGRID_API_KEY || !SENDGRID_FROM_EMAIL || !APP_BASE_URL) {
      return res.status(500).json({
        ok: false,
        error: "EMAIL_NOT_CONFIGURED",
        message: "Missing SENDGRID_API_KEY / SENDGRID_FROM_EMAIL / APP_BASE_URL in .env"
      });
    }

    const emailRaw = req.body?.email;
    const roleRaw = req.body?.role;
    const employeeId = req.body?.employee_id ?? null;
    const note = req.body?.note ?? null;

    const email = normalizeEmail(emailRaw);
    const role = normalizeRole(roleRaw);

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ ok: false, error: "INVALID_EMAIL" });
    }

    if (!role) {
      return res.status(400).json({ ok: false, error: "ROLE_REQUIRED" });
    }

    // Limit roles to known set to avoid garbage data.
    const allowedRoles = new Set(["ADMIN", "PM", "FOREMAN", "WORKER", "PURCHASING"]);
    if (!allowedRoles.has(role)) {
      return res.status(400).json({ ok: false, error: "INVALID_ROLE", allowed: Array.from(allowedRoles) });
    }

    const companyId = req.user?.company_id ?? null;
    const createdByUserId = req.user?.user_id ?? null;

    // Generate raw token for email link
    const rawToken = crypto.randomBytes(32).toString("base64url");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    const expiresHours = Number(process.env.USER_INVITE_EXPIRES_HOURS || 48);
    const expiresAt = new Date(Date.now() + Math.max(1, expiresHours) * 60 * 60 * 1000);

    // Revoke any existing ACTIVE invite for same (company_id, email)
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      await client.query(
        `UPDATE public.user_invites
         SET status='REVOKED', revoked_at=NOW()
         WHERE (company_id IS NOT DISTINCT FROM $1)
           AND lower(email)=lower($2)
           AND status='ACTIVE'`,
        [companyId, email]
      );

      const ins = await client.query(
        `INSERT INTO public.user_invites
          (company_id, employee_id, email, role, token_hash, status, created_by_user_id, note, expires_at)
         VALUES ($1, $2, $3, $4, $5, 'ACTIVE', $6, $7, $8)
         RETURNING id`,
        [companyId, employeeId, email, role, tokenHash, createdByUserId, note, expiresAt]
      );

      const inviteId = ins.rows?.[0]?.id;
      if (!inviteId) {
        throw new Error("Failed to create invite");
      }

      // Send email (outside DB constraints but still inside tx; if send fails we rollback)
      sgMail.setApiKey(SENDGRID_API_KEY);
      const activateLink = `${APP_BASE_URL.replace(/\/$/, "")}/activate?token=${rawToken}`;

      const html = `
        <div style="font-family: Arial, sans-serif; line-height:1.4">
          <h2>Activate your account</h2>
          <p>Please activate your account by clicking the link below:</p>
          <p><a href="${activateLink}">${activateLink}</a></p>
          <p>This link expires at: <b>${expiresAt.toISOString()}</b></p>
          <p>If you did not request this, you can ignore this email.</p>
        </div>
      `;

      await sgMail.send({
        to: email,
        from: SENDGRID_FROM_EMAIL,
        subject: "Activate your account",
        html
      });

      await client.query(
        `UPDATE public.user_invites SET sent_at=NOW() WHERE id=$1`,
        [inviteId]
      );

      await client.query("COMMIT");

      return res.json({
        ok: true,
        invite_id: inviteId,
        email,
        role,
        expires_at: expiresAt.toISOString(),
        activation_link: activateLink
      });
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("POST /api/user-invites/generate error:", err);
    return res.status(500).json({ ok: false, error: "USER_INVITE_FAILED", message: err.message });
  }
});

module.exports = router;
