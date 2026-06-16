// tests/smoke/assignment_allowance.test.js
//
// §131.3 / G5 / §144 — lib/assignment_allowance.js. Pure unit test with a
// mocked db: no Postgres, no network. Verifies sector mapping and that the
// allowance is computed from the snapshot sector + rate table + real road km,
// then written to allowance_cents.

'use strict';

const {
  computeAndPersistAllowance,
  rateSectorFor,
  persistDistanceAndAllowanceById,
  backfillDistanceAllowance,
} = require('../../lib/assignment_allowance');

describe('rateSectorFor (project → rate-table sector)', () => {
  test('INDUSTRIAL maps to I (else $0 for industrial sites)', () => {
    expect(rateSectorFor('INDUSTRIAL')).toBe('I');
  });
  test('RESIDENTIAL and IC pass through; unknown defaults to IC', () => {
    expect(rateSectorFor('RESIDENTIAL')).toBe('RESIDENTIAL');
    expect(rateSectorFor('IC')).toBe('IC');
    expect(rateSectorFor(undefined)).toBe('IC');
    expect(rateSectorFor('GARBAGE')).toBe('IC');
  });
});

describe('computeAndPersistAllowance', () => {
  // A fake db that (1) returns the assignment row, (2) returns the rate table,
  // (3) captures the UPDATE so we can assert what got written.
  function makeDb({ sector, trade, startDate, rateRows }) {
    const calls = [];
    return {
      calls,
      query: jest.fn(async (sql, params) => {
        calls.push({ sql, params });
        if (/FROM public\.assignment_requests ar/.test(sql)) {
          return {
            rows: [{ start_date: startDate, snapshot_ccq_sector: sector, trade_code: trade }],
          };
        }
        if (/FROM public\.ccq_travel_rates/.test(sql)) {
          return { rows: rateRows };
        }
        if (/UPDATE public\.assignment_requests/.test(sql)) {
          return { rowCount: 1 };
        }
        return { rows: [] };
      }),
    };
  }

  test('writes the highest matching bracket for the trade (cents)', async () => {
    const db = makeDb({
      sector: 'IC',
      trade: 'ELECTRICAL',
      startDate: '2026-06-16',
      // rate_cad → loadRateTable converts to rate_cents (×100)
      rateRows: [
        { trade_code: 'ELECTRICAL', min_km: 50, rate_cad: '10.00' },
        { trade_code: 'ELECTRICAL', min_km: 90, rate_cad: '20.00' },
        { trade_code: 'GENERAL', min_km: 50, rate_cad: '5.00' },
      ],
    });
    // 120 km road → above the 90 km bracket → $20.00 = 2000 cents.
    const cents = await computeAndPersistAllowance(db, 1, 7, 120);
    expect(cents).toBe(2000);

    const update = db.calls.find((c) => /UPDATE public\.assignment_requests/.test(c.sql));
    expect(update).toBeTruthy();
    expect(update.params).toEqual([2000, 1, 7]);
  });

  test('queries the rate table with the INDUSTRIAL→I mapped sector', async () => {
    const db = makeDb({
      sector: 'INDUSTRIAL',
      trade: 'PLUMBING',
      startDate: new Date('2026-06-16T00:00:00Z'),
      rateRows: [],
    });
    await computeAndPersistAllowance(db, 9, 3, 100);
    const rateQuery = db.calls.find((c) => /FROM public\.ccq_travel_rates/.test(c.sql));
    expect(rateQuery.params[0]).toBe('I'); // sector param
    expect(rateQuery.params[1]).toBe('2026-06-16'); // onDate from Date
  });

  test('falls back to GENERAL when the trade has no bracket', async () => {
    const db = makeDb({
      sector: 'RESIDENTIAL',
      trade: 'WELDING',
      startDate: '2026-06-16',
      rateRows: [{ trade_code: 'GENERAL', min_km: 80, rate_cad: '12.50' }],
    });
    const cents = await computeAndPersistAllowance(db, 2, 4, 100);
    expect(cents).toBe(1250);
  });

  test('returns 0 cents below every bracket (still writes 0)', async () => {
    const db = makeDb({
      sector: 'IC',
      trade: 'ELECTRICAL',
      startDate: '2026-06-16',
      rateRows: [{ trade_code: 'ELECTRICAL', min_km: 90, rate_cad: '20.00' }],
    });
    const cents = await computeAndPersistAllowance(db, 5, 1, 40);
    expect(cents).toBe(0);
    const update = db.calls.find((c) => /UPDATE public\.assignment_requests/.test(c.sql));
    expect(update.params).toEqual([0, 5, 1]);
  });

  test('non-finite roadKm → null, no UPDATE', async () => {
    const db = makeDb({ sector: 'IC', trade: 'X', startDate: '2026-06-16', rateRows: [] });
    const cents = await computeAndPersistAllowance(db, 1, 1, NaN);
    expect(cents).toBeNull();
    expect(db.query).not.toHaveBeenCalled();
  });
});

