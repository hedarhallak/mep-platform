// tests/smoke/cookie_options.test.js — Phase 6-D-1a (Section 100, May 14, 2026).
//
// Pure-function unit tests for the cookie-options builder. No DB, no
// network. Exercises the policy decisions in lib/cookie_options.js:
//   - HttpOnly is always on
//   - SameSite=Lax is always on
//   - Path=/ is always on
//   - Secure flips with NODE_ENV
//   - Domain=.constrai.ca only fires in production AND only when the
//     request hit a constrai.ca host
//   - access vs refresh TTLs distinct
//   - clearCookieOptions omits maxAge

'use strict';

const {
  ACCESS_TOKEN_MAX_AGE_MS,
  REFRESH_TOKEN_MAX_AGE_MS,
  baseCookieOptions,
  accessTokenCookieOptions,
  refreshTokenCookieOptions,
  clearCookieOptions,
} = require('../../lib/cookie_options');

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_NODE_ENV;
});

function reqWithHost(hostname) {
  return { hostname };
}

describe('cookie_options — base policy', () => {
  test('always sets httpOnly + sameSite=lax + path=/', () => {
    process.env.NODE_ENV = 'test';
    const opts = baseCookieOptions(reqWithHost('app.constrai.ca'));
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBe('lax');
    expect(opts.path).toBe('/');
  });

  test('secure=true in production', () => {
    process.env.NODE_ENV = 'production';
    expect(baseCookieOptions(reqWithHost('app.constrai.ca')).secure).toBe(true);
  });

  test('secure=false outside production (dev / test)', () => {
    process.env.NODE_ENV = 'development';
    expect(baseCookieOptions(reqWithHost('app.constrai.ca')).secure).toBe(false);
    process.env.NODE_ENV = 'test';
    expect(baseCookieOptions(reqWithHost('app.constrai.ca')).secure).toBe(false);
  });
});

describe('cookie_options — Domain scoping', () => {
  test('sets Domain=.constrai.ca in production for constrai.ca subdomain', () => {
    process.env.NODE_ENV = 'production';
    expect(baseCookieOptions(reqWithHost('app.constrai.ca')).domain).toBe('.constrai.ca');
    expect(baseCookieOptions(reqWithHost('acm.constrai.ca')).domain).toBe('.constrai.ca');
    expect(baseCookieOptions(reqWithHost('admin.constrai.ca')).domain).toBe('.constrai.ca');
  });

  test('sets Domain=.constrai.ca in production for apex constrai.ca', () => {
    process.env.NODE_ENV = 'production';
    expect(baseCookieOptions(reqWithHost('constrai.ca')).domain).toBe('.constrai.ca');
  });

  test('OMITS Domain in production for non-constrai hosts', () => {
    process.env.NODE_ENV = 'production';
    expect(baseCookieOptions(reqWithHost('143.110.218.84')).domain).toBeUndefined();
    expect(baseCookieOptions(reqWithHost('example.com')).domain).toBeUndefined();
  });

  test('OMITS Domain outside production (dev / test) even on constrai host', () => {
    process.env.NODE_ENV = 'test';
    expect(baseCookieOptions(reqWithHost('app.constrai.ca')).domain).toBeUndefined();
    process.env.NODE_ENV = 'development';
    expect(baseCookieOptions(reqWithHost('acm.constrai.ca')).domain).toBeUndefined();
  });

  test('OMITS Domain for localhost / IP / undefined hostname', () => {
    process.env.NODE_ENV = 'production';
    expect(baseCookieOptions(reqWithHost('localhost')).domain).toBeUndefined();
    expect(baseCookieOptions(reqWithHost('127.0.0.1')).domain).toBeUndefined();
    expect(baseCookieOptions({}).domain).toBeUndefined();
    expect(baseCookieOptions(null).domain).toBeUndefined();
  });
});

describe('cookie_options — token-specific helpers', () => {
  test('accessTokenCookieOptions has 1h maxAge', () => {
    process.env.NODE_ENV = 'test';
    const opts = accessTokenCookieOptions(reqWithHost('app.constrai.ca'));
    expect(opts.maxAge).toBe(ACCESS_TOKEN_MAX_AGE_MS);
    expect(opts.maxAge).toBe(60 * 60 * 1000);
  });

  test('refreshTokenCookieOptions has 7d maxAge', () => {
    process.env.NODE_ENV = 'test';
    const opts = refreshTokenCookieOptions(reqWithHost('app.constrai.ca'));
    expect(opts.maxAge).toBe(REFRESH_TOKEN_MAX_AGE_MS);
    expect(opts.maxAge).toBe(7 * 24 * 60 * 60 * 1000);
  });

  test('clearCookieOptions omits maxAge (Express clearCookie expires it itself)', () => {
    process.env.NODE_ENV = 'test';
    const opts = clearCookieOptions(reqWithHost('app.constrai.ca'));
    expect(opts.maxAge).toBeUndefined();
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBe('lax');
    expect(opts.path).toBe('/');
  });

  test('access + refresh share the same Domain / Secure / SameSite policy', () => {
    process.env.NODE_ENV = 'production';
    const access = accessTokenCookieOptions(reqWithHost('app.constrai.ca'));
    const refresh = refreshTokenCookieOptions(reqWithHost('app.constrai.ca'));
    expect(access.domain).toBe(refresh.domain);
    expect(access.secure).toBe(refresh.secure);
    expect(access.sameSite).toBe(refresh.sameSite);
    expect(access.path).toBe(refresh.path);
    // Only maxAge differs.
    expect(access.maxAge).not.toBe(refresh.maxAge);
  });

  test('clearCookieOptions matches Domain + Path of the original Set-Cookie', () => {
    // Critical correctness: if clear has a different Domain than set, the
    // browser keeps the original cookie alive.
    process.env.NODE_ENV = 'production';
    const set = accessTokenCookieOptions(reqWithHost('app.constrai.ca'));
    const clear = clearCookieOptions(reqWithHost('app.constrai.ca'));
    expect(clear.domain).toBe(set.domain);
    expect(clear.path).toBe(set.path);
  });
});
