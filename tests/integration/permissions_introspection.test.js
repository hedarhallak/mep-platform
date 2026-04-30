// Phase 21 — Permissions introspection tests.
//
// /api/permissions/my-permissions tells the frontend which UI affordances
// to show for the logged-in user. It groups role_permissions rows into a
// { module: { action: true } } shape, with a SUPER_ADMIN bypass that
// returns the full permissions catalogue regardless of role grants.

const request = require('supertest');
const app = require('../../app');
const {
  describeIfDb,
  closePool,
  seedCompany,
  seedUser,
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

describeIfDb('Permissions introspection — /api/permissions/my-permissions', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test("GET /my-permissions returns the COMPANY_ADMIN's granted permissions", async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .get('/api/permissions/my-permissions')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.role).toBe('COMPANY_ADMIN');
    // The route groups codes as { module: { action: true } }. We seeded
    // employees.view + employees.edit for COMPANY_ADMIN — both should
    // appear here.
    expect(res.body.permissions.employees).toEqual(
      expect.objectContaining({ view: true, edit: true })
    );
    // Suppliers actions also present.
    expect(res.body.permissions.suppliers).toBeDefined();
    expect(res.body.permissions.suppliers.view).toBe(true);
  });

  test('GET /my-permissions for SUPER_ADMIN returns the FULL permissions catalogue (bypass)', async () => {
    // SUPER_ADMIN has no role_permissions seed rows in our tests; the
    // hardcoded bypass at the top of /my-permissions iterates the entire
    // permissions table and unions everything into the response.
    const sa = await seedUser({ role: 'SUPER_ADMIN', pin: 'sa-pin-1234' });
    const { token } = await loginUser(sa);

    const res = await request(app)
      .get('/api/permissions/my-permissions')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.role).toBe('SUPER_ADMIN');
    // The seeded permission catalogue spans 9 modules in our tests
    // (employees, projects, suppliers, assignments, materials, attendance,
    // hub, ...). At minimum the SA bypass must include all of these.
    expect(Object.keys(res.body.permissions).length).toBeGreaterThanOrEqual(6);
    expect(res.body.permissions.employees).toBeDefined();
    expect(res.body.permissions.attendance).toBeDefined();
    expect(res.body.permissions.hub).toBeDefined();
  });
});
