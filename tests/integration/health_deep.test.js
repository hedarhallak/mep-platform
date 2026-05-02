// tests/integration/health_deep.test.js — Phase 66.
//
// Covers lib/health.js (the structured readiness checks) plus the new
// GET /api/health/deep route in app.js. Disk- and log-based checks are
// exercised against fixtures in /tmp to keep them hermetic and free of
// the prod-only paths (/var/lib/postgresql, /var/log/mep-backup.log).
// DB checks are gated behind describeIfDb because they require a live
// postgres pool — same pattern as the rest of the integration suite.

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const request = require('supertest');

const { describeIfDb, getPool, closePool } = require('../helpers/db');
const {
  checkDb,
  checkDisk,
  checkBackup,
  runChecks,
  BACKUP_AGE_WARN_HOURS,
} = require('../../lib/health');

// ---------------------------------------------------------------------------
// checkDisk — exercised against real filesystem paths (no DB needed)
// ---------------------------------------------------------------------------

describe('checkDisk', () => {
  test('returns ok with used_pct for an existing path', async () => {
    const result = await checkDisk(os.tmpdir());
    expect(result.status).toMatch(/^(ok|fail)$/); // tmpdir might be near full in odd CI
    expect(typeof result.used_pct).toBe('number');
    expect(result.used_pct).toBeGreaterThanOrEqual(0);
    expect(result.used_pct).toBeLessThanOrEqual(100);
    expect(result.path).toBe(os.tmpdir());
    expect(result.threshold_pct).toBe(90);
  });

  test('returns skipped when path does not exist', async () => {
    const result = await checkDisk('/this/path/definitely/does/not/exist');
    expect(result.status).toBe('skipped');
    expect(result.reason).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// checkBackup — exercised against fixture log files in tmp
// ---------------------------------------------------------------------------

describe('checkBackup', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mep-health-test-'));
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeLog(name, content) {
    const p = path.join(tmpDir, name);
    fs.writeFileSync(p, content);
    return p;
  }

  test('returns ok when last backup is recent', async () => {
    const recentTs = new Date('2026-05-02T08:36:37Z');
    const now = new Date('2026-05-02T10:00:00Z'); // ~1.4h later
    const log = writeLog(
      'recent.log',
      [
        '[2026-05-02 08:36:36] ===== Starting backup =====',
        '[2026-05-02 08:36:37] Upload verified',
        '[2026-05-02 08:36:37] ===== Backup complete =====',
        '',
      ].join('\n')
    );

    const result = await checkBackup(log, now);
    expect(result.status).toBe('ok');
    expect(result.last_run).toBe(recentTs.toISOString());
    expect(result.age_hours).toBeGreaterThan(0);
    expect(result.age_hours).toBeLessThan(BACKUP_AGE_WARN_HOURS);
    expect(result.threshold_hours).toBe(BACKUP_AGE_WARN_HOURS);
  });

  test('returns warn when last backup is stale', async () => {
    const staleTs = new Date('2026-04-30T00:00:00Z');
    const now = new Date('2026-05-02T10:00:00Z'); // ~58h later
    const log = writeLog(
      'stale.log',
      [
        '[2026-04-30 00:00:00] ===== Starting backup =====',
        '[2026-04-30 00:00:00] ===== Backup complete =====',
        '',
      ].join('\n')
    );

    const result = await checkBackup(log, now);
    expect(result.status).toBe('warn');
    expect(result.last_run).toBe(staleTs.toISOString());
    expect(result.age_hours).toBeGreaterThan(BACKUP_AGE_WARN_HOURS);
  });

  test('returns skipped when log file does not exist', async () => {
    const result = await checkBackup(path.join(tmpDir, 'nope.log'));
    expect(result.status).toBe('skipped');
    expect(result.reason).toBeDefined();
  });

  test('returns skipped when log has no completion marker', async () => {
    // Mimics the post-incident log we saw on May 2: many "Permission denied"
    // lines but zero "===== Backup complete =====" since April 26.
    const log = writeLog(
      'no-complete.log',
      [
        '/bin/sh: 1: /var/www/mep/scripts/backup/backup_db.sh: Permission denied',
        '/bin/sh: 1: /var/www/mep/scripts/backup/cleanup_old_backups.sh: Permission denied',
        '',
      ].join('\n')
    );
    const result = await checkBackup(log);
    expect(result.status).toBe('skipped');
  });

  test('finds the LAST completion marker, not the first', async () => {
    const olderTs = '2026-04-30 00:00:00';
    const newerTs = '2026-05-02 08:36:37';
    const log = writeLog(
      'two-completes.log',
      [
        `[${olderTs}] ===== Backup complete =====`,
        `[${newerTs}] ===== Backup complete =====`,
        '',
      ].join('\n')
    );
    const result = await checkBackup(log, new Date('2026-05-02T10:00:00Z'));
    expect(result.last_run).toBe(new Date('2026-05-02T08:36:37Z').toISOString());
  });
});

// ---------------------------------------------------------------------------
// checkDb + runChecks + GET /api/health/deep — DB-dependent
// ---------------------------------------------------------------------------

describeIfDb('Phase 66 health endpoints (DB available)', () => {
  let app;

  beforeAll(() => {
    // Force lib/health to use a non-existent disk path and missing log file
    // so the route's disk + backup checks return `skipped` and don't depend
    // on the test box's actual filesystem layout.
    process.env.DISK_CHECK_PATH = '/nonexistent-for-health-test';
    process.env.BACKUP_LOG_PATH = '/nonexistent-for-health-test.log';
    // Re-require app so it picks up the env we just set (path resolution in
    // lib/health reads env at call time, but the route itself has been
    // imported once).
    app = require('../../app');
  });

  afterAll(async () => {
    delete process.env.DISK_CHECK_PATH;
    delete process.env.BACKUP_LOG_PATH;
    await closePool();
  });

  test('checkDb returns ok against the live test pool', async () => {
    const pool = getPool();
    const result = await checkDb(pool);
    expect(result.status).toBe('ok');
    expect(typeof result.latency_ms).toBe('number');
    expect(result.latency_ms).toBeGreaterThanOrEqual(0);
  });

  test('GET /api/health (cheap liveness) still returns 200 with the original shape', async () => {
    const res = await request(app).get('/api/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.service).toBe('mep-site-workforce');
    expect(typeof res.body.time).toBe('string');
  });

  test('GET /api/health/deep returns 200 with structured checks', async () => {
    const res = await request(app).get('/api/health/deep');
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.service).toBe('mep-site-workforce');
    expect(res.body.checks).toBeDefined();
    expect(res.body.checks.db.status).toBe('ok');
    expect(typeof res.body.checks.db.latency_ms).toBe('number');
    // disk + backup are skipped via the env overrides above
    expect(res.body.checks.disk.status).toBe('skipped');
    expect(res.body.checks.backup.status).toBe('skipped');
  });

  test('runChecks aggregates without warnings when all checks are ok/skipped', async () => {
    const pool = getPool();
    const { statusCode, body } = await runChecks(pool, {
      diskPath: '/nonexistent-for-test',
      backupLogPath: '/nonexistent-for-test.log',
    });
    expect(statusCode).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.warnings).toBeUndefined();
  });

  test('runChecks emits a warning when the backup log shows a stale completion', async () => {
    const pool = getPool();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mep-health-stale-'));
    const logPath = path.join(tmpDir, 'stale.log');
    fs.writeFileSync(logPath, ['[2026-04-30 00:00:00] ===== Backup complete =====', ''].join('\n'));

    try {
      const { statusCode, body } = await runChecks(pool, {
        diskPath: '/nonexistent-for-test',
        backupLogPath: logPath,
        now: new Date('2026-05-02T10:00:00Z'),
      });
      expect(statusCode).toBe(200); // soft warn — still 200
      expect(body.ok).toBe(true);
      expect(body.warnings).toBeDefined();
      expect(body.warnings.some((w) => /backup is/.test(w))).toBe(true);
      expect(body.checks.backup.status).toBe('warn');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
