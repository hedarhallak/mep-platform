// routes/super_admin_branding.js
//
// Phase 6-D-3 (Section 112, May 15, 2026) — admin endpoint to set a
// tenant's branding (logo + brand_color).
//
// Mount: app.use('/api/super', auth, superAdmin, tenantDb, this) on adminApp.
//   →  POST /api/super/companies/:id/branding
//
// Request shape (multipart/form-data — multer parses):
//   logo          — file (optional). When present: validated + resized
//                   to 256×256 PNG (lib/image_upload.js) + uploaded to
//                   DO Spaces (lib/spaces_client.js). The new public URL
//                   replaces companies.brand_logo_url.
//   brand_color   — text (optional). Hex string like '#16a34a'. Stored
//                   raw in companies.brand_color. Validated against
//                   ^#[0-9A-Fa-f]{6}$ before write.
//   remove_logo   — text 'true' (optional). When set, brand_logo_url is
//                   cleared (NULL) in the DB. The previous Spaces object
//                   is NOT deleted (deferred — Cloudflare/Spaces caches
//                   would 404 mid-flight if we did, and storage cost is
//                   negligible). Garbage-collecting orphan logos is a
//                   future hygiene task.
//
// At least one of { logo, brand_color, remove_logo } must be present;
// otherwise the route returns 400 NO_CHANGES.
//
// Responses:
//   200 { ok: true, company: { ... full row ... } }
//   400 { ok: false, error: '<code>', message?: '...' }
//        codes: NO_CHANGES | NO_FILE | FILE_TOO_LARGE | INVALID_FILE_TYPE
//               IMAGE_UNREADABLE | IMAGE_DIMENSIONS_INVALID
//               INVALID_BRAND_COLOR | INVALID_ID
//   404 { ok: false, error: 'COMPANY_NOT_FOUND' }
//   500 { ok: false, error: 'SERVER_ERROR' | 'SPACES_NOT_CONFIGURED' }
//
// Why a separate router file from super_admin.js:
//   super_admin.js handles CRUD on the company table itself; this file
//   owns the upload pipeline (multer + sharp + Spaces). Different
//   middleware (multer per-route only), different dependencies, and
//   different test surface — separation makes both easier to read.

'use strict';

const express = require('express');
const multer = require('multer');
const { audit, ACTIONS } = require('../lib/audit');
const { processLogoUpload } = require('../lib/image_upload');
const { putPublicObject } = require('../lib/spaces_client');

const router = express.Router();

// Multer config:
// - Memory storage: the file is in RAM during processing; sharp reads
//   from a Buffer, so no disk roundtrip needed. Limits ensure we can't
//   be DoS'd into OOM by an enormous upload.
// - 1 file max, field name 'logo'.
// - Bytes limit matches lib/image_upload.MAX_FILE_SIZE_BYTES (2 MB).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024, // 2 MB
    files: 1,
  },
});

const BRAND_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

/**
 * Build the public object key for a tenant logo.
 * Includes the company code + a millisecond timestamp so URLs change
 * on every update — natural cache-busting at Cloudflare + browser.
 *
 * @param {string} companyCode
 * @returns {string}
 */
function buildLogoKey(companyCode) {
  const safeCode = String(companyCode)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '');
  return `tenant-logos/${safeCode}-${Date.now()}.png`;
}

/**
 * POST /api/super/companies/:id/branding
 * SUPER_ADMIN sets logo and/or brand_color for a tenant company.
 */
