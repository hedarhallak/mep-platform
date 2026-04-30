// Tenant isolation tests — Phase 12.
//
// Proves that a logged-in user from Company A cannot see or fetch
// resources belonging to Company B. The first regression suite that
// directly validates the multi-tenant boundary the entire product
// depends on.
//
// Pattern:
//   1. Seed Company A + Company B
//   2. Seed a COMPANY_ADMIN user in each
//   3. Seed employees scoped to each company
//   4. Login as A's admin, hit GET /api/employees, assert only A's
//      employees come back (B's must NOT appear)
//   5. Repeat from B's side for symmetry

const request = require('supertest');
const app = require('../../app');
const {
  describeIfDb,
  closePool,
  seedCompany,
  seedUser,
  seedEmployee,
  cleanupTestRows,
} = require('../helpers/db');

async function loginUser(user, pin = '1234') {
  const res = await request(app).post('/api/auth/login').send({ username: user.username, pin });
  if (res.statusCode !== 200) {
    throw new Error(`Login failed in test setup: ${res.statusCode} ${JSON.stringify(res.body)}`);
  }
  return res.body;
}

describeIfDb('Tenant isolation — GET /api/employees', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test("Company A admin sees only Company A's employees", async () => {
    const companyA = await seedCompany();
    const companyB = await seedCompany();

    const adminA = await seedUser({ company_id: companyA.company_id, role: 'COMPANY_ADMIN' });
    const empA1 = await seedEmployee({ company_id: companyA.company_id, first_name: 'Alice' });
    const empA2 = await seedEmployee({ company_id: companyA.company_id, first_name: 'Andre' });
    const empB1 = await seedEmployee({ company_id: companyB.company_id, first_name: 'Bob' });
    const empB2 = await seedEmployee({ company_id: companyB.company_id, first_name: 'Beatrice' });

    const { token } = await loginUser(adminA);

    const res = await request(app).get('/api/employees').set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.employees)).toBe(true);

    const returnedIds = res.body.employees.map((e) => Number(e.id));

    // Must include both of A's employees.
    expect(returnedIds).toEqual(expect.arrayContaining([empA1.id, empA2.id]));

    // Must NOT include any of B's employees.
    expect(returnedIds).not.toContain(empB1.id);
    expect(returnedIds).not.toContain(empB2.id);
  });

  test("Company B admin sees only Company B's employees (symmetry)", async () => {
    const companyA = await seedCompany();
    const companyB = await seedCompany();

    const adminB = await seedUser({ company_id: companyB.company_id, role: 'COMPANY_ADMIN' });
    const empA = await seedEmployee({ company_id: companyA.company_id, first_name: 'Alice' });
    const empB = await seedEmployee({ company_id: companyB.company_id, first_name: 'Bob' });

    const { token } = await loginUser(adminB);

    const res = await request(app).get('/api/employees').set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    const returnedIds = res.body.employees.map((e) => Number(e.id));
    expect(returnedIds).toContain(empB.id);
    expect(returnedIds).not.toContain(empA.id);
  });

  test('user without a company_id (e.g. orphaned account) is rejected with 403', async () => {
    // Insert a user with no company_id. The route returns 403
    // COMPANY_CONTEXT_REQUIRED when a non-SUPER_ADMIN has no company_id.
    const orphan = await seedUser({ company_id: null, role: 'COMPANY_ADMIN' });
    const { token } = await loginUser(orphan);

    const res = await request(app).get('/api/employees').set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ ok: false, error: 'COMPANY_CONTEXT_REQUIRED' });
  });
});

