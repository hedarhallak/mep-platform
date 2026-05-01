// Phase 44 — Hub /messages/sent endpoint.

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

describeIfDb('Hub sent — /api/hub/messages/sent', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('GET /messages/sent on a fresh sender returns empty messages array', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .get('/api/hub/messages/sent')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.messages)).toBe(true);
    expect(res.body.messages).toEqual([]);
  });

  test('GET /messages/sent without hub.send_tasks returns 403', async () => {
    const company = await seedCompany();
    const worker = await seedUser({ company_id: company.company_id, role: 'WORKER' });
    const { token } = await loginUser(worker);

    const res = await request(app)
      .get('/api/hub/messages/sent')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(403);
    expect(res.body.permission).toBe('hub.send_tasks');
  });
});
