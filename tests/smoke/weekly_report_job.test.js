// tests/smoke/weekly_report_job.test.js — Phase 73b (May 2026, Section 22
// hardening, coverage push 47% → 65%).
//
// jobs/weeklyReportJob.js was at zero coverage. The file is small (~45
// lines) but worth covering: it registers a cron task, has a manual-trigger
// env switch, and a try/catch around runWeeklyReports. We mock both
// `node-cron` and `../lib/weeklyReport` so no real timers / DB work fires.

'use strict';

const ORIGINAL_ENV = { ...process.env };

// Capture the most recent cron registration so tests can reach in and
// invoke the scheduled callback synchronously.
let lastSchedule = null;
let lastCallback = null;

jest.mock('node-cron', () => ({
  schedule: jest.fn((expr, cb) => {
    lastSchedule = expr;
    lastCallback = cb;
    return { stop: jest.fn() };
  }),
}));

const mockRunWeeklyReports = jest.fn();
jest.mock('../../lib/weeklyReport', () => ({
  runWeeklyReports: (...args) => mockRunWeeklyReports(...args),
}));

const cron = require('node-cron');

function loadJob() {
  // Re-require so module-level state (the require-time imports) is fresh.
  jest.resetModules();
  // Re-mock after resetModules so the manual mocks above survive.
  jest.doMock('node-cron', () => ({
    schedule: jest.fn((expr, cb) => {
      lastSchedule = expr;
      lastCallback = cb;
      return { stop: jest.fn() };
    }),
  }));
  jest.doMock('../../lib/weeklyReport', () => ({
    runWeeklyReports: (...args) => mockRunWeeklyReports(...args),
  }));
  return require('../../jobs/weeklyReportJob');
}

beforeEach(() => {
  lastSchedule = null;
  lastCallback = null;
  mockRunWeeklyReports.mockReset();
  cron.schedule.mockClear();
  // Wipe env keys we care about to start fresh
  delete process.env.WEEKLY_REPORT_CRON;
  delete process.env.RUN_WEEKLY_REPORT_NOW;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('jobs/weeklyReportJob', () => {
  test('registers the default cron schedule (0 23 * * 1) when WEEKLY_REPORT_CRON is unset', () => {
    const startJob = loadJob();
    const fakePool = { query: jest.fn() };

    startJob(fakePool);

    expect(lastSchedule).toBe('0 23 * * 1');
    expect(typeof lastCallback).toBe('function');
  });

  test('honours WEEKLY_REPORT_CRON when set', () => {
    process.env.WEEKLY_REPORT_CRON = '5 4 * * 0';
    const startJob = loadJob();

    startJob({ query: jest.fn() });

    expect(lastSchedule).toBe('5 4 * * 0');
  });

  test('cron callback invokes runWeeklyReports with the pool argument', async () => {
    const startJob = loadJob();
    const fakePool = { id: 'pool-1' };
    mockRunWeeklyReports.mockResolvedValueOnce(undefined);

    startJob(fakePool);

    expect(mockRunWeeklyReports).not.toHaveBeenCalled(); // not yet — only on schedule
    await lastCallback();

    expect(mockRunWeeklyReports).toHaveBeenCalledTimes(1);
    expect(mockRunWeeklyReports).toHaveBeenCalledWith(fakePool);
  });

  test('cron callback swallows errors from runWeeklyReports (logs, does not throw)', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const startJob = loadJob();
    mockRunWeeklyReports.mockRejectedValueOnce(new Error('boom'));

    startJob({ query: jest.fn() });

    await expect(lastCallback()).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalledWith('[weeklyReportJob] Uncaught error:', 'boom');

    errSpy.mockRestore();
  });

  test('does NOT trigger an immediate run when RUN_WEEKLY_REPORT_NOW is unset', () => {
    const startJob = loadJob();

    startJob({ query: jest.fn() });

    expect(mockRunWeeklyReports).not.toHaveBeenCalled();
  });

  test('triggers an immediate run when RUN_WEEKLY_REPORT_NOW=true', async () => {
    process.env.RUN_WEEKLY_REPORT_NOW = 'true';
    mockRunWeeklyReports.mockResolvedValueOnce(undefined);
    const startJob = loadJob();
    const fakePool = { id: 'pool-now' };

    startJob(fakePool);

    expect(mockRunWeeklyReports).toHaveBeenCalledTimes(1);
    expect(mockRunWeeklyReports).toHaveBeenCalledWith(fakePool);
  });

  test('immediate-run error path logs but does not throw', async () => {
    process.env.RUN_WEEKLY_REPORT_NOW = 'true';
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockRunWeeklyReports.mockRejectedValueOnce(new Error('manual boom'));

    const startJob = loadJob();

    // The manual run is fire-and-forget (.catch handler only). Drain the
    // microtask queue so the rejection is observed.
    startJob({ query: jest.fn() });
    await new Promise((resolve) => setImmediate(resolve));

    expect(errSpy).toHaveBeenCalledWith('[weeklyReportJob] Manual run error:', 'manual boom');

    errSpy.mockRestore();
  });

  test('does NOT trigger immediate run when RUN_WEEKLY_REPORT_NOW is "false"', () => {
    process.env.RUN_WEEKLY_REPORT_NOW = 'false';
    const startJob = loadJob();

    startJob({ query: jest.fn() });

    expect(mockRunWeeklyReports).not.toHaveBeenCalled();
  });
});
