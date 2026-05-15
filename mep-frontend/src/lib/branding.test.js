// src/lib/branding.test.js — Phase 6-C (Section 99, May 14, 2026).
//
// Unit tests for the tenant branding bootstrap helpers. Pure logic +
// DOM injection in jsdom — no network, no React. We mock global fetch
// per test to exercise each branch (success, 404, network error,
// non-ok body, query-param override).

import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
  vi,
} from 'vitest';
import {
  extractCompanyCode,
  applyBranding,
  bootstrapBranding,
} from './branding';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetDocAndWindow() {
  // Remove any previously injected branding style element.
  const existing = document.getElementById('tenant-branding-vars');
  if (existing) existing.remove();
  delete window.__BRANDING__;
}

function setLocation({ hostname = 'localhost', search = '' } = {}) {
  // jsdom lets us override window.location piece-by-piece via
  // defineProperty. This pattern is the standard jsdom workaround
  // since location is otherwise read-only.
  Object.defineProperty(window, 'location', {
    writable: true,
    configurable: true,
    value: { ...window.location, hostname, search },
  });
}

let originalFetch;

beforeEach(() => {
  originalFetch = global.fetch;
  resetDocAndWindow();
});

afterEach(() => {
  global.fetch = originalFetch;
  resetDocAndWindow();
});

// ---------------------------------------------------------------------------
// extractCompanyCode — pure URL parsing
// ---------------------------------------------------------------------------

describe('extractCompanyCode', () => {
  test('returns null for localhost', () => {
    expect(extractCompanyCode('localhost', '')).toBe(null);
  });

  test('returns null for the apex domain (constrai.ca)', () => {
    expect(extractCompanyCode('constrai.ca', '')).toBe(null);
  });

  test('returns null for the reserved app subdomain', () => {
    expect(extractCompanyCode('app.constrai.ca', '')).toBe(null);
  });

  test('returns null for the reserved admin subdomain', () => {
    expect(extractCompanyCode('admin.constrai.ca', '')).toBe(null);
  });

  test('returns null for the www subdomain', () => {
    expect(extractCompanyCode('www.constrai.ca', '')).toBe(null);
  });

  test('returns lowercased subdomain for a tenant URL', () => {
    expect(extractCompanyCode('acm.constrai.ca', '')).toBe('acm');
    expect(extractCompanyCode('ACM.constrai.ca', '')).toBe('acm');
  });

  test('returns null for a too-short subdomain (single char)', () => {
    expect(extractCompanyCode('a.constrai.ca', '')).toBe(null);
  });

  test('returns null for an obviously bad subdomain', () => {
    // Spaces / weird chars shouldn't reach the DB.
    expect(extractCompanyCode('has space.constrai.ca', '')).toBe(null);
    expect(extractCompanyCode("'OR1=1.constrai.ca", '')).toBe(null);
  });

  test('honors ?company= query param override even for localhost', () => {
    expect(extractCompanyCode('localhost', '?company=acm')).toBe('acm');
  });

  test('rejects a malformed ?company= query value', () => {
    expect(extractCompanyCode('localhost', '?company=bad value')).toBe(null);
  });

  test('query param wins over a reserved subdomain', () => {
    // Dev scenario: developer is browsing app.constrai.ca but wants to
    // test tenant branding for ACM via ?company=acm.
    expect(extractCompanyCode('app.constrai.ca', '?company=acm')).toBe('acm');
  });

  test('handles missing hostname gracefully', () => {
    expect(extractCompanyCode('', '')).toBe(null);
    expect(extractCompanyCode(null, null)).toBe(null);
  });
});

// ---------------------------------------------------------------------------
// applyBranding — DOM injection + window state
// ---------------------------------------------------------------------------

