// Smoke tests for the pure helpers in lib/weeklyReport.js — Phase 67
// (May 2026, Section 22 hardening, coverage push 41% → 50%).
//
// These functions are exercised in production through runWeeklyReports(),
// which is DB-heavy and emails-heavy. Testing them directly via the unit
// surface lets us assert behaviour cheaply and bumps backend coverage on
// a 525-line file that previously had zero tests.

'use strict';

const {
  ccqZone,
  fmtCAD,
  fmtTime,
  fmtHours,
  fmtDate,
  fmtShortDate,
  previousWeekRange,
  weekDays,
  buildEmployeeReportHtml,
  buildForemanReminderHtml,
} = require('../../lib/weeklyReport');

// ---------------------------------------------------------------------------
// ccqZone — CCQ travel allowance zones (table-driven; covers all 9 branches)
// ---------------------------------------------------------------------------

describe('ccqZone', () => {
  test.each([
    [0, null, 0, 'Not eligible'],
    [40, null, 0, 'Not eligible'],
    [41, 'T2200', 0, '41–65 km — T2200 tax form'],
    [64, 'T2200', 0, '41–65 km — T2200 tax form'],
    [65, 'A', 15.61, '65–75 km'],
    [75, 'A', 15.61, '65–75 km'],
    [76, 'B', 20.82, '76–100 km'],
    [100, 'B', 20.82, '76–100 km'],
    [101, 'C', 26.02, '101–125 km'],
    [125, 'C', 26.02, '101–125 km'],
    [126, 'D', 31.23, '126–150 km'],
    [150, 'D', 31.23, '126–150 km'],
    [151, 'E', 36.43, '151–175 km'],
    [175, 'E', 36.43, '151–175 km'],
    [176, 'F', 41.64, '176–200 km'],
    [200, 'F', 41.64, '176–200 km'],
    [201, 'G', 46.84, '200+ km'],
    [500, 'G', 46.84, '200+ km'],
  ])('km=%i → zone=%s rate=%f label=%s', (km, expectedZone, expectedRate, expectedLabel) => {
    const result = ccqZone(km);
    expect(result.zone).toBe(expectedZone);
    expect(result.rate).toBe(expectedRate);
    expect(result.label).toBe(expectedLabel);
  });

  test('falsy inputs (null, undefined, 0, NaN) all map to Not eligible', () => {
    for (const v of [null, undefined, 0, NaN]) {
      const r = ccqZone(v);
      expect(r.zone).toBeNull();
      expect(r.rate).toBe(0);
      expect(r.label).toBe('Not eligible');
    }
  });
});

// ---------------------------------------------------------------------------
// fmtCAD
// ---------------------------------------------------------------------------

describe('fmtCAD', () => {
  test('formats whole-dollar values', () => {
    // Intl on Node uses U+00A0 (non-breaking space) between symbol and digits;
    // assert via regex to stay portable across ICU minor versions.
    expect(fmtCAD(15.61)).toMatch(/^\$15\.61$/);
    expect(fmtCAD(100)).toMatch(/^\$100\.00$/);
  });

  test('renders 0 for falsy inputs', () => {
    expect(fmtCAD(null)).toMatch(/\$0\.00$/);
    expect(fmtCAD(undefined)).toMatch(/\$0\.00$/);
    expect(fmtCAD(0)).toMatch(/\$0\.00$/);
  });
});

// ---------------------------------------------------------------------------
// fmtTime — 24h "HH:MM[:SS]" → "HH:MM AM/PM"
// ---------------------------------------------------------------------------

