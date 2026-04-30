const request = require('supertest');
const app = require('../../app');
const {
  describeIfDb,
  closePool,
  seedCompany,
  seedUser,
  seedEmployee,
  seedProject,
  seedSupplier,
  seedAssignment,
  seedMaterialRequest,
  seedAttendanceFixture,
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
    expect(returnedIds).toEqual(expect.arrayContaining([empA1.id, empA2.id]));
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

describeIfDb('Tenant isolation — GET /api/suppliers', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test("Company A admin sees only A's suppliers", async () => {
    const companyA = await seedCompany();
    const companyB = await seedCompany();
    const adminA = await seedUser({ company_id: companyA.company_id, role: 'COMPANY_ADMIN' });
    const supA1 = await seedSupplier({ company_id: companyA.company_id });
    const supA2 = await seedSupplier({ company_id: companyA.company_id });
    const supB1 = await seedSupplier({ company_id: companyB.company_id });
    const supB2 = await seedSupplier({ company_id: companyB.company_id });

    const { token } = await loginUser(adminA);
    const res = await request(app).get('/api/suppliers').set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.suppliers)).toBe(true);

    const returnedIds = res.body.suppliers.map((s) => Number(s.id));
    expect(returnedIds).toEqual(expect.arrayContaining([supA1.id, supA2.id]));
    expect(returnedIds).not.toContain(supB1.id);
    expect(returnedIds).not.toContain(supB2.id);
  });

  test("Company B admin sees only B's suppliers (symmetry)", async () => {
    const companyA = await seedCompany();
    const companyB = await seedCompany();
    const adminB = await seedUser({ company_id: companyB.company_id, role: 'COMPANY_ADMIN' });
    const supA = await seedSupplier({ company_id: companyA.company_id });
    const supB = await seedSupplier({ company_id: companyB.company_id });

    const { token } = await loginUser(adminB);
    const res = await request(app).get('/api/suppliers').set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    const returnedIds = res.body.suppliers.map((s) => Number(s.id));
    expect(returnedIds).toContain(supB.id);
    expect(returnedIds).not.toContain(supA.id);
  });

  test('trade_code filter still respects tenant boundary', async () => {
    const companyA = await seedCompany();
    const companyB = await seedCompany();
    const adminA = await seedUser({ company_id: companyA.company_id, role: 'COMPANY_ADMIN' });
    const supA = await seedSupplier({ company_id: companyA.company_id, trade_code: 'PLUMBING' });
    const supB = await seedSupplier({ company_id: companyB.company_id, trade_code: 'PLUMBING' });

    const { token } = await loginUser(adminA);
    const res = await request(app)
      .get('/api/suppliers?trade_code=PLUMBING')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    const returnedIds = res.body.suppliers.map((s) => Number(s.id));
    expect(returnedIds).toContain(supA.id);
    expect(returnedIds).not.toContain(supB.id);
  });
});

describeIfDb('Tenant isolation — GET /api/assignments', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test("Company A admin sees only A's APPROVED assignments", async () => {
    const companyA = await seedCompany();
    const companyB = await seedCompany();
    const adminA = await seedUser({ company_id: companyA.company_id, role: 'COMPANY_ADMIN' });
    const adminB = await seedUser({ company_id: companyB.company_id, role: 'COMPANY_ADMIN' });

    const asgA = await seedAssignment({
      company_id: companyA.company_id,
      requested_by_user_id: adminA.id,
    });
    const asgB = await seedAssignment({
      company_id: companyB.company_id,
      requested_by_user_id: adminB.id,
    });

    const { token } = await loginUser(adminA);
    const res = await request(app).get('/api/assignments').set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.assignments)).toBe(true);

    const returnedIds = res.body.assignments.map((a) => Number(a.id));
    expect(returnedIds).toContain(asgA.id);
    expect(returnedIds).not.toContain(asgB.id);
  });

  test("Company B admin sees only B's APPROVED assignments (symmetry)", async () => {
    const companyA = await seedCompany();
    const companyB = await seedCompany();
    const adminA = await seedUser({ company_id: companyA.company_id, role: 'COMPANY_ADMIN' });
    const adminB = await seedUser({ company_id: companyB.company_id, role: 'COMPANY_ADMIN' });

    const asgA = await seedAssignment({
      company_id: companyA.company_id,
      requested_by_user_id: adminA.id,
    });
    const asgB = await seedAssignment({
      company_id: companyB.company_id,
      requested_by_user_id: adminB.id,
    });

    const { token } = await loginUser(adminB);
    const res = await request(app).get('/api/assignments').set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    const returnedIds = res.body.assignments.map((a) => Number(a.id));
    expect(returnedIds).toContain(asgB.id);
    expect(returnedIds).not.toContain(asgA.id);
  });
});

