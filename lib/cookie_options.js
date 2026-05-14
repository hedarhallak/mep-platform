'use strict';

// lib/cookie_options.js — Phase 6-D-1a (Section 100, May 14, 2026).
//
// Shared cookie-options builder for the auth flow. Centralizes the
// Domain / Secure / SameSite policy that every auth cookie has to agree
// on; without this helper the policy drifts between login / refresh /
// logout and the browser silently treats "set" and "clear" as different
// cookies (different Domain → two cookies, not one).
//
// Policy:
//   * `HttpOnly`             — always. Tokens must not be JS-readable.
//   * `SameSite=Lax`         — always. Blocks third-party CSRF while
//                              allowing top-level navigations
//                              (`window.location.assign` from
//                              `app.constrai.ca` to `acm.constrai.ca`
//                              carries the cookie).
//   * `Secure`               — in production only. Local dev runs over
//                              http://localhost and the Secure flag would
//                              prevent the cookie from being set at all.
//   * `Path=/`               — always.
//   * `Domain=.constrai.ca`  — production only AND only when the request
//                              hit a constrai.ca host. This lets the
//                              cookie travel from `app.constrai.ca` (the
//                              generic login entry) to `acm.constrai.ca`
//                              (the tenant landing) after the Phase 6-D
//                              redirect. In dev / tests / on the bare IP
//                              the Domain is omitted, scoping the cookie
//                              to the request host only.
//
// Token TTLs match the JWT + refresh_token TTLs in routes/auth.js so the
// cookie expires at the same time the server would have rejected it
// anyway. No cookie outliving its bearer-token sibling.

const ACCESS_TOKEN_MAX_AGE_MS = 60 * 60 * 1000; // 1h — matches JWT exp
const REFRESH_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7d — matches refresh_token TTL

function baseCookieOptions(req) {
  const isProd = process.env.NODE_ENV === 'production';
  const hostname = (req && req.hostname ? String(req.hostname) : '').toLowerCase();
  const isConstrai = hostname === 'constrai.ca' || hostname.endsWith('.constrai.ca');

  const opts = {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
  };

  if (isProd && isConstrai) {
    // `.constrai.ca` (leading dot) is the explicit cross-subdomain form
    // per RFC 6265 — modern browsers also accept the dot-less form, but
    // the dotted form is unambiguous and matches the eTLD+1 rule.
    opts.domain = '.constrai.ca';
  }

  return opts;
}

function accessTokenCookieOptions(req) {
  return { ...baseCookieOptions(req), maxAge: ACCESS_TOKEN_MAX_AGE_MS };
}

function refreshTokenCookieOptions(req) {
  return { ...baseCookieOptions(req), maxAge: REFRESH_TOKEN_MAX_AGE_MS };
}

// clearCookie() ignores maxAge (it sets the cookie with an expired date
// internally), but Domain + Path MUST match the original Set-Cookie or
// the browser keeps the original cookie alive.
function clearCookieOptions(req) {
  return baseCookieOptions(req);
}

module.exports = {
  ACCESS_TOKEN_MAX_AGE_MS,
  REFRESH_TOKEN_MAX_AGE_MS,
  baseCookieOptions,
  accessTokenCookieOptions,
  refreshTokenCookieOptions,
  clearCookieOptions,
};
