"use strict";

/**
 * routes/suppliers.js
 *
 * GET    /api/suppliers          — list suppliers (filter by trade_code)
 * POST   /api/suppliers          — create supplier (admin only)
 * PATCH  /api/suppliers/:id      — update supplier (admin only)
 * DELETE /api/suppliers/:id      — deactivate supplier (admin only)
 */

const router = require("express").Router();
const { pool } = require("../db");
const { normalizeRole } = require("../middleware/roles");

function requireRoles(allowed) {
  const normalized = allowed.map(r => normalizeRole(r));
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ ok: false, error: "UNAUTHENTICATED" });
    const userRole = normalizeRole(req.user.role);
    if (userRole === "SUPER_ADMIN") return next();
    if (!normalized.includes(userRole))
      return res.status(403).json({ ok: false, error: "FORBIDDEN" });
    return next();
  };
}
const ANY        = requireRoles(["COMPANY_ADMIN","ADMIN","TRADE_ADMIN","PROJECT_MANAGER","PM","WORKER"]);
const ADMIN_ONLY = requireRoles(["COMPANY_ADMIN","ADMIN"]);

const VALID_TRADES = ['PLUMBING','ELECTRICAL','HVAC','CARPENTRY','GENERAL','ALL'];

// ── GET /suppliers ───────────────────────────────────────────
router.get("/", ANY, async (req, res) => {
  try {
    const companyId  = req.user.company_id;
    const { trade_code } = req.query;

    let q = `
      SELECT id, name, email, phone, address, trade_code, note, is_active, created_at
      FROM public.suppliers
      WHERE company_id = $1 AND is_active = TRUE
    `;
    const params = [companyId];

    if (trade_code && trade_code !== 'ALL') {
      params.push(trade_code.toUpperCase());
      q += ` AND (trade_code = $${params.length} OR trade_code = 'ALL')`;
    }

    q += " ORDER BY name ASC";
    const { rows } = await pool.query(q, params);
    return res.json({ ok: true, suppliers: rows });
  } catch (err) {
    console.error("GET /suppliers error:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

// ── POST /suppliers ──────────────────────────────────────────
router.post("/", ADMIN_ONLY, async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const { name, email, phone, address, trade_code, note } = req.body || {};

    if (!name?.trim())  return res.status(400).json({ ok: false, error: "NAME_REQUIRED" });
    if (!email?.trim()) return res.status(400).json({ ok: false, error: "EMAIL_REQUIRED" });
    if (!phone?.trim()) return res.status(400).json({ ok: false, error: "PHONE_REQUIRED" });

    const trade = trade_code?.toUpperCase() || 'ALL';
    if (!VALID_TRADES.includes(trade))
      return res.status(400).json({ ok: false, error: "INVALID_TRADE_CODE" });

    const { rows: [supplier] } = await pool.query(
      `INSERT INTO public.suppliers (company_id, name, email, phone, address, trade_code, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [companyId, name.trim(), email.trim(), phone.trim(), address?.trim() || null, trade, note?.trim() || null]
    );
    return res.status(201).json({ ok: true, supplier });
  } catch (err) {
    if (err.code === '23505')
      return res.status(409).json({ ok: false, error: "SUPPLIER_EXISTS", message: "A supplier with this name already exists." });
    console.error("POST /suppliers error:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

// ── PATCH /suppliers/:id ─────────────────────────────────────
router.patch("/:id", ADMIN_ONLY, async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const id = Number(req.params.id);
    const { name, email, phone, address, trade_code, note, is_active } = req.body || {};

    const existing = await pool.query(
      `SELECT id FROM public.suppliers WHERE id = $1 AND company_id = $2 LIMIT 1`,
      [id, companyId]
    );
    if (!existing.rows.length)
      return res.status(404).json({ ok: false, error: "NOT_FOUND" });

    const trade = trade_code ? trade_code.toUpperCase() : undefined;
    if (trade && !VALID_TRADES.includes(trade))
      return res.status(400).json({ ok: false, error: "INVALID_TRADE_CODE" });

    const { rows: [updated] } = await pool.query(
      `UPDATE public.suppliers SET
         name       = COALESCE($1, name),
         email      = COALESCE($2, email),
         phone      = COALESCE($3, phone),
         address    = COALESCE($4, address),
         trade_code = COALESCE($5, trade_code),
         note       = COALESCE($6, note),
         is_active  = COALESCE($7, is_active)
       WHERE id = $8 AND company_id = $9
       RETURNING *`,
      [name?.trim(), email?.trim(), phone?.trim(), address?.trim(), trade, note?.trim(), is_active, id, companyId]
    );
    return res.json({ ok: true, supplier: updated });
  } catch (err) {
    if (err.code === '23505')
      return res.status(409).json({ ok: false, error: "SUPPLIER_EXISTS", message: "A supplier with this name already exists." });
    console.error("PATCH /suppliers error:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

// ── DELETE /suppliers/:id (soft delete) ──────────────────────
router.delete("/:id", ADMIN_ONLY, async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const id = Number(req.params.id);

    const { rows: [updated] } = await pool.query(
      `UPDATE public.suppliers SET is_active = FALSE
       WHERE id = $1 AND company_id = $2 RETURNING id`,
      [id, companyId]
    );
    if (!updated) return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    return res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /suppliers error:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

module.exports = router;