describe('applyBranding', () => {
  test('sets window.__BRANDING__ with normalized fields on success', () => {
    applyBranding({
      company_name: 'ACM Construction',
      brand_color: '#ff5722',
      brand_logo_url: 'https://cdn/acm.png',
    });
    expect(window.__BRANDING__).toEqual({
      company_name: 'ACM Construction',
      brand_color: '#ff5722',
      brand_logo_url: 'https://cdn/acm.png',
    });
  });

  test('null payload resets state and injects no style', () => {
    applyBranding(null);
    expect(window.__BRANDING__).toEqual({
      company_name: null,
      brand_color: null,
      brand_logo_url: null,
    });
    expect(document.getElementById('tenant-branding-vars')).toBe(null);
  });

  test('injects <style id="tenant-branding-vars"> when brand_color present', () => {
    applyBranding({ company_name: 'ACM', brand_color: '#ff5722' });
    const styleEl = document.getElementById('tenant-branding-vars');
    expect(styleEl).not.toBe(null);
    expect(styleEl.textContent).toContain('--color-primary: #ff5722');
    expect(styleEl.textContent).toContain('--color-sidebar-active: #ff5722');
  });

  test('Section 111: injects full shade palette via color-mix() when brand_color present', () => {
    // Section 111 (May 15, 2026) extended the override beyond --color-primary
    // + --color-sidebar-active to include the four shade vars. Verify each
    // expected CSS variable + its color-mix() declaration is present so a
    // future change to the recipe is caught by this test.
    applyBranding({ company_name: 'ACM', brand_color: '#ff5722' });
    const css = document.getElementById('tenant-branding-vars').textContent;
    expect(css).toContain('--color-primary: #ff5722');
    expect(css).toContain(
      '--color-primary-dark: color-mix(in srgb, #ff5722 75%, black)'
    );
    expect(css).toContain(
      '--color-primary-light: color-mix(in srgb, #ff5722 65%, white)'
    );
    expect(css).toContain(
      '--color-primary-bright: color-mix(in srgb, #ff5722 75%, white)'
    );
    expect(css).toContain(
      '--color-primary-pale: color-mix(in srgb, #ff5722 18%, white)'
    );
    expect(css).toContain('--color-sidebar-active: #ff5722');
  });

  test('does not inject <style> when brand_color is null (no customization)', () => {
    applyBranding({ company_name: 'ACM', brand_color: null });
    expect(document.getElementById('tenant-branding-vars')).toBe(null);
  });

  test('replaces an existing style element rather than stacking', () => {
    applyBranding({ company_name: 'A', brand_color: '#111111' });
    applyBranding({ company_name: 'B', brand_color: '#222222' });
    const all = document.querySelectorAll('#tenant-branding-vars');
    expect(all.length).toBe(1);
    expect(all[0].textContent).toContain('#222222');
    expect(all[0].textContent).not.toContain('#111111');
  });
});

// ---------------------------------------------------------------------------
// bootstrapBranding — orchestration with mocked fetch
// ---------------------------------------------------------------------------

describe('bootstrapBranding', () => {
  test('skips fetch and resets state when there is no tenant subdomain', async () => {
    setLocation({ hostname: 'app.constrai.ca' });
    global.fetch = vi.fn();

    await bootstrapBranding();

    expect(global.fetch).not.toHaveBeenCalled();
    expect(window.__BRANDING__).toEqual({
      company_name: null,
      brand_color: null,
      brand_logo_url: null,
    });
    expect(document.getElementById('tenant-branding-vars')).toBe(null);
  });

  test('applies branding from a successful response', async () => {
    setLocation({ hostname: 'acm.constrai.ca' });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        branding: {
          company_name: 'ACM Construction',
          brand_color: '#ff5722',
          brand_logo_url: 'https://cdn/acm.png',
        },
      }),
    });

    await bootstrapBranding();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls[0][0]).toBe('/api/companies/acm/branding');
    expect(window.__BRANDING__.brand_color).toBe('#ff5722');
    expect(window.__BRANDING__.company_name).toBe('ACM Construction');
    const styleEl = document.getElementById('tenant-branding-vars');
    expect(styleEl).not.toBe(null);
    expect(styleEl.textContent).toContain('#ff5722');
  });

  test('falls back to defaults on 404', async () => {
    setLocation({ hostname: 'unknown.constrai.ca' });
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ ok: false, error: 'COMPANY_NOT_FOUND' }),
    });

    await bootstrapBranding();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(window.__BRANDING__).toEqual({
      company_name: null,
      brand_color: null,
      brand_logo_url: null,
    });
    expect(document.getElementById('tenant-branding-vars')).toBe(null);
  });

  test('falls back to defaults on network error and logs a warning', async () => {
    setLocation({ hostname: 'acm.constrai.ca' });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    global.fetch = vi.fn().mockRejectedValue(new Error('network down'));

    await bootstrapBranding();

    expect(window.__BRANDING__).toEqual({
      company_name: null,
      brand_color: null,
      brand_logo_url: null,
    });
    expect(warnSpy).toHaveBeenCalled();
    expect(document.getElementById('tenant-branding-vars')).toBe(null);
    warnSpy.mockRestore();
  });

  test('handles a 200 response with ok=false gracefully', async () => {
    setLocation({ hostname: 'acm.constrai.ca' });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: false, error: 'SERVER_ERROR' }),
    });

    await bootstrapBranding();

    expect(window.__BRANDING__).toEqual({
      company_name: null,
      brand_color: null,
      brand_logo_url: null,
    });
    expect(document.getElementById('tenant-branding-vars')).toBe(null);
  });

  test('uses ?company= override even on a no-subdomain host', async () => {
    setLocation({ hostname: 'localhost', search: '?company=acm' });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        branding: {
          company_name: 'ACM',
          brand_color: '#abc123',
          brand_logo_url: null,
        },
      }),
    });

    await bootstrapBranding();

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/companies/acm/branding',
      expect.any(Object)
    );
    expect(window.__BRANDING__.brand_color).toBe('#abc123');
  });
});
