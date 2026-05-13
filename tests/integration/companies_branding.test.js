// tests/integration/companies_branding.test.js
//
// Phase 6 / Piece 6-B — public tenant branding lookup.
//
// Covers GET /api/companies/:code/branding (routes/public_branding.js).
// The endpoint is anonymous (no Authorization header) and lives on
// mountPublicRoutes(), so it should answer identically from both the
// admin Host (admin.constrai.ca) and the tenant Host (app.constrai.ca).
//
// What we pin:
//   1. Happy path — branding populated, response shape matches spec.
//   2. Happy path — branding NULL, NULL values pass through (not defaulted).
//   3. 400 for malformed :code (regex guard fires before DB).
//   4. 404 for unknown :code.
//   5. 404 for SUSPENDED tenant (status filter masks existence).
//   6. Cache-Control header is set to `public, max-age=300`.
//   7. Endpoint is reachable from BOTH admin Host AND tenant Host.
//
// Anti-pattern reminder (CLAUDE Section 4.6 / Pitfall #28): the endpoint
// uses superPool internally because public.companies is RLS-strict. Without
// superPool, an anonymous request on prod would have no `app.company_id`
// GUC set and the policy would filter the row out → 404 even when the row
// exists. In CI the regular pool connects as `postgres` (superuser, bypasses
// RLS), so these tests cannot directly catch a missing-superPool regression
// — that has to be caught by the smoke tests in tests/super_pool.test.js
// and by manual prod smoke after deploy.

const request = require('supertest');
const app = require('../../app');
const { adminRequest, tenantRequest } = require('../helpers/admin_request');
const { describeIfDb, getPool, closePool, cleanupTestRows } = require('../helpers/db');

// Helper: insert a company directly so we can choose the branding fields and
// status. seedCompany() in helpers/db.js doesn't accept those overrides yet
// (and intentionally — keeping the helper signature stable across PRs).
let _codeSeq = 0;
async function insertBrandedCompany({
  status = 'ACTIVE',
  brand_color = null,
  brand_logo_url = null,
} = {}) {
  const pool = getPool();
  const tag = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const name = `test_co_${tag}`;
  // company_code: prod's generateCompanyCode() emits 3 letters + 4 digits
  // ("ACM1234"). For tests we need a much larger codespace to avoid collisions
  // across the ~9 inserts in this file. The regex `^[A-Z0-9_-]{3,32}$` accepts
  // 32-char codes with underscores, so we use a monotonic sequence + 6-digit
  // timestamp slice — guaranteed unique within one run and across parallel
  // workers (sequence is per-process; timestamp slice differentiates workers).
  _codeSeq += 1;
  const code = `T${(Date.now() % 1_000_000).toString().padStart(6, '0')}S${_codeSeq}`;
  const { rows } = await pool.query(
    `INSERT INTO public.companies
       (name, company_code, status, plan, brand_color, brand_logo_url)
     VALUES ($1, $2, $3, 'BASIC', $4, $5)
     RETURNING company_id, company_code, name, status, brand_color, brand_logo_url`,
    [name, code, status, brand_color, brand_logo_url]
  );
  return rows[0];
}

