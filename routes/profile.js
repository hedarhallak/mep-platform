/**
 * routes/profile.js
 * Profile – SoT + Field Normalization + Backend Geocoding (Mapbox)
 *
 * Key behaviors:
 * - GET  /api/profile/dropdowns -> trades + ranks
 * - GET  /api/profile/me        -> canonical profile shape (handles legacy columns)
 * - POST /api/profile           -> accepts aliases, stores canonical columns safely (if present)
 */

const express = require("express");
const router = express.Router();
const https = require("https");

const db = require("../db");

// Support different db exports without breaking baseline.
async function q(text, params) {
  if (db && typeof db.query === "function") return db.query(text, params);
  if (db && db.pool && typeof db.pool.query === "function") return db.pool.query(text, params);
  if (db && db.client && typeof db.client.query === "function") return db.client.query(text, params);
  throw new Error("DB_QUERY_NOT_FOUND: expected db.query or db.pool.query");
}

// Profile dropdowns (Single Source of Truth for UI selects)
const PROFILE_TRADES = [
  { code: "PLUMBING", label: "Plumbing" },
  { code: "HVAC", label: "HVAC" },
  { code: "ELECTRICAL", label: "Electrical" },
  { code: "CARPENTRY", label: "Carpentry" },
  { code: "MASONRY", label: "Masonry" },
  { code: "PAINTING", label: "Painting" },
  { code: "GENERAL", label: "General" },
];

const PROFILE_RANKS = [
  { code: "APPRENTICE", label: "Apprentice" },
  { code: "JOURNEYMAN", label: "Journeyman" },
  { code: "FOREMAN", label: "Foreman" },
  { code: "SUPERINTENDENT", label: "Superintendent" },
  { code: "MANAGER", label: "Manager" },
];

let _homeLocationUdt = null;

async function getHomeLocationExpr(lngPlaceholder, latPlaceholder) {
  // Determine column type once (geometry vs geography)
  if (_homeLocationUdt === null) {
    const t = await q(
      "SELECT udt_name FROM information_schema.columns WHERE table_schema='public' AND table_name='employee_profiles' AND column_name='home_location'",
      []
    );
    _homeLocationUdt = (t.rows[0]?.udt_name || "").toLowerCase() || "geometry";
  }

  const isGeog = _homeLocationUdt === "geography";

  return isGeog
    ? `ST_SetSRID(ST_MakePoint(${lngPlaceholder},${latPlaceholder}),4326)::geography`
    : `ST_SetSRID(ST_MakePoint(${lngPlaceholder},${latPlaceholder}),4326)`;
}

function httpsGetJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const json = JSON.parse(data || "{}");
            if (res.statusCode && res.statusCode >= 400) {
              const err = new Error(`HTTP_${res.statusCode}`);
              err.statusCode = res.statusCode;
              err.body = json;
              return reject(err);
            }
            resolve(json);
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", reject);
  });
}

async function geocodeWithMapbox({ home_address, city, postal_code }) {
  const token = process.env.MAPBOX_ACCESS_TOKEN;
  if (!token) {
    const err = new Error("MAPBOX_ACCESS_TOKEN not configured");
    err.code = "GEOCODING_NOT_CONFIGURED";
    throw err;
  }

  const query = `${home_address}, ${city} ${postal_code}`.trim();
  const encoded = encodeURIComponent(query);

  // limit=1 for deterministic result; country=ca for Quebec context
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?access_token=${encodeURIComponent(
    token
  )}&limit=1&country=ca`;

  const json = await httpsGetJson(url);
  const feature = json?.features?.[0];
  const center = feature?.center; // [lng, lat]
  if (!Array.isArray(center) || center.length < 2) return null;

  const lng = Number(center[0]);
  const lat = Number(center[1]);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;

  return { lat, lng, raw: feature };
}

function normStr(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

// Pick first non-empty string from a list of candidate keys
function pickFirstNonEmpty(obj, keys) {
  for (const k of keys) {
    if (obj && Object.prototype.hasOwnProperty.call(obj, k)) {
      const v = normStr(obj[k]);
      if (v) return v;
    }
  }
  return null;
}

function normalizeProfileRow(row) {
  return {
    employee_id: row.employee_id,
    employee_code: row.employee_code,
    first_name: row.first_name,
    last_name: row.last_name,
    is_active: row.is_active,

    role_code: pickFirstNonEmpty(row, ["role_code", "role"]) || null,
    trade_code: pickFirstNonEmpty(row, ["trade_code", "trade"]) || null,
    rank_code: pickFirstNonEmpty(row, ["rank_code", "rank"]) || null,

    phone: pickFirstNonEmpty(row, ["phone", "mobile", "cellphone"]) || null,
    phone_digits: pickFirstNonEmpty(row, ["phone_digits"]) || null,

    home_address:
      pickFirstNonEmpty(row, [
        "home_address",
        "address",
        "address_line1",
        "street",
        "home_street",
        "home_address_street",
      ]) || null,
    home_unit: pickFirstNonEmpty(row, ["home_unit", "unit", "apt", "apartment"]) || null,
    city: pickFirstNonEmpty(row, ["city", "home_city"]) || null,
    postal_code: pickFirstNonEmpty(row, ["postal_code", "postcode", "zip"]) || null,

    emergency_contact_name:
      pickFirstNonEmpty(row, ["emergency_contact_name", "contact_name"]) || null,
    emergency_contact_phone:
      pickFirstNonEmpty(row, ["emergency_contact_phone", "contact_phone"]) || null,
    emergency_contact_phone_digits:
      pickFirstNonEmpty(row, ["emergency_contact_phone_digits"]) || null,
    emergency_contact_relationship:
      pickFirstNonEmpty(row, ["emergency_contact_relationship", "relationship"]) || null,

    home_location: row.home_location || null,
  };
}

let EMP_PROF_COLS_CACHE = null;

async function detectEmployeeProfileColumns() {
  if (EMP_PROF_COLS_CACHE) return EMP_PROF_COLS_CACHE;

  const { rows } = await q(
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='employee_profiles'
    ORDER BY ordinal_position
  `,
    []
  );

  const cols = new Set(rows.map((r) => r.column_name));
  EMP_PROF_COLS_CACHE = cols;
  return cols;
}