router.post('/companies/:id/branding', upload.single('logo'), async (req, res) => {
  try {
    const companyId = Number(req.params.id);
    if (!companyId) {
      return res.status(400).json({ ok: false, error: 'INVALID_ID' });
    }

    const file = req.file || null;
    const rawBrandColor =
      req.body && typeof req.body.brand_color === 'string' ? req.body.brand_color.trim() : '';
    const wantsRemoveLogo = req.body && String(req.body.remove_logo).toLowerCase() === 'true';

    // At least one of: logo file, brand_color, remove_logo.
    if (!file && !rawBrandColor && !wantsRemoveLogo) {
      return res.status(400).json({ ok: false, error: 'NO_CHANGES' });
    }

    // Conflict: removing the logo AND uploading one in the same call.
    if (file && wantsRemoveLogo) {
      return res.status(400).json({
        ok: false,
        error: 'NO_CHANGES',
        message: 'Cannot upload a new logo and remove the existing one in the same request.',
      });
    }

    // Validate brand_color before any image work — fail fast.
    let normalizedColor = null;
    if (rawBrandColor) {
      if (!BRAND_COLOR_RE.test(rawBrandColor)) {
        return res.status(400).json({
          ok: false,
          error: 'INVALID_BRAND_COLOR',
          message: 'brand_color must be a hex string like #16a34a',
        });
      }
      normalizedColor = rawBrandColor.toLowerCase();
    }

    // Resolve the company (need code for the upload key, exists check).
    const { rows: companyRows } = await req.db.query(
      `SELECT company_id, company_code, name, brand_color, brand_logo_url
         FROM public.companies
        WHERE company_id = $1
        LIMIT 1`,
      [companyId]
    );
    if (companyRows.length === 0) {
      return res.status(404).json({ ok: false, error: 'COMPANY_NOT_FOUND' });
    }
    const company = companyRows[0];

    // Pipeline the logo if one was uploaded.
    let newLogoUrl = null; // null means "no upload happened this call"
    if (file) {
      let processed;
      try {
        processed = await processLogoUpload(file);
      } catch (e) {
        // Map lib/image_upload error codes straight to HTTP 400 codes.
        const code = e && e.code ? e.code : 'IMAGE_UNREADABLE';
        return res.status(400).json({
          ok: false,
          error: code,
          message: e && e.message ? e.message : 'Image processing failed',
        });
      }

      const key = buildLogoKey(company.company_code || `id-${companyId}`);
      try {
        newLogoUrl = await putPublicObject(key, processed.buffer, processed.contentType);
      } catch (e) {
        // SPACES_NOT_CONFIGURED bubbles up if env vars are unset on the
        // running process; surface a clear 500 in that case.
        if (e && e.code === 'SPACES_NOT_CONFIGURED') {
          console.error('Spaces upload failed: client not configured');
          return res.status(500).json({
            ok: false,
            error: 'SPACES_NOT_CONFIGURED',
            message: 'DO Spaces credentials/bucket are not configured on this server.',
          });
        }
        console.error('Spaces upload failed:', e && e.message ? e.message : e);
        return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
      }
    }

    // Build the UPDATE. Only touch columns the caller actually intended
    // to change so a partial request doesn't NULL out an unrelated field.
    const sets = [];
    const params = [];
    let idx = 1;
    if (newLogoUrl) {
      sets.push(`brand_logo_url = $${idx++}`);
      params.push(newLogoUrl);
    } else if (wantsRemoveLogo) {
      sets.push(`brand_logo_url = NULL`);
    }
    if (normalizedColor !== null) {
      sets.push(`brand_color = $${idx++}`);
      params.push(normalizedColor);
    }
    sets.push(`updated_at = NOW()`);

    params.push(companyId);
    const updateSql = `UPDATE public.companies SET ${sets.join(', ')} WHERE company_id = $${idx} RETURNING *`;

    const { rows: updatedRows } = await req.db.query(updateSql, params);
    const updated = updatedRows[0] || null;

    // Audit log — branding changes are not security-sensitive but the
    // who/when is useful for support diagnostics ("why did the logo
    // change on tenant X at 03:14 UTC?").
    try {
      await audit(req.db, req, {
        action: ACTIONS.COMPANY_BRANDING_UPDATED || 'COMPANY_BRANDING_UPDATED',
        entity_type: 'company',
        entity_id: companyId,
        entity_name: company.company_code,
        details: {
          logo_changed: !!newLogoUrl || wantsRemoveLogo,
          logo_action: newLogoUrl ? 'uploaded' : wantsRemoveLogo ? 'removed' : null,
          new_logo_url: newLogoUrl || (wantsRemoveLogo ? null : undefined),
          brand_color_changed: normalizedColor !== null,
          new_brand_color: normalizedColor,
        },
      });
    } catch (auditErr) {
      // Never fail the request because of an audit-log issue.
      console.warn('audit log failed for branding update:', auditErr && auditErr.message);
    }

    return res.json({ ok: true, company: updated });
  } catch (err) {
    // Multer's file-size limit throws a MulterError BEFORE this handler
    // runs (via the upload.single middleware); err.code === 'LIMIT_FILE_SIZE'
    // can appear if the limit is hit during streaming.
    if (err && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        ok: false,
        error: 'FILE_TOO_LARGE',
        message: 'Logo must be 2 MB or smaller.',
      });
    }
    if (err && err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        ok: false,
        error: 'UNEXPECTED_FIELD',
        message: 'Only one file under the field name "logo" is accepted.',
      });
    }
    console.error(
      'POST /super/companies/:id/branding error:',
      err && err.message ? err.message : err
    );
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

module.exports = router;
