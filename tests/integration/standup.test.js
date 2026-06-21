// Phase 34 — Daily standup endpoint tests.
//
// /api/standup/tomorrow returns the projects + workers planned for
// tomorrow's standup huddle. Permission-gated by standup.manage. On
// an empty company (no assignments), returns empty arrays.

const request = require('supertest');
const app = require('../../app');
const {
  describeIfDb,
  closePool,
  seedCompany,
  seedUser,
  seedProject,
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

describeIfDb('Standup — /api/standup/tomorrow', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('GET /tomorrow as COMPANY_ADMIN with no assignments returns 200', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .get('/api/standup/tomorrow')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('GET /tomorrow without standup.manage returns 403', async () => {
    const company = await seedCompany();
    const worker = await seedUser({ company_id: company.company_id, role: 'WORKER' });
    const { token } = await loginUser(worker);

    const res = await request(app)
      .get('/api/standup/tomorrow')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(403);
    expect(res.body.permission).toBe('standup.manage');
  });
});

// Phase 53 — standup mutation surfaces (POST /session, POST /session/:id/complete)
// + GET /materials/:project_id.
//
// Happy paths require a fully seeded project + foreman + assignment_requests
// chain — left to e2e. Here we pin only the RBAC denials and the
// "session not found" branch on /session/:id/complete (which exercises
// the company-scoped UPDATE filter — important to prevent cross-tenant
// session mutation).
describeIfDb('Standup — POST /api/standup/session', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('POST /session without standup.manage returns 403', async () => {
    const company = await seedCompany();
    const worker = await seedUser({ company_id: company.company_id, role: 'WORKER' });
    const { token } = await loginUser(worker);

    const res = await request(app)
      .post('/api/standup/session')
      .set('Authorization', `Bearer ${token}`)
      .send({ project_id: 1 });

    expect(res.statusCode).toBe(403);
    expect(res.body.permission).toBe('standup.manage');
  });
});

describeIfDb('Standup — POST /api/standup/session/:id/complete', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('POST /session/:id/complete with non-existent id returns 404 SESSION_NOT_FOUND', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .post('/api/standup/session/9999999/complete')
      .set('Authorization', `Bearer ${token}`)
      .send({ note: 'wrap-up' });

    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({ ok: false, error: 'SESSION_NOT_FOUND' });
  });

  test('POST /session/:id/complete without standup.manage returns 403', async () => {
    const company = await seedCompany();
    const worker = await seedUser({ company_id: company.company_id, role: 'WORKER' });
    const { token } = await loginUser(worker);

    const res = await request(app)
      .post('/api/standup/session/1/complete')
      .set('Authorization', `Bearer ${token}`)
      .send({ note: 'x' });

    expect(res.statusCode).toBe(403);
    expect(res.body.permission).toBe('standup.manage');
  });
});

describeIfDb('Standup — GET /api/standup/materials/:project_id', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('GET /materials/:project_id without standup.manage returns 403', async () => {
    const company = await seedCompany();
    const worker = await seedUser({ company_id: company.company_id, role: 'WORKER' });
    const { token } = await loginUser(worker);

    const res = await request(app)
      .get('/api/standup/materials/1')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(403);
    expect(res.body.permission).toBe('standup.manage');
  });
});

