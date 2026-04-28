'use strict';

/**
 * routes/ccq_rates.js
 * SUPER_ADMIN only — manage CCQ travel allowance rates
 *
 * GET    /api/super/ccq-rates          — list all rates
 * POST   /api/super/ccq-rates          — add rate row
 * PATCH  /api/super/ccq-rates/:id      — update rate row
 * DELETE /api/super/ccq-rates/:id      — delete rate row
 * GET    /api/super/ccq-rates/expiring — rates expiring within 60 days
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../db');

const TRADES = ['GENERAL', 'ELECTRICAL', 'PLUMBING', 'HVAC', 'CARPENTRY', 'ELEVATOR_TECH'];
const SECTORS = ['IC', 'I', 'RESIDENTIAL'];

// ── GET /api/super/ccq-rates ─────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT * FROM public.ccq_travel_rates
      ORDER BY trade_code, sector, min_km, effective_from
    `);
    return res.json({ ok: true, rates: rows });
  } catch (err) {
    console.error('GET /ccq-rates error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// ── GET /api/super/ccq-rates/expiring ────────────────────────
router.get('/expiring', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT * FROM public.ccq_travel_rates
      WHERE effective_to < CURRENT_DATE + INTERVAL '60 days'
        AND effective_to >= CURRENT_DATE
      ORDER BY effective_to ASC, trade_code, min_km
    `);
    return res.json({ ok: true, expiring: rows, count: rows.length });
  } catch (err) {
    console.error('GET /ccq-rates/expiring error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// ── POST /api/super/ccq-rates ────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { trade_code, sector, min_km, rate_cad, tax_form, effective_from, effective_to, notes } =
      req.body || {};

    if (!trade_code || !TRADES.includes(trade_code.toUpperCase()))
      return res.status(400).json({ ok: false, error: 'INVALID_TRADE_CODE' });
    if (!sector || !SECTORS.includes(sector.toUpperCase()))
      return res.status(400).json({ ok: false, error: 'INVALID_SECTOR' });
    if (min_km == null || isNaN(parseFloat(min_km)))
      return res.status(400).json({ ok: false, error: 'MIN_KM_REQUIRED' });
    if (rate_cad == null || isNaN(parseFloat(rate_cad)))
      return res.status(400).json({ ok: false, error: 'RATE_REQUIRED' });
    if (!effective_from || !effective_to)
      return res.status(400).json({ ok: false, error: 'DATES_REQUIRED' });
    if (effective_from > effective_to)
      return res.status(400).json({ ok: false, error: 'INVALID_DATE_RANGE' });

    const { rows } = await pool.query(
      `
      INSERT INTO public.ccq_travel_rates
        (trade_code, sector, min_km, rate_cad, tax_form, effective_from, effective_to, notes, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `,
      [
        trade_code.toUpperCase(),
        sector.toUpperCase(),
        parseFloat(min_km),
        parseFloat(rate_cad),
        tax_form || null,
        effective_from,
        effective_to,
        notes || null,
        req.user?.user_id || null,
      ]
    );

    return res.status(201).json({ ok: true, rate: rows[0] });
  } catch (err) {
    console.error('POST /ccq-rates error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// ── PATCH /api/super/ccq-rates/:id ───────────────────────────
router.patch('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { rate_cad, tax_form, effective_from, effective_to, notes } = req.body || {};

    const fields = [];
    const params = [];

    if (rate_cad != null) {
      params.push(parseFloat(rate_cad));
      fields.push(`rate_cad = $${params.length}`);
    }
    if (tax_form !== undefined) {
      params.push(tax_form || null);
      fields.push(`tax_form = $${params.length}`);
    }
    if (effective_from) {
      params.push(effective_from);
      fields.push(`effective_from = $${params.length}`);
    }
    if (effective_to) {
      params.push(effective_to);
      fields.push(`effective_to = $${params.length}`);
    }
    if (notes !== undefined) {
      params.push(notes || null);
      fields.push(`notes = $${params.length}`);
    }

    if (!fields.length) return res.status(400).json({ ok: false, error: 'NOTHING_TO_UPDATE' });

    params.push(id);
    const { rows } = await pool.query(
      `
      UPDATE public.ccq_travel_rates
      SET ${fields.join(', ')}, updated_at = NOW()
      WHERE id = $${params.length}
      RETURNING *
    `,
      params
    );

    if (!rows.length) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });

    return res.json({ ok: true, rate: rows[0] });
  } catch (err) {
    console.error('PATCH /ccq-rates/:id error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// ── DELETE /api/super/ccq-rates/:id ──────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query(`DELETE FROM public.ccq_travel_rates WHERE id = $1`, [
      Number(req.params.id),
    ]);
    if (!rowCount) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
    return res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /ccq-rates/:id error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

module.exports = router;
