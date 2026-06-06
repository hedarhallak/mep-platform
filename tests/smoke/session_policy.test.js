// tests/smoke/session_policy.test.js
//
// §133 (DECISIONS §137) — pure session-cap evaluation. No DB.

'use strict';

const { evaluateSessionCaps } = require('../../lib/session_policy');

describe('lib/session_policy evaluateSessionCaps', () => {
  const now = Date.now();
  const minAgo = (m) => new Date(now - m * 60 * 1000);

  test('ok when within both the idle and absolute limits', () => {
    expect(
      evaluateSessionCaps({
        lastActivityAt: minAgo(5),
        sessionStartedAt: minAgo(60),
        now,
        idleMaxMin: 60,
        absMaxMin: 480,
      })
    ).toEqual({ ok: true });
  });

  test('IDLE when last activity is older than the idle cap', () => {
    expect(
      evaluateSessionCaps({
        lastActivityAt: minAgo(61),
        sessionStartedAt: minAgo(61),
        now,
        idleMaxMin: 60,
        absMaxMin: 480,
      })
    ).toEqual({ ok: false, reason: 'IDLE' });
  });

  test('ABSOLUTE when session is older than the absolute cap, even if just active', () => {
    expect(
      evaluateSessionCaps({
        lastActivityAt: minAgo(1),
        sessionStartedAt: minAgo(481),
        now,
        idleMaxMin: 60,
        absMaxMin: 480,
      })
    ).toEqual({ ok: false, reason: 'ABSOLUTE' });
  });

  test('absolute takes priority when both caps are exceeded', () => {
    expect(
      evaluateSessionCaps({
        lastActivityAt: minAgo(120),
        sessionStartedAt: minAgo(600),
        now,
        idleMaxMin: 60,
        absMaxMin: 480,
      })
    ).toEqual({ ok: false, reason: 'ABSOLUTE' });
  });

  test('null timestamps fail open (never lock out at deploy time)', () => {
    expect(evaluateSessionCaps({ lastActivityAt: null, sessionStartedAt: null, now })).toEqual({
      ok: true,
    });
  });
});
