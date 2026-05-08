// tests/integration/tenant_db_89c8.test.js
//
// Section 89-C/8 (Phase 4 Stage 2): cross-tenant isolation regression tests
// for the eighth batch of routes migrated onto req.db (RLS-enforced).
//
// Routes covered in this batch:
//   - /api/projects (projects.js)
//
// We exercise GET /api/projects (list) + GET /api/projects/:id (cross-tenant
// access rejection). PATCH/POST/DELETE follow the same `WHERE company_id`
// pattern and are transitively covered.
//
// They require a real DB connection (TEST_DATABASE_URL); gated behind
// describeIfDb so the suite skips cleanly without a DB.

'use strict';

const request = require('supertest');
const app = require('../../app');
const {
  describeIfDb,
  closePool,
  seedCompany,
  seedUser,
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

describeIfDb('tenantDb middleware — Section 89-C/8 batch (/api/projects)', () => {
  let companyA;
  let companyB;
  let adminA;
  let adminB;
  let projectA;
  let projectB;

  beforeAll(async () => {
    companyA = await seedCompany();
    companyB = await seedCompany();

    adminA = await seedUser({ company_id: companyA.company_id, role: 'COMPANY_ADMIN' });
    adminB = await seedUser({ company_id: companyB.company_id, role: 'COMPANY_ADMIN' });

    projectA = await seedProject({ company_id: companyA.company_id });
    projectB = await seedProject({ company_id: companyB.company_id });
  });

  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  // ── GET /api/projects ────────────────────────────────────────

  test('projects: company A admin sees only company A projects', async () => {
    const { token } = await loginUser(adminA);
    const res = await request(app).get('/api/projects').set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    const projectIds = res.body.projects.map((p) => Number(p.id));
    expect(projectIds).toContain(projectA.id);
    expect(projectIds).not.toContain(projectB.id);
  });

  test('projects: company B admin sees only company B projects', async () => {
    const { token } = await loginUser(adminB);
    const res = await request(app).get('/api/projects').set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    const projectIds = res.body.projects.map((p) => Number(p.id));
    expect(projectIds).toContain(projectB.id);
    expect(projectIds).not.toContain(projectA.id);
  });

  // ── GET /api/projects/:id (cross-tenant) ─────────────────────

  test('projects/:id: company A admin gets 404 trying to read company B project', async () => {
    const { token } = await loginUser(adminA);
    const res = await request(app)
      .get(`/api/projects/${projectB.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('PROJECT_NOT_FOUND');
  });

  test('projects/:id: company A admin can read own project', async () => {
    const { token } = await loginUser(adminA);
    const res = await request(app)
      .get(`/api/projects/${projectA.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Number(res.body.project.id)).toBe(projectA.id);
  });
});
