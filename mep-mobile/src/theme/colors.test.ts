// Phase 70 (May 2026, Section 22 hardening) — first mep-mobile unit tests.
//
// Smoke-tests the centralized color theme. Pure constants, no React Native
// runtime needed — exercises the jest-expo preset end-to-end and gives us
// a regression net if a future refactor accidentally drops a color key
// that screens depend on.

import Colors, { headerColors } from './colors';

describe('Colors theme', () => {
  test('all primary brand colors are defined as 6-digit hex', () => {
    for (const key of ['primary', 'primaryDark', 'primaryLight', 'primaryBright', 'primaryPale']) {
      const value = Colors[key as keyof typeof Colors];
      expect(typeof value).toBe('string');
      expect(value).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  test('all accent colors are defined as 6-digit hex', () => {
    for (const key of ['accent', 'accentDark', 'accentLight', 'accentPale', 'accentBorder']) {
      const value = Colors[key as keyof typeof Colors];
      expect(value).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  test('status colors (success / danger / warning / info) all exist', () => {
    expect(Colors.success).toMatch(/^#[0-9a-f]{6}$/i);
    expect(Colors.danger).toMatch(/^#[0-9a-f]{6}$/i);
    expect(Colors.warning).toMatch(/^#[0-9a-f]{6}$/i);
    expect(Colors.info).toMatch(/^#[0-9a-f]{6}$/i);
  });

  test('text-tier colors form a defined palette (not undefined)', () => {
    expect(Colors.textPrimary).toBeDefined();
    expect(Colors.textSecondary).toBeDefined();
    expect(Colors.textMuted).toBeDefined();
    expect(Colors.textLight).toBeDefined();
  });

  test('white is exactly white', () => {
    expect(Colors.white).toBe('#ffffff');
  });

  test('primary brand color is the documented navy blue', () => {
    // If this changes, every header / nav bar in the app changes too —
    // worth a deliberate test failure rather than a silent rebrand.
    expect(Colors.primary).toBe('#1e3a5f');
  });
});

describe('headerColors convenience export', () => {
  test('uses the primary brand color for the header background', () => {
    expect(headerColors.headerStyle.backgroundColor).toBe(Colors.primary);
  });

  test('uses white for the tint (icon + text on dark header)', () => {
    expect(headerColors.headerTintColor).toBe(Colors.white);
  });

  test('headerTitleStyle is bold', () => {
    expect(headerColors.headerTitleStyle.fontWeight).toBe('bold');
  });
});
