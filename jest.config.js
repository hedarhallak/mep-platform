// Jest configuration — Section 18 Week 2 Phase 10.
//
// Test discovery: any file matching tests/**/*.test.js.
// Future categories live under tests/{auth,tenant,rbac,workflows,security}/.
// Coverage targets the backend source (not mep-frontend / mep-mobile).

module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],

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

  // Reasonable defaults for an Express + pg app.
  testTimeout: 10000, // 10s — plenty for unit tests; integration tests can override
  verbose: false,
  // No global setup/teardown yet — wire up when DB-backed tests arrive (Phase 11+).
};