// ── BULK paths (§144.3) — by-id + concurrency-capped backfill ──────
describe('persistDistanceAndAllowanceById + backfillDistanceAllowance', () => {
  const saved = {
    google: process.env.GOOGLE_MAPS_API_KEY,
    mapbox: process.env.MAPBOX_ACCESS_TOKEN,
  };
  beforeEach(() => {
    // Force the deterministic haversine fallback in lib/road_distance.js.
    delete process.env.GOOGLE_MAPS_API_KEY;
    delete process.env.MAPBOX_ACCESS_TOKEN;
  });
  afterAll(() => {
    if (saved.google !== undefined) process.env.GOOGLE_MAPS_API_KEY = saved.google;
    if (saved.mapbox !== undefined) process.env.MAPBOX_ACCESS_TOKEN = saved.mapbox;
  });

  // db mock that serves: (1) the coords lookup (has home_location/site_lat),
  // (2) distance UPDATE, (3) the allowance row lookup (has snapshot_ccq_sector),
  // (4) rate-table SELECT, (5) allowance UPDATE. Records every UPDATE.
  function makeBulkDb({ coords, sector, trade, startDate, rateRows }) {
    const updates = [];
    return {
      updates,
      query: jest.fn(async (sql, params) => {
        if (/home_location::geometry/.test(sql)) {
          return { rows: coords ? [coords] : [] };
        }
        if (/snapshot_ccq_sector/.test(sql)) {
          return {
            rows: [{ start_date: startDate, snapshot_ccq_sector: sector, trade_code: trade }],
          };
        }
        if (/FROM public\.ccq_travel_rates/.test(sql)) {
          return { rows: rateRows };
        }
        if (/UPDATE public\.assignment_requests/.test(sql)) {
          updates.push({ sql, params });
          return { rowCount: 1 };
        }
        return { rows: [] };
      }),
    };
  }

  const COORDS = { home_lat: 45.5, home_lng: -73.6, site_lat: 46.8, site_lng: -71.2 };

  test('by-id: writes a positive distance_km then the allowance', async () => {
    const db = makeBulkDb({
      coords: COORDS,
      sector: 'IC',
      trade: 'ELECTRICAL',
      startDate: '2026-06-16',
      rateRows: [{ trade_code: 'ELECTRICAL', min_km: 90, rate_cad: '20.00' }],
    });
    const km = await persistDistanceAndAllowanceById(db, 11, 5);
    expect(km).toBeGreaterThan(0);

    const distUpdate = db.updates.find((u) => /SET distance_km/.test(u.sql));
    const allowUpdate = db.updates.find((u) => /SET allowance_cents/.test(u.sql));
    expect(distUpdate.params).toEqual([km, 11, 5]);
    // Montreal→QC road estimate is well over the 90 km bracket → 2000 cents.
    expect(allowUpdate.params).toEqual([2000, 11, 5]);
  });

  test('by-id: missing coords → null, no UPDATE', async () => {
    const db = makeBulkDb({
      coords: null,
      sector: 'IC',
      trade: 'X',
      startDate: '2026-06-16',
      rateRows: [],
    });
    const km = await persistDistanceAndAllowanceById(db, 1, 1);
    expect(km).toBeNull();
    expect(db.updates.length).toBe(0);
  });

  test('backfill: processes every id (chunked), tolerates a bad row', async () => {
    // Build a db whose coords lookup returns null for id 2 (skipped) but real
    // coords otherwise — one bad row must not abort the batch.
    const updates = [];
    const db = {
      query: jest.fn(async (sql, params) => {
        if (/home_location::geometry/.test(sql)) {
          const id = params[0];
          return { rows: id === 2 ? [] : [COORDS] };
        }
        if (/snapshot_ccq_sector/.test(sql)) {
          return {
            rows: [{ start_date: '2026-06-16', snapshot_ccq_sector: 'IC', trade_code: 'GENERAL' }],
          };
        }
        if (/FROM public\.ccq_travel_rates/.test(sql)) {
          return { rows: [{ trade_code: 'GENERAL', min_km: 90, rate_cad: '15.00' }] };
        }
        if (/UPDATE public\.assignment_requests/.test(sql)) {
          updates.push(params);
          return { rowCount: 1 };
        }
        return { rows: [] };
      }),
    };
    await backfillDistanceAllowance(db, [1, 2, 3], 7, 2);
    // ids 1 and 3 each get distance + allowance UPDATEs (4 total); id 2 none.
    const ids = updates.map((p) => p[1]);
    expect(ids.filter((x) => x === 1).length).toBe(2);
    expect(ids.filter((x) => x === 3).length).toBe(2);
    expect(ids.filter((x) => x === 2).length).toBe(0);
  });

  test('backfill: empty/invalid input is a no-op', async () => {
    const db = { query: jest.fn() };
    await backfillDistanceAllowance(db, [], 1);
    await backfillDistanceAllowance(db, null, 1);
    expect(db.query).not.toHaveBeenCalled();
  });
});
