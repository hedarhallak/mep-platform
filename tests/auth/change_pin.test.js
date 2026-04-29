// DB-backed integration tests for POST /api/auth/change-pin — Phase 11e.
//
// Each test seeds a user, logs in to get a Bearer access token, then
// drives the change-PIN endpoint. After a successful change we re-login
// with the new PIN to confirm the hash actually rotated.

const request = require('supertest');
const app = require('../../app');
const { describeIfDb, closePool, seedUser, cleanupTestRows } = require('../helpers/db');

async function loginUser(user, pin = '1234') {
  const res = await request(app).post('/api/auth/login').send({ username: user.username, pin });
  if (res.statusCode !== 200) {
    throw new Error(`Login failed in test setup: ${res.statusCode} ${JSON.stringify(res.body)}`);
  }
  return res.body;
}

describeIfDb('POST /api/auth/change-pin', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('missing Bearer token returns 401 MISSING_TOKEN', async () => {
    const res = await request(app)
      .post('/api/auth/change-pin')
      .send({ current_pin: '1234', new_pin: '5678' });
    expect(res.statusCode).toBe(401);
    expect(res.body).toMatchObject({ ok: false, error: 'MISSING_TOKEN' });
  });

  test('invalid Bearer token returns 401 INVALID_TOKEN', async () => {
    const res = await request(app)
      .post('/api/auth/change-pin')
      .set('Authorization', 'Bearer garbage')
      .send({ current_pin: '1234', new_pin: '5678' });
    expect(res.statusCode).toBe(401);
    expect(res.body).toMatchObject({ ok: false, error: 'INVALID_TOKEN' });
  });

  test('missing current_pin or new_pin returns 400 MISSING_FIELDS', async () => {
    const user = await seedUser();
    const { token } = await loginUser(user);

    const res = await request(app)
      .post('/api/auth/change-pin')
      .set('Authorization', `Bearer ${token}`)
      .send({ new_pin: '5678' });

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ ok: false, error: 'MISSING_FIELDS' });
  });

  test('new PIN shorter than 4 chars returns 400 INVALID_PIN_FORMAT', async () => {
    const user = await seedUser();
    const { token } = await loginUser(user);

    const res = await request(app)
      .post('/api/auth/change-pin')
      .set('Authorization', `Bearer ${token}`)
      .send({ current_pin: '1234', new_pin: '12' });

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ ok: false, error: 'INVALID_PIN_FORMAT' });
  });

  test('new PIN equal to current PIN returns 400 SAME_PIN', async () => {
    const user = await seedUser();
    const { token } = await loginUser(user);

    const res = await request(app)
      .post('/api/auth/change-pin')
      .set('Authorization', `Bearer ${token}`)
      .send({ current_pin: '1234', new_pin: '1234' });

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ ok: false, error: 'SAME_PIN' });
  });

  test('wrong current_pin returns 401 WRONG_CURRENT_PIN', async () => {
    const user = await seedUser();
    const { token } = await loginUser(user);

    const res = await request(app)
      .post('/api/auth/change-pin')
      .set('Authorization', `Bearer ${token}`)
      .send({ current_pin: '9999', new_pin: '5678' });

    expect(res.statusCode).toBe(401);
    expect(res.body).toMatchObject({ ok: false, error: 'WRONG_CURRENT_PIN' });
  });

  test('valid change rotates hash + lets user re-login with new PIN', async () => {
    const user = await seedUser({ pin: '1234' });
    const { token } = await loginUser(user, '1234');

    const change = await request(app)
      .post('/api/auth/change-pin')
      .set('Authorization', `Bearer ${token}`)
      .send({ current_pin: '1234', new_pin: '5678' });

    expect(change.statusCode).toBe(200);
    expect(change.body.ok).toBe(true);

    // Old PIN should no longer work.
    const reLoginOld = await request(app)
      .post('/api/auth/login')
      .send({ username: user.username, pin: '1234' });
    expect(reLoginOld.statusCode).toBe(401);

    // New PIN should work.
    const reLoginNew = await request(app)
      .post('/api/auth/login')
      .send({ username: user.username, pin: '5678' });
    expect(reLoginNew.statusCode).toBe(200);
  });
});
