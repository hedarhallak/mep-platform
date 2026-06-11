// tests/integration/material_requests_phase75b.test.js — Phase 75b
// (May 2026, Section 40 routes coverage push, batch 2 of 5:
// material_requests.js).
//
// Targets the previously-uncovered branches in routes/material_requests.js
// (15 endpoints). 19 tests across 8 describe blocks:
//   - POST   /requests              (5 — 4 validation + 201 happy)
//   - GET    /requests/:id          (2 — 404 + 200)
//   - PATCH  /requests/:id/cancel   (3 — 404 + 409 + 200)
//   - PATCH  /requests/:id/review   (2 — 404 + 200)
//   - GET    /pdf-data              (1 — 400 missing request_ids)
//   - POST   /returns               (3 — 2 validation + 201 happy)
//   - GET    /purchase-orders/:id   (1 — 404 NOT_FOUND)
//   - POST   /send-order            (2 — 2 validation)
//
// All tests gated by `describeIfDb` — skip locally when TEST_DATABASE_URL
// is unset, run fully in CI. Pattern mirrors Phase 75a (assignments).

'use strict';

const request = require('supertest');
const app = require('../../app');
const {
  describeIfDb,
  closePool,
  getPool,
  seedCompany,
  seedUser,
  seedEmployee,
  seedEmployeeProfile,
  seedProject,
  seedMaterialRequest,
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

// Seed an admin with a linked employee_id so resolveEmployeeId() in routes
// returns a real employee row — needed for POST /requests + POST /returns
// and for any route reading req.user.employee_id.
async function seedAdminWithEmployee(companyId) {
  const emp = await seedEmployee({ company_id: companyId });
  await seedEmployeeProfile({ employee_id: emp.id });
  const admin = await seedUser({
    company_id: companyId,
    employee_id: emp.id,
    role: 'COMPANY_ADMIN',
  });
  return { admin, emp };
}

// Seed a material_request_items row for a given request — used so the
// /requests/:id GET test sees a non-empty items array and so /review
// happy-path can update an item.
async function seedMaterialRequestItem(requestId, overrides = {}) {
  const pool = getPool();
  const itemName = overrides.item_name || 'test_item';
  const quantity = overrides.quantity || 5;
  const unit = overrides.unit || 'pcs';
  const { rows } = await pool.query(
    `INSERT INTO public.material_request_items
       (request_id, item_name, quantity, unit)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [requestId, itemName, quantity, unit]
  );
  return rows[0];
}

// ──────────────────────────────────────────────────────────────────
describeIfDb('POST /api/materials/requests', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('400 PROJECT_REQUIRED when body lacks project_id', async () => {
    const company = await seedCompany();
    const { admin } = await seedAdminWithEmployee(company.company_id);
    const { token } = await loginUser(admin);

    const res = await request(app)
      .post('/api/materials/requests')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ item_name: 'foo', quantity: 1 }] });

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ ok: false, error: 'PROJECT_REQUIRED' });
  });

  test('400 ITEMS_REQUIRED when items array is empty', async () => {
    const company = await seedCompany();
    const { admin } = await seedAdminWithEmployee(company.company_id);
    const project = await seedProject({ company_id: company.company_id });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .post('/api/materials/requests')
      .set('Authorization', `Bearer ${token}`)
      .send({ project_id: project.id, items: [] });

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ ok: false, error: 'ITEMS_REQUIRED' });
  });

  test('400 ITEM_NAME_REQUIRED when an item has empty name', async () => {
    const company = await seedCompany();
    const { admin } = await seedAdminWithEmployee(company.company_id);
    const project = await seedProject({ company_id: company.company_id });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .post('/api/materials/requests')
      .set('Authorization', `Bearer ${token}`)
      .send({
        project_id: project.id,
        items: [{ item_name: '   ', quantity: 1 }],
      });

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ ok: false, error: 'ITEM_NAME_REQUIRED' });
  });

  test('400 ITEM_QUANTITY_REQUIRED when an item has quantity 0', async () => {
    const company = await seedCompany();
    const { admin } = await seedAdminWithEmployee(company.company_id);
    const project = await seedProject({ company_id: company.company_id });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .post('/api/materials/requests')
      .set('Authorization', `Bearer ${token}`)
      .send({
        project_id: project.id,
        items: [{ item_name: 'pipe', quantity: 0 }],
      });

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ ok: false, error: 'ITEM_QUANTITY_REQUIRED' });
  });

  test('201 happy path — request created with items and catalog upsert', async () => {
    const company = await seedCompany();
    const { admin } = await seedAdminWithEmployee(company.company_id);
    const project = await seedProject({ company_id: company.company_id });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .post('/api/materials/requests')
      .set('Authorization', `Bearer ${token}`)
      .send({
        project_id: project.id,
        items: [
          { item_name: 'PVC pipe 1/2"', quantity: 10, unit: 'm' },
          { item_name: 'elbow 90', quantity: 4 },
        ],
        note: 'urgent',
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.request).toBeDefined();
    expect(res.body.request.note).toBe('urgent');
    expect(Array.isArray(res.body.request.items)).toBe(true);
    expect(res.body.request.items).toHaveLength(2);
  });
});

// ──────────────────────────────────────────────────────────────────
describeIfDb('GET /api/materials/requests/:id', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('404 NOT_FOUND for non-existent request id', async () => {
    const company = await seedCompany();
    const { admin } = await seedAdminWithEmployee(company.company_id);
    const { token } = await loginUser(admin);

    const res = await request(app)
      .get('/api/materials/requests/9999999')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({ ok: false, error: 'NOT_FOUND' });
  });

  test('200 happy path — returns request with items array', async () => {
    const company = await seedCompany();
    const { admin, emp } = await seedAdminWithEmployee(company.company_id);
    const project = await seedProject({ company_id: company.company_id });
    const reqRow = await seedMaterialRequest({
      company_id: company.company_id,
      project_id: project.id,
      requested_by: emp.id,
      status: 'PENDING',
    });
    await seedMaterialRequestItem(reqRow.id, { item_name: 'cable', quantity: 50 });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .get(`/api/materials/requests/${reqRow.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Number(res.body.request.id)).toBe(reqRow.id);
    expect(Array.isArray(res.body.request.items)).toBe(true);
    expect(res.body.request.items).toHaveLength(1);
    expect(res.body.request.items[0].item_name).toBe('cable');
  });
});

