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

  // ───────────────────────────────────────────────────────────────────────
  // §148 Phase 4 — expanded catalog (migration 038). All rank < COMPANY_ADMIN
  // (80) so the admin can tune them. audit.view stays OWNER-only. These are
  // sensible STARTING points; each company tunes via the matrix (Phase 3b).
  // ───────────────────────────────────────────────────────────────────────

  // Construction Manager: full field operations, NO governance (settings/users).
  CONSTRUCTION_MANAGER: [
    'dashboard.view',
    'projects.view',
    'projects.create',
    'projects.edit',
    'projects.delete',
    'employees.view',
    'employees.edit',
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
    'materials.surplus_view',
    'purchase_orders.print',
    'purchase_orders.view',
    'suppliers.view',
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
    'expense_claims.view',
    'expense_claims.approve',
  ],

  // Project Manager (cross-trade): plans + staffs projects, approves attendance.
  PROJECT_MANAGER: [
    'dashboard.view',
    'projects.view',
    'projects.create',
    'projects.edit',
    'employees.view',
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
    'bi.access_full',
    'bi.workforce_planner',
    'expense_claims.view',
  ],

  // Superintendent: site boss — staffs + approves on site, sends/receives tasks.
  SUPERINTENDENT: [
    'dashboard.view',
    'projects.view',
    'projects.edit',
    'employees.view',
    'assignments.view',
    'assignments.create',
    'assignments.edit',
    'assignments.smart_assign',
    'attendance.view',
    'attendance.approve',
    'attendance.overtime_approve',
    'materials.catalog_view',
    'materials.request_submit',
    'materials.request_view_all',
    'materials.surplus_view',
    'reports.view',
    'hub.access',
    'hub.attendance_approval',
    'hub.send_tasks',
    'hub.receive_tasks',
    'tasks.send',
    'tasks.view',
    'bi.access_own_trade',
  ],

  // MEP Engineer: design/coordination for their trade + planning BI.
  MEP_ENGINEER: [
    'dashboard.view',
    'projects.view',
    'projects.edit',
    'assignments.view',
    'attendance.view',
    'materials.catalog_view',
    'materials.request_submit',
    'materials.request_view_all',
    'reports.view',
    'hub.access',
    'hub.send_tasks',
    'tasks.send',
    'tasks.view',
    'bi.access_own_trade',
    'bi.workforce_planner',
  ],

  // Estimator: pre-construction — pricing via materials/POs/suppliers + full BI.
  ESTIMATOR: [
    'dashboard.view',
    'projects.view',
    'materials.catalog_view',
    'materials.request_view_all',
    'purchase_orders.print',
    'purchase_orders.view',
    'suppliers.view',
    'suppliers.create',
    'suppliers.edit',
    'reports.view',
    'bi.access_full',
  ],

  // Project Engineer: project execution support for their trade.
  PROJECT_ENGINEER: [
    'dashboard.view',
    'projects.view',
    'projects.edit',
    'assignments.view',
    'attendance.view',
    'materials.catalog_view',
    'materials.request_submit',
    'reports.view',
    'hub.access',
    'tasks.view',
    'bi.access_own_trade',
  ],

  // Site Engineer: on-site monitoring + attendance approval.
  SITE_ENGINEER: [
    'dashboard.view',
    'projects.view',
    'assignments.view',
    'attendance.view',
    'attendance.approve',
    'materials.catalog_view',
    'materials.request_submit',
    'reports.view',
    'hub.access',
    'hub.receive_tasks',
    'tasks.view',
  ],

  // Accountant: finance — expense approval, PO/report visibility, full BI.
  ACCOUNTANT: [
    'dashboard.view',
    'projects.view',
    'employees.view',
    'purchase_orders.view',
    'reports.view',
    'expense_claims.view',
    'expense_claims.approve',
    'bi.access_full',
  ],

  // BIM Coordinator: models/coordination + planning BI.
  BIM_COORDINATOR: [
    'dashboard.view',
    'projects.view',
    'projects.edit',
    'assignments.view',
    'reports.view',
    'hub.access',
    'tasks.view',
    'bi.access_own_trade',
    'bi.workforce_planner',
  ],

  // HR Officer: people management.
  HR_OFFICER: [
    'dashboard.view',
    'employees.view',
    'employees.create',
    'employees.edit',
    'employees.delete',
    'employees.invite',
    'attendance.view',
    'reports.view',
  ],

  // General Foreman: a foreman over multiple crews — can edit/smart-assign.
  GENERAL_FOREMAN: [
    'dashboard.view',
    'projects.view',
    'assignments.view',
    'assignments.create',
    'assignments.edit',
    'assignments.smart_assign',
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

  // Dispatcher: logistics — assigns crews, runs the hub task flow.
  DISPATCHER: [
    'dashboard.view',
    'projects.view',
    'employees.view',
    'assignments.view',
    'assignments.create',
    'assignments.edit',
    'assignments.smart_assign',
    'attendance.view',
    'reports.view',
    'hub.access',
    'hub.send_tasks',
    'hub.receive_tasks',
    'tasks.send',
    'tasks.view',
    'bi.workforce_planner',
  ],

  // Procurement Officer: purchasing — materials inbox, POs, suppliers.
  PROCUREMENT_OFFICER: [
    'dashboard.view',
    'projects.view',
    'materials.catalog_view',
    'materials.request_view_all',
    'materials.surplus_view',
    'purchase_orders.print',
    'purchase_orders.view',
    'suppliers.view',
    'suppliers.create',
    'suppliers.edit',
    'suppliers.delete',
    'reports.view',
    'hub.access',
    'hub.materials_inbox',
    'hub.materials_merge_send',
  ],

  // Safety Officer (HSE): site visibility + reporting + task coordination.
  SAFETY_OFFICER: [
    'dashboard.view',
    'projects.view',
    'employees.view',
    'assignments.view',
    'attendance.view',
    'reports.view',
    'hub.access',
    'hub.send_tasks',
    'tasks.send',
    'tasks.view',
  ],

  // QA/QC Officer: quality visibility + reporting + task coordination.
  QA_QC_OFFICER: [
    'dashboard.view',
    'projects.view',
    'assignments.view',
    'attendance.view',
    'reports.view',
    'hub.access',
    'hub.send_tasks',
    'tasks.send',
    'tasks.view',
  ],

  // Payroll Officer: attendance + overtime sign-off for pay, reports.
  PAYROLL_OFFICER: [
    'dashboard.view',
    'employees.view',
    'attendance.view',
    'attendance.overtime_approve',
    'reports.view',
    'expense_claims.view',
  ],

  // Office Clerk: general office — read-mostly.
  OFFICE_CLERK: [
    'dashboard.view',
    'projects.view',
    'materials.catalog_view',
    'reports.view',
    'hub.access',
    'hub.receive_tasks',
    'tasks.view',
  ],

  // Equipment Operator: a field tradesperson — same baseline as journeyman.
  OPERATOR: FIELD_WORKER,
};

module.exports = { ROLE_DEFAULT_PERMISSIONS, FIELD_WORKER };
