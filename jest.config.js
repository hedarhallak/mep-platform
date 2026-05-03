// Jest configuration — Section 18 Week 2 Phase 10.
//
// Test discovery: any file matching tests/**/*.test.js.
// Future categories live under tests/{auth,tenant,rbac,workflows,security}/.
// Coverage targets the backend source (not mep-frontend / mep-mobile).

module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],

  // setupFiles runs BEFORE any test module is loaded. Sets JWT_SECRET so
  // lib/auth_utils.js can be required without throwing the "JWT_SECRET
  // missing" guard at module load time.
  setupFiles: ['<rootDir>/tests/setup.js'],

  // Don't try to index uploads/ (user-uploaded files) or archived migrations.
  // The uploads/ directory contains a stray package.json from one of the
  // sample uploads, which collides with the root package.json in Jest's
  // haste map.
  modulePathIgnorePatterns: ['<rootDir>/uploads/', '<rootDir>/db/migrations.archive/'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/mep-frontend/',
    '/mep-mobile/',
    '/uploads/',
    '/db/migrations.archive/',
  ],

  // Coverage: which source files to track. Excludes node_modules + frontend
  // + mobile + archived migrations + the test files themselves.
  collectCoverageFrom: [
    'index.js',
    'db.js',
    'seed.js',
    'routes/**/*.js',
    'middleware/**/*.js',
    'lib/**/*.js',
    'services/**/*.js',
    'jobs/**/*.js',
    'scripts/**/*.js',
    '!scripts/migrate.js', // migration runner — exercised separately by Atlas job
    '!**/node_modules/**',
    '!**/coverage/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'text-summary', 'lcov'],

  // Coverage thresholds — ratcheted at Phase 75c+d+e closeout (May 3, 2026, Sections 43-45):
  //   Phase 75c+d+e measured (PR #68): Statements 54.49% / Branches 48.33% / Functions 55.14% / Lines 55.66%
  //                                    +2.44pp lines from Phase 75b. 31 new integration tests across
  //                                    routes/hub.js (12 — task lifecycle), routes/attendance.js (10 —
  //                                    checkin/checkout/confirm), routes/reports.js (9 — parseRange +
  //                                    happy paths). Mega-batch shipped as a single feature PR per
  //                                    Section 4.5 default batching rule. Helper extension: 3 perms
  //                                    (attendance.view_self, attendance.approve, reports.view_self)
  //                                    + 4 grants for COMPANY_ADMIN.
  //                                    Section 40 closing here — bug yield zero across 4 of 5 batches
  //                                    (Bug 9 found in 75a only). Per-batch ROI signal triggers stop.
  //   Phase 75b ratchet  (PR #67):     Statements 52.17% / Branches 46.63% / Functions 53.67% / Lines 53.22%
  //   Phase 75a ratchet  (PR #64):     Statements 50.67% / Branches 45.07% / Functions 52.45% / Lines 51.77%
  //   Phase 73d ratchet  (CI #?):      Statements 48.54% / Branches 43.70% / Functions 51.47% / Lines 49.62%
  //   Phase 67b ratchet  (CI #178):    Statements 45.69% / Branches 40.22% / Functions 47.79% / Lines 46.71%
  //   Phase 67 ratchet   (CI #170):    Statements 44.52% / Branches 39.53% / Functions 46.07% / Lines 45.60%
  //   Phase 58 ratchet   (CI #131):    Statements 34.85% / Branches 26.44% / Functions 33.9%  / Lines 35.97%
  //   Phase 15 baseline  (CI #80):     Statements 18.14% / Branches 10.01% / Functions 14.00% / Lines 18.79%
  //
  // Floors set with ≥3pp headroom below measured per Section 4.6 convention —
  // absorbs the ~1.5pp build flake (Jest worker scheduling, cache hits,
  // parallel ordering) without flapping CI on small drift. Headrooms after
  // this ratchet: stmts 3.49pp / branches 3.33pp / fns 3.14pp / lines 3.66pp.
  // Goal met (functionally): from 49.62% → 55.66% lines in one session.
  // 65% stretch target deferred — see DECISIONS.md Section 45 for the
  // bug-yield-driven stop decision.
  coverageThreshold: {
    global: {
      statements: 51,
      branches: 45,
      functions: 52,
      lines: 52,
    },
  },

  // Reasonable defaults for an Express + pg app.
  // Bumped to 30s in Phase 12.8 — tenant_isolation.test.js's afterAll
  // cleanupTestRows() now takes >10s on CI as the suite grew past 100
  // tests and 8 cleanup queries fan out over thousands of test_* rows.
  testTimeout: 30000,
  verbose: false,

  // Serial execution — Phase 11e fix.
  // DB-backed tests share the test database and the test_* cleanup
  // strategy. Running files in parallel races: file A's afterAll(cleanup)
  // can delete rows file B's tests just inserted, causing FK violations
  // and unexpected 200/401/403 status flips. maxWorkers: 1 forces one
  // test file at a time.
  maxWorkers: 1,
};
