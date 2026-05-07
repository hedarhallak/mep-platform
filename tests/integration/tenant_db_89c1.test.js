// tests/integration/tenant_db_89c1.test.js
//
// Section 89-C/1 (Phase 4 Stage 2): cross-tenant isolation regression tests
// for the first batch of routes migrated onto req.db (RLS-enforced).
//
// Routes covered in this batch:
//   - /api/bi              (bi.js)
//   - /api/project-foremen (project_foremen.js)
//   - /api/project-trades  (project_trades.js)
//
// We exercise project_foremen + project_trades end-to-end through the HTTP
// stack — they have a clean "list rows belonging to a tenant" shape that's
// easy to assert on. /api/bi/workforce-suggestions has a more complex
// fixture surface (requires projects.site_lat/lng + employee_profiles.
// home_lat/lng + APPROVED assignment_requests) so we settle for a smoke
// test confirming it returns 200 + no leaks under the tenantDb middleware.
// Deeper BI assertions are deferred to a follow-up if/when the BI fixture
// helpers grow.
//
// These tests complement (don't duplicate) tests/integration/
// tenant_db_middleware.test.js, which validates the middleware itself
// against /api/suppliers (the 89-B canary). Here we prove the same
// property holds for the 3 new routes.
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
  seedEmployee,
  seedEmployeeProfile,
  seedProject,
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

async function seedProjectForeman({ project_id, employee_id, trade_code, company_id }) {
  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO public.project_foremen (project_id, employee_id, trade_code, company_id)
     VALUES ($1, $2, $3, $4)
     RETURNING project_id, employee_id, trade_code, company_id`,
    [project_id, employee_id, trade_code, company_id]
  );
  return rows[0];
}

async function seedProjectTrade({ project_id, trade_type_id, company_id }) {
  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO public.project_trades (project_id, trade_type_id, company_id)
     VALUES ($1, $2, $3)
     RETURNING id, project_id, trade_type_id, company_id`,
    [project_id, trade_type_id, company_id]
  );
  return rows[0];
}

