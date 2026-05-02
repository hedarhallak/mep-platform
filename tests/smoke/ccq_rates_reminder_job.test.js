// tests/smoke/ccq_rates_reminder_job.test.js — Phase 73b (May 2026,
// Section 22 hardening, coverage push 47% → 65%).
//
// jobs/ccqRatesReminderJob.js was at zero coverage. The file:
//   1. Registers two cron tasks (Mar 1 + Apr 1 at 14:00 UTC) that fire
//      every year but no-op unless the year is exactly 2028.
//   2. Exposes sendCCQReminder(pool) which queries SUPER_ADMINs and emails
//      each one via SendGrid.
//
// We mock node-cron, ../db (pool), and @sendgrid/mail so no real timers,
// no DB, no SendGrid traffic.

'use strict';

const ORIGINAL_ENV = { ...process.env };

// Capture cron registrations so tests can poke the callbacks directly.
const cronRegistrations = []; // [{ expr, cb }, ...]

jest.mock('node-cron', () => ({
  schedule: jest.fn((expr, cb) => {
    cronRegistrations.push({ expr, cb });
    return { stop: jest.fn() };
  }),
}));

// Mutable handles so individual tests can swap behaviour per case.
let mockQueryImpl = jest.fn();
jest.mock('../../db', () => ({
  pool: {
    query: (...args) => mockQueryImpl(...args),
  },
}));

const mockSgSend = jest.fn();
const mockSgSetApiKey = jest.fn();
jest.mock('@sendgrid/mail', () => ({
  setApiKey: (...args) => mockSgSetApiKey(...args),
  send: (...args) => mockSgSend(...args),
}));

const cron = require('node-cron');

function loadJob() {
  jest.resetModules();
  cronRegistrations.length = 0;
  jest.doMock('node-cron', () => ({
    schedule: jest.fn((expr, cb) => {
      cronRegistrations.push({ expr, cb });
      return { stop: jest.fn() };
    }),
  }));
  jest.doMock('../../db', () => ({
    pool: { query: (...args) => mockQueryImpl(...args) },
  }));
  jest.doMock('@sendgrid/mail', () => ({
    setApiKey: (...args) => mockSgSetApiKey(...args),
    send: (...args) => mockSgSend(...args),
  }));
  return require('../../jobs/ccqRatesReminderJob');
}

