// tests/helpers/db.js — DB connectivity helper for Phase 11c+.

'use strict';

const { Pool } = require('pg');

const SENTINEL_HINT = 'noop@127.0.0.1';

function dbAvailable() {
  const url = process.env.DATABASE_URL || '';
  return url.length > 0 && !url.includes(SENTINEL_HINT);
}

let _pool = null;

function getPool() {
  if (!_pool) {
    if (!dbAvailable()) {
      throw new Error(
        'tests/helpers/db.js: getPool() called but DATABASE_URL is sentinel. ' +
          'Wrap your describe block with describeIfDb() so the suite is skipped.'
      );
    }
    _pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return _pool;
}

async function closePool() {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}

const describeIfDb = dbAvailable() ? describe : describe.skip;

const TEST_PREFIX = 'test_';

let _seq = 0;
function uniqueTag() {
  _seq += 1;
  return `${Date.now()}_${_seq}`;
}

let _seeded = false;
async function ensureSeedData() {
  if (_seeded) return;
  const pool = getPool();

  await pool.query(
    `INSERT INTO public.plans (code, label) VALUES
       ('BASIC', 'Basic'),
       ('PRO', 'Pro'),
       ('ENTERPRISE', 'Enterprise')
     ON CONFLICT (code) DO NOTHING`
  );

  await pool.query(
    `INSERT INTO public.company_statuses (code, label) VALUES
       ('TRIAL',     'Trial'),
       ('ACTIVE',    'Active'),
       ('PAST_DUE',  'Past Due'),
       ('SUSPENDED', 'Suspended'),
       ('CANCELLED', 'Cancelled')
     ON CONFLICT (code) DO NOTHING`
  );

  await pool.query(
    `INSERT INTO public.roles (role_key, label) VALUES
       ('SUPER_ADMIN',           'Super Admin'),
       ('IT_ADMIN',              'IT Admin'),
       ('COMPANY_ADMIN',         'Company Admin'),
       ('TRADE_PROJECT_MANAGER', 'Trade Project Manager'),
       ('TRADE_ADMIN',           'Trade Admin'),
       ('FOREMAN',               'Foreman'),
       ('JOURNEYMAN',            'Journeyman'),
       ('APPRENTICE_1',          'Apprentice Lvl 1'),
       ('APPRENTICE_2',          'Apprentice Lvl 2'),
       ('APPRENTICE_3',          'Apprentice Lvl 3'),
       ('APPRENTICE_4',          'Apprentice Lvl 4'),
       ('WORKER',                'Worker'),
       ('DRIVER',                'Driver')
     ON CONFLICT (role_key) DO NOTHING`
  );

  await pool.query(
    `INSERT INTO public.permissions (code, description, grp) VALUES
       ('employees.view',   'View employees',   'employees'),
       ('projects.view',    'View projects',    'projects'),
       ('suppliers.view',   'View suppliers',   'suppliers'),
       ('assignments.view', 'View assignments', 'assignments')
     ON CONFLICT (code) DO NOTHING`
  );

  await pool.query(
    `INSERT INTO public.role_permissions (role, permission_code) VALUES
       ('COMPANY_ADMIN', 'employees.view'),
       ('COMPANY_ADMIN', 'projects.view'),
       ('COMPANY_ADMIN', 'suppliers.view'),
       ('COMPANY_ADMIN', 'assignments.view')
     ON CONFLICT (role, permission_code) DO NOTHING`
  );

  await pool.query(
    `INSERT INTO public.trade_types (code, name) VALUES
       ('GENERAL', 'General')
     ON CONFLICT DO NOTHING`
  );
  await pool.query(
    `INSERT INTO public.project_statuses (code, name, is_final) VALUES
       ('ACTIVE', 'Active', false)
     ON CONFLICT DO NOTHING`
  );

  _seeded = true;
}

async function seedCompany(overrides = {}) {
  await ensureSeedData();
  const pool = getPool();
  const name = overrides.name || `${TEST_PREFIX}co_${uniqueTag()}`;
  const status = overrides.status || 'ACTIVE';
  const { rows } = await pool.query(
    `INSERT INTO public.companies (name, status, plan)
     VALUES ($1, $2, 'BASIC')
     RETURNING company_id`,
    [name, status]
  );
  return { company_id: Number(rows[0].company_id), name, status };
}

async function seedUser(overrides = {}) {
  await ensureSeedData();
  const pool = getPool();
  const { hashPin } = require('../../lib/auth_utils');
  const username = overrides.username || `${TEST_PREFIX}u_${uniqueTag()}`;
  const role = overrides.role || 'WORKER';
  const pin = overrides.pin || '1234';
  const isActive = overrides.is_active !== undefined ? overrides.is_active : true;
  const companyId = overrides.company_id || null;
  const pinHash = await hashPin(pin);
  const { rows } = await pool.query(
    `INSERT INTO public.app_users (username, pin_hash, role, is_active, company_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [username, pinHash, role, isActive, companyId]
  );
  return { id: Number(rows[0].id), username, role, pin, company_id: companyId };
}

async function seedEmployee(overrides = {}) {
  await ensureSeedData();
  const pool = getPool();
  // Schema has a unique index ux_employees_company_name_ci on
  // (company_id, lower(trim(first_name)), lower(trim(last_name))). Default
  // names must be unique-per-call so seedAssignment + other helpers that
  // auto-create employees in the same company don't collide.
  const tag = uniqueTag();
  const code = overrides.employee_code || `${TEST_PREFIX}emp_${tag}`;
  const firstName = overrides.first_name || `Test${tag}`;
  const lastName = overrides.last_name || `Employee${tag}`;
  const companyId = overrides.company_id || null;
  const { rows } = await pool.query(
    `INSERT INTO public.employees (employee_code, first_name, last_name, company_id, is_active)
     VALUES ($1, $2, $3, $4, true)
     RETURNING id`,
    [code, firstName, lastName, companyId]
  );
  return {
    id: Number(rows[0].id),
    employee_code: code,
    first_name: firstName,
    last_name: lastName,
    company_id: companyId,
  };
}

async function seedEmployeeProfile(overrides = {}) {
  await ensureSeedData();
  const pool = getPool();
  const employeeId = overrides.employee_id;
  if (!employeeId) throw new Error('seedEmployeeProfile requires { employee_id }');
  const fullName = overrides.full_name || `Test Profile ${employeeId}`;
  const tradeCode = overrides.trade_code || 'GENERAL';
  await pool.query(
    `INSERT INTO public.employee_profiles (employee_id, full_name, trade_code)
     VALUES ($1, $2, $3)
     ON CONFLICT (employee_id) DO NOTHING`,
    [employeeId, fullName, tradeCode]
  );
  return { employee_id: employeeId, full_name: fullName, trade_code: tradeCode };
}

async function seedProject(overrides = {}) {
  await ensureSeedData();
  const pool = getPool();
  const code = overrides.project_code || `${TEST_PREFIX}prj_${uniqueTag()}`.slice(0, 50);
  const name = overrides.project_name || 'Test Project';
  const companyId = overrides.company_id;
  if (!companyId) throw new Error('seedProject requires { company_id }');

  const { rows: tt } = await pool.query(
    `SELECT id FROM public.trade_types WHERE code = 'GENERAL' LIMIT 1`
  );
  const { rows: ps } = await pool.query(
    `SELECT id FROM public.project_statuses WHERE code = 'ACTIVE' LIMIT 1`
  );

  const { rows } = await pool.query(
    `INSERT INTO public.projects
       (project_code, project_name, trade_type_id, status_id, company_id, ccq_sector)
     VALUES ($1, $2, $3, $4, $5, 'IC')
     RETURNING id`,
    [code, name, tt[0].id, ps[0].id, companyId]
  );
  return { id: Number(rows[0].id), project_code: code, project_name: name, company_id: companyId };
}

async function seedSupplier(overrides = {}) {
  await ensureSeedData();
  const pool = getPool();
  const tag = uniqueTag();
  const name = overrides.name || `${TEST_PREFIX}sup_${tag}`;
  const email = overrides.email || `${TEST_PREFIX}sup_${tag}@example.test`;
  const phone = overrides.phone || `555-${String(tag).slice(-7)}`;
  const tradeCode = overrides.trade_code || 'GENERAL';
  const companyId = overrides.company_id;
  if (!companyId) throw new Error('seedSupplier requires { company_id }');
  const isActive = overrides.is_active !== undefined ? overrides.is_active : true;

  const { rows } = await pool.query(
    `INSERT INTO public.suppliers
       (company_id, name, email, phone, trade_code, is_active)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [companyId, name, email, phone, tradeCode, isActive]
  );
  return {
    id: Number(rows[0].id),
    name,
    email,
    phone,
    trade_code: tradeCode,
    company_id: companyId,
  };
}

async function seedAssignment(overrides = {}) {
  await ensureSeedData();
  const pool = getPool();
  const companyId = overrides.company_id;
  if (!companyId) throw new Error('seedAssignment requires { company_id }');

  const project = overrides.project_id
    ? { id: overrides.project_id }
    : await seedProject({ company_id: companyId });

  let employeeId = overrides.employee_id;
  if (!employeeId) {
    const emp = await seedEmployee({ company_id: companyId });
    employeeId = emp.id;
  }
  await seedEmployeeProfile({ employee_id: employeeId });

  let requesterId = overrides.requested_by_user_id;
  if (!requesterId) {
    const u = await seedUser({ company_id: companyId, role: 'COMPANY_ADMIN' });
    requesterId = u.id;
  }

  const status = overrides.status || 'APPROVED';
  const startDate = overrides.start_date || '2026-01-01';
  const endDate = overrides.end_date || '2026-12-31';
  const shiftStart = overrides.shift_start || '06:00';
  const shiftEnd = overrides.shift_end || '14:30';
  const assignmentRole = overrides.assignment_role || 'WORKER';

  const { rows } = await pool.query(
    `INSERT INTO public.assignment_requests
       (company_id, project_id, requested_for_employee_id, requested_by_user_id,
        start_date, end_date, shift_start, shift_end, assignment_role,
        status, request_type, payload_json,
        decision_by_user_id, decision_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
             $10, 'CREATE_ASSIGNMENT', '{}',
             $4, NOW(), NOW(), NOW())
     RETURNING id`,
    [
      companyId,
      project.id,
      employeeId,
      requesterId,
      startDate,
      endDate,
      shiftStart,
      shiftEnd,
      assignmentRole,
      status,
    ]
  );
  return {
    id: Number(rows[0].id),
    company_id: companyId,
    project_id: project.id,
    employee_id: employeeId,
    requested_by_user_id: requesterId,
    status,
  };
}

async function cleanupTestRows() {
  const pool = getPool();
  await pool.query(
    `DELETE FROM public.refresh_tokens
     WHERE user_id IN (SELECT id FROM public.app_users WHERE username LIKE $1)`,
    [`${TEST_PREFIX}%`]
  );
  await pool.query(`DELETE FROM public.audit_logs WHERE username LIKE $1`, [`${TEST_PREFIX}%`]);
  await pool.query(
    `DELETE FROM public.assignment_requests
     WHERE company_id IN (SELECT company_id FROM public.companies WHERE name LIKE $1)`,
    [`${TEST_PREFIX}%`]
  );
  await pool.query(`DELETE FROM public.app_users WHERE username LIKE $1`, [`${TEST_PREFIX}%`]);
  await pool.query(`DELETE FROM public.employees WHERE employee_code LIKE $1`, [`${TEST_PREFIX}%`]);
  await pool.query(`DELETE FROM public.projects WHERE project_code LIKE $1`, [`${TEST_PREFIX}%`]);
  await pool.query(`DELETE FROM public.suppliers WHERE name LIKE $1`, [`${TEST_PREFIX}%`]);
  await pool.query(`DELETE FROM public.companies WHERE name LIKE $1`, [`${TEST_PREFIX}%`]);
}

module.exports = {
  dbAvailable,
  getPool,
  closePool,
  describeIfDb,
  seedCompany,
  seedUser,
  seedEmployee,
  seedEmployeeProfile,
  seedProject,
  seedSupplier,
  seedAssignment,
  cleanupTestRows,
};
