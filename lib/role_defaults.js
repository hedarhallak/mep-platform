// lib/role_defaults.js
//
// §148 — the canonical DEFAULT permission set for each role (the single source
// of truth). Used by (a) the "Reset to defaults" endpoint and (b)
// scripts/apply_role_defaults.js which writes these to role_permissions live.
//
// Hedar's approved intent (§148): roles are a fixed catalog; what each role can
// do is its PERMISSIONS. Field/CCQ roles are scoped to their own work; office
// roles get the office function; admins get governance. audit.view is OWNER-
// only (§132 separation of duties). These are GLOBAL defaults — per-company
// tuning (Phase 3) layers on top. SUPER_ADMIN is special-cased (gets ALL) and
// is intentionally absent here.
//
// Every code below exists in the `permissions` catalog; the apply script + the
// reset endpoint both skip any code not present, so this list is FK-safe.

// Field / CCQ workers (journeyman, apprentices, worker) share one baseline:
// see your own work, punch in, request materials, receive tasks.
const FIELD_WORKER = [
  'dashboard.view',
  'assignments.view',
  'attendance.checkin',
  'attendance.view_self',
  'materials.catalog_view',
  'materials.request_submit',
  'materials.request_view_own',
  'reports.view_self',
  'hub.access',
  'hub.receive_tasks',
  'tasks.view',
];

// COMPANY_ADMIN = full operational access, NO audit (audit is OWNER-only, §132).
const COMPANY_ADMIN = [
  'dashboard.view',
  'projects.view',
  'projects.create',
  'projects.edit',
  'projects.delete',
  'employees.view',
  'employees.create',
  'employees.edit',
  'employees.delete',
  'employees.invite',
  'assignments.view',
  'assignments.create',
  'assignments.edit',
  'assignments.delete',
  'assignments.smart_assign',
  'attendance.view',
  'attendance.approve',
  'attendance.overtime_approve',
  'materials.catalog_view',
  'materials.request_submit',
  'materials.request_view_all',
  'materials.surplus_declare',
  'materials.surplus_view',
  'purchase_orders.print',
  'purchase_orders.view',
  'suppliers.view',
  'suppliers.create',
  'suppliers.edit',
  'suppliers.delete',
  'reports.view',
  'hub.access',
  'hub.attendance_approval',
  'hub.materials_inbox',
  'hub.materials_merge_send',
  'hub.send_tasks',
  'tasks.send',
  'tasks.view',
  'bi.access_full',
  'bi.workforce_planner',
  'settings.company',
  'settings.permissions',
  'settings.system',
  'settings.user_management',
];

const ROLE_DEFAULT_PERMISSIONS = {
  // §132 OWNER = the COMPANY_ADMIN operational set PLUS the exclusive audit view.
  OWNER: [...COMPANY_ADMIN, 'audit.view'],

  COMPANY_ADMIN,

  // Technical admin: system + users + permissions only. NO business data, NO audit.
  IT_ADMIN: [
    'dashboard.view',
    'settings.system',
    'settings.company',
    'settings.user_management',
    'settings.permissions',
    'employees.view',
    'employees.create',
    'employees.edit',
    'employees.delete',
    'employees.invite',
  ],

  // Project manager: plans projects + assignments for their trade, sends tasks,
  // own-trade BI.
  TRADE_PROJECT_MANAGER: [
    'dashboard.view',
    'projects.view',
    'projects.edit',
    'assignments.view',
    'assignments.create',
    'assignments.edit',
    'assignments.smart_assign',
    'attendance.view',
    'attendance.approve',
    'materials.catalog_view',
    'materials.request_submit',
    'materials.request_view_all',
    'purchase_orders.view',
    'reports.view',
    'hub.access',
    'hub.send_tasks',
    'tasks.send',
    'tasks.view',
    'bi.access_own_trade',
    'bi.workforce_planner',
    'employees.view',
  ],

  // Trade / purchasing admin: assignments + materials/POs (purchasing) + suppliers view.
  TRADE_ADMIN: [
    'dashboard.view',
    'projects.view',
    'assignments.view',
    'assignments.create',
    'assignments.edit',
    'attendance.view',
    'materials.catalog_view',
    'materials.request_submit',
    'materials.request_view_all',
    'materials.surplus_view',
    'purchase_orders.print',
    'purchase_orders.view',
    'suppliers.view',
    'reports.view',
    'hub.access',
    'hub.materials_inbox',
    'hub.materials_merge_send',
    'hub.send_tasks',
    'tasks.send',
    'tasks.view',
    'employees.view',
  ],

  // §147 Method 4: a foreman SUBMITS assignment requests (assignments.create)
  // and needs projects.view for the Project Staffing screen, plus team
  // attendance approval and task send/receive.
  FOREMAN: [
    'dashboard.view',
    'projects.view',
    'assignments.view',
    'assignments.create',
    'attendance.view',
    'attendance.approve',
    'attendance.checkin',
    'attendance.view_own_trade',
    'materials.catalog_view',
    'materials.request_submit',
    'materials.request_view_own',
    'materials.surplus_declare',
    'purchase_orders.view_own',
    'reports.view',
    'reports.view_self',
    'hub.access',
    'hub.attendance_approval',
    'hub.receive_tasks',
    'hub.send_tasks',
    'tasks.send',
    'tasks.view',
  ],

  JOURNEYMAN: FIELD_WORKER,
  APPRENTICE_1: FIELD_WORKER,
  APPRENTICE_2: FIELD_WORKER,
  APPRENTICE_3: FIELD_WORKER,
  APPRENTICE_4: FIELD_WORKER,
  WORKER: FIELD_WORKER,

  // Driver: punch in, see own report/tasks. No materials/assignments authoring.
  DRIVER: [
    'dashboard.view',
    'attendance.checkin',
    'attendance.view_self',
    'reports.view_self',
    'hub.access',
    'hub.receive_tasks',
    'tasks.view',
  ],
};

module.exports = { ROLE_DEFAULT_PERMISSIONS, FIELD_WORKER };
