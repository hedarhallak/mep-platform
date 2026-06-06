// tests/integration/company_settings.test.js
//
// Section 134.4 — tenant company Settings (/api/company/settings).
//   * GET returns the company's own config (name/code/plan read-only +
//     editable shift + contact fields)
//   * PATCH updates the editable fields and echoes them back
//   * PATCH validates shift time format (HH:MM 24h) → 400
//
// Auth: a directly-signed SUPER_ADMIN token WITH company_id (same approach as
// expense_claims.test.js) so can('settings.company') passes without PIN/TOTP.

'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../app');
const { JWT_SECRET } = require('../../lib/auth_utils');
const {
  describeIfDb,
  closePool,
  seedCompany,
  seedUser,
  cleanupTestRows,
} = require('../helpers/db');

function buildToken(user, companyId) {
  return jwt.sign(
    {
      user_id: String(user.id),
      username: user.username,
      company_id: String(companyId),
      role: 'SUPER_ADMIN',
      must_change_pin: false,
      totp_verified: true,
    },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describeIfDb('Company settings — /api/company/settings', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  async function actor() {
    const company = await seedCompany();
    const user = await seedUser({
      company_id: company.company_id,
      role: 'SUPER_ADMIN',
      pin: 'satest2026',
    });
    return { company, auth: `Bearer ${buildToken(user, company.company_id)}` };
  }

  test('GET returns company settings with read-only identity + editable fields', async () => {
    const { auth } = await actor();
    const res = await request(app).get('/api/company/settings').set('Authorization', auth);
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.settings).toHaveProperty('name');
    expect(res.body.settings).toHaveProperty('company_code');
    expect(res.body.settings).toHaveProperty('plan');
    // Shift defaults are formatted HH:MM.
    expect(res.body.settings.default_shift_start).toMatch(/^\d{2}:\d{2}$/);
    expect(res.body.settings.default_shift_end).toMatch(/^\d{2}:\d{2}$/);
  });

  test('PATCH updates the editable fields', async () => {
    const { auth } = await actor();
    const res = await request(app).patch('/api/company/settings').set('Authorization', auth).send({
      default_shift_start: '07:00',
      default_shift_end: '15:30',
      phone: '514-555-0199',
      procurement_email: 'buy@example.com',
      address: '123 Rue Test, Montréal',
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.settings.default_shift_start).toBe('07:00');
    expect(res.body.settings.default_shift_end).toBe('15:30');
    expect(res.body.settings.phone).toBe('514-555-0199');
    expect(res.body.settings.procurement_email).toBe('buy@example.com');
  });

  test('PATCH rejects a malformed shift time with 400', async () => {
    const { auth } = await actor();
    const res = await request(app)
      .patch('/api/company/settings')
      .set('Authorization', auth)
      .send({ default_shift_start: '25:99' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('INVALID_SHIFT_START');
  });
});
