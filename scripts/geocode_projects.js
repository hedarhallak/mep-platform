// scripts/geocode_projects.js
// Geocode projects.site_address -> projects.site_lat/site_lng using Nominatim (OSM)
// PowerShell friendly. Node 18+ required (fetch available).

require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // optional
  // Otherwise PG* env vars are used automatically by pg
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const USER_AGENT =
  process.env.NOMINATIM_USER_AGENT ||
  `MEP-Site-Workforce-App/1.0 (${process.env.NOMINATIM_EMAIL || "no-email-set"})`;

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

async function fetchWithRetry(url, maxAttempts = 5) {
  let attempt = 0;
  let backoffMs = 1000;

  while (true) {
    attempt++;
    const res = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });

    if (res.ok) return res;

    if ([429, 500, 502, 503, 504].includes(res.status) && attempt < maxAttempts) {
      const retryAfter = res.headers.get("retry-after");
      const waitMs = retryAfter ? Number(retryAfter) * 1000 : backoffMs;
      console.log(`Retry HTTP ${res.status}. Wait ${waitMs}ms (attempt ${attempt}/${maxAttempts})`);
      await sleep(waitMs);
      backoffMs = Math.min(backoffMs * 2, 15000);
      continue;
    }

    const body = await res.text().catch(() => "");
    throw new Error(`Nominatim HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
}

async function geocode(address) {
  const u = new URL(NOMINATIM_URL);
  u.searchParams.set("q", address);
  u.searchParams.set("format", "json");
  u.searchParams.set("limit", "1");

  const res = await fetchWithRetry(u.toString());
  const data = await res.json();

  if (!Array.isArray(data) || data.length === 0) return null;

  const lat = Number(data[0].lat);
  const lng = Number(data[0].lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return { lat, lng, source: "nominatim" };
}

async function main() {
  const limit = Number(process.env.GEOCODE_LIMIT || 50);

  console.log("User-Agent:", USER_AGENT);

  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `
      SELECT id, project_code, project_name, site_address
      FROM projects
      WHERE site_address IS NOT NULL
        AND BTRIM(site_address) <> ''
        AND (site_lat IS NULL OR site_lng IS NULL)
      ORDER BY id
      LIMIT $1
      `,
      [limit]
    );

    if (rows.length === 0) {
      console.log("No projects need geocoding ✅");
      return;
    }

    console.log(`Found ${rows.length} project(s) to geocode.`);

    let ok = 0, skip = 0, fail = 0;

    for (const p of rows) {
      const label = `${p.project_code || p.id} - ${p.project_name || ""}`.trim();
      const address = String(p.site_address || "").trim();

      console.log(`\n[${label}]`);
      console.log(`Address: ${address}`);

      // Nominatim: keep it ~1 req/sec
      await sleep(1100);

      let result;
      try {
        result = await geocode(address);
      } catch (e) {
        console.log(`❌ Error: ${e.message}`);
        fail++;
        continue;
      }

      if (!result) {
        console.log("⚠️ No match found (skipping).");
        skip++;
        continue;
      }

      await client.query(
        `
        UPDATE projects
        SET site_lat = $1,
            site_lng = $2,
            geocoded_at = NOW(),
            geocode_source = $3
        WHERE id = $4
        `,
        [result.lat, result.lng, result.source, p.id]
      );

      console.log(`✅ Saved: lat=${result.lat}, lng=${result.lng}`);
      ok++;
    }

    console.log("\nDone:", { ok, skip, fail });
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
