// instrument.js — Phase 64 (May 2026), Section 22 production hardening.
//
// Initializes Sentry error tracking. MUST be required at the very top of
// the entry point (index.js) BEFORE any other module — Sentry's
// auto-instrumentation patches Node's `http`, `pg`, `express`, etc. at
// require-time and only catches code loaded AFTER Sentry.init().
//
// In test environments (NODE_ENV=test) and when SENTRY_DSN is unset,
// Sentry.init() is skipped — no events are sent, no network calls. This
// keeps the test suite hermetic and avoids burning the free-tier event
// quota on Jest runs.

'use strict';

// Phase 64 hotfix (May 2026): instrument.js loads BEFORE app.js (which is
// where dotenv normally runs), so we must load .env here too — otherwise
// SENTRY_DSN is undefined at this point and Sentry stays disabled in prod.
// dotenv.config() is idempotent; loading it twice (here + in app.js) is safe.
require('dotenv').config();

const Sentry = require('@sentry/node');

const isTest = process.env.NODE_ENV === 'test';
const dsn = process.env.SENTRY_DSN;

if (!isTest && dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'production',
    // 10% trace sampling — keeps free-tier quota healthy while still
    // surfacing slow requests. Bump higher temporarily if investigating
    // a performance issue.
    tracesSampleRate: 0.1,
    // Privacy default: don't send IP / cookies / request bodies. Routes
    // that want richer context can scope it via Sentry.setExtra() per
    // request.
    sendDefaultPii: false,
    // Tag every event with the release SHA so we can correlate errors
    // to deploys. The deploy script can set RELEASE_SHA; otherwise fall
    // back to a generic tag.
    release: process.env.RELEASE_SHA || 'unknown',
  });
  console.log(`[sentry] initialized — env=${process.env.NODE_ENV || 'production'}`);
} else if (!isTest && !dsn) {
  // Helpful warning so an accidental missing SENTRY_DSN on prod doesn't
  // silently disable error tracking.
  console.warn('[sentry] SENTRY_DSN not set — error tracking disabled');
}

module.exports = Sentry;
