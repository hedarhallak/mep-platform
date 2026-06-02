'use strict';

/**
 * routes/tools.js
 *
 * Phase 6-D-9 / DECISIONS §126.1 — Tool Request + asset tracking (Slice A).
 *
 * Mount: app.use('/api/tools', auth, tenantDb, this) on the tenant app.
 * Uses req.db (RLS-enforced, company-scoped) + req.user.company_id.
 *
 * Permissions: v1 reuses the `materials` module (Hedar's choice — no new
 * permission seeding):
 *   - browse catalog / request / view requests → materials.request_submit
 *   - manage physical assets (register / move) → materials.surplus_declare
 *   - view assets                              → materials.surplus_view
 *
 * Endpoints:
 *   GET  /catalog?trade=&q=       — global tool catalog (smart filter by trade)
 *   POST /requests                — foreman requests a tool type for a project
 *   GET  /requests                — list this company's tool requests
 *   GET  /assets?status=&project_id= — list this company's physical tool units
 *   POST /assets                  — register a physical tool unit (warehouse)
 *   POST /assets/:id/move         — move a unit to a project / warehouse (+history)
 */

const router = require('express').Router();
const { can } = require('../middleware/permissions');

const VALID_TRADES = ['GENERAL', 'ELECTRICAL', 'PLUMBING', 'MECHANICAL', 'LAYOUT'];

