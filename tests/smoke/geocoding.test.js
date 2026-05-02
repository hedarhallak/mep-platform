// tests/smoke/geocoding.test.js — Phase 73a (May 2026, Section 22 hardening,
// coverage push 47% → 65%).
//
// services/geocoding.js was at zero coverage. The function is a pure
// async wrapper around Mapbox's forward-geocoding endpoint with eight
// distinct error / success branches — perfect target for `fetch`-mocking
// unit tests. No DB, no network, fast.

'use strict';

const ORIGINAL_TOKEN = process.env.MAPBOX_ACCESS_TOKEN;
const ORIGINAL_FETCH = global.fetch;

afterEach(() => {
  if (ORIGINAL_TOKEN === undefined) delete process.env.MAPBOX_ACCESS_TOKEN;
  else process.env.MAPBOX_ACCESS_TOKEN = ORIGINAL_TOKEN;
  global.fetch = ORIGINAL_FETCH;
  jest.resetModules();
});

function load() {
  // Re-require so the module re-reads MAPBOX_ACCESS_TOKEN via its top-level
  // const. Cleanest way to test both the configured and unconfigured cases.
  jest.resetModules();
  return require('../../services/geocoding');
}

describe('services/geocoding — configuration guard', () => {
  test('returns GEOCODE_PROVIDER_NOT_CONFIGURED when MAPBOX_ACCESS_TOKEN is unset', async () => {
    delete process.env.MAPBOX_ACCESS_TOKEN;
    const { geocodeHomeAddress } = load();
    const r = await geocodeHomeAddress({ street: '123 Main St', city: 'Montreal' });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('GEOCODE_PROVIDER_NOT_CONFIGURED');
    expect(r.message).toMatch(/MAPBOX_ACCESS_TOKEN/);
  });
});

// NOTE: the GEOCODE_INPUT_EMPTY branch in services/geocoding.js is
// effectively dead code — the function always defaults `country` to
// "Canada" before calling buildAddress, so the resulting query string is
// never empty. Tests for that branch were dropped after the first run
// surfaced this. Worth a follow-up PR to either remove the branch or
// short-circuit on "country is the only non-empty field". Tracked under
// the Phase 73 lessons in DECISIONS.md.

describe('services/geocoding — Mapbox responses', () => {
  beforeEach(() => {
    process.env.MAPBOX_ACCESS_TOKEN = 'pk.test-token';
  });

  test('happy path — returns ok with { lng, lat } from geometry.coordinates', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        features: [
          {
            geometry: { coordinates: [-73.5673, 45.5017] }, // Montreal
            properties: { full_address: '123 Main St, Montreal' },
          },
        ],
      }),
    });
    const { geocodeHomeAddress } = load();
    const r = await geocodeHomeAddress({ street: '123 Main St', city: 'Montreal' });
    expect(r.ok).toBe(true);
    expect(r.lng).toBeCloseTo(-73.5673);
    expect(r.lat).toBeCloseTo(45.5017);
    expect(r.raw).toBeDefined();

    // Sanity: the URL we built includes country=ca and permanent=true.
    const calledUrl = global.fetch.mock.calls[0][0];
    expect(calledUrl).toMatch(/country=ca/);
    expect(calledUrl).toMatch(/permanent=true/);
    expect(calledUrl).toMatch(/limit=1/);
    expect(calledUrl).toMatch(/access_token=pk\.test-token/);
  });

  test('falls back to properties.coordinates when geometry.coordinates is absent', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [
          {
            // no geometry.coordinates
            properties: { coordinates: { longitude: -73.5673, latitude: 45.5017 } },
          },
        ],
      }),
    });
    const { geocodeHomeAddress } = load();
    const r = await geocodeHomeAddress({ street: '123 Main St', city: 'Montreal' });
    expect(r.ok).toBe(true);
    expect(r.lng).toBeCloseTo(-73.5673);
    expect(r.lat).toBeCloseTo(45.5017);
  });

  test('returns GEOCODE_PROVIDER_ERROR when Mapbox responds non-2xx', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized — token invalid',
    });
    const { geocodeHomeAddress } = load();
    const r = await geocodeHomeAddress({ street: '123 Main St', city: 'Montreal' });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('GEOCODE_PROVIDER_ERROR');
    expect(r.message).toMatch(/401/);
    expect(r.message).toMatch(/Unauthorized/);
  });

  test('handles GEOCODE_PROVIDER_ERROR even when text() throws', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => {
        throw new Error('body read failed');
      },
    });
    const { geocodeHomeAddress } = load();
    const r = await geocodeHomeAddress({ street: '123 Main St', city: 'Montreal' });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('GEOCODE_PROVIDER_ERROR');
    expect(r.message).toMatch(/500/);
  });

  test('returns GEOCODE_NO_RESULTS when features array is empty', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ features: [] }),
    });
    const { geocodeHomeAddress } = load();
    const r = await geocodeHomeAddress({ street: 'nowhereville' });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('GEOCODE_NO_RESULTS');
  });

  test('returns GEOCODE_NO_RESULTS when features is missing entirely', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    const { geocodeHomeAddress } = load();
    const r = await geocodeHomeAddress({ street: '123 Main St' });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('GEOCODE_NO_RESULTS');
  });

  test('returns GEOCODE_BAD_RESPONSE when feature has no usable coordinates', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [
          {
            // geometry exists but coordinates is invalid
            geometry: { coordinates: ['not-a-number', null] },
            properties: {},
          },
        ],
      }),
    });
    const { geocodeHomeAddress } = load();
    const r = await geocodeHomeAddress({ street: '123 Main St' });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('GEOCODE_BAD_RESPONSE');
  });
});

describe('services/geocoding — network errors', () => {
  beforeEach(() => {
    process.env.MAPBOX_ACCESS_TOKEN = 'pk.test-token';
  });

  test('returns GEOCODE_NETWORK_ERROR for generic fetch failure', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('socket hang up'));
    const { geocodeHomeAddress } = load();
    const r = await geocodeHomeAddress({ street: '123 Main St' });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('GEOCODE_NETWORK_ERROR');
    expect(r.message).toMatch(/socket hang up/);
  });

  test('returns GEOCODE_TIMEOUT when AbortController fires', async () => {
    const abortErr = new Error('aborted');
    abortErr.name = 'AbortError';
    global.fetch = jest.fn().mockRejectedValue(abortErr);
    const { geocodeHomeAddress } = load();
    const r = await geocodeHomeAddress({ street: '123 Main St' }, { timeoutMs: 10 });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('GEOCODE_TIMEOUT');
    expect(r.message).toMatch(/timed out/);
  });

  test('respects custom timeoutMs option without hanging on success', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [{ geometry: { coordinates: [-73, 45] } }],
      }),
    });
    const { geocodeHomeAddress } = load();
    const r = await geocodeHomeAddress({ street: '123 Main St' }, { timeoutMs: 50000 });
    expect(r.ok).toBe(true);
  });

  test('defaults country to "Canada" when omitted', async () => {
    let observedAddress = null;
    global.fetch = jest.fn().mockImplementation((url) => {
      observedAddress = decodeURIComponent(new URL(url).searchParams.get('q'));
      return Promise.resolve({
        ok: true,
        json: async () => ({ features: [{ geometry: { coordinates: [-73, 45] } }] }),
      });
    });
    const { geocodeHomeAddress } = load();
    await geocodeHomeAddress({ street: '123 Main St', city: 'Montreal' });
    expect(observedAddress).toMatch(/Canada/);
  });
});
