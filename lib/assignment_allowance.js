'use strict';

/**
 * lib/assignment_allowance.js — §131.3 / G5 (DECISIONS §144).
 *
 * Computes and PERSISTS the payroll-grade daily CCQ travel allowance (integer
 * cents) onto assignment_requests.allowance_cents. This is the column reserved
 * (NULL) by migration 027 until distances became payroll-grade; the §144 road
 * distance service (lib/road_distance.js — Google Routes) makes them so now.
 *
 * The allowance is a function of, in order of anti-tamper importance:
 *   1. snapshot_ccq_sector — the project's CCQ sector AS IT WAS at assignment
 *      time (§132). Never the live project sector, so a later project edit
 *      cannot retroactively change a past assignment's allowance.
 *   2. the REAL road distance (distance_km, from Google Routes) — the same
 *      number the employee verifies on Google Maps, so the figure is
 *      dispute-proof.
 *   3. the rate row effective on the assignment's start_date — ccq_travel_rates
 *      changes roughly every 4 years with the collective agreement, so the rate
 *      used must be the one in force on the work date, not "today".
 *
 * Money is integer CENTS (project convention). Never throws — a failure leaves
 * allowance_cents untouched and logs.
 */

const { loadRateTable, allowanceCentsFor } = require('./ccq_travel');

/**
 * Map a project sector to the ccq_travel_rates sector vocabulary.
 *
 *   projects.ccq_sector       ∈ { IC, INDUSTRIAL, RESIDENTIAL }
 *   ccq_travel_rates.sector   ∈ { IC, I,          RESIDENTIAL }
 *
 * Without this mapping an INDUSTRIAL project would match zero rate rows and
 * silently yield a $0 allowance — a payroll bug. INDUSTRIAL → 'I'.
 *
 * @param {string} projectSector
 * @returns {'IC'|'I'|'RESIDENTIAL'}
 */
function rateSectorFor(projectSector) {
  switch (projectSector) {
    case 'INDUSTRIAL':
      return 'I';
    case 'RESIDENTIAL':
      return 'RESIDENTIAL';
    case 'IC':
    default:
      return 'IC';
  }
}

/**
 * Compute the daily allowance (cents) for an assignment and write it to
 * allowance_cents. Reads the snapshot sector + employee trade + start_date
 * from the row; the road distance is passed in (the caller already computed
 * and stored distance_km, so we don't re-bill the distance provider).
 *
 * @param {{query: Function}} db          req.db or in-tx pg client
 * @param {number|string} assignmentId    assignment_requests.id
 * @param {number|string} companyId       tenant id
 * @param {number} roadKm                 real road distance (km)
 * @returns {Promise<number|null>}        cents written, or null if not computable
 */
async function computeAndPersistAllowance(db, assignmentId, companyId, roadKm) {
  try {
    const km = Number(roadKm);
    if (!Number.isFinite(km)) return null;

    const { rows } = await db.query(
      `SELECT ar.start_date, ar.snapshot_ccq_sector, ep.trade_code
         FROM public.assignment_requests ar
         JOIN public.employee_profiles ep
           ON ep.employee_id = ar.requested_for_employee_id
        WHERE ar.id = $1 AND ar.company_id = $2
        LIMIT 1`,
      [assignmentId, companyId]
    );
    const a = rows[0];
    if (!a) return null;

    const onDate =
      a.start_date instanceof Date
        ? a.start_date.toISOString().slice(0, 10)
        : String(a.start_date).slice(0, 10);
    const sector = rateSectorFor(a.snapshot_ccq_sector || 'IC');

    const rates = await loadRateTable(db, onDate, sector);
    const cents = allowanceCentsFor(rates, a.trade_code, km);

    await db.query(
      `UPDATE public.assignment_requests
          SET allowance_cents = $1
        WHERE id = $2 AND company_id = $3`,
      [cents, assignmentId, companyId]
    );
    return cents;
  } catch (err) {
    console.error('computeAndPersistAllowance error:', err.message);
    return null;
  }
}

module.exports = { computeAndPersistAllowance, rateSectorFor };
