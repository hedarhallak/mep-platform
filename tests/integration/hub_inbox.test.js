// Phase 39 — Hub messaging inbox + unread count.
//
// Worker-facing endpoints under /api/hub/messages:
//   GET /messages/inbox        — list received messages (status != PENDING)
//   GET /messages/unread-count — count of unread received messages
// Both gated by hub.receive_tasks. On a fresh user with no inbox, both
// return empty / zero.

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

describeIfDb('Hub inbox — /api/hub/messages/inbox + /unread-count', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('GET /messages/inbox on a fresh recipient returns an empty array', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .get('/api/hub/messages/inbox')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.messages)).toBe(true);
    expect(res.body.messages).toEqual([]);
  });

  test('GET /messages/unread-count on a fresh recipient returns 0', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .get('/api/hub/messages/unread-count')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.count).toBe(0);
  });

  test('GET /messages/inbox without hub.receive_tasks returns 403', async () => {
    const company = await seedCompany();
    const worker = await seedUser({ company_id: company.company_id, role: 'WORKER' });
    const { token } = await loginUser(worker);

    const res = await request(app)
      .get('/api/hub/messages/inbox')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(403);
    expect(res.body.permission).toBe('hub.receive_tasks');
  });
});
