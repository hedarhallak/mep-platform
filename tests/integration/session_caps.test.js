// tests/integration/session_caps.test.js
//
// §133 (DECISIONS §137) — server-side idle + absolute session caps enforced on
// POST /api/auth/refresh for SUPER_ADMIN. We seed a refresh_tokens row directly
// with chosen session_started_at / last_activity_at, then call /refresh and
// assert the cap verdict. Tenant roles must be unaffected.

'use strict';

const crypto = require('crypto');
const request = require('supertest');
const app = require('../../app');
const {
  describeIfDb,
  closePool,
  getPool,
  seedCompany,
  seedUser,
  cleanupTestRows,
} = require('../helpers/db');

// Mirror routes/auth.js hashRefreshToken.
function makeToken() {
  const raw = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  return { raw, hash };
}

async function seedRefreshToken(userId, { sessionStartedAt, lastActivityAt }) {
  const { raw, hash } = makeToken();
  await getPool().query(
    `INSERT INTO public.refresh_tokens
       (user_id, token_hash, expires_at, session_started_at, last_activity_at, revoked)
     VALUES ($1, $2, NOW() + INTERVAL '7 days', $3, $4, FALSE)`,
    [userId, hash, sessionStartedAt, lastActivityAt]
  );
  return raw;
}

const minAgo = (m) => new Date(Date.now() - m * 60 * 1000).toISOString();

describeIfDb('Session caps — POST /api/auth/refresh (§133)', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('SUPER_ADMIN idle past the cap → 401 SESSION_IDLE_TIMEOUT', async () => {
    const sa = await seedUser({ role: 'SUPER_ADMIN', pin: 'satest2026' });
    const raw = await seedRefreshToken(sa.id, {
      sessionStartedAt: minAgo(120),
      lastActivityAt: minAgo(120), // > 60-min idle cap
    });

    const res = await request(app).post('/api/auth/refresh').send({ refresh_token: raw });
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('SESSION_IDLE_TIMEOUT');
  });

  test('SUPER_ADMIN past the absolute cap (recently active) → 401 SESSION_ABSOLUTE_TIMEOUT', async () => {
    const sa = await seedUser({ role: 'SUPER_ADMIN', pin: 'satest2026' });
    const raw = await seedRefreshToken(sa.id, {
      sessionStartedAt: minAgo(9 * 60), // 9h > 8h absolute cap
      lastActivityAt: minAgo(1), // active, but absolute still wins
    });

    const res = await request(app).post('/api/auth/refresh').send({ refresh_token: raw });
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('SESSION_ABSOLUTE_TIMEOUT');
  });

  test('SUPER_ADMIN active + within caps → refresh succeeds (200)', async () => {
    const sa = await seedUser({ role: 'SUPER_ADMIN', pin: 'satest2026' });
    const raw = await seedRefreshToken(sa.id, {
      sessionStartedAt: minAgo(60),
      lastActivityAt: minAgo(5),
    });

    const res = await request(app).post('/api/auth/refresh').send({ refresh_token: raw });
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('tenant role is NOT subject to the SUPER_ADMIN caps (long-idle still refreshes)', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const raw = await seedRefreshToken(admin.id, {
      sessionStartedAt: minAgo(20 * 60), // 20h
      lastActivityAt: minAgo(5 * 60), // 5h idle — way past SA caps
    });

    const res = await request(app).post('/api/auth/refresh').send({ refresh_token: raw });
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
