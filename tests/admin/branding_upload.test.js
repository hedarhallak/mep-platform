// tests/admin/branding_upload.test.js — Phase 6-D-3 (Section 112, May 15, 2026).
//
// Integration tests for POST /api/super/companies/:id/branding.
// Mocks lib/spaces_client.putPublicObject so the test never actually
// uploads to DO Spaces. The image pipeline (lib/image_upload.js) is
// allowed to run for real — it's pure CPU and validates the sharp
// resize end-to-end.

'use strict';

// Mock spaces_client BEFORE app.js is required so the route module
// gets the mocked module.
jest.mock('../../lib/spaces_client', () => {
  // Hoisted-safe naming (Section 4.6 / Pitfall: jest.mock factory vars
  // must start with `mock` — case-insensitive).
  const mockPutPublicObject = jest.fn(async (key) => {
    return `https://constrai-tenant-assets.tor1.cdn.digitaloceanspaces.com/${key}`;
  });
  return {
    putPublicObject: mockPutPublicObject,
    getSpacesClient: () => ({
      client: {},
      bucket: 'constrai-tenant-assets',
      publicUrlBase: 'https://constrai-tenant-assets.tor1.cdn.digitaloceanspaces.com',
    }),
    _resetForTests: jest.fn(),
  };
});

const request = require('supertest');
const sharp = require('sharp');
const jwt = require('jsonwebtoken');
const app = require('../../app');
const { JWT_SECRET } = require('../../lib/auth_utils');
const {
  describeIfDb,
  closePool,
  getPool,
  seedCompany,
  seedUser,
  cleanupTestRows,
} = require('../helpers/db');
const { putPublicObject } = require('../../lib/spaces_client');

