'use strict';

/**
 * lib/training_quote.js
 *
 * Phase 6-D-4 PR 5 / Section 115.4 — training quote calculation.
 *
 * Inputs:
 *   - trainees: array of { role, count } where role is one of:
 *       ADMIN ($200/each), PROJECT_MANAGER ($150/each),
 *       FOREMAN ($100/each), WORKER ($50/each)
 *   - distance_km: distance from Montreal Centre-Ville (number, may be 0)
 *   - training_days: integer ≥ 1
 *   - flight: optional { required: bool, actual_cost_cents: int, carrier_notes: string }
 *
 * Geography tiers (Section 115.4, revised May 24 in Section 117.2):
 *   - ≤50 km        → no per-diem
 *   - 50-120 km     → $350/day per-diem
 *   - 120-200 km    → $500/day per-diem
 *   - >200 km       → custom per-diem $800-$1500/day + flight cost (pass-through)
 *
 * Base package: $800 (1 Admin + 1 PM + 2 Foremen + 2 Workers, max 6 trainees).
 * Beyond the base, each trainee adds the per-role price (above).
 *
 * Returns a full breakdown suitable for the invoice JSONB details column
 * (Section 116.4 TRAINING shape) + a total subtotal_cents.
 *
 * All amounts in INTEGER cents.
 */

const BASE_PACKAGE_CENTS = 80000; // $800 CAD
const PER_ROLE_CENTS = {
  ADMIN: 20000, // +$200
  PROJECT_MANAGER: 15000, // +$150
  FOREMAN: 10000, // +$100
  WORKER: 5000, // +$50
};
const BASE_PACKAGE_INCLUDES = {
  ADMIN: 1,
  PROJECT_MANAGER: 1,
  FOREMAN: 2,
  WORKER: 2,
};
const VALID_ROLES = Object.keys(PER_ROLE_CENTS);

const DEFAULT_PER_DIEM_RATES_CENTS_PER_DAY = {
  // bucket → per-diem in cents/day (server-side defaults; SUPER_ADMIN can override
  // via explicit `per_diem_rate_cents_per_day` for the >200km custom case)
  WITHIN_50_KM: 0,
  KM_50_120: 35000, // $350
  KM_120_200: 50000, // $500
  KM_OVER_200_DEFAULT: 100000, // $1,000 default for >200km, override at quote time
};

function distanceTier(distanceKm) {
  const d = Math.max(0, Number(distanceKm) || 0);
  if (d <= 50) return 'WITHIN_50_KM';
  if (d <= 120) return 'KM_50_120';
  if (d <= 200) return 'KM_120_200';
  return 'KM_OVER_200';
}

/**
 * Compute the training quote breakdown.
 *
 * @param {object} args
 * @param {Array<{role: string, count: number}>} args.trainees
 * @param {number} args.distance_km
 * @param {number} args.training_days
 * @param {{required: boolean, actual_cost_cents: number, carrier_notes?: string}} [args.flight]
 * @param {number} [args.per_diem_rate_cents_per_day] - SUPER_ADMIN override for >200km
 * @returns {object} { subtotal_cents, breakdown: {trainees, base_package_cents, trainees_total_cents, location, training_days, per_diem, flight} }
 */
