// tests/smoke/road_distance.test.js
//
// §131.3 / G5 — lib/road_distance.js. No network: we delete the provider keys
// so roadDistanceKm deterministically falls through to the haversine estimate.

'use strict';

const { roadDistanceKm, haversineKm, ROAD_FACTOR } = require('../../lib/road_distance');

describe('lib/road_distance', () => {
  const saved = {
    google: process.env.GOOGLE_MAPS_API_KEY,
    mapbox: process.env.MAPBOX_ACCESS_TOKEN,
  };
  beforeEach(() => {
    delete process.env.GOOGLE_MAPS_API_KEY;
    delete process.env.MAPBOX_ACCESS_TOKEN;
  });
  afterAll(() => {
    if (saved.google !== undefined) process.env.GOOGLE_MAPS_API_KEY = saved.google;
    if (saved.mapbox !== undefined) process.env.MAPBOX_ACCESS_TOKEN = saved.mapbox;
  });

  test('haversineKm: identical points = 0', () => {
    expect(haversineKm(45.5, -73.6, 45.5, -73.6)).toBeCloseTo(0, 5);
  });

  test('haversineKm: Montreal → Quebec City is ~230 km (sanity)', () => {
    const d = haversineKm(45.5017, -73.5673, 46.8139, -71.208);
    expect(d).toBeGreaterThan(220);
    expect(d).toBeLessThan(245);
  });

  test('roadDistanceKm falls back to haversine×1.3 when no provider is configured', async () => {
    const km = await roadDistanceKm(45.5, -73.6, 45.6, -73.7);
    const expected = Math.round(haversineKm(45.5, -73.6, 45.6, -73.7) * ROAD_FACTOR * 100) / 100;
    expect(km).toBeCloseTo(expected, 2);
  });

  test('invalid coordinates → null', async () => {
    expect(await roadDistanceKm(null, -73, 45, -73)).toBeNull();
    expect(await roadDistanceKm('x', 1, 2, 3)).toBeNull();
    expect(await roadDistanceKm(undefined, undefined, undefined, undefined)).toBeNull();
  });
});
