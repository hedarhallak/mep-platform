// tests/integration/tenant_db_89c10.test.js
//
// Section 89-C/10 (Phase 4 Stage 2): cross-tenant isolation regression tests
// for the tenth batch of routes migrated onto req.db (RLS-enforced).
//
// Routes covered in this batch:
//   - /api/materials (material_requests.js)
//
// We exercise GET /api/materials/requests (list) + GET /api/materials/requests/:id
// (cross-tenant 404) + PATCH /api/materials/requests/:id/cancel (cross-tenant 404).
// The other endpoints (review, send-order, returns, surplus, catalog, inbox,
// pdf-data, purchase-orders) follow the same `WHERE company_id = $1` pattern
// and are transitively covered.
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

describeIfDb('tenantDb middleware — Section 89-C/10 batch (/api/materials)', () => {
  let companyA;
  let companyB;
  let adminA;
  let adminB;
  let mrA;
  let mrB;

  beforeAll(async () => {
    companyA = await seedCompany();
    companyB = await seedCompany();

    adminA = await seedUser({ company_id: companyA.company_id, role: 'COMPANY_ADMIN' });
    adminB = await seedUser({ company_id: companyB.company_id, role: 'COMPANY_ADMIN' });

    // Seed one PENDING material request per company. seedMaterialRequest
    // also auto-creates a project + employee + employee_profile so the
    // GET /requests join (which requires employee_profiles) returns the
    // row.
    mrA = await seedMaterialRequest({ company_id: companyA.company_id });
    mrB = await seedMaterialRequest({ company_id: companyB.company_id });
  });

  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  // ── GET /api/materials/requests ──────────────────────────────

  test('materials/requests: company A admin sees only company A requests', async () => {
    const { token } = await loginUser(adminA);
    const res = await request(app)
      .get('/api/materials/requests')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    const ids = res.body.requests.map((r) => Number(r.id));
    expect(ids).toContain(mrA.id);
    expect(ids).not.toContain(mrB.id);
  });

  test('materials/requests: company B admin sees only company B requests', async () => {
    const { token } = await loginUser(adminB);
    const res = await request(app)
      .get('/api/materials/requests')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    const ids = res.body.requests.map((r) => Number(r.id));
    expect(ids).toContain(mrB.id);
    expect(ids).not.toContain(mrA.id);
  });

  // ── GET /api/materials/requests/:id (cross-tenant) ───────────

  test('materials/requests/:id: company A admin gets 404 trying to read company B request', async () => {
    const { token } = await loginUser(adminA);
    const res = await request(app)
      .get(`/api/materials/requests/${mrB.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  test('materials/requests/:id: company A admin can read own request', async () => {
    const { token } = await loginUser(adminA);
    const res = await request(app)
      .get(`/api/materials/requests/${mrA.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Number(res.body.request.id)).toBe(mrA.id);
  });

  // ── PATCH /api/materials/requests/:id/cancel (cross-tenant) ──
  // Mutating endpoint — confirms the WHERE company_id filter on the
  // SELECT preflight survives the migration.

  test('materials/requests/:id/cancel: company A admin gets 404 trying to cancel company B request', async () => {
    const { token } = await loginUser(adminA);
    const res = await request(app)
      .patch(`/api/materials/requests/${mrB.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });
});
