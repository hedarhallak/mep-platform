// src/lib/branding.js — Phase 6-C (Section 99, May 14, 2026).
//
// Tenant branding bootstrap. Called from main.jsx BEFORE the React tree
// mounts, so the first paint of the login screen already shows the
// tenant's brand color (--color-primary) instead of the Constrai default.
//
// Strategy:
//   1. Extract company_code from window.location.hostname. The production
//      multi-tenant URL shape is `<code>.constrai.ca` (e.g.
//      `acm.constrai.ca`). Reserved subdomains (app, admin, www) and
//      no-subdomain hosts (localhost, constrai.ca) skip the fetch and
//      use Constrai defaults.
//   2. Allow a `?company=<code>` query-param override for local dev where
//      subdomain DNS isn't set up.
//   3. Fetch /api/companies/{code}/branding (the Phase 6-B public
//      endpoint). 3s hard timeout via AbortController so a network
//      hang can't block the page indefinitely.
//   4. On 200 + brand_color present, inject a <style id="tenant-
//      branding-vars"> element into <head> that overrides --color-primary
//      at :root. Tailwind v4 @theme directive in index.css makes every
//      bg-primary / text-primary utility pick up the override
//      automatically — no component code needs to change.
//   5. On any failure (no code, 404, timeout, network error), silently
//      fall back to Constrai defaults. console.warn is the only signal —
//      we never surface an error to the user.
//
// Public window state:
//   window.__BRANDING__ = { company_name, brand_color, brand_logo_url }
//                       | null fields
//   set after the fetch resolves (success OR fallback). Components that
//   want to render the tenant logo or company_name can read this
//   synchronously any time after React mounts. Phase 6-D will add a
//   React context + logo swap on the login page — out of scope here.
//
// admin-main.jsx does NOT call bootstrapBranding(). The admin portal is
// always Constrai-branded — there's no tenant context at that level.

const RESERVED_SUBDOMAINS = new Set(['app', 'admin', 'www', 'localhost']);
const COMPANY_CODE_RE = /^[A-Za-z0-9_-]{3,32}$/;
const FETCH_TIMEOUT_MS = 3000;

/**
 * Extract a tenant company code from the URL.
 *
 * Order of precedence:
 *   1. `?company=<code>` query-param override (dev-only — production
 *      shouldn't need it but it's harmless to support).
 *   2. The leftmost subdomain of `hostname`, IF the host has 3+ DNS
 *      labels (`<sub>.<domain>.<tld>`) AND the subdomain isn't reserved.
 *
 * Returns the lowercased code, or `null` if no tenant code is in the URL.
 *
 * @param {string} hostname  Typically `window.location.hostname`.
 * @param {string} [search]  Typically `window.location.search`. Optional.
 * @returns {string|null}
 */
export function extractCompanyCode(hostname, search) {
  // Query-param override first.
  if (search) {
    try {
      const params = new URLSearchParams(search);
      const fromQuery = (params.get('company') || '').trim();
      if (fromQuery && COMPANY_CODE_RE.test(fromQuery)) {
        return fromQuery.toLowerCase();
      }
    } catch {
      // URLSearchParams shouldn't throw on a string, but be defensive.
    }
  }

  if (!hostname) return null;
  const parts = String(hostname).split('.');
  if (parts.length < 3) {
    // localhost, constrai.ca — no tenant subdomain.
    return null;
  }
  const subdomain = parts[0].toLowerCase();
  if (RESERVED_SUBDOMAINS.has(subdomain)) return null;
  if (!COMPANY_CODE_RE.test(subdomain)) return null;
  return subdomain;
}

/**
 * Inject CSS variable overrides into <head> and stash branding on window.
 * Idempotent: replaces any previously-injected branding <style>.
 *
 * @param {{company_name?: string|null, brand_color?: string|null, brand_logo_url?: string|null}|null} branding
 */
export function applyBranding(branding) {
  const safe = branding || {};

  // Stash for components (Phase 6-D will read this for logo swap).
  if (typeof window !== 'undefined') {
    window.__BRANDING__ = {
      company_name: safe.company_name || null,
      brand_color: safe.brand_color || null,
      brand_logo_url: safe.brand_logo_url || null,
    };
  }

  if (typeof document === 'undefined') return;

  // Always remove any previously-injected style element first — keeps
  // applyBranding idempotent and prevents stacking when bootstrapBranding
  // is called more than once (e.g., in tests).
  const existing = document.getElementById('tenant-branding-vars');
  if (existing) existing.remove();

  // Only override CSS vars when we actually have a brand_color. NULL means
  // "tenant hasn't customized — keep Constrai defaults from index.css."
  if (!safe.brand_color) return;

  const styleEl = document.createElement('style');
  styleEl.id = 'tenant-branding-vars';
  // The two vars we override are the ones most visible on the login
  // screen + main shell: --color-primary (buttons, links, focus rings)
  // and --color-sidebar-active (left-nav active item, only relevant
  // post-login but harmless to set early). The other shades (-dark,
  // -light, -bright, -pale) keep their Constrai defaults for now — a
  // future PR can compute shades from brand_color via HSL or color-mix.
  styleEl.textContent =
    `:root { --color-primary: ${safe.brand_color}; ` +
    `--color-sidebar-active: ${safe.brand_color}; }`;
  document.head.appendChild(styleEl);
}

/**
 * Fetch /api/companies/{code}/branding and apply it to the document.
 * Resolves silently on success or any failure — the caller (main.jsx)
 * shouldn't have to handle errors.
 *
 * The fetch returns void; success/failure is reflected in
 * window.__BRANDING__ and the presence of the <style id="tenant-
 * branding-vars"> element.
 *
 * @returns {Promise<void>}
 */
export async function bootstrapBranding() {
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  const search = typeof window !== 'undefined' ? window.location.search : '';
  const code = extractCompanyCode(hostname, search);

  if (!code) {
    // No tenant subdomain → reset state and use defaults.
    applyBranding(null);
    return;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res;
    try {
      res = await fetch(`/api/companies/${encodeURIComponent(code)}/branding`, {
        signal: controller.signal,
        // The endpoint sets Cache-Control: public, max-age=300, so
        // subsequent page loads in the same session reuse the browser
        // HTTP cache and this fetch costs ~10ms. No need for an
        // application-level cache.
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!res.ok) {
      // 404 (company not found / inactive) or 4xx/5xx — silent fallback.
      applyBranding(null);
      return;
    }
    const data = await res.json();
    if (data && data.ok && data.branding) {
      applyBranding(data.branding);
    } else {
      applyBranding(null);
    }
  } catch (err) {
    // Network error, AbortError on timeout, or JSON parse error.
    // Silent fallback — only a console.warn so a developer debugging a
    // misconfigured tenant doesn't waste time wondering why the page
    // looks like Constrai instead of the tenant brand.
    // eslint-disable-next-line no-console
    console.warn(
      '[branding] bootstrap failed, using Constrai defaults:',
      err && err.message ? err.message : err
    );
    applyBranding(null);
  }
}
