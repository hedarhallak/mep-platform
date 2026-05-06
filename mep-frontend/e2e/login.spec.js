// Phase 69 E2E smoke — May 2026.
//
// First Playwright test: navigate to the login page and assert the basic
// UI scaffolding renders. No auth, no API round-trip — full app flows
// (login → dashboard → permissioned action) come in Phase 69b once we
// have a backend strategy (test DB seed or page.route mocks).
//
// What this test catches: Vite build broken, login route unreachable,
// header / form scaffolding silently dropped during a refactor. Cheap,
// fast, and a regression net for the most-trafficked URL in the app.
//
// Section 45 update (May 3, 2026): the page is now i18n'd and defaults to
// French. We pin the language to English in localStorage before navigating
// so the tests stay deterministic regardless of the browser locale or
// future default-language changes. The "MEP Platform" brand was renamed
// to "Constrai" as part of the same i18n pass — anchors updated below.
//
// Note: interaction tests (fill, click) currently flake on React 19 +
// Vite HMR (the dev server's fast refresh races the synthetic events).
// The Phase 69 setup intentionally ships static-render assertions only;
// Phase 69b will switch to a Vite preview build in CI to remove the HMR
// variable.

import { test, expect } from '@playwright/test';

// Force English UI for deterministic assertions. Set BEFORE the first
// navigation so i18next-browser-languagedetector picks up the choice on
// init rather than defaulting to French.
test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    try {
      window.localStorage.setItem('constrai_language', 'en');
    } catch (_e) {
      /* localStorage may be unavailable in some contexts; tolerate */
    }
  });
});

test.describe('Login page — public smoke', () => {
  test('renders the brand, headline, and form fields', async ({ page }) => {
    await page.goto('/login');

    // Brand title — "Constrai" replaces the legacy "MEP Platform" copy
    // (Section 45 web i18n pilot, May 2026). Anchored as the marker that
    // we are recognisably on the login page.
    await expect(page.getByRole('heading', { name: /Constrai/i })).toBeVisible();

    // Sign-in card header (English copy because beforeEach pins lang=en).
    await expect(page.getByRole('heading', { name: /Sign in to your account/i })).toBeVisible();

    // Inputs — match by placeholder rather than label since the labels are
    // visually decorative (not associated via `htmlFor`).
    // Section 87 / migration 011: login is now email-based for the Model C
    // single-domain architecture. Placeholder updated from "Enter username".
    await expect(page.getByPlaceholder(/Enter your email/i)).toBeVisible();
    await expect(page.getByPlaceholder(/Enter PIN/i)).toBeVisible();

    // Submit button.
    await expect(page.getByRole('button', { name: /^Sign In$/i })).toBeVisible();
  });

  test('PIN input defaults to type=password (security regression net)', async ({ page }) => {
    await page.goto('/login');
    const pinInput = page.getByPlaceholder(/Enter PIN/i);
    await expect(pinInput).toHaveAttribute('type', 'password');
  });

  test('renders the year in the footer', async ({ page }) => {
    await page.goto('/login');
    const year = new Date().getFullYear().toString();
    await expect(page.getByText(new RegExp(`Constrai © ${year}`))).toBeVisible();
  });
});
