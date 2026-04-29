// Smoke tests for the escapeHtml helper in lib/email.js.
//
// Pure function — no DB, no network, no fixtures needed. Establishes the
// Jest infrastructure works end-to-end (file discovery, test runner, CI
// step) before we wire up DB-backed tests in Phase 11+.

const { escapeHtml } = require('../../lib/email');

describe('escapeHtml', () => {
  test('returns empty string for null', () => {
    expect(escapeHtml(null)).toBe('');
  });

  test('returns empty string for undefined', () => {
    expect(escapeHtml(undefined)).toBe('');
  });

  test('returns plain text unchanged', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });

  test('escapes ampersand', () => {
    expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
  });

  test('escapes angle brackets', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
  });

  test('escapes double quote', () => {
    expect(escapeHtml('say "hi"')).toBe('say &quot;hi&quot;');
  });

  test('escapes single quote', () => {
    expect(escapeHtml("it's me")).toBe('it&#x27;s me');
  });

  test('escapes a complete XSS payload', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
    );
  });

  test('coerces non-string to string before escaping', () => {
    expect(escapeHtml(42)).toBe('42');
  });

  test('handles strings containing all special chars at once', () => {
    expect(escapeHtml(`& < > " '`)).toBe('&amp; &lt; &gt; &quot; &#x27;');
  });
});