describeIfDb('Tenant isolation — GET /api/assignments/requests', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test("Company A admin sees only A's assignment requests", async () => {
    const companyA = await seedCompany();
    const companyB = await seedCompany();
    const adminA = await seedUser({ company_id: companyA.company_id, role: 'COMPANY_ADMIN' });
    const adminB = await seedUser({ company_id: companyB.company_id, role: 'COMPANY_ADMIN' });

    const asgA1 = await seedAssignment({
      company_id: companyA.company_id,
      requested_by_user_id: adminA.id,
      status: 'APPROVED',
    });
    const asgA2 = await seedAssignment({
      company_id: companyA.company_id,
      requested_by_user_id: adminA.id,
      status: 'PENDING',
    });
    const asgB1 = await seedAssignment({
      company_id: companyB.company_id,
      requested_by_user_id: adminB.id,
      status: 'APPROVED',
    });
    const asgB2 = await seedAssignment({
      company_id: companyB.company_id,
      requested_by_user_id: adminB.id,
      status: 'PENDING',
    });

    const { token } = await loginUser(adminA);
    const res = await request(app)
      .get('/api/assignments/requests')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.requests)).toBe(true);

    const returnedIds = res.body.requests.map((r) => Number(r.id));
    expect(returnedIds).toEqual(expect.arrayContaining([asgA1.id, asgA2.id]));
    expect(returnedIds).not.toContain(asgB1.id);
    expect(returnedIds).not.toContain(asgB2.id);
  });
});

describeIfDb('Tenant isolation — GET /api/materials/requests', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test("Company A admin sees only A's material requests", async () => {
    const companyA = await seedCompany();
    const companyB = await seedCompany();
    const adminA = await seedUser({ company_id: companyA.company_id, role: 'COMPANY_ADMIN' });

    const mrA1 = await seedMaterialRequest({ company_id: companyA.company_id });
    const mrA2 = await seedMaterialRequest({ company_id: companyA.company_id });
    const mrB1 = await seedMaterialRequest({ company_id: companyB.company_id });
    const mrB2 = await seedMaterialRequest({ company_id: companyB.company_id });

    const { token } = await loginUser(adminA);
    const res = await request(app)
      .get('/api/materials/requests')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.requests)).toBe(true);

    const returnedIds = res.body.requests.map((r) => Number(r.id));
    expect(returnedIds).toEqual(expect.arrayContaining([mrA1.id, mrA2.id]));
    expect(returnedIds).not.toContain(mrB1.id);
    expect(returnedIds).not.toContain(mrB2.id);
  });

  test("Company B admin sees only B's material requests (symmetry)", async () => {
    const companyA = await seedCompany();
    const companyB = await seedCompany();
    const adminB = await seedUser({ company_id: companyB.company_id, role: 'COMPANY_ADMIN' });

    const mrA = await seedMaterialRequest({ company_id: companyA.company_id });
    const mrB = await seedMaterialRequest({ company_id: companyB.company_id });

    const { token } = await loginUser(adminB);
    const res = await request(app)
      .get('/api/materials/requests')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    const returnedIds = res.body.requests.map((r) => Number(r.id));
    expect(returnedIds).toContain(mrB.id);
    expect(returnedIds).not.toContain(mrA.id);
  });
});

describeIfDb('Tenant isolation — GET /api/materials/requests/:id', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test("Company A admin GETting B's material request by ID returns 404", async () => {
    const companyA = await seedCompany();
    const companyB = await seedCompany();
    const adminA = await seedUser({ company_id: companyA.company_id, role: 'COMPANY_ADMIN' });
    const mrB = await seedMaterialRequest({ company_id: companyB.company_id });

    const { token } = await loginUser(adminA);
    const res = await request(app)
      .get(`/api/materials/requests/${mrB.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({ ok: false, error: 'NOT_FOUND' });
  });

  test('Company A admin GETting their OWN material request returns 200', async () => {
    const companyA = await seedCompany();
    const adminA = await seedUser({ company_id: companyA.company_id, role: 'COMPANY_ADMIN' });
    const mrA = await seedMaterialRequest({ company_id: companyA.company_id });

    const { token } = await loginUser(adminA);
    const res = await request(app)
      .get(`/api/materials/requests/${mrA.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Number(res.body.request.id)).toBe(mrA.id);
  });
});

