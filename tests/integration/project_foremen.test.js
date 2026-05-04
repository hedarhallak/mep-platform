// Section 67/68 — project_foremen integration tests.
//
// Covers GET / POST / DELETE on /api/project-foremen/* after migration 002
// fixed the legacy NOT NULL bug + composite PK swap. Section 65 Phase 2a
// originally drafted these tests; the file was deleted in working tree
// before any commit captured it. This is the rewrite.
//
// Surface:
//   GET    /api/project-foremen/:project_id
//   POST   /api/project-foremen/:project_id     (requires projects.edit)
//   DELETE /api/project-foremen/:project_id/:trade  (requires projects.edit)

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

// Helper: seed a complete employee fixture (employee + profile + linked app_user)
// suitable for being assigned as a foreman. POST verifies via app_users.company_id.
async function seedForemanCandidate(companyId, opts = {}) {
  const employee = await seedEmployee({ company_id: companyId });
  await seedEmployeeProfile({
    employee_id: employee.id,
    full_name: opts.full_name || `Foreman ${employee.id}`,
    trade_code: opts.trade_code || 'GENERAL',
  });
  await seedUser({
    company_id: companyId,
    employee_id: employee.id,
    role: 'FOREMAN',
  });
  return employee;
}

describeIfDb('project_foremen — /api/project-foremen', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  // ────────────── GET ──────────────

  test('GET /:project_id on own project with no foremen returns empty array (200)', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const proj = await seedProject({ company_id: company.company_id });

    const { token } = await loginUser(admin);

    const res = await request(app)
      .get(`/api/project-foremen/${proj.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.foremen)).toBe(true);
    expect(res.body.foremen).toEqual([]);
  });

  test('GET /:project_id returns assigned foremen joined with employee_profiles', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const proj = await seedProject({ company_id: company.company_id });
    const candidate = await seedForemanCandidate(company.company_id, {
      full_name: 'Alice Plumber',
      trade_code: 'PLUMBING',
    });

    // Insert the foreman row directly (POST is exercised separately below)
    await getPool().query(
      `INSERT INTO public.project_foremen
         (project_id, employee_id, trade_code, company_id)
       VALUES ($1, $2, $3, $4)`,
      [proj.id, candidate.id, 'PLUMBING', company.company_id]
    );

    const { token } = await loginUser(admin);
    const res = await request(app)
      .get(`/api/project-foremen/${proj.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.foremen).toHaveLength(1);
    expect(res.body.foremen[0]).toMatchObject({
      trade_code: 'PLUMBING',
      employee_id: candidate.id,
      foreman_name: 'Alice Plumber',
    });
  });

  test('GET /:project_id is tenant-scoped — other-company project returns empty array', async () => {
    const companyA = await seedCompany();
    const companyB = await seedCompany();
    const adminA = await seedUser({ company_id: companyA.company_id, role: 'COMPANY_ADMIN' });
    const projB = await seedProject({ company_id: companyB.company_id });

    const { token } = await loginUser(adminA);
    const res = await request(app)
      .get(`/api/project-foremen/${projB.id}`)
      .set('Authorization', `Bearer ${token}`);

    // Route filters WHERE pf.company_id = caller.company_id, so it
    // returns 200 with no rows rather than 404. That's the contract.
    expect(res.statusCode).toBe(200);
    expect(res.body.foremen).toEqual([]);
  });

  // ────────────── POST ──────────────

  test('POST /:project_id assigns a foreman and returns 201', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const proj = await seedProject({ company_id: company.company_id });
    const candidate = await seedForemanCandidate(company.company_id);

    const { token } = await loginUser(admin);
    const res = await request(app)
      .post(`/api/project-foremen/${proj.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ employee_id: candidate.id, trade_code: 'plumbing' });

    expect(res.statusCode).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.foreman).toMatchObject({
      project_id: String(proj.id),
      employee_id: candidate.id,
      trade_code: 'PLUMBING', // route uppercases
      company_id: company.company_id,
    });
  });

  test('POST /:project_id without employee_id returns 400 EMPLOYEE_REQUIRED', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const proj = await seedProject({ company_id: company.company_id });

    const { token } = await loginUser(admin);
    const res = await request(app)
      .post(`/api/project-foremen/${proj.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ trade_code: 'PLUMBING' });

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ ok: false, error: 'EMPLOYEE_REQUIRED' });
  });

  test('POST /:project_id without trade_code returns 400 TRADE_REQUIRED', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const proj = await seedProject({ company_id: company.company_id });
    const candidate = await seedForemanCandidate(company.company_id);

    const { token } = await loginUser(admin);
    const res = await request(app)
      .post(`/api/project-foremen/${proj.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ employee_id: candidate.id });

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ ok: false, error: 'TRADE_REQUIRED' });
  });

  test('POST /:project_id on non-existent project returns 404 PROJECT_NOT_FOUND', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const candidate = await seedForemanCandidate(company.company_id);

    const { token } = await loginUser(admin);
    const res = await request(app)
      .post('/api/project-foremen/99999999')
      .set('Authorization', `Bearer ${token}`)
      .send({ employee_id: candidate.id, trade_code: 'PLUMBING' });

    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({ ok: false, error: 'PROJECT_NOT_FOUND' });
  });

  test('POST /:project_id with employee from another company returns 404 EMPLOYEE_NOT_FOUND', async () => {
    const companyA = await seedCompany();
    const companyB = await seedCompany();
    const adminA = await seedUser({ company_id: companyA.company_id, role: 'COMPANY_ADMIN' });
    const projA = await seedProject({ company_id: companyA.company_id });
    const candidateB = await seedForemanCandidate(companyB.company_id);

    const { token } = await loginUser(adminA);
    const res = await request(app)
      .post(`/api/project-foremen/${projA.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ employee_id: candidateB.id, trade_code: 'PLUMBING' });

    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({ ok: false, error: 'EMPLOYEE_NOT_FOUND' });
  });

  test('POST /:project_id is RBAC-gated — WORKER without projects.edit gets 403', async () => {
    const company = await seedCompany();
    const worker = await seedUser({ company_id: company.company_id, role: 'WORKER' });
    const proj = await seedProject({ company_id: company.company_id });
    const candidate = await seedForemanCandidate(company.company_id);

    const { token } = await loginUser(worker);
    const res = await request(app)
      .post(`/api/project-foremen/${proj.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ employee_id: candidate.id, trade_code: 'PLUMBING' });

    expect(res.statusCode).toBe(403);
  });

  test('POST /:project_id replaces existing foreman for same trade (upsert via ON CONFLICT)', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const proj = await seedProject({ company_id: company.company_id });
    const first = await seedForemanCandidate(company.company_id, { full_name: 'First Foreman' });
    const second = await seedForemanCandidate(company.company_id, { full_name: 'Second Foreman' });

    const { token } = await loginUser(admin);

    // First assign
    const res1 = await request(app)
      .post(`/api/project-foremen/${proj.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ employee_id: first.id, trade_code: 'PLUMBING' });
    expect(res1.statusCode).toBe(201);
    expect(res1.body.foreman.employee_id).toBe(first.id);

    // Second assign on same (project, trade) — should replace
    const res2 = await request(app)
      .post(`/api/project-foremen/${proj.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ employee_id: second.id, trade_code: 'PLUMBING' });
    expect(res2.statusCode).toBe(201);
    expect(res2.body.foreman.employee_id).toBe(second.id);

    // Verify only one row exists for (project_id, trade_code)
    const { rows } = await getPool().query(
      `SELECT employee_id FROM public.project_foremen
       WHERE project_id = $1 AND trade_code = $2`,
      [proj.id, 'PLUMBING']
    );
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].employee_id)).toBe(second.id);
  });

  // ────────────── DELETE ──────────────

  test('DELETE /:project_id/:trade removes the foreman (200)', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const proj = await seedProject({ company_id: company.company_id });
    const candidate = await seedForemanCandidate(company.company_id);

    await getPool().query(
      `INSERT INTO public.project_foremen
         (project_id, employee_id, trade_code, company_id)
       VALUES ($1, $2, $3, $4)`,
      [proj.id, candidate.id, 'PLUMBING', company.company_id]
    );

    const { token } = await loginUser(admin);
    const res = await request(app)
      .delete(`/api/project-foremen/${proj.id}/plumbing`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true });

    const { rows } = await getPool().query(
      `SELECT 1 FROM public.project_foremen
       WHERE project_id = $1 AND trade_code = $2`,
      [proj.id, 'PLUMBING']
    );
    expect(rows).toHaveLength(0);
  });

  test('DELETE /:project_id/:trade on non-existent assignment returns 404 NOT_FOUND', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const proj = await seedProject({ company_id: company.company_id });

    const { token } = await loginUser(admin);
    const res = await request(app)
      .delete(`/api/project-foremen/${proj.id}/PLUMBING`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({ ok: false, error: 'NOT_FOUND' });
  });

  test('DELETE /:project_id/:trade is RBAC-gated — WORKER gets 403', async () => {
    const company = await seedCompany();
    const worker = await seedUser({ company_id: company.company_id, role: 'WORKER' });
    const proj = await seedProject({ company_id: company.company_id });

    const { token } = await loginUser(worker);
    const res = await request(app)
      .delete(`/api/project-foremen/${proj.id}/PLUMBING`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(403);
  });
});
