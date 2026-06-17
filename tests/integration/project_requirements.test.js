// tests/integration/project_requirements.test.js — Project-centric redesign,
// Phase 0 (DECISIONS §147). Covers routes/project_requirements.js CRUD, the
// coverage (required vs assigned vs gap) computation, and tenant isolation.
//
// Gated by describeIfDb — skips locally without TEST_DATABASE_URL, runs in CI.

'use strict';

const request = require('supertest');
const app = require('../../app');
const {
  describeIfDb,
  closePool,
  seedCompany,
  seedUser,
  seedEmployee,
  seedEmployeeProfile,
  seedProject,
  seedAssignment,
  cleanupTestRows,
} = require('../helpers/db');

async function loginUser(user, pin) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, pin: pin || user.pin || '1234' });
  if (res.statusCode !== 200) {
    throw new Error(`Login failed in test setup: ${res.statusCode} ${JSON.stringify(res.body)}`);
  }
  return res.body;
}

async function seedAdmin(companyId) {
  const admin = await seedUser({ company_id: companyId, role: 'COMPANY_ADMIN' });
  const { token } = await loginUser(admin);
  return { admin, token };
}

describeIfDb('project labor requirements CRUD + tenant isolation', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('lifecycle: create → list → patch → delete', async () => {
    const company = await seedCompany();
    const { token } = await seedAdmin(company.company_id);
    const project = await seedProject({ company_id: company.company_id });

    const created = await request(app)
      .post(`/api/projects/${project.id}/requirements`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        trade_code: 'plumbing',
        required_count: 3,
        start_date: '2026-07-01',
        end_date: '2026-07-31',
      });
    expect(created.statusCode).toBe(201);
    expect(created.body.requirement.trade_code).toBe('PLUMBING'); // normalized upper
    expect(created.body.requirement.required_count).toBe(3);
    const reqId = created.body.requirement.id;

    const list = await request(app)
      .get(`/api/projects/${project.id}/requirements`)
      .set('Authorization', `Bearer ${token}`);
    expect(list.statusCode).toBe(200);
    expect(list.body.requirements).toHaveLength(1);

    const patched = await request(app)
      .patch(`/api/projects/${project.id}/requirements/${reqId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ required_count: 5 });
    expect(patched.statusCode).toBe(200);
    expect(patched.body.requirement.required_count).toBe(5);

    const del = await request(app)
      .delete(`/api/projects/${project.id}/requirements/${reqId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(del.statusCode).toBe(200);

    const after = await request(app)
      .get(`/api/projects/${project.id}/requirements`)
      .set('Authorization', `Bearer ${token}`);
    expect(after.body.requirements).toHaveLength(0);
  });

  test('400 on missing trade and on inverted date range', async () => {
    const company = await seedCompany();
    const { token } = await seedAdmin(company.company_id);
    const project = await seedProject({ company_id: company.company_id });

    const noTrade = await request(app)
      .post(`/api/projects/${project.id}/requirements`)
      .set('Authorization', `Bearer ${token}`)
      .send({ required_count: 1, start_date: '2026-07-01', end_date: '2026-07-31' });
    expect(noTrade.statusCode).toBe(400);
    expect(noTrade.body.error).toBe('TRADE_CODE_REQUIRED');

    const badRange = await request(app)
      .post(`/api/projects/${project.id}/requirements`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        trade_code: 'HVAC',
        required_count: 1,
        start_date: '2026-07-31',
        end_date: '2026-07-01',
      });
    expect(badRange.statusCode).toBe(400);
    expect(badRange.body.error).toBe('INVALID_DATE_RANGE');
  });

  test('coverage: required vs assigned vs gap on a date', async () => {
    const company = await seedCompany();
    const { token } = await seedAdmin(company.company_id);
    const project = await seedProject({ company_id: company.company_id });

    // Need: 2 plumbers across July.
    await request(app)
      .post(`/api/projects/${project.id}/requirements`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        trade_code: 'PLUMBING',
        required_count: 2,
        start_date: '2026-07-01',
        end_date: '2026-07-31',
      });

    // One plumber actually assigned over the window.
    const emp = await seedEmployee({ company_id: company.company_id });
    await seedEmployeeProfile({ employee_id: emp.id, trade_code: 'PLUMBING' });
    await seedAssignment({
      company_id: company.company_id,
      project_id: project.id,
      employee_id: emp.id,
      start_date: '2026-07-01',
      end_date: '2026-07-31',
      status: 'APPROVED',
    });

    const cov = await request(app)
      .get(`/api/projects/${project.id}/coverage?date=2026-07-15`)
      .set('Authorization', `Bearer ${token}`);
    expect(cov.statusCode).toBe(200);
    const plumbing = cov.body.coverage.find((c) => c.trade_code === 'PLUMBING');
    expect(plumbing).toMatchObject({ required: 2, assigned: 1, gap: 1 });
    expect(cov.body.totals).toMatchObject({ required: 2, assigned: 1, gap: 1 });
  });

  test('TENANT ISOLATION: company B cannot add to or read company A project', async () => {
    const compA = await seedCompany();
    const { token: tokenA } = await seedAdmin(compA.company_id);
    const projA = await seedProject({ company_id: compA.company_id });

    const compB = await seedCompany();
    const { token: tokenB } = await seedAdmin(compB.company_id);

    // B cannot create a requirement on A's project (project not in B's company → 404).
    const create = await request(app)
      .post(`/api/projects/${projA.id}/requirements`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        trade_code: 'PLUMBING',
        required_count: 1,
        start_date: '2026-07-01',
        end_date: '2026-07-31',
      });
    expect(create.statusCode).toBe(404);

    // B cannot list A's project requirements.
    const list = await request(app)
      .get(`/api/projects/${projA.id}/requirements`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(list.statusCode).toBe(404);
  });
});
