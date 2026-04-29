'use strict';

/**
 * routes/material_requests.js
 *
 * POST   /api/materials/requests              — worker creates a request
 * GET    /api/materials/requests              — list requests (foreman sees project's requests)
 * GET    /api/materials/requests/:id          — single request with items
 * PATCH  /api/materials/requests/:id/review   — foreman updates qty splits after surplus check
 * PATCH  /api/materials/requests/:id/cancel   — cancel a pending request
 * GET    /api/materials/surplus               — list available surplus items (for smart suggestion)
 *
 * POST   /api/materials/returns               — foreman declares surplus
 * GET    /api/materials/returns               — list surplus declarations
 */

const router = require('express').Router();
const { pool } = require('../db');
const { normalizeRole } = require('../middleware/roles');
const { can } = require('../middleware/permissions');

function requireRoles(allowed) {
  const normalized = allowed.map((r) => normalizeRole(r));
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });
    const userRole = normalizeRole(req.user.role);
    if (userRole === 'SUPER_ADMIN') return next();
    if (!normalized.includes(userRole))
      return res.status(403).json({ ok: false, error: 'FORBIDDEN' });
    return next();
  };
}
// NOTE: previously defined ANY + FOREMAN guards via requireRoles(...) here
// were never wired into any route. Removed as dead code in Phase 11a cleanup.
// Use can('permission_code') from middleware/permissions when auth is needed.

// ── Helper: resolve employee_id from token ───────────────────
async function resolveEmployeeId(req) {
  if (req.user?.employee_id) return Number(req.user.employee_id);
  const userId = req.user?.user_id || req.user?.id;
  if (userId) {
    const r = await pool.query(`SELECT employee_id FROM public.app_users WHERE id = $1 LIMIT 1`, [
      userId,
    ]);
    if (r.rows[0]?.employee_id) return Number(r.rows[0].employee_id);
  }
  return null;
}

