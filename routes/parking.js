"use strict";

// routes/parking.js
// PostgreSQL —     

const express = require("express");
const path = require("path");
const multer = require("multer");
const { pool } = require("../db");

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, "..", "uploads");

// ---    ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const name = "park_" + Date.now().toString(36) + Math.random().toString(36).slice(2) + ext;
    cb(null, name);
  }
});

function fileFilter(req, file, cb) {
  const mime = (file.mimetype || "").toLowerCase();
  const ok =
    mime === "application/pdf" ||
    mime === "image/jpeg"      ||
    mime === "image/png"       ||
    mime === "image/webp";
  if (!ok) return cb(new Error("unsupported file type"));
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10 MB
});

// --- Helpers ---
function getCompanyId(req) {
  const cid = req.user && req.user.company_id;
  return cid != null ? Number(cid) : null;
}

function getEmployeeId(req) {
  const eid = req.user && req.user.employee_id;
  return eid != null ? Number(eid) : null;
}

// -----------------------------------------------
// POST /parking/claim
//       
// -----------------------------------------------
router.post("/parking/claim", upload.single("receipt"), async (req, res) => {
  try {
    const companyId  = getCompanyId(req);
    const employeeId = getEmployeeId(req);

    if (!companyId)  return res.status(403).json({ ok: false, error: "COMPANY_CONTEXT_REQUIRED" });
    if (!employeeId) return res.status(403).json({ ok: false, error: "EMPLOYEE_CONTEXT_REQUIRED" });

    const { project_id, amount, note } = req.body;

    if (!project_id) return res.status(400).json({ ok: false, error: "project_id is required" });
    if (!amount)     return res.status(400).json({ ok: false, error: "amount is required" });
    if (!req.file)   return res.status(400).json({ ok: false, error: "receipt file is required" });

    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ ok: false, error: "amount must be a positive number" });
    }

    //      
    const proj = await pool.query(
      "SELECT id FROM public.projects WHERE id = $1 AND company_id = $2 LIMIT 1",
      [Number(project_id), companyId]
    );
    if (!proj.rows.length) {
      return res.status(404).json({ ok: false, error: "PROJECT_NOT_FOUND" });
    }

    //  : receipt_ref =   submitted_at =  
    const ins = await pool.query(
      `INSERT INTO public.parking_claims
        (company_id, employee_id, project_id, amount, note,
         receipt_ref, receipt_mimetype, receipt_size, status, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'NEW', NOW())
       RETURNING id, status, receipt_ref AS receipt_filename, submitted_at AS created_at`,
      [
        companyId,
        employeeId,
        Number(project_id),
        Math.round(amt * 100) / 100,
        note ? String(note) : null,
        req.file.filename,
        req.file.mimetype,
        req.file.size,
      ]
    );

    const claim = ins.rows[0];
    return res.json({
      ok: true,
      message: "parking claim created",
      claim_id: claim.id,
      status: claim.status,
      receipt_filename: claim.receipt_filename,
      created_at: claim.created_at,
    });
  } catch (err) {
    console.error("POST /parking/claim error:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR", message: err.message });
  }
});

// -----------------------------------------------
// GET /parking/by-project?project_id=X
//     
// -----------------------------------------------
router.get("/parking/by-project", async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) return res.status(403).json({ ok: false, error: "COMPANY_CONTEXT_REQUIRED" });

    const projectId = Number(req.query.project_id || "");
    if (!projectId) return res.status(400).json({ ok: false, error: "project_id is required" });

    const { rows } = await pool.query(
      `SELECT
         pc.id,
         pc.employee_id,
         pc.project_id,
         pc.amount,
         pc.currency,
         pc.note,
         pc.receipt_ref       AS receipt_filename,
         pc.receipt_mimetype,
         pc.receipt_size,
         pc.status,
         pc.submitted_at      AS created_at,
         pc.updated_at,
         TRIM(COALESCE(e.first_name,'') || ' ' || COALESCE(e.last_name,'')) AS employee_name
       FROM public.parking_claims pc
       LEFT JOIN public.employees e ON e.id = pc.employee_id
       WHERE pc.company_id = $1 AND pc.project_id = $2
       ORDER BY pc.submitted_at DESC`,
      [companyId, projectId]
    );

    return res.json({ ok: true, project_id: projectId, count: rows.length, items: rows });
  } catch (err) {
    console.error("GET /parking/by-project error:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR", message: err.message });
  }
});

// -----------------------------------------------
// POST /parking/update-status  (ADMIN/PM )
// -----------------------------------------------
router.post("/parking/update-status", async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) return res.status(403).json({ ok: false, error: "COMPANY_CONTEXT_REQUIRED" });

    const role = String((req.user && req.user.role) || "").toUpperCase();
    if (!["ADMIN", "PM"].includes(role)) {
      return res.status(403).json({ ok: false, error: "FORBIDDEN_ROLE" });
    }

    const { claim_id, status } = req.body;
    if (!claim_id) return res.status(400).json({ ok: false, error: "claim_id is required" });

    const allowed = ["NEW", "APPROVED", "REJECTED", "PAID"];
    if (!allowed.includes(String(status || ""))) {
      return res.status(400).json({ ok: false, error: "invalid status", allowed });
    }

    const upd = await pool.query(
      `UPDATE public.parking_claims
       SET status = $1, updated_at = NOW()
       WHERE id = $2 AND company_id = $3
       RETURNING id, status, updated_at`,
      [String(status), Number(claim_id), companyId]
    );

    if (!upd.rows.length) {
      return res.status(404).json({ ok: false, error: "CLAIM_NOT_FOUND" });
    }

    const claim = upd.rows[0];
    return res.json({
      ok: true,
      message: "status updated",
      claim_id: claim.id,
      status: claim.status,
      updated_at: claim.updated_at,
    });
  } catch (err) {
    console.error("POST /parking/update-status error:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR", message: err.message });
  }
});

module.exports = router;
