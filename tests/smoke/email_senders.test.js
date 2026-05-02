// tests/smoke/email_senders.test.js — Phase 73d (May 2026, Section 22
// hardening, final push 50% → 65%).
//
// `email_helpers.test.js` (Phase 67) covered all four senders via the
// no-API-key short-circuit branch — that exercised the HTML/text
// construction but skipped the actual sgMail.send call.
//
// This file fills in the remaining branches:
//   1. sendEmail with API key set → sgMail.send is called with the right
//      payload, returns true on resolve, false on reject.
//   2. sendPurchaseOrder happy path with PDF attached.
//   3. getBrowser() — first launch, cached reuse, cache invalidation when
//      `browser.version()` throws.
//
// The module-level `const API_KEY = process.env.SENDGRID_API_KEY` is
// captured at import time, so we use `jest.resetModules()` + a load()
// helper to re-require with the configured env in place per test.

'use strict';

// Track call history across re-requires of @sendgrid/mail.
const mockSgSendImpl = jest.fn();
const mockSgSetApiKey = jest.fn();
jest.mock('@sendgrid/mail', () => ({
  setApiKey: (...a) => mockSgSetApiKey(...a),
  send: (...a) => mockSgSendImpl(...a),
}));

// Mutable puppeteer mock for getBrowser tests.
let mockVersionImpl = jest.fn().mockResolvedValue('mock-1.0');
const mockNewPage = jest.fn().mockResolvedValue({
  setContent: jest.fn().mockResolvedValue(undefined),
  pdf: jest.fn().mockResolvedValue(Buffer.from('pdf-bytes')),
  close: jest.fn().mockResolvedValue(undefined),
});
const mockLaunch = jest.fn(() =>
  Promise.resolve({
    version: (...a) => mockVersionImpl(...a),
    newPage: (...a) => mockNewPage(...a),
  })
);
jest.mock('puppeteer', () => ({
  launch: (...a) => mockLaunch(...a),
}));

const ORIGINAL_ENV = { ...process.env };

function loadEmail({ apiKey = 'SG.fake', from = 'noreply@x.com' } = {}) {
  jest.resetModules();
  if (apiKey === null) delete process.env.SENDGRID_API_KEY;
  else process.env.SENDGRID_API_KEY = apiKey;
  if (from === null) delete process.env.SENDGRID_FROM_EMAIL;
  else process.env.SENDGRID_FROM_EMAIL = from;

  // Re-mock factories survive resetModules.
  jest.doMock('@sendgrid/mail', () => ({
    setApiKey: (...a) => mockSgSetApiKey(...a),
    send: (...a) => mockSgSendImpl(...a),
  }));
  jest.doMock('puppeteer', () => ({
    launch: (...a) => mockLaunch(...a),
  }));

  return require('../../lib/email');
}

beforeEach(() => {
  mockSgSendImpl.mockReset();
  mockSgSetApiKey.mockReset();
  mockLaunch.mockClear();
  mockNewPage.mockClear();
  mockVersionImpl = jest.fn().mockResolvedValue('mock-1.0');
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('lib/email — sendEmail (with API key)', () => {
  test('calls sgMail.send with the right payload and returns true on success', async () => {
    mockSgSendImpl.mockResolvedValueOnce([{ statusCode: 202 }]);
    const { sendEmail } = loadEmail();

    const ok = await sendEmail({
      to: 'a@x.com',
      subject: 'Hi',
      html: '<b>Hi</b>',
      text: 'Hi',
    });

    expect(ok).toBe(true);
    expect(mockSgSendImpl).toHaveBeenCalledTimes(1);
    expect(mockSgSendImpl.mock.calls[0][0]).toEqual({
      to: 'a@x.com',
      from: 'noreply@x.com',
      subject: 'Hi',
      html: '<b>Hi</b>',
      text: 'Hi',
    });
    // setApiKey ran exactly once at module load
    expect(mockSgSetApiKey).toHaveBeenCalledWith('SG.fake');
  });

  test('returns false and logs error when sgMail.send rejects', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockSgSendImpl.mockRejectedValueOnce(new Error('SendGrid 429'));
    const { sendEmail } = loadEmail();

    const ok = await sendEmail({ to: 'a@x.com', subject: 'X', html: '', text: '' });

    expect(ok).toBe(false);
    expect(errSpy).toHaveBeenCalledWith('[email] SendGrid error:', 'SendGrid 429');

    errSpy.mockRestore();
  });

  test('logs response body when SendGrid attaches one to the error', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const e = new Error('rejected');
    e.response = { body: { errors: [{ message: 'bad email' }] } };
    mockSgSendImpl.mockRejectedValueOnce(e);
    const { sendEmail } = loadEmail();

    await sendEmail({ to: 'a@x.com', subject: 'X', html: '', text: '' });

    expect(errSpy).toHaveBeenCalledWith('[email] SendGrid error:', e.response.body);
    errSpy.mockRestore();
  });

  test('returns false (not throws) when FROM email is unset even with API key set', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { sendEmail } = loadEmail({ apiKey: 'SG.fake', from: null });

    const ok = await sendEmail({ to: 'a@x.com', subject: 'X', html: '', text: '' });

    expect(ok).toBe(false);
    expect(mockSgSendImpl).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('SendGrid not configured'),
      'a@x.com'
    );
    warnSpy.mockRestore();
  });
});

