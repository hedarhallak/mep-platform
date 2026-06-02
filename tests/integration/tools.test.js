// tests/integration/tools.test.js
//
// Phase 6-D-9 / DECISIONS §126.1 — Tool Request + asset tracking (Slice A
// backend). Exercises the full flow over /api/tools: browse the global catalog
// (seeded by migration 024, filterable by trade), request a tool, register a
// physical asset, and move it to a project (which records a movement).
//
// Uses a directly-signed SUPER_ADMIN token WITH a company_id so can() passes
// and tenantDb attaches a (BYPASSRLS) client — same approach as the admin
// integration tests, avoiding login/PIN/TOTP setup.

'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../app');
const { JWT_SECRET } = require('../../lib/auth_utils');
const {
  describeIfDb,
  closePool,
  getPool,
  seedCompany,
  seedUser,
  seedProject,
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

describeIfDb('Tools — request + asset tracking (/api/tools)', () => {
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
    const token = buildToken(user, company.company_id);
    return { company, token };
  }

  test('full flow: catalog → request → asset → move', async () => {
    const { company, token } = await actor();
    const project = await seedProject({ company_id: company.company_id });
    const auth = `Bearer ${token}`;

    // Global catalog filtered by trade (seeded by migration 024).
    const cat = await request(app)
      .get('/api/tools/catalog?trade=PLUMBING')
      .set('Authorization', auth);
    expect(cat.statusCode).toBe(200);
    expect(cat.body.catalog.length).toBeGreaterThan(0);
    expect(cat.body.catalog.every((c) => c.trade === 'PLUMBING')).toBe(true);
    const toolId = cat.body.catalog[0].id;

    // Request a tool for the project.
    const reqRes = await request(app)
      .post('/api/tools/requests')
      .set('Authorization', auth)
      .send({ project_id: project.id, catalog_id: toolId, quantity: 2, note: 'need it' });
    expect(reqRes.statusCode).toBe(201);
    expect(reqRes.body.request.status).toBe('REQUESTED');
    expect(Number(reqRes.body.request.company_id)).toBe(company.company_id);

    const listReq = await request(app).get('/api/tools/requests').set('Authorization', auth);
    expect(listReq.statusCode).toBe(200);
    expect(listReq.body.requests.some((r) => Number(r.id) === Number(reqRes.body.request.id))).toBe(
      true
    );

    // Register a physical asset (starts AVAILABLE = warehouse).
    const tag = `T-${Date.now()}`;
    const assetRes = await request(app)
      .post('/api/tools/assets')
      .set('Authorization', auth)
      .send({ catalog_id: toolId, asset_tag: tag });
    expect(assetRes.statusCode).toBe(201);
    expect(assetRes.body.asset.status).toBe('AVAILABLE');
    const assetId = assetRes.body.asset.id;

    // Move it to the project → ASSIGNED + a movement row.
    const moveRes = await request(app)
      .post(`/api/tools/assets/${assetId}/move`)
      .set('Authorization', auth)
      .send({ to_project_id: project.id, reason: 'issue to site' });
    expect(moveRes.statusCode).toBe(200);
    expect(moveRes.body.asset.status).toBe('ASSIGNED');
    expect(Number(moveRes.body.asset.current_project_id)).toBe(project.id);

    const { rows } = await getPool().query(
      `SELECT COUNT(*)::int AS n FROM public.tool_asset_movements WHERE asset_id = $1`,
      [assetId]
    );
    expect(rows[0].n).toBe(1);

    // Asset list (ASSIGNED) includes the moved unit.
    const assets = await request(app)
      .get('/api/tools/assets?status=ASSIGNED')
      .set('Authorization', auth);
    expect(assets.statusCode).toBe(200);
    expect(assets.body.assets.some((a) => Number(a.id) === Number(assetId))).toBe(true);
  });

  test('duplicate asset_tag in the same company is rejected (409)', async () => {
    const { company, token } = await actor();
    const auth = `Bearer ${token}`;
    const cat = await request(app).get('/api/tools/catalog').set('Authorization', auth);
    const toolId = cat.body.catalog[0].id;
    const tag = `DUP-${Date.now()}`;
    const first = await request(app)
      .post('/api/tools/assets')
      .set('Authorization', auth)
      .send({ catalog_id: toolId, asset_tag: tag });
    expect(first.statusCode).toBe(201);
    const dup = await request(app)
      .post('/api/tools/assets')
      .set('Authorization', auth)
      .send({ catalog_id: toolId, asset_tag: tag });
    expect(dup.statusCode).toBe(409);
    expect(dup.body.error).toBe('ASSET_TAG_EXISTS');
    void company;
  });

  test('invalid trade filter is rejected (400)', async () => {
    const { token } = await actor();
    const res = await request(app)
      .get('/api/tools/catalog?trade=NOPE')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('INVALID_TRADE');
  });
});
