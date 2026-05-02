// Phase 68 (May 2026) — first frontend unit tests, covering the shared
// formatter helpers in src/utils/formatters.js. Pure functions, no DOM,
// no React — exercises the Vitest harness end-to-end.
//
// The mep-frontend formatters mirror the backend's lib/email + lib/
// weeklyReport helpers (which already have their own Jest tests). These
// are intentionally identical contracts so a worker's "Friday 7:30 AM"
// reads the same in the mobile app, the web app, and the weekly email.

import { describe, test, expect } from 'vitest';
import {
  todayStr,
  tomorrowStr,
  fmtTime,
  fmtHours,
  fmtDate,
  fmtDateTime,
} from './formatters';

// ---------------------------------------------------------------------------
// todayStr / tomorrowStr — TZ-aware ISO date helpers
// ---------------------------------------------------------------------------

describe('todayStr', () => {
  test('returns a YYYY-MM-DD string', () => {
    expect(todayStr()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('tomorrowStr', () => {
  test('returns a YYYY-MM-DD string one day after today', () => {
    const today = new Date(todayStr() + 'T12:00:00Z');
    const tomorrow = new Date(tomorrowStr() + 'T12:00:00Z');
    const diffDays = Math.round(
      (tomorrow.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );
    expect(diffDays).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// fmtTime — 24h "HH:MM" → "HH:MM AM/PM"
// ---------------------------------------------------------------------------

describe('fmtTime', () => {
  test('AM hours', () => {
    expect(fmtTime('07:30')).toBe('07:30 AM');
    expect(fmtTime('11:59')).toBe('11:59 AM');
  });

  test('PM hours', () => {
    expect(fmtTime('13:00')).toBe('01:00 PM');
    expect(fmtTime('23:45')).toBe('11:45 PM');
  });

  test('midnight + noon edge cases', () => {
    expect(fmtTime('00:00')).toBe('12:00 AM');
    expect(fmtTime('12:00')).toBe('12:00 PM');
  });

  test('strips seconds before parsing', () => {
    expect(fmtTime('07:30:45')).toBe('07:30 AM');
  });

  test('returns em-dash for falsy inputs', () => {
    expect(fmtTime(null)).toBe('—');
    expect(fmtTime(undefined)).toBe('—');
    expect(fmtTime('')).toBe('—');
  });

  test('returns em-dash for unparseable strings', () => {
    expect(fmtTime('not a time')).toBe('—');
    expect(fmtTime('25:99')).not.toBe('—'); // function doesn't validate range
  });
});

// ---------------------------------------------------------------------------
// fmtHours — float hours → "Xh Ym" / "Xh"
// ---------------------------------------------------------------------------

describe('fmtHours', () => {
  test('whole hours render without minutes', () => {
    expect(fmtHours(8)).toBe('8h');
    expect(fmtHours('5')).toBe('5h');
    expect(fmtHours(0)).toBe('0h');
  });

  test('fractional hours render minutes', () => {
    expect(fmtHours(7.5)).toBe('7h 30m');
    expect(fmtHours(2.25)).toBe('2h 15m');
    expect(fmtHours(0.5)).toBe('0h 30m');
  });

  test('null / undefined / empty render em-dash', () => {
    expect(fmtHours(null)).toBe('—');
    expect(fmtHours(undefined)).toBe('—');
    expect(fmtHours('')).toBe('—');
  });

  test('NaN-ish strings render em-dash', () => {
    expect(fmtHours('abc')).toBe('—');
  });
});

// ---------------------------------------------------------------------------
// fmtDate / fmtDateTime — locale-formatted dates
// ---------------------------------------------------------------------------

describe('fmtDate', () => {
  test('renders Mon DD, YYYY-style string', () => {
    const out = fmtDate('2026-05-04');
    expect(out).toMatch(/(May|April)/);
    expect(out).toMatch(/2026/);
  });

  test('returns em-dash for falsy inputs', () => {
    expect(fmtDate(null)).toBe('—');
    expect(fmtDate(undefined)).toBe('—');
    expect(fmtDate('')).toBe('—');
  });
});

describe('fmtDateTime', () => {
  test('renders Mon DD + HH:MM AM/PM-style string', () => {
    const out = fmtDateTime('2026-05-04T13:30:00Z');
    // Locale + TZ make exact assertion brittle; just check key segments.
    expect(out).toMatch(/(May|April)/);
    expect(out).toMatch(/\d{1,2}:\d{2}/);
  });

  test('returns em-dash for falsy inputs', () => {
    expect(fmtDateTime(null)).toBe('—');
    expect(fmtDateTime(undefined)).toBe('—');
    expect(fmtDateTime('')).toBe('—');
  });
});
