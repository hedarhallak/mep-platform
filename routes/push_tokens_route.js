'use strict';
const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// POST /api/profile/push-token — save or update push token
router.post('/push-token', async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { token, platform } = req.body || {};

    if (!token) return res.status(400).json({ ok: false, error: 'TOKEN_REQUIRED' });

    await pool.query(
      `INSERT INTO public.push_tokens (user_id, token, platform, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET token = $2, platform = $3, updated_at = NOW()`,
      [userId, token, platform || 'ios']
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error('POST /profile/push-token error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

module.exports = router;
