// Phase 28 — CCQ rates endpoints (super admin only).
//
// /api/super/ccq-rates manages the Quebec construction commission's
// travel allowance reference table. Mounted under /api/super so it's
// behind both auth and middleware/super_admin (role='SUPER_ADMIN'
// required).

const request = require('supertest');
const app = require('../../app');
const { adminRequest } = require('../helpers/admin_request');
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

describeIfDb('CCQ rates — /api/super/ccq-rates', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('GET /api/super/ccq-rates as SUPER_ADMIN returns rates array (200)', async () => {
    const sa = await seedUser({ role: 'SUPER_ADMIN', pin: 'sa-pin-1234' });
    const { token } = await loginUser(sa);

    const res = await adminRequest(app)
      .get('/api/super/ccq-rates')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.rates)).toBe(true);
  });

  test('GET /api/super/ccq-rates as COMPANY_ADMIN returns 403', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const { token } = await loginUser(admin);

    const res = await adminRequest(app)
      .get('/api/super/ccq-rates')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ ok: false, error: 'SUPER_ADMIN_REQUIRED' });
  });

  test('GET /api/super/ccq-rates/expiring as SUPER_ADMIN returns expiring set (200)', async () => {
    const sa = await seedUser({ role: 'SUPER_ADMIN', pin: 'sa-pin-1234' });
    const { token } = await loginUser(sa);

    const res = await adminRequest(app)
      .get('/api/super/ccq-rates/expiring')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.expiring)).toBe(true);
    expect(typeof res.body.count).toBe('number');
  });

  // ── §151.4 write paths: POST / PATCH / DELETE (super-admin) ──────────────

  async function saToken() {
    const sa = await seedUser({ role: 'SUPER_ADMIN', pin: 'sa-pin-1234' });
    const { token } = await loginUser(sa);
    return token;
  }

  const VALID_RATE = {
    trade_code: 'ELECTRICAL',
    sector: 'IC',
    min_km: 41,
    rate_cad: 0.62,
    tax_form: 'TE',
    effective_from: '2030-01-01',
    effective_to: '2030-12-31',
    notes: 'test rate',
  };

  test('POST → PATCH → DELETE lifecycle (201 / 200 / 200 / 404)', async () => {
    const token = await saToken();

    const created = await adminRequest(app)
      .post('/api/super/ccq-rates')
      .set('Authorization', `Bearer ${token}`)
      .send(VALID_RATE);
    expect(created.statusCode).toBe(201);
    expect(created.body.ok).toBe(true);
    expect(created.body.rate).toHaveProperty('id');
    const id = created.body.rate.id;

    const patched = await adminRequest(app)
      .patch(`/api/super/ccq-rates/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ rate_cad: 0.75, notes: 'bumped' });
    expect(patched.statusCode).toBe(200);
    expect(Number(patched.body.rate.rate_cad)).toBeCloseTo(0.75);

    const del = await adminRequest(app)
      .delete(`/api/super/ccq-rates/${id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(del.statusCode).toBe(200);
    expect(del.body.ok).toBe(true);

    const delAgain = await adminRequest(app)
      .delete(`/api/super/ccq-rates/${id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(delAgain.statusCode).toBe(404);
  });

  test('POST validation rejects bad payloads with the right error codes', async () => {
    const token = await saToken();
    const post = (body) =>
      adminRequest(app)
        .post('/api/super/ccq-rates')
        .set('Authorization', `Bearer ${token}`)
        .send(body);

    expect((await post({ ...VALID_RATE, trade_code: 'NOPE' })).body.error).toBe(
      'INVALID_TRADE_CODE'
    );
    expect((await post({ ...VALID_RATE, sector: 'NOPE' })).body.error).toBe('INVALID_SECTOR');
    expect((await post({ ...VALID_RATE, min_km: 'x' })).body.error).toBe('MIN_KM_REQUIRED');
    expect((await post({ ...VALID_RATE, rate_cad: 'x' })).body.error).toBe('RATE_REQUIRED');
    expect((await post({ ...VALID_RATE, effective_from: '' })).body.error).toBe('DATES_REQUIRED');
    expect(
      (await post({ ...VALID_RATE, effective_from: '2030-12-31', effective_to: '2030-01-01' })).body
        .error
    ).toBe('INVALID_DATE_RANGE');
  });

  test('PATCH with no fields → 400 NOTHING_TO_UPDATE; non-existent id → 404', async () => {
    const token = await saToken();

    const empty = await adminRequest(app)
      .patch('/api/super/ccq-rates/1')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(empty.statusCode).toBe(400);
    expect(empty.body.error).toBe('NOTHING_TO_UPDATE');

    const missing = await adminRequest(app)
      .patch('/api/super/ccq-rates/9999999')
      .set('Authorization', `Bearer ${token}`)
      .send({ rate_cad: 0.5 });
    expect(missing.statusCode).toBe(404);
    expect(missing.body.error).toBe('NOT_FOUND');
  });
});