// §151.2 — standup happy paths: session create+complete + materials request/items
// CRUD. COMPANY_ADMIN holds standup.manage. These exercise the bulk of standup.js
// (sessions + materials handlers) that the RBAC-only tests above skip.
describeIfDb('Standup — session + materials happy paths', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  async function adminCtx() {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const project = await seedProject({ company_id: company.company_id });
    const { token } = await loginUser(admin);
    return { company, admin, project, token };
  }

  test('POST /session creates an OPEN session, then /complete marks it COMPLETED', async () => {
    const { project, token } = await adminCtx();

    const open = await request(app)
      .post('/api/standup/session')
      .set('Authorization', `Bearer ${token}`)
      .send({ project_id: project.id });
    expect(open.statusCode).toBe(200);
    expect(open.body.ok).toBe(true);
    expect(open.body.session.status).toBe('OPEN');

    const sessionId = open.body.session.id;
    const done = await request(app)
      .post(`/api/standup/session/${sessionId}/complete`)
      .set('Authorization', `Bearer ${token}`)
      .send({ note: 'all set' });
    expect(done.statusCode).toBe(200);
    expect(done.body.session.status).toBe('COMPLETED');
    expect(done.body.session.note).toBe('all set');

    // ON CONFLICT path: posting the same session again returns 200 (upsert).
    const again = await request(app)
      .post('/api/standup/session')
      .set('Authorization', `Bearer ${token}`)
      .send({ project_id: project.id });
    expect(again.statusCode).toBe(200);
  });

  test('GET /materials creates the request once (created:true) then returns it (created:false)', async () => {
    const { project, token } = await adminCtx();

    const first = await request(app)
      .get(`/api/standup/materials/${project.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(first.statusCode).toBe(200);
    expect(first.body.created).toBe(true);
    expect(first.body.request).toHaveProperty('id');
    expect(first.body.request.items).toEqual([]);

    const second = await request(app)
      .get(`/api/standup/materials/${project.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(second.statusCode).toBe(200);
    expect(second.body.created).toBe(false);
  });

  test('material item lifecycle: add → edit → delete', async () => {
    const { project, token } = await adminCtx();
    const reqRes = await request(app)
      .get(`/api/standup/materials/${project.id}`)
      .set('Authorization', `Bearer ${token}`);
    const requestId = reqRes.body.request.id;

    // add
    const add = await request(app)
      .post(`/api/standup/materials/${requestId}/items`)
      .set('Authorization', `Bearer ${token}`)
      .send({ item_name: 'Copper pipe', quantity: 10, unit: 'm', note: 'half-inch' });
    expect(add.statusCode).toBe(200);
    expect(add.body.item.item_name).toBe('Copper pipe');
    const itemId = add.body.item.id;

    // edit
    const edit = await request(app)
      .patch(`/api/standup/materials/${requestId}/items/${itemId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ quantity: 25 });
    expect(edit.statusCode).toBe(200);
    expect(Number(edit.body.item.quantity)).toBe(25);

    // delete
    const del = await request(app)
      .delete(`/api/standup/materials/${requestId}/items/${itemId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(del.statusCode).toBe(200);
    expect(del.body.ok).toBe(true);
  });

  test('add-item validation: missing name / bad qty / missing unit → 400', async () => {
    const { project, token } = await adminCtx();
    const reqRes = await request(app)
      .get(`/api/standup/materials/${project.id}`)
      .set('Authorization', `Bearer ${token}`);
    const requestId = reqRes.body.request.id;

    const noName = await request(app)
      .post(`/api/standup/materials/${requestId}/items`)
      .set('Authorization', `Bearer ${token}`)
      .send({ quantity: 1, unit: 'ea' });
    expect(noName.statusCode).toBe(400);
    expect(noName.body.error).toBe('ITEM_NAME_REQUIRED');

    const badQty = await request(app)
      .post(`/api/standup/materials/${requestId}/items`)
      .set('Authorization', `Bearer ${token}`)
      .send({ item_name: 'X', quantity: 0, unit: 'ea' });
    expect(badQty.statusCode).toBe(400);
    expect(badQty.body.error).toBe('INVALID_QUANTITY');

    const noUnit = await request(app)
      .post(`/api/standup/materials/${requestId}/items`)
      .set('Authorization', `Bearer ${token}`)
      .send({ item_name: 'X', quantity: 1 });
    expect(noUnit.statusCode).toBe(400);
    expect(noUnit.body.error).toBe('UNIT_REQUIRED');
  });

  test('add-item to a non-existent request → 404 REQUEST_NOT_FOUND', async () => {
    const { token } = await adminCtx();
    const res = await request(app)
      .post('/api/standup/materials/9999999/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ item_name: 'X', quantity: 1, unit: 'ea' });
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('REQUEST_NOT_FOUND');
  });
});