describeIfDb('GET /api/companies/:code/branding — public branding lookup', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  // ──────────────────────────────────────────────────────────────────────
  // Happy paths
  // ──────────────────────────────────────────────────────────────────────

  test('returns branding fields for an ACTIVE company with custom colors', async () => {
    const company = await insertBrandedCompany({
      status: 'ACTIVE',
      brand_color: '#FF6600',
      brand_logo_url: 'https://cdn.example.test/logos/acme.svg',
    });

    const res = await request(app).get(`/api/companies/${company.company_code}/branding`);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      branding: {
        company_name: company.name,
        brand_color: '#FF6600',
        brand_logo_url: 'https://cdn.example.test/logos/acme.svg',
      },
    });
  });

  test('returns NULL brand fields as-is when tenant has not customized', async () => {
    // Doubles as a superPool regression guard — see file header.
    const company = await insertBrandedCompany({
      status: 'ACTIVE',
      brand_color: null,
      brand_logo_url: null,
    });

    const res = await request(app).get(`/api/companies/${company.company_code}/branding`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.branding).toEqual({
      company_name: company.name,
      brand_color: null,
      brand_logo_url: null,
    });
  });

  test('returns branding for a TRIAL company (TRIAL is publicly reachable like ACTIVE)', async () => {
    const company = await insertBrandedCompany({
      status: 'TRIAL',
      brand_color: '#123456',
      brand_logo_url: null,
    });

    const res = await request(app).get(`/api/companies/${company.company_code}/branding`);

    expect(res.statusCode).toBe(200);
    expect(res.body.branding.brand_color).toBe('#123456');
  });

  // ──────────────────────────────────────────────────────────────────────
  // Caching
  // ──────────────────────────────────────────────────────────────────────

  test('sets Cache-Control: public, max-age=300 on successful responses', async () => {
    const company = await insertBrandedCompany({ status: 'ACTIVE' });
    const res = await request(app).get(`/api/companies/${company.company_code}/branding`);
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=300');
  });

  // ──────────────────────────────────────────────────────────────────────
  // Validation guard (400)
  // ──────────────────────────────────────────────────────────────────────

  test('rejects a malformed :code with 400 INVALID_COMPANY_CODE', async () => {
    // Lowercase, contains a space, way too long — three flavors of bad input.
    const bad = ["'OR 1=1", 'abc 123', 'X'.repeat(64)];
    for (const code of bad) {
      const res = await request(app).get(`/api/companies/${encodeURIComponent(code)}/branding`);
      expect(res.statusCode).toBe(400);
      expect(res.body).toMatchObject({ ok: false, error: 'INVALID_COMPANY_CODE' });
    }
  });

  test('resolves a stored UPPERCASE code via a lowercase URL (case-insensitive lookup)', async () => {
    // URLs are conventionally lowercase — frontend bootstrap might pass
    // `acm1234` even though the canonical stored code is `ACM1234`. The
    // route's regex accepts both cases on the wire, and the SQL query
    // does `LOWER(company_code) = LOWER($1)`, so either direction resolves.
    const company = await insertBrandedCompany({ status: 'ACTIVE' });
    const res = await request(app).get(
      `/api/companies/${company.company_code.toLowerCase()}/branding`
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.branding.company_name).toBe(company.name);
  });

  test('resolves a stored lowercase code via an UPPERCASE URL (legacy "mep" data shape)', async () => {
    // Regression guard for the prod smoke-test that surfaced this on May 13:
    // the original "mep" tenant predates generateCompanyCode() and is stored
    // with a 3-char lowercase code. Without case-insensitive SQL, a request
    // for /api/companies/MEP/branding 404s even though the row exists. Insert
    // a lowercase company here and confirm both case directions resolve.
    const pool = getPool();
    _codeSeq += 1;
    const lowerCode = `t${(Date.now() % 1_000_000).toString().padStart(6, '0')}s${_codeSeq}`;
    const name = `test_co_lower_${Date.now()}`;
    await pool.query(
      `INSERT INTO public.companies
         (name, company_code, status, plan, brand_color)
       VALUES ($1, $2, 'ACTIVE', 'BASIC', '#445566')`,
      [name, lowerCode]
    );

    const upperRes = await request(app).get(`/api/companies/${lowerCode.toUpperCase()}/branding`);
    expect(upperRes.statusCode).toBe(200);
    expect(upperRes.body.branding.company_name).toBe(name);
    expect(upperRes.body.branding.brand_color).toBe('#445566');

    const lowerRes = await request(app).get(`/api/companies/${lowerCode}/branding`);
    expect(lowerRes.statusCode).toBe(200);
    expect(lowerRes.body.branding.company_name).toBe(name);
  });

  // ──────────────────────────────────────────────────────────────────────
  // Not found / hidden statuses (404)
  // ──────────────────────────────────────────────────────────────────────

  test('returns 404 COMPANY_NOT_FOUND for an unknown :code', async () => {
    // Valid shape, no matching row.
    const res = await request(app).get('/api/companies/ZZZ9999/branding');
    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({ ok: false, error: 'COMPANY_NOT_FOUND' });
  });

  test('returns 404 for a SUSPENDED company (status filter hides it from public view)', async () => {
    const company = await insertBrandedCompany({
      status: 'SUSPENDED',
      brand_color: '#000000',
    });
    const res = await request(app).get(`/api/companies/${company.company_code}/branding`);
    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({ ok: false, error: 'COMPANY_NOT_FOUND' });
  });

  // ──────────────────────────────────────────────────────────────────────
  // vhost coverage — public on both portals
  // ──────────────────────────────────────────────────────────────────────

  test('is reachable from the admin Host (admin.constrai.ca)', async () => {
    const company = await insertBrandedCompany({ status: 'ACTIVE', brand_color: '#ABCDEF' });
    const res = await adminRequest(app).get(`/api/companies/${company.company_code}/branding`);
    expect(res.statusCode).toBe(200);
    expect(res.body.branding.brand_color).toBe('#ABCDEF');
  });

  test('is reachable from the tenant Host (app.constrai.ca)', async () => {
    const company = await insertBrandedCompany({ status: 'ACTIVE', brand_color: '#FEDCBA' });
    const res = await tenantRequest(app).get(`/api/companies/${company.company_code}/branding`);
    expect(res.statusCode).toBe(200);
    expect(res.body.branding.brand_color).toBe('#FEDCBA');
  });
});
