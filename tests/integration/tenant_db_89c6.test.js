// tests/integration/tenant_db_89c6.test.js
//
// Section 89-C/6 (Phase 4 Stage 2): cross-tenant isolation regression tests
// for the sixth batch of routes migrated onto req.db (RLS-enforced).
//
// Routes covered in this batch:
//   - /api/hub (hub.js)
//
// We exercise GET /api/hub/workers (cleanest cross-tenant assertion target —
// returns all company workers as a flat list) and GET /api/hub/messages/sent
// (smoke test — empty arrays per tenant). POST /messages is NOT exercised
// here because it uses an internal `pool.connect()` manual transaction
// (same pattern as auto_assign /auto-confirm — Stage 3 prep TODO).
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
  seedEmployee,
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

describeIfDb('tenantDb middleware — Section 89-C/6 batch (/api/hub)', () => {
  let companyA;
  let companyB;
  let adminA;
  let adminB;
  let workerA;
  let workerB;

  beforeAll(async () => {
    companyA = await seedCompany();
    companyB = await seedCompany();

    adminA = await seedUser({ company_id: companyA.company_id, role: 'COMPANY_ADMIN' });
    adminB = await seedUser({ company_id: companyB.company_id, role: 'COMPANY_ADMIN' });

    // GET /api/hub/workers requires worker users with employee_id set
    // (route joins app_users → employees). seedEmployee + seedUser with
    // employee_id wires both rows for each tenant.
    const empA = await seedEmployee({ company_id: companyA.company_id });
    const empB = await seedEmployee({ company_id: companyB.company_id });
    workerA = await seedUser({
      company_id: companyA.company_id,
      role: 'WORKER',
      employee_id: empA.id,
    });
    workerB = await seedUser({
      company_id: companyB.company_id,
      role: 'WORKER',
      employee_id: empB.id,
    });
  });

  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  // ── GET /api/hub/workers ─────────────────────────────────────

  test('hub/workers: company A admin sees only company A workers', async () => {
    const { token } = await loginUser(adminA);
    const res = await request(app).get('/api/hub/workers').set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    const userIds = res.body.workers.map((w) => Number(w.id));
    expect(userIds).toContain(workerA.id);
    expect(userIds).not.toContain(workerB.id);
  });

  test('hub/workers: company B admin sees only company B workers', async () => {
    const { token } = await loginUser(adminB);
    const res = await request(app).get('/api/hub/workers').set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    const userIds = res.body.workers.map((w) => Number(w.id));
    expect(userIds).toContain(workerB.id);
    expect(userIds).not.toContain(workerA.id);
  });

  // ── GET /api/hub/messages/sent (smoke) ───────────────────────

  test('hub/messages/sent: company A admin gets a clean 200 (smoke under tenantDb)', async () => {
    // No messages seeded → empty array for both tenants. Test confirms
    // the endpoint loads under tenantDb without 5xx.
    const { token } = await loginUser(adminA);
    const res = await request(app)
      .get('/api/hub/messages/sent')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.messages)).toBe(true);
  });
});
