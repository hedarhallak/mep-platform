// ESLint 9 flat config — Section 18 Week 1 Day 2.
// Scope: backend root only (Node.js + CommonJS).
// mep-frontend has its own ESLint setup. mep-mobile is deferred.
//
// Strictness: eslint:recommended baseline + a few practical relaxations
// for an Express codebase that uses console.log liberally and accepts
// underscore-prefixed unused args.

const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  js.configs.recommended,

  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // Allow `_arg` style unused parameters (common for Express middleware).
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // We use console.log/error throughout — production logging.
      'no-console': 'off',
      // Catch typos in variable names — the highest-value rule.
      'no-undef': 'error',
      // Catch unreachable code after return/throw.
      'no-unreachable': 'error',
      // Catch missing await on a promise that's then immediately .catch()ed.
      'require-atomic-updates': 'off',
      // Allow empty catch blocks (we sometimes swallow errors intentionally).
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },

  // Tests have access to Jest globals (describe, test, expect, beforeEach, ...).
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
  },

  {
    ignores: [
      'node_modules/**',
      'mep-frontend/**',
      'mep-mobile/**',
      'public/**',
      'dist/**',
      'build/**',
      'uploads/**',
      'coverage/**',
      'db/migrations.archive/**',
      // Generated / vendor.
      '*.min.js',
      'package-lock.json',
    ],
  },
];
