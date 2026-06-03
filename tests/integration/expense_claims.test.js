// tests/integration/expense_claims.test.js
//
// Section 129 — Emergency purchase claims (expense_claims): review +
// receipt-upload endpoints over /api/expense-claims.
//
// Covers:
//   * full flow: submit → list → APPROVE → PAID
//   * REJECTED requires rejection_reason; stores it + reviewer stamp
//   * invalid transitions → 409 (PAID on PENDING, APPROVE on APPROVED)
//   * receipt upload → processed JPEG lands in Spaces (mocked) under
//     receipts/<company>/ and returns the public URL
//
// Mocks lib/spaces_client.putPublicObject (same pattern as
// tests/admin/branding_upload.test.js) — the sharp pipeline runs for
// real. Auth uses a directly-signed SUPER_ADMIN token WITH company_id
// (same approach as tools.test.js) so can() passes without PIN/TOTP.

'use strict';

// Mock spaces_client BEFORE app.js is required so the route module gets
// the mocked module. Factory vars must start with `mock` (Pitfall, §4.6).
jest.mock('../../lib/spaces_client', () => {
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
    _resetForTests: () => {},
  };
});

const request = require('supertest');
const sharp = require('sharp');
const jwt = require('jsonwebtoken');
const app = require('../../app');
const { JWT_SECRET } = require('../../lib/auth_utils');
const { putPublicObject } = require('../../lib/spaces_client');
const {
  describeIfDb,
  closePool,
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

async function makePhoto(width, height) {
  return sharp({
    create: { width, height, channels: 3, background: { r: 240, g: 240, b: 235 } },
  })
    .jpeg()
    .toBuffer();
}

describeIfDb('Expense claims — review + receipt upload (/api/expense-claims)', () => {
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
    const project = await seedProject({ company_id: company.company_id });
    const token = buildToken(user, company.company_id);
    return { company, user, project, auth: `Bearer ${token}` };
  }

  async function submitClaim(auth, project, overrides = {}) {
    const res = await request(app)
      .post('/api/expense-claims')
      .set('Authorization', auth)
      .send({
        project_id: project.id,
        vendor: 'Home Depot',
        amount_cents: 4050,
        description: 'urgent fitting',
        ...overrides,
      });
    expect(res.statusCode).toBe(201);
    return res.body.claim;
  }

  test('full flow: submit → list → APPROVED → PAID', async () => {
    const { user, project, auth } = await actor();
    const claim = await submitClaim(auth, project);
    expect(claim.status).toBe('PENDING');

    const list = await request(app)
      .get('/api/expense-claims?status=PENDING')
      .set('Authorization', auth);
    expect(list.statusCode).toBe(200);
    expect(list.body.claims.some((c) => Number(c.id) === Number(claim.id))).toBe(true);

    const approve = await request(app)
      .patch(`/api/expense-claims/${claim.id}/status`)
      .set('Authorization', auth)
      .send({ status: 'APPROVED' });
    expect(approve.statusCode).toBe(200);
    expect(approve.body.claim.status).toBe('APPROVED');
    expect(String(approve.body.claim.approved_by_user_id)).toBe(String(user.id));
    expect(approve.body.claim.approved_at).toBeTruthy();

    const paid = await request(app)
      .patch(`/api/expense-claims/${claim.id}/status`)
      .set('Authorization', auth)
      .send({ status: 'PAID' });
    expect(paid.statusCode).toBe(200);
    expect(paid.body.claim.status).toBe('PAID');
    // PAID keeps the original approval stamp.
    expect(String(paid.body.claim.approved_by_user_id)).toBe(String(user.id));
  });

  test('REJECTED requires a reason, then stores it', async () => {
    const { project, auth } = await actor();
    const claim = await submitClaim(auth, project);

    const noReason = await request(app)
      .patch(`/api/expense-claims/${claim.id}/status`)
      .set('Authorization', auth)
      .send({ status: 'REJECTED' });
    expect(noReason.statusCode).toBe(400);
    expect(noReason.body.error).toBe('REJECTION_REASON_REQUIRED');

    const rejected = await request(app)
      .patch(`/api/expense-claims/${claim.id}/status`)
      .set('Authorization', auth)
      .send({ status: 'REJECTED', rejection_reason: 'No receipt attached' });
    expect(rejected.statusCode).toBe(200);
    expect(rejected.body.claim.status).toBe('REJECTED');
    expect(rejected.body.claim.rejection_reason).toBe('No receipt attached');
  });

  test('invalid transitions are rejected with 409', async () => {
    const { project, auth } = await actor();
    const claim = await submitClaim(auth, project);

    // PAID straight from PENDING — must go through APPROVED first.
    const paidEarly = await request(app)
      .patch(`/api/expense-claims/${claim.id}/status`)
      .set('Authorization', auth)
      .send({ status: 'PAID' });
    expect(paidEarly.statusCode).toBe(409);
    expect(paidEarly.body.error).toBe('INVALID_TRANSITION');
    expect(paidEarly.body.current_status).toBe('PENDING');

    // Approve once — OK. Approve again — 409.
    await request(app)
      .patch(`/api/expense-claims/${claim.id}/status`)
      .set('Authorization', auth)
      .send({ status: 'APPROVED' });
    const approveTwice = await request(app)
      .patch(`/api/expense-claims/${claim.id}/status`)
      .set('Authorization', auth)
      .send({ status: 'APPROVED' });
    expect(approveTwice.statusCode).toBe(409);

    // Unknown status value → 400.
    const bogus = await request(app)
      .patch(`/api/expense-claims/${claim.id}/status`)
      .set('Authorization', auth)
      .send({ status: 'BANANA' });
    expect(bogus.statusCode).toBe(400);
    expect(bogus.body.error).toBe('INVALID_STATUS');

    // Missing row → 404.
    const missing = await request(app)
      .patch('/api/expense-claims/999999999/status')
      .set('Authorization', auth)
      .send({ status: 'APPROVED' });
    expect(missing.statusCode).toBe(404);
  });

  test('receipt upload processes the photo and returns the Spaces URL', async () => {
    const { company, auth } = await actor();
    const photo = await makePhoto(2400, 3200); // phone-camera-ish portrait

    const res = await request(app)
      .post('/api/expense-claims/receipt')
      .set('Authorization', auth)
      .attach('receipt', photo, 'receipt.jpg');

    expect(res.statusCode).toBe(201);
    expect(res.body.receipt_url).toMatch(
      new RegExp(`/receipts/${company.company_id}/\\d+-[0-9a-f]{8}\\.jpg$`)
    );

    // The mocked uploader received a processed JPEG under the company prefix.
    expect(putPublicObject).toHaveBeenCalledTimes(1);
    const [key, buffer, contentType] = putPublicObject.mock.calls[0];
    expect(key.startsWith(`receipts/${company.company_id}/`)).toBe(true);
    expect(contentType).toBe('image/jpeg');
    // Downscaled to fit within 1600×1600.
    const outMeta = await sharp(buffer).metadata();
    expect(Math.max(outMeta.width, outMeta.height)).toBeLessThanOrEqual(1600);
    expect(outMeta.format).toBe('jpeg');
  });

  test('receipt upload rejects a tiny/invalid image with 400', async () => {
    const { auth } = await actor();
    const tiny = await makePhoto(50, 50); // below RECEIPT_MIN_DIMENSION

    const res = await request(app)
      .post('/api/expense-claims/receipt')
      .set('Authorization', auth)
      .attach('receipt', tiny, 'tiny.jpg');
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('IMAGE_DIMENSIONS_INVALID');

    const noFile = await request(app)
      .post('/api/expense-claims/receipt')
      .set('Authorization', auth);
    expect(noFile.statusCode).toBe(400);
    expect(noFile.body.error).toBe('NO_FILE');
  });
});
