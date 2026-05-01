// Phase 48 — Employees GET happy path within own tenant.
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

describeIfDb('Employees — GET shape and filters', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('GET /api/employees returns employees with id + first_name + last_name fields', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const emp = await seedEmployee({
      company_id: company.company_id,
      first_name: 'Karim',
      last_name: 'Phase48',
    });
    const { token } = await loginUser(admin);

    const res = await request(app).get('/api/employees').set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    const found = res.body.employees.find((e) => Number(e.id) === emp.id);
    expect(found).toBeDefined();
    expect(found.first_name).toBe('Karim');
    expect(found.last_name).toBe('Phase48');
  });

  test('GET /api/employees on fresh tenant with no employees returns empty array', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const { token } = await loginUser(admin);

    const res = await request(app).get('/api/employees').set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.employees)).toBe(true);
    expect(res.body.employees).toEqual([]);
  });
});
