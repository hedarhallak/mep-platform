// tests/integration/tenant_db_89c11.test.js
//
// Section 89-C/11 (Phase 4 Stage 2): cross-tenant isolation regression
// tests for the eleventh batch of routes migrated onto req.db
// (RLS-enforced).
//
// Routes covered in this batch:
//   - /api/assignments (assignments.js) — tenant-scoped
//   - /api/permissions (permissions.js) — light touch, mostly global tables
//
// For assignments we exercise GET /api/assignments/requests (list scoping)
// and PATCH /api/assignments/requests/:id/cancel (cross-tenant 404). The
// other handlers follow the same `WHERE company_id = $1` pattern and are
// transitively covered.
//
// For permissions we exercise GET /api/permissions/audit (the only
// company-scoped endpoint) — confirms the migrated route still scopes
// audit_logs by caller's company_id. The matrix/role/my-permissions
// endpoints touch global tables (`public.permissions`,
// `public.role_permissions`) and are not tenant-scoped, so we don't
// regression-test isolation on them.
//
// They require a real DB connection (TEST_DATABASE_URL); gated behind
// describeIfDb so the suite skips cleanly without a DB.

'use strict';

const request = require('supertest');
const app = require('../../app');
const {
  describeIfDb,
  closePool,
  getPool,
  seedCompany,
  seedUser,
  seedAssignment,
  cleanupTestRows,
} = require('../helpers/db');

async function loginUser(user, pin) {
  const usePin = pin || user.pin || '1234';
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, pin: usePin });
  if (res.statusCode !== 200) {
    throw new Error(`Login failed in test setup: ${res.statusCode} ${JSON.stringify(res.body)}`);
  }
  return res.body;
}

describeIfDb(
  'tenantDb middleware — Section 89-C/11 batch (/api/assignments + /api/permissions)',
  () => {
    let companyA;
    let companyB;
    let adminA;
    let adminB;
    let assignmentA;
    let assignmentB;

    beforeAll(async () => {
      companyA = await seedCompany();
      companyB = await seedCompany();

      adminA = await seedUser({ company_id: companyA.company_id, role: 'COMPANY_ADMIN' });
      adminB = await seedUser({ company_id: companyB.company_id, role: 'COMPANY_ADMIN' });

      // seedAssignment auto-creates project + employee + employee_profile
      // and inserts an APPROVED assignment_request row.
      assignmentA = await seedAssignment({ company_id: companyA.company_id });
      assignmentB = await seedAssignment({ company_id: companyB.company_id });
    });

    afterAll(async () => {
      // audit_logs is append-only by design (immutable trigger), so we
      // can't DELETE the rows we seeded inside the test. cleanupTestRows
      // skips that table; the rows leak harmlessly tagged to test
      // companies whose names are uniqueTag()-ed.
      await cleanupTestRows();
      await closePool();
    });

    // ── /api/assignments ─────────────────────────────────────────

    test('assignments/requests: company A admin sees only company A requests', async () => {
      const { token } = await loginUser(adminA);
      const res = await request(app)
        .get('/api/assignments/requests')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.ok).toBe(true);
      const ids = res.body.requests.map((r) => Number(r.id));
      expect(ids).toContain(assignmentA.id);
      expect(ids).not.toContain(assignmentB.id);
    });

    test('assignments/requests: company B admin sees only company B requests', async () => {
      const { token } = await loginUser(adminB);
      const res = await request(app)
        .get('/api/assignments/requests')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.ok).toBe(true);
      const ids = res.body.requests.map((r) => Number(r.id));
      expect(ids).toContain(assignmentB.id);
      expect(ids).not.toContain(assignmentA.id);
    });

    test('assignments/requests/:id/cancel: company A admin gets 404 trying to cancel company B assignment', async () => {
      const { token } = await loginUser(adminA);
      const res = await request(app)
        .patch(`/api/assignments/requests/${assignmentB.id}/cancel`)
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.statusCode).toBe(404);
      expect(res.body.error).toBe('REQUEST_NOT_FOUND');
    });

    test('assignments (active list): company A admin sees only company A APPROVED assignments', async () => {
      const { token } = await loginUser(adminA);
      const res = await request(app)
        .get('/api/assignments')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.ok).toBe(true);
      const ids = res.body.assignments.map((a) => Number(a.id));
      expect(ids).toContain(assignmentA.id);
      expect(ids).not.toContain(assignmentB.id);
    });

    // ── /api/permissions ─────────────────────────────────────────
    // Only /audit is tenant-scoped. Seed one audit_log row per company
    // and confirm each admin only sees their own.

    test('permissions/audit: company A admin sees only company A audit rows', async () => {
      const pool = getPool();
      // Seed two audit_logs rows scoped to companies A and B respectively.
      await pool.query(
        `INSERT INTO public.audit_logs
         (company_id, user_id, username, role, action, entity_type, entity_id, new_values, created_at)
       VALUES
         ($1, $2, 'tester_A', 'COMPANY_ADMIN', 'UPDATE_PERMISSIONS', 'role_permissions', NULL,
          '{"role":"FOREMAN"}'::jsonb, NOW()),
         ($3, $4, 'tester_B', 'COMPANY_ADMIN', 'UPDATE_PERMISSIONS', 'role_permissions', NULL,
          '{"role":"WORKER"}'::jsonb, NOW())`,
        [companyA.company_id, adminA.id, companyB.company_id, adminB.id]
      );

      const { token } = await loginUser(adminA);
      const res = await request(app)
        .get('/api/permissions/audit')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body.audit)).toBe(true);
      const usernames = res.body.audit.map((r) => r.changed_by);
      expect(usernames).toContain('tester_A');
      expect(usernames).not.toContain('tester_B');
    });
  }
);
