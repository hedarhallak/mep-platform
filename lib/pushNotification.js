"use strict";
const { pool } = require("../db");

async function sendPushNotification(userId, title, body, data = {}) {
  try {
    const result = await pool.query(
      "SELECT token FROM public.push_tokens WHERE user_id = $1 LIMIT 1",
      [userId]
    );
    if (!result.rows.length) return;

    const token = result.rows[0].token;
    if (!token.startsWith("ExponentPushToken[")) return;

    const message = {
      to: token,
      sound: "default",
      title,
      body,
      data,
      priority: "high",
    };

    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      body: JSON.stringify(message),
    });
  } catch (err) {
    console.error("Push notification error:", err);
  }
}

module.exports = { sendPushNotification };
