// playwright.config.js — Phase 69 (May 2026, Section 22 hardening).
//
// E2E config for mep-frontend. The single Phase 69 smoke test renders the
// public Login page (no auth, no backend round-trip) — full app flows that
// hit /api/* are deferred to Phase 69b once we wire up either a test
// backend or page-level network mocks.
//
// `webServer` auto-starts `vite dev` on port 5173 before tests run and
// tears it down after. `reuseExistingServer: !process.env.CI` keeps the
// dev experience fast on the laptop (no kill/restart between runs) but
// forces a fresh server in CI for hermetic results.

import { defineConfig, devices } from '@playwright/test';

const PORT = 5173;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