// ──────────────────────────────────────────────────────────────────
describeIfDb('PATCH /api/materials/requests/:id/cancel', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('404 NOT_FOUND for non-existent id', async () => {
    const company = await seedCompany();
    const { admin } = await seedAdminWithEmployee(company.company_id);
    const { token } = await loginUser(admin);

    const res = await request(app)
      .patch('/api/materials/requests/9999999/cancel')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({ ok: false, error: 'NOT_FOUND' });
  });

  test('409 CANNOT_CANCEL when request status is SENT (not PENDING)', async () => {
    const company = await seedCompany();
    const { admin, emp } = await seedAdminWithEmployee(company.company_id);
    const project = await seedProject({ company_id: company.company_id });
    const sent = await seedMaterialRequest({
      company_id: company.company_id,
      project_id: project.id,
      requested_by: emp.id,
      status: 'SENT',
    });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .patch(`/api/materials/requests/${sent.id}/cancel`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ ok: false, error: 'CANNOT_CANCEL' });
  });

  test('200 happy path — manager cancels a PENDING request', async () => {
    const company = await seedCompany();
    const { admin, emp } = await seedAdminWithEmployee(company.company_id);
    const project = await seedProject({ company_id: company.company_id });
    const pending = await seedMaterialRequest({
      company_id: company.company_id,
      project_id: project.id,
      requested_by: emp.id,
      status: 'PENDING',
    });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .patch(`/api/materials/requests/${pending.id}/cancel`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.request.status).toBe('CANCELLED');
    expect(Number(res.body.request.id)).toBe(pending.id);
  });
});

// ──────────────────────────────────────────────────────────────────
describeIfDb('PATCH /api/materials/requests/:id/review', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('404 NOT_FOUND for non-existent id', async () => {
    const company = await seedCompany();
    const { admin } = await seedAdminWithEmployee(company.company_id);
    const { token } = await loginUser(admin);

    const res = await request(app)
      .patch('/api/materials/requests/9999999/review')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'REVIEWED' });

    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({ ok: false, error: 'NOT_FOUND' });
  });

  test('200 happy path — sets status to REVIEWED + updates item splits', async () => {
    const company = await seedCompany();
    const { admin, emp } = await seedAdminWithEmployee(company.company_id);
    const project = await seedProject({ company_id: company.company_id });
    const reqRow = await seedMaterialRequest({
      company_id: company.company_id,
      project_id: project.id,
      requested_by: emp.id,
      status: 'PENDING',
    });
    const item = await seedMaterialRequestItem(reqRow.id, {
      item_name: 'cement bag',
      quantity: 20,
    });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .patch(`/api/materials/requests/${reqRow.id}/review`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        status: 'REVIEWED',
        items: [
          {
            id: item.id,
            qty_from_surplus: 5,
            qty_from_supplier: 15,
          },
        ],
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.request.status).toBe('REVIEWED');
  });
});

