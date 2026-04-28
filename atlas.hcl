// Atlas configuration — Section 18 Day 4-5, Section 19 Phase 9.
// Drift-detection workflow: CI applies all migrations to a fresh PostGIS
// database and asserts no errors. Future migrations on top of the baseline
// are validated automatically on every PR.
//
// The migrations/ directory is the SINGLE source of truth for schema:
//   migrations/000_baseline_2026-04-28.sql  -> the prod snapshot at start
//   migrations/001_*.sql                    -> first new migration after baseline
//   migrations/002_*.sql                    -> ...

env "ci" {
  // Migration directory: standard golang-migrate format.
  // Filenames: NNN_description.sql (sortable, numeric prefix).
  migration {
    dir = "file://migrations"
    // Atlas's integrity check (atlas.sum) is intentionally disabled for the
    // first iteration. We can enable it later by running `atlas migrate hash`
    // locally and committing atlas.sum.
    revisions_schema = "atlas_schema_revisions"
  }

  // The CI workflow injects DEV_URL pointing to a fresh PostGIS service.
  // Atlas uses this to apply migrations and inspect the resulting schema.
  url     = getenv("DEV_URL")
  dev     = getenv("DEV_URL")
}