// Build a JWT for a SUPER_ADMIN test user.
function buildSuperAdminToken(user) {
  return jwt.sign(
    {
      user_id: String(user.id),
      username: user.username,
      employee_id: user.employee_id ? String(user.employee_id) : null,
      company_id: user.company_id ? String(user.company_id) : null,
      role: 'SUPER_ADMIN',
      must_change_pin: false,
    },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

// Build a JWT for a non-SUPER_ADMIN test user.
function buildTenantToken(user, role = 'FOREMAN') {
  return jwt.sign(
    {
      user_id: String(user.id),
      username: user.username,
      employee_id: user.employee_id ? String(user.employee_id) : null,
      company_id: user.company_id ? String(user.company_id) : null,
      role,
      must_change_pin: false,
    },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

async function makePng(width, height) {
  return sharp({
    create: { width, height, channels: 4, background: { r: 22, g: 163, b: 74, alpha: 1 } },
  })
    .png()
    .toBuffer();
}

describeIfDb('POST /api/super/companies/:id/branding — auth + RBAC', () => {
  beforeEach(() => {
    putPublicObject.mockClear();
  });

  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('rejects unauthenticated request with 401', async () => {
    const company = await seedCompany();
    const png = await makePng(200, 200);

    const res = await request(app)
      .post(`/api/super/companies/${company.company_id}/branding`)
      .set('Host', 'admin.constrai.ca')
      .attach('logo', png, 'logo.png');

    expect(res.statusCode).toBe(401);
    expect(putPublicObject).not.toHaveBeenCalled();
  });

  test('rejects non-SUPER_ADMIN with 403', async () => {
    const company = await seedCompany();
    const user = await seedUser({
      company_id: company.company_id,
      role: 'COMPANY_ADMIN',
      pin: '1234',
    });
    const token = buildTenantToken(user, 'COMPANY_ADMIN');
    const png = await makePng(200, 200);

    const res = await request(app)
      .post(`/api/super/companies/${company.company_id}/branding`)
      .set('Host', 'admin.constrai.ca')
      .set('Authorization', `Bearer ${token}`)
      .attach('logo', png, 'logo.png');

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('SUPER_ADMIN_REQUIRED');
    expect(putPublicObject).not.toHaveBeenCalled();
  });
});

describeIfDb('POST /api/super/companies/:id/branding — validation', () => {
  let saUser;
  let saToken;

  beforeEach(async () => {
    putPublicObject.mockClear();
    saUser = await seedUser({ role: 'SUPER_ADMIN', pin: 'sa-pin-1234' });
    saToken = buildSuperAdminToken(saUser);
  });

  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('returns 400 NO_CHANGES when no logo + no brand_color + no remove_logo', async () => {
    const company = await seedCompany();
    const res = await request(app)
      .post(`/api/super/companies/${company.company_id}/branding`)
      .set('Host', 'admin.constrai.ca')
      .set('Authorization', `Bearer ${saToken}`);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('NO_CHANGES');
  });

  test('returns 400 INVALID_BRAND_COLOR for malformed hex', async () => {
    const company = await seedCompany();
    const res = await request(app)
      .post(`/api/super/companies/${company.company_id}/branding`)
      .set('Host', 'admin.constrai.ca')
      .set('Authorization', `Bearer ${saToken}`)
      .field('brand_color', 'red');
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('INVALID_BRAND_COLOR');
  });

  test('returns 400 INVALID_FILE_TYPE for SVG upload', async () => {
    const company = await seedCompany();
    const res = await request(app)
      .post(`/api/super/companies/${company.company_id}/branding`)
      .set('Host', 'admin.constrai.ca')
      .set('Authorization', `Bearer ${saToken}`)
      .attach('logo', Buffer.from('<svg/>'), {
        filename: 'logo.svg',
        contentType: 'image/svg+xml',
      });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('INVALID_FILE_TYPE');
  });

  test('returns 400 IMAGE_DIMENSIONS_INVALID for too-small image', async () => {
    const company = await seedCompany();
    const tiny = await makePng(32, 32);
    const res = await request(app)
      .post(`/api/super/companies/${company.company_id}/branding`)
      .set('Host', 'admin.constrai.ca')
      .set('Authorization', `Bearer ${saToken}`)
      .attach('logo', tiny, 'tiny.png');
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('IMAGE_DIMENSIONS_INVALID');
  });

  test('returns 404 COMPANY_NOT_FOUND for non-existent id', async () => {
    const png = await makePng(200, 200);
    const res = await request(app)
      .post(`/api/super/companies/999999999/branding`)
      .set('Host', 'admin.constrai.ca')
      .set('Authorization', `Bearer ${saToken}`)
      .attach('logo', png, 'logo.png');
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('COMPANY_NOT_FOUND');
  });
});

describeIfDb('POST /api/super/companies/:id/branding — happy paths', () => {
  let saUser;
  let saToken;

  beforeEach(async () => {
    putPublicObject.mockClear();
    saUser = await seedUser({ role: 'SUPER_ADMIN', pin: 'sa-pin-1234' });
    saToken = buildSuperAdminToken(saUser);
  });

  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('uploads logo and updates brand_logo_url', async () => {
    const company = await seedCompany();
    // Set a known company_code so the key is predictable.
    await getPool().query(`UPDATE public.companies SET company_code = $1 WHERE company_id = $2`, [
      'testlogo1',
      company.company_id,
    ]);
    const png = await makePng(400, 400);

    const res = await request(app)
      .post(`/api/super/companies/${company.company_id}/branding`)
      .set('Host', 'admin.constrai.ca')
      .set('Authorization', `Bearer ${saToken}`)
      .attach('logo', png, 'logo.png');

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.company.brand_logo_url).toMatch(
      /^https:\/\/constrai-tenant-assets\.tor1\.cdn\.digitaloceanspaces\.com\/tenant-logos\/testlogo1-\d+\.png$/
    );
    expect(putPublicObject).toHaveBeenCalledTimes(1);
    // Verify the key + content type passed to Spaces.
    const [keyArg, bufferArg, contentTypeArg] = putPublicObject.mock.calls[0];
    expect(keyArg).toMatch(/^tenant-logos\/testlogo1-\d+\.png$/);
    expect(Buffer.isBuffer(bufferArg)).toBe(true);
    expect(contentTypeArg).toBe('image/png');
  });

  test('updates brand_color without a logo upload', async () => {
    const company = await seedCompany();
    const res = await request(app)
      .post(`/api/super/companies/${company.company_id}/branding`)
      .set('Host', 'admin.constrai.ca')
      .set('Authorization', `Bearer ${saToken}`)
      .field('brand_color', '#FF5722');

    expect(res.statusCode).toBe(200);
    expect(res.body.company.brand_color).toBe('#ff5722');
    expect(putPublicObject).not.toHaveBeenCalled();
  });

  test('updates both logo and brand_color in one call', async () => {
    const company = await seedCompany();
    await getPool().query(`UPDATE public.companies SET company_code = $1 WHERE company_id = $2`, [
      'testboth1',
      company.company_id,
    ]);
    const png = await makePng(300, 300);

    const res = await request(app)
      .post(`/api/super/companies/${company.company_id}/branding`)
      .set('Host', 'admin.constrai.ca')
      .set('Authorization', `Bearer ${saToken}`)
      .field('brand_color', '#16A34A')
      .attach('logo', png, 'logo.png');

    expect(res.statusCode).toBe(200);
    expect(res.body.company.brand_color).toBe('#16a34a');
    expect(res.body.company.brand_logo_url).toContain('testboth1-');
    expect(putPublicObject).toHaveBeenCalledTimes(1);
  });

  test('remove_logo=true clears brand_logo_url without uploading', async () => {
    const company = await seedCompany();
    // Pre-set a logo URL so we can verify removal.
    await getPool().query(`UPDATE public.companies SET brand_logo_url = $1 WHERE company_id = $2`, [
      'https://example.com/old-logo.png',
      company.company_id,
    ]);

    const res = await request(app)
      .post(`/api/super/companies/${company.company_id}/branding`)
      .set('Host', 'admin.constrai.ca')
      .set('Authorization', `Bearer ${saToken}`)
      .field('remove_logo', 'true');

    expect(res.statusCode).toBe(200);
    expect(res.body.company.brand_logo_url).toBeNull();
    expect(putPublicObject).not.toHaveBeenCalled();
  });

  test('rejects simultaneous upload + remove_logo with 400', async () => {
    const company = await seedCompany();
    const png = await makePng(200, 200);

    const res = await request(app)
      .post(`/api/super/companies/${company.company_id}/branding`)
      .set('Host', 'admin.constrai.ca')
      .set('Authorization', `Bearer ${saToken}`)
      .field('remove_logo', 'true')
      .attach('logo', png, 'logo.png');

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('NO_CHANGES');
    expect(putPublicObject).not.toHaveBeenCalled();
  });
});
