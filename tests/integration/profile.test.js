// Phase 19 — Profile route tests.
//
// /api/profile/* is auth-gated but does not use the RBAC can()
// middleware — every authenticated user can read their own profile.
// The route has two distinct response shapes depending on whether the
// JWT carries an employee_id:
//   - admin / IT staff (no employee_id): minimal app_user info,
//     is_admin: true, profile fields nulled.
//   - worker (employee_id linked): joined employees + employee_profiles
//     view with the full demographic + contact set.
// Plus /dropdowns returns canned trade + rank lists.

const request = require('supertest');
const app = require('../../app');
const {
  describeIfDb,
  closePool,
  seedCompany,
  seedUser,
  seedEmployee,
  seedEmployeeProfile,
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

describeIfDb('Profile — /api/profile', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('GET /api/profile/dropdowns returns canned trades + ranks lists', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .get('/api/profile/dropdowns')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.trades)).toBe(true);
    expect(Array.isArray(res.body.ranks)).toBe(true);
    expect(res.body.trades.length).toBeGreaterThan(0);
  });

  test('GET /api/profile/me as admin (no employee_id) returns admin shape with is_admin:true', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const { token } = await loginUser(admin);

    const res = await request(app).get('/api/profile/me').set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.is_admin).toBe(true);
    expect(res.body.exists).toBe(false);
    // Admin shape: first_name = username (no real employee row).
    expect(res.body.profile.first_name).toBe(admin.username);
    expect(res.body.profile.role_code).toBe('COMPANY_ADMIN');
    expect(res.body.profile.employee_id).toBeNull();
  });

  test('GET /api/profile/me as worker (linked to employee) returns the employee profile', async () => {
    const company = await seedCompany();
    const emp = await seedEmployee({
      company_id: company.company_id,
      first_name: 'Sami',
      last_name: 'Tester',
    });
    await seedEmployeeProfile({
      employee_id: emp.id,
      full_name: 'Sami Tester',
      trade_code: 'PLUMBING',
    });
    const worker = await seedUser({
      company_id: company.company_id,
      employee_id: emp.id,
      role: 'WORKER',
    });

    const { token } = await loginUser(worker);

    const res = await request(app).get('/api/profile/me').set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    // Not the admin shape — should have the joined employee data.
    expect(res.body.is_admin).not.toBe(true);
    expect(Number(res.body.profile.employee_id)).toBe(emp.id);
    expect(res.body.profile.first_name).toBe('Sami');
    expect(res.body.profile.last_name).toBe('Tester');
    expect(res.body.profile.trade_code).toBe('PLUMBING');
  });
});
