// Phase 49 — Activate route minimum smoke.
//
// /activate is a PUBLIC endpoint (no auth) that handles the email
// activation link. The token-based query path depends on the
// `user_invites` table which doesn't exist in the baseline schema
// (bug 6). We pin the validation guard that fires BEFORE the DB query.

const request = require('supertest');
const app = require('../../app');
const { describeIfDb, closePool, cleanupTestRows } = require('../helpers/db');

describeIfDb('Activate — /activate', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('GET /activate without token returns 400 with plain-text error', async () => {
    const res = await request(app).get('/activate');
    expect(res.statusCode).toBe(400);
    expect(res.text).toMatch(/Missing activation token/i);
  });
});
