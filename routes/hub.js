"use strict";
const { sendPushNotification } = require("../lib/pushNotification");

// routes/hub.js
// Task & Blueprint messaging system with smart delivery
//
// POST   /api/hub/messages              — send task/blueprint
// GET    /api/hub/messages/sent         — sender: messages I sent
// GET    /api/hub/messages/inbox        — recipient: messages I received
// GET    /api/hub/messages/unread-count — unread badge count
// PATCH  /api/hub/messages/:id/read     — mark as read
// PATCH  /api/hub/messages/:id/ack      — mark as done
// GET    /api/hub/workers               — all company workers (not just assigned)
// GET    /api/hub/my-projects           — sender's active projects

const express  = require("express");
const router   = express.Router();
const path     = require("path");
const fs       = require("fs");
const multer   = require("multer");
const { pool } = require("../db");
const { can, logAudit } = require("../middleware/permissions");

// ── File Upload Setup ─────────────────────────────────────────
const UPLOAD_DIR = path.join(__dirname, "../uploads/hub");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename:    (req, file, cb) => {
    const ext  = path.extname(file.originalname);
    const name = `${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only PDF and images are allowed'));
  },
});

// ── GET /api/hub/my-projects ──────────────────────────────────
// Returns projects the sender is currently active on
router.get("/my-projects", can("hub.send_tasks"), async (req, res) => {
  try {
    const companyId  = req.user.company_id;
    const employeeId = req.user.employee_id;

    // Get projects where sender has active assignment OR is a foreman
    const result = await pool.query(`
      SELECT DISTINCT
        p.id,
        p.project_code,
        p.project_name
      FROM public.projects p
      WHERE p.company_id = $1

        AND (
          EXISTS (
            SELECT 1 FROM public.assignment_requests a
            WHERE a.project_id = p.id
              AND a.requested_for_employee_id = $2
              AND (a.end_date IS NULL OR a.end_date >= CURRENT_DATE) AND a.status = 'APPROVED'
          )
          OR EXISTS (
            SELECT 1 FROM public.project_foremen pf
            WHERE pf.project_id = p.id
              AND pf.employee_id = $2
          )
        )
      ORDER BY p.project_code
    `, [companyId, employeeId]);

    // If no projects found (e.g. COMPANY_ADMIN), return all active projects
    if (result.rows.length === 0) {
      const all = await pool.query(`
        SELECT id, project_code, project_name
        FROM public.projects
        WHERE company_id = $1
        ORDER BY project_code
      `, [companyId]);
      return res.json({ ok: true, projects: all.rows });
    }

    res.json({ ok: true, projects: result.rows });
  } catch (err) {
    console.error("GET /hub/my-projects error:", err);
    res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

// ── GET /api/hub/workers ──────────────────────────────────────
// ALL workers in company — shows assignment status per project
router.get("/workers", can("hub.send_tasks"), async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const projectId = req.query.project_id ? Number(req.query.project_id) : null;

    const result = await pool.query(`
      SELECT
        au.id,
        au.username,
        au.role,
        e.id          AS employee_id,
        e.first_name,
        e.last_name,
        ep.trade_code,
        tt.name       AS trade_name,
        -- Is this worker currently assigned to the given project?
        CASE WHEN $2::BIGINT IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.assignment_requests a
          WHERE a.requested_for_employee_id = e.id
            AND a.project_id  = $2::BIGINT
            AND (a.end_date IS NULL OR a.end_date >= CURRENT_DATE) AND a.status = 'APPROVED'
        ) THEN true ELSE false END AS is_assigned
      FROM public.app_users au
      JOIN public.employees       e  ON e.id  = au.employee_id
      LEFT JOIN public.employee_profiles ep ON ep.employee_id = e.id
      LEFT JOIN public.trade_types       tt ON tt.code = ep.trade_code
      WHERE au.company_id = $1
        AND au.is_active  = true
        AND au.role IN ('WORKER', 'JOURNEYMAN', 'APPRENTICE_1', 'APPRENTICE_2', 'APPRENTICE_3', 'APPRENTICE_4', 'DRIVER', 'FOREMAN')
      ORDER BY e.first_name, e.last_name
    `, [companyId, projectId]);

    res.json({ ok: true, workers: result.rows });
  } catch (err) {
    console.error("GET /hub/workers error:", err);
    res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

// ── POST /api/hub/messages ────────────────────────────────────
// Smart delivery:
//   - If worker is assigned to project → status = 'SENT' (deliver immediately)
//   - If not assigned yet → status = 'PENDING' (deliver when assigned)
router.post("/messages", can("hub.send_tasks"), upload.single("file"), async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      title, body, type = "TASK", priority = "NORMAL",
      project_id, due_date, recipient_ids,
    } = req.body;

    const companyId = req.user.company_id;
    const senderId  = req.user.user_id;

    if (!title?.trim()) {
      return res.status(400).json({ ok: false, error: "TITLE_REQUIRED" });
    }

    let recipients = [];
    try {
      recipients = JSON.parse(recipient_ids);
    } catch {
      recipients = String(recipient_ids || '').split(',').map(Number).filter(Boolean);
    }

    if (!recipients.length) {
      return res.status(400).json({ ok: false, error: "RECIPIENTS_REQUIRED" });
    }

    const projectIdNum = project_id ? Number(project_id) : null;
    const file         = req.file;
    const fileUrl      = file ? `/hub/${file.filename}` : null;
    const fileName     = file ? file.originalname : null;
    const fileType     = file ? file.mimetype : null;

    // Check which recipients are currently assigned to this project
    let assignedEmployees = new Set();
    if (projectIdNum) {
      const assigned = await pool.query(`
        SELECT a.requested_for_employee_id
        FROM public.assignment_requests a
        JOIN public.app_users au ON au.employee_id = a.requested_for_employee_id
        WHERE a.project_id = $1
          AND au.id = ANY($2::BIGINT[])
          AND (a.end_date IS NULL OR a.end_date >= CURRENT_DATE) AND a.status = 'APPROVED'
      `, [projectIdNum, recipients]);
      assignedEmployees = new Set(assigned.rows.map(r => r.employee_id));
    }

    await client.query("BEGIN");

    // Determine overall delivery status
    const allAssigned     = projectIdNum
      ? recipients.every(id => {
          // We need to check by app_user id -> employee_id mapping
          return true; // Will check per-recipient below
        })
      : true;

    // Get employee_id for each recipient (app_user id)
    const empMap = await client.query(`
      SELECT id AS user_id, employee_id
      FROM public.app_users
      WHERE id = ANY($1::BIGINT[])
    `, [recipients]);
    const userToEmployee = {};
    for (const row of empMap.rows) {
      userToEmployee[row.user_id] = row.employee_id;
    }

    const hasPending = projectIdNum && recipients.some(uid => {
      const empId = userToEmployee[uid];
      return empId && !assignedEmployees.has(empId);
    });

    const deliveryStatus = hasPending ? 'PENDING_ASSIGNMENT' : 'SENT';

    // Insert message
    const msgRes = await client.query(`
      INSERT INTO public.task_messages
        (company_id, project_id, sender_id, type, title, body,
         file_url, file_name, file_type, priority, due_date)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id
    `, [
      companyId, projectIdNum, senderId,
      type.toUpperCase(), title.trim(), body?.trim() || null,
      fileUrl, fileName, fileType,
      priority.toUpperCase(), due_date || null,
    ]);

    const messageId = msgRes.rows[0].id;

    // Insert recipients with smart status
    let sentCount    = 0;
    let pendingCount = 0;

    for (const userId of recipients) {
      const empId = userToEmployee[userId];
      const isAssigned = !projectIdNum || (empId && assignedEmployees.has(empId));
      const recipientStatus = isAssigned ? 'SENT' : 'PENDING';

      if (isAssigned) sentCount++;
      else            pendingCount++;

      await client.query(`
        INSERT INTO public.task_recipients
          (message_id, recipient_id, status, expected_project_id)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT DO NOTHING
      `, [
        messageId,
        userId,
        recipientStatus,
        isAssigned ? null : projectIdNum,
      ]);
    }

    logAudit(req, "SEND_TASK", "task_messages", messageId, null, {
      type, title, sent: sentCount, pending: pendingCount,
    });

    await client.query("COMMIT");

    for (const recipientId of recipients) {
      sendPushNotification(recipientId, title, body || '', { type, message_id: messageId }).catch(() => {});
    }

    res.status(201).json({
      ok:           true,
      message_id:   messageId,
      sent:         sentCount,
      pending:      pendingCount,
      delivery_status: deliveryStatus,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    if (req.file) fs.unlink(req.file.path, () => {});
    console.error("POST /hub/messages error:", err);
    res.status(500).json({ ok: false, error: err.message || "SERVER_ERROR" });
  } finally {
    client.release();
  }
});

// ── GET /api/hub/messages/sent ────────────────────────────────
router.get("/messages/sent", can("hub.send_tasks"), async (req, res) => {
  try {
    const senderId = req.user.user_id;
    const limit    = Math.min(Number(req.query.limit) || 50, 200);

    const result = await pool.query(`
      SELECT
        tm.id,
        tm.type,
        tm.title,
        tm.body,
        tm.file_url,
        tm.file_name,
        tm.priority,
        tm.due_date,
        tm.created_at,
        tm.project_id,
        p.project_code,
        p.project_name,
        COUNT(tr.id)                                              AS total_recipients,
        COUNT(CASE WHEN tr.status = 'ACKNOWLEDGED' THEN 1 END)   AS acknowledged_count,
        COUNT(CASE WHEN tr.status = 'READ'         THEN 1 END)   AS read_count,
        COUNT(CASE WHEN tr.status = 'SENT'         THEN 1 END)   AS delivered_count,
        COUNT(CASE WHEN tr.status = 'PENDING'      THEN 1 END)   AS pending_count,
        NULL::text AS delivery_status
      FROM public.task_messages tm
      LEFT JOIN public.projects        p  ON p.id = tm.project_id
      LEFT JOIN public.task_recipients tr ON tr.message_id = tm.id
      WHERE tm.sender_id = $1
      GROUP BY tm.id, p.project_code, p.project_name
      ORDER BY tm.created_at DESC
      LIMIT $2
    `, [senderId, limit]);

    // For each message, get recipient details
    const messages = [];
    for (const msg of result.rows) {
      const recipients = await pool.query(`
        SELECT
          tr.status,
          tr.read_at,
          tr.acknowledged_at,
          tr.completed_at,
          tr.completion_note,
          tr.completion_image_url,
          tr.expected_project_id,
          au.username,
          e.first_name,
          e.last_name
        FROM public.task_recipients tr
        JOIN public.app_users au ON au.id = tr.recipient_id
        LEFT JOIN public.employees e ON e.id = au.employee_id
        WHERE tr.message_id = $1
      `, [msg.id]);

      messages.push({ ...msg, recipients: recipients.rows });
    }

    res.json({ ok: true, messages });
  } catch (err) {
    console.error("GET /hub/messages/sent error:", err);
    res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

// ── GET /api/hub/messages/inbox ───────────────────────────────
// Only SENT/READ/ACKNOWLEDGED — not PENDING (not yet delivered)
router.get("/messages/inbox", can("hub.receive_tasks"), async (req, res) => {
  try {
    const recipientId = req.user.user_id;
    const limit       = Math.min(Number(req.query.limit) || 50, 200);

    const result = await pool.query(`
      SELECT
        tm.id,
        tm.type,
        tm.title,
        tm.body,
        tm.file_url,
        tm.file_name,
        tm.file_type,
        tm.priority,
        tm.due_date,
        tm.created_at,
        tm.project_id,
        p.project_code,
        p.project_name,
        tr.status,
        tr.read_at,
        tr.acknowledged_at,
        e.first_name  AS sender_first,
        e.last_name   AS sender_last,
        au.username   AS sender_username
      FROM public.task_recipients tr
      JOIN public.task_messages tm ON tm.id = tr.message_id
      LEFT JOIN public.projects    p  ON p.id  = tm.project_id
      LEFT JOIN public.app_users   au ON au.id = tm.sender_id
      LEFT JOIN public.employees   e  ON e.id  = au.employee_id
      WHERE tr.recipient_id = $1
        AND tr.status != 'PENDING'
      ORDER BY tm.created_at DESC
      LIMIT $2
    `, [recipientId, limit]);

    res.json({ ok: true, messages: result.rows });
  } catch (err) {
    console.error("GET /hub/messages/inbox error:", err);
    res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

// ── GET /api/hub/messages/unread-count ───────────────────────
router.get("/messages/unread-count", can("hub.receive_tasks"), async (req, res) => {
  try {
    const recipientId = req.user.user_id;
    const result = await pool.query(`
      SELECT COUNT(*) AS count
      FROM public.task_recipients
      WHERE recipient_id = $1 AND status = 'SENT'
    `, [recipientId]);
    res.json({ ok: true, count: Number(result.rows[0].count) });
  } catch (err) {
    res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

// ── PATCH /api/hub/messages/:id/read ─────────────────────────
router.patch("/messages/:id/read", can("hub.receive_tasks"), async (req, res) => {
  try {
    await pool.query(`
      UPDATE public.task_recipients
      SET status = 'READ', read_at = NOW()
      WHERE message_id = $1 AND recipient_id = $2 AND status = 'SENT'
    `, [Number(req.params.id), req.user.user_id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

// ── PATCH /api/hub/messages/:id/ack ──────────────────────────
router.patch("/messages/:id/ack", can("hub.receive_tasks"), async (req, res) => {
  try {
    await pool.query(`
      UPDATE public.task_recipients
      SET status = 'ACKNOWLEDGED',
          acknowledged_at = NOW(),
          read_at = COALESCE(read_at, NOW())
      WHERE message_id = $1 AND recipient_id = $2 AND status != 'ACKNOWLEDGED'
    `, [Number(req.params.id), req.user.user_id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

// PATCH /messages/:id/complete
router.patch("/messages/:id/complete", can("hub.receive_tasks"), upload.single("completion_image"), async (req, res) => {
  try {
    const fileUrl = req.file ? `/hub/${req.file.filename}` : null;
    await pool.query(`UPDATE public.task_recipients SET status = 'ACKNOWLEDGED', acknowledged_at = NOW(), completed_at = NOW(), completion_image_url = COALESCE($3, completion_image_url), completion_note = COALESCE($4, completion_note), read_at = COALESCE(read_at, NOW()) WHERE message_id = $1 AND recipient_id = $2`, [Number(req.params.id), req.user.user_id, fileUrl, req.body.completion_note||null]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});
module.exports = router;
