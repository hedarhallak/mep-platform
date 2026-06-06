'use strict';

/**
 * routes/company.js — Section 134.4 (June 4, 2026)
 *
 * Tenant-facing company Settings. The /settings menu was a "Coming soon"
 * placeholder; this gives it a real, minimal surface:
 *   GET   /api/company/settings  → read the company's own config
 *   PATCH /api/company/settings  → update the self-serviceable fields
 *
 * Self-serviceable (editable here): default shift start/end (these drive the
 * assignment engine), phone, procurement_email, address.
 * Read-only (Constrai-managed, NOT editable by the tenant): name, company_code,
 * plan, status — surfaced for display only.
 *
 * RLS-enforced via req.db (app.company_id GUC). The explicit
 * `WHERE company_id = $n` is defense-in-depth. Gated by `settings.company`.
 */

const router = require('express').Router();
const { can } = require('../middleware/permissions');
const { audit, ACTIONS } = require('../lib/audit');

// HH:MM 24-hour. Postgres `time` accepts this; we keep validation strict so a
// bad value can't reach the column (and so the assignment defaults stay sane).
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const SETTINGS_COLUMNS = `
  name, company_code, plan, status,
  phone, procurement_email, address,
  to_char(default_shift_start, 'HH24:MI') AS default_shift_start,
  to_char(default_shift_end,   'HH24:MI') AS default_shift_end`;

// ── GET /api/company/settings ───────────────────────────────────
router.get('/settings', can('settings.company'), async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const { rows } = await req.db.query(
      `SELECT ${SETTINGS_COLUMNS}
         FROM public.companies WHERE company_id = $1 LIMIT 1`,
      [companyId]
    );
    if (!rows.length) return res.status(404).json({ ok: false, error: 'COMPANY_NOT_FOUND' });
    return res.json({ ok: true, settings: rows[0] });
  } catch (err) {
    console.error('GET /company/settings error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// ── PATCH /api/company/settings ─────────────────────────────────
router.patch('/settings', can('settings.company'), async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const { default_shift_start, default_shift_end, phone, procurement_email, address } =
      req.body || {};

    if (
      default_shift_start !== undefined &&
      default_shift_start !== null &&
      !TIME_RE.test(String(default_shift_start))
    ) {
      return res.status(400).json({ ok: false, error: 'INVALID_SHIFT_START' });
    }
    if (
      default_shift_end !== undefined &&
      default_shift_end !== null &&
      !TIME_RE.test(String(default_shift_end))
    ) {
      return res.status(400).json({ ok: false, error: 'INVALID_SHIFT_END' });
    }

    // Capture old values first → audit old→new diff (the §132 pattern: a
    // company-config change must be tamper-evident, not just "new value").
    const before = await req.db.query(
      `SELECT ${SETTINGS_COLUMNS} FROM public.companies WHERE company_id = $1 LIMIT 1`,
      [companyId]
    );
    if (!before.rows.length) return res.status(404).json({ ok: false, error: 'COMPANY_NOT_FOUND' });

    const { rows } = await req.db.query(
      `UPDATE public.companies SET
         default_shift_start = COALESCE($1, default_shift_start),
         default_shift_end   = COALESCE($2, default_shift_end),
         phone               = COALESCE($3, phone),
         procurement_email   = COALESCE($4, procurement_email),
         address             = COALESCE($5, address),
         updated_at          = NOW()
       WHERE company_id = $6
       RETURNING ${SETTINGS_COLUMNS}`,
      [
        default_shift_start || null,
        default_shift_end || null,
        phone !== undefined ? phone : null,
        procurement_email !== undefined ? procurement_email : null,
        address !== undefined ? address : null,
        companyId,
      ]
    );

    await audit(req.db, req, {
      action: ACTIONS.COMPANY_UPDATED,
      entity_type: 'company',
      entity_id: companyId,
      entity_name: rows[0].name,
      old_values: before.rows[0],
      new_values: rows[0],
    });

    return res.json({ ok: true, settings: rows[0] });
  } catch (err) {
    console.error('PATCH /company/settings error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

module.exports = router;
