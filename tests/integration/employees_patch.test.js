// §151.7 — PATCH /api/employees/:id (employee edit).
//
// The list + detail GETs are covered by employees_get.test.js; the big
// untested handler was PATCH /:id, which fans a partial update across the
// employees table + employee_profiles (create-if-missing) and syncs role /
// is_active to the linked app_users row (with the §140 OWNER guard).

const request = require('supertest');
const app = require('../../app');
const {
  describeIfDb,
  closePool,
  getPool,
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

describeIfDb('Employees — PATCH /api/employees/:id', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  // admin (editor) + a target employee with a linked WORKER app_user
  async function ctx() {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const emp = await seedEmployee({
      company_id: company.company_id,
      first_name: 'Jo',
      last_name: 'Worker',
    });
    const empUser = await seedUser({
      company_id: company.company_id,
      employee_id: emp.id,
      role: 'WORKER',
    });
    const { token } = await loginUser(admin);
    return { company, admin, emp, empUser, token };
  }

  test('non-numeric id → 400 INVALID_ID', async () => {
    const { token } = await ctx();
    const res = await request(app)
      .patch('/api/employees/not-a-number')
      .set('Authorization', `Bearer ${token}`)
      .send({ first_name: 'X' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('INVALID_ID');
  });

  test('non-existent employee → 404 EMPLOYEE_NOT_FOUND', async () => {
    const { token } = await ctx();
    const res = await request(app)
      .patch('/api/employees/9999999')
      .set('Authorization', `Bearer ${token}`)
      .send({ first_name: 'X' });
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('EMPLOYEE_NOT_FOUND');
  });

  test('valid update writes employees + creates the profile, reflected by GET /:id', async () => {
    const { emp, token } = await ctx();
    const patch = await request(app)
      .patch(`/api/employees/${emp.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        first_name: 'Joanna',
        phone: '514-555-0188',
        trade_code: 'HVAC',
        rank_code: 'JOURNEYMAN',
        city: 'Laval',
      });
    expect(patch.statusCode).toBe(200);
    expect(patch.body.ok).toBe(true);

    const get = await request(app)
      .get(`/api/employees/${emp.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(get.statusCode).toBe(200);
    expect(get.body.employee.first_name).toBe('Joanna');
    expect(get.body.employee.trade_code).toBe('HVAC');
    expect(get.body.employee.rank_code).toBe('JOURNEYMAN');
  });

  test('role change syncs to the linked app_users row', async () => {
    const pool = getPool();
    const { emp, empUser, token } = await ctx();
    const res = await request(app)
      .patch(`/api/employees/${emp.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ employee_profile_type: 'FOREMAN' });
    expect(res.statusCode).toBe(200);

    const { rows } = await pool.query(`SELECT role FROM public.app_users WHERE id = $1`, [
      empUser.id,
    ]);
    expect(rows[0].role).toBe('FOREMAN');
  });

  test('is_active=false syncs to the linked app_users row', async () => {
    const pool = getPool();
    const { emp, empUser, token } = await ctx();
    const res = await request(app)
      .patch(`/api/employees/${emp.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ is_active: false });
    expect(res.statusCode).toBe(200);

    const { rows } = await pool.query(`SELECT is_active FROM public.app_users WHERE id = $1`, [
      empUser.id,
    ]);
    expect(rows[0].is_active).toBe(false);
  });

  test('assigning OWNER in-tenant is blocked → 403 OWNER_ROLE_RESTRICTED (§140 guard)', async () => {
    const { emp, token } = await ctx();
    const res = await request(app)
      .patch(`/api/employees/${emp.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ employee_profile_type: 'OWNER' });
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('OWNER_ROLE_RESTRICTED');
  });
});
