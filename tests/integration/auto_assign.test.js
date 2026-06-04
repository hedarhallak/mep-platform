// Phase 38 — Auto-assign suggestion endpoint.
//
// /api/assignments/auto-suggest computes optimal worker reassignments
// based on home location vs project sites. Permission-gated by
// assignments.smart_assign. On a fresh tenant with no projects, the
// route short-circuits with an empty suggestions array.

const request = require('supertest');
const app = require('../../app');
const {
  describeIfDb,
  closePool,
  getPool,
  seedCompany,
  seedUser,
  seedProject,
  seedEmployee,
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

describeIfDb('Auto-assign — /api/assignments/auto-suggest', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('POST /auto-suggest without target_date returns 400', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .post('/api/assignments/auto-suggest')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ ok: false, error: 'TARGET_DATE_REQUIRED' });
  });

  test('POST /auto-suggest on empty company returns 200 + empty suggestions', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .post('/api/assignments/auto-suggest')
      .set('Authorization', `Bearer ${token}`)
      .send({ target_date: '2027-06-15' });

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.suggestions).toEqual([]);
  });

  test('POST /auto-suggest without assignments.smart_assign returns 403', async () => {
    const company = await seedCompany();
    const worker = await seedUser({ company_id: company.company_id, role: 'WORKER' });
    const { token } = await loginUser(worker);

    const res = await request(app)
      .post('/api/assignments/auto-suggest')
      .set('Authorization', `Bearer ${token}`)
      .send({ target_date: '2027-06-15' });

    expect(res.statusCode).toBe(403);
    expect(res.body.permission).toBe('assignments.smart_assign');
  });
});

// Phase 52 — /auto-confirm validation surface.
//
// /auto-confirm is the mutation half of the smart-assign flow: it
// creates assignment_requests rows and queues emails. Business logic
// is heavy (transaction, overlap checks, email queue), so we pin
// just the validation gate — empty / missing payload → 400 — and
// the RBAC denial. Happy-path is left to manual / e2e because it
// depends on SendGrid + a fully seeded company.
describeIfDb('Auto-assign — /api/assignments/auto-confirm', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('POST /auto-confirm with empty body returns 400 INVALID_PAYLOAD', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .post('/api/assignments/auto-confirm')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ ok: false, error: 'INVALID_PAYLOAD' });
  });

  test('POST /auto-confirm with target_date but empty confirmed array returns 400', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .post('/api/assignments/auto-confirm')
      .set('Authorization', `Bearer ${token}`)
      .send({ target_date: '2027-06-15', confirmed: [] });

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ ok: false, error: 'INVALID_PAYLOAD' });
  });

  test('POST /auto-confirm without assignments.smart_assign returns 403', async () => {
    const company = await seedCompany();
    const worker = await seedUser({ company_id: company.company_id, role: 'WORKER' });
    const { token } = await loginUser(worker);

    const res = await request(app)
      .post('/api/assignments/auto-confirm')
      .set('Authorization', `Bearer ${token}`)
      .send({ target_date: '2027-06-15', confirmed: [{ project_id: 1, employees: [] }] });

    expect(res.statusCode).toBe(403);
    expect(res.body.permission).toBe('assignments.smart_assign');
  });

  // Section 130 — happy path. Previously "left to manual / e2e", but the
  // RLS fix (set_config inside the manual transaction) needs a pin: the
  // INSERT into assignment_requests must succeed under tenant_isolation.
  // No contact_email is passed, so no emails are queued (pure DB path).
  test('POST /auto-confirm creates an APPROVED assignment_request (RLS GUC set in manual tx)', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const project = await seedProject({ company_id: company.company_id });
    const employee = await seedEmployee({ company_id: company.company_id });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .post('/api/assignments/auto-confirm')
      .set('Authorization', `Bearer ${token}`)
      .send({
        target_date: '2027-06-15',
        confirmed: [
          {
            project_id: project.id,
            shift_start: '06:00',
            shift_end: '14:30',
            employees: [{ employee_id: employee.id, trade_code: 'PLUMBING', type: 'new' }],
          },
        ],
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.assignments_created).toBe(1);

    const { rows } = await getPool().query(
      `SELECT status, project_id, company_id
         FROM public.assignment_requests
        WHERE requested_for_employee_id = $1 AND start_date = '2027-06-15'`,
      [employee.id]
    );
    expect(rows.length).toBe(1);
    expect(rows[0].status).toBe('APPROVED');
    expect(Number(rows[0].project_id)).toBe(Number(project.id));
    expect(Number(rows[0].company_id)).toBe(Number(company.company_id));
  });
});
