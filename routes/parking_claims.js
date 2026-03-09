const express = require("express");
const router = express.Router();
const pool = require("../db");
const auth = require("../middleware/auth");

/**
 * POST /api/parking/claims
 * UI body:
 * { work_date, project_id, amount, note }
 *
 * DB columns:
 * employee_id, project_id, amount, currency, receipt_ref, note, status, submitted_at
 *
 * NOTE: work_date is stored inside note as: [work_date=YYYY-MM-DD] ...
 * A UNIQUE INDEX prevents duplicates (employee_id, project_id, amount, extracted work_date)
 */
router.post("/claims", auth, async (req, res) => {
  try {
    const employeeId = req.user.employee_id;
    if (!employeeId) {
      return res.status(400).json({ ok: false, error: "NO_EMPLOYEE_ID" });
    }

    const { work_date, project_id, amount, note } = req.body || {};

    if (!work_date || !project_id || amount == null) {
      return res.status(400).json({ ok: false, error: "MISSING_FIELDS" });
    }

    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ ok: false, error: "INVALID_AMOUNT" });
    }

    const finalNote = `[work_date=${String(work_date)}] ${note ? String(note) : ""}`.trim();

    const { rows } = await pool.query(
      `
      INSERT INTO public.parking_claims (
        employee_id,
        project_id,
        amount,
        currency,
        receipt_ref,
        note,
        status,
        submitted_at
      )
      VALUES ($1, $2, $3::numeric, $4, $5, $6, $7, now())
      RETURNING *
      `,
      [
        employeeId,
        project_id,
        amt,
        "CAD",
        null,
        finalNote || null,
        "PENDING",
      ]
    );

    return res.json({ ok: true, claim: rows[0] });
  } catch (err) {
    // ✅ Friendly duplicate handling (unique index violation)
    if (err && err.code === "23505") {
      return res.status(409).json({ ok: false, error: "DUPLICATE_CLAIM" });
    }

    console.error("POST /api/parking/claims error:", err);
    return res.status(500).json({ ok: false, error: "PARKING_CLAIM_FAILED" });
  }
});

module.exports = router;
