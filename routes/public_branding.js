// routes/public_branding.js
//
// Phase 6 / Piece 6-B — public tenant branding lookup.
//
// Single public endpoint:
//
//   GET /api/companies/:code/branding
//
//     200 { ok: true, branding: { company_name, brand_color, brand_logo_url } }
//     400 { ok: false, error: 'INVALID_COMPANY_CODE' }   — :code didn't match the
//                                                          ^[A-Z0-9_-]{3,32}$ shape
//     404 { ok: false, error: 'COMPANY_NOT_FOUND' }      — no row, or row is in a
//                                                          non-publicly-reachable
//                                                          status (SUSPENDED, etc).
//
// Why a public endpoint:
//   The login screen needs to render the tenant's color + logo BEFORE the user
//   submits credentials. The frontend bootstrap (Phase 6-C, next PR) reads the
//   company code from the URL/subdomain and calls this endpoint to populate
//   the theme. Pre-auth + pre-tenant by definition — hence:
//     - No `auth` middleware mount.
//     - No `tenantDb` middleware mount (which sets app.company_id GUC; we don't
//       know it yet).
//     - Uses `superPool` (BYPASSRLS, mepuser_super) like routes/auth.js login,
//       because companies is RLS-strict and an anonymous request has no GUC set
//       — a `pool` query would return zero rows. Pitfall #28 / Section 90-G.
//
// Why lookup by `:code` not `:id`:
//   The integer PK isn't knowable by the frontend pre-login. `company_code` is
//   the human-readable identifier that shows up in welcome emails, the admin
//   "Create company" success screen, and the future bootstrap URL/subdomain. It
//   is already semi-public (admins hand it out), so exposing it on a public
//   route is not an info leak.
//
// Why filter by status:
//   SUSPENDED / PAST_DUE / CANCELLED tenants shouldn't surface their branding
//   to anonymous callers — they can't log in anyway (auth.js gates on status),
//   so a "found but not active" company looks identical to a missing one from
//   the outside. TRIAL is treated like ACTIVE for branding purposes — trial
//   tenants still see their own logo on the login screen.
//
// Caching:
//   `Cache-Control: public, max-age=300` (5 min). Logos and colors change
//   rarely; the frontend re-fetches on each boot anyway. 5 min gives a small
//   shield against an attacker enumerating codes via a refresh loop, without
//   making custom-branding updates feel sluggish on the user side.
//
// Audit log:
//   None. No user context (anonymous), no business event (read-only), and the
//   call volume is potentially every-page-load-while-logged-out — would spam
//   audit_logs with no signal. Standard Nginx access logs cover the analytics
//   need if it ever surfaces.
//
// Tests: tests/integration/companies_branding.test.js.

'use strict';

const express = require('express');
const { pool, superPool } = require('../db');

// Mirror the routes/auth.js convention: prefer superPool (BYPASSRLS) and fall
// back to the regular pool in dev/legacy CI where superPool isn't configured.
const brandingPool = superPool || pool;

const router = express.Router();

// company_code shape: alphanumerics plus underscore/hyphen, 3-32 chars.
// generateCompanyCode() in super_admin.js currently emits 3 uppercase letters
// + 4 digits (e.g. "ACM1234"), but at least one legacy row predating that
// helper exists with a lowercase 3-letter code ("mep" — the original tenant
// from the pre-multi-tenant migration). We accept both cases on the wire and
// fold to lowercase in the SQL comparison below — see the WHERE clause. The
// regex's only job is to reject obvious junk (`'OR 1=1`, multi-kilobyte
// inputs, etc) before we hit the DB.
const COMPANY_CODE_RE = /^[A-Za-z0-9_-]{3,32}$/;

// Statuses for which we will return branding. SUSPENDED / PAST_DUE / CANCELLED
// look like "not found" externally so suspended tenants don't get a "we know
// your company exists but won't say more" leak.
const PUBLIC_STATUSES = ['ACTIVE', 'TRIAL'];

/**
 * @openapi
 * /api/companies/{code}/branding:
 *   get:
 *     tags: [Public]
 *     summary: Tenant branding for the login screen
 *     description: |
 *       Public, unauthenticated. Returns the tenant's display name, primary
 *       brand color (hex), and logo URL so the frontend can theme the login
 *       page before the user submits credentials. NULL color / logo values
 *       indicate "tenant has not customized — use Constrai defaults."
 *     security: []
 *     parameters:
 *       - in: path
 *         name: code
 *         required: true
 *         schema: { type: string, pattern: '^[A-Z0-9_-]{3,32}$' }
 *     responses:
 *       200:
 *         description: Branding payload.
 *       400:
 *         description: Malformed company code.
 *       404:
 *         description: Company not found or not in a publicly reachable status.
 */
router.get('/:code/branding', async (req, res) => {
  try {
    const code = String(req.params.code || '').trim();

    if (!COMPANY_CODE_RE.test(code)) {
      return res.status(400).json({ ok: false, error: 'INVALID_COMPANY_CODE' });
    }

    // Case-insensitive compare: LOWER() on both sides so legacy lowercase
    // codes (e.g. "mep") and new uppercase codes (generateCompanyCode emits
    // "ACM1234") both resolve via the same path. At current scale (single-
    // digit tenants) the missing index is fine; if this becomes hot, add a
    // functional unique index `(LOWER(company_code))` in a follow-up
    // migration.
    const { rows } = await brandingPool.query(
      `SELECT name, brand_color, brand_logo_url
         FROM public.companies
        WHERE LOWER(company_code) = LOWER($1)
          AND status = ANY($2::text[])
        LIMIT 1`,
      [code, PUBLIC_STATUSES]
    );

    if (rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'COMPANY_NOT_FOUND' });
    }

    // 5-minute public cache.
    res.set('Cache-Control', 'public, max-age=300');

    return res.json({
      ok: true,
      branding: {
        company_name: rows[0].name,
        brand_color: rows[0].brand_color, // may be null
        brand_logo_url: rows[0].brand_logo_url, // may be null
      },
    });
  } catch (err) {
    console.error('GET /api/companies/:code/branding error:', err.message);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

module.exports = router;
