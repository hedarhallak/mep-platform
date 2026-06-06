'use strict';

/**
 * lib/assignment_snapshot.js — §132 anti-tamper (DECISIONS §136).
 *
 * Captures the project's site location ONTO an assignment_requests row at the
 * moment the assignment is created (or moved to a different project). The CCQ
 * travel allowance is then a function of the location as it was WHEN THE WORK
 * WAS ASSIGNED, not the project's current address — so a later edit to the
 * project address cannot retroactively change a past assignment's allowance.
 *
 * One UPDATE...FROM keeps every creation site DRY: callers just await this
 * right after the INSERT (or after a project change) instead of widening five
 * different INSERT column lists. Works on either a request-scoped client
 * (`req.db`, GUC set by tenantDb) or an explicit transaction client that has
 * already run `SELECT set_config('app.company_id', …, true)` (auto-confirm).
 *
 * The explicit `company_id` predicates are defense-in-depth on top of RLS.
 */

/**
 * Snapshot the project's location fields onto an assignment row.
 *
 * @param {{query: Function}} db          req.db or an in-transaction pg client
 * @param {number|string} assignmentId    assignment_requests.id
 * @param {number|string} companyId       tenant id (req.user.company_id)
 * @returns {Promise<void>}
 */
async function snapshotAssignmentLocation(db, assignmentId, companyId) {
  await db.query(
    `UPDATE public.assignment_requests ar
        SET snapshot_site_lat    = p.site_lat,
            snapshot_site_lng    = p.site_lng,
            snapshot_ccq_sector  = p.ccq_sector,
            snapshot_captured_at = NOW()
       FROM public.projects p
      WHERE ar.id = $1
        AND ar.company_id = $2
        AND p.id = ar.project_id
        AND p.company_id = ar.company_id`,
    [assignmentId, companyId]
  );
}

module.exports = { snapshotAssignmentLocation };
