// Section 82 — Suppliers route integration tests.
//
// /api/suppliers/* manages a company's supplier directory used by the
// material-request workflow and the purchase-order PDF generator.
// Routes: GET (list + filter by trade), POST (create), PATCH (update),
// DELETE (soft delete via is_active=false).
//
// Coverage focus: happy path + validation + RBAC + tenant isolation.

'use strict';

const request = require('supertest');
const app = require('../../app');
const {
  describeIfDb,
  closePool,
  getPool,
  seedCompany,
  seedUser,
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

describeIfDb('Suppliers — /api/suppliers', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  // ── GET /api/suppliers ──────────────────────────────────────

  test('GET / returns own company suppliers (200)', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    await seedSupplier({ company_id: company.company_id, trade_code: 'PLUMBING' });
    await seedSupplier({ company_id: company.company_id, trade_code: 'ELECTRICAL' });

    const { token } = await loginUser(admin);
    const res = await request(app).get('/api/suppliers').set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.suppliers)).toBe(true);
    expect(res.body.suppliers.length).toBeGreaterThanOrEqual(2);
  });

  test('GET / returns empty array for company with no suppliers (200)', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });

    const { token } = await loginUser(admin);
    const res = await request(app).get('/api/suppliers').set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.suppliers).toEqual([]);
  });

  test('GET /?trade_code=PLUMBING filters by trade (200)', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    await seedSupplier({ company_id: company.company_id, trade_code: 'PLUMBING' });
    await seedSupplier({ company_id: company.company_id, trade_code: 'ELECTRICAL' });
    await seedSupplier({ company_id: company.company_id, trade_code: 'ALL' });

    const { token } = await loginUser(admin);
    const res = await request(app)
      .get('/api/suppliers?trade_code=PLUMBING')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    // PLUMBING should match the PLUMBING supplier + the ALL supplier (route OR clause)
    const codes = res.body.suppliers.map((s) => s.trade_code);
    expect(codes).toContain('PLUMBING');
    expect(codes).toContain('ALL');
    expect(codes).not.toContain('ELECTRICAL');
  });

  test('GET /?trade_code=ALL returns all suppliers regardless of trade (200)', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    await seedSupplier({ company_id: company.company_id, trade_code: 'PLUMBING' });
    await seedSupplier({ company_id: company.company_id, trade_code: 'ELECTRICAL' });

    const { token } = await loginUser(admin);
    const res = await request(app)
      .get('/api/suppliers?trade_code=ALL')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    const codes = res.body.suppliers.map((s) => s.trade_code);
    expect(codes).toContain('PLUMBING');
    expect(codes).toContain('ELECTRICAL');
  });

  test('GET / excludes soft-deleted suppliers (is_active=false)', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const active = await seedSupplier({ company_id: company.company_id });
    await seedSupplier({ company_id: company.company_id, is_active: false });

    const { token } = await loginUser(admin);
    const res = await request(app).get('/api/suppliers').set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    const ids = res.body.suppliers.map((s) => s.id);
    expect(ids).toContain(active.id);
    // Inactive supplier should not appear
    expect(res.body.suppliers.every((s) => s.is_active === true)).toBe(true);
  });

  test('GET / tenant isolation — A cannot see B suppliers', async () => {
    const companyA = await seedCompany();
    const companyB = await seedCompany();
    const adminA = await seedUser({ company_id: companyA.company_id, role: 'COMPANY_ADMIN' });
    const supB = await seedSupplier({ company_id: companyB.company_id });

    const { token } = await loginUser(adminA);
    const res = await request(app).get('/api/suppliers').set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    const ids = res.body.suppliers.map((s) => s.id);
    expect(ids).not.toContain(supB.id);
  });

  test('GET / without auth → 401', async () => {
    const res = await request(app).get('/api/suppliers');
    expect(res.statusCode).toBe(401);
  });

  test('GET / as WORKER without permission → 403', async () => {
    const company = await seedCompany();
    const worker = await seedUser({ company_id: company.company_id, role: 'WORKER' });

    const { token } = await loginUser(worker);
    const res = await request(app).get('/api/suppliers').set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(403);
  });

  // ── POST /api/suppliers ─────────────────────────────────────

  test('POST / creates a supplier (201)', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });

    const { token } = await loginUser(admin);
    const res = await request(app)
      .post('/api/suppliers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `test_sup_post_${Date.now()}`,
        email: 'sup-post@example.test',
        phone: '555-1234',
        address: '123 Industrial Pkwy',
        trade_code: 'PLUMBING',
        note: 'integration test supplier',
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.supplier.name).toMatch(/^test_sup_post_/);
    expect(res.body.supplier.trade_code).toBe('PLUMBING');
    expect(Number(res.body.supplier.company_id)).toBe(company.company_id);
  });

  test('POST / defaults trade_code to ALL when omitted', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });

    const { token } = await loginUser(admin);
    const res = await request(app)
      .post('/api/suppliers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `test_sup_default_trade_${Date.now()}`,
        email: 'a@b.test',
        phone: '555-0000',
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.supplier.trade_code).toBe('ALL');
  });

  test('POST / missing name → 400 NAME_REQUIRED', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });

    const { token } = await loginUser(admin);
    const res = await request(app)
      .post('/api/suppliers')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'a@b.test', phone: '555' });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('NAME_REQUIRED');
  });

  test('POST / missing email → 400 EMAIL_REQUIRED', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });

    const { token } = await loginUser(admin);
    const res = await request(app)
      .post('/api/suppliers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'X', phone: '555' });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('EMAIL_REQUIRED');
  });

  test('POST / missing phone → 400 PHONE_REQUIRED', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });

    const { token } = await loginUser(admin);
    const res = await request(app)
      .post('/api/suppliers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'X', email: 'a@b.test' });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('PHONE_REQUIRED');
  });

  test('POST / invalid trade_code → 400 INVALID_TRADE_CODE', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });

    const { token } = await loginUser(admin);
    const res = await request(app)
      .post('/api/suppliers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `test_sup_bad_trade_${Date.now()}`,
        email: 'a@b.test',
        phone: '555',
        trade_code: 'NUCLEAR_REACTOR',
      });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('INVALID_TRADE_CODE');
  });

  test('POST / as WORKER without permission → 403', async () => {
    const company = await seedCompany();
    const worker = await seedUser({ company_id: company.company_id, role: 'WORKER' });

    const { token } = await loginUser(worker);
    const res = await request(app)
      .post('/api/suppliers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'X', email: 'a@b.test', phone: '555' });

    expect(res.statusCode).toBe(403);
  });

  // ── PATCH /api/suppliers/:id ────────────────────────────────

  test('PATCH /:id updates a supplier (200)', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const sup = await seedSupplier({ company_id: company.company_id, trade_code: 'PLUMBING' });

    const { token } = await loginUser(admin);
    const res = await request(app)
      .patch(`/api/suppliers/${sup.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ trade_code: 'ELECTRICAL', note: 'updated note' });

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.supplier.trade_code).toBe('ELECTRICAL');
    expect(res.body.supplier.note).toBe('updated note');
  });

  test('PATCH /:id partial update preserves unchanged fields', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const sup = await seedSupplier({ company_id: company.company_id });

    const { token } = await loginUser(admin);
    const res = await request(app)
      .patch(`/api/suppliers/${sup.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ note: 'just the note' });

    expect(res.statusCode).toBe(200);
    expect(res.body.supplier.name).toBe(sup.name); // unchanged
    expect(res.body.supplier.email).toBe(sup.email); // unchanged
    expect(res.body.supplier.note).toBe('just the note');
  });

  test('PATCH /:id non-existent → 404 NOT_FOUND', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });

    const { token } = await loginUser(admin);
    const res = await request(app)
      .patch('/api/suppliers/99999999')
      .set('Authorization', `Bearer ${token}`)
      .send({ note: 'x' });

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  test("PATCH /:id on B's supplier as A → 404 (tenant isolation)", async () => {
    const companyA = await seedCompany();
    const companyB = await seedCompany();
    const adminA = await seedUser({ company_id: companyA.company_id, role: 'COMPANY_ADMIN' });
    const supB = await seedSupplier({ company_id: companyB.company_id });

    const { token } = await loginUser(adminA);
    const res = await request(app)
      .patch(`/api/suppliers/${supB.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ note: 'hacked' });

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  test('PATCH /:id invalid trade_code → 400 INVALID_TRADE_CODE', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const sup = await seedSupplier({ company_id: company.company_id });

    const { token } = await loginUser(admin);
    const res = await request(app)
      .patch(`/api/suppliers/${sup.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ trade_code: 'BOGUS' });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('INVALID_TRADE_CODE');
  });

  // ── DELETE /api/suppliers/:id ───────────────────────────────

  test('DELETE /:id soft-deletes the supplier (200)', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const sup = await seedSupplier({ company_id: company.company_id });

    const { token } = await loginUser(admin);
    const res = await request(app)
      .delete(`/api/suppliers/${sup.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);

    // Verify is_active flipped to false
    const { rows } = await getPool().query(`SELECT is_active FROM public.suppliers WHERE id = $1`, [
      sup.id,
    ]);
    expect(rows[0].is_active).toBe(false);
  });

  test('DELETE /:id then GET / no longer returns it', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const sup = await seedSupplier({ company_id: company.company_id });

    const { token } = await loginUser(admin);
    await request(app).delete(`/api/suppliers/${sup.id}`).set('Authorization', `Bearer ${token}`);

    const listRes = await request(app)
      .get('/api/suppliers')
      .set('Authorization', `Bearer ${token}`);

    const ids = listRes.body.suppliers.map((s) => s.id);
    expect(ids).not.toContain(sup.id);
  });

  test('DELETE /:id non-existent → 404 NOT_FOUND', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });

    const { token } = await loginUser(admin);
    const res = await request(app)
      .delete('/api/suppliers/99999999')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  test("DELETE /:id on B's supplier as A → 404 (tenant isolation)", async () => {
    const companyA = await seedCompany();
    const companyB = await seedCompany();
    const adminA = await seedUser({ company_id: companyA.company_id, role: 'COMPANY_ADMIN' });
    const supB = await seedSupplier({ company_id: companyB.company_id });

    const { token } = await loginUser(adminA);
    const res = await request(app)
      .delete(`/api/suppliers/${supB.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(404);
  });

  test('DELETE /:id as WORKER without permission → 403', async () => {
    const company = await seedCompany();
    const worker = await seedUser({ company_id: company.company_id, role: 'WORKER' });
    const sup = await seedSupplier({ company_id: company.company_id });

    const { token } = await loginUser(worker);
    const res = await request(app)
      .delete(`/api/suppliers/${sup.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(403);
  });
});