// ── POST /requests ───────────────────────────────────────────
// Worker or foreman creates a material request
router.post('/requests', can('materials.request_submit'), async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const employeeId = await resolveEmployeeId(req);
    const { project_id, items, note } = req.body || {};

    if (!project_id) return res.status(400).json({ ok: false, error: 'PROJECT_REQUIRED' });
    if (!Array.isArray(items) || !items.length)
      return res.status(400).json({ ok: false, error: 'ITEMS_REQUIRED' });

    // Validate items
    for (const it of items) {
      if (!it.item_name || String(it.item_name).trim() === '')
        return res.status(400).json({ ok: false, error: 'ITEM_NAME_REQUIRED' });
      if (!it.quantity || Number(it.quantity) <= 0)
        return res.status(400).json({ ok: false, error: 'ITEM_QUANTITY_REQUIRED' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Find foreman on this project today
      const foremanRes = await client.query(
        `SELECT requested_for_employee_id AS foreman_employee_id
         FROM public.assignment_requests
         WHERE project_id    = $1
           AND company_id    = $2
           AND status        = 'APPROVED'
           AND assignment_role = 'FOREMAN'
           AND start_date   <= CURRENT_DATE
           AND end_date     >= CURRENT_DATE
         LIMIT 1`,
        [project_id, companyId]
      );
      const foremanId = foremanRes.rows[0]?.foreman_employee_id || null;

      const {
        rows: [req_row],
      } = await client.query(
        `INSERT INTO public.material_requests
           (company_id, project_id, requested_by, foreman_employee_id, note)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [companyId, project_id, employeeId, foremanId, note || null]
      );

      const itemRows = [];
      for (const it of items) {
        const {
          rows: [item],
        } = await client.query(
          `INSERT INTO public.material_request_items
             (request_id, item_name, item_name_raw, quantity, unit, note)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *`,
          [
            req_row.id,
            String(it.item_name).trim(),
            it.item_name_raw || null,
            Number(it.quantity),
            String(it.unit || 'pcs').trim(),
            it.note || null,
          ]
        );
        itemRows.push(item);

        // Auto-save to catalog (upsert)
        await client.query(
          `INSERT INTO public.material_catalog (company_id, item_name, default_unit, use_count, last_used_at)
           VALUES ($1, $2, $3, 1, NOW())
           ON CONFLICT (company_id, LOWER(TRIM(item_name)))
           DO UPDATE SET
             use_count    = material_catalog.use_count + 1,
             default_unit = EXCLUDED.default_unit,
             last_used_at = NOW()`,
          [companyId, String(it.item_name).trim(), String(it.unit || 'pcs').trim()]
        );
      }

      await client.query('COMMIT');
      return res.status(201).json({ ok: true, request: { ...req_row, items: itemRows } });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('POST /materials/requests error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// ── GET /requests ────────────────────────────────────────────
router.get('/requests', can('materials.request_view_own'), async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const { project_id, status } = req.query;

    let q = `
      SELECT
        mr.id, mr.status, mr.note, mr.created_at, mr.updated_at,
        mr.project_id, mr.requested_by, mr.merged_into_id,
        p.project_code, p.project_name,
        ep.full_name AS requester_name,
        (
          SELECT json_agg(i ORDER BY i.id)
          FROM public.material_request_items i
          WHERE i.request_id = mr.id
        ) AS items
      FROM public.material_requests mr
      JOIN public.projects           p  ON p.id          = mr.project_id
      JOIN public.employee_profiles  ep ON ep.employee_id = mr.requested_by
      WHERE mr.company_id = $1
    `;
    const params = [companyId];

    if (project_id) {
      params.push(project_id);
      q += ` AND mr.project_id = $${params.length}`;
    }
    if (status) {
      params.push(status);
      q += ` AND mr.status = $${params.length}`;
    }

    q += ' ORDER BY mr.created_at DESC';

    const { rows } = await pool.query(q, params);
    return res.json({ ok: true, requests: rows });
  } catch (err) {
    console.error('GET /materials/requests error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// ── GET /requests/:id ────────────────────────────────────────
router.get('/requests/:id', can('materials.request_view_own'), async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const id = Number(req.params.id);

    const {
      rows: [request],
    } = await pool.query(
      `SELECT mr.*, p.project_code, p.project_name, ep.full_name AS requester_name
       FROM public.material_requests mr
       JOIN public.projects p ON p.id = mr.project_id
       JOIN public.employee_profiles ep ON ep.employee_id = mr.requested_by
       WHERE mr.id = $1 AND mr.company_id = $2`,
      [id, companyId]
    );
    if (!request) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });

    const { rows: items } = await pool.query(
      `SELECT * FROM public.material_request_items WHERE request_id = $1 ORDER BY id`,
      [id]
    );
    return res.json({ ok: true, request: { ...request, items } });
  } catch (err) {
    console.error('GET /materials/requests/:id error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// ── PATCH /requests/:id/cancel ───────────────────────────────
router.patch('/requests/:id/cancel', can('materials.request_view_own'), async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const employeeId = await resolveEmployeeId(req);
    const id = Number(req.params.id);

    const {
      rows: [existing],
    } = await pool.query(
      `SELECT * FROM public.material_requests WHERE id = $1 AND company_id = $2 LIMIT 1`,
      [id, companyId]
    );
    if (!existing) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
    if (existing.status !== 'PENDING')
      return res.status(409).json({
        ok: false,
        error: 'CANNOT_CANCEL',
        message: 'Only PENDING requests can be cancelled.',
      });
    // Only requester or foreman can cancel
    const userRole = normalizeRole(req.user.role);
    const isManager = ['COMPANY_ADMIN', 'TRADE_ADMIN', 'PROJECT_MANAGER'].includes(userRole);
    if (!isManager && existing.requested_by !== employeeId)
      return res.status(403).json({ ok: false, error: 'FORBIDDEN' });

    const {
      rows: [updated],
    } = await pool.query(
      `UPDATE public.material_requests SET status = 'CANCELLED' WHERE id = $1 RETURNING *`,
      [id]
    );
    return res.json({ ok: true, request: updated });
  } catch (err) {
    console.error('PATCH /cancel error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// ── PATCH /requests/:id/review ───────────────────────────────
// Foreman sets qty_from_surplus / qty_from_supplier per item after checking surplus
router.patch('/requests/:id/review', can('hub.materials_merge_send'), async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const id = Number(req.params.id);
    const { items, status } = req.body || {}; // items: [{id, qty_from_surplus, qty_from_supplier, surplus_source_project_id}]

    const {
      rows: [existing],
    } = await pool.query(
      `SELECT * FROM public.material_requests WHERE id = $1 AND company_id = $2 LIMIT 1`,
      [id, companyId]
    );
    if (!existing) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      if (Array.isArray(items)) {
        for (const it of items) {
          await client.query(
            `UPDATE public.material_request_items
             SET qty_from_surplus = $1, qty_from_supplier = $2, surplus_source_project_id = $3
             WHERE id = $4 AND request_id = $5`,
            [
              it.qty_from_surplus || 0,
              it.qty_from_supplier || 0,
              it.surplus_source_project_id || null,
              it.id,
              id,
            ]
          );
          // Reduce qty_available in return items if using surplus
          if (it.qty_from_surplus > 0 && it.surplus_source_project_id) {
            await client.query(
              `UPDATE public.material_return_items ri
               SET qty_available = GREATEST(0, qty_available - $1)
               FROM public.material_returns mr
               WHERE ri.return_id = mr.id
                 AND mr.project_id = $2
                 AND mr.company_id = $3
                 AND LOWER(ri.item_name) = LOWER($4)
                 AND ri.qty_available > 0
               LIMIT 1`,
              [it.qty_from_surplus, it.surplus_source_project_id, companyId, it.item_name]
            );
          }
        }
      }

      const newStatus = status || 'REVIEWED';
      const {
        rows: [updated],
      } = await client.query(
        `UPDATE public.material_requests SET status = $1 WHERE id = $2 RETURNING *`,
        [newStatus, id]
      );

      await client.query('COMMIT');
      return res.json({ ok: true, request: updated });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('PATCH /review error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// ── GET /pdf-data ────────────────────────────────────────────
// Returns all data needed to generate the purchase order PDF
router.get('/pdf-data', can('purchase_orders.print'), async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const employeeId = await resolveEmployeeId(req);
    const { request_ids, supplier_id, note, po_number } = req.query;

    if (!request_ids) return res.status(400).json({ ok: false, error: 'REQUEST_IDS_REQUIRED' });

    const ids = String(request_ids).split(',').map(Number).filter(Boolean);

    // 1. Company info
    const {
      rows: [company],
    } = await pool.query(
      `SELECT name, phone, admin_email, procurement_email, address, logo_url
       FROM public.companies WHERE company_id = $1`,
      [companyId]
    );

    // 2. Foreman info
    const {
      rows: [foreman],
    } = await pool.query(
      `SELECT ep.full_name, ep.contact_email, ep.phone AS foreman_phone
       FROM public.employee_profiles ep
       WHERE ep.employee_id = $1 LIMIT 1`,
      [employeeId]
    );

    // 3. Project info (from first request)
    const {
      rows: [project],
    } = await pool.query(
      `SELECT p.id, p.project_code, p.project_name, p.site_address
       FROM public.material_requests mr
       JOIN public.projects p ON p.id = mr.project_id
       WHERE mr.id = $1 AND mr.company_id = $2 LIMIT 1`,
      [ids[0], companyId]
    );

    // 4. Merged items
    const { rows: items } = await pool.query(
      `SELECT mri.item_name, SUM(mri.quantity) AS quantity, mri.unit
       FROM public.material_request_items mri
       WHERE mri.request_id = ANY($1::bigint[])
       GROUP BY mri.item_name, mri.unit
       ORDER BY mri.item_name`,
      [ids]
    );

    // 5. Supplier info (optional)
    let supplier = null;
    if (supplier_id && supplier_id !== 'procurement') {
      const {
        rows: [s],
      } = await pool.query(
        `SELECT name, email, phone, address FROM public.suppliers
         WHERE id = $1 AND company_id = $2 LIMIT 1`,
        [Number(supplier_id), companyId]
      );
      supplier = s || null;
    }

    // 6. Reference number
    const ref = `PO-${companyId}-${Date.now().toString().slice(-6)}`;

    // 7. Save purchase order record
    await pool.query(
      `INSERT INTO public.purchase_orders
         (company_id, ref, project_id, foreman_id, supplier_id, is_procurement, items, note, po_number)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        companyId,
        ref,
        project?.id || null,
        employeeId,
        supplier_id && supplier_id !== 'procurement' ? Number(supplier_id) : null,
        !supplier_id || supplier_id === 'procurement',
        JSON.stringify(items),
        note || null,
        po_number || null,
      ]
    );

    // 8. Send email
    const { sendPurchaseOrder } = require('../lib/email');
    const emailTo = supplier ? supplier.email : company.procurement_email || company.admin_email;

    if (emailTo) {
      sendPurchaseOrder({
        to: emailTo,
        ref,
        date: new Date().toLocaleDateString('en-CA'),
        companyName: company.name,
        companyPhone: company.phone,
        companyAddress: company.address,
        projectCode: project?.project_code,
        projectName: project?.project_name,
        siteAddress: project?.site_address,
        foremanName: foreman?.full_name,
        foremanPhone: foreman?.foreman_phone,
        items,
        note: note || null,
        poNumber: po_number || null,
        isProcurement: !supplier_id || supplier_id === 'procurement',
        supplierName: supplier?.name,
      }).catch((e) => console.error('[PO email error]', e.message));
    }

    return res.json({
      ok: true,
      pdf_data: {
        ref,
        po_number: po_number || null,
        date: new Date().toLocaleDateString('en-CA'),
        company,
        foreman,
        project,
        items,
        supplier,
        note: note || null,
        is_procurement: !supplier_id || supplier_id === 'procurement',
      },
    });
  } catch (err) {
    console.error('GET /pdf-data error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// ── GET /inbox/count ─────────────────────────────────────────
router.get('/inbox/count', can('hub.materials_inbox'), async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const employeeId = await resolveEmployeeId(req);
    const {
      rows: [{ count }],
    } = await pool.query(
      `SELECT COUNT(*) AS count
       FROM public.material_requests
       WHERE company_id          = $1
         AND foreman_employee_id = $2
         AND status NOT IN ('CANCELLED','SENT')`,
      [companyId, employeeId]
    );
    return res.json({ ok: true, count: Number(count) });
  } catch (err) {
    console.error('GET /inbox/count error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// ── GET /inbox ───────────────────────────────────────────────
// Returns all pending material requests assigned to this foreman
router.get('/inbox', can('hub.materials_inbox'), async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const employeeId = await resolveEmployeeId(req);

    const { rows } = await pool.query(
      `SELECT
         mr.id, mr.status, mr.note, mr.created_at, mr.project_id,
         mr.requested_by, mr.foreman_employee_id,
         p.project_code, p.project_name,
         ep.full_name AS requester_name,
         ep.trade_code,
         (
           SELECT json_agg(i ORDER BY i.id)
           FROM public.material_request_items i
           WHERE i.request_id = mr.id
         ) AS items
       FROM public.material_requests mr
       JOIN public.projects          p  ON p.id          = mr.project_id
       LEFT JOIN public.employee_profiles ep ON ep.employee_id = (
           SELECT au.employee_id FROM public.app_users au WHERE au.id = mr.requested_by LIMIT 1
         )
       WHERE mr.company_id           = $1
         AND mr.foreman_employee_id  = $2
         AND mr.status NOT IN ('CANCELLED','SENT')
       ORDER BY mr.created_at DESC`,
      [companyId, employeeId]
    );

    return res.json({ ok: true, requests: rows });
  } catch (err) {
    console.error('GET /materials/inbox error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// ── GET /catalog ─────────────────────────────────────────────
// Autocomplete endpoint — returns matching items from catalog
router.get('/catalog', can('materials.catalog_view'), async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const q = String(req.query.q || '').trim();

    let query = `
      SELECT item_name, default_unit, use_count
      FROM public.material_catalog
      WHERE company_id = $1
    `;
    const params = [companyId];

    if (q.length >= 2) {
      params.push(`%${q.toLowerCase()}%`);
      query += ` AND LOWER(item_name) LIKE $${params.length}`;
    }

    query += ' ORDER BY use_count DESC, last_used_at DESC LIMIT 10';

    const { rows } = await pool.query(query, params);
    return res.json({ ok: true, items: rows });
  } catch (err) {
    console.error('GET /catalog error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// ── GET /surplus ─────────────────────────────────────────────
// Returns available surplus items — used for smart suggestion
router.get('/surplus', can('materials.surplus_view'), async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const { item_name } = req.query;

    let q = `
      SELECT
        ri.id, ri.item_name, ri.quantity, ri.unit, ri.qty_available,
        mr.project_id, mr.id AS return_id,
        p.project_code, p.project_name
      FROM public.material_return_items ri
      JOIN public.material_returns mr ON mr.id = ri.return_id
      JOIN public.projects         p  ON p.id  = mr.project_id
      WHERE mr.company_id  = $1
        AND mr.status      = 'AVAILABLE'
        AND ri.qty_available > 0
    `;
    const params = [companyId];

    if (item_name) {
      params.push(`%${item_name.toLowerCase()}%`);
      q += ` AND LOWER(ri.item_name) LIKE $${params.length}`;
    }

    q += ' ORDER BY ri.item_name, ri.qty_available DESC';
    const { rows } = await pool.query(q, params);
    return res.json({ ok: true, surplus: rows });
  } catch (err) {
    console.error('GET /surplus error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// ── POST /returns ────────────────────────────────────────────
// Foreman declares surplus materials available from their project
router.post('/returns', can('materials.surplus_declare'), async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const employeeId = await resolveEmployeeId(req);
    const { project_id, items, note } = req.body || {};

    if (!project_id) return res.status(400).json({ ok: false, error: 'PROJECT_REQUIRED' });
    if (!Array.isArray(items) || !items.length)
      return res.status(400).json({ ok: false, error: 'ITEMS_REQUIRED' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const {
        rows: [ret],
      } = await client.query(
        `INSERT INTO public.material_returns (company_id, project_id, declared_by, note)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [companyId, project_id, employeeId, note || null]
      );

      const itemRows = [];
      for (const it of items) {
        const qty = Number(it.quantity);
        const {
          rows: [item],
        } = await client.query(
          `INSERT INTO public.material_return_items
             (return_id, item_name, item_name_raw, quantity, unit, qty_available, note)
           VALUES ($1, $2, $3, $4, $5, $4, $6) RETURNING *`,
          [
            ret.id,
            String(it.item_name).trim(),
            it.item_name_raw || null,
            qty,
            String(it.unit || 'pcs').trim(),
            it.note || null,
          ]
        );
        itemRows.push(item);
      }

      await client.query('COMMIT');
      return res.status(201).json({ ok: true, return: { ...ret, items: itemRows } });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('POST /returns error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// ── GET /returns ─────────────────────────────────────────────
router.get('/returns', can('materials.surplus_view'), async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const { project_id } = req.query;

    let q = `
      SELECT mr.*, p.project_code, p.project_name, ep.full_name AS declared_by_name,
        (SELECT json_agg(i ORDER BY i.id) FROM public.material_return_items i WHERE i.return_id = mr.id) AS items
      FROM public.material_returns mr
      JOIN public.projects p ON p.id = mr.project_id
      JOIN public.employee_profiles ep ON ep.employee_id = mr.declared_by
      WHERE mr.company_id = $1
    `;
    const params = [companyId];
    if (project_id) {
      params.push(project_id);
      q += ` AND mr.project_id = $${params.length}`;
    }
    q += ' ORDER BY mr.created_at DESC';

    const { rows } = await pool.query(q, params);
    return res.json({ ok: true, returns: rows });
  } catch (err) {
    console.error('GET /returns error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// ── GET /purchase-orders ─────────────────────────────────────
router.get('/purchase-orders', can('purchase_orders.view'), async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const employeeId = await resolveEmployeeId(req);
    const userRole = (req.user.role || '').toUpperCase();
    const isAdmin = ['COMPANY_ADMIN', 'ADMIN', 'TRADE_ADMIN'].includes(userRole);

    // Admins see all POs, foreman sees only their own
    let q = `
      SELECT
        po.id, po.ref, po.sent_at, po.note, po.is_procurement,
        po.items,
        p.project_code, p.project_name,
        ep.full_name  AS foreman_name,
        s.name        AS supplier_name,
        s.email       AS supplier_email
      FROM public.purchase_orders po
      JOIN public.projects          p  ON p.id          = po.project_id
      JOIN public.employee_profiles ep ON ep.employee_id = po.foreman_id
      LEFT JOIN public.suppliers    s  ON s.id          = po.supplier_id
      WHERE po.company_id = $1
    `;
    const params = [companyId];

    if (!isAdmin) {
      params.push(employeeId);
      q += ` AND po.foreman_id = $${params.length}`;
    }

    q += ' ORDER BY po.sent_at DESC LIMIT 100';

    const { rows } = await pool.query(q, params);
    return res.json({ ok: true, purchase_orders: rows });
  } catch (err) {
    console.error('GET /purchase-orders error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// ── GET /purchase-orders/:id ──────────────────────────────────
router.get('/purchase-orders/:id', can('purchase_orders.view'), async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const id = Number(req.params.id);

    const {
      rows: [po],
    } = await pool.query(
      `SELECT po.*, p.project_code, p.project_name, p.site_address,
              ep.full_name AS foreman_name,
              ep.phone     AS foreman_phone,
              ep.contact_email AS foreman_email,
              s.name AS supplier_name, s.email AS supplier_email,
              s.phone AS supplier_phone, s.address AS supplier_address,
              c.name AS company_name, c.address AS company_address, c.phone AS company_phone
       FROM public.purchase_orders po
       JOIN public.projects p ON p.id = po.project_id
       JOIN public.employee_profiles ep ON ep.employee_id = po.foreman_id
       LEFT JOIN public.suppliers s ON s.id = po.supplier_id
       JOIN public.companies c ON c.company_id = po.company_id
       WHERE po.id = $1 AND po.company_id = $2`,
      [id, companyId]
    );
    if (!po) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
    return res.json({ ok: true, purchase_order: po });
  } catch (err) {
    console.error('GET /purchase-orders/:id error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

module.exports = router;

// ── POST /send-order ─────────────────────────────────────────
// Foreman sends edited/merged items as a purchase order
// Body: { request_ids, items: [{item_name, qty, unit}], supplier_id, note }
router.post('/send-order', can('hub.materials_merge_send'), async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const employeeId = await resolveEmployeeId(req);
    const { request_ids, items, supplier_id, note } = req.body || {};

    if (!request_ids || !request_ids.length)
      return res.status(400).json({ ok: false, error: 'REQUEST_IDS_REQUIRED' });
    if (!Array.isArray(items) || !items.length)
      return res.status(400).json({ ok: false, error: 'ITEMS_REQUIRED' });

    const ids = request_ids.map(Number).filter(Boolean);

    // 1. Company info
    const {
      rows: [company],
    } = await pool.query(
      `SELECT name, phone, admin_email, procurement_email, address, logo_url
       FROM public.companies WHERE company_id = $1`,
      [companyId]
    );

    // 2. Foreman info
    const {
      rows: [foreman],
    } = await pool.query(
      `SELECT ep.full_name, ep.contact_email
       FROM public.employee_profiles ep
       WHERE ep.employee_id = $1 LIMIT 1`,
      [employeeId]
    );

    // 3. Project info
    const {
      rows: [project],
    } = await pool.query(
      `SELECT p.id, p.project_code, p.project_name, p.site_address
       FROM public.material_requests mr
       JOIN public.projects p ON p.id = mr.project_id
       WHERE mr.id = $1 AND mr.company_id = $2 LIMIT 1`,
      [ids[0], companyId]
    );

    // 4. Supplier info
    let supplier = null;
    if (supplier_id && supplier_id !== 'procurement') {
      const {
        rows: [s],
      } = await pool.query(
        `SELECT name, email, phone, address FROM public.suppliers
         WHERE id = $1 AND company_id = $2 LIMIT 1`,
        [Number(supplier_id), companyId]
      );
      supplier = s || null;
    }

    // 5. Reference + save PO
    const ref = `PO-${companyId}-${Date.now().toString().slice(-6)}`;
    await pool.query(
      `INSERT INTO public.purchase_orders
         (company_id, ref, project_id, foreman_id, supplier_id, is_procurement, items, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        companyId,
        ref,
        project?.id || null,
        employeeId,
        supplier_id && supplier_id !== 'procurement' ? Number(supplier_id) : null,
        !supplier_id || supplier_id === 'procurement',
        JSON.stringify(items),
        note || null,
      ]
    );

    // 6. Mark requests as SENT
    await pool.query(
      `UPDATE public.material_requests SET status = 'SENT' WHERE id = ANY($1::bigint[]) AND company_id = $2`,
      [ids, companyId]
    );

    // 7. Send email
    const { sendPurchaseOrder } = require('../lib/email');
    const emailTo = supplier ? supplier.email : company.procurement_email || company.admin_email;

    if (emailTo) {
      sendPurchaseOrder({
        to: emailTo,
        ref,
        date: new Date().toLocaleDateString('en-CA'),
        companyName: company.name,
        companyPhone: company.phone,
        companyAddress: company.address,
        projectCode: project?.project_code,
        projectName: project?.project_name,
        siteAddress: project?.site_address,
        foremanName: foreman?.full_name,
        items,
        note: note || null,
        isProcurement: !supplier_id || supplier_id === 'procurement',
        supplierName: supplier?.name,
      }).catch((e) => console.error('[PO email error]', e.message));
    }

    return res.json({ ok: true, ref });
  } catch (err) {
    console.error('POST /send-order error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});
