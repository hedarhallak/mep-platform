// scripts/force_geocode_demo.js
//
// Force re-geocode the 3 demo projects (PROJ-11, PROJ-12, PROJ-21) using
// Nominatim (OpenStreetMap). UNCONDITIONALLY overwrites existing
// site_lat/site_lng/geocoded_at on those rows.
//
// One-off tool. Do NOT use this as a general-purpose geocoder — for that,
// use the existing scripts/geocode_projects.js (which only acts on NULL coords).
//
// Why this exists:
//   The standard geocoder skips rows that already have coordinates. The 3
//   demo projects all have placeholder coords (45.559, -73.62) inherited from
//   the original seed, so the standard geocoder never touches them. This
//   script forces an overwrite so the addresses we just updated take effect.
//
// Usage:
//   node scripts/force_geocode_demo.js
//
// Requires:
//   DATABASE_URL or PG* env vars (handled by pg lib)
//   Optional: NOMINATIM_EMAIL (recommended for User-Agent compliance)

"use strict";

require("dotenv").config();
const { Pool } = require("pg");

const TARGETS = ["PROJ-11", "PROJ-12", "PROJ-21"];
const COMPANY_ID = 5;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const USER_AGENT =
  process.env.NOMINATIM_USER_AGENT ||
  `Constrai-Demo-Geocoder/1.0 (${process.env.NOMINATIM_EMAIL || "no-email-set"})`;

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

async function geocode(address) {
  const u = new URL(NOMINATIM_URL);
  u.searchParams.set("q", address);
  u.searchParams.set("format", "json");
  u.searchParams.set("limit", "1");
  u.searchParams.set("countrycodes", "ca");

  const res = await fetch(u.toString(), {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Nominatim HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) return null;

  const lat = Number(data[0].lat);
  const lng = Number(data[0].lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return { lat, lng, display_name: data[0].display_name };
}

async function main() {
  console.log("User-Agent: " + USER_AGENT);
  console.log("Target projects: " + TARGETS.join(", "));
  console.log("Company ID: " + COMPANY_ID);
  console.log("");

  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT id, project_code, project_name, site_address, site_lat, site_lng
         FROM public.projects
        WHERE project_code = ANY($1)
          AND company_id   = $2
        ORDER BY project_code`,
      [TARGETS, COMPANY_ID]
    );

    if (rows.length === 0) {
      console.log("No matching projects found. Aborting.");
      return;
    }

    console.log("Found " + rows.length + " project(s) to force-geocode.");

    let ok = 0, skip = 0, fail = 0;

    for (const p of rows) {
      const label = "[" + p.project_code + "] " + (p.project_name || "");
      const address = String(p.site_address || "").trim();

      console.log("\n" + label);
      console.log("  Current coords: lat=" + p.site_lat + " lng=" + p.site_lng);
      console.log("  Address: " + address);

      if (!address) {
        console.log("  WARN: empty site_address, skipping.");
        skip++;
        continue;
      }

      // Nominatim rate limit: ~1 req/sec
      await sleep(1100);

      let result;
      try {
        result = await geocode(address);
      } catch (e) {
        console.log("  FAIL: " + e.message);
        fail++;
        continue;
      }

      if (!result) {
        console.log("  WARN: Nominatim returned no match, skipping.");
        skip++;
        continue;
      }

      // FORCE overwrite — no NULL check, no comparison
      await client.query(
        `UPDATE public.projects
            SET site_lat       = $1,
                site_lng       = $2,
                geocoded_at    = NOW(),
                geocode_source = 'nominatim-force'
          WHERE id = $3`,
        [result.lat, result.lng, p.id]
      );

      console.log("  OK:   lat=" + result.lat.toFixed(6) + " lng=" + result.lng.toFixed(6));
      console.log("        matched: " + result.display_name);
      ok++;
    }

    console.log("\nDone. ok=" + ok + " skip=" + skip + " fail=" + fail);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
