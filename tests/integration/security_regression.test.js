// Phase 15 — Security regression tests.
//
// Pins the behavior of the auth + parameterization layers against
// classic attack patterns. Most of these are properties the codebase
// gets "for free" from existing libraries (pg parameterization, JWT
// signature verification, Express auth middleware), so the tests are
// principally regression guards: a future refactor that drops a
// parameter binding or weakens auth would show up here.

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../app');
const {
  describeIfDb,
  closePool,
  getPool,
  seedCompany,
  seedUser,
  seedEmployee,
  seedSupplier,
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

describeIfDb('Security — regression tests', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('SQL injection in login username — returns 401, not 500 / not 200', async () => {
    const res = await request(app).post('/api/auth/login').send({
      username: "' OR '1'='1; --",
      pin: '1234',
    });
    // pg parameterization treats the payload as a literal username;
    // no user matches -> INVALID_CREDENTIALS (not a 500 from a SQL error,
    // and definitely not a 200 from a bypass).
    expect(res.statusCode).toBe(401);
    expect(res.body).toMatchObject({ ok: false, error: 'INVALID_CREDENTIALS' });
  });

  test('SQL injection in /api/suppliers?trade_code= — returns clean empty result; table still intact', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const supA = await seedSupplier({ company_id: company.company_id, trade_code: 'PLUMBING' });
    const { token } = await loginUser(admin);

    const payload = encodeURIComponent("'; DROP TABLE suppliers; --");
    const res = await request(app)
      .get(`/api/suppliers?trade_code=${payload}`)
      .set('Authorization', `Bearer ${token}`);

    // Parameterized query: the payload becomes a literal trade_code value.
    // It uppercases to itself and matches no rows.
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.suppliers).toEqual([]);

    // Defense in depth: list with no filter should still work, proving
    // the suppliers table wasn't dropped.
    const res2 = await request(app).get('/api/suppliers').set('Authorization', `Bearer ${token}`);
    expect(res2.statusCode).toBe(200);
    const ids = res2.body.suppliers.map((s) => Number(s.id));
    expect(ids).toContain(supA.id);
  });

  test('Request without Authorization header returns 401', async () => {
    const res = await request(app).get('/api/employees');
    expect(res.statusCode).toBe(401);
  });

  test('Malformed Authorization header (no Bearer prefix) returns 401', async () => {
    const res = await request(app).get('/api/employees').set('Authorization', 'NotBearer abcdef');
    expect(res.statusCode).toBe(401);
  });

  test('JWT signed with the wrong secret returns 401', async () => {
    // Forge a token that LOOKS valid (right structure, plausible payload)
    // but is signed with a different HMAC secret. jwt.verify must reject.
    const forged = jwt.sign(
      { user_id: '1', role: 'SUPER_ADMIN' },
      'definitely-not-the-real-secret'
    );
    const res = await request(app).get('/api/employees').set('Authorization', `Bearer ${forged}`);
    expect(res.statusCode).toBe(401);
  });

  test('JWT with tampered payload (signature mismatch) returns 401', async () => {
    // A pre-baked token whose payload claims SUPER_ADMIN access but whose
    // signature ('bad-signature') will fail verification regardless of
    // which secret was used to sign it originally.
    const tampered =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' +
      '.eyJ1c2VyX2lkIjoiOTk5OSIsInJvbGUiOiJTVVBFUl9BRE1JTiJ9' +
      '.bad-signature';
    const res = await request(app).get('/api/employees').set('Authorization', `Bearer ${tampered}`);
    expect(res.statusCode).toBe(401);
  });

  test("Mass assignment: PATCH /api/employees ignores company_id in body — row's company_id stays put", async () => {
    const companyA = await seedCompany();
    const companyB = await seedCompany();
    const adminA = await seedUser({ company_id: companyA.company_id, role: 'COMPANY_ADMIN' });
    const empA = await seedEmployee({ company_id: companyA.company_id, first_name: 'Original' });

    const { token } = await loginUser(adminA);

    // Send a malicious PATCH body that includes company_id (attempted
    // privilege escalation: hijack the row into a different tenant).
    // The route's destructure whitelist excludes company_id, so the
    // attempt is silently ignored. first_name should change; company_id
    // should NOT.
    const res = await request(app)
      .patch(`/api/employees/${empA.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ company_id: companyB.company_id, first_name: 'Renamed' });

    expect(res.statusCode).toBe(200);

    // Independent DB readback (bypass the API entirely) confirms the
    // row's company_id is still company A's, even though the PATCH body
    // tried to overwrite it.
    const { rows } = await getPool().query(
      'SELECT company_id, first_name FROM public.employees WHERE id = $1',
      [empA.id]
    );
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].company_id)).toBe(companyA.company_id);
    expect(rows[0].first_name).toBe('Renamed');
  });
});
