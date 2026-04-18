function requireAdminKey(req, res, next) {
  const expected = process.env.ADMIN_API_KEY;

  if (!expected) {
    return res.status(500).json({ error: "ADMIN_API_KEY is not configured" });
  }

  // Accept:
  // - x-api-key: <key>
  // - authorization: Bearer <key>
  const xKey = req.headers["x-api-key"];
  const auth = req.headers["authorization"];

  let provided = null;

  if (typeof xKey === "string" && xKey.trim()) {
    provided = xKey.trim();
  } else if (typeof auth === "string" && auth.toLowerCase().startsWith("bearer ")) {
    provided = auth.slice(7).trim();
  }

  if (!provided || provided !== expected) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  return next();
}

module.exports = { requireAdminKey };
