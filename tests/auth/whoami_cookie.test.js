// tests/auth/whoami_cookie.test.js — Phase 6-D-1b (Section 101, May 14, 2026).
//
// DB-backed coverage for the cookie fallback Phase 6-D-1b added to the
// inline-JWT-verify auth endpoints (/whoami, /change-pin, /logout-all).
// Those three handlers bypass middleware/auth.js and so didn't pick up
// the cookie support added to the middleware in Phase 6-D-1a — without
// the Section 101 extractToken() helper, the cross-subdomain flow breaks
// at /whoami the moment the frontend lands on `acm.constrai.ca` after a
// redirect from `app.constrai.ca` (localStorage is per-origin, cookies
// travel via Domain=.constrai.ca).
//
// We cover /whoami in detail; /change-pin and /logout-all use the same
// extractToken() helper so cookie support is exercised indirectly.

'use strict';

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

async function seedCompanyWithCode(code) {
  const co = await seedCompany();
  const pool = getPool();
  await pool.query(`UPDATE public.companies SET company_code = $1 WHERE company_id = $2`, [
    code,
    co.company_id,
  ]);
  return { ...co, company_code: code };
}

function parseSetCookie(line) {
  const [pair, ...rawAttrs] = line.split(';').map((s) => s.trim());
  const eq = pair.indexOf('=');
  const name = pair.slice(0, eq);
  const value = pair.slice(eq + 1);
  const attrs = {};
  for (const a of rawAttrs) {
    const idx = a.indexOf('=');
    if (idx === -1) attrs[a.toLowerCase()] = true;
    else attrs[a.slice(0, idx).toLowerCase()] = a.slice(idx + 1);
  }
  return { name, value, attrs };
}

function findCookie(setCookieArr, name) {
  if (!Array.isArray(setCookieArr)) return null;
  for (const line of setCookieArr) {
    const parsed = parseSetCookie(line);
    if (parsed.name === name) return parsed;
  }
  return null;
}

async function loginAndGetTokens(user) {
  const res = await request(app).post('/api/auth/login').send({ email: user.email, pin: user.pin });
  if (res.statusCode !== 200) {
    throw new Error(`Login failed in test setup: ${res.statusCode} ${JSON.stringify(res.body)}`);
  }
  const accessCookie = findCookie(res.headers['set-cookie'], 'access_token');
  return {
    bodyToken: res.body.token,
    cookieToken: accessCookie ? accessCookie.value : null,
  };
}

describeIfDb('Phase 6-D-1b — GET /api/auth/whoami cookie fallback', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('returns the user when access_token is in a cookie (no Bearer)', async () => {
    const company = await seedCompanyWithCode('WHA1234');
    const user = await seedUser({
      company_id: company.company_id,
      role: 'COMPANY_ADMIN',
      pin: '1234',
    });
    const { cookieToken } = await loginAndGetTokens(user);
    expect(cookieToken).toBeTruthy();

    const res = await request(app)
      .get('/api/auth/whoami')
      .set('Cookie', `access_token=${cookieToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.user_id).toBe(String(user.id));
    expect(res.body.user.role).toBe('COMPANY_ADMIN');
  });

  test('returns 401 MISSING_TOKEN when neither Bearer nor cookie is present', async () => {
    const res = await request(app).get('/api/auth/whoami');
    expect(res.statusCode).toBe(401);
    expect(res.body).toMatchObject({ ok: false, error: 'MISSING_TOKEN' });
  });

  test('Bearer header beats cookie when both arrive (mobile-compat precedence)', async () => {
    const company = await seedCompanyWithCode('WHB1234');
    const user = await seedUser({
      company_id: company.company_id,
      role: 'FOREMAN',
      pin: '1234',
    });
    const { bodyToken } = await loginAndGetTokens(user);

    // Send a deliberately broken cookie alongside a valid Bearer. If the
    // cookie won, jwt.verify would throw and we'd see 401 INVALID_TOKEN.
    // Bearer winning → 200 with the right user.
    const res = await request(app)
      .get('/api/auth/whoami')
      .set('Authorization', `Bearer ${bodyToken}`)
      .set('Cookie', 'access_token=this-is-not-a-real-jwt');

    expect(res.statusCode).toBe(200);
    expect(res.body.user.user_id).toBe(String(user.id));
  });

  test('returns 401 INVALID_TOKEN when cookie carries a malformed JWT and no Bearer', async () => {
    const res = await request(app)
      .get('/api/auth/whoami')
      .set('Cookie', 'access_token=not-a-jwt-at-all');

    expect(res.statusCode).toBe(401);
    expect(res.body).toMatchObject({ ok: false, error: 'INVALID_TOKEN' });
  });
});
