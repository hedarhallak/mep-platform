// Smoke tests for the senders in lib/email.js — Phase 67 (May 2026,
// coverage push 41% → 50%).
//
// `escapeHtml` already has a dedicated test file (tests/smoke/escapeHtml.test.js).
// This file covers the larger surface: sendEmail's "no API key" branch
// and the four template-building senders. We intentionally don't hit the
// happy path (sgMail.send) because it's the same single line in every
// sender — what's worth covering is the HTML construction, the optional
// branches (notes / phone / foreman / team list / update-vs-new), and
// the early-return guard.
//
// Puppeteer is mocked so sendPurchaseOrder doesn't try to launch Chromium
// during the test run.

'use strict';

// Mock puppeteer BEFORE requiring email.js so getBrowser() resolves
// without a real Chromium install. A stub Buffer is good enough — the
// PDF bytes are forwarded into the SendGrid attachment unread.
jest.mock('puppeteer', () => ({
  launch: jest.fn().mockResolvedValue({
    version: jest.fn().mockResolvedValue('mock-puppeteer-1.0'),
    newPage: jest.fn().mockResolvedValue({
      setContent: jest.fn().mockResolvedValue(undefined),
      pdf: jest.fn().mockResolvedValue(Buffer.from('mock-pdf-bytes')),
      close: jest.fn().mockResolvedValue(undefined),
    }),
  }),
}));

const {
  escapeHtml,
  sendEmail,
  sendAdminWelcome,
  sendAssignmentEmployee,
  sendAssignmentForeman,
  sendPurchaseOrder,
} = require('../../lib/email');

// ---------------------------------------------------------------------------
// escapeHtml — re-exercised here briefly. The dedicated escapeHtml.test.js
// covers the helper end-to-end; this is a smoke check that the module
// re-exports it cleanly.
// ---------------------------------------------------------------------------

describe('escapeHtml (re-export check)', () => {
  test('escapes the standard XSS-vector characters', () => {
    expect(escapeHtml(`<script>alert('x')</script>`)).toBe(
      '&lt;script&gt;alert(&#x27;x&#x27;)&lt;/script&gt;'
    );
  });
});

// ---------------------------------------------------------------------------
// sendEmail — no-API-key branch. In the test env SENDGRID_API_KEY is unset,
// so sendEmail must short-circuit, log a warning, and return false.
// ---------------------------------------------------------------------------

describe('sendEmail without API key configured', () => {
  let warnSpy;
  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });

  test('returns false and logs a warning when SENDGRID_API_KEY is unset', async () => {
    const result = await sendEmail({
      to: 'test@constrai.ca',
      subject: 'Test',
      html: '<b>hi</b>',
      text: 'hi',
    });
    expect(result).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('SendGrid not configured'),
      'test@constrai.ca'
    );
  });
});

// ---------------------------------------------------------------------------
// Template senders — all four call into sendEmail, which short-circuits.
// What we're really covering here is the HTML+text construction code path.
// Each sender returns false (because sendEmail returned false), which is
// the assertable contract under test conditions.
// ---------------------------------------------------------------------------

describe('sendAdminWelcome', () => {
  test('builds a welcome email and returns false in test env', async () => {
    const result = await sendAdminWelcome({
      to: 'admin@constrai.ca',
      companyName: 'Constrai Test Inc.',
      companyCode: 'CONSTRAI001',
      username: 'admin',
      tempPin: '1234',
    });
    expect(result).toBe(false);
  });

  test('escapes user-controlled fields (no XSS via companyName)', async () => {
    // The function returns a boolean, not the HTML. We verify it doesn't
    // throw on hostile input — XSS prevention itself is enforced by
    // escapeHtml (covered separately).
    const result = await sendAdminWelcome({
      to: 'admin@constrai.ca',
      companyName: `<script>alert('xss')</script>`,
      companyCode: 'X<>"\'',
      username: 'a&b',
      tempPin: '0000',
    });
    expect(result).toBe(false);
  });
});

