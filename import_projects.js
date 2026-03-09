// import_projects.js
"use strict";

const fs = require("fs");
const path = require("path");
const { pool } = require("./db");

function pick(obj, keys) {
  for (const k of keys) if (obj[k] != null && obj[k] !== "") return obj[k];
  return null;
}

async function detectColumns(tableName) {
  const colsRes = await pool.query(
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name=$1
    ORDER BY ordinal_position
  `,
    [tableName]
  );
  return new Set(colsRes.rows.map((r) => r.column_name));
}

async function tableExists(name) {
  const r = await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1 LIMIT 1`,
    [name]
  );
  return r.rowCount > 0;
}

async function pickDefaultIdFromTable(options) {
  const { envKey, tables, preferCode, preferNameLike } = options;

  if (process.env[envKey]) {
    const v = Number(process.env[envKey]);
    if (!Number.isNaN(v) && v > 0) return v;
  }

  for (const t of tables) {
    if (!(await tableExists(t))) continue;

    const colset = await detectColumns(t);
    if (!colset.has("id")) continue;

    if (preferCode && colset.has("code")) {
      const r = await pool.query(`SELECT id FROM public.${t} WHERE UPPER(code) = $1 LIMIT 1`, [preferCode.toUpperCase()]);
      if (r.rowCount) return Number(r.rows[0].id);
    }

    if (preferNameLike && colset.has("name")) {
      const r = await pool.query(`SELECT id FROM public.${t} WHERE UPPER(name) LIKE $1 ORDER BY id LIMIT 1`, [
        `%${preferNameLike.toUpperCase()}%`,
      ]);
      if (r.rowCount) return Number(r.rows[0].id);
    }

    // If there is exactly one row, use it
    const onlyOne = await pool.query(`SELECT id FROM public.${t} ORDER BY id LIMIT 2`);
    if (onlyOne.rowCount === 1) return Number(onlyOne.rows[0].id);
  }

  return null;
}