describe('lib/email — sendAdminWelcome (happy path)', () => {
  test('sends with the configured FROM and a non-empty html+text payload', async () => {
    mockSgSendImpl.mockResolvedValueOnce([{ statusCode: 202 }]);
    const { sendAdminWelcome } = loadEmail();

    const ok = await sendAdminWelcome({
      to: 'admin@x.com',
      companyName: 'ACME Inc',
      companyCode: 'ACME001',
      username: 'admin',
      tempPin: '1234',
    });

    expect(ok).toBe(true);
    const payload = mockSgSendImpl.mock.calls[0][0];
    expect(payload.to).toBe('admin@x.com');
    expect(payload.from).toBe('noreply@x.com');
    expect(payload.subject).toMatch(/Welcome/);
    expect(payload.html).toContain('ACME Inc');
    expect(payload.html).toContain('1234');
    expect(payload.text).toContain('Temp PIN: 1234');
  });
});

describe('lib/email — sendAssignmentEmployee + sendAssignmentForeman happy paths', () => {
  test('sendAssignmentEmployee sends with project code in subject', async () => {
    mockSgSendImpl.mockResolvedValueOnce([{ statusCode: 202 }]);
    const { sendAssignmentEmployee } = loadEmail();

    const ok = await sendAssignmentEmployee({
      to: 'w@x.com',
      employeeName: 'Jean',
      projectCode: 'PRJ-7',
      projectName: 'Tour A',
      siteAddress: '123 Main',
      startDate: '2026-05-04',
      endDate: '2026-05-08',
      shiftStart: '07:00',
      shiftEnd: '15:30',
      notes: null,
      foremanName: null,
      foremanPhone: null,
    });

    expect(ok).toBe(true);
    const payload = mockSgSendImpl.mock.calls[0][0];
    expect(payload.subject).toMatch(/PRJ-7/);
    expect(payload.subject).toMatch(/Assignment Notification/);
  });

  test('sendAssignmentEmployee subject changes when updateType=foreman_assigned', async () => {
    mockSgSendImpl.mockResolvedValueOnce([{ statusCode: 202 }]);
    const { sendAssignmentEmployee } = loadEmail();

    await sendAssignmentEmployee({
      to: 'w@x.com',
      employeeName: 'Jean',
      projectCode: 'PRJ-7',
      projectName: '',
      siteAddress: '',
      startDate: '2026-05-04',
      endDate: '2026-05-04',
      shiftStart: null,
      shiftEnd: null,
      notes: null,
      foremanName: 'Marie',
      foremanPhone: '+1 514-555-0100',
      updateType: 'foreman_assigned',
    });

    const payload = mockSgSendImpl.mock.calls[0][0];
    expect(payload.subject).toMatch(/Foreman Update/);
    expect(payload.html).toContain('Marie');
    expect(payload.html).toContain('+1 514-555-0100');
  });

  test('sendAssignmentForeman self-notice variant includes team list rows', async () => {
    mockSgSendImpl.mockResolvedValueOnce([{ statusCode: 202 }]);
    const { sendAssignmentForeman } = loadEmail();

    await sendAssignmentForeman({
      to: 'foreman@x.com',
      foremanName: 'Marie',
      employeeName: 'Jean',
      projectCode: 'PRJ-1',
      projectName: '',
      siteAddress: null,
      startDate: '2026-05-04',
      endDate: '2026-05-04',
      shiftStart: null,
      shiftEnd: null,
      tradeCode: 'PLU',
      teamList: [
        { name: 'Worker One', phone: '+1 514-555-0001' },
        { name: 'Worker Two', phone: null },
      ],
      isSelfNotice: true,
    });

    const payload = mockSgSendImpl.mock.calls[0][0];
    expect(payload.subject).toMatch(/assigned as Foreman/);
    expect(payload.html).toContain('Worker One');
    expect(payload.html).toContain('Worker Two');
    expect(payload.text).toContain('Worker One');
  });

  test('sendAssignmentForeman new-member variant subject + body', async () => {
    mockSgSendImpl.mockResolvedValueOnce([{ statusCode: 202 }]);
    const { sendAssignmentForeman } = loadEmail();

    await sendAssignmentForeman({
      to: 'foreman@x.com',
      foremanName: 'Marie',
      employeeName: 'New Joiner',
      projectCode: 'PRJ-1',
      projectName: 'Tour B',
      siteAddress: '500 St-Catherine',
      startDate: '2026-05-04',
      endDate: '2026-05-04',
      shiftStart: '07:00',
      shiftEnd: '15:30',
      tradeCode: 'ELE',
      teamList: [],
      isSelfNotice: false,
    });

    const payload = mockSgSendImpl.mock.calls[0][0];
    expect(payload.subject).toMatch(/New Team Member/);
    expect(payload.html).toContain('New Joiner');
    expect(payload.html).toContain('ELE');
  });
});