// ── GET /catalog ──────────────────────────────────────────────
router.get('/catalog', can('materials.request_submit'), async (req, res) => {
  try {
    const trade = req.query.trade ? String(req.query.trade).toUpperCase() : null;
    if (trade && !VALID_TRADES.includes(trade)) {
      return res.status(400).json({ ok: false, error: 'INVALID_TRADE' });
    }
    const where = ['is_active = true'];
    const params = [];
    if (trade) {
      params.push(trade);
      where.push(`trade = $${params.length}`);
    }
    if (req.query.q) {
      params.push(`%${String(req.query.q).toLowerCase()}%`);
      where.push(`LOWER(name) LIKE $${params.length}`);
    }
    const { rows } = await req.db.query(
      `SELECT id, name, trade FROM public.tool_catalog
        WHERE ${where.join(' AND ')}
        ORDER BY trade, name`,
      params
    );
    return res.json({ ok: true, catalog: rows });
  } catch (err) {
    console.error('GET /tools/catalog error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// ── POST /requests ────────────────────────────────────────────
router.post('/requests', can('materials.request_submit'), async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const userId = req.user.user_id || req.user.id || null;
    const { project_id, catalog_id, quantity, note } = req.body || {};
    if (!project_id) return res.status(400).json({ ok: false, error: 'PROJECT_REQUIRED' });
    if (!catalog_id) return res.status(400).json({ ok: false, error: 'CATALOG_ID_REQUIRED' });
    const qty = Number(quantity) || 1;
    if (!Number.isInteger(qty) || qty <= 0) {
      return res.status(400).json({ ok: false, error: 'INVALID_QUANTITY' });
    }
    const { rows } = await req.db.query(
      `INSERT INTO public.tool_requests
         (company_id, project_id, requested_by_user_id, catalog_id, quantity, status, note)
       VALUES ($1, $2, $3, $4, $5, 'REQUESTED', $6)
       RETURNING *`,
      [companyId, project_id, userId, catalog_id, qty, note ? String(note).slice(0, 2000) : null]
    );
    return res.status(201).json({ ok: true, request: rows[0] });
  } catch (err) {
    console.error('POST /tools/requests error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// ── GET /requests ─────────────────────────────────────────────
router.get('/requests', can('materials.request_submit'), async (req, res) => {
  try {
    const status = req.query.status ? String(req.query.status).toUpperCase() : null;
    const where = [];
    const params = [];
    if (status) {
      params.push(status);
      where.push(`tr.status = $${params.length}`);
    }
    const { rows } = await req.db.query(
      `SELECT tr.*, tc.name AS tool_name, tc.trade,
              p.project_code, p.project_name
         FROM public.tool_requests tr
         JOIN public.tool_catalog tc ON tc.id = tr.catalog_id
         JOIN public.projects p ON p.id = tr.project_id
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY tr.created_at DESC`,
      params
    );
    return res.json({ ok: true, requests: rows });
  } catch (err) {
    console.error('GET /tools/requests error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// ── GET /assets ───────────────────────────────────────────────
router.get('/assets', can('materials.surplus_view'), async (req, res) => {
  try {
    const status = req.query.status ? String(req.query.status).toUpperCase() : null;
    const where = [];
    const params = [];
    if (status) {
      params.push(status);
      where.push(`ta.status = $${params.length}`);
    }
    if (req.query.project_id) {
      params.push(Number(req.query.project_id));
      where.push(`ta.current_project_id = $${params.length}`);
    }
    const { rows } = await req.db.query(
      `SELECT ta.*, tc.name AS tool_name, tc.trade,
              p.project_code, p.project_name
         FROM public.tool_assets ta
         JOIN public.tool_catalog tc ON tc.id = ta.catalog_id
         LEFT JOIN public.projects p ON p.id = ta.current_project_id
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY tc.name, ta.asset_tag`,
      params
    );
    return res.json({ ok: true, assets: rows });
  } catch (err) {
    console.error('GET /tools/assets error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// ── POST /assets ──────────────────────────────────────────────
router.post('/assets', can('materials.surplus_declare'), async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const { catalog_id, asset_tag, current_project_id, notes } = req.body || {};
    if (!catalog_id) return res.status(400).json({ ok: false, error: 'CATALOG_ID_REQUIRED' });
    if (!asset_tag || !String(asset_tag).trim()) {
      return res.status(400).json({ ok: false, error: 'ASSET_TAG_REQUIRED' });
    }
    const status = current_project_id ? 'ASSIGNED' : 'AVAILABLE';
    const { rows } = await req.db.query(
      `INSERT INTO public.tool_assets
         (company_id, catalog_id, asset_tag, status, current_project_id, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        companyId,
        catalog_id,
        String(asset_tag).trim(),
        status,
        current_project_id || null,
        notes ? String(notes).slice(0, 2000) : null,
      ]
    );
    return res.status(201).json({ ok: true, asset: rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ ok: false, error: 'ASSET_TAG_EXISTS' });
    }
    console.error('POST /tools/assets error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// ── POST /assets/:id/move ─────────────────────────────────────
// Move a unit to a project (or back to warehouse when to_project_id is null).
// Updates current_project_id + status, and records the movement history.
router.post('/assets/:id/move', can('materials.surplus_declare'), async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const userId = req.user.user_id || req.user.id || null;
    const assetId = Number(req.params.id);
    if (!assetId) return res.status(400).json({ ok: false, error: 'INVALID_ASSET_ID' });
    const toProject = req.body?.to_project_id != null ? Number(req.body.to_project_id) : null;

    const { rows: assetRows } = await req.db.query(
      `SELECT id, current_project_id, status FROM public.tool_assets WHERE id = $1 LIMIT 1`,
      [assetId]
    );
    if (!assetRows.length) return res.status(404).json({ ok: false, error: 'ASSET_NOT_FOUND' });
    const fromProject = assetRows[0].current_project_id;
    const newStatus = toProject ? 'ASSIGNED' : 'AVAILABLE';

    const { rows: updated } = await req.db.query(
      `UPDATE public.tool_assets
          SET current_project_id = $2, status = $3, updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [assetId, toProject, newStatus]
    );

    await req.db.query(
      `INSERT INTO public.tool_asset_movements
         (company_id, asset_id, from_project_id, to_project_id, moved_by_user_id, reason)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        companyId,
        assetId,
        fromProject,
        toProject,
        userId,
        req.body?.reason ? String(req.body.reason).slice(0, 500) : null,
      ]
    );

    return res.json({ ok: true, asset: updated[0] });
  } catch (err) {
    console.error('POST /tools/assets/:id/move error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

module.exports = router;