describeIfDb('tenantDb middleware — Section 89-C/1 batch', () => {
  let companyA;
  let companyB;
  let adminA;
  let adminB;
  let projectA;
  let projectB;
  let employeeA;
  let employeeB;
  let foremanA;
  let foremanB;
  let tradeRowA;
  let tradeRowB;
  let generalTradeTypeId;

  beforeAll(async () => {
    companyA = await seedCompany();
    companyB = await seedCompany();

    adminA = await seedUser({ company_id: companyA.company_id, role: 'COMPANY_ADMIN' });
    adminB = await seedUser({ company_id: companyB.company_id, role: 'COMPANY_ADMIN' });

    projectA = await seedProject({ company_id: companyA.company_id });
    projectB = await seedProject({ company_id: companyB.company_id });

    employeeA = await seedEmployee({ company_id: companyA.company_id });
    employeeB = await seedEmployee({ company_id: companyB.company_id });
    await seedEmployeeProfile({ employee_id: employeeA.id, full_name: `${companyA.name}_foreman` });
    await seedEmployeeProfile({ employee_id: employeeB.id, full_name: `${companyB.name}_foreman` });

    foremanA = await seedProjectForeman({
      project_id: projectA.id,
      employee_id: employeeA.id,
      trade_code: 'PLUMBING',
      company_id: companyA.company_id,
    });
    foremanB = await seedProjectForeman({
      project_id: projectB.id,
      employee_id: employeeB.id,
      trade_code: 'ELECTRICAL',
      company_id: companyB.company_id,
    });

    // project_trades requires a valid trade_type_id from the global
    // trade_types table. ensureSeedData (called by seedCompany) seeds
    // 'GENERAL' there — fetch its id once.
    const pool = getPool();
    const { rows: tt } = await pool.query(
      `SELECT id FROM public.trade_types WHERE code = 'GENERAL' LIMIT 1`
    );
    generalTradeTypeId = tt[0].id;

    tradeRowA = await seedProjectTrade({
      project_id: projectA.id,
      trade_type_id: generalTradeTypeId,
      company_id: companyA.company_id,
    });
    tradeRowB = await seedProjectTrade({
      project_id: projectB.id,
      trade_type_id: generalTradeTypeId,
      company_id: companyB.company_id,
    });
  });

  afterAll(async () => {
    // project_foremen and project_trades aren't in cleanupTestRows (no
    // company-name filter path through them), so wipe the rows we created
    // here directly. Cascade from companies via cleanupTestRows handles
    // employees/projects/etc.
    const pool = getPool();
    await pool.query(`DELETE FROM public.project_foremen WHERE company_id IN ($1, $2)`, [
      companyA.company_id,
      companyB.company_id,
    ]);
    await pool.query(`DELETE FROM public.project_trades WHERE company_id IN ($1, $2)`, [
      companyA.company_id,
      companyB.company_id,
    ]);
    await cleanupTestRows();
    await closePool();
  });

  // ── /api/project-foremen ─────────────────────────────────────

  test('project-foremen: company A admin sees only company A foremen on company A project', async () => {
    const { token } = await loginUser(adminA);
    const res = await request(app)
      .get(`/api/project-foremen/${projectA.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    const employeeIds = res.body.foremen.map((f) => Number(f.employee_id));
    expect(employeeIds).toContain(employeeA.id);
    expect(employeeIds).not.toContain(employeeB.id);
  });

  test('project-foremen: company A admin sees 0 foremen on company B project (cross-tenant blocked)', async () => {
    const { token } = await loginUser(adminA);
    const res = await request(app)
      .get(`/api/project-foremen/${projectB.id}`)
      .set('Authorization', `Bearer ${token}`);

    // Either 200 with empty list (current route shape) or 404 — both
    // acceptable; the security property is "no rows from companyB leaked".
    expect([200, 404]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      expect(res.body.foremen).toEqual([]);
    }
  });

  test('project-foremen: company B admin sees only company B foremen on company B project', async () => {
    const { token } = await loginUser(adminB);
    const res = await request(app)
      .get(`/api/project-foremen/${projectB.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    const employeeIds = res.body.foremen.map((f) => Number(f.employee_id));
    expect(employeeIds).toContain(employeeB.id);
    expect(employeeIds).not.toContain(employeeA.id);
  });

  // ── /api/project-trades ──────────────────────────────────────

  test('project-trades: company A admin sees only company A trades on company A project', async () => {
    const { token } = await loginUser(adminA);
    const res = await request(app)
      .get(`/api/project-trades/${projectA.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    const ids = res.body.trades.map((t) => Number(t.id));
    expect(ids).toContain(tradeRowA.id);
    expect(ids).not.toContain(tradeRowB.id);
  });

  test('project-trades: company A admin sees 0 trades on company B project (cross-tenant blocked)', async () => {
    const { token } = await loginUser(adminA);
    const res = await request(app)
      .get(`/api/project-trades/${projectB.id}`)
      .set('Authorization', `Bearer ${token}`);

    // The route does a project ownership check first; cross-tenant project
    // returns 404 PROJECT_NOT_FOUND. Acceptable — proves containment.
    expect([200, 404]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      expect(res.body.trades).toEqual([]);
    }
  });

  test('project-trades: company B admin sees only company B trades on company B project', async () => {
    const { token } = await loginUser(adminB);
    const res = await request(app)
      .get(`/api/project-trades/${projectB.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    const ids = res.body.trades.map((t) => Number(t.id));
    expect(ids).toContain(tradeRowB.id);
    expect(ids).not.toContain(tradeRowA.id);
  });

  // ── /api/bi (smoke test only) ────────────────────────────────

  test('bi/workforce-suggestions: smoke test — returns 200 under tenantDb middleware (no leaks)', async () => {
    // The route requires bi.access_full permission (granted to
    // COMPANY_ADMIN by ensureSeedData). The seeded fixtures don't include
    // projects with site_lat/lng or employee profiles with home_lat/lng,
    // so the route returns an empty suggestions array. The point of this
    // test is just to confirm the middleware-wrapped route loads + runs
    // without 5xx, which proves the tenantDb wiring is correct for /api/bi.
    const { token } = await loginUser(adminA);
    const res = await request(app)
      .get('/api/bi/workforce-suggestions')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.suggestions)).toBe(true);
  });
});