describe('lib/email — sendPurchaseOrder (happy path with PDF)', () => {
  test('attaches the PDF and sends to the supplier', async () => {
    mockSgSendImpl.mockResolvedValueOnce([{ statusCode: 202 }]);
    const { sendPurchaseOrder } = loadEmail();

    const ok = await sendPurchaseOrder({
      to: 'supplier@x.com',
      ref: 'PO-001',
      date: '2026-05-04',
      companyName: 'Constrai',
      companyPhone: '+1 514-555-1000',
      companyAddress: '500 René-Lévesque',
      projectCode: 'PRJ-1',
      projectName: 'Tour A',
      siteAddress: '123 Main',
      foremanName: 'Marie',
      foremanPhone: '+1 514-555-0100',
      items: [
        { item_name: 'Pipe 1/2"', quantity: 100, unit: 'm' },
        { item_name: 'Elbow 90°', quantity: 50, unit: 'pcs' },
      ],
      note: 'Deliver before 10am',
      isProcurement: false,
      supplierName: 'Acme Supply',
    });

    expect(ok).toBe(true);
    const payload = mockSgSendImpl.mock.calls[0][0];
    expect(payload.subject).toMatch(/Material Order/);
    expect(payload.subject).toMatch(/PO-001/);
    expect(payload.attachments).toBeDefined();
    expect(payload.attachments).toHaveLength(1);
    expect(payload.attachments[0].filename).toBe('PO-001.pdf');
    expect(payload.attachments[0].type).toBe('application/pdf');
    expect(typeof payload.attachments[0].content).toBe('string'); // base64
  });

  test('procurement variant uses different subject', async () => {
    mockSgSendImpl.mockResolvedValueOnce([{ statusCode: 202 }]);
    const { sendPurchaseOrder } = loadEmail();

    await sendPurchaseOrder({
      to: 'procurement@x.com',
      ref: 'PR-002',
      date: '2026-05-04',
      companyName: 'Constrai',
      companyPhone: null,
      companyAddress: null,
      projectCode: 'PRJ-2',
      projectName: '',
      siteAddress: null,
      foremanName: 'Marie',
      foremanPhone: null,
      items: [{ item_name: 'Cable', quantity: 200, unit: 'm' }],
      note: null,
      isProcurement: true,
      supplierName: null,
    });

    const payload = mockSgSendImpl.mock.calls[0][0];
    expect(payload.subject).toMatch(/Purchase Request/);
  });

  test('returns false (not throws) when PDF generation fails — still sends email without attachment', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockSgSendImpl.mockResolvedValueOnce([{ statusCode: 202 }]);

    // Force puppeteer.launch to throw on this test only
    mockLaunch.mockRejectedValueOnce(new Error('chromium missing'));

    const { sendPurchaseOrder } = loadEmail();

    const ok = await sendPurchaseOrder({
      to: 'supplier@x.com',
      ref: 'PO-X',
      date: '2026-05-04',
      companyName: 'C',
      companyPhone: null,
      companyAddress: null,
      projectCode: 'PRJ',
      projectName: '',
      siteAddress: null,
      foremanName: 'M',
      foremanPhone: null,
      items: [{ item_name: 'x', quantity: 1, unit: 'pcs' }],
      note: null,
      isProcurement: true,
      supplierName: null,
    });

    expect(ok).toBe(true);
    const payload = mockSgSendImpl.mock.calls[0][0];
    expect(payload.attachments).toBeUndefined(); // PDF failed, no attachment
    expect(errSpy).toHaveBeenCalledWith('[PO PDF generation error]', 'chromium missing');

    errSpy.mockRestore();
  });

  test('returns false and logs error when sgMail.send rejects on PO email', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockSgSendImpl.mockRejectedValueOnce(new Error('SendGrid down'));

    const { sendPurchaseOrder } = loadEmail();

    const ok = await sendPurchaseOrder({
      to: 'supplier@x.com',
      ref: 'PO-Y',
      date: '2026-05-04',
      companyName: 'C',
      companyPhone: null,
      companyAddress: null,
      projectCode: 'PRJ',
      projectName: '',
      siteAddress: null,
      foremanName: 'M',
      foremanPhone: null,
      items: [],
      note: null,
      isProcurement: false,
      supplierName: 'S',
    });

    expect(ok).toBe(false);
    expect(errSpy).toHaveBeenCalledWith('[email] SendGrid error:', 'SendGrid down');
    errSpy.mockRestore();
  });

  test('returns false when no API key set — does NOT call sgMail.send (PO variant)', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { sendPurchaseOrder } = loadEmail({ apiKey: null });

    const ok = await sendPurchaseOrder({
      to: 'supplier@x.com',
      ref: 'PO-Z',
      date: '2026-05-04',
      companyName: 'C',
      companyPhone: null,
      companyAddress: null,
      projectCode: 'PRJ',
      projectName: '',
      siteAddress: null,
      foremanName: 'M',
      foremanPhone: null,
      items: [],
      note: null,
      isProcurement: false,
      supplierName: 'S',
    });

    expect(ok).toBe(false);
    expect(mockSgSendImpl).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe('lib/email — getBrowser cache behaviour', () => {
  test('reuses the existing browser when version() succeeds', async () => {
    mockSgSendImpl.mockResolvedValue([{ statusCode: 202 }]);
    const { sendPurchaseOrder } = loadEmail();

    const args = {
      to: 'x@x.com',
      ref: 'P-1',
      date: '2026-05-04',
      companyName: 'C',
      companyPhone: null,
      companyAddress: null,
      projectCode: 'PRJ',
      projectName: '',
      siteAddress: null,
      foremanName: 'M',
      foremanPhone: null,
      items: [],
      note: null,
      isProcurement: false,
      supplierName: 'S',
    };

    await sendPurchaseOrder(args);
    await sendPurchaseOrder(args);

    // First call launches; second call should reuse → still 1 launch total.
    expect(mockLaunch).toHaveBeenCalledTimes(1);
  });

  test('relaunches the browser when version() throws (cache invalidation)', async () => {
    mockSgSendImpl.mockResolvedValue([{ statusCode: 202 }]);
    const { sendPurchaseOrder } = loadEmail();

    const args = {
      to: 'x@x.com',
      ref: 'P-1',
      date: '2026-05-04',
      companyName: 'C',
      companyPhone: null,
      companyAddress: null,
      projectCode: 'PRJ',
      projectName: '',
      siteAddress: null,
      foremanName: 'M',
      foremanPhone: null,
      items: [],
      note: null,
      isProcurement: false,
      supplierName: 'S',
    };

    await sendPurchaseOrder(args); // launch #1
    // Make the cached browser appear dead on next call.
    mockVersionImpl.mockRejectedValueOnce(new Error('disconnected'));
    await sendPurchaseOrder(args); // version() throws → relaunch #2

    expect(mockLaunch).toHaveBeenCalledTimes(2);
  });
});
