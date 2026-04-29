'use strict';

/**
 * lib/audit.js
 * Central audit logging helper.
 * Never throws — audit failures must not break the main operation.
 *
 * Usage:
 *   const { audit } = require('../lib/audit');
 *   await audit(pool, req, {
 *     action:      'PROJECT_CREATED',
 *     entity_type: 'project',
 *     entity_id:   project.id,
 *     entity_name: project.project_name,
 *     new_values:  project,
 *   });
 */

/**
 * Log an audit event.
 *
 * @param {object} pool      - pg pool instance
 * @param {object} req       - Express request (for user + IP context)
 * @param {object} entry     - Audit entry fields
 */
async function audit(
  pool,
  req,
  {
    action,
    entity_type,
    entity_id = null,
    entity_name = null,
    old_values = null,
    new_values = null,
    details = null,
  }
) {
  try {
    const user = req?.user || {};
    const company_id = user.company_id || null;
    const user_id = user.user_id || null;
    const username = user.username || null;
    const role = user.role || null;
    const ip_address = req?.ip || req?.headers?.['x-forwarded-for']?.split(',')[0]?.trim() || null;

    await pool.query(
      `INSERT INTO public.audit_logs
         (company_id, user_id, username, role, action, entity_type, entity_id,
          entity_name, old_values, new_values, details, ip_address, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())`,
      [
        company_id,
        user_id,
        username,
        role,
        action,
        entity_type,
        entity_id,
        entity_name,
        old_values ? JSON.stringify(old_values) : null,
        new_values ? JSON.stringify(new_values) : null,
        details ? JSON.stringify(details) : null,
        ip_address,
      ]
    );
  } catch (err) {
    // Audit failure must never crash the app
    console.error('[audit] Failed to write audit log:', err.message);
  }
}

/**
 * Audit actions constants — use these everywhere for consistency.
 */
const ACTIONS = {
  // Auth
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAILED: 'LOGIN_FAILED',
  LOGOUT: 'LOGOUT',
  PIN_CHANGED: 'PIN_CHANGED',

  // Companies
  COMPANY_CREATED: 'COMPANY_CREATED',
  COMPANY_UPDATED: 'COMPANY_UPDATED',
  COMPANY_SUSPENDED: 'COMPANY_SUSPENDED',
  COMPANY_ACTIVATED: 'COMPANY_ACTIVATED',

  // Projects
  PROJECT_CREATED: 'PROJECT_CREATED',
  PROJECT_UPDATED: 'PROJECT_UPDATED',
  PROJECT_DELETED: 'PROJECT_DELETED',

  // Employees
  EMPLOYEE_CREATED: 'EMPLOYEE_CREATED',
  EMPLOYEE_UPDATED: 'EMPLOYEE_UPDATED',
  EMPLOYEE_DISABLED: 'EMPLOYEE_DISABLED',

  // Assignments
  ASSIGNMENT_CREATED: 'ASSIGNMENT_CREATED',
  ASSIGNMENT_UPDATED: 'ASSIGNMENT_UPDATED',
  ASSIGNMENT_DELETED: 'ASSIGNMENT_DELETED',

  // Attendance
  ATTENDANCE_CHECKIN: 'ATTENDANCE_CHECKIN',
  ATTENDANCE_CHECKOUT: 'ATTENDANCE_CHECKOUT',

  // Requests
  BORROW_CREATED: 'BORROW_CREATED',
  BORROW_UPDATED: 'BORROW_UPDATED',
  MATERIAL_CREATED: 'MATERIAL_CREATED',
  MATERIAL_UPDATED: 'MATERIAL_UPDATED',
  PARKING_CREATED: 'PARKING_CREATED',
  PARKING_UPDATED: 'PARKING_UPDATED',
};

module.exports = { audit, ACTIONS };
