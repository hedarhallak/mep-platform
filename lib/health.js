// lib/health.js — Phase 66 (May 2026), Section 22 production hardening.
//
// Structured readiness checks consumed by the GET /api/health/deep route in
// app.js. Each check returns a small status object with one of:
//   { status: 'ok',      ...details }   → green
//   { status: 'warn',    ...details }   → soft issue, route still returns 200
//   { status: 'fail',    ...details }   → hard failure, route returns 503
//   { status: 'skipped', reason }       → check N/A (e.g. file path missing
//                                          in dev/test); does NOT contribute
//                                          to overall pass/fail
//
// Hard-fail checks (db, disk) trip a 503 — UptimeRobot pings /api/health/deep
// only when explicitly configured to; the cheap /api/health stays at 200 for
// the existing 5-min liveness poll. Soft-warn checks (backup age) surface in
// the response body via a `warnings` array and never trip 503, so an old
// backup does not page Hedar at 3am.

'use strict';

const fs = require('node:fs/promises');

// --- Defaults / thresholds ---------------------------------------------------
//
// IMPORTANT: env-driven defaults (DISK_CHECK_PATH, BACKUP_LOG_PATH) are read
// inside the check functions at call time, not captured at module load. This
// is what lets tests override paths via process.env in beforeAll() and still
// have the new value take effect — capturing them as top-level `const`s
// would freeze whatever was set when require('./health') first ran.

const HARDCODED_DISK_PATH = '/var/lib/postgresql';
const HARDCODED_BACKUP_LOG = '/var/log/mep-backup.log';

// 90% used → hard fail. Postgres misbehaves badly long before disk is full;
// we want to alert with headroom.
const DISK_USED_FAIL_PCT = 90;

// Cron runs daily, so the freshest backup is always <24h old. 26h gives 2h of
// grace for slow runs / clock drift / one missed retry without paging.
const BACKUP_AGE_WARN_HOURS = 26;

// Cap how much of the log we read; the file is append-only and can grow. We
// only need the tail to find the most recent "Backup complete" marker.
const BACKUP_LOG_TAIL_BYTES = 64 * 1024;

function resolveDiskPath(arg) {
  return arg || process.env.DISK_CHECK_PATH || HARDCODED_DISK_PATH;
}

function resolveBackupLogPath(arg) {
  return arg || process.env.BACKUP_LOG_PATH || HARDCODED_BACKUP_LOG;
}

// --- Individual checks -------------------------------------------------------

/**
 * Round-trip the postgres pool with `SELECT 1`. Reports latency on success,
 * the error message on failure. `fail` status causes the route to return 503.
 */
async function checkDb(pool) {
  const start = Date.now();
  try {
    await pool.query('SELECT 1');
    return { status: 'ok', latency_ms: Date.now() - start };
  } catch (e) {
    return { status: 'fail', error: e.message };
  }
}

/**
 * statfs() the configured data path; convert blocks*bsize to a used %. Hard
 * fail past the threshold. If the path doesn't exist (typical in CI / dev),
 * return `skipped` so the overall route still passes.
 */
async function checkDisk(diskPathArg) {
  const diskPath = resolveDiskPath(diskPathArg);
  try {
    const stats = await fs.statfs(diskPath);
    const total = Number(stats.blocks) * Number(stats.bsize);
    const free = Number(stats.bfree) * Number(stats.bsize);
    if (total === 0) {
      return { status: 'skipped', reason: 'statfs returned zero blocks', path: diskPath };
    }
    const used = total - free;
    const used_pct = Math.round((used / total) * 100);
    return {
      status: used_pct > DISK_USED_FAIL_PCT ? 'fail' : 'ok',
      used_pct,
      threshold_pct: DISK_USED_FAIL_PCT,
      path: diskPath,
    };
  } catch (e) {
    return { status: 'skipped', reason: e.code || e.message, path: diskPath };
  }
}

/**
 * Read the tail of the backup log, find the most recent "===== Backup complete
 * ====="" marker, parse its bracketed timestamp, and warn if older than the
 * configured threshold. If the log is missing or has no completion marker yet,
 * return `skipped` rather than `warn` — we don't want a fresh server to page
 * before the first cron run completes.
 */
async function checkBackup(logPathArg, now = new Date()) {
  const logPath = resolveBackupLogPath(logPathArg);
  let content;
  try {
    const handle = await fs.open(logPath, 'r');
    try {
      const stats = await handle.stat();
      const start = Math.max(0, stats.size - BACKUP_LOG_TAIL_BYTES);
      const length = stats.size - start;
      const buf = Buffer.alloc(length);
      await handle.read(buf, 0, length, start);
      content = buf.toString('utf8');
    } finally {
      await handle.close();
    }
  } catch (e) {
    return { status: 'skipped', reason: e.code || e.message, path: logPath };
  }

  // Backup script writes lines like:
  //   [2026-05-02 08:36:37] ===== Backup complete =====
  // Server timezone is UTC (per scripts/backup/SETUP.md Part 2.10), so we
  // parse the bracketed timestamp as UTC explicitly.
  const lines = content.split('\n');
  let lastTimestamp = null;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i].includes('===== Backup complete =====')) continue;
    const m = lines[i].match(/^\[(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})\]/);
    if (m) {
      lastTimestamp = `${m[1]}T${m[2]}Z`;
      break;
    }
  }

  if (!lastTimestamp) {
    return {
      status: 'skipped',
      reason: 'no successful backup marker found in log tail',
      path: logPath,
    };
  }

  const lastDate = new Date(lastTimestamp);
  if (Number.isNaN(lastDate.getTime())) {
    return { status: 'skipped', reason: 'failed to parse timestamp', raw: lastTimestamp };
  }

  const ageHours = (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60);
  return {
    status: ageHours > BACKUP_AGE_WARN_HOURS ? 'warn' : 'ok',
    last_run: lastDate.toISOString(),
    age_hours: Math.round(ageHours * 10) / 10,
    threshold_hours: BACKUP_AGE_WARN_HOURS,
  };
}

// --- Aggregator --------------------------------------------------------------

/**
 * Run all checks in parallel against the supplied pool, then summarise into
 * the response payload the route returns. Surfaces:
 *   - statusCode: 200 unless any hard-fail check trips
 *   - body.ok: same boolean
 *   - body.checks: per-check details
 *   - body.warnings?: human-readable strings for any soft-warn check
 */
async function runChecks(pool, opts = {}) {
  const [db, disk, backup] = await Promise.all([
    checkDb(pool),
    checkDisk(opts.diskPath),
    checkBackup(opts.backupLogPath, opts.now),
  ]);

  const checks = { db, disk, backup };
  const hardFail = db.status === 'fail' || disk.status === 'fail';

  const warnings = [];
  for (const [name, c] of Object.entries(checks)) {
    if (c.status !== 'warn') continue;
    if (name === 'backup' && typeof c.age_hours === 'number') {
      warnings.push(`backup is ${c.age_hours}h old (threshold ${c.threshold_hours}h)`);
    } else {
      warnings.push(`${name}: ${c.reason || 'soft warning'}`);
    }
  }

  return {
    statusCode: hardFail ? 503 : 200,
    body: {
      ok: !hardFail,
      service: 'mep-site-workforce',
      time: (opts.now || new Date()).toISOString(),
      checks,
      ...(warnings.length > 0 && { warnings }),
    },
  };
}

module.exports = {
  checkDb,
  checkDisk,
  checkBackup,
  runChecks,
  // Exported for tests:
  BACKUP_AGE_WARN_HOURS,
};