// ──────────────────────────────────────────────────────────────────
describeIfDb('GET /api/materials/pdf-data', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('400 REQUEST_IDS_REQUIRED when query has no request_ids', async () => {
    const company = await seedCompany();
    const { admin } = await seedAdminWithEmployee(company.company_id);
    const { token } = await loginUser(admin);

    const res = await request(app)
      .get('/api/materials/pdf-data')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ ok: false, error: 'REQUEST_IDS_REQUIRED' });
  });

  // Security regression (DECISIONS §142 — tenant-isolation audit, Finding #1):
  // material_request_items has no company_id column and no RLS policy, so the
  // merged-items query MUST scope through material_requests.company_id. Without
  // it, a caller could pass another tenant's request_ids and read their line
  // items. These two tests pin the fix: own-company items load; cross-tenant
  // request_ids return zero items.
  test('200 returns own-company line items (positive control)', async () => {
    const company = await seedCompany();
    const { admin } = await seedAdminWithEmployee(company.company_id);
    const mr = await seedMaterialRequest({ company_id: company.company_id });
    await seedMaterialRequestItem(mr.id, { item_name: 'own_copper_pipe', quantity: 7 });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .get(`/api/materials/pdf-data?request_ids=${mr.id}&supplier_id=procurement`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    const names = (res.body.pdf_data?.items || []).map((i) => i.item_name);
    expect(names).toContain('own_copper_pipe');
  });

  test('does NOT leak another company line items via foreign request_ids', async () => {
    // Victim company B with a material request + a distinctive line item.
    const victim = await seedCompany();
    const victimReq = await seedMaterialRequest({ company_id: victim.company_id });
    await seedMaterialRequestItem(victimReq.id, { item_name: 'secret_victim_item', quantity: 99 });

    // Attacker company A (different tenant) with print permission.
    const attackerCo = await seedCompany();
    const { admin: attacker } = await seedAdminWithEmployee(attackerCo.company_id);
    const { token } = await loginUser(attacker);

    const res = await request(app)
      .get(`/api/materials/pdf-data?request_ids=${victimReq.id}&supplier_id=procurement`)
      .set('Authorization', `Bearer ${token}`);

    // Request succeeds for the attacker's own tenant context, but the victim's
    // items must NOT appear — the company_id-scoped JOIN filters them out.
    expect(res.statusCode).toBe(200);
    const names = (res.body.pdf_data?.items || []).map((i) => i.item_name);
    expect(names).not.toContain('secret_victim_item');
    expect(res.body.pdf_data.items).toHaveLength(0);
  });
});

// ──────────────────────────────────────────────────────────────────
describeIfDb('POST /api/materials/returns', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('400 PROJECT_REQUIRED when body lacks project_id', async () => {
    const company = await seedCompany();
    const { admin } = await seedAdminWithEmployee(company.company_id);
    const { token } = await loginUser(admin);

    const res = await request(app)
      .post('/api/materials/returns')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ item_name: 'leftover', quantity: 5 }] });

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ ok: false, error: 'PROJECT_REQUIRED' });
  });

  test('400 ITEMS_REQUIRED when body has empty items array', async () => {
    const company = await seedCompany();
    const { admin } = await seedAdminWithEmployee(company.company_id);
    const project = await seedProject({ company_id: company.company_id });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .post('/api/materials/returns')
      .set('Authorization', `Bearer ${token}`)
      .send({ project_id: project.id, items: [] });

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ ok: false, error: 'ITEMS_REQUIRED' });
  });

  test('201 happy path — surplus declared with qty_available = quantity', async () => {
    const company = await seedCompany();
    const { admin } = await seedAdminWithEmployee(company.company_id);
    const project = await seedProject({ company_id: company.company_id });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .post('/api/materials/returns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        project_id: project.id,
        items: [
          { item_name: 'spare wire', quantity: 12, unit: 'm' },
          { item_name: 'extra screws', quantity: 50 },
        ],
        note: 'leftover from phase 1',
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.return).toBeDefined();
    expect(Array.isArray(res.body.return.items)).toBe(true);
    expect(res.body.return.items).toHaveLength(2);
    // qty_available is seeded equal to quantity on insert
    expect(Number(res.body.return.items[0].qty_available)).toBe(12);
  });
});

// ──────────────────────────────────────────────────────────────────
describeIfDb('GET /api/materials/purchase-orders/:id', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('404 NOT_FOUND for non-existent purchase order id', async () => {
    const company = await seedCompany();
    const { admin } = await seedAdminWithEmployee(company.company_id);
    const { token } = await loginUser(admin);

    const res = await request(app)
      .get('/api/materials/purchase-orders/9999999')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({ ok: false, error: 'NOT_FOUND' });
  });
});

// ──────────────────────────────────────────────────────────────────
describeIfDb('POST /api/materials/send-order', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('400 REQUEST_IDS_REQUIRED when body has empty request_ids', async () => {
    const company = await seedCompany();
    const { admin } = await seedAdminWithEmployee(company.company_id);
    const { token } = await loginUser(admin);

    const res = await request(app)
      .post('/api/materials/send-order')
      .set('Authorization', `Bearer ${token}`)
      .send({ request_ids: [], items: [{ item_name: 'x', qty: 1 }] });

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ ok: false, error: 'REQUEST_IDS_REQUIRED' });
  });

  test('400 ITEMS_REQUIRED when body has empty items array', async () => {
    const company = await seedCompany();
    const { admin } = await seedAdminWithEmployee(company.company_id);
    const { token } = await loginUser(admin);

    const res = await request(app)
      .post('/api/materials/send-order')
      .set('Authorization', `Bearer ${token}`)
      .send({ request_ids: [1], items: [] });

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ ok: false, error: 'ITEMS_REQUIRED' });
  });
});