beforeEach(() => {
  cronRegistrations.length = 0;
  mockQueryImpl = jest.fn();
  mockSgSend.mockReset();
  mockSgSetApiKey.mockReset();
  cron.schedule.mockClear();
  delete process.env.SENDGRID_API_KEY;
  delete process.env.SENDGRID_FROM_EMAIL;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('jobs/ccqRatesReminderJob — registration', () => {
  test('registers two cron schedules (Mar 1 + Apr 1) at 14:00 UTC', () => {
    const register = loadJob();

    register({ query: jest.fn() });

    expect(cronRegistrations).toHaveLength(2);
    expect(cronRegistrations[0].expr).toBe('0 14 1 3 *'); // Mar 1
    expect(cronRegistrations[1].expr).toBe('0 14 1 4 *'); // Apr 1
  });

  test('cron callbacks no-op when current year is not 2028', () => {
    const register = loadJob();
    const fakePool = { query: jest.fn() };

    register(fakePool);

    // Force "now" to a non-2028 year.
    const realDate = global.Date;
    class FakeDate extends realDate {
      getFullYear() {
        return 2026;
      }
    }
    global.Date = FakeDate;

    cronRegistrations[0].cb();
    cronRegistrations[1].cb();

    expect(fakePool.query).not.toHaveBeenCalled();

    global.Date = realDate;
  });

  test('cron callbacks invoke sendCCQReminder when current year is 2028', async () => {
    const register = loadJob();
    const fakePool = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    };

    register(fakePool);

    const realDate = global.Date;
    class FakeDate extends realDate {
      getFullYear() {
        return 2028;
      }
    }
    global.Date = FakeDate;

    cronRegistrations[0].cb();
    // Drain microtasks so the async sendCCQReminder runs to completion.
    await new Promise((resolve) => setImmediate(resolve));

    expect(fakePool.query).toHaveBeenCalledTimes(1);

    global.Date = realDate;
  });

  test('sets the SendGrid API key when SENDGRID_API_KEY is present at module load', () => {
    process.env.SENDGRID_API_KEY = 'SG.fake-key';
    loadJob();

    expect(mockSgSetApiKey).toHaveBeenCalledWith('SG.fake-key');
  });

  test('does NOT call setApiKey when SENDGRID_API_KEY is unset at module load', () => {
    loadJob();
    expect(mockSgSetApiKey).not.toHaveBeenCalled();
  });
});

describe('jobs/ccqRatesReminderJob — sendCCQReminder', () => {
  test('returns silently when no SUPER_ADMIN users have email-formatted usernames', async () => {
    const { sendCCQReminder } = loadJob();
    const fakePool = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    };

    await sendCCQReminder(fakePool);

    expect(fakePool.query).toHaveBeenCalledTimes(1);
    expect(mockSgSend).not.toHaveBeenCalled();
  });

  test('sends one email per SUPER_ADMIN admin with email-formatted username', async () => {
    process.env.SENDGRID_FROM_EMAIL = 'admin@constrai.ca';
    const { sendCCQReminder } = loadJob();
    const fakePool = {
      query: jest.fn().mockResolvedValue({
        rows: [{ username: 'a@x.com' }, { username: 'b@x.com' }],
      }),
    };
    mockSgSend.mockResolvedValue([{ statusCode: 202 }]);

    await sendCCQReminder(fakePool);

    expect(mockSgSend).toHaveBeenCalledTimes(2);

    const firstCall = mockSgSend.mock.calls[0][0];
    expect(firstCall.to).toBe('a@x.com');
    expect(firstCall.from).toBe('admin@constrai.ca');
    expect(firstCall.subject).toMatch(/CCQ Travel Rates/i);
    expect(firstCall.subject).toMatch(/2028/);
    expect(firstCall.html).toMatch(/April 30, 2028/);
    expect(firstCall.html).toMatch(/acq\.org/);

    const secondCall = mockSgSend.mock.calls[1][0];
    expect(secondCall.to).toBe('b@x.com');
  });

  test('falls back to noreply@mepplatform.com when SENDGRID_FROM_EMAIL is unset', async () => {
    const { sendCCQReminder } = loadJob();
    const fakePool = {
      query: jest.fn().mockResolvedValue({ rows: [{ username: 'a@x.com' }] }),
    };
    mockSgSend.mockResolvedValue([{ statusCode: 202 }]);

    await sendCCQReminder(fakePool);

    expect(mockSgSend.mock.calls[0][0].from).toBe('noreply@mepplatform.com');
  });

  test('continues iterating when one send fails (logs error, sends to remaining admins)', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { sendCCQReminder } = loadJob();
    const fakePool = {
      query: jest.fn().mockResolvedValue({
        rows: [{ username: 'first@x.com' }, { username: 'second@x.com' }],
      }),
    };
    mockSgSend
      .mockRejectedValueOnce(new Error('SendGrid 429'))
      .mockResolvedValueOnce([{ statusCode: 202 }]);

    await sendCCQReminder(fakePool);

    expect(mockSgSend).toHaveBeenCalledTimes(2);
    expect(errSpy).toHaveBeenCalledWith(
      '[ccqRatesReminder] Failed to send to first@x.com:',
      'SendGrid 429'
    );

    errSpy.mockRestore();
  });

  test('swallows DB errors (logs but does not throw)', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { sendCCQReminder } = loadJob();
    const fakePool = {
      query: jest.fn().mockRejectedValue(new Error('connection refused')),
    };

    await expect(sendCCQReminder(fakePool)).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalledWith('[ccqRatesReminder] Error:', expect.any(Error));
    expect(mockSgSend).not.toHaveBeenCalled();

    errSpy.mockRestore();
  });

  test('falls back to the module-level pool when called without an argument', async () => {
    const { sendCCQReminder } = loadJob();
    // The default pool was wired via jest.doMock, so mockQueryImpl is what
    // module-level `pool.query` lands on.
    mockQueryImpl = jest.fn().mockResolvedValue({ rows: [] });

    await sendCCQReminder(); // no pool argument

    expect(mockQueryImpl).toHaveBeenCalledTimes(1);
  });

  test('queries app_users for SUPER_ADMINs with email-formatted usernames', async () => {
    const { sendCCQReminder } = loadJob();
    const fakePool = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    };

    await sendCCQReminder(fakePool);

    const sql = fakePool.query.mock.calls[0][0];
    expect(sql).toMatch(/app_users/);
    expect(sql).toMatch(/SUPER_ADMIN/);
    expect(sql).toMatch(/LIKE\s+'%@%'/);
  });
});
