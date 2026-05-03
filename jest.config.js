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

  // Coverage thresholds — ratcheted at Phase 75b (May 3, 2026, Section 42 closeout):
  //   Phase 75b measured (PR #65 CI):  Statements 52.17% / Branches 46.63% / Functions 53.67% / Lines 53.22%
  //                                    +1.45pp lines from Phase 75a. 19 new integration tests on
  //                                    routes/material_requests.js (POST /requests + GET /:id + cancel +
  //                                    review + pdf-data + returns + PO/:id + send-order). Helper
  //                                    extension: 4 missing permissions (hub.materials_merge_send,
  //                                    purchase_orders.view, purchase_orders.print, materials.surplus_declare)
  //                                    + grants for COMPANY_ADMIN.
  //                                    Partial ratchet — functions delta (+1.22pp) too small for safe
  //                                    +3pp margin, held at 51. Bumped statements/branches/lines by +1.
  //   Phase 75a ratchet  (PR #64):     Statements 50.67% / Branches 45.07% / Functions 52.45% / Lines 51.77%
  //   Phase 73d ratchet  (CI #?):      Statements 48.54% / Branches 43.70% / Functions 51.47% / Lines 49.62%
  //   Phase 67b ratchet  (CI #178):    Statements 45.69% / Branches 40.22% / Functions 47.79% / Lines 46.71%
  //   Phase 67 ratchet   (CI #170):    Statements 44.52% / Branches 39.53% / Functions 46.07% / Lines 45.60%
  //   Phase 58 ratchet   (CI #131):    Statements 34.85% / Branches 26.44% / Functions 33.9%  / Lines 35.97%
  //   Phase 15 baseline  (CI #80):     Statements 18.14% / Branches 10.01% / Functions 14.00% / Lines 18.79%
  //
  // Floors set with ≥2pp headroom below measured per Section 4.6 convention —
  // absorbs the ~1.5pp build flake (Jest worker scheduling, cache hits,
  // parallel ordering) without flapping CI on small drift. Headrooms after
  // this ratchet: stmts 2.17pp / branches 2.63pp / fns 2.67pp / lines 3.22pp.
  // Goal: ≥65% lines (stretch 70%) on routes/ via Phase 75a–e batches.
  coverageThreshold: {
    global: {
      statements: 50,
      branches: 44,
      functions: 51,
      lines: 50,
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