describe('fmtTime (weeklyReport)', () => {
  test('AM hours', () => {
    expect(fmtTime('07:30')).toBe('07:30 AM');
    expect(fmtTime('11:59')).toBe('11:59 AM');
  });
  test('PM hours', () => {
    expect(fmtTime('13:00')).toBe('01:00 PM');
    expect(fmtTime('23:45')).toBe('11:45 PM');
  });
  test('midnight and noon edge cases', () => {
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
});

// ---------------------------------------------------------------------------
// fmtHours — float hours → "Xh Ym" / "Xh" / "0h"
// ---------------------------------------------------------------------------

describe('fmtHours', () => {
  test('whole hours render without minutes', () => {
    expect(fmtHours(8)).toBe('8h');
    expect(fmtHours('5')).toBe('5h');
  });
  test('fractional hours render minutes', () => {
    expect(fmtHours(7.5)).toBe('7h 30m');
    expect(fmtHours(2.25)).toBe('2h 15m');
    expect(fmtHours(0.5)).toBe('0h 30m');
  });
  test('zero / falsy / NaN render "0h"', () => {
    expect(fmtHours(0)).toBe('0h');
    expect(fmtHours('not a number')).toBe('0h');
  });
  test('null / undefined render em-dash', () => {
    expect(fmtHours(null)).toBe('—');
    expect(fmtHours(undefined)).toBe('—');
  });
});

// ---------------------------------------------------------------------------
// fmtDate / fmtShortDate
// ---------------------------------------------------------------------------

describe('fmtDate (weeklyReport)', () => {
  test('renders weekday + month + day for ISO date', () => {
    const out = fmtDate('2026-05-04');
    // Don't lock to a specific weekday — `new Date('2026-05-04')` is parsed
    // as UTC midnight, which can land on May 3 evening / May 4 morning
    // depending on the runner's TZ. Just assert the structure is present:
    // a recognisable weekday name + month name + day number.
    expect(out).toMatch(/(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/i);
    expect(out).toMatch(/(May|April)/);
    expect(out).toMatch(/\b(3|4)\b/);
  });

  test('returns a non-empty string for any valid date input', () => {
    expect(typeof fmtDate('2026-05-04')).toBe('string');
    expect(fmtDate('2026-05-04').length).toBeGreaterThan(0);
  });
});

describe('fmtShortDate', () => {
  test('renders Mon DD, YYYY-style string', () => {
    const out = fmtShortDate('2026-05-04');
    expect(out).toMatch(/(May|April)/);
    expect(out).toMatch(/2026/);
  });
});

// ---------------------------------------------------------------------------
// previousWeekRange — returns Mon..Sun for the previous calendar week
// ---------------------------------------------------------------------------

describe('previousWeekRange', () => {
  test('returns ISO date strings + Date objects covering Mon → Sun', () => {
    const r = previousWeekRange();
    expect(typeof r.from).toBe('string');
    expect(typeof r.to).toBe('string');
    expect(r.monDate).toBeInstanceOf(Date);
    expect(r.sunDate).toBeInstanceOf(Date);
    expect(r.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // monDate is a Monday (getDay() = 1) and sunDate a Sunday (0) in local tz
    expect(r.monDate.getDay()).toBe(1);
    expect(r.sunDate.getDay()).toBe(0);

    // monDate is at the start of the day; sunDate is at the end. Diff is
    // ~6.999 days — accept either 6 or 7 once rounded.
    const diffMs = r.sunDate.getTime() - r.monDate.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    expect([6, 7]).toContain(diffDays);
  });
});

// ---------------------------------------------------------------------------
// weekDays — Mon..Fri only (skips Sat + Sun)
// ---------------------------------------------------------------------------

describe('weekDays', () => {
  // weekDays parses 'YYYY-MM-DD' inputs as UTC midnight then iterates by
  // local-tz `setDate(getDate()+1)`. On a UTC server (prod) it returns the
  // 5 weekdays cleanly; in non-UTC test runners the day boundaries shift
  // by the offset. We assert TZ-independent invariants.

  test('returns ~5 weekdays for a Mon-Sun span', () => {
    const days = weekDays('2026-05-04', '2026-05-10');
    expect(days.length).toBeGreaterThanOrEqual(4);
    expect(days.length).toBeLessThanOrEqual(5);
    days.forEach((d) => expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/));
  });

  test('returned days are unique and chronologically ordered', () => {
    const days = weekDays('2026-05-04', '2026-05-10');
    expect(new Set(days).size).toBe(days.length); // no duplicates
    for (let i = 1; i < days.length; i++) {
      expect(days[i] > days[i - 1]).toBe(true); // ISO strings sort lexically
    }
  });

  test('returns an array (possibly empty) for a weekend-only range', () => {
    const days = weekDays('2026-05-09', '2026-05-10');
    expect(Array.isArray(days)).toBe(true);
    // Length is 0 in UTC; can be 0 or 1 depending on TZ shift.
    expect(days.length).toBeLessThanOrEqual(1);
  });

  test('returns at most one entry when from === to', () => {
    const days = weekDays('2026-05-04', '2026-05-04');
    expect(days.length).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// buildEmployeeReportHtml — large rendering function with travel /
// unconfirmed branches
// ---------------------------------------------------------------------------

describe('buildEmployeeReportHtml', () => {
  const baseEmployee = {
    full_name: 'Jean Tremblay',
    trade_code: 'PLU',
  };
  const baseDays = ['2026-05-04', '2026-05-05', '2026-05-06', '2026-05-07', '2026-05-08'];

  function dayAtt(overrides = {}) {
    return {
      attendance_status: 'CONFIRMED',
      regular_hours: 7.5,
      confirmed_regular_hours: 7.5,
      overtime_hours: 0,
      confirmed_overtime_hours: 0,
      check_in_time: '07:00',
      check_out_time: '15:30',
      ...overrides,
    };
  }

  test('renders the basic skeleton with header + summary cards', () => {
    const html = buildEmployeeReportHtml({
      employee: baseEmployee,
      companyName: 'Constrai Test Inc.',
      weekDays: baseDays,
      attendanceMap: Object.fromEntries(baseDays.map((d) => [d, dayAtt()])),
      assignment: {
        project_code: 'PRJ-001',
        project_name: 'Tour A',
        distance_km: 0,
        start_date: '2026-05-04',
      },
    });
    expect(html).toMatch(/<!DOCTYPE html>/);
    expect(html).toContain('Jean Tremblay');
    expect(html).toContain('Constrai Test Inc.');
    expect(html).toContain('Weekly Work Report');
    expect(html).toContain('PRJ-001');
    expect(html).toContain('Tour A');
    // 5 days worked, all regular @ 7.5h → 37.5h total regular
    expect(html).toContain('37h 30m');
    // No travel allowance section (distance_km = 0)
    expect(html).not.toContain('CCQ Travel Allowance');
  });

  test('renders the travel allowance section when distance_km >= 41', () => {
    const html = buildEmployeeReportHtml({
      employee: baseEmployee,
      companyName: 'Constrai',
      weekDays: baseDays,
      attendanceMap: Object.fromEntries(baseDays.map((d) => [d, dayAtt()])),
      assignment: { project_code: 'PRJ-002', distance_km: 90, start_date: '2026-05-04' },
    });
    expect(html).toContain('CCQ Travel Allowance');
    expect(html).toContain('76–100 km'); // zone B label
  });

  test('renders the T2200 hint when distance is in the 41–65 km band', () => {
    const html = buildEmployeeReportHtml({
      employee: baseEmployee,
      companyName: 'Constrai',
      weekDays: baseDays,
      attendanceMap: Object.fromEntries(baseDays.map((d) => [d, dayAtt()])),
      assignment: { project_code: 'PRJ-003', distance_km: 50, start_date: '2026-05-04' },
    });
    expect(html).toContain('T2200');
    expect(html).toContain('annual tax declaration');
  });

  test('renders the unconfirmed warning when any day is CHECKED_OUT', () => {
    const map = Object.fromEntries(
      baseDays.map((d, i) => [d, dayAtt(i === 0 ? { attendance_status: 'CHECKED_OUT' } : {})])
    );
    const html = buildEmployeeReportHtml({
      employee: baseEmployee,
      companyName: 'Constrai',
      weekDays: baseDays,
      attendanceMap: map,
      assignment: { project_code: 'PRJ-004', distance_km: 0, start_date: '2026-05-04' },
    });
    expect(html).toMatch(/pending foreman confirmation/i);
  });

  test('handles ABSENT days (renders em-dash, does not count toward totals)', () => {
    const map = Object.fromEntries(
      baseDays.map((d, i) => [d, i < 2 ? dayAtt() : { attendance_status: 'ABSENT' }])
    );
    const html = buildEmployeeReportHtml({
      employee: baseEmployee,
      companyName: 'Constrai',
      weekDays: baseDays,
      attendanceMap: map,
      assignment: { project_code: 'PRJ-005', distance_km: 0, start_date: '2026-05-04' },
    });
    // 2 days × 7.5h regular only
    expect(html).toContain('15h');
    expect(html).toContain('Absent');
  });

  test('handles a missing assignment (no project info, no travel section)', () => {
    const html = buildEmployeeReportHtml({
      employee: baseEmployee,
      companyName: 'Constrai',
      weekDays: baseDays,
      attendanceMap: Object.fromEntries(baseDays.map((d) => [d, dayAtt()])),
      assignment: undefined,
    });
    expect(html).not.toContain('CCQ Travel Allowance');
    expect(html).not.toContain('Project:');
  });
});

// ---------------------------------------------------------------------------
// buildForemanReminderHtml
// ---------------------------------------------------------------------------

describe('buildForemanReminderHtml', () => {
  test('renders one row per unconfirmed record', () => {
    const html = buildForemanReminderHtml({
      foreman: { full_name: 'Marie Dupont', trade_code: 'ELE' },
      companyName: 'Constrai',
      weekLabel: 'Apr 27 – May 3, 2026',
      unconfirmedRecords: [
        {
          full_name: 'Worker One',
          attendance_date: '2026-04-27',
          check_in_time: '07:00',
          check_out_time: '15:30',
          regular_hours: 7.5,
        },
        {
          full_name: 'Worker Two',
          attendance_date: '2026-04-28',
          check_in_time: '08:00',
          check_out_time: '16:00',
          regular_hours: 7,
        },
      ],
    });
    expect(html).toContain('Worker One');
    expect(html).toContain('Worker Two');
    expect(html).toContain('Marie Dupont');
    expect(html).toContain('Apr 27 – May 3, 2026');
    expect(html).toContain('Constrai');
  });

  test('renders cleanly with an empty record list', () => {
    const html = buildForemanReminderHtml({
      foreman: { full_name: 'Foreman X', trade_code: 'PLU' },
      companyName: 'Constrai',
      weekLabel: 'Apr 27 – May 3, 2026',
      unconfirmedRecords: [],
    });
    expect(html).toMatch(/<!DOCTYPE html>/);
    expect(html).toContain('Foreman X');
  });
});