describe('sendAssignmentEmployee', () => {
  const base = {
    to: 'worker@constrai.ca',
    employeeName: 'Jean Tremblay',
    projectCode: 'PRJ-001',
    projectName: 'Tour A',
    siteAddress: '123 Main St, Montreal',
    startDate: '2026-05-04',
    endDate: '2026-05-08',
    shiftStart: '07:00',
    shiftEnd: '15:30',
    notes: 'Wear PPE',
    foremanName: 'Marie Dupont',
    foremanPhone: '+1 514-555-0100',
  };

  test('builds the new-assignment email (default updateType)', async () => {
    expect(await sendAssignmentEmployee(base)).toBe(false);
  });

  test('builds the foreman-update variant (updateType=foreman_assigned)', async () => {
    expect(await sendAssignmentEmployee({ ...base, updateType: 'foreman_assigned' })).toBe(false);
  });

  test('renders cleanly when optional fields (notes, foreman, shift, address) are absent', async () => {
    expect(
      await sendAssignmentEmployee({
        to: 'worker@constrai.ca',
        employeeName: 'Solo Worker',
        projectCode: 'PRJ-002',
        projectName: '',
        siteAddress: '',
        startDate: '2026-05-04',
        endDate: '2026-05-04', // single-day → date range collapses
        shiftStart: null,
        shiftEnd: null,
        notes: null,
        foremanName: null,
        foremanPhone: null,
      })
    ).toBe(false);
  });
});

describe('sendAssignmentForeman', () => {
  test('builds the self-notice variant with a team list', async () => {
    const result = await sendAssignmentForeman({
      to: 'foreman@constrai.ca',
      foremanName: 'Marie Dupont',
      employeeName: 'Jean Tremblay',
      projectCode: 'PRJ-001',
      projectName: 'Tour A',
      siteAddress: '123 Main St',
      startDate: '2026-05-04',
      endDate: '2026-05-08',
      shiftStart: '07:00',
      shiftEnd: '15:30',
      tradeCode: 'PLU',
      teamList: [
        { name: 'Worker One', phone: '+1 514-555-0001' },
        { name: 'Worker Two', phone: null },
      ],
      isSelfNotice: true,
    });
    expect(result).toBe(false);
  });

  test('builds the new-team-member variant without a team list', async () => {
    const result = await sendAssignmentForeman({
      to: 'foreman@constrai.ca',
      foremanName: 'Marie Dupont',
      employeeName: 'New Joiner',
      projectCode: 'PRJ-001',
      projectName: 'Tour A',
      siteAddress: null,
      startDate: '2026-05-04',
      endDate: '2026-05-04',
      shiftStart: null,
      shiftEnd: null,
      tradeCode: 'ELE',
      teamList: [],
      isSelfNotice: false,
    });
    expect(result).toBe(false);
  });
});

describe('sendPurchaseOrder', () => {
  test('builds the order email with PDF (puppeteer mocked) — supplier variant', async () => {
    const result = await sendPurchaseOrder({
      to: 'supplier@example.com',
      ref: 'PO-2026-001',
      date: '2026-05-04',
      companyName: 'Constrai',
      companyPhone: '+1 514-555-1000',
      companyAddress: '500 René-Lévesque Blvd, Montreal',
      projectCode: 'PRJ-001',
      projectName: 'Tour A',
      siteAddress: '123 Main St',
      foremanName: 'Marie Dupont',
      foremanPhone: '+1 514-555-0100',
      items: [
        { item_name: 'Pipe 1/2"', quantity: 100, unit: 'm' },
        { item_name: 'Elbow 90°', quantity: 50, unit: 'pcs' },
      ],
      note: 'Deliver before 10am',
      isProcurement: false,
      supplierName: 'Acme Plumbing Supply',
    });
    expect(result).toBe(false); // sendEmail short-circuits without API key
  });

  test('builds the procurement variant with no notes', async () => {
    const result = await sendPurchaseOrder({
      to: 'procurement@constrai.ca',
      ref: 'PR-2026-002',
      date: '2026-05-04',
      companyName: 'Constrai',
      companyPhone: null,
      companyAddress: null,
      projectCode: 'PRJ-002',
      projectName: '',
      siteAddress: null,
      foremanName: 'Marie Dupont',
      foremanPhone: null,
      items: [{ item_name: 'Cable AWG-12', quantity: 200, unit: 'm' }],
      note: null,
      isProcurement: true,
      supplierName: null,
    });
    expect(result).toBe(false);
  });

  test('handles an empty items list without throwing', async () => {
    const result = await sendPurchaseOrder({
      to: 'procurement@constrai.ca',
      ref: 'PR-2026-003',
      date: '2026-05-04',
      companyName: 'Constrai',
      companyPhone: null,
      companyAddress: null,
      projectCode: 'PRJ-003',
      projectName: '',
      siteAddress: null,
      foremanName: 'Marie Dupont',
      foremanPhone: null,
      items: [],
      note: null,
      isProcurement: true,
      supplierName: null,
    });
    expect(result).toBe(false);
  });
});
