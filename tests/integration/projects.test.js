// Section 82 — Projects route integration tests.
//
// /api/projects/* manages the per-company project catalogue. Routes:
//   GET    /                — list (filters: status, trade)
//   GET    /map             — projects with site_lat/site_lng coords
//   GET    /meta            — dropdown data (trade_types, statuses, clients)
//   GET    /:id             — single project details
//   POST   /                — create (auto-generates PRJ-XXXX code)
//   PATCH  /:id             — update
//   DELETE /:id             — delete (blocked if assignments exist)
//   GET    /clients         — list company clients
//   POST   /clients         — create client (auto-generates CLI-XXXX code)
//
// Coverage focus: happy path + validation + RBAC + tenant isolation +
// the assignment-block branch on DELETE.

'use strict';

const request = require('supertest');
const app = require('../../app');
const {
  describeIfDb,
  closePool,
  getPool,
  seedCompany,
  seedUser,
  seedProject,
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

async function getTradeTypeId() {
  const { rows } = await getPool().query(
    `SELECT id FROM public.trade_types WHERE code = 'GENERAL' LIMIT 1`
  );
  return rows[0].id;
}

async function getStatusId(code = 'ACTIVE') {
  const { rows } = await getPool().query(
    `SELECT id FROM public.project_statuses WHERE code = $1 LIMIT 1`,
    [code]
  );
  return rows[0].id;
}

describeIfDb('Projects — /api/projects', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  // ── GET /api/projects ───────────────────────────────────────

  test('GET / returns own company projects (200)', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    await seedProject({ company_id: company.company_id });
    await seedProject({ company_id: company.company_id });

    const { token } = await loginUser(admin);
    const res = await request(app).get('/api/projects').set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.projects)).toBe(true);
    expect(res.body.projects.length).toBeGreaterThanOrEqual(2);
  });

  test('GET / returns empty array for company with no projects', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });

    const { token } = await loginUser(admin);
    const res = await request(app).get('/api/projects').set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.projects).toEqual([]);
  });

  test('GET /?status=ACTIVE filters by status code', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    await seedProject({ company_id: company.company_id });

    const { token } = await loginUser(admin);
    const res = await request(app)
      .get('/api/projects?status=ACTIVE')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    // All seedProject() rows have status=ACTIVE so all returned rows
    // should match.
    expect(res.body.projects.every((p) => p.status_code === 'ACTIVE')).toBe(true);
  });

  test('GET /?trade=GENERAL filters by trade code', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    await seedProject({ company_id: company.company_id });

    const { token } = await loginUser(admin);
    const res = await request(app)
      .get('/api/projects?trade=GENERAL')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.projects.every((p) => p.trade_code === 'GENERAL')).toBe(true);
  });

  test('GET / tenant isolation — A cannot see B projects', async () => {
    const companyA = await seedCompany();
    const companyB = await seedCompany();
    const adminA = await seedUser({ company_id: companyA.company_id, role: 'COMPANY_ADMIN' });
    const projB = await seedProject({ company_id: companyB.company_id });

    const { token } = await loginUser(adminA);
    const res = await request(app).get('/api/projects').set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    const ids = res.body.projects.map((p) => Number(p.id));
    expect(ids).not.toContain(projB.id);
  });

  test('GET / without auth → 401', async () => {
    const res = await request(app).get('/api/projects');
    expect(res.statusCode).toBe(401);
  });

  test('GET / as WORKER without permission → 403', async () => {
    const company = await seedCompany();
    const worker = await seedUser({ company_id: company.company_id, role: 'WORKER' });

    const { token } = await loginUser(worker);
    const res = await request(app).get('/api/projects').set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(403);
  });

  // ── GET /api/projects/meta ──────────────────────────────────

  test('GET /meta returns trade_types, statuses, clients (200)', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });

    const { token } = await loginUser(admin);
    const res = await request(app)
      .get('/api/projects/meta')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.trade_types)).toBe(true);
    expect(Array.isArray(res.body.statuses)).toBe(true);
    expect(Array.isArray(res.body.clients)).toBe(true);
    // GENERAL trade is in the default seed
    expect(res.body.trade_types.some((t) => t.code === 'GENERAL')).toBe(true);
  });

  // ── GET /api/projects/map ───────────────────────────────────

  test('GET /map returns only projects with coordinates', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const proj = await seedProject({ company_id: company.company_id });
    // Patch one project to have coords
    await getPool().query(
      `UPDATE public.projects SET site_lat = 45.5, site_lng = -73.5 WHERE id = $1`,
      [proj.id]
    );
    // Seed another without coords (default)
    await seedProject({ company_id: company.company_id });

    const { token } = await loginUser(admin);
    const res = await request(app).get('/api/projects/map').set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.projects.every((p) => p.site_lat !== null && p.site_lng !== null)).toBe(true);
    const ids = res.body.projects.map((p) => Number(p.id));
    expect(ids).toContain(proj.id);
  });

  // ── GET /api/projects/:id ───────────────────────────────────

  test('GET /:id returns project details (200)', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const proj = await seedProject({ company_id: company.company_id });

    const { token } = await loginUser(admin);
    const res = await request(app)
      .get(`/api/projects/${proj.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Number(res.body.project.id)).toBe(proj.id);
    expect(res.body.project.project_name).toBe(proj.project_name);
  });

  test('GET /:id non-existent → 404 PROJECT_NOT_FOUND', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });

    const { token } = await loginUser(admin);
    const res = await request(app)
      .get('/api/projects/99999999')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('PROJECT_NOT_FOUND');
  });

  test("GET /:id on B's project as A → 404 (tenant isolation)", async () => {
    const companyA = await seedCompany();
    const companyB = await seedCompany();
    const adminA = await seedUser({ company_id: companyA.company_id, role: 'COMPANY_ADMIN' });
    const projB = await seedProject({ company_id: companyB.company_id });

    const { token } = await loginUser(adminA);
    const res = await request(app)
      .get(`/api/projects/${projB.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('PROJECT_NOT_FOUND');
  });

  test('GET /:id with id=0 → 400 INVALID_ID', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });

    const { token } = await loginUser(admin);
    const res = await request(app).get('/api/projects/0').set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('INVALID_ID');
  });

  // ── POST /api/projects ──────────────────────────────────────

  test('POST / creates a project with auto-generated PRJ-XXXX code (201)', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const tradeId = await getTradeTypeId();

    const { token } = await loginUser(admin);
    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({
        project_name: 'Big Building Renovation',
        trade_type_id: tradeId,
        site_address: '500 René-Lévesque Blvd',
        ccq_sector: 'IC',
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.project.project_name).toBe('Big Building Renovation');
    expect(res.body.project.project_code).toMatch(/^PRJ-\d{4,}$/);
    expect(Number(res.body.project.company_id)).toBe(company.company_id);
  });

  test('POST / defaults ccq_sector to IC when omitted', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const tradeId = await getTradeTypeId();

    const { token } = await loginUser(admin);
    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ project_name: 'Default Sector Project', trade_type_id: tradeId });

    expect(res.statusCode).toBe(201);
    expect(res.body.project.ccq_sector).toBe('IC');
  });

  test('POST / accepts INDUSTRIAL ccq_sector', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const tradeId = await getTradeTypeId();

    const { token } = await loginUser(admin);
    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({
        project_name: 'Industrial Project',
        trade_type_id: tradeId,
        ccq_sector: 'INDUSTRIAL',
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.project.ccq_sector).toBe('INDUSTRIAL');
  });

  test('POST / missing project_name → 400 PROJECT_NAME_REQUIRED', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const tradeId = await getTradeTypeId();

    const { token } = await loginUser(admin);
    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ trade_type_id: tradeId });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('PROJECT_NAME_REQUIRED');
  });

  test('POST / missing trade_type_id → 400 TRADE_TYPE_REQUIRED', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });

    const { token } = await loginUser(admin);
    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ project_name: 'Missing Trade' });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('TRADE_TYPE_REQUIRED');
  });

  test('POST / invalid trade_type_id → 400 INVALID_TRADE_TYPE', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });

    const { token } = await loginUser(admin);
    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ project_name: 'Bogus Trade', trade_type_id: 999999 });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('INVALID_TRADE_TYPE');
  });

  test('POST / invalid status_id → 400 INVALID_STATUS', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const tradeId = await getTradeTypeId();

    const { token } = await loginUser(admin);
    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({
        project_name: 'Bogus Status',
        trade_type_id: tradeId,
        status_id: 999999,
      });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('INVALID_STATUS');
  });

  test('POST / client_id from another company → 400 INVALID_CLIENT', async () => {
    const companyA = await seedCompany();
    const companyB = await seedCompany();
    const adminA = await seedUser({ company_id: companyA.company_id, role: 'COMPANY_ADMIN' });
    const tradeId = await getTradeTypeId();

    // Create a client for company B directly
    const { rows } = await getPool().query(
      `INSERT INTO public.clients (client_code, client_name, company_id, is_active, created_at)
       VALUES ($1, $2, $3, true, NOW()) RETURNING id`,
      ['CLI-B-X', 'B Client', companyB.company_id]
    );
    const clientB = rows[0].id;

    const { token } = await loginUser(adminA);
    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({
        project_name: 'Cross-tenant client',
        trade_type_id: tradeId,
        client_id: clientB,
      });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('INVALID_CLIENT');
  });

  test('POST / as WORKER without permission → 403', async () => {
    const company = await seedCompany();
    const worker = await seedUser({ company_id: company.company_id, role: 'WORKER' });
    const tradeId = await getTradeTypeId();

    const { token } = await loginUser(worker);
    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ project_name: 'X', trade_type_id: tradeId });

    expect(res.statusCode).toBe(403);
  });

  // ── PATCH /api/projects/:id ─────────────────────────────────

  test('PATCH /:id updates a project (200)', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const proj = await seedProject({ company_id: company.company_id });

    const { token } = await loginUser(admin);
    const res = await request(app)
      .patch(`/api/projects/${proj.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ project_name: 'Renamed Project', site_address: '1 New St' });

    expect(res.statusCode).toBe(200);
    expect(res.body.project.project_name).toBe('Renamed Project');
    expect(res.body.project.site_address).toBe('1 New St');
  });

  test('PATCH /:id partial update preserves project_code', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const proj = await seedProject({ company_id: company.company_id });

    const { token } = await loginUser(admin);
    const res = await request(app)
      .patch(`/api/projects/${proj.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ site_address: 'partial' });

    expect(res.statusCode).toBe(200);
    expect(res.body.project.project_code).toBe(proj.project_code);
    expect(res.body.project.project_name).toBe(proj.project_name);
  });

  test('PATCH /:id writes an old→new audit diff for site_address (§132 anti-tamper)', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const proj = await seedProject({ company_id: company.company_id });

    // Pin a known original address so the diff is unambiguous.
    await getPool().query(`UPDATE public.projects SET site_address = $1 WHERE id = $2`, [
      '100 Old Address',
      proj.id,
    ]);

    const { token } = await loginUser(admin);
    const res = await request(app)
      .patch(`/api/projects/${proj.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ site_address: '999 Far Away Blvd' });
    expect(res.statusCode).toBe(200);

    // The audit row must prove the address changed FROM 100 TO 999 — not just
    // record the new value (the CCQ-allowance fraud vector, §132.3/§132.6).
    const { rows } = await getPool().query(
      `SELECT old_values, new_values FROM public.audit_logs
         WHERE entity_type = 'project' AND entity_id = $1 AND action = 'PROJECT_UPDATED'
         ORDER BY created_at DESC LIMIT 1`,
      [proj.id]
    );
    expect(rows).toHaveLength(1);
    // jsonb columns come back already parsed by node-pg.
    expect(rows[0].old_values).not.toBeNull();
    expect(rows[0].new_values).not.toBeNull();
    expect(rows[0].old_values.site_address).toBe('100 Old Address');
    expect(rows[0].new_values.site_address).toBe('999 Far Away Blvd');
  });

  test('PATCH /:id non-existent → 404 PROJECT_NOT_FOUND', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });

    const { token } = await loginUser(admin);
    const res = await request(app)
      .patch('/api/projects/99999999')
      .set('Authorization', `Bearer ${token}`)
      .send({ project_name: 'X' });

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('PROJECT_NOT_FOUND');
  });

  test("PATCH /:id on B's project as A → 404 (tenant isolation)", async () => {
    const companyA = await seedCompany();
    const companyB = await seedCompany();
    const adminA = await seedUser({ company_id: companyA.company_id, role: 'COMPANY_ADMIN' });
    const projB = await seedProject({ company_id: companyB.company_id });

    const { token } = await loginUser(adminA);
    const res = await request(app)
      .patch(`/api/projects/${projB.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ project_name: 'hacked' });

    expect(res.statusCode).toBe(404);
  });

  test('PATCH /:id with id=0 → 400 INVALID_ID', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });

    const { token } = await loginUser(admin);
    const res = await request(app)
      .patch('/api/projects/0')
      .set('Authorization', `Bearer ${token}`)
      .send({ project_name: 'X' });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('INVALID_ID');
  });

  // ── DELETE /api/projects/:id ────────────────────────────────

  test('DELETE /:id deletes a project with no assignments (200)', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const proj = await seedProject({ company_id: company.company_id });

    const { token } = await loginUser(admin);
    const res = await request(app)
      .delete(`/api/projects/${proj.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);

    // Confirm hard delete
    const { rows } = await getPool().query(`SELECT id FROM public.projects WHERE id = $1`, [
      proj.id,
    ]);
    expect(rows).toHaveLength(0);
  });

  test('DELETE /:id with assignments → 409 PROJECT_HAS_ASSIGNMENTS', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const proj = await seedProject({ company_id: company.company_id });
    await seedAssignment({ company_id: company.company_id, project_id: proj.id });

    const { token } = await loginUser(admin);
    const res = await request(app)
      .delete(`/api/projects/${proj.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(409);
    expect(res.body.error).toBe('PROJECT_HAS_ASSIGNMENTS');

    // Project should still exist
    const { rows } = await getPool().query(`SELECT id FROM public.projects WHERE id = $1`, [
      proj.id,
    ]);
    expect(rows).toHaveLength(1);
  });

  test('DELETE /:id non-existent → 404 PROJECT_NOT_FOUND', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });

    const { token } = await loginUser(admin);
    const res = await request(app)
      .delete('/api/projects/99999999')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('PROJECT_NOT_FOUND');
  });

  test("DELETE /:id on B's project as A → 404 (tenant isolation)", async () => {
    const companyA = await seedCompany();
    const companyB = await seedCompany();
    const adminA = await seedUser({ company_id: companyA.company_id, role: 'COMPANY_ADMIN' });
    const projB = await seedProject({ company_id: companyB.company_id });

    const { token } = await loginUser(adminA);
    const res = await request(app)
      .delete(`/api/projects/${projB.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(404);
  });

  test('DELETE /:id with id=0 → 400 INVALID_ID', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });

    const { token } = await loginUser(admin);
    const res = await request(app)
      .delete('/api/projects/0')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('INVALID_ID');
  });

  // ── GET /api/projects/clients ───────────────────────────────

  test('GET /clients returns own company clients (200)', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    await getPool().query(
      `INSERT INTO public.clients (client_code, client_name, company_id, is_active, created_at)
       VALUES ($1, $2, $3, true, NOW())`,
      ['CLI-T1', 'Acme Corp', company.company_id]
    );

    const { token } = await loginUser(admin);
    const res = await request(app)
      .get('/api/projects/clients')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.clients)).toBe(true);
    expect(res.body.clients.some((c) => c.client_name === 'Acme Corp')).toBe(true);
  });

  // ── POST /api/projects/clients ──────────────────────────────

  test('POST /clients creates a client with CLI-XXXX code (201)', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });

    const { token } = await loginUser(admin);
    const res = await request(app)
      .post('/api/projects/clients')
      .set('Authorization', `Bearer ${token}`)
      .send({ client_name: 'Test New Client', email: 'client@test.test' });

    expect(res.statusCode).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.client.client_name).toBe('Test New Client');
    expect(res.body.client.client_code).toMatch(/^CLI-\d{4}$/);
  });

  test('POST /clients missing client_name → 400 CLIENT_NAME_REQUIRED', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });

    const { token } = await loginUser(admin);
    const res = await request(app)
      .post('/api/projects/clients')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'a@b.test' });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('CLIENT_NAME_REQUIRED');
  });
});
