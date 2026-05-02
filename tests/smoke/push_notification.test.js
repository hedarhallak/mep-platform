// Smoke tests for lib/pushNotification.js — Phase 67 (May 2026,
// coverage push 41% → 50%).
//
// The function is small (~38 lines) but uncovered until now. It does:
//   1. Look up the user's push token in Postgres
//   2. Bail if no token / not an Expo token
//   3. POST a JSON payload to the Expo push API
//
// We mock both the DB pool (../db) and global fetch so the test stays
// hermetic — no Postgres, no network.

'use strict';

// Mock ../db BEFORE requiring the module under test. The mock factory has
// to construct the pool object inline (jest hoists jest.mock above the
// require), so we wire it through a module-level mutable handle the tests
// can replace per-case.
let mockQueryImpl = jest.fn();
jest.mock('../../db', () => ({
  pool: {
    query: (...args) => mockQueryImpl(...args),
  },
}));

const { sendPushNotification } = require('../../lib/pushNotification');

// Replace global.fetch with a spy that resolves to a fake successful
// response. Each test resets call history.
const originalFetch = global.fetch;
beforeAll(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue({ data: { status: 'ok' } }),
  });
});
afterAll(() => {
  global.fetch = originalFetch;
});

beforeEach(() => {
  mockQueryImpl = jest.fn();
  global.fetch.mockClear();
});

describe('sendPushNotification', () => {
  test('returns silently when the user has no push token registered', async () => {
    mockQueryImpl.mockResolvedValueOnce({ rows: [] });

    await expect(sendPushNotification(123, 'Title', 'Body')).resolves.toBeUndefined();
    expect(mockQueryImpl).toHaveBeenCalledTimes(1);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('returns silently when the stored token is not an Expo token', async () => {
    mockQueryImpl.mockResolvedValueOnce({
      rows: [{ token: 'definitely-not-expo-token' }],
    });

    await sendPushNotification(123, 'Title', 'Body');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('POSTs to the Expo push endpoint when the token is valid', async () => {
    mockQueryImpl.mockResolvedValueOnce({
      rows: [{ token: 'ExponentPushToken[abc123]' }],
    });

    await sendPushNotification(123, 'Hello', 'World', { extra: 'data' });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('https://exp.host/--/api/v2/push/send');
    expect(opts.method).toBe('POST');
    expect(opts.headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(opts.body);
    expect(body.to).toBe('ExponentPushToken[abc123]');
    expect(body.title).toBe('Hello');
    expect(body.body).toBe('World');
    expect(body.data).toEqual({ extra: 'data' });
    expect(body.priority).toBe('high');
    expect(body.sound).toBe('default');
  });

  test('defaults the data payload to an empty object when omitted', async () => {
    mockQueryImpl.mockResolvedValueOnce({
      rows: [{ token: 'ExponentPushToken[xyz]' }],
    });

    await sendPushNotification(456, 'Ping', 'Pong');

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.data).toEqual({});
  });

  test('swallows errors from the DB layer (logs but does not throw)', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockQueryImpl.mockRejectedValueOnce(new Error('connection refused'));

    await expect(sendPushNotification(789, 'T', 'B')).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalledWith('Push notification error:', expect.any(Error));
    expect(global.fetch).not.toHaveBeenCalled();

    errSpy.mockRestore();
  });

  test('swallows errors from the fetch call (logs but does not throw)', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockQueryImpl.mockResolvedValueOnce({
      rows: [{ token: 'ExponentPushToken[fail]' }],
    });
    global.fetch.mockRejectedValueOnce(new Error('network down'));

    await expect(sendPushNotification(1, 'T', 'B')).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalledWith('Push notification error:', expect.any(Error));

    errSpy.mockRestore();
  });
});
