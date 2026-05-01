// Phase 41 — Assignments small-surface endpoints.
//
// Coverage for the simple GETs not yet pinned:
//   /api/assignments/timeslots — pure helper, no DB hit
//   /api/assignments/defaults  — company shift times (or fallback 06:00/14:30)
//   /api/assignments/my-today  — current user's APPROVED assignment for today (null on empty)

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

describeIfDb('Assignments — small-surface GETs', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('GET /api/assignments/timeslots returns 48 half-hour slots', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .get('/api/assignments/timeslots')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.slots)).toBe(true);
    // 24h * 2 (half-hours) = 48 slots
    expect(res.body.slots).toHaveLength(48);
    // Each slot has value + label
    expect(res.body.slots[0]).toMatchObject({ value: '00:00', label: expect.any(String) });
  });

  test('GET /api/assignments/defaults falls back to 06:00 / 14:30 when company has none set', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .get('/api/assignments/defaults')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    // The route hardcodes these fallbacks when default_shift_start/end are NULL.
    expect(res.body.shift_start).toBe('06:00');
    expect(res.body.shift_end).toBe('14:30');
  });

  test('GET /api/assignments/my-today on a user with no assignment returns null', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .get('/api/assignments/my-today')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.assignment).toBeNull();
  });
});
