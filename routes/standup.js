"use strict";

// routes/standup.js
// Daily standup — foreman reviews tomorrow's plan
//
// GET  /api/standup/tomorrow          — get tomorrow's data (team + materials)
// POST /api/standup/session           — create or get standup session
// POST /api/standup/session/:id/complete — mark as done
//
// Material request integration:
// GET  /api/standup/materials/:project_id  — get/create tomorrow's material request
// POST /api/standup/materials/:request_id/items — add item
// PATCH /api/standup/materials/:request_id/items/:item_id — edit item qty
// DELETE /api/standup/materials/:request_id/items/:item_id — remove item

const express  = require('express')
const router   = express.Router()
const { pool } = require('../db')
const { can }  = require('../middleware/permissions')

const tomorrow = () => {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0]
}

// ── GET /api/standup/tomorrow ─────────────────────────────────
// Returns all projects where foreman has assignments tomorrow
// with team members and existing material requests
router.get('/tomorrow', can('standup.manage'), async (req, res) => {
  try {
    const companyId  = req.user.company_id
    const userId     = req.user.user_id
    const employeeId = req.user.employee_id
    const tmrw       = tomorrow()

    const isAdmin = req.user.role === 'COMPANY_ADMIN' || req.user.role === 'SUPER_ADMIN'

    // Get projects where there are workers assigned tomorrow
    // COMPANY_ADMIN sees all, TRADE_ADMIN sees only their projects
    const projectsRes = await pool.query(`
      SELECT DISTINCT
        p.id,
        p.project_code,
        p.project_name,
        p.site_address
      FROM public.projects p
      WHERE p.company_id = $1
        AND EXISTS (
          SELECT 1 FROM public.assignment_requests ar
          JOIN public.app_users au ON au.employee_id = ar.requested_for_employee_id
          WHERE ar.project_id = p.id
            AND ar.company_id = $1
            AND ar.status = 'APPROVED'
            AND ar.start_date <= $2::date
            AND (ar.end_date IS NULL OR ar.end_date >= $2::date)
            AND au.role = 'WORKER'
        )
        AND (
          $3 = true
          OR EXISTS (
            SELECT 1 FROM public.assignment_requests ar2
            WHERE ar2.project_id = p.id
              AND ar2.company_id = $1
              AND ar2.status = 'APPROVED'
              AND ar2.requested_by_user_id = $4
          )
          OR EXISTS (
            SELECT 1 FROM public.project_foremen pf
            WHERE pf.project_id = p.id AND pf.employee_id = $4
          )
        )
      ORDER BY p.project_code
    `, [companyId, tmrw, isAdmin, employeeId])

    const projects = []

    for (const proj of projectsRes.rows) {
      // Get team for tomorrow
      const teamRes = await pool.query(`
        SELECT
          e.id AS employee_id,
          e.first_name,
          e.last_name,
          e.employee_code,
          ep.trade_code,
          tt.name AS trade_name,
          CONCAT(ar.shift_start, '-', ar.shift_end) AS shift
        FROM public.assignment_requests ar
        JOIN public.employees e ON e.id = ar.requested_for_employee_id
        LEFT JOIN public.employee_profiles ep ON ep.employee_id = e.id
        LEFT JOIN public.trade_types tt ON tt.code = ep.trade_code
        JOIN public.app_users au ON au.employee_id = e.id
        WHERE ar.project_id = $1
          AND ar.company_id = $2
          AND ar.status = 'APPROVED'
          AND ar.start_date <= $3::date
          AND (ar.end_date IS NULL OR ar.end_date >= $3::date)
          AND au.role = 'WORKER'
        ORDER BY e.first_name
      `, [proj.id, companyId, tmrw])

      // Get or find material request for tomorrow
      const matRes = await pool.query(`
        SELECT
          mr.id,
          mr.status,
          mr.note,
          mr.created_at,
          json_agg(
            json_build_object(
              'id',       mri.id,
              'item_name',mri.item_name,
              'quantity', mri.quantity,
              'unit',     mri.unit,
              'note',     mri.note
            ) ORDER BY mri.id
          ) FILTER (WHERE mri.id IS NOT NULL) AS items
        FROM public.material_requests mr
        LEFT JOIN public.material_request_items mri ON mri.request_id = mr.id
        WHERE mr.project_id = $1
          AND mr.company_id = $2
          AND DATE(mr.created_at) = $3::date
          AND mr.status IN ('PENDING','REVIEWED')
        GROUP BY mr.id
        ORDER BY mr.created_at DESC
        LIMIT 1
      `, [proj.id, companyId, tmrw])

      // Get standup session if exists
      const sessionRes = await pool.query(`
        SELECT id, status, note, completed_at
        FROM public.standup_sessions
        WHERE company_id = $1 AND project_id = $2
          AND foreman_id = $3 AND standup_date = $4
        LIMIT 1
      `, [companyId, proj.id, userId, tmrw])

      projects.push({
        ...proj,
        standup_date:    tmrw,
        team:            teamRes.rows,
        material_request: matRes.rows[0] || null,
        session:         sessionRes.rows[0] || null,
      })
    }

    res.json({ ok: true, date: tmrw, projects })
  } catch (err) {
    console.error('GET /standup/tomorrow error:', err)
    res.status(500).json({ ok: false, error: 'SERVER_ERROR' })
  }
})

