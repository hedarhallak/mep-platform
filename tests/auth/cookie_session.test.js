// tests/auth/cookie_session.test.js — Phase 6-D-1a (Section 100, May 14, 2026).
//
// DB-backed integration tests for the new cookie-based session flow
// added in Section 100. Exercises three contracts:
//
//   1. POST /api/auth/login on app.constrai.ca:
//      - Returns redirect_url to the tenant subdomain
//      - Sets HttpOnly access_token + refresh_token cookies
//      - User payload includes company_code
//
//   2. POST /api/auth/login on default Host (127.0.0.1):
//      - redirect_url is null (no Pattern B routing)
//      - Cookies still set (additive behavior — same response, just no
//        Domain=.constrai.ca since we're not on the prod hosts)
//
//   3. Middleware auth fallback:
//      - Auth-protected route accepts access_token cookie when no
//        Authorization: Bearer header is present
//      - Bearer header still wins when both are present

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

// Local helper — seedCompany doesn't set company_code (it's not in the
// helper's column list yet). We assign a known code post-insert so the
// redirect_url assertion can be exact.
async function seedCompanyWithCode(code, overrides = {}) {
  const co = await seedCompany(overrides);
  const pool = getPool();
  await pool.query(`UPDATE public.companies SET company_code = $1 WHERE company_id = $2`, [
    code,
    co.company_id,
  ]);
  return { ...co, company_code: code };
}

// Parse a Set-Cookie header value into { name, value, attrs: { lower: value } }.
// Express's res.cookie() emits one header line per cookie; supertest
// surfaces them as an array of strings.
function parseSetCookie(line) {
  const [pair, ...rawAttrs] = line.split(';').map((s) => s.trim());
  const eq = pair.indexOf('=');
  const name = pair.slice(0, eq);
  const value = pair.slice(eq + 1);
  const attrs = {};
  for (const a of rawAttrs) {
    const idx = a.indexOf('=');
    if (idx === -1) {
      attrs[a.toLowerCase()] = true;
    } else {
      attrs[a.slice(0, idx).toLowerCase()] = a.slice(idx + 1);
    }
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

describeIfDb('Phase 6-D-1a — login cookies + redirect_url', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('login on app.constrai.ca returns redirect_url for a tenant user', async () => {
    const company = await seedCompanyWithCode('ACM1234');
    const user = await seedUser({
      company_id: company.company_id,
      role: 'FOREMAN',
      pin: '1234',
    });

    const res = await request(app)
      .post('/api/auth/login')
      .set('Host', 'app.constrai.ca')
      .send({ email: user.email, pin: '1234' });

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.redirect_url).toBe('https://acm1234.constrai.ca/dashboard');
    expect(res.body.user.company_code).toBe('ACM1234');
  });

  test('login on default Host (127.0.0.1) returns redirect_url=null', async () => {
    const company = await seedCompanyWithCode('XYZ5678');
    const user = await seedUser({
      company_id: company.company_id,
      role: 'WORKER',
      pin: '1234',
    });

    const res = await request(app).post('/api/auth/login').send({
      email: user.email,
      pin: '1234',
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.redirect_url).toBeNull();
    // company_code is still surfaced so the frontend can build the URL
    // itself if it ever wants to.
    expect(res.body.user.company_code).toBe('XYZ5678');
  });

  test('SUPER_ADMIN login on admin.constrai.ca returns redirect_url=null', async () => {
    // SUPER_ADMIN belongs to the admin portal — no tenant subdomain to
    // redirect to. company_id is allowed to be null for SA.
    const sa = await seedUser({
      role: 'SUPER_ADMIN',
      pin: 'sa-pin-1234',
    });

    const res = await request(app)
      .post('/api/auth/login')
      .set('Host', 'admin.constrai.ca')
      .send({ email: sa.email, pin: 'sa-pin-1234' });

    expect(res.statusCode).toBe(200);
    expect(res.body.redirect_url).toBeNull();
  });

  test('login sets HttpOnly access_token + refresh_token cookies', async () => {
    const company = await seedCompanyWithCode('CKE0001');
    const user = await seedUser({
      company_id: company.company_id,
      role: 'WORKER',
      pin: '1234',
    });

    const res = await request(app).post('/api/auth/login').send({
      email: user.email,
      pin: '1234',
    });

    expect(res.statusCode).toBe(200);
    const setCookies = res.headers['set-cookie'];
    expect(Array.isArray(setCookies)).toBe(true);

    const access = findCookie(setCookies, 'access_token');
    expect(access).not.toBeNull();
    expect(access.value).toBe(res.body.token);
    expect(access.attrs.httponly).toBe(true);
    expect((access.attrs.samesite || '').toLowerCase()).toBe('lax');
    expect(access.attrs.path).toBe('/');
    // NODE_ENV=test → no Secure flag, no Domain attribute.
    expect(access.attrs.secure).toBeUndefined();
    expect(access.attrs.domain).toBeUndefined();

    const refresh = findCookie(setCookies, 'refresh_token');
    expect(refresh).not.toBeNull();
    expect(refresh.value).toBe(res.body.refresh_token);
    expect(refresh.attrs.httponly).toBe(true);
    expect((refresh.attrs.samesite || '').toLowerCase()).toBe('lax');
  });
});

describeIfDb('Phase 6-D-1a — middleware/auth cookie fallback', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  // We need an auth-protected route to validate the middleware. /api/profile
  // requires `auth` + `tenantDb`. We only care that auth itself accepts the
  // cookie; if tenantDb fails downstream (e.g., RLS row not found) the
  // status will be something other than 200 but NEVER 401 — that's our
  // assertion.

  test('protected route accepts access_token cookie when no Authorization header', async () => {
    const company = await seedCompanyWithCode('MWA1234');
    const user = await seedUser({
      company_id: company.company_id,
      role: 'COMPANY_ADMIN',
      pin: '1234',
    });

    const login = await request(app).post('/api/auth/login').send({
      email: user.email,
      pin: '1234',
    });
    expect(login.statusCode).toBe(200);

    const accessCookie = findCookie(login.headers['set-cookie'], 'access_token');
    expect(accessCookie).not.toBeNull();

    // Hit a route guarded by middleware/auth, sending the cookie but NO
    // Authorization header. If the middleware doesn't honor the cookie,
    // the response is 401 MISSING_TOKEN.
    const res = await request(app)
      .get('/api/profile')
      .set('Cookie', `access_token=${accessCookie.value}`);

    expect(res.statusCode).not.toBe(401);
  });

  test('Authorization: Bearer beats cookie when both arrive', async () => {
    const company = await seedCompanyWithCode('MWB1234');
    const user = await seedUser({
      company_id: company.company_id,
      role: 'COMPANY_ADMIN',
      pin: '1234',
    });

    const login = await request(app).post('/api/auth/login').send({
      email: user.email,
      pin: '1234',
    });
    expect(login.statusCode).toBe(200);

    // Send a deliberately invalid cookie + a valid Bearer. Bearer wins,
    // so the request authenticates. If the cookie won, JWT verify would
    // throw and we'd see 401 INVALID_TOKEN.
    const res = await request(app)
      .get('/api/profile')
      .set('Authorization', `Bearer ${login.body.token}`)
      .set('Cookie', 'access_token=not-a-real-jwt');

    expect(res.statusCode).not.toBe(401);
  });
});

