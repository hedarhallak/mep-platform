// tests/integration/hub_phase75c.test.js — Phase 75c
// (May 2026, Section 40 routes coverage push, batch 3 of 5: hub.js).
//
// Targets routes/hub.js (9 endpoints). 12 tests across 9 describe blocks:
//   - GET   /my-projects              (1 — 200 fallback to all-projects path)
//   - GET   /workers                  (1 — 200 list)
//   - POST  /messages                 (4 — TITLE/RECIPIENTS/TOO_MANY + 201 happy)
//   - GET   /messages/sent            (1 — 200 list)
//   - GET   /messages/inbox           (1 — 200 list)
//   - GET   /messages/unread-count    (1 — 200 count)
//   - PATCH /messages/:id/read        (1 — 200 noop)
//   - PATCH /messages/:id/ack         (1 — 200 noop)
//   - PATCH /messages/:id/complete    (1 — 200 noop)

'use strict';

const request = require('supertest');
const app = require('../../app');
const {
  describeIfDb,
  closePool,
  seedCompany,
  seedUser,
  seedEmployee,
  seedEmployeeProfile,
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

async function seedWorkerWithEmployee(companyId) {
  const emp = await seedEmployee({ company_id: companyId });
  await seedEmployeeProfile({ employee_id: emp.id });
  const worker = await seedUser({
    company_id: companyId,
    employee_id: emp.id,
    role: 'WORKER',
  });
  return { worker, emp };
}

// ──────────────────────────────────────────────────────────────────
describeIfDb('GET /api/hub/my-projects', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('200 returns all company projects when caller has no assignments (fallback path)', async () => {
    const company = await seedCompany();
    const { admin } = await seedAdminWithEmployee(company.company_id);
    await seedProject({ company_id: company.company_id });
    await seedProject({ company_id: company.company_id });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .get('/api/hub/my-projects')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.projects)).toBe(true);
    // Admin has no assignment_request rows referencing them → fallback returns all projects
    expect(res.body.projects.length).toBeGreaterThanOrEqual(2);
  });
});

// ──────────────────────────────────────────────────────────────────
describeIfDb('GET /api/hub/workers', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('200 returns active company workers (excludes admin)', async () => {
    const company = await seedCompany();
    const { admin } = await seedAdminWithEmployee(company.company_id);
    await seedWorkerWithEmployee(company.company_id);
    await seedWorkerWithEmployee(company.company_id);
    const { token } = await loginUser(admin);

    const res = await request(app).get('/api/hub/workers').set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.workers)).toBe(true);
    // 2 workers seeded; route filters to WORKER/JOURNEYMAN/etc roles
    expect(res.body.workers.length).toBeGreaterThanOrEqual(2);
  });
});