describeIfDb('Tenant isolation — GET /api/employees/:id', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test("Company A admin GETting B's employee by ID returns 404 EMPLOYEE_NOT_FOUND", async () => {
    const companyA = await seedCompany();
    const companyB = await seedCompany();

    const adminA = await seedUser({ company_id: companyA.company_id, role: 'COMPANY_ADMIN' });
    const empB = await seedEmployee({ company_id: companyB.company_id });

    const { token } = await loginUser(adminA);

    const res = await request(app)
      .get(`/api/employees/${empB.id}`)
      .set('Authorization', `Bearer ${token}`);

    // Must NOT return 200 with B's data, must NOT return 403 (which would
    // confirm B's employee exists). 404 with EMPLOYEE_NOT_FOUND is the
    // canonical "this row is invisible to you" response.
    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({ ok: false, error: 'EMPLOYEE_NOT_FOUND' });
  });

  test('Company A admin GETting their OWN employee by ID returns 200 with the row', async () => {
    const companyA = await seedCompany();
    const adminA = await seedUser({ company_id: companyA.company_id, role: 'COMPANY_ADMIN' });
    const empA = await seedEmployee({
      company_id: companyA.company_id,
      first_name: 'Sasha',
      last_name: 'Same-Company',
    });

    const { token } = await loginUser(adminA);

    const res = await request(app)
      .get(`/api/employees/${empA.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Number(res.body.employee.id)).toBe(empA.id);
    expect(res.body.employee.first_name).toBe('Sasha');
  });

  test('GET /api/employees/:id with non-numeric id returns 400 INVALID_ID', async () => {
    const companyA = await seedCompany();
    const adminA = await seedUser({ company_id: companyA.company_id, role: 'COMPANY_ADMIN' });
    const { token } = await loginUser(adminA);

    const res = await request(app)
      .get('/api/employees/not-a-number')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ ok: false, error: 'INVALID_ID' });
  });
});

// ─── Phase 12.2 — same A/B pattern on /api/projects ────────────────
const { seedProject } = require('../helpers/db');

describeIfDb('Tenant isolation — GET /api/projects', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test("Company A admin sees only A's projects", async () => {
    const companyA = await seedCompany();
    const companyB = await seedCompany();

    const adminA = await seedUser({ company_id: companyA.company_id, role: 'COMPANY_ADMIN' });
    const projA1 = await seedProject({ company_id: companyA.company_id, project_name: 'Alpha' });
    const projA2 = await seedProject({ company_id: companyA.company_id, project_name: 'Atrium' });
    const projB1 = await seedProject({ company_id: companyB.company_id, project_name: 'Beta' });
    const projB2 = await seedProject({ company_id: companyB.company_id, project_name: 'Bravo' });

    const { token } = await loginUser(adminA);

    const res = await request(app).get('/api/projects').set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.projects)).toBe(true);

    const returnedIds = res.body.projects.map((p) => Number(p.id));

    expect(returnedIds).toEqual(expect.arrayContaining([projA1.id, projA2.id]));
    expect(returnedIds).not.toContain(projB1.id);
    expect(returnedIds).not.toContain(projB2.id);
  });

  test("Company B admin sees only B's projects (symmetry)", async () => {
    const companyA = await seedCompany();
    const companyB = await seedCompany();
    const adminB = await seedUser({ company_id: companyB.company_id, role: 'COMPANY_ADMIN' });
    const projA = await seedProject({ company_id: companyA.company_id });
    const projB = await seedProject({ company_id: companyB.company_id });

    const { token } = await loginUser(adminB);

    const res = await request(app).get('/api/projects').set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    const returnedIds = res.body.projects.map((p) => Number(p.id));
    expect(returnedIds).toContain(projB.id);
    expect(returnedIds).not.toContain(projA.id);
  });
});

describeIfDb('Tenant isolation — GET /api/projects/:id', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test("Company A admin GETting B's project by ID returns 404", async () => {
    const companyA = await seedCompany();
    const companyB = await seedCompany();
    const adminA = await seedUser({ company_id: companyA.company_id, role: 'COMPANY_ADMIN' });
    const projB = await seedProject({ company_id: companyB.company_id });

    const { token } = await loginUser(adminA);

    const res = await request(app)
      .get(`/api/projects/${projB.id}`)
      .set('Authorization', `Bearer ${token}`);

    // Cross-tenant must NOT return 200 with B's data and must NOT 403
    // (which would confirm the row exists). 404 is the canonical
    // "this row is invisible to you" response.
    expect(res.statusCode).toBe(404);
  });

  test('Company A admin GETting their OWN project returns 200', async () => {
    const companyA = await seedCompany();
    const adminA = await seedUser({ company_id: companyA.company_id, role: 'COMPANY_ADMIN' });
    const projA = await seedProject({ company_id: companyA.company_id, project_name: 'Same-Co' });

    const { token } = await loginUser(adminA);

    const res = await request(app)
      .get(`/api/projects/${projA.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Number(res.body.project.id)).toBe(projA.id);
  });
});
