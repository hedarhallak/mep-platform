// Phase 45 — Assignments /employees-map + /employees + /repeat-preview.

const request = require('supertest');
const app = require('../../app');
const {
  describeIfDb,
  closePool,
  getPool,
  seedCompany,
  seedUser,
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

describeIfDb('Assignments — /employees-map + /employees + /repeat-preview', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('GET /api/assignments/employees-map on empty tenant returns 200', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .get('/api/assignments/employees-map')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.employees)).toBe(true);
  });

  test('GET /api/assignments/employees on empty tenant returns 200', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .get('/api/assignments/employees')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.employees)).toBe(true);
  });

  // Section 131.13 — an assignment whose REQUESTER account no longer exists
  // must still appear in the list. The requester join was INNER, which
  // silently dropped 50/58 prod rows (seed-era dangling requested_by_user_id)
  // and made the Assignments List under-report by 6×. Now LEFT JOIN:
  // the row survives with assigned_by = null.
  test('GET /api/assignments returns rows whose requester user was deleted', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const requester = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const assignment = await seedAssignment({
      company_id: company.company_id,
      requested_by_user_id: requester.id,
    });
    // Simulate the prod state: requester account deleted, FK-less column dangles.
    await getPool().query('DELETE FROM public.app_users WHERE id = $1', [requester.id]);
    const { token } = await loginUser(admin);

    const res = await request(app).get('/api/assignments').set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    const row = res.body.assignments.find((a) => Number(a.id) === Number(assignment.id));
    expect(row).toBeDefined();
    expect(row.assigned_by).toBeNull();
  });

  test('POST /api/assignments/repeat-preview without target_date returns 400', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .post('/api/assignments/repeat-preview')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ ok: false, error: 'TARGET_DATE_REQUIRED' });
  });
});
