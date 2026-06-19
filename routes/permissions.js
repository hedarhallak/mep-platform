'use strict';

/**
 * routes/permissions.js — RBAC matrix admin endpoints.
 *
 * Section 89-C/11: in-handler queries migrated from `pool.query` to
 * `req.db.query`. This is a **light-touch migration**: most of the
 * tables used here (`public.permissions`, `public.role_permissions`)
 * are GLOBAL system config, not tenant-scoped, so RLS doesn't actually
 * enforce anything new on them. The only company-scoped query is
 * `GET /audit`, which already filters on `WHERE al.company_id = $1`.
 * We migrate anyway for consistency — every authenticated route should
 * eventually run through tenantDb so the GUC is always set, even if
 * the specific queries don't depend on it.
 *
 * The two pre-existing manual `pool.connect()/BEGIN/COMMIT` blocks
 * (PUT /role/:role, POST /reset/:role) collapsed to plain sequences of
 * `req.db.query` calls — same pattern as 89-C/4, /9, /10.
 */

const express = require('express');
const router = express.Router();
const { can, logAudit } = require('../middleware/permissions');
const { normalizeRole } = require('../middleware/roles');
const { ROLE_DEFAULT_PERMISSIONS } = require('../lib/role_defaults');

// Splits 'employees.view' → { module: 'employees', action: 'view' }
function parseCode(code) {
  const dot = code.indexOf('.');
  if (dot === -1) return { module: code, action: 'view' };
  return { module: code.slice(0, dot), action: code.slice(dot + 1) };
}

