// tests/smoke/email_resend_wrapper.test.js
//
// Smoke test for the EMAIL_PROVIDER=resend path introduced in the Resend
// migration (post-90-G). Verifies:
//
//   1. Default (EMAIL_PROVIDER unset / 'sendgrid') → @sendgrid/mail singleton
//      is returned, setApiKey called with SENDGRID_API_KEY.
//   2. EMAIL_PROVIDER=resend + RESEND_API_KEY → a SendGrid-shaped wrapper
//      that translates msg to Resend's API.
//   3. Attachments shape gets translated: SendGrid `type` → Resend
//      `content_type`, `disposition` dropped.
//   4. Wrapper throws when EMAIL_PROVIDER=resend but RESEND_API_KEY unset.
//   5. Wrapper.setApiKey is a no-op (SendGrid API compatibility for
//      routes/user_management.js and routes/attendance.js which call
//      sgMail.setApiKey before each send).
//
// CLAUDE.md Section 4.6 — jest.mock factory variables MUST start with
// `mock` (the parsing hoist rule). Every mock helper var here is named
// accordingly.

'use strict';

// ── Mocks ────────────────────────────────────────────────────────────

const mockResendSend = jest.fn().mockResolvedValue({ data: { id: 'resend-msg-id' } });
const mockResendConstructor = jest.fn().mockImplementation(() => ({
  emails: { send: mockResendSend },
}));

jest.mock('resend', () => ({
  Resend: mockResendConstructor,
}));

const mockSendgridSend = jest.fn().mockResolvedValue([{ statusCode: 202 }, {}]);
const mockSendgridSetApiKey = jest.fn();

jest.mock('@sendgrid/mail', () => ({
  send: mockSendgridSend,
  setApiKey: mockSendgridSetApiKey,
}));

// ── Suite ────────────────────────────────────────────────────────────