// ── POST /api/standup/session ─────────────────────────────────
// Create standup session for a project
router.post('/session', can('standup.manage'), async (req, res) => {
  try {
    const { project_id } = req.body
    const companyId = req.user.company_id
    const userId    = req.user.user_id
    const tmrw      = tomorrow()

    const result = await pool.query(`
      INSERT INTO public.standup_sessions
        (company_id, project_id, foreman_id, standup_date, status)
      VALUES ($1, $2, $3, $4, 'OPEN')
      ON CONFLICT (company_id, project_id, foreman_id, standup_date)
      DO UPDATE SET updated_at = NOW()
      RETURNING *
    `, [companyId, project_id, userId, tmrw])

    res.json({ ok: true, session: result.rows[0] })
  } catch (err) {
    console.error('POST /standup/session error:', err)
    res.status(500).json({ ok: false, error: 'SERVER_ERROR' })
  }
})

// ── POST /api/standup/session/:id/complete ────────────────────
router.post('/session/:id/complete', can('standup.manage'), async (req, res) => {
  try {
    const { note } = req.body
    const companyId = req.user.company_id

    const result = await pool.query(`
      UPDATE public.standup_sessions
      SET status = 'COMPLETED', note = $1, completed_at = NOW(), updated_at = NOW()
      WHERE id = $2 AND company_id = $3
      RETURNING *
    `, [note || null, req.params.id, companyId])

    if (!result.rows.length)
      return res.status(404).json({ ok: false, error: 'SESSION_NOT_FOUND' })

    res.json({ ok: true, session: result.rows[0] })
  } catch (err) {
    console.error('POST /standup/session/:id/complete error:', err)
    res.status(500).json({ ok: false, error: 'SERVER_ERROR' })
  }
})

// ── GET/POST /api/standup/materials/:project_id ───────────────
// Get existing or create new material request for tomorrow
router.get('/materials/:project_id', can('standup.manage'), async (req, res) => {
  try {
    const companyId = req.user.company_id
    const projectId = Number(req.params.project_id)
    const tmrw      = tomorrow()

    // Try to find existing request for tomorrow
    const existing = await pool.query(`
      SELECT
        mr.id, mr.status, mr.note,
        json_agg(
          json_build_object(
            'id',       mri.id,
            'item_name',mri.item_name,
            'quantity', mri.quantity,
            'unit',     mri.unit,
            'note',     mri.note
          ) ORDER BY mri.id
        ) FILTER (WHERE mri.id IS NOT NULL) AS items
      FROM public.material_requests mr
      LEFT JOIN public.material_request_items mri ON mri.request_id = mr.id
      WHERE mr.project_id = $1
        AND mr.company_id = $2
        AND DATE(mr.created_at) = $3::date
        AND mr.status IN ('PENDING','REVIEWED')
      GROUP BY mr.id
      ORDER BY mr.created_at DESC
      LIMIT 1
    `, [projectId, companyId, tmrw])

    if (existing.rows.length > 0) {
      return res.json({ ok: true, request: existing.rows[0], created: false })
    }

    // Find foreman for this project
    const foremanRes = await pool.query(
      `SELECT ar.requested_for_employee_id AS foreman_employee_id
       FROM public.assignment_requests ar
       WHERE ar.project_id   = $1
         AND ar.company_id   = $2
         AND ar.status       = 'APPROVED'
         AND ar.assignment_role = 'FOREMAN'
         AND ar.start_date  <= $3::date
         AND (ar.end_date IS NULL OR ar.end_date >= $3::date)
       LIMIT 1`,
      [projectId, companyId, tmrw]
    )
    const foremanId = foremanRes.rows[0]?.foreman_employee_id || null

    // Create new request with foreman_employee_id
    const newReq = await pool.query(`
      INSERT INTO public.material_requests
        (company_id, project_id, requested_by, foreman_employee_id, status, note)
      VALUES ($1, $2, $3, $4, 'PENDING', $5)
      RETURNING id, status, note
    `, [companyId, projectId, req.user.user_id, foremanId, 'Daily standup — ' + tmrw])

    res.json({ ok: true, request: { ...newReq.rows[0], items: [] }, created: true })
  } catch (err) {
    console.error('GET /standup/materials error:', err)
    res.status(500).json({ ok: false, error: 'SERVER_ERROR' })
  }
})

