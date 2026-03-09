"use strict";

const express = require("express");
const router = express.Router();
const { pool } = require("../db");

// POST / —   (ADMIN  company_id   token    body)
router.post("/", async (req, res) => {
  try {
    // company_id    token —    
    const companyId = req.user?.company_id ? Number(req.user.company_id) : null;
    if (!companyId) {
      return res.status(403).json({ ok: false, error: "COMPANY_CONTEXT_REQUIRED" });
    }

    const { employee_number, full_name, phone, role = "Employee" } = req.body;

    if (!employee_number || !full_name || !phone) {
      return res.status(400).json({ ok: false, error: "missing_required_fields" });
    }

    const result = await pool.query(
      `INSERT INTO public.employee_profiles
        (employee_number, full_name, phone, role_code, company_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [employee_number, full_name, phone, role, companyId]
    );

    return res.json({ ok: true, employee: result.rows[0] });
  } catch (err) {
    console.error("create employee error:", err);
    return res.status(500).json({ ok: false, error: "create_employee_failed" });
  }
});

module.exports = router;
