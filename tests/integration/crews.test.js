// tests/integration/crews.test.js — Assignments Phase 2, CREW concept
// (DECISIONS §131.2, Slice 1). Covers the routes/crews.js CRUD plus the
// cross-tenant isolation that matters most (a company must not see another
// company's crews, nor add another company's employee to its roster).
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

// A COMPANY_ADMIN (holds assignments.view/create/edit in the test seed).
async function seedAdmin(companyId) {
  const admin = await seedUser({ company_id: companyId, role: 'COMPANY_ADMIN' });
  const { token } = await loginUser(admin);
  return { admin, token };
}

describeIfDb('crews CRUD + tenant isolation', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('full lifecycle: create → list → get → patch → delete', async () => {
    const company = await seedCompany();
    const { token } = await seedAdmin(company.company_id);
    const foreman = await seedEmployee({ company_id: company.company_id });
    const m1 = await seedEmployee({ company_id: company.company_id });
    const m2 = await seedEmployee({ company_id: company.company_id });

    // Create
    const created = await request(app)
      .post('/api/crews')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Crew Alpha',
        foreman_employee_id: foreman.id,
        trade_code: 'PLUMBING',
        member_ids: [m1.id, m2.id],
      });
    expect(created.statusCode).toBe(201);
    expect(created.body.ok).toBe(true);
    const crewId = created.body.crew.id;
    expect(created.body.crew.name).toBe('Crew Alpha');
    expect(created.body.crew.members).toHaveLength(2);

    // List
    const list = await request(app).get('/api/crews').set('Authorization', `Bearer ${token}`);
    expect(list.statusCode).toBe(200);
    const found = list.body.crews.find((c) => Number(c.id) === Number(crewId));
    expect(found).toBeDefined();
    expect(found.member_count).toBe(2);

    // Get one
    const one = await request(app)
      .get(`/api/crews/${crewId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(one.statusCode).toBe(200);
    expect(one.body.crew.members).toHaveLength(2);

    // Patch: rename + shrink roster to one member
    const patched = await request(app)
      .patch(`/api/crews/${crewId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Crew Alpha Renamed', member_ids: [m1.id] });
    expect(patched.statusCode).toBe(200);
    expect(patched.body.crew.name).toBe('Crew Alpha Renamed');
    expect(patched.body.crew.members).toHaveLength(1);

    // Delete → then 404
    const del = await request(app)
      .delete(`/api/crews/${crewId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(del.statusCode).toBe(200);
    const gone = await request(app)
      .get(`/api/crews/${crewId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(gone.statusCode).toBe(404);
  });

  test('400 NAME_REQUIRED when name missing', async () => {
    const company = await seedCompany();
    const { token } = await seedAdmin(company.company_id);
    const res = await request(app)
      .post('/api/crews')
      .set('Authorization', `Bearer ${token}`)
      .send({ member_ids: [] });
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ ok: false, error: 'NAME_REQUIRED' });
  });

  test('409 NAME_TAKEN on duplicate crew name within a company', async () => {
    const company = await seedCompany();
    const { token } = await seedAdmin(company.company_id);
    await request(app)
      .post('/api/crews')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Dup Crew' });
    const dup = await request(app)
      .post('/api/crews')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Dup Crew' });
    expect(dup.statusCode).toBe(409);
    expect(dup.body).toMatchObject({ ok: false, error: 'NAME_TAKEN' });
  });

  test('TENANT ISOLATION: company B cannot read or borrow company A crew/employees', async () => {
    // Company A: a crew + an employee.
    const compA = await seedCompany();
    const { token: tokenA } = await seedAdmin(compA.company_id);
    const empA = await seedEmployee({ company_id: compA.company_id });
    const crewA = await request(app)
      .post('/api/crews')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'A Secret Crew', member_ids: [empA.id] });
    expect(crewA.statusCode).toBe(201);
    const crewAId = crewA.body.crew.id;

    // Company B.
    const compB = await seedCompany();
    const { token: tokenB } = await seedAdmin(compB.company_id);

    // B cannot GET A's crew (RLS → 404).
    const peek = await request(app)
      .get(`/api/crews/${crewAId}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(peek.statusCode).toBe(404);

    // B cannot DELETE A's crew (RLS → 404, and A's crew survives).
    const delAttempt = await request(app)
      .delete(`/api/crews/${crewAId}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(delAttempt.statusCode).toBe(404);

    // B cannot add A's employee to a B crew (ownership validation → 400).
    const borrow = await request(app)
      .post('/api/crews')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ name: 'B Crew', member_ids: [empA.id] });
    expect(borrow.statusCode).toBe(400);
    expect(borrow.body).toMatchObject({ ok: false, error: 'INVALID_MEMBER' });

    // A's crew is still intact.
    const stillThere = await request(app)
      .get(`/api/crews/${crewAId}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(stillThere.statusCode).toBe(200);
    expect(stillThere.body.crew.members).toHaveLength(1);
  });
});

// ──────────────────────────────────────────────────────────────────
describeIfDb('POST /api/crews/:id/plan (crew deploy preview)', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('expands roster into a wizard-compatible block (foreman role + members)', async () => {
    const company = await seedCompany();
    const { token } = await seedAdmin(company.company_id);
    const foreman = await seedEmployee({ company_id: company.company_id });
    const m1 = await seedEmployee({ company_id: company.company_id });
    await seedEmployeeProfile({ employee_id: foreman.id, full_name: 'Boss Foreman' });
    await seedEmployeeProfile({ employee_id: m1.id, full_name: 'Worker One' });
    const project = await seedProject({ company_id: company.company_id });

    const crew = await request(app)
      .post('/api/crews')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Deploy Crew', foreman_employee_id: foreman.id, member_ids: [m1.id] });
    expect(crew.statusCode).toBe(201);

    const plan = await request(app)
      .post(`/api/crews/${crew.body.crew.id}/plan`)
      .set('Authorization', `Bearer ${token}`)
      .send({ project_id: project.id, target_date: '2026-07-01' });

    expect(plan.statusCode).toBe(200);
    expect(plan.body.suggestions).toHaveLength(1);
    const block = plan.body.suggestions[0];
    expect(Number(block.project_id)).toBe(Number(project.id));
    // Roster = foreman + 1 member.
    expect(block.employees).toHaveLength(2);
    const foremanRow = block.employees.find((e) => Number(e.employee_id) === Number(foreman.id));
    const memberRow = block.employees.find((e) => Number(e.employee_id) === Number(m1.id));
    expect(foremanRow.assignment_role).toBe('FOREMAN');
    expect(memberRow.assignment_role).toBe('WORKER');
    expect(plan.body.totals.headcount).toBe(2);
  });

  test('400 when target_date or project_id missing', async () => {
    const company = await seedCompany();
    const { token } = await seedAdmin(company.company_id);
    const crew = await request(app)
      .post('/api/crews')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Bare Crew' });
    const res = await request(app)
      .post(`/api/crews/${crew.body.crew.id}/plan`)
      .set('Authorization', `Bearer ${token}`)
      .send({ project_id: 1 });
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ ok: false, error: 'TARGET_DATE_REQUIRED' });
  });

  test('404 when planning a crew from another company', async () => {
    const compA = await seedCompany();
    const { token: tokenA } = await seedAdmin(compA.company_id);
    const crewA = await request(app)
      .post('/api/crews')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'A Deploy Crew' });

    const compB = await seedCompany();
    const { token: tokenB } = await seedAdmin(compB.company_id);
    const projB = await seedProject({ company_id: compB.company_id });

    const res = await request(app)
      .post(`/api/crews/${crewA.body.crew.id}/plan`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ project_id: projB.id, target_date: '2026-07-01' });
    expect(res.statusCode).toBe(404);
  });
});
