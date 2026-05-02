// src/test/setup.js — Phase 68 (May 2026, Section 22 hardening).
//
// Loaded by Vitest before any test module (configured via `setupFiles`
// in vite.config.js). Extends Vitest's `expect` with the matchers from
// @testing-library/jest-dom (toBeInTheDocument, toHaveTextContent,
// toBeVisible, etc.) so component tests read like React Testing Library
// elsewhere.
//
// If a test ever needs the DOM cleaned up between cases, RTL's render()
// already calls cleanup() automatically when @testing-library/react is
// imported in a Vitest globals environment. No manual afterEach needed.

import '@testing-library/jest-dom/vitest';
