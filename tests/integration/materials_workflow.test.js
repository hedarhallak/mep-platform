// Phase 17 — Materials workflow integration tests.
//
// Phase 12.5 covered the GET surface of /api/materials/requests
// (tenant isolation). This file pins the WORKFLOW: a worker submits
// a request with items, an admin can cancel it, and the state-machine
// guards reject duplicate cancels.

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
  seedMaterialRequest,
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

// Convenience: seed an admin user with employee_id linked to a real
// employees row + profile. material_requests requires requested_by to
// reference an actual employees.id, so the admin has to be linked.
async function seedLinkedAdmin(companyId) {
  const emp = await seedEmployee({ company_id: companyId });
  await seedEmployeeProfile({ employee_id: emp.id });
  return seedUser({
    company_id: companyId,
    employee_id: emp.id,
    role: 'COMPANY_ADMIN',
  });
}

describeIfDb('Workflow — material requests', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('POST /api/materials/requests creates a request with items (201)', async () => {
    const company = await seedCompany();
    const admin = await seedLinkedAdmin(company.company_id);
    const project = await seedProject({ company_id: company.company_id });

    const { token } = await loginUser(admin);

    const res = await request(app)
      .post('/api/materials/requests')
      .set('Authorization', `Bearer ${token}`)
      .send({
        project_id: project.id,
        note: 'Phase 17 test request',
        items: [
          { item_name: '3/4" copper pipe', quantity: 5, unit: 'm' },
          { item_name: 'PEX fittings', quantity: 12, unit: 'pcs' },
        ],
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.request.status).toBe('PENDING');
    expect(Number(res.body.request.company_id)).toBe(company.company_id);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items.map((i) => i.item_name)).toEqual(
      expect.arrayContaining(['3/4" copper pipe', 'PEX fittings'])
    );

    // DB readback: the request + 2 items rows actually exist.
    const requestId = Number(res.body.request.id);
    const { rows } = await getPool().query(
      'SELECT COUNT(*)::int AS n FROM public.material_request_items WHERE request_id = $1',
      [requestId]
    );
    expect(rows[0].n).toBe(2);
  });

  test('PATCH /api/materials/requests/:id/cancel transitions PENDING -> CANCELLED', async () => {
    const company = await seedCompany();
    const admin = await seedLinkedAdmin(company.company_id);
    const mr = await seedMaterialRequest({
      company_id: company.company_id,
      requested_by: admin.employee_id,
      status: 'PENDING',
    });

    const { token } = await loginUser(admin);

    const res = await request(app)
      .patch(`/api/materials/requests/${mr.id}/cancel`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.request.status).toBe('CANCELLED');
  });

  test('PATCH /api/materials/requests/:id/cancel on non-PENDING returns 409 CANNOT_CANCEL', async () => {
    const company = await seedCompany();
    const admin = await seedLinkedAdmin(company.company_id);
    const mr = await seedMaterialRequest({
      company_id: company.company_id,
      requested_by: admin.employee_id,
      status: 'CANCELLED',
    });

    const { token } = await loginUser(admin);

    const res = await request(app)
      .patch(`/api/materials/requests/${mr.id}/cancel`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ ok: false, error: 'CANNOT_CANCEL' });
  });
});