// ── POST /api/standup/materials/:request_id/items ─────────────
// Add item to material request
router.post('/materials/:request_id/items', can('standup.manage'), async (req, res) => {
  try {
    const { item_name, quantity, unit, note } = req.body
    const requestId = Number(req.params.request_id)
    const companyId = req.user.company_id

    // Verify request belongs to company
    const check = await pool.query(
      'SELECT id FROM public.material_requests WHERE id = $1 AND company_id = $2',
      [requestId, companyId]
    )
    if (!check.rows.length)
      return res.status(404).json({ ok: false, error: 'REQUEST_NOT_FOUND' })

    if (!item_name?.trim()) return res.status(400).json({ ok: false, error: 'ITEM_NAME_REQUIRED' })
    if (!quantity || Number(quantity) <= 0) return res.status(400).json({ ok: false, error: 'INVALID_QUANTITY' })
    if (!unit?.trim()) return res.status(400).json({ ok: false, error: 'UNIT_REQUIRED' })

    const result = await pool.query(`
      INSERT INTO public.material_request_items
        (request_id, item_name, item_name_raw, quantity, unit, note)
      VALUES ($1, $2, $2, $3, $4, $5)
      RETURNING *
    `, [requestId, item_name.trim(), Number(quantity), unit.trim(), note?.trim() || null])

    res.json({ ok: true, item: result.rows[0] })
  } catch (err) {
    console.error('POST /standup/materials/:id/items error:', err)
    res.status(500).json({ ok: false, error: 'SERVER_ERROR' })
  }
})

// ── PATCH /api/standup/materials/:request_id/items/:item_id ───
// Edit item quantity/note
router.patch('/materials/:request_id/items/:item_id', can('standup.manage'), async (req, res) => {
  try {
    const { quantity, unit, note } = req.body
    const companyId = req.user.company_id
    const requestId = Number(req.params.request_id)
    const itemId    = Number(req.params.item_id)

    const check = await pool.query(
      'SELECT id FROM public.material_requests WHERE id = $1 AND company_id = $2',
      [requestId, companyId]
    )
    if (!check.rows.length)
      return res.status(404).json({ ok: false, error: 'REQUEST_NOT_FOUND' })

    const result = await pool.query(`
      UPDATE public.material_request_items
      SET
        quantity = COALESCE($1, quantity),
        unit     = COALESCE($2, unit),
        note     = COALESCE($3, note)
      WHERE id = $4 AND request_id = $5
      RETURNING *
    `, [quantity ? Number(quantity) : null, unit?.trim() || null, note?.trim() || null, itemId, requestId])

    if (!result.rows.length)
      return res.status(404).json({ ok: false, error: 'ITEM_NOT_FOUND' })

    res.json({ ok: true, item: result.rows[0] })
  } catch (err) {
    console.error('PATCH /standup/materials item error:', err)
    res.status(500).json({ ok: false, error: 'SERVER_ERROR' })
  }
})

// ── DELETE /api/standup/materials/:request_id/items/:item_id ──
router.delete('/materials/:request_id/items/:item_id', can('standup.manage'), async (req, res) => {
  try {
    const companyId = req.user.company_id
    const requestId = Number(req.params.request_id)
    const itemId    = Number(req.params.item_id)

    const check = await pool.query(
      'SELECT id FROM public.material_requests WHERE id = $1 AND company_id = $2',
      [requestId, companyId]
    )
    if (!check.rows.length)
      return res.status(404).json({ ok: false, error: 'REQUEST_NOT_FOUND' })

    await pool.query(
      'DELETE FROM public.material_request_items WHERE id = $1 AND request_id = $2',
      [itemId, requestId]
    )

    res.json({ ok: true })
  } catch (err) {
    console.error('DELETE /standup/materials item error:', err)
    res.status(500).json({ ok: false, error: 'SERVER_ERROR' })
  }
})

module.exports = router