describeIfDb('Tenant isolation — GET /api/attendance', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test("Company A admin sees only A's attendance records", async () => {
    const companyA = await seedCompany();
    const companyB = await seedCompany();
    const adminA = await seedUser({ company_id: companyA.company_id, role: 'COMPANY_ADMIN' });

    const fxA = await seedAttendanceFixture({ company_id: companyA.company_id });
    const fxB = await seedAttendanceFixture({ company_id: companyB.company_id });

    const { token } = await loginUser(adminA);
    const res = await request(app).get('/api/attendance').set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.records)).toBe(true);

    const returnedAsgIds = res.body.records.map((r) => Number(r.assignment_request_id));
    expect(returnedAsgIds).toContain(fxA.assignment.id);
    expect(returnedAsgIds).not.toContain(fxB.assignment.id);
  });

  test("Company B admin sees only B's attendance records (symmetry)", async () => {
    const companyA = await seedCompany();
    const companyB = await seedCompany();
    const adminB = await seedUser({ company_id: companyB.company_id, role: 'COMPANY_ADMIN' });

    const fxA = await seedAttendanceFixture({ company_id: companyA.company_id });
    const fxB = await seedAttendanceFixture({ company_id: companyB.company_id });

    const { token } = await loginUser(adminB);
    const res = await request(app).get('/api/attendance').set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    const returnedAsgIds = res.body.records.map((r) => Number(r.assignment_request_id));
    expect(returnedAsgIds).toContain(fxB.assignment.id);
    expect(returnedAsgIds).not.toContain(fxA.assignment.id);
  });
});

describeIfDb('Tenant isolation — GET /api/hub/workers', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test("Company A admin sees only A's workers", async () => {
    const companyA = await seedCompany();
    const companyB = await seedCompany();
    const adminA = await seedUser({ company_id: companyA.company_id, role: 'COMPANY_ADMIN' });

    const empA = await seedEmployee({ company_id: companyA.company_id });
    const workerA = await seedUser({
      company_id: companyA.company_id,
      employee_id: empA.id,
      role: 'WORKER',
    });
    const empB = await seedEmployee({ company_id: companyB.company_id });
    const workerB = await seedUser({
      company_id: companyB.company_id,
      employee_id: empB.id,
      role: 'WORKER',
    });

    const { token } = await loginUser(adminA);
    const res = await request(app).get('/api/hub/workers').set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.workers)).toBe(true);

    const returnedUserIds = res.body.workers.map((w) => Number(w.id));
    expect(returnedUserIds).toContain(workerA.id);
    expect(returnedUserIds).not.toContain(workerB.id);
  });

  test("Company B admin sees only B's workers (symmetry)", async () => {
    const companyA = await seedCompany();
    const companyB = await seedCompany();
    const adminB = await seedUser({ company_id: companyB.company_id, role: 'COMPANY_ADMIN' });

    const empA = await seedEmployee({ company_id: companyA.company_id });
    const workerA = await seedUser({
      company_id: companyA.company_id,
      employee_id: empA.id,
      role: 'WORKER',
    });
    const empB = await seedEmployee({ company_id: companyB.company_id });
    const workerB = await seedUser({
      company_id: companyB.company_id,
      employee_id: empB.id,
      role: 'WORKER',
    });

    const { token } = await loginUser(adminB);
    const res = await request(app).get('/api/hub/workers').set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    const returnedUserIds = res.body.workers.map((w) => Number(w.id));
    expect(returnedUserIds).toContain(workerB.id);
    expect(returnedUserIds).not.toContain(workerA.id);
  });
});

describeIfDb('Tenant isolation — GET /api/hub/my-projects', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test("Company A admin sees only A's projects (admin fallback path)", async () => {
    const companyA = await seedCompany();
    const companyB = await seedCompany();
    const adminA = await seedUser({ company_id: companyA.company_id, role: 'COMPANY_ADMIN' });

    const projA = await seedProject({ company_id: companyA.company_id });
    const projB = await seedProject({ company_id: companyB.company_id });

    const { token } = await loginUser(adminA);
    const res = await request(app)
      .get('/api/hub/my-projects')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.projects)).toBe(true);

    const returnedIds = res.body.projects.map((p) => Number(p.id));
    expect(returnedIds).toContain(projA.id);
    expect(returnedIds).not.toContain(projB.id);
  });
});
