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

  // Coverage thresholds — ratcheted at Phase 67 (May 2, 2026, after Section 22 hardening week):
  //   Measured (CI #170): Statements 44.52% / Branches 39.53% / Functions 46.07% / Lines 45.6%
  //   Phase 58 ratchet    (CI #131): Statements 34.85% / Branches 26.44% / Functions 33.9% / Lines 35.97%
  //   Phase 15 baseline   (CI #80):  Statements 18.14% / Branches 10.01% / Functions 14.00% / Lines 18.79%
  //
  // Floors set ~1-2pp below current measured to catch genuine regressions
  // without flapping on small drift (env order, single-test reorderings,
  // etc.). Phase 67 added 62 unit tests covering lib/email + lib/weeklyReport
  // helpers + lib/pushNotification — branches alone jumped +8pp from the
  // ccqZone table-driven block.
  // Goal: ≥70% line coverage on routes/ eventually. Ratchet up again
  // each time a section closes with new coverage.
  coverageThreshold: {
    global: {
      statements: 43,
      branches: 38,
      functions: 44,
      lines: 44,
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
