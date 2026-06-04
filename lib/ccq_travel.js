'use strict';

/**
 * lib/ccq_travel.js
 *
 * Section 131 (Phase 1 of the assignments redesign) — CCQ travel
 * allowance ("frais de déplacement") estimation for the bulk-assign
 * wizard's financial optimization.
 *
 * Rates source: the EXISTING global `ccq_travel_rates` table (managed
 * by SUPER_ADMIN via routes/ccq_rates.js, expiry-watched by
 * jobs/ccqRatesReminderJob.js). Columns: trade_code, sector
 * (IC/I/RESIDENTIAL), min_km, rate_cad, effective_from/effective_to.
 * NOTHING is hardcoded here — admins update rates when the collective
 * agreements change.
 *
 * Bracket semantics: a row means "rate applies when the distance is
 * MORE THAN min_km" (CCQ wording: « plus de 90 km »). For a given
 * trade + distance the highest matching min_km wins. Trade fallback:
 * exact trade_code → 'GENERAL' → no allowance.
 *
 * Distance basis:
 *   The official CCQ reference for distance disputes is the Google
 *   Maps ROAD distance between the employee's home and the site. We
 *   only have coordinates (PostGIS home_location + project site
 *   lat/lng), so v1 ESTIMATES road distance as:
 *
 *       road_km ≈ haversine_km × ROAD_FACTOR (1.3)
 *
 *   1.3 is the commonly used road-network detour index. All amounts
 *   produced here are therefore labeled estimates in the UI. Backlog:
 *   Mapbox Matrix API for true driving distances before payroll use.
 *
 * Money is integer CENTS (project convention).
 */

const ROAD_FACTOR = 1.3;

/**
 * Estimate road km from a straight-line (haversine) distance.
 * @param {number} haversineKm
 * @returns {number} rounded estimated road km
 */
function estimateRoadKm(haversineKm) {
  if (!Number.isFinite(haversineKm) || haversineKm < 0) return 0;
  return Math.round(haversineKm * ROAD_FACTOR);
}

/**
 * Load the rate rows effective on a date (one query — callers annotate
 * many employees against the same table in memory).
 *
 * @param {{query: Function}} db   req.db (table is global config, no RLS)
 * @param {string} onDate          'YYYY-MM-DD'
 * @param {string} [sector='IC']   IC | I | RESIDENTIAL
 * @returns {Promise<Array<{trade_code: string, min_km: number, rate_cents: number}>>}
 */
async function loadRateTable(db, onDate, sector = 'IC') {
  const { rows } = await db.query(
    `SELECT trade_code, min_km, rate_cad
       FROM public.ccq_travel_rates
      WHERE sector = $1
        AND effective_from <= $2
        AND effective_to   >= $2`,
    [sector, onDate]
  );
  return rows.map((r) => ({
    trade_code: r.trade_code,
    min_km: Number(r.min_km),
    rate_cents: Math.round(Number(r.rate_cad) * 100),
  }));
}

/**
 * Daily allowance (integer cents) for a trade + estimated road km,
 * against a pre-loaded rate table. Highest matching min_km wins;
 * falls back to the GENERAL trade when the exact trade has no rows.
 *
 * @param {Array} rates      output of loadRateTable
 * @param {string} tradeCode employee trade (e.g. 'ELECTRICAL')
 * @param {number} roadKm
 * @returns {number} cents per worked day (0 when below every bracket)
 */
function allowanceCentsFor(rates, tradeCode, roadKm) {
  if (!Number.isFinite(roadKm) || !Array.isArray(rates) || !rates.length) return 0;
  const pick = (code) =>
    rates
      .filter((r) => r.trade_code === code && roadKm > r.min_km)
      .sort((a, b) => b.min_km - a.min_km)[0] || null;
  const row = pick(tradeCode) || pick('GENERAL');
  return row ? row.rate_cents : 0;
}

module.exports = {
  ROAD_FACTOR,
  estimateRoadKm,
  loadRateTable,
  allowanceCentsFor,
};