async function main() {
  const filePath = path.join(__dirname, "data", "projects.json");
  if (!fs.existsSync(filePath)) {
    console.error("Missing file:", filePath);
    process.exit(1);
  }

  const raw = fs.readFileSync(filePath, "utf8");
  const data = JSON.parse(raw);
  const rows = Array.isArray(data) ? data : data.projects || [];
  if (!Array.isArray(rows) || rows.length === 0) {
    console.error("projects.json is empty or invalid format. Expected array or {projects:[...] }");
    process.exit(1);
  }

  const cols = await detectColumns("projects");

  const codeCol = cols.has("project_code") ? "project_code" : cols.has("code") ? "code" : null;
  if (!codeCol) throw new Error('public.projects must have "project_code" or "code" column.');

  const nameCol = cols.has("name") ? "name" : cols.has("project_name") ? "project_name" : cols.has("title") ? "title" : null;

  const tradeTypeCol = cols.has("trade_type_id") ? "trade_type_id" : null;
  const statusCol = cols.has("status_id") ? "status_id" : null;
  const clientCol = cols.has("client_id") ? "client_id" : null;

  const latCol = cols.has("site_lat") ? "site_lat" : cols.has("lat") ? "lat" : cols.has("latitude") ? "latitude" : null;
  const lngCol = cols.has("site_lng") ? "site_lng" : cols.has("lng") ? "lng" : cols.has("longitude") ? "longitude" : null;

  const radiusCol = cols.has("radius_m") ? "radius_m" : cols.has("geofence_radius_m") ? "geofence_radius_m" : null;

  const shiftStartCol = cols.has("shift_start") ? "shift_start" : cols.has("shift_start_time") ? "shift_start_time" : null;
  const shiftEndCol = cols.has("shift_end") ? "shift_end" : cols.has("shift_end_time") ? "shift_end_time" : null;

  // Defaults for NOT NULL FK columns
  let defaultTradeTypeId = null;
  if (tradeTypeCol) {
    defaultTradeTypeId = await pickDefaultIdFromTable({
      envKey: "DEFAULT_TRADE_TYPE_ID",
      tables: ["trade_types", "trade_type", "trades"],
      preferCode: "PLUMBING",
      preferNameLike: "PLUMB",
    });
    if (!defaultTradeTypeId) {
      throw new Error("projects.trade_type_id is NOT NULL. Set DEFAULT_TRADE_TYPE_ID env var or ensure a single/default trade type exists.");
    }
  }

  let defaultStatusId = null;
  if (statusCol) {
    defaultStatusId = await pickDefaultIdFromTable({
      envKey: "DEFAULT_STATUS_ID",
      tables: ["statuses", "status", "project_statuses", "project_status"],
      preferCode: "ACTIVE",
      preferNameLike: "ACTIVE",
    });
    if (!defaultStatusId) {
      throw new Error("projects.status_id is NOT NULL. Set DEFAULT_STATUS_ID env var or ensure a single/default status exists.");
    }
  }

  let defaultClientId = null;
  if (clientCol) {
    defaultClientId = await pickDefaultIdFromTable({
      envKey: "DEFAULT_CLIENT_ID",
      tables: ["clients", "client"],
      // no strong preference; if only one client exists it will pick it
      preferCode: null,
      preferNameLike: null,
    });
    if (!defaultClientId) {
      throw new Error("projects.client_id is NOT NULL. Set DEFAULT_CLIENT_ID env var or ensure at least one client exists.");
    }
  }

  const insertCols = [codeCol];
  if (nameCol) insertCols.push(nameCol);
  if (tradeTypeCol) insertCols.push(tradeTypeCol);
  if (statusCol) insertCols.push(statusCol);
  if (clientCol) insertCols.push(clientCol);
  if (latCol) insertCols.push(latCol);
  if (lngCol) insertCols.push(lngCol);
  if (radiusCol) insertCols.push(radiusCol);
  if (shiftStartCol) insertCols.push(shiftStartCol);
  if (shiftEndCol) insertCols.push(shiftEndCol);

  const updateCols = insertCols.filter((c) => c !== codeCol);
  const setClause = updateCols.length ? updateCols.map((c) => `${c}=EXCLUDED.${c}`).join(", ") : null;

  let inserted = 0, updated = 0, skipped = 0;

  for (const p of rows) {
    const projectCode = pick(p, ["project_code", "code", "id", "projectId", "project_id", "project_number", "number"]);
    if (projectCode == null) { skipped++; continue; }

    const projectName = pick(p, ["name", "project_name", "title"]);
    const siteLat = pick(p, ["site_lat", "lat", "latitude"]);
    const siteLng = pick(p, ["site_lng", "lng", "longitude"]);
    const radiusM = pick(p, ["radius_m", "geofence_radius_m"]);
    const shiftStart = pick(p, ["shift_start", "shift_start_time"]);
    const shiftEnd = pick(p, ["shift_end", "shift_end_time"]);

    // Optional: allow project JSON to provide client_id directly later
    const clientIdFromJson = pick(p, ["client_id", "clientId"]);

    const valByCol = {};
    valByCol[codeCol] = String(projectCode);
    if (nameCol) valByCol[nameCol] = projectName != null ? String(projectName) : null;
    if (tradeTypeCol) valByCol[tradeTypeCol] = defaultTradeTypeId;
    if (statusCol) valByCol[statusCol] = defaultStatusId;
    if (clientCol) valByCol[clientCol] = clientIdFromJson != null ? Number(clientIdFromJson) : defaultClientId;
    if (latCol) valByCol[latCol] = siteLat != null ? Number(siteLat) : null;
    if (lngCol) valByCol[lngCol] = siteLng != null ? Number(siteLng) : null;
    if (radiusCol) valByCol[radiusCol] = radiusM != null ? Number(radiusM) : null;
    if (shiftStartCol) valByCol[shiftStartCol] = shiftStart != null ? String(shiftStart) : null;
    if (shiftEndCol) valByCol[shiftEndCol] = shiftEnd != null ? String(shiftEnd) : null;

    const values = insertCols.map((c) => valByCol[c] ?? null);
    const params = values.map((_, i) => `$${i + 1}`);

    const exists = await pool.query(`SELECT 1 FROM public.projects WHERE ${codeCol} = $1 LIMIT 1`, [String(projectCode)]);

    const sql = `
      INSERT INTO public.projects (${insertCols.join(", ")})
      VALUES (${params.join(", ")})
      ON CONFLICT (${codeCol})
      ${setClause ? `DO UPDATE SET ${setClause}` : "DO NOTHING"}
      RETURNING 1
    `;

    await pool.query(sql, values);

    if (exists.rowCount === 0) inserted++;
    else updated++;
  }

  console.log("Import complete.");
  console.log({ inserted, updated, skipped, total: rows.length, defaultTradeTypeId, defaultStatusId, defaultClientId });

  await pool.end();
}

main().catch(async (e) => {
  console.error("IMPORT FAILED:", e.message);
  try { await pool.end(); } catch {}
  process.exit(1);
});
