// LoginPage.test.jsx — Phase 6-D-1b (Section 101, May 14, 2026).
//
// Covers the new Pattern B redirect_url branch on the tenant login page.
// Two cases:
//   1. Backend returns redirect_url → window.location.assign(...) fires
//      (cross-origin hop to the tenant subdomain). React Router
//      navigation does NOT fire (we're leaving the SPA).
//   2. Backend returns null redirect_url → React Router navigate('/dashboard')
//      fires (same-origin, stay in the SPA).

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LoginPage from './LoginPage';

// Hoist-safe shared mocks. The login mock is reassigned per test so each
// case can return a different shape.
const mockNavigate = vi.fn();
const mockLogin = vi.fn();
const mockAssign = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ login: mockLogin }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key) => key }),
}));

// Stub out the LanguageSwitcher import — its internals (api calls,
// localStorage) aren't relevant to this test.
vi.mock('@/components/shared/LanguageSwitcher', () => ({
  default: () => null,
}));

let originalLocation;

beforeEach(() => {
  mockNavigate.mockReset();
  mockLogin.mockReset();
  mockAssign.mockReset();
  // jsdom's window.location.assign is non-configurable, so we can't just
  // override window.location.assign in place. Instead, replace the whole
  // window.location object via defineProperty on `window` itself (window
  // IS configurable in jsdom). The replacement is a plain object that
  // exposes a mocked `assign` — that's the only Location method LoginPage
  // touches, so we don't need to recreate the full Location interface.
  originalLocation = window.location;
  Object.defineProperty(window, 'location', {
    writable: true,
    configurable: true,
    value: {
      assign: mockAssign,
      href: 'http://localhost/',
      hostname: 'localhost',
      pathname: '/login',
      search: '',
    },
  });
});

afterEach(() => {
  Object.defineProperty(window, 'location', {
    writable: true,
    configurable: true,
    value: originalLocation,
  });
});

function renderLogin() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>
  );
}

async function submitLogin() {
  // The form uses translated labels (mocked to return the key itself).
  // Inputs are typed by type, not by label; grab by role.
  const emailInput = screen.getByPlaceholderText('login.emailPlaceholder');
  const pinInput = screen.getByPlaceholderText('login.pinPlaceholder');
  fireEvent.change(emailInput, { target: { value: 'jane@example.com' } });
  fireEvent.change(pinInput, { target: { value: '1234' } });
  const submit = screen.getByRole('button', { name: 'login.submit' });
  fireEvent.click(submit);
}

describe('LoginPage — Phase 6-D-1b redirect_url handling', () => {
  test('hops to tenant subdomain via window.location.assign when redirect_url is returned', async () => {
    mockLogin.mockResolvedValue({
      ok: true,
      token: 'fake-jwt',
      refresh_token: 'fake-refresh',
      redirect_url: 'https://acm.constrai.ca/dashboard',
      user: { user_id: '1', role: 'FOREMAN' },
    });

    renderLogin();
    await submitLogin();

    await waitFor(() => {
      expect(mockAssign).toHaveBeenCalledWith('https://acm.constrai.ca/dashboard');
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  test('falls back to React Router navigate("/dashboard") when redirect_url is null', async () => {
    mockLogin.mockResolvedValue({
      ok: true,
      token: 'fake-jwt',
      refresh_token: 'fake-refresh',
      redirect_url: null,
      user: { user_id: '1', role: 'FOREMAN' },
    });

    renderLogin();
    await submitLogin();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
    });
    expect(mockAssign).not.toHaveBeenCalled();
  });

  test('falls back to navigate("/dashboard") when redirect_url is absent (legacy backend shape)', async () => {
    // Older backend versions (or non-tenant hosts) might omit redirect_url
    // entirely rather than returning it as null. The frontend should
    // handle both shapes the same way.
    mockLogin.mockResolvedValue({
      ok: true,
      token: 'fake-jwt',
      refresh_token: 'fake-refresh',
      user: { user_id: '1', role: 'WORKER' },
    });

    renderLogin();
    await submitLogin();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
    });
    expect(mockAssign).not.toHaveBeenCalled();
  });

  test('navigates to /dashboard when the response carries NO body tokens (Phase 6-D-1c cookie shape)', async () => {
    // Phase 6-D-1c (Section 102): web responses no longer echo `token`
    // or `refresh_token` in the body — the HttpOnly cookies set by the
    // backend carry the auth state. The login flow must still complete
    // and route the user into the dashboard.
    mockLogin.mockResolvedValue({
      ok: true,
      // No token / refresh_token fields at all.
      redirect_url: null,
      user: { user_id: '1', role: 'WORKER' },
    });

    renderLogin();
    await submitLogin();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
    });
    expect(mockAssign).not.toHaveBeenCalled();
  });

  test('hops to redirect_url when response carries NO body tokens (cookie shape + Pattern B)', async () => {
    // Cross-subdomain hop must still fire even on the cookie-only shape.
    mockLogin.mockResolvedValue({
      ok: true,
      redirect_url: 'https://acm.constrai.ca/dashboard',
      user: { user_id: '1', role: 'FOREMAN' },
    });

    renderLogin();
    await submitLogin();

    await waitFor(() => {
      expect(mockAssign).toHaveBeenCalledWith('https://acm.constrai.ca/dashboard');
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  test('does not navigate or redirect on login failure', async () => {
    mockLogin.mockRejectedValue(new Error('INVALID_CREDENTIALS'));

    renderLogin();
    await submitLogin();

    // Give the error path time to settle.
    await waitFor(() => {
      // Error message is rendered (the 'login.errors.INVALID_CREDENTIALS' key
      // — react-i18next mock returns the key itself).
      expect(screen.getByText('login.errors.INVALID_CREDENTIALS')).toBeInTheDocument();
    });
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockAssign).not.toHaveBeenCalled();
  });
});