describe('lib/email.js — getMailClient() provider factory', () => {
  // Save the env vars we mutate so we can restore them per-test.
  const savedEnv = {};
  const ENV_KEYS = ['EMAIL_PROVIDER', 'SENDGRID_API_KEY', 'RESEND_API_KEY'];

  beforeEach(() => {
    for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
    mockResendSend.mockClear();
    mockResendConstructor.mockClear();
    mockSendgridSend.mockClear();
    mockSendgridSetApiKey.mockClear();
    jest.resetModules();
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
  });

  test('EMAIL_PROVIDER unset → returns @sendgrid/mail singleton + setApiKey called', () => {
    delete process.env.EMAIL_PROVIDER;
    process.env.SENDGRID_API_KEY = 'sg-test-key';
    const { getMailClient } = require('../../lib/email');
    const c = getMailClient();
    expect(c).toHaveProperty('send');
    expect(c).toHaveProperty('setApiKey');
    expect(mockSendgridSetApiKey).toHaveBeenCalledWith('sg-test-key');
    expect(mockResendConstructor).not.toHaveBeenCalled();
  });

  test('EMAIL_PROVIDER=sendgrid (explicit) → returns @sendgrid/mail', () => {
    process.env.EMAIL_PROVIDER = 'sendgrid';
    process.env.SENDGRID_API_KEY = 'sg-test-key';
    const { getMailClient } = require('../../lib/email');
    getMailClient();
    expect(mockSendgridSetApiKey).toHaveBeenCalledWith('sg-test-key');
    expect(mockResendConstructor).not.toHaveBeenCalled();
  });

  test('EMAIL_PROVIDER=resend + RESEND_API_KEY → constructs Resend wrapper with key', () => {
    process.env.EMAIL_PROVIDER = 'resend';
    process.env.RESEND_API_KEY = 're-test-key';
    const { getMailClient } = require('../../lib/email');
    const c = getMailClient();
    expect(c).toHaveProperty('send');
    expect(c).toHaveProperty('setApiKey');
    expect(mockResendConstructor).toHaveBeenCalledWith('re-test-key');
    expect(mockSendgridSetApiKey).not.toHaveBeenCalled();
  });

  test('Resend wrapper translates simple msg (to/from/subject/html/text/replyTo)', async () => {
    process.env.EMAIL_PROVIDER = 'resend';
    process.env.RESEND_API_KEY = 're-test-key';
    const { getMailClient } = require('../../lib/email');
    const c = getMailClient();
    await c.send({
      to: 'foo@example.com',
      from: 'noreply@constrai.ca',
      subject: 'Hi',
      html: '<p>Hello</p>',
      text: 'Hello',
      replyTo: 'support@constrai.ca',
    });
    expect(mockResendSend).toHaveBeenCalledTimes(1);
    expect(mockResendSend).toHaveBeenCalledWith({
      to: 'foo@example.com',
      from: 'noreply@constrai.ca',
      subject: 'Hi',
      html: '<p>Hello</p>',
      text: 'Hello',
      reply_to: 'support@constrai.ca',
    });
    // attachments field omitted when no attachments on input.
    expect(mockResendSend.mock.calls[0][0]).not.toHaveProperty('attachments');
  });

  test('Resend wrapper translates attachments format (type → content_type, disposition dropped)', async () => {
    process.env.EMAIL_PROVIDER = 'resend';
    process.env.RESEND_API_KEY = 're-test-key';
    const { getMailClient } = require('../../lib/email');
    const c = getMailClient();
    await c.send({
      to: 'foo@example.com',
      from: 'noreply@constrai.ca',
      subject: 'PO',
      html: '<p>PO</p>',
      attachments: [
        {
          content: 'YmFzZTY0LWVuY29kZWQtcGRm',
          filename: 'PO-123.pdf',
          type: 'application/pdf',
          disposition: 'attachment',
        },
      ],
    });
    const arg = mockResendSend.mock.calls[0][0];
    expect(arg.attachments).toEqual([
      {
        content: 'YmFzZTY0LWVuY29kZWQtcGRm',
        filename: 'PO-123.pdf',
        content_type: 'application/pdf',
        // disposition intentionally dropped — Resend has no equivalent.
      },
    ]);
  });

  test('Resend wrapper omits content_type when SendGrid msg has no `type` field', async () => {
    process.env.EMAIL_PROVIDER = 'resend';
    process.env.RESEND_API_KEY = 're-test-key';
    const { getMailClient } = require('../../lib/email');
    const c = getMailClient();
    await c.send({
      to: 'a@b.com',
      from: 'c@d.com',
      subject: 's',
      attachments: [{ filename: 'note.txt', content: 'aGVsbG8=' }],
    });
    const arg = mockResendSend.mock.calls[0][0];
    expect(arg.attachments).toEqual([{ filename: 'note.txt', content: 'aGVsbG8=' }]);
    expect(arg.attachments[0]).not.toHaveProperty('content_type');
  });

  test('Resend wrapper throws when RESEND_API_KEY is unset', async () => {
    process.env.EMAIL_PROVIDER = 'resend';
    delete process.env.RESEND_API_KEY;
    const { getMailClient } = require('../../lib/email');
    const c = getMailClient();
    await expect(c.send({ to: 'x', from: 'y', subject: 'z' })).rejects.toThrow(
      /Resend not configured/
    );
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  test('Resend wrapper setApiKey is a no-op (SendGrid API compat)', () => {
    process.env.EMAIL_PROVIDER = 'resend';
    process.env.RESEND_API_KEY = 're-test-key';
    const { getMailClient } = require('../../lib/email');
    const c = getMailClient();
    // routes/attendance.js + routes/user_management.js call
    // sgMail.setApiKey(SENDGRID_API_KEY) before sgMail.send. Under the
    // wrapper this must be a no-op (the Resend instance was already
    // constructed with RESEND_API_KEY at getMailClient time).
    expect(() => c.setApiKey('whatever-key')).not.toThrow();
    expect(mockResendConstructor).toHaveBeenCalledTimes(1);
  });

  test('getMailClient() caches the resolved client within a module instance', () => {
    process.env.EMAIL_PROVIDER = 'resend';
    process.env.RESEND_API_KEY = 're-test-key';
    const { getMailClient } = require('../../lib/email');
    const c1 = getMailClient();
    const c2 = getMailClient();
    expect(c1).toBe(c2);
    // Resend constructor invoked exactly once.
    expect(mockResendConstructor).toHaveBeenCalledTimes(1);
  });

  test('_resetMailClientForTest clears the cache (lets a single test toggle providers)', () => {
    process.env.EMAIL_PROVIDER = 'resend';
    process.env.RESEND_API_KEY = 're-test-key';
    const lib = require('../../lib/email');
    lib.getMailClient();
    expect(mockResendConstructor).toHaveBeenCalledTimes(1);

    process.env.EMAIL_PROVIDER = 'sendgrid';
    process.env.SENDGRID_API_KEY = 'sg-test-key';
    lib._resetMailClientForTest();
    lib.getMailClient();
    expect(mockSendgridSetApiKey).toHaveBeenCalledWith('sg-test-key');
  });

  test('unknown EMAIL_PROVIDER value falls back to sendgrid (backward compat)', () => {
    process.env.EMAIL_PROVIDER = 'mailgun'; // not supported — should not crash
    process.env.SENDGRID_API_KEY = 'sg-test-key';
    const { getMailClient } = require('../../lib/email');
    getMailClient();
    expect(mockSendgridSetApiKey).toHaveBeenCalledWith('sg-test-key');
    expect(mockResendConstructor).not.toHaveBeenCalled();
  });
});
