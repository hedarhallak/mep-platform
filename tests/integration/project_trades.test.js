// Phase 22 — Project trades workflow tests.
//
// /api/project-trades/* manages the per-project list of trade work
// (e.g. plumbing, electrical) being performed on a job site. The
// project boundary check on the GET surface returns 404 for any
// project not owned by the caller's company.

const request = require('supertest');
const app = require('../../app');
const {
  describeIfDb,
  closePool,
  getPool,
  seedCompany,
  seedUser,
  seedProject,
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

describeIfDb('Project trades — /api/project-trades', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('GET /:project_id on own project returns empty trades array initially (200)', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const proj = await seedProject({ company_id: company.company_id });

    const { token } = await loginUser(admin);

    const res = await request(app)
      .get(`/api/project-trades/${proj.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.trades)).toBe(true);
    expect(res.body.trades).toEqual([]);
  });

  test('POST /:project_id adds a trade to the project (201)', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const proj = await seedProject({ company_id: company.company_id });

    const { rows } = await getPool().query(
      `SELECT id FROM public.trade_types WHERE code = 'GENERAL' LIMIT 1`
    );
    const tradeTypeId = rows[0].id;

    const { token } = await loginUser(admin);

    const res = await request(app)
      .post(`/api/project-trades/${proj.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ trade_type_id: tradeTypeId, notes: 'Phase 22 test trade' });

    expect(res.statusCode).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(Number(res.body.trade.project_id)).toBe(proj.id);
    expect(Number(res.body.trade.trade_type_id)).toBe(tradeTypeId);
    expect(res.body.trade.status).toBe('ACTIVE');

    // Re-GET should now include the new trade row.
    const listRes = await request(app)
      .get(`/api/project-trades/${proj.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(listRes.body.trades).toHaveLength(1);
  });

  test("GET /:project_id on B's project as A's admin returns 404 PROJECT_NOT_FOUND", async () => {
    const companyA = await seedCompany();
    const companyB = await seedCompany();
    const adminA = await seedUser({ company_id: companyA.company_id, role: 'COMPANY_ADMIN' });
    const projB = await seedProject({ company_id: companyB.company_id });

    const { token } = await loginUser(adminA);

    const res = await request(app)
      .get(`/api/project-trades/${projB.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({ ok: false, error: 'PROJECT_NOT_FOUND' });
  });
});