// ─────────────────────────────────────────────────────────────────
// GET /api/permissions/matrix
// Returns { roles[], modules[], matrix: { role: { module: { action: bool } } } }
// ─────────────────────────────────────────────────────────────────
router.get('/matrix', can('settings.permissions'), async (req, res) => {
  try {
    // All permission codes with their groups
    const allPerms = await req.db.query(`
      SELECT code, grp FROM public.permissions ORDER BY grp, code
    `);

    // Global role defaults.
    const rolePerms = await req.db.query(`
      SELECT role, permission_code FROM public.role_permissions ORDER BY role
    `);

    // §148 Phase 3b: the matrix a caller sees is their company's EFFECTIVE
    // permissions = global defaults overlaid with this company's overrides.
    // A SUPER_ADMIN (platform) edits the global defaults directly → no overlay.
    const granted = {}; // role -> Set(permission_code)
    for (const row of rolePerms.rows) {
      (granted[row.role] = granted[row.role] || new Set()).add(row.permission_code);
    }

    const companyId = req.user.company_id ? Number(req.user.company_id) : null;
    const isPlatform = normalizeRole(req.user.role) === 'SUPER_ADMIN';
    if (!isPlatform && companyId) {
      const ov = await req.db.query(
        `SELECT role, permission_code, granted
           FROM public.company_role_permissions WHERE company_id = $1`,
        [companyId]
      );
      for (const row of ov.rows) {
        const set = (granted[row.role] = granted[row.role] || new Set());
        if (row.granted) set.add(row.permission_code);
        else set.delete(row.permission_code);
      }
    }

    // Build matrix: { role: { module: { action: true } } } from the effective sets.
    const roles = Object.keys(granted);
    const matrix = {};
    for (const role of roles) {
      matrix[role] = {};
      for (const code of granted[role]) {
        const { module, action } = parseCode(code);
        if (!matrix[role][module]) matrix[role][module] = {};
        matrix[role][module][action] = true;
      }
    }

    // Build unique modules list from permissions table
    const modules = [...new Set(allPerms.rows.map((r) => r.grp))].sort();

    // §148 Phase 2 — full catalog keyed the SAME way the matrix is (parseCode
    // module → its actions), so the frontend can render EVERY permission toggle
    // (not a hardcoded module/action grid). Includes ungranted codes too.
    const catalog = {};
    for (const row of allPerms.rows) {
      const { module, action } = parseCode(row.code);
      if (!catalog[module]) catalog[module] = [];
      if (!catalog[module].includes(action)) catalog[module].push(action);
    }
    // Stable display order: common CRUD actions first, then the rest A→Z.
    const ACTION_ORDER = ['view', 'create', 'edit', 'delete', 'approve'];
    for (const m of Object.keys(catalog)) {
      catalog[m].sort((a, b) => {
        const ia = ACTION_ORDER.indexOf(a);
        const ib = ACTION_ORDER.indexOf(b);
        if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
        return a.localeCompare(b);
      });
    }

    res.json({ roles, modules, matrix, catalog });
  } catch (err) {
    console.error('GET /permissions/matrix error:', err);
    res.status(500).json({ error: 'Failed to load permissions matrix' });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/permissions/roles
// The data-driven role catalog (§148, migration 035) — role_key + label +
// rank + category, ordered senior→junior. Lets the frontend render roles from
// the DB instead of a hardcoded array, so adding a role is a data change.
// ─────────────────────────────────────────────────────────────────
router.get('/roles', can('settings.permissions'), async (req, res) => {
  try {
    const { rows } = await req.db.query(
      `SELECT role_key, label, rank, category, is_active
         FROM public.roles
        WHERE is_active = true
        ORDER BY rank DESC NULLS LAST, role_key`
    );
    res.json({ ok: true, roles: rows });
  } catch (err) {
    console.error('GET /permissions/roles error:', err);
    res.status(500).json({ error: 'Failed to load roles' });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/permissions/my-permissions
// Returns current user's permissions as { module: { action: true } }
// ─────────────────────────────────────────────────────────────────
router.get('/my-permissions', async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.set('Pragma', 'no-cache');

    const role = normalizeRole(req.user.role);
    const result = await req.db.query(
      `
      SELECT permission_code
      FROM public.role_permissions
      WHERE role = $1
    `,
      [role]
    );

    // §148 Phase 3b: the user's EFFECTIVE permissions = global default for their
    // role overlaid with their company's overrides. Mirrors the can() resolution
    // (company layer) so the UI menu matches what the backend actually enforces.
    const codes = new Set(result.rows.map((r) => r.permission_code));
    const companyId = req.user.company_id ? Number(req.user.company_id) : null;
    if (companyId && role !== 'SUPER_ADMIN') {
      const ov = await req.db.query(
        `SELECT permission_code, granted
           FROM public.company_role_permissions WHERE company_id = $1 AND role = $2`,
        [companyId, role]
      );
      for (const r of ov.rows) {
        if (r.granted) codes.add(r.permission_code);
        else codes.delete(r.permission_code);
      }
    }

    const permissions = {};

    for (const code of codes) {
      const { module, action } = parseCode(code);
      if (!permissions[module]) permissions[module] = {};
      permissions[module][action] = true;
    }

    // SUPER_ADMIN gets everything
    if (role === 'SUPER_ADMIN') {
      const allPerms = await req.db.query(`SELECT code FROM public.permissions`);
      for (const row of allPerms.rows) {
        const { module, action } = parseCode(row.code);
        if (!permissions[module]) permissions[module] = {};
        permissions[module][action] = true;
      }
    }

    res.json({ role: req.user.role, permissions });
  } catch (err) {
    console.error('GET /permissions/my-permissions error:', err);
    res.status(500).json({ error: 'Failed to load user permissions' });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/permissions/role/:role
// Returns all permission_codes for a role
// ─────────────────────────────────────────────────────────────────
router.get('/role/:role', can('settings.permissions'), async (req, res) => {
  try {
    const { role } = req.params;
    // §148 — validate against the data-driven roles catalog (was a hardcoded list).
    const { rows: rExists } = await req.db.query(`SELECT 1 FROM public.roles WHERE role_key = $1`, [
      role,
    ]);
    if (!rExists.length) return res.status(400).json({ error: 'Invalid role' });

    const result = await req.db.query(
      `
      SELECT rp.permission_code, p.description, p.grp
      FROM public.role_permissions rp
      JOIN public.permissions p ON p.code = rp.permission_code
      WHERE rp.role = $1
      ORDER BY p.grp, rp.permission_code
    `,
      [role]
    );

    res.json({ role, permissions: result.rows });
  } catch (err) {
    console.error('GET /permissions/role/:role error:', err);
    res.status(500).json({ error: 'Failed to load role permissions' });
  }
});

// ─────────────────────────────────────────────────────────────────
// PUT /api/permissions/role/:role
// Body: { permissions: [{ module, action, allowed }] }
// Converts module+action back to permission_code for DB ops.
// 89-C/11: manual transaction flattened — tenantDb wraps the whole
// request in one transaction already.
// ─────────────────────────────────────────────────────────────────
router.put('/role/:role', can('settings.permissions'), async (req, res) => {
  try {
    const { role } = req.params;
    const { permissions } = req.body;

    if (!Array.isArray(permissions) || permissions.length === 0) {
      return res.status(400).json({ error: 'permissions array is required' });
    }

    // §148 — validate the role + enforce the rank-lock from the data-driven
    // `roles` catalog (roles.rank: HIGHER = more senior). You may edit ONLY a
    // role ranked strictly below yours. SUPER_ADMIN passes can() anyway and
    // (rank 100) outranks every role. normalizeRole maps any legacy alias.
    const callerKey = normalizeRole(req.user.role);
    const { rows: rk } = await req.db.query(
      `SELECT role_key, rank FROM public.roles WHERE role_key = ANY($1::text[])`,
      [[role, callerKey]]
    );
    const target = rk.find((r) => r.role_key === role);
    if (!target) return res.status(400).json({ error: 'Invalid role' });
    const callerRank = rk.find((r) => r.role_key === callerKey)?.rank ?? 0;
    if (callerRank <= (target.rank ?? 0)) {
      return res
        .status(403)
        .json({ error: 'Cannot edit permissions for a role equal or higher than yours' });
    }

    const companyId = req.user.company_id ? Number(req.user.company_id) : null;
    const isPlatform = callerKey === 'SUPER_ADMIN';

    if (isPlatform) {
      // Platform edits the GLOBAL defaults (unchanged behaviour).
      await req.db.query(`DELETE FROM public.role_permissions WHERE role = $1`, [role]);
      for (const perm of permissions) {
        const { module, action, allowed } = perm;
        if (!allowed) continue;
        const code = `${module}.${action}`;
        await req.db.query(
          `INSERT INTO public.role_permissions (role, permission_code)
           SELECT $1, $2 WHERE EXISTS (SELECT 1 FROM public.permissions WHERE code = $2)
           ON CONFLICT DO NOTHING`,
          [role, code]
        );
      }
      await logAudit(req, 'UPDATE_PERMISSIONS', 'role_permissions', null, null, { role });
    } else {
      // §148 Phase 3b: a company admin edits THEIR company's overrides only. We
      // store the DIFF vs the global default — a value matching the default
      // removes any override (falls through), a differing value is upserted —
      // so company_role_permissions stays minimal and "reset" = delete its rows.
      if (!companyId) return res.status(400).json({ error: 'No company context' });
      const { rows: defRows } = await req.db.query(
        `SELECT permission_code FROM public.role_permissions WHERE role = $1`,
        [role]
      );
      const defaultSet = new Set(defRows.map((r) => r.permission_code));
      const userId = req.user.user_id ? Number(req.user.user_id) : null;
      for (const perm of permissions) {
        const { module, action, allowed } = perm;
        const code = `${module}.${action}`;
        const desired = !!allowed;
        if (desired === defaultSet.has(code)) {
          await req.db.query(
            `DELETE FROM public.company_role_permissions
              WHERE company_id = $1 AND role = $2 AND permission_code = $3`,
            [companyId, role, code]
          );
        } else {
          await req.db.query(
            `INSERT INTO public.company_role_permissions (company_id, role, permission_code, granted, updated_by)
             SELECT $1, $2, $3, $4, $5 WHERE EXISTS (SELECT 1 FROM public.permissions WHERE code = $3)
             ON CONFLICT (company_id, role, permission_code)
             DO UPDATE SET granted = EXCLUDED.granted, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
            [companyId, role, code, desired, userId]
          );
        }
      }
      await logAudit(req, 'UPDATE_COMPANY_PERMISSIONS', 'company_role_permissions', null, null, {
        role,
        company_id: companyId,
      });
    }

    res.json({ success: true, message: `Permissions updated for role: ${role}` });
  } catch (err) {
    console.error('PUT /permissions/role/:role error:', err);
    res.status(500).json({ error: 'Failed to update permissions' });
  }
});

// ─────────────────────────────────────────────────────────────────
// POST /api/permissions/reset/:role
// Resets role to seeded defaults by re-running seed logic.
// Only SUPER_ADMIN / IT_ADMIN.
// 89-C/11: manual transaction flattened.
// ─────────────────────────────────────────────────────────────────
router.post('/reset/:role', can('settings.permissions'), async (req, res) => {
  try {
    const callerKey = normalizeRole(req.user.role);
    const isPlatform = callerKey === 'SUPER_ADMIN';
    // Platform resets the GLOBAL default; a company admin (IT_ADMIN / OWNER /
    // COMPANY_ADMIN) resets THEIR company's overrides back to the default.
    if (!isPlatform && !['IT_ADMIN', 'OWNER', 'COMPANY_ADMIN'].includes(callerKey)) {
      return res.status(403).json({ error: 'Not allowed to reset roles' });
    }

    const { role } = req.params;
    // §148 — validate against the data-driven roles catalog (was a hardcoded list).
    const { rows: rExists } = await req.db.query(`SELECT 1 FROM public.roles WHERE role_key = $1`, [
      role,
    ]);
    if (!rExists.length) return res.status(400).json({ error: 'Invalid role' });

    if (!isPlatform) {
      // §148 Phase 3b: revert this company's tuning for the role — drop its
      // override rows so resolution falls back to the global default.
      const companyId = req.user.company_id ? Number(req.user.company_id) : null;
      if (!companyId) return res.status(400).json({ error: 'No company context' });
      await req.db.query(
        `DELETE FROM public.company_role_permissions WHERE company_id = $1 AND role = $2`,
        [companyId, role]
      );
      await logAudit(req, 'RESET_COMPANY_PERMISSIONS', 'company_role_permissions', null, null, {
        role,
        company_id: companyId,
      });
      return res.json({ success: true, message: `Role "${role}" reset to defaults` });
    }

    // §148 — canonical defaults live in lib/role_defaults.js (single source).
    const defaults = ROLE_DEFAULT_PERMISSIONS;

    // §148 guard: don't silently WIPE a role that has no hardcoded default set
    // (e.g. OWNER, or any future catalog role) — `defaults[role] || []` would
    // delete-then-insert-nothing. Reset is only meaningful for roles with a
    // defined default. SUPER_ADMIN resets to the full catalog.
    if (role !== 'SUPER_ADMIN' && !defaults[role]) {
      return res.status(400).json({ error: 'No default permission set defined for this role' });
    }

    await req.db.query(`DELETE FROM public.role_permissions WHERE role = $1`, [role]);

    const codes =
      role === 'SUPER_ADMIN'
        ? (await req.db.query(`SELECT code FROM public.permissions`)).rows.map((r) => r.code)
        : defaults[role] || [];

    for (const code of codes) {
      await req.db.query(
        `
        INSERT INTO public.role_permissions (role, permission_code) VALUES ($1, $2) ON CONFLICT DO NOTHING
      `,
        [role, code]
      );
    }

    await logAudit(req, 'RESET_PERMISSIONS', 'role_permissions', null, null, { role });

    res.json({ success: true, message: `Role "${role}" reset to defaults` });
  } catch (err) {
    console.error('POST /permissions/reset/:role error:', err);
    res.status(500).json({ error: 'Failed to reset permissions' });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/permissions/audit
// Tenant-scoped — only this endpoint actually benefits from RLS.
// ─────────────────────────────────────────────────────────────────
router.get('/audit', can('settings.permissions'), async (req, res) => {
  try {
    const result = await req.db.query(
      `
      SELECT
        al.id,
        al.action,
        al.entity_type,
        al.new_values  AS details,
        al.created_at,
        al.username    AS changed_by,
        al.role        AS changer_role
      FROM public.audit_logs al
      WHERE al.company_id = $1
        AND al.entity_type = 'role_permissions'
      ORDER BY al.created_at DESC
      LIMIT 50
    `,
      [req.user.company_id]
    );

    res.json({ audit: result.rows });
  } catch (err) {
    console.error('GET /permissions/audit error:', err);
    res.status(500).json({ error: 'Failed to load audit log' });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/permissions/owner-audit  (§132 / §140 Slice 2a)
// OWNER-only sensitive-edit audit viewer: the high-risk old→new diffs
// (project site/location/sector, assignment shift/date/project moves,
// attendance edits, company settings) — the fraud-detection picture
// (§132.7). Gated by `audit.view` (OWNER only; SUPER_ADMIN bypasses).
// Tenant-scoped via req.db (RLS) + explicit company_id (defense-in-depth).
// ─────────────────────────────────────────────────────────────────
const SENSITIVE_AUDIT_ACTIONS = [
  'PROJECT_UPDATED',
  'PROJECT_DELETED',
  'ASSIGNMENT_UPDATED',
  'ASSIGNMENT_DELETED',
  'ATTENDANCE_CHECKIN',
  'ATTENDANCE_CHECKOUT',
  'ATTENDANCE_CONFIRMED',
  'COMPANY_UPDATED',
];

router.get('/owner-audit', can('audit.view'), async (req, res) => {
  try {
    const result = await req.db.query(
      `SELECT al.id, al.action, al.entity_type, al.entity_id, al.entity_name,
              al.old_values, al.new_values,
              al.username AS changed_by, al.role AS changer_role,
              al.ip_address, al.created_at
         FROM public.audit_logs al
        WHERE al.company_id = $1
          AND al.action = ANY($2)
        ORDER BY al.created_at DESC
        LIMIT 200`,
      [req.user.company_id, SENSITIVE_AUDIT_ACTIONS]
    );
    res.json({ audit: result.rows });
  } catch (err) {
    console.error('GET /permissions/owner-audit error:', err);
    res.status(500).json({ error: 'Failed to load sensitive-edit audit' });
  }
});

module.exports = router;
