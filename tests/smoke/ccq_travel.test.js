// tests/smoke/ccq_travel.test.js
//
// Section 131 — CCQ travel-allowance estimation (lib/ccq_travel.js).
// Rates come from the global ccq_travel_rates table; these unit tests
// exercise the pure matcher against an in-memory rate table (no DB)
// plus loadRateTable's row mapping via a stubbed db.

'use strict';

const {
  ROAD_FACTOR,
  estimateRoadKm,
  loadRateTable,
  allowanceCentsFor,
} = require('../../lib/ccq_travel');

describe('lib/ccq_travel', () => {
  test('estimateRoadKm applies the road factor and rounds', () => {
    expect(ROAD_FACTOR).toBe(1.3);
    expect(estimateRoadKm(0)).toBe(0);
    expect(estimateRoadKm(10)).toBe(13);
    expect(estimateRoadKm(100)).toBe(130);
  });

  test('estimateRoadKm guards bad input', () => {
    expect(estimateRoadKm(NaN)).toBe(0);
    expect(estimateRoadKm(-5)).toBe(0);
    expect(estimateRoadKm(undefined)).toBe(0);
  });

  const RATES = [
    { trade_code: 'ELECTRICAL', min_km: 90, rate_cents: 5389 },
    { trade_code: 'ELECTRICAL', min_km: 105, rate_cents: 6951 },
    { trade_code: 'GENERAL', min_km: 90, rate_cents: 5000 },
  ];

  test('allowanceCentsFor — "more than min_km", highest bracket wins', () => {
    expect(allowanceCentsFor(RATES, 'ELECTRICAL', 89)).toBe(0);
    expect(allowanceCentsFor(RATES, 'ELECTRICAL', 90)).toBe(0); // strictly more than
    expect(allowanceCentsFor(RATES, 'ELECTRICAL', 91)).toBe(5389);
    expect(allowanceCentsFor(RATES, 'ELECTRICAL', 105)).toBe(5389);
    expect(allowanceCentsFor(RATES, 'ELECTRICAL', 106)).toBe(6951);
  });

  test('allowanceCentsFor — falls back to GENERAL, then 0', () => {
    expect(allowanceCentsFor(RATES, 'PLUMBING', 120)).toBe(5000); // GENERAL fallback
    expect(allowanceCentsFor([], 'ELECTRICAL', 120)).toBe(0); // no rates configured
    expect(allowanceCentsFor(RATES, 'ELECTRICAL', NaN)).toBe(0);
  });

  test('loadRateTable maps rate_cad dollars to integer cents', async () => {
    const mockDb = {
      query: jest.fn(async () => ({
        rows: [{ trade_code: 'ELECTRICAL', min_km: '90.0', rate_cad: '53.89' }],
      })),
    };
    const rates = await loadRateTable(mockDb, '2026-06-15');
    expect(mockDb.query).toHaveBeenCalledTimes(1);
    expect(rates).toEqual([{ trade_code: 'ELECTRICAL', min_km: 90, rate_cents: 5389 }]);
    // Sector default IC + date filter are part of the query params.
    expect(mockDb.query.mock.calls[0][1]).toEqual(['IC', '2026-06-15']);
  });
});
