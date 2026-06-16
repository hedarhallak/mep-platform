// tests/smoke/assignment_allowance.test.js
//
// §131.3 / G5 / §144 — lib/assignment_allowance.js. Pure unit test with a
// mocked db: no Postgres, no network. Verifies sector mapping and that the
// allowance is computed from the snapshot sector + rate table + real road km,
// then written to allowance_cents.

'use strict';

const { computeAndPersistAllowance, rateSectorFor } = require('../../lib/assignment_allowance');

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
