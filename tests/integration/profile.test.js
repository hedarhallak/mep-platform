// Phase 19 — Profile route tests.
//
// /api/profile/* is auth-gated but does not use the RBAC can()
// middleware — every authenticated user can read their own profile.
// The route has two distinct response shapes depending on whether the
// JWT carries an employee_id:
//   - admin / IT staff (no employee_id): minimal app_user info,
//     is_admin: true, profile fields nulled.
//   - worker (employee_id linked): joined employees + employee_profiles
//     view with the full demographic + contact set.
// Plus /dropdowns returns canned trade + rank lists.

// §150-coverage: mock Mapbox geocoding (profile.js calls https.get directly) so
// the POST / success path is exercisable without a network call or real token.
// Toggle mockGeo.* per test to simulate a hit / a miss. (Var must be `mock*` for
// Jest's hoisted factory; it's initialized before app is required below.)
process.env.MAPBOX_ACCESS_TOKEN = process.env.MAPBOX_ACCESS_TOKEN || 'test-mapbox-token';
const mockGeo = { statusCode: 200, body: { features: [{ center: [-73.5673, 45.5017] }] } };
jest.mock('https', () => {
  const actual = jest.requireActual('https');
  return {
    ...actual,
    get: (_url, cb) => {
      const res = {
        statusCode: mockGeo.statusCode,
        on: (ev, h) => {
          if (ev === 'data') h(JSON.stringify(mockGeo.body));
          if (ev === 'end') h();
        },
      };
      cb(res);
      return { on: () => ({}) };
    },
  };
});

const request = require('supertest');
const app = require('../../app');
const {
  describeIfDb,
  closePool,
  seedCompany,
  seedUser,
  seedEmployee,
  seedEmployeeProfile,
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

describeIfDb('Profile — /api/profile', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('GET /api/profile/dropdowns returns canned trades + ranks lists', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .get('/api/profile/dropdowns')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.trades)).toBe(true);
    expect(Array.isArray(res.body.ranks)).toBe(true);
    expect(res.body.trades.length).toBeGreaterThan(0);
  });

  test('GET /api/profile/me as admin (no employee_id) returns admin shape with is_admin:true', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const { token } = await loginUser(admin);

    const res = await request(app).get('/api/profile/me').set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.is_admin).toBe(true);
    expect(res.body.exists).toBe(false);
    // Admin shape: first_name = username (no real employee row).
    expect(res.body.profile.first_name).toBe(admin.username);
    expect(res.body.profile.role_code).toBe('COMPANY_ADMIN');
    expect(res.body.profile.employee_id).toBeNull();
  });

  test('GET /api/profile/me as worker (linked to employee) returns the employee profile', async () => {
    const company = await seedCompany();
    const emp = await seedEmployee({
      company_id: company.company_id,
      first_name: 'Sami',
      last_name: 'Tester',
    });
    await seedEmployeeProfile({
      employee_id: emp.id,
      full_name: 'Sami Tester',
      trade_code: 'PLUMBING',
    });
    const worker = await seedUser({
      company_id: company.company_id,
      employee_id: emp.id,
      role: 'WORKER',
    });

    const { token } = await loginUser(worker);

    const res = await request(app).get('/api/profile/me').set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    // Not the admin shape — should have the joined employee data.
    expect(res.body.is_admin).not.toBe(true);
    expect(Number(res.body.profile.employee_id)).toBe(emp.id);
    expect(res.body.profile.first_name).toBe('Sami');
    expect(res.body.profile.last_name).toBe('Tester');
    expect(res.body.profile.trade_code).toBe('PLUMBING');
  });

  // ── POST /api/profile (§150-coverage) ────────────────────────────────────

  async function seedWorker() {
    const company = await seedCompany();
    const emp = await seedEmployee({
      company_id: company.company_id,
      first_name: 'Pat',
      last_name: 'Builder',
    });
    const worker = await seedUser({
      company_id: company.company_id,
      employee_id: emp.id,
      role: 'WORKER',
    });
    const { token } = await loginUser(worker);
    return { company, emp, worker, token };
  }

  const FULL_BODY = {
    trade_code: 'PLUMBING',
    rank_code: 'JOURNEYMAN',
    phone: '514-555-0142',
    home_address: '123 Rue Principale',
    city: 'Montréal',
    postal_code: 'H2X 1Y4',
    emergency_contact_name: 'Alex Kin',
    emergency_contact_phone: '514-555-0199',
    emergency_contact_relationship: 'Sibling',
  };

  test('POST / without an employee_id (admin token) → 401', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const { token } = await loginUser(admin);
    const res = await request(app)
      .post('/api/profile')
      .set('Authorization', `Bearer ${token}`)
      .send(FULL_BODY);
    expect(res.statusCode).toBe(401);
  });

  test('POST / missing required fields → 400 with the required list', async () => {
    const { token } = await seedWorker();
    const res = await request(app)
      .post('/api/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '514-555-0001' }); // missing trade/rank/address/city/postal
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Missing required fields');
    expect(res.body.required).toEqual(
      expect.arrayContaining([
        'trade_code',
        'rank_code',
        'phone',
        'home_address',
        'city',
        'postal_code',
      ])
    );
  });

  test('POST / full body geocodes + upserts the profile → 200, then GET /me shows exists', async () => {
    mockGeo.statusCode = 200;
    mockGeo.body = { features: [{ center: [-73.5673, 45.5017] }] };
    const { token } = await seedWorker();

    const res = await request(app)
      .post('/api/profile')
      .set('Authorization', `Bearer ${token}`)
      .send(FULL_BODY);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.saved).toBe(true);
    expect(res.body.geocoded).toBe(true);

    // Round-trip: the profile now exists with the saved canonical fields.
    const me = await request(app).get('/api/profile/me').set('Authorization', `Bearer ${token}`);
    expect(me.statusCode).toBe(200);
    expect(me.body.exists).toBe(true);
    expect(me.body.profile.trade_code).toBe('PLUMBING');
    expect(me.body.profile.rank_code).toBe('JOURNEYMAN');
    expect(me.body.profile.city).toBe('Montréal');
  });

  test('POST / when geocoding finds nothing → 400 Unable to locate', async () => {
    mockGeo.statusCode = 200;
    mockGeo.body = { features: [] }; // no match
    const { token } = await seedWorker();

    const res = await request(app)
      .post('/api/profile')
      .set('Authorization', `Bearer ${token}`)
      .send(FULL_BODY);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/Unable to locate/i);

    mockGeo.body = { features: [{ center: [-73.5673, 45.5017] }] }; // restore for any later test
  });
});