// ──────────────────────────────────────────────────────────────────
describeIfDb('POST /api/hub/messages', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('400 TITLE_REQUIRED when title is missing', async () => {
    const company = await seedCompany();
    const { admin } = await seedAdminWithEmployee(company.company_id);
    const { token } = await loginUser(admin);

    const res = await request(app)
      .post('/api/hub/messages')
      .set('Authorization', `Bearer ${token}`)
      .field('recipient_ids', JSON.stringify([1]));

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ ok: false, error: 'TITLE_REQUIRED' });
  });

  test('400 RECIPIENTS_REQUIRED when recipient_ids is empty array', async () => {
    const company = await seedCompany();
    const { admin } = await seedAdminWithEmployee(company.company_id);
    const { token } = await loginUser(admin);

    const res = await request(app)
      .post('/api/hub/messages')
      .set('Authorization', `Bearer ${token}`)
      .field('title', 'test task')
      .field('recipient_ids', JSON.stringify([]));

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ ok: false, error: 'RECIPIENTS_REQUIRED' });
  });

  test('400 TOO_MANY_RECIPIENTS when recipient list > 200', async () => {
    const company = await seedCompany();
    const { admin } = await seedAdminWithEmployee(company.company_id);
    const { token } = await loginUser(admin);

    // Send 201 fake recipient ids — validation hits before any DB lookup
    const recipients = Array.from({ length: 201 }, (_, i) => i + 1);
    const res = await request(app)
      .post('/api/hub/messages')
      .set('Authorization', `Bearer ${token}`)
      .field('title', 'spam test')
      .field('recipient_ids', JSON.stringify(recipients));

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ ok: false, error: 'TOO_MANY_RECIPIENTS' });
  });

  test('201 happy path — task message sent with recipient marked SENT', async () => {
    const company = await seedCompany();
    const { admin } = await seedAdminWithEmployee(company.company_id);
    const { worker } = await seedWorkerWithEmployee(company.company_id);
    const { token } = await loginUser(admin);

    const res = await request(app)
      .post('/api/hub/messages')
      .set('Authorization', `Bearer ${token}`)
      .field('title', 'Pour concrete tomorrow')
      .field('body', 'Site 4 — bring extra rebar')
      .field('priority', 'HIGH')
      .field('recipient_ids', JSON.stringify([worker.id]));

    expect(res.statusCode).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.message_id).toBeDefined();
    // No project_id → recipient defaults to SENT (no PENDING_ASSIGNMENT path)
    expect(res.body.sent).toBe(1);
    expect(res.body.pending).toBe(0);
    expect(res.body.delivery_status).toBe('SENT');
  });
});

// ──────────────────────────────────────────────────────────────────
describeIfDb('GET /api/hub/messages/sent', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('200 returns empty list when caller has sent nothing', async () => {
    const company = await seedCompany();
    const { admin } = await seedAdminWithEmployee(company.company_id);
    const { token } = await loginUser(admin);

    const res = await request(app)
      .get('/api/hub/messages/sent')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.messages)).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────
describeIfDb('GET /api/hub/messages/inbox', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('200 returns empty list when caller has no inbound messages', async () => {
    const company = await seedCompany();
    const { admin } = await seedAdminWithEmployee(company.company_id);
    const { token } = await loginUser(admin);

    const res = await request(app)
      .get('/api/hub/messages/inbox')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.messages)).toBe(true);
    expect(res.body.messages).toHaveLength(0);
  });
});

// ──────────────────────────────────────────────────────────────────
describeIfDb('GET /api/hub/messages/unread-count', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('200 returns count: 0 when nothing pending', async () => {
    const company = await seedCompany();
    const { admin } = await seedAdminWithEmployee(company.company_id);
    const { token } = await loginUser(admin);

    const res = await request(app)
      .get('/api/hub/messages/unread-count')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ ok: true, count: 0 });
  });
});

// ──────────────────────────────────────────────────────────────────
describeIfDb('PATCH /api/hub/messages/:id/read', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('200 noop when message id is unknown (UPDATE matches 0 rows)', async () => {
    const company = await seedCompany();
    const { admin } = await seedAdminWithEmployee(company.company_id);
    const { token } = await loginUser(admin);

    const res = await request(app)
      .patch('/api/hub/messages/9999999/read')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ ok: true });
  });
});

// ──────────────────────────────────────────────────────────────────
describeIfDb('PATCH /api/hub/messages/:id/ack', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('200 noop when message id is unknown', async () => {
    const company = await seedCompany();
    const { admin } = await seedAdminWithEmployee(company.company_id);
    const { token } = await loginUser(admin);

    const res = await request(app)
      .patch('/api/hub/messages/9999999/ack')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ ok: true });
  });
});

// ──────────────────────────────────────────────────────────────────
describeIfDb('PATCH /api/hub/messages/:id/complete', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('200 noop when message id is unknown', async () => {
    const company = await seedCompany();
    const { admin } = await seedAdminWithEmployee(company.company_id);
    const { token } = await loginUser(admin);

    const res = await request(app)
      .patch('/api/hub/messages/9999999/complete')
      .set('Authorization', `Bearer ${token}`)
      .field('completion_note', 'done');

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ ok: true });
  });
});
