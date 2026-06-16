'use strict';

/**
 * lib/road_distance.js — §131.3 / G5 (DECISIONS §144).
 *
 * Provider-swappable ROAD distance (km) between two coordinates, for CCQ travel
 * allowances. Tries providers in order and returns the first that succeeds:
 *
 *   1. Google Routes API (computeRoutes, DRIVE) — the payroll reference. CCQ
 *      disputes are settled on Google Maps road distance, and employees verify
 *      on Google Maps, so matching Google is what makes the allowance
 *      dispute-proof. Used when GOOGLE_MAPS_API_KEY is set.
 *   2. Mapbox Directions — real road distance from a second engine; fallback
 *      when Google is unavailable / unset. Used when MAPBOX_ACCESS_TOKEN is set.
 *   3. Haversine × 1.3 — offline estimate of last resort so the feature never
 *      hard-fails (the historical §131 behaviour). Clearly the least accurate.
 *
 * Returns a number (km, 2 decimals) or null if even the inputs are invalid.
 * NEVER throws — a provider failure just falls through to the next.
 *
 * Callers should CACHE/persist the result (we compute once per assignment and
 * store it) so we don't re-bill Google on every read.
 */

const https = require('https');

const ROAD_FACTOR = 1.3;

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Provider 1: Google Routes API (computeRoutes) ──────────────
function googleRouteKm(oLat, oLng, dLat, dLng) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return Promise.resolve(null);

  const payload = JSON.stringify({
    origin: { location: { latLng: { latitude: oLat, longitude: oLng } } },
    destination: { location: { latLng: { latitude: dLat, longitude: dLng } } },
    travelMode: 'DRIVE',
  });

  const options = {
    method: 'POST',
    hostname: 'routes.googleapis.com',
    path: '/directions/v2:computeRoutes',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'routes.distanceMeters',
      'Content-Length': Buffer.byteLength(payload),
    },
  };

  return new Promise((resolve) => {
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          const meters = data?.routes?.[0]?.distanceMeters;
          resolve(Number.isFinite(meters) ? Math.round((meters / 1000) * 100) / 100 : null);
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.write(payload);
    req.end();
  });
}

// ── Provider 2: Mapbox Directions ──────────────────────────────
function mapboxRouteKm(oLat, oLng, dLat, dLng) {
  const token = process.env.MAPBOX_ACCESS_TOKEN;
  if (!token) return Promise.resolve(null);
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/driving/` +
    `${oLng},${oLat};${dLng},${dLat}` +
    `?access_token=${token}&overview=false`;
  return new Promise((resolve) => {
    https
      .get(url, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            const meters = data?.routes?.[0]?.distance;
            resolve(Number.isFinite(meters) ? Math.round((meters / 1000) * 100) / 100 : null);
          } catch {
            resolve(null);
          }
        });
      })
      .on('error', () => resolve(null));
  });
}

/**
 * Road distance in km, trying Google → Mapbox → haversine estimate.
 * @returns {Promise<number|null>}
 */
async function roadDistanceKm(oLat, oLng, dLat, dLng) {
  const raw = [oLat, oLng, dLat, dLng];
  // Reject null/undefined/'' BEFORE Number() — Number(null) is 0 (finite),
  // which would silently treat an un-geocoded coordinate as (0,0).
  if (raw.some((v) => v === null || v === undefined || v === '')) return null;
  const coords = raw.map(Number);
  if (!coords.every(Number.isFinite)) return null;
  const [a1, b1, a2, b2] = coords;

  const g = await googleRouteKm(a1, b1, a2, b2);
  if (g != null) return g;

  const m = await mapboxRouteKm(a1, b1, a2, b2);
  if (m != null) return m;

  // Estimate of last resort — never hard-fail.
  return Math.round(haversineKm(a1, b1, a2, b2) * ROAD_FACTOR * 100) / 100;
}

module.exports = { roadDistanceKm, haversineKm, ROAD_FACTOR };
