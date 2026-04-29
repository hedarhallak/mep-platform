# Tests

Jest + Supertest test suite for the Constrai backend. Established in Section 19 Phase 10
(2026-04-28). The full plan from Section 18 Week 2-3 calls for ~50-80 tests across five
categories; today we bootstrapped the infrastructure and one smoke category.

## Running tests

```bash
npm test               # one-shot run
npm run test:watch     # re-runs on file change (local dev)
npm run test:coverage  # generates coverage/ report
```

CI runs `npm test` as a blocking step in the `backend` job.

## Directory layout

```
tests/
  smoke/         # Pure-function tests, no DB / no network. Sanity for the runner itself.
  auth/          # Auth flows: login, refresh, change-pin, logout, invite, activate (Phase 11)
  tenant/        # Tenant isolation: company A cannot read/write company B data (Phase 12)
  rbac/          # Role × permission matrix coverage — 13 roles × 58 permissions (Phase 13)
  workflows/     # Core workflow integration: assignment lifecycle, attendance, materials, hub (Phase 14)
  security/      # Regression tests: SQL injection attempts, XSS payloads, rate-limit hits, file-upload bypass (Phase 15)
```

## Conventions

- Filename: `<feature>.test.js`. Jest discovers everything matching `tests/**/*.test.js`.
- One feature per file; group related tests with `describe()`.
- Each test should be independent — no leaking state between tests.
- DB-backed tests (Phase 11+) will use a transaction-rollback pattern: each test opens a
  transaction in `beforeEach`, runs assertions, then `ROLLBACK` in `afterEach`. The
  postgis/postgis:14 service container from `.github/workflows/ci.yml` will be reused.
- Fixture data: TBD when DB tests land. Likely a `tests/fixtures/` folder with SQL or JSON
  seed data, applied once in `globalSetup`.

## Coverage targets

Currently no minimum threshold — the infrastructure is brand new and most of the codebase
isn't tested yet. Once Phase 11-15 land, the plan (Section 18 Week 4) is to enforce ≥70%
line coverage on `routes/`.

## What's NOT here yet

- Full Express app integration tests (need DB setup + supertest wiring) — Phase 11
- Tenant isolation regression tests — Phase 12
- RBAC matrix sweep — Phase 13
- Workflow integration tests — Phase 14
- Security regression suite — Phase 15
