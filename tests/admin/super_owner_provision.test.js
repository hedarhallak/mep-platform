// tests/admin/super_owner_provision.test.js
//
// §132 / §140 Slice 3 — SUPER_ADMIN provisions the OWNER account for a tenant.
// POST /api/super/companies/:id/owner (admin portal). Verifies create (201),
// one-OWNER-per-company (409), and email validation (400).
//
// Auth: a directly-signed SUPER_ADMIN token (totp_verified:true) + adminRequest
// (Host: admin.constrai.ca) so the request reaches the admin sub-app.

'use strict';

const jwt = require('jsonwebtoken');
const app = require('../../app');
const { JWT_SECRET } = require('../../lib/auth_utils');
const { adminRequest } = require('../helpers/admin_request');
const {
  describeIfDb,
  closePool,
  getPool,
  seedCompany,
  seedUser,
  cleanupTestRows,
} = require('../helpers/db');

function saToken(user) {
  return jwt.sign(
    {
      user_id: String(user.id),
      username: user.username,
      company_id: null,
      role: 'SUPER_ADMIN',
      must_change_pin: false,
      totp_verified: true,
    },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

const uniqEmail = (p) =>
  `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@test.constrai.local`;

describeIfDb('OWNER provisioning — POST /api/super/companies/:id/owner (§132 / §140)', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  async function saAuth() {
    const u = await seedUser({ role: 'SUPER_ADMIN', pin: 'satest2026' });
    return `Bearer ${saToken(u)}`;
  }

  test('provisions an OWNER for a company (201) and persists role=OWNER', async () => {
    const auth = await saAuth();
    const company = await seedCompany();
    const res = await adminRequest(app)
      .post(`/api/super/companies/${company.company_id}/owner`)
      .set('Authorization', auth)
      .send({ email: uniqEmail('owner') });

    expect(res.statusCode).toBe(201);
    expect(res.body.owner.role).toBe('OWNER');
    const { rows } = await getPool().query(
      'SELECT role, company_id FROM public.app_users WHERE id = $1',
      [res.body.owner.id]
    );
    expect(rows[0].role).toBe('OWNER');
    expect(Number(rows[0].company_id)).toBe(company.company_id);
  });

  test('a second OWNER for the same company → 409 OWNER_ALREADY_EXISTS', async () => {
    const auth = await saAuth();
    const company = await seedCompany();
    const first = await adminRequest(app)
      .post(`/api/super/companies/${company.company_id}/owner`)
      .set('Authorization', auth)
      .send({ email: uniqEmail('owner1') });
    expect(first.statusCode).toBe(201);

    const second = await adminRequest(app)
      .post(`/api/super/companies/${company.company_id}/owner`)
      .set('Authorization', auth)
      .send({ email: uniqEmail('owner2') });
    expect(second.statusCode).toBe(409);
    expect(second.body.error).toBe('OWNER_ALREADY_EXISTS');
  });

  test('invalid email → 400', async () => {
    const auth = await saAuth();
    const company = await seedCompany();
    const res = await adminRequest(app)
      .post(`/api/super/companies/${company.company_id}/owner`)
      .set('Authorization', auth)
      .send({ email: 'not-an-email' });
    expect(res.statusCode).toBe(400);
  });
});
