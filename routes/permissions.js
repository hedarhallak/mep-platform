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

    // All role_permissions rows
    const rolePerms = await req.db.query(`
      SELECT role, permission_code FROM public.role_permissions ORDER BY role
    `);

    // Build matrix: { role: { module: { action: bool } } }
    // First seed every role+module+action as false
    const roles = [...new Set(rolePerms.rows.map((r) => r.role))];
    const matrix = {};

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
    const modules = [...new Set(allPerms.rows.map((r) => r.grp))].sort();

    res.json({ roles, modules, matrix });
  } catch (err) {
    console.error('GET /permissions/matrix error:', err);
    res.status(500).json({ error: 'Failed to load permissions matrix' });
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

    const result = await req.db.query(
      `
      SELECT permission_code
      FROM public.role_permissions
      WHERE role = $1
    `,
      [req.user.role]
    );

    const permissions = {};

    for (const row of result.rows) {
      const { module, action } = parseCode(row.permission_code);
      if (!permissions[module]) permissions[module] = {};
      permissions[module][action] = true;
    }

    // SUPER_ADMIN gets everything
    if (req.user.role === 'SUPER_ADMIN') {
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
    const validRoles = [
      'SUPER_ADMIN',
      'IT_ADMIN',
      'COMPANY_ADMIN',
      'TRADE_PROJECT_MANAGER',
      'TRADE_ADMIN',
      'FOREMAN',
      'JOURNEYMAN',
      'APPRENTICE_4',
      'APPRENTICE_3',
      'APPRENTICE_2',
      'APPRENTICE_1',
      'WORKER',
      'DRIVER',
    ];
    if (!validRoles.includes(role)) return res.status(400).json({ error: 'Invalid role' });

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

    const validRoles = [
      'SUPER_ADMIN',
      'IT_ADMIN',
      'COMPANY_ADMIN',
      'TRADE_PROJECT_MANAGER',
      'TRADE_ADMIN',
      'FOREMAN',
      'JOURNEYMAN',
      'APPRENTICE_4',
      'APPRENTICE_3',
      'APPRENTICE_2',
      'APPRENTICE_1',
      'WORKER',
      'DRIVER',
    ];
    if (!validRoles.includes(role)) return res.status(400).json({ error: 'Invalid role' });

    if (!Array.isArray(permissions) || permissions.length === 0) {
      return res.status(400).json({ error: 'permissions array is required' });
    }

    const callerRank = {
      SUPER_ADMIN: 0,
      IT_ADMIN: 1,
      COMPANY_ADMIN: 2,
      TRADE_PROJECT_MANAGER: 3,
      TRADE_ADMIN: 4,
      FOREMAN: 5,
      JOURNEYMAN: 6,
      APPRENTICE_4: 7,
      APPRENTICE_3: 7,
      APPRENTICE_2: 7,
      APPRENTICE_1: 7,
      WORKER: 8,
      DRIVER: 8,
    };
    if (callerRank[req.user.role] >= callerRank[role]) {
      return res
        .status(403)
        .json({ error: 'Cannot edit permissions for a role equal or higher than yours' });
    }

    // Delete all current permissions for this role
    await req.db.query(`DELETE FROM public.role_permissions WHERE role = $1`, [role]);

    // Re-insert only the allowed ones
    for (const perm of permissions) {
      const { module, action, allowed } = perm;
      if (!allowed) continue;
      const code = `${module}.${action}`;

      // Only insert if the code exists in the permissions master table
      await req.db.query(
        `
        INSERT INTO public.role_permissions (role, permission_code)
        SELECT $1, $2 WHERE EXISTS (SELECT 1 FROM public.permissions WHERE code = $2)
        ON CONFLICT DO NOTHING
      `,
        [role, code]
      );
    }

    logAudit(req, 'UPDATE_PERMISSIONS', 'role_permissions', null, null, { role });

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
    if (!['SUPER_ADMIN', 'IT_ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only SUPER_ADMIN or IT_ADMIN can reset roles' });
    }

    const { role } = req.params;
    const validRoles = [
      'SUPER_ADMIN',
      'IT_ADMIN',
      'COMPANY_ADMIN',
      'TRADE_PROJECT_MANAGER',
      'TRADE_ADMIN',
      'FOREMAN',
      'JOURNEYMAN',
      'APPRENTICE_4',
      'APPRENTICE_3',
      'APPRENTICE_2',
      'APPRENTICE_1',
      'WORKER',
      'DRIVER',
    ];
    if (!validRoles.includes(role)) return res.status(400).json({ error: 'Invalid role' });

    const defaults = {
      IT_ADMIN: [
        'dashboard.view',
        'settings.system',
        'settings.company',
        'settings.user_management',
        'settings.permissions',
        'audit.view',
        'employees.view',
        'employees.create',
        'employees.edit',
        'employees.delete',
        'employees.invite',
      ],
      COMPANY_ADMIN: [
        'dashboard.view',
        'employees.view',
        'employees.create',
        'employees.edit',
        'employees.delete',
        'employees.invite',
        'projects.view',
        'projects.create',
        'projects.edit',
        'projects.delete',
        'suppliers.view',
        'suppliers.create',
        'suppliers.edit',
        'suppliers.delete',
        'assignments.view',
        'attendance.view',
        'materials.request_view_all',
        'materials.catalog_view',
        'materials.surplus_view',
        'purchase_orders.view',
        'purchase_orders.print',
        'bi.access_full',
        'bi.access_own_trade',
        'bi.workforce_planner',
        'settings.company',
        'settings.user_management',
        'audit.view',
      ],
      TRADE_PROJECT_MANAGER: [
        'dashboard.view',
        'employees.view_own_trade',
        'projects.view_own_trade',
        'suppliers.view',
        'assignments.view_own_trade',
        'attendance.view_own_trade',
        'materials.request_view_own_trade',
        'materials.catalog_view',
        'materials.surplus_view',
        'purchase_orders.view_own_trade',
        'purchase_orders.print',
        'bi.access_own_trade',
        'bi.workforce_planner',
      ],
      TRADE_ADMIN: [
        'dashboard.view',
        'employees.view_own_trade',
        'projects.view_own_trade',
        'suppliers.view',
        'assignments.view_own_trade',
        'assignments.create',
        'assignments.edit',
        'assignments.delete',
        'assignments.smart_assign',
        'attendance.view_own_trade',
        'attendance.checkin',
        'attendance.approve',
        'attendance.overtime_approve',
        'hub.access',
        'hub.materials_inbox',
        'hub.materials_merge_send',
        'hub.attendance_approval',
        'materials.request_submit',
        'materials.request_view_own',
        'materials.request_view_own_trade',
        'materials.catalog_view',
        'materials.surplus_view',
        'materials.surplus_declare',
        'purchase_orders.view_own_trade',
        'purchase_orders.print',
      ],
      FOREMAN: [
        'dashboard.view',
        'assignments.view',
        'assignments.view_own_trade',
        'attendance.checkin',
        'attendance.view',
        'attendance.view_own_trade',
        'attendance.view_self',
        'hub.access',
        'hub.materials_inbox',
        'hub.materials_merge_send',
        'hub.receive_tasks',
        'hub.send_tasks',
        'materials.catalog_view',
        'materials.request_submit',
        'materials.request_view_own',
        'materials.request_view_own_trade',
        'materials.surplus_declare',
        'materials.surplus_view',
        'projects.view_own_trade',
        'purchase_orders.print',
        'purchase_orders.view',
        'purchase_orders.view_own',
        'reports.view',
        'reports.view_self',
        'suppliers.view',
        'tasks.send',
        'tasks.view',
      ],
      JOURNEYMAN: [
        'dashboard.view',
        'attendance.checkin',
        'attendance.view_self',
        'hub.receive_tasks',
        'materials.catalog_view',
        'materials.request_submit',
        'materials.request_view_own',
        'purchase_orders.view_own',
        'reports.view',
        'reports.view_self',
        'tasks.view',
      ],
      APPRENTICE_4: [
        'dashboard.view',
        'attendance.checkin',
        'attendance.view_self',
        'hub.receive_tasks',
        'materials.catalog_view',
        'materials.request_submit',
        'materials.request_view_own',
        'purchase_orders.view_own',
        'reports.view',
        'reports.view_self',
        'tasks.view',
      ],
      APPRENTICE_3: [
        'dashboard.view',
        'attendance.checkin',
        'attendance.view_self',
        'hub.receive_tasks',
        'materials.catalog_view',
        'materials.request_submit',
        'materials.request_view_own',
        'reports.view',
        'reports.view_self',
        'tasks.view',
      ],
      APPRENTICE_2: [
        'dashboard.view',
        'attendance.checkin',
        'attendance.view_self',
        'hub.receive_tasks',
        'materials.catalog_view',
        'reports.view_self',
        'tasks.view',
      ],
      APPRENTICE_1: [
        'dashboard.view',
        'attendance.checkin',
        'attendance.view_self',
        'hub.receive_tasks',
        'materials.catalog_view',
        'reports.view_self',
        'tasks.view',
      ],
      WORKER: [
        'dashboard.view',
        'attendance.checkin',
        'attendance.view_self',
        'hub.receive_tasks',
        'materials.catalog_view',
        'materials.request_submit',
        'materials.request_view_own',
        'purchase_orders.view_own',
        'reports.view',
        'reports.view_self',
        'tasks.view',
      ],
      DRIVER: [
        'dashboard.view',
        'attendance.checkin',
        'attendance.view_self',
        'hub.receive_tasks',
        'reports.view_self',
        'tasks.view',
      ],
    };

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

    logAudit(req, 'RESET_PERMISSIONS', 'role_permissions', null, null, { role });

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

module.exports = router;
