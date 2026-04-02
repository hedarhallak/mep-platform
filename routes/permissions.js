"use strict";

const express  = require('express');
const router   = express.Router();
const { pool } = require('../db');
const { can, logAudit } = require('../middleware/permissions');

// Splits 'employees.view' → { module: 'employees', action: 'view' }
function parseCode(code) {
  const dot = code.indexOf('.');
  if (dot === -1) return { module: code, action: 'view' };
  return { module: code.slice(0, dot), action: code.slice(dot + 1) };
}

// ─────────────────────────────────────────────────────────────
// GET /api/permissions/matrix
// Returns { roles[], modules[], matrix: { role: { module: { action: bool } } } }
// ─────────────────────────────────────────────────────────────
router.get('/matrix', can('settings.permissions'), async (req, res) => {
  try {
    // All permission codes with their groups
    const allPerms = await pool.query(`
      SELECT code, grp FROM public.permissions ORDER BY grp, code
    `);

    // All role_permissions rows
    const rolePerms = await pool.query(`
      SELECT role, permission_code FROM public.role_permissions ORDER BY role
    `);

    // Build matrix: { role: { module: { action: bool } } }
    // First seed every role+module+action as false
    const roles   = [...new Set(rolePerms.rows.map(r => r.role))];
    const matrix  = {};

    for (const role of roles) {
      matrix[role] = {};
    }

    // Mark granted permissions as true
    for (const row of rolePerms.rows) {
      const { module, action } = parseCode(row.permission_code);
      if (!matrix[row.role][module]) matrix[row.role][module] = {};
      matrix[row.role][module][action] = true;
    }

    // Build unique modules list from permissions table
    const modules = [...new Set(allPerms.rows.map(r => r.grp))].sort();

    res.json({ roles, modules, matrix });
  } catch (err) {
    console.error('GET /permissions/matrix error:', err);
    res.status(500).json({ error: 'Failed to load permissions matrix' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/permissions/my-permissions
// Returns current user's permissions as { module: { action: true } }
// ─────────────────────────────────────────────────────────────
router.get('/my-permissions', async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.set('Pragma', 'no-cache');

    const result = await pool.query(`
      SELECT permission_code
      FROM public.role_permissions
      WHERE role = $1
    `, [req.user.role]);

    const permissions = {};

    for (const row of result.rows) {
      const { module, action } = parseCode(row.permission_code);
      if (!permissions[module]) permissions[module] = {};
      permissions[module][action] = true;
    }

    // SUPER_ADMIN gets everything
    if (req.user.role === 'SUPER_ADMIN') {
      const allPerms = await pool.query(`SELECT code FROM public.permissions`);
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

// ─────────────────────────────────────────────────────────────
// GET /api/permissions/role/:role
// Returns all permission_codes for a role
// ─────────────────────────────────────────────────────────────
router.get('/role/:role', can('settings.permissions'), async (req, res) => {
  try {
    const { role } = req.params;
    const validRoles = ['SUPER_ADMIN','IT_ADMIN','COMPANY_ADMIN','TRADE_PROJECT_MANAGER','TRADE_ADMIN','WORKER'];
    if (!validRoles.includes(role)) return res.status(400).json({ error: 'Invalid role' });

    const result = await pool.query(`
      SELECT rp.permission_code, p.description, p.grp
      FROM public.role_permissions rp
      JOIN public.permissions p ON p.code = rp.permission_code
      WHERE rp.role = $1
      ORDER BY p.grp, rp.permission_code
    `, [role]);

    res.json({ role, permissions: result.rows });
  } catch (err) {
    console.error('GET /permissions/role/:role error:', err);
    res.status(500).json({ error: 'Failed to load role permissions' });
  }
});

// ─────────────────────────────────────────────────────────────
// PUT /api/permissions/role/:role
// Body: { permissions: [{ module, action, allowed }] }
// Converts module+action back to permission_code for DB ops
// ─────────────────────────────────────────────────────────────
router.put('/role/:role', can('settings.permissions'), async (req, res) => {
  const client = await pool.connect();
  try {
    const { role } = req.params;
    const { permissions } = req.body;

    const validRoles = ['SUPER_ADMIN','IT_ADMIN','COMPANY_ADMIN','TRADE_PROJECT_MANAGER','TRADE_ADMIN','WORKER'];
    if (!validRoles.includes(role)) return res.status(400).json({ error: 'Invalid role' });

    if (!Array.isArray(permissions) || permissions.length === 0) {
      return res.status(400).json({ error: 'permissions array is required' });
    }

    const callerRank = { SUPER_ADMIN: 0, IT_ADMIN: 1, COMPANY_ADMIN: 2, TRADE_PROJECT_MANAGER: 3, TRADE_ADMIN: 4, WORKER: 5 };
    if (callerRank[req.user.role] >= callerRank[role]) {
      return res.status(403).json({ error: 'Cannot edit permissions for a role equal or higher than yours' });
    }

    await client.query('BEGIN');

    // Delete all current permissions for this role
    await client.query(`DELETE FROM public.role_permissions WHERE role = $1`, [role]);

    // Re-insert only the allowed ones
    for (const perm of permissions) {
      const { module, action, allowed } = perm;
      if (!allowed) continue;
      const code = `${module}.${action}`;

      // Only insert if the code exists in the permissions master table
      await client.query(`
        INSERT INTO public.role_permissions (role, permission_code)
        SELECT $1, $2 WHERE EXISTS (SELECT 1 FROM public.permissions WHERE code = $2)
        ON CONFLICT DO NOTHING
      `, [role, code]);
    }

    logAudit(req, 'UPDATE_PERMISSIONS', 'role_permissions', null, null, { role });

    await client.query('COMMIT');

    res.json({ success: true, message: `Permissions updated for role: ${role}` });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('PUT /permissions/role/:role error:', err);
    res.status(500).json({ error: 'Failed to update permissions' });
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/permissions/reset/:role
// Resets role to seeded defaults by re-running seed logic
// Only SUPER_ADMIN / IT_ADMIN
// ─────────────────────────────────────────────────────────────
router.post('/reset/:role', can('settings.permissions'), async (req, res) => {
  const client = await pool.connect();
  try {
    if (!['SUPER_ADMIN', 'IT_ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only SUPER_ADMIN or IT_ADMIN can reset roles' });
    }

    const { role } = req.params;
    const validRoles = ['SUPER_ADMIN','IT_ADMIN','COMPANY_ADMIN','TRADE_PROJECT_MANAGER','TRADE_ADMIN','WORKER'];
    if (!validRoles.includes(role)) return res.status(400).json({ error: 'Invalid role' });

    const defaults = {
      IT_ADMIN: [
        'dashboard.view',
        'settings.system','settings.company','settings.user_management','settings.permissions',
        'audit.view',
        'employees.view','employees.create','employees.edit','employees.delete','employees.invite'
      ],
      COMPANY_ADMIN: [
        'dashboard.view',
        'employees.view','employees.create','employees.edit','employees.delete','employees.invite',
        'projects.view','projects.create','projects.edit','projects.delete',
        'suppliers.view','suppliers.create','suppliers.edit','suppliers.delete',
        'assignments.view','attendance.view',
        'materials.request_view_all','materials.catalog_view','materials.surplus_view',
        'purchase_orders.view','purchase_orders.print',
        'bi.access_full','bi.access_own_trade','bi.workforce_planner',
        'settings.company','settings.user_management','audit.view'
      ],
      TRADE_PROJECT_MANAGER: [
        'dashboard.view',
        'employees.view_own_trade','projects.view_own_trade','suppliers.view',
        'assignments.view_own_trade','attendance.view_own_trade',
        'materials.request_view_own_trade','materials.catalog_view','materials.surplus_view',
        'purchase_orders.view_own_trade','purchase_orders.print',
        'bi.access_own_trade','bi.workforce_planner'
      ],
      TRADE_ADMIN: [
        'dashboard.view',
        'employees.view_own_trade','projects.view_own_trade','suppliers.view',
        'assignments.view_own_trade','assignments.create','assignments.edit','assignments.delete','assignments.smart_assign',
        'attendance.view_own_trade','attendance.checkin','attendance.approve','attendance.overtime_approve',
        'hub.access','hub.materials_inbox','hub.materials_merge_send','hub.attendance_approval',
        'materials.request_submit','materials.request_view_own','materials.request_view_own_trade',
        'materials.catalog_view','materials.surplus_view','materials.surplus_declare',
        'purchase_orders.view_own_trade','purchase_orders.print'
      ],
      WORKER: [
        'dashboard.view',
        'attendance.view_self','attendance.checkin',
        'materials.request_submit','materials.request_view_own','materials.catalog_view',
        'purchase_orders.view_own'
      ],
    };

    await client.query('BEGIN');
    await client.query(`DELETE FROM public.role_permissions WHERE role = $1`, [role]);

    const codes = role === 'SUPER_ADMIN'
      ? (await client.query(`SELECT code FROM public.permissions`)).rows.map(r => r.code)
      : (defaults[role] || []);

    for (const code of codes) {
      await client.query(`
        INSERT INTO public.role_permissions (role, permission_code) VALUES ($1, $2) ON CONFLICT DO NOTHING
      `, [role, code]);
    }

    logAudit(req, 'RESET_PERMISSIONS', 'role_permissions', null, null, { role });

    await client.query('COMMIT');

    res.json({ success: true, message: `Role "${role}" reset to defaults` });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('POST /permissions/reset/:role error:', err);
    res.status(500).json({ error: 'Failed to reset permissions' });
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/permissions/audit
// ─────────────────────────────────────────────────────────────
router.get('/audit', can('settings.permissions'), async (req, res) => {
  try {
    const result = await pool.query(`
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
    `, [req.user.company_id]);

    res.json({ audit: result.rows });
  } catch (err) {
    console.error('GET /permissions/audit error:', err);
    res.status(500).json({ error: 'Failed to load audit log' });
  }
});

module.exports = router;