function computeTrainingQuote({
  trainees,
  distance_km,
  training_days,
  flight = null,
  per_diem_rate_cents_per_day = null,
}) {
  // ── Validate trainees ───────────────────────────────────────
  if (!Array.isArray(trainees) || trainees.length === 0) {
    throw Object.assign(new Error('NO_TRAINEES'), { code: 'NO_TRAINEES' });
  }
  const aggregated = {}; // role → total count
  for (const entry of trainees) {
    if (!entry || typeof entry !== 'object') {
      throw Object.assign(new Error('INVALID_TRAINEE_ENTRY'), { code: 'INVALID_TRAINEE_ENTRY' });
    }
    const role = String(entry.role || '').toUpperCase();
    const count = Number(entry.count);
    if (!VALID_ROLES.includes(role)) {
      throw Object.assign(new Error(`INVALID_TRAINEE_ROLE: ${role}`), {
        code: 'INVALID_TRAINEE_ROLE',
      });
    }
    if (!Number.isInteger(count) || count < 0) {
      throw Object.assign(new Error('INVALID_TRAINEE_COUNT'), { code: 'INVALID_TRAINEE_COUNT' });
    }
    aggregated[role] = (aggregated[role] || 0) + count;
  }

  // ── Validate training_days ──────────────────────────────────
  const days = Number(training_days);
  if (!Number.isInteger(days) || days < 1 || days > 60) {
    throw Object.assign(new Error('INVALID_TRAINING_DAYS'), { code: 'INVALID_TRAINING_DAYS' });
  }

  // ── Trainees beyond base package incur add-on cost ──────────
  // Base includes 6 trainees split as (1 Admin + 1 PM + 2 Foremen + 2 Workers).
  // Extras are billed at the per-role rate.
  const traineesBreakdown = [];
  let traineesTotalCents = 0;
  for (const role of VALID_ROLES) {
    const requested = aggregated[role] || 0;
    const includedInBase = BASE_PACKAGE_INCLUDES[role] || 0;
    const extras = Math.max(0, requested - includedInBase);
    const extrasSubtotalCents = extras * PER_ROLE_CENTS[role];
    if (requested > 0) {
      traineesBreakdown.push({
        role,
        count_requested: requested,
        count_in_base: Math.min(requested, includedInBase),
        count_extra: extras,
        unit_price_cents: PER_ROLE_CENTS[role],
        extra_subtotal_cents: extrasSubtotalCents,
      });
      traineesTotalCents += extrasSubtotalCents;
    }
  }

  // ── Geography per-diem ──────────────────────────────────────
  const tier = distanceTier(distance_km);
  let perDiemRate;
  if (tier === 'KM_OVER_200') {
    perDiemRate =
      per_diem_rate_cents_per_day != null
        ? Math.max(0, Math.round(Number(per_diem_rate_cents_per_day)))
        : DEFAULT_PER_DIEM_RATES_CENTS_PER_DAY.KM_OVER_200_DEFAULT;
  } else {
    perDiemRate = DEFAULT_PER_DIEM_RATES_CENTS_PER_DAY[tier];
  }
  const perDiemTotalCents = perDiemRate * days;

  // ── Flight (pass-through for >200km when required) ──────────
  let flightCents = 0;
  let flightBreakdown = { required: false, actual_cost_cents: 0, carrier_notes: null };
  if (flight && flight.required) {
    const c = Math.max(0, Math.round(Number(flight.actual_cost_cents) || 0));
    flightCents = c;
    flightBreakdown = {
      required: true,
      actual_cost_cents: c,
      carrier_notes: flight.carrier_notes ? String(flight.carrier_notes) : null,
    };
  }

  // ── Subtotal ────────────────────────────────────────────────
  const subtotalCents = BASE_PACKAGE_CENTS + traineesTotalCents + perDiemTotalCents + flightCents;

  return {
    subtotal_cents: subtotalCents,
    breakdown: {
      base_package_cents: BASE_PACKAGE_CENTS,
      trainees: traineesBreakdown,
      trainees_total_cents: traineesTotalCents,
      location: {
        distance_km: Math.max(0, Number(distance_km) || 0),
        tier,
      },
      training_days: days,
      per_diem: {
        rate_cents_per_day: perDiemRate,
        days,
        subtotal_cents: perDiemTotalCents,
        tier,
      },
      flight: flightBreakdown,
    },
  };
}

module.exports = {
  computeTrainingQuote,
  distanceTier,
  VALID_ROLES,
  PER_ROLE_CENTS,
  BASE_PACKAGE_CENTS,
  BASE_PACKAGE_INCLUDES,
  DEFAULT_PER_DIEM_RATES_CENTS_PER_DAY,
};