describeIfDb('Phase 6-D-1a — refresh + logout cookie handling', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('refresh via cookie sets new rotated cookies', async () => {
    const company = await seedCompanyWithCode('REF1234');
    const user = await seedUser({
      company_id: company.company_id,
      role: 'WORKER',
      pin: '1234',
    });

    const login = await request(app).post('/api/auth/login').send({
      email: user.email,
      pin: '1234',
    });
    const refreshCookie = findCookie(login.headers['set-cookie'], 'refresh_token');
    expect(refreshCookie).not.toBeNull();

    const refresh = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `refresh_token=${refreshCookie.value}`)
      // No body: refresh should accept the cookie alone.
      .send({});

    expect(refresh.statusCode).toBe(200);
    expect(typeof refresh.body.token).toBe('string');
    expect(typeof refresh.body.refresh_token).toBe('string');
    expect(refresh.body.refresh_token).not.toBe(refreshCookie.value); // rotated

    const newAccess = findCookie(refresh.headers['set-cookie'], 'access_token');
    const newRefresh = findCookie(refresh.headers['set-cookie'], 'refresh_token');
    expect(newAccess).not.toBeNull();
    expect(newRefresh).not.toBeNull();
    expect(newAccess.value).toBe(refresh.body.token);
    expect(newRefresh.value).toBe(refresh.body.refresh_token);
  });

  test('logout clears both cookies via Set-Cookie with empty/expired value', async () => {
    const company = await seedCompanyWithCode('LOG1234');
    const user = await seedUser({
      company_id: company.company_id,
      role: 'WORKER',
      pin: '1234',
    });

    const login = await request(app).post('/api/auth/login').send({
      email: user.email,
      pin: '1234',
    });
    const refreshCookie = findCookie(login.headers['set-cookie'], 'refresh_token');

    const logout = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', `refresh_token=${refreshCookie.value}`)
      .send({});

    expect(logout.statusCode).toBe(200);

    const setCookies = logout.headers['set-cookie'];
    expect(Array.isArray(setCookies)).toBe(true);
    // Express's clearCookie emits Set-Cookie with an empty value and a
    // past expires/max-age. The simplest cross-version assertion is
    // "name= is the prefix and an Expires attribute is in the past".
    const access = findCookie(setCookies, 'access_token');
    const refresh = findCookie(setCookies, 'refresh_token');
    expect(access).not.toBeNull();
    expect(refresh).not.toBeNull();
    // Cleared cookies always end up with an empty value or an explicit
    // Expires in the past — supertest preserves whichever Express emits.
    const isCleared = (c) => {
      if (c.value === '') return true;
      if (c.attrs.expires) {
        const ts = Date.parse(c.attrs.expires);
        return !isNaN(ts) && ts < Date.now();
      }
      if (c.attrs['max-age'] !== undefined) {
        return Number(c.attrs['max-age']) <= 0;
      }
      return false;
    };
    expect(isCleared(access)).toBe(true);
    expect(isCleared(refresh)).toBe(true);
  });
});
