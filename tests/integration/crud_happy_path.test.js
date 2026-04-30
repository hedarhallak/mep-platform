// Phase 16 — CRUD happy-path integration tests.
//
// Phase 12.x asserted that cross-tenant CREATE/UPDATE/DELETE attempts
// return 404. This file pins the positive direction: when an admin
// hits the same routes against their OWN tenant, the row is
// actually created/updated/soft-deleted, and the API returns 200/201
// with the expected payload.
//
// These are the simplest, highest-coverage tests we can write — they
// exercise the routes' main success path that nothing else covers.

const request = require('supertest');
const app = require('../../app');
const {
  describeIfDb,
  closePool,
  getPool,
  seedCompany,
  seedUser,
  seedEmployee,
  seedProject,
  seedSupplier,
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

describeIfDb('CRUD happy paths — own-tenant create / update / delete', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('POST /api/projects creates a new project (201)', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });

    // Look up the seed trade_type id directly (our seedProject helper
    // already does this; the route also needs it as the request body).
    const { rows } = await getPool().query(
      `SELECT id FROM public.trade_types WHERE code = 'GENERAL' LIMIT 1`
    );
    const tradeTypeId = rows[0].id;

    const { token } = await loginUser(admin);

    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({
        project_name: 'Phase 16 New Project',
        trade_type_id: tradeTypeId,
        site_address: '123 Test St',
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.project.project_name).toBe('Phase 16 New Project');
    expect(Number(res.body.project.company_id)).toBe(company.company_id);
    // Route generates project_code as PRJ-XXXX
    expect(res.body.project.project_code).toMatch(/^PRJ-\d{4}$/);
  });

  test('POST /api/suppliers creates a new supplier (201)', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });

    const { token } = await loginUser(admin);

    const res = await request(app)
      .post('/api/suppliers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Phase 16 Supplier Co.',
        email: 'supplier@example.test',
        phone: '555-0100',
        trade_code: 'PLUMBING',
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.supplier.name).toBe('Phase 16 Supplier Co.');
    expect(Number(res.body.supplier.company_id)).toBe(company.company_id);
    expect(res.body.supplier.is_active).toBe(true);
  });

  test('PATCH /api/employees/:id updates own-tenant fields (200)', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const emp = await seedEmployee({
      company_id: company.company_id,
      first_name: 'Before',
    });

    const { token } = await loginUser(admin);

    const res = await request(app)
      .patch(`/api/employees/${emp.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ first_name: 'After' });

    expect(res.statusCode).toBe(200);

    // Independent DB readback — the API response shape may or may not
    // include the row, but the row in DB must reflect the change.
    const { rows } = await getPool().query(
      'SELECT first_name FROM public.employees WHERE id = $1',
      [emp.id]
    );
    expect(rows[0].first_name).toBe('After');
  });

  test('PATCH /api/suppliers/:id updates own-tenant fields (200)', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const sup = await seedSupplier({ company_id: company.company_id, name: 'Original Supplier' });

    const { token } = await loginUser(admin);

    const res = await request(app)
      .patch(`/api/suppliers/${sup.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Renamed Supplier' });

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.supplier.name).toBe('Renamed Supplier');
  });

  test('DELETE /api/suppliers/:id soft-deletes the supplier (200, GET /api/suppliers no longer lists it)', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const sup = await seedSupplier({ company_id: company.company_id });

    const { token } = await loginUser(admin);

    const delRes = await request(app)
      .delete(`/api/suppliers/${sup.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(delRes.statusCode).toBe(200);
    expect(delRes.body.ok).toBe(true);

    // Soft delete: row still exists, but is_active=false. GET /api/suppliers
    // filters on is_active=TRUE, so the supplier should not appear.
    const listRes = await request(app)
      .get('/api/suppliers')
      .set('Authorization', `Bearer ${token}`);
    expect(listRes.statusCode).toBe(200);
    const ids = listRes.body.suppliers.map((s) => Number(s.id));
    expect(ids).not.toContain(sup.id);

    // Confirm the row still exists in DB with is_active=false.
    const { rows } = await getPool().query('SELECT is_active FROM public.suppliers WHERE id = $1', [
      sup.id,
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].is_active).toBe(false);
  });

  test('PATCH /api/projects/:id updates own-tenant fields (200)', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const proj = await seedProject({
      company_id: company.company_id,
      project_name: 'Original Name',
    });

    const { token } = await loginUser(admin);

    const res = await request(app)
      .patch(`/api/projects/${proj.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ project_name: 'Renamed Project', site_address: '500 New Site Ave' });

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.project.project_name).toBe('Renamed Project');
    expect(res.body.project.site_address).toBe('500 New Site Ave');
  });

  test('DELETE /api/projects/:id removes a project with no assignments (200)', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const proj = await seedProject({ company_id: company.company_id });

    const { token } = await loginUser(admin);

    const delRes = await request(app)
      .delete(`/api/projects/${proj.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(delRes.statusCode).toBe(200);
    expect(delRes.body.ok).toBe(true);

    const { rows } = await getPool().query('SELECT id FROM public.projects WHERE id = $1', [
      proj.id,
    ]);
    expect(rows).toHaveLength(0);
  });
});