router.get("/dropdowns", (req, res) => {
  return res.json({ ok: true, trades: PROFILE_TRADES, ranks: PROFILE_RANKS });
});

router.get("/me", async (req, res) => {
  try {
    const user = req.user || {};
    const employeeIdRaw = user.employee_id ?? user.employeeId ?? null;
    const employee_id = employeeIdRaw ? Number(employeeIdRaw) : null;

    if (!employee_id || Number.isNaN(employee_id)) {
      return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
    }

    const sql = `
      SELECT
        e.id AS employee_id,
        e.employee_code,
        e.first_name,
        e.last_name,
        e.is_active,
        (COALESCE(e.first_name,'') || ' ' || COALESCE(e.last_name,''))::text AS full_name,
        e.email,
        p.*
      FROM public.employees e
      LEFT JOIN public.employee_profiles p ON p.employee_id = e.id
      WHERE e.id = $1
      LIMIT 1
    `;

    const result = await q(sql, [employee_id]);
    const row = (result.rows && result.rows[0]) || null;
    if (!row) return res.status(404).json({ ok: false, error: "NOT_FOUND" });

    const profile = normalizeProfileRow(row);

    const exists = Boolean(
      profile.phone ||
        profile.trade_code ||
        profile.rank_code ||
        profile.home_address ||
        profile.emergency_contact_name ||
        profile.emergency_contact_phone
    );

    return res.json({ ok: true, exists, profile });
  } catch (err) {
    console.error("GET /api/profile/me failed:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

router.post("/", async (req, res) => {
  try {
    const employeeIdRaw =
      (req.user && (req.user.employee_id || req.user.employeeId || req.user.employee_id)) || null;
    const employee_id = employeeIdRaw ? Number(employeeIdRaw) : null;

    if (!employee_id || Number.isNaN(employee_id)) {
      return res.status(401).json({ ok: false, error: "Missing employee_id in token" });
    }

    const role_code = req.user && req.user.role ? String(req.user.role).toUpperCase() : "WORKER";
    const body = req.body || {};

    const trade_code = pickFirstNonEmpty(body, [
      "trade_code",
      "trade",
      "tradeCode",
      "trade_name",
      "tradeName",
    ]);
    const rank_code = pickFirstNonEmpty(body, ["rank_code", "rank", "rankCode", "rank_name", "rankName"]);

    const phone = pickFirstNonEmpty(body, [
      "phone",
      "phone_number",
      "phoneNumber",
      "mobile",
      "mobile_phone",
      "mobilePhone",
      "cellphone",
      "cell_phone",
      "cellPhone",
    ]);

    const contact_email = pickFirstNonEmpty(body, [
      "contact_email",
      "contactEmail",
      "email_contact",
      "emailContact",
      "email",
    ]);

    const home_address = pickFirstNonEmpty(body, [
      "home_address",
      "home_address_street",
      "home_street",
      "street",
      "address",
    ]);

    const home_unit = pickFirstNonEmpty(body, ["home_unit", "unit", "apt", "apartment", "homeUnit"]);
    const city = pickFirstNonEmpty(body, ["city", "home_address_city", "home_city"]);
    const postal_code = pickFirstNonEmpty(body, [
      "postal_code",
      "home_address_postal_code",
      "home_postal_code",
      "zip",
      "zip_code",
      "zipcode",
    ]);

    const province = pickFirstNonEmpty(body, ["province", "prov"]);
    const country = pickFirstNonEmpty(body, ["country"]);

    const emergency_contact_name = pickFirstNonEmpty(body, [
      "emergency_contact_name",
      "emergency_name",
      "contact_name",
    ]);

    const emergency_contact_phone = pickFirstNonEmpty(body, [
      "emergency_contact_phone",
      "emergency_phone",
      "contact_phone",
    ]);

    const emergency_contact_relationship = pickFirstNonEmpty(body, [
      "emergency_contact_relationship",
      "emergency_relationship",
      "relationship",
    ]);

    if (!trade_code || !rank_code || !phone || !home_address || !city || !postal_code) {
      return res.status(400).json({
        ok: false,
        error: "Missing required fields",
        required: ["trade_code", "rank_code", "phone", "home_address", "city", "postal_code"],
      });
    }

    const geo = await geocodeWithMapbox({ home_address, city, postal_code });
    if (!geo) {
      return res.status(400).json({ ok: false, error: "Unable to locate home address" });
    }

    const emp = await q(
      "SELECT COALESCE(first_name,'') AS first_name, COALESCE(last_name,'') AS last_name FROM public.employees WHERE id = $1",
      [employee_id]
    );
    const first = (emp.rows[0]?.first_name || "").trim();
    const last = (emp.rows[0]?.last_name || "").trim();
    const full_name = first || last ? `${first} ${last}`.trim() : "Employee";

    const profCols = await detectEmployeeProfileColumns();

    const insertCols = ["employee_id"];
    const insertVals = ["$1"];
    const updateSets = [];

    const params = [employee_id];
    let idx = 2;

    function addCol(col, value) {
      if (!profCols.has(col)) return;
      insertCols.push(col);
      insertVals.push(`$${idx}`);
      params.push(value);
      idx += 1;
      updateSets.push(`${col} = EXCLUDED.${col}`);
    }

    addCol("full_name", full_name);
    addCol("role_code", role_code);
    addCol("trade_code", String(trade_code).toUpperCase().trim());
    addCol("rank_code", String(rank_code).toUpperCase().trim());

    addCol("phone", phone);
    addCol("contact_email", contact_email ? contact_email.toLowerCase() : null);

    addCol("home_address", home_address);
    addCol("home_unit", home_unit);
    addCol("city", city);
    addCol("postal_code", postal_code);
    addCol("province", province);
    addCol("country", country);

    addCol("emergency_contact_name", emergency_contact_name);
    addCol("emergency_contact_phone", emergency_contact_phone);
    addCol("emergency_contact_relationship", emergency_contact_relationship);

    if (profCols.has("home_location")) {
      const lngPh = `$${idx}`;
      params.push(geo.lng);
      idx += 1;

      const latPh = `$${idx}`;
      params.push(geo.lat);
      idx += 1;

      const homeLocationExpr = await getHomeLocationExpr(lngPh, latPh);

      insertCols.push("home_location");
      insertVals.push(homeLocationExpr);
      updateSets.push("home_location = EXCLUDED.home_location");
    }

    const sql = `
      INSERT INTO public.employee_profiles (${insertCols.join(", ")})
      VALUES (${insertVals.join(", ")})
      ON CONFLICT (employee_id) DO UPDATE SET
        ${updateSets.join(", ")}
      RETURNING employee_id;
    `;

    const r = await q(sql, params);

    try {
      const userIdRaw = (req.user && (req.user.user_id || req.user.id || req.user.userId)) || null;
      const user_id = userIdRaw ? String(userIdRaw) : null;

      if (user_id) {
        await q("UPDATE public.app_users SET profile_status = 'COMPLETED' WHERE id = $1", [user_id]);
      } else {
        await q("UPDATE public.app_users SET profile_status = 'COMPLETED' WHERE employee_id = $1", [
          employee_id,
        ]);
      }
    } catch (e2) {
      console.warn("PROFILE_STATUS_UPDATE failed:", e2?.message || e2);
    }

    return res.json({
      ok: true,
      employee_id: r.rows[0]?.employee_id || employee_id,
      saved: true,
      geocoded: true,
    });
  } catch (e) {
    if (e && e.code === "23505") {
      const constraint = String(e.constraint || "");
      if (constraint === "employee_profiles_phone_digits_uniq" || constraint.includes("phone_digits")) {
        return res.status(400).json({
          ok: false,
          error: "PHONE_ALREADY_IN_USE",
          message: "Phone number is already used by another employee.",
        });
      }
    }

    console.error("POST /api/profile failed:", e);

    if (e && e.code === "GEOCODING_NOT_CONFIGURED") {
      return res.status(500).json({ ok: false, error: "GEOCODING_NOT_CONFIGURED" });
    }

    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

module.exports = router;
