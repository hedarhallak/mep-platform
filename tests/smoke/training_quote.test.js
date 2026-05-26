// tests/smoke/training_quote.test.js
//
// Phase 6-D-4 PR 5 — pure-function smoke tests for computeTrainingQuote.
// Covers Section 115.4 pricing (base + per-role add-ons + geographic
// per-diem tiers + flight pass-through).

'use strict';

const {
  computeTrainingQuote,
  distanceTier,
  PER_ROLE_CENTS,
  BASE_PACKAGE_CENTS,
  DEFAULT_PER_DIEM_RATES_CENTS_PER_DAY,
} = require('../../lib/training_quote');

describe('distanceTier()', () => {
  test('≤50km → WITHIN_50_KM', () => {
    expect(distanceTier(0)).toBe('WITHIN_50_KM');
    expect(distanceTier(50)).toBe('WITHIN_50_KM');
  });
  test('50-120km → KM_50_120', () => {
    expect(distanceTier(51)).toBe('KM_50_120');
    expect(distanceTier(120)).toBe('KM_50_120');
  });
  test('120-200km → KM_120_200', () => {
    expect(distanceTier(121)).toBe('KM_120_200');
    expect(distanceTier(200)).toBe('KM_120_200');
  });
  test('>200km → KM_OVER_200', () => {
    expect(distanceTier(201)).toBe('KM_OVER_200');
    expect(distanceTier(500)).toBe('KM_OVER_200');
  });
});

describe('computeTrainingQuote()', () => {
  test('base package only, within 50km, 1 day, no flight = $800', () => {
    const r = computeTrainingQuote({
      trainees: [
        { role: 'ADMIN', count: 1 },
        { role: 'PROJECT_MANAGER', count: 1 },
        { role: 'FOREMAN', count: 2 },
        { role: 'WORKER', count: 2 },
      ],
      distance_km: 30,
      training_days: 1,
    });
    expect(r.subtotal_cents).toBe(BASE_PACKAGE_CENTS);
    expect(r.breakdown.per_diem.subtotal_cents).toBe(0);
    expect(r.breakdown.flight.required).toBe(false);
  });

  test('2 extra Admin trainees beyond base = $800 + 2*$200 = $1,200', () => {
    const r = computeTrainingQuote({
      trainees: [
        { role: 'ADMIN', count: 3 }, // 1 in base, 2 extra
      ],
      distance_km: 0,
      training_days: 1,
    });
    expect(r.subtotal_cents).toBe(BASE_PACKAGE_CENTS + 2 * PER_ROLE_CENTS.ADMIN);
    const adminRow = r.breakdown.trainees.find((t) => t.role === 'ADMIN');
    expect(adminRow.count_extra).toBe(2);
    expect(adminRow.extra_subtotal_cents).toBe(2 * PER_ROLE_CENTS.ADMIN);
  });

  test('50-120km distance, 2 days = $800 + 2*$350 = $1,500', () => {
    const r = computeTrainingQuote({
      trainees: [{ role: 'ADMIN', count: 1 }],
      distance_km: 100,
      training_days: 2,
    });
    expect(r.breakdown.per_diem.rate_cents_per_day).toBe(35000);
    expect(r.breakdown.per_diem.subtotal_cents).toBe(70000); // 2 days * $350
    expect(r.subtotal_cents).toBe(BASE_PACKAGE_CENTS + 70000);
  });

  test('120-200km, 3 days = $800 + 3*$500 = $2,300', () => {
    const r = computeTrainingQuote({
      trainees: [{ role: 'ADMIN', count: 1 }],
      distance_km: 150,
      training_days: 3,
    });
    expect(r.breakdown.per_diem.rate_cents_per_day).toBe(50000);
    expect(r.subtotal_cents).toBe(BASE_PACKAGE_CENTS + 3 * 50000);
  });

  test('>200km default per-diem $1000/day + flight pass-through', () => {
    const r = computeTrainingQuote({
      trainees: [{ role: 'ADMIN', count: 1 }],
      distance_km: 470,
      training_days: 2,
      flight: { required: true, actual_cost_cents: 65000, carrier_notes: 'YUL→YBG' },
    });
    expect(r.breakdown.per_diem.rate_cents_per_day).toBe(
      DEFAULT_PER_DIEM_RATES_CENTS_PER_DAY.KM_OVER_200_DEFAULT
    );
    expect(r.breakdown.per_diem.subtotal_cents).toBe(2 * 100000); // 2 days * $1,000
    expect(r.breakdown.flight.required).toBe(true);
    expect(r.breakdown.flight.actual_cost_cents).toBe(65000);
    expect(r.breakdown.flight.carrier_notes).toBe('YUL→YBG');
    expect(r.subtotal_cents).toBe(BASE_PACKAGE_CENTS + 200000 + 65000);
  });

  test('>200km custom per-diem override (SUPER_ADMIN sets $1,200/day)', () => {
    const r = computeTrainingQuote({
      trainees: [{ role: 'ADMIN', count: 1 }],
      distance_km: 600,
      training_days: 2,
      per_diem_rate_cents_per_day: 120000,
    });
    expect(r.breakdown.per_diem.rate_cents_per_day).toBe(120000);
    expect(r.breakdown.per_diem.subtotal_cents).toBe(240000);
  });

  test('comprehensive Saguenay scenario (Section 116.4 example)', () => {
    // 470km, 2 days, trainees: 2 Admin + 5 PM + 3 Foreman (all beyond base except 1+1+2)
    // Flight required at $650.
    // Base: $800
    // Extras: (2-1=1) Admin * $200 + (5-1=4) PM * $150 + (3-2=1) Foreman * $100 = $200 + $600 + $100 = $900
    // Per-diem: 2 days * $1,000 = $2,000
    // Flight: $650
    // Total subtotal: 800 + 900 + 2000 + 650 = $4,350 = 435000 cents
    const r = computeTrainingQuote({
      trainees: [
        { role: 'ADMIN', count: 2 },
        { role: 'PROJECT_MANAGER', count: 5 },
        { role: 'FOREMAN', count: 3 },
      ],
      distance_km: 470,
      training_days: 2,
      flight: { required: true, actual_cost_cents: 65000, carrier_notes: 'YUL→YBG' },
    });
    expect(r.subtotal_cents).toBe(80000 + 90000 + 200000 + 65000);
  });

  test('rejects empty trainees array', () => {
    expect(() => computeTrainingQuote({ trainees: [], distance_km: 0, training_days: 1 })).toThrow(
      /NO_TRAINEES/
    );
  });

  test('rejects unknown role', () => {
    expect(() =>
      computeTrainingQuote({
        trainees: [{ role: 'JANITOR', count: 1 }],
        distance_km: 0,
        training_days: 1,
      })
    ).toThrow(/INVALID_TRAINEE_ROLE/);
  });

  test('rejects negative trainee count', () => {
    expect(() =>
      computeTrainingQuote({
        trainees: [{ role: 'ADMIN', count: -1 }],
        distance_km: 0,
        training_days: 1,
      })
    ).toThrow(/INVALID_TRAINEE_COUNT/);
  });

  test('rejects training_days outside 1-60', () => {
    expect(() =>
      computeTrainingQuote({
        trainees: [{ role: 'ADMIN', count: 1 }],
        distance_km: 0,
        training_days: 0,
      })
    ).toThrow(/INVALID_TRAINING_DAYS/);

    expect(() =>
      computeTrainingQuote({
        trainees: [{ role: 'ADMIN', count: 1 }],
        distance_km: 0,
        training_days: 61,
      })
    ).toThrow(/INVALID_TRAINING_DAYS/);
  });
});
