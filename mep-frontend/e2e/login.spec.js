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
// Note: interaction tests (fill, click) currently flake on React 19 +
// Vite HMR (the dev server's fast refresh races the synthetic events).
// The Phase 69 setup intentionally ships static-render assertions only;
// Phase 69b will switch to a Vite preview build in CI to remove the HMR
// variable.

import { test, expect } from '@playwright/test';

test.describe('Login page — public smoke', () => {
  test('renders the brand, headline, and form fields', async ({ page }) => {
    await page.goto('/login');

    // Brand title — anchor for the page being recognisably "the login page".
    await expect(page.getByRole('heading', { name: /MEP Platform/i })).toBeVisible();

    // Sign-in card header.
    await expect(page.getByRole('heading', { name: /Sign in to your account/i })).toBeVisible();

    // Inputs — match by placeholder rather than label since the labels are
    // visually decorative (not associated via `htmlFor`).
    await expect(page.getByPlaceholder(/Enter username/i)).toBeVisible();
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
    await expect(page.getByText(new RegExp(`MEP Platform © ${year}`))).toBeVisible();
  });
});
