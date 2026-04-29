// First Supertest integration test — Phase 11b.
//
// Drives the actual Express app from app.js (no port binding, no cron
// jobs) and verifies the public /api/health and /api/config endpoints.
// These don't hit the database, so this test stays green even when no
// Postgres is reachable. Establishes the Supertest pipeline that
// subsequent DB-backed auth tests will build on.

const request = require('supertest');
const app = require('../../app');

describe('GET /api/health', () => {
  test('returns 200 with ok=true', async () => {
    const res = await request(app).get('/api/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('reports the expected service name', async () => {
    const res = await request(app).get('/api/health');
    expect(res.body.service).toBe('mep-site-workforce');
  });

  test('includes a current ISO timestamp', async () => {
    const res = await request(app).get('/api/health');
    expect(typeof res.body.time).toBe('string');
    // ISO 8601 sanity check — parses to a recent date.
    const parsed = new Date(res.body.time);
    expect(parsed.toString()).not.toBe('Invalid Date');
    const ageMs = Date.now() - parsed.getTime();
    expect(ageMs).toBeLessThan(60_000); // within the last minute
  });
});

describe('GET /api/config', () => {
  test('returns 200 with ok=true', async () => {
    const res = await request(app).get('/api/config');
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('exposes the Mapbox token field (null when unset)', async () => {
    const res = await request(app).get('/api/config');
    // In tests we don't set MAPBOX_ACCESS_TOKEN, so it should be null.
    // In production it's a real public token. Either way the field exists.
    expect(res.body).toHaveProperty('mapbox_token');
  });
});

describe('Unknown endpoints', () => {
  test('GET /api/does-not-exist returns 404', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.statusCode).toBe(404);
  });
});
