/**
 * services/geocoding.js
 * D2 – Auto Home Location from Address (Mapbox Geocoding v6)
 *
 * Provider: Mapbox Forward Geocoding API (v6)
 * Storage: Uses permanent=true because we store coordinates in DB.
 */

const MAPBOX_TOKEN = process.env.MAPBOX_ACCESS_TOKEN;

function buildAddress({ street, city, province, postal_code, country }) {
  const parts = [street, city, province, postal_code, country]
    .map((v) => (v == null ? "" : String(v).trim()))
    .filter(Boolean);
  return parts.join(", ");
}

function pickLngLat(feature) {
  // Mapbox v6 commonly returns geometry.coordinates = [lng, lat]
  const coords = feature?.geometry?.coordinates;
  if (Array.isArray(coords) && coords.length >= 2) {
    const [lng, lat] = coords;
    if (Number.isFinite(lng) && Number.isFinite(lat)) return { lng, lat };
  }

  // Defensive fallback (in case of variant payloads)
  const alt = feature?.properties?.coordinates;
  if (alt && Number.isFinite(alt.longitude) && Number.isFinite(alt.latitude)) {
    return { lng: alt.longitude, lat: alt.latitude };
  }

  return null;
}

async function geocodeHomeAddress({ street, city, province, postal_code, country }, opts = {}) {
  const timeoutMs = Number(opts.timeoutMs || 7000);

  if (!MAPBOX_TOKEN) {
    return {
      ok: false,
      error: "GEOCODE_PROVIDER_NOT_CONFIGURED",
      message: "MAPBOX_ACCESS_TOKEN is missing",
    };
  }

  const q = buildAddress({ street, city, province, postal_code, country: country || "Canada" });
  if (!q) {
    return {
      ok: false,
      error: "GEOCODE_INPUT_EMPTY",
      message: "Address is empty",
    };
  }

  const url = new URL("https://api.mapbox.com/search/geocode/v6/forward");
  url.searchParams.set("q", q);
  url.searchParams.set("access_token", MAPBOX_TOKEN);
  url.searchParams.set("limit", "1");
  url.searchParams.set("country", "ca");
  // We store results in DB ⇒ must be permanent
  url.searchParams.set("permanent", "true");

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);

  try {
    const resp = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: ac.signal,
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      return {
        ok: false,
        error: "GEOCODE_PROVIDER_ERROR",
        message: `Mapbox geocoding failed (${resp.status}) ${text ? "- " + text.slice(0, 200) : ""}`.trim(),
      };
    }

    const data = await resp.json();
    const feature = Array.isArray(data?.features) ? data.features[0] : null;
    if (!feature) {
      return {
        ok: false,
        error: "GEOCODE_NO_RESULTS",
        message: "No geocoding results",
      };
    }

    const ll = pickLngLat(feature);
    if (!ll) {
      return {
        ok: false,
        error: "GEOCODE_BAD_RESPONSE",
        message: "Geocoding response missing coordinates",
      };
    }

    return { ok: true, ...ll, raw: feature };
  } catch (e) {
    const isAbort = e && (e.name === "AbortError" || String(e).includes("AbortError"));
    return {
      ok: false,
      error: isAbort ? "GEOCODE_TIMEOUT" : "GEOCODE_NETWORK_ERROR",
      message: isAbort ? "Geocoding request timed out" : (e?.message || "Geocoding failed"),
    };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  geocodeHomeAddress,
};
