const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const router = express.Router();
const { pool } = require('../db');

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Prevent XSS when embedding values in HTML
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// GET /activate?token=...
// Rule: invite is considered "used" ONLY when used_at IS NOT NULL.
// (In your DB, status is set to ACTIVE at creation time, so status cannot be used to detect usage.)
router.get('/', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).send('Missing activation token');

  const tokenHash = hashToken(token);

  try {
    const { rows } = await pool.query(
      `SELECT id, company_id, employee_id, email, role, status, used_at, expires_at
       FROM user_invites
       WHERE token_hash = $1`,
      [tokenHash]
    );

    if (rows.length === 0) return res.status(400).send('Invalid activation link');

    const invite = rows[0];

    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      return res.status(400).send('Activation link expired');
    }

    if (invite.used_at) {
      return res.status(400).send('Invite already used');
    }

    // nosemgrep: javascript.express.security.audit.xss.direct-response-write.direct-response-write
    // The only interpolated value (token) is escaped via the local escapeHtml() helper below.
    // Semgrep can't trace custom local escape helpers, so this rule fires false-positive here.
    res.send(`
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Set PIN</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font-family: Arial, sans-serif; background:#f6f7f9; margin:0; }
      .wrap { max-width: 720px; margin: 0 auto; padding: 48px 16px; }
      .card { background:#fff; border-radius: 16px; padding: 28px; box-shadow: 0 10px 30px rgba(0,0,0,0.08); }
      h2 { margin: 0 0 12px; font-size: 26px; }
      input { width:100%; padding:12px; margin-top:10px; border-radius:10px; border:1px solid #ddd; font-size:16px; }
      button { margin-top:16px; width:100%; padding:12px; border:0; border-radius:10px; font-size:16px; cursor:pointer; }
      .hint { margin-top:12px; font-size:13px; color:#666; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="card">
        <h2>Set PIN</h2>
        <form method="POST" action="/activate/set-pin">
          <input type="hidden" name="token" value="${escapeHtml(token)}" /> <!-- nosemgrep: javascript.express.security.injection.raw-html-format.raw-html-format -->
          <input type="password" name="pin" placeholder="PIN" required />
          <input type="password" name="pin_confirm" placeholder="Confirm PIN" required />
          <button type="submit">Activate</button>
        </form>
        <div class="hint">This invite will be consumed after you set a PIN.</div>
      </div>
    </div>
  </body>
</html>
    `);
  } catch (e) {
    console.error('GET /activate error:', e);
    res.status(500).send('Server error');
  }
});

// POST /activate/set-pin
// Consumes invite by setting used_at (status may stay ACTIVE in your DB),
// and creates OR updates the app_users record for that email.
router.post('/set-pin', express.urlencoded({ extended: false }), async (req, res) => {
  const { token, pin, pin_confirm } = req.body || {};
  if (!token || !pin || pin !== pin_confirm) {
    return res.status(400).send('Invalid PIN');
  }
  if (pin.length < 4 || pin.length > 8) {
    return res.status(400).send('PIN must be 4 to 8 characters.');
  }

  const tokenHash = hashToken(token);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const inviteRes = await client.query(
      `SELECT id, company_id, employee_id, email, role, used_at, expires_at
       FROM user_invites
       WHERE token_hash = $1
       FOR UPDATE`,
      [tokenHash]
    );

    if (inviteRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).send('Invalid activation link');
    }

    const invite = inviteRes.rows[0];

    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      await client.query('ROLLBACK');
      return res.status(400).send('Activation link expired');
    }

    if (invite.used_at) {
      await client.query('ROLLBACK');
      return res.status(400).send('Invite already used');
    }

    const pinHash = await bcrypt.hash(pin, 12);

    // Create or update the user by email (works even if user already exists)
    // Policy: username defaults to email (Option A).
    const desiredUsername = invite.email;

    const existingUser = await client.query(
      `SELECT id FROM app_users WHERE email = $1 FOR UPDATE`,
      [invite.email]
    );

    if (existingUser.rows.length > 0) {
      await client.query(
        `UPDATE app_users
         SET pin_hash = $1,
             activated_at = NOW(),
             is_active = TRUE,
             role = $2,
             username = $3,
             employee_id = COALESCE(employee_id, $4),
             company_id = COALESCE(company_id, $5),
             last_invite_id = COALESCE(last_invite_id, $6)
         WHERE email = $7`,
        [
          pinHash,
          invite.role,
          desiredUsername,
          invite.employee_id,
          invite.company_id,
          invite.id,
          invite.email,
        ]
      );
    } else {
      await client.query(
        `INSERT INTO app_users (username, email, role, pin_hash, is_active, activated_at, employee_id, company_id, last_invite_id)
         VALUES ($1, $2, $3, $4, TRUE, NOW(), $5, $6, $7)`,
        [
          desiredUsername,
          invite.email,
          invite.role,
          pinHash,
          invite.employee_id,
          invite.company_id,
          invite.id,
        ]
      );
    }

    // Consume invite (single source of truth: used_at)
    await client.query(
      `UPDATE user_invites
       SET used_at = NOW()
       WHERE id = $1`,
      [invite.id]
    );

    await client.query('COMMIT');
    return res.redirect('/login?activated=1');
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {}
    console.error('POST /activate/set-pin error:', e);
    return res.status(500).send('Server error');
  } finally {
    client.release();
  }
});

module.exports = router;
