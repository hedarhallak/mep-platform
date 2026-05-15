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

describe('LoginPage — Phase 6-D-2 tenant logo swap', () => {
  // Phase 6-D-2 (Section 109): the LoginPage reads
  // `window.__BRANDING__.logo_url` (populated by lib/branding.js before
  // React mounts) and renders an <img> instead of the default Building2
  // icon. Fallback to the default on null, missing, or 404 (onError).

  afterEach(() => {
    // Clean __BRANDING__ between tests so state doesn't leak.
    try {
      delete window.__BRANDING__
    } catch {
      window.__BRANDING__ = undefined
    }
  })

  test('renders default Constrai icon when window.__BRANDING__ is null', () => {
    window.__BRANDING__ = null
    renderLogin()
    // Default fallback path: no img with login.logoAlt rendered; instead
    // the Building2 lucide SVG is in the DOM (it has no role but we can
    // assert the negative case via queryBy).
    expect(screen.queryByAltText('login.logoAlt')).not.toBeInTheDocument()
  })

  test('renders default Constrai icon when logo_url is absent from branding', () => {
    window.__BRANDING__ = { brand_color: '#ff0000', company_name: 'ACM' }
    renderLogin()
    expect(screen.queryByAltText('login.logoAlt')).not.toBeInTheDocument()
  })

  test('renders tenant logo <img> when window.__BRANDING__.brand_logo_url is set', () => {
    window.__BRANDING__ = { brand_logo_url: 'https://cdn.example.com/acm/logo.png' }
    renderLogin()
    const img = screen.getByAltText('login.logoAlt')
    expect(img).toBeInTheDocument()
    expect(img.tagName).toBe('IMG')
    expect(img.getAttribute('src')).toBe('https://cdn.example.com/acm/logo.png')
  })

  test('falls back to default icon when tenant logo fires onError', () => {
    window.__BRANDING__ = { brand_logo_url: 'https://cdn.example.com/acm/logo.png' }
    renderLogin()
    const img = screen.getByAltText('login.logoAlt')
    // Simulate a load failure (404, CORS, network).
    fireEvent.error(img)
    expect(screen.queryByAltText('login.logoAlt')).not.toBeInTheDocument()
  })

  test('treats whitespace-only brand_logo_url as absent', () => {
    window.__BRANDING__ = { brand_logo_url: '   ' }
    renderLogin()
    expect(screen.queryByAltText('login.logoAlt')).not.toBeInTheDocument()
  })
})

describe('LoginPage — Phase 6-D-2 remember-me checkbox', () => {
  // Phase 6-D-2 (Section 109): remember-me persists ONLY the email
  // (never the PIN) in localStorage under `mep_remember_email`. On
  // mount, the saved email pre-fills the form and the checkbox is
  // pre-checked. On submit, the toggle is honored regardless of login
  // success / failure.

  beforeEach(() => {
    try {
      localStorage.clear()
    } catch {
      /* ignore */
    }
  })

  afterEach(() => {
    try {
      localStorage.clear()
    } catch {
      /* ignore */
    }
  })

  test('restores remembered email on mount and pre-checks the box', () => {
    localStorage.setItem('mep_remember_email', 'recalled@example.com')
    renderLogin()
    const emailInput = screen.getByPlaceholderText('login.emailPlaceholder')
    expect(emailInput.value).toBe('recalled@example.com')
    const checkbox = screen.getByLabelText('login.rememberMe')
    expect(checkbox.checked).toBe(true)
  })

  test('starts blank when nothing is stored', () => {
    renderLogin()
    const emailInput = screen.getByPlaceholderText('login.emailPlaceholder')
    expect(emailInput.value).toBe('')
    const checkbox = screen.getByLabelText('login.rememberMe')
    expect(checkbox.checked).toBe(false)
  })

  test('saves email to localStorage when checkbox is checked on submit', async () => {
    mockLogin.mockResolvedValue({
      ok: true,
      redirect_url: null,
      user: { user_id: '1', role: 'FOREMAN' },
    })

    renderLogin()
    fireEvent.change(screen.getByPlaceholderText('login.emailPlaceholder'), {
      target: { value: 'jane@example.com' },
    })
    fireEvent.change(screen.getByPlaceholderText('login.pinPlaceholder'), {
      target: { value: '1234' },
    })
    fireEvent.click(screen.getByLabelText('login.rememberMe'))
    fireEvent.click(screen.getByRole('button', { name: 'login.submit' }))

    await waitFor(() => {
      expect(localStorage.getItem('mep_remember_email')).toBe('jane@example.com')
    })
  })

  test('clears stored email when checkbox is left unchecked on submit', async () => {
    localStorage.setItem('mep_remember_email', 'stale@example.com')
    mockLogin.mockResolvedValue({
      ok: true,
      redirect_url: null,
      user: { user_id: '1', role: 'FOREMAN' },
    })

    renderLogin()
    // useEffect restored the saved email + pre-checked the box.
    // Uncheck it deliberately, then change email + submit.
    fireEvent.click(screen.getByLabelText('login.rememberMe'))
    fireEvent.change(screen.getByPlaceholderText('login.emailPlaceholder'), {
      target: { value: 'fresh@example.com' },
    })
    fireEvent.change(screen.getByPlaceholderText('login.pinPlaceholder'), {
      target: { value: '1234' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'login.submit' }))

    await waitFor(() => {
      expect(localStorage.getItem('mep_remember_email')).toBeNull()
    })
  })

  test('PIN is never written to localStorage', async () => {
    mockLogin.mockResolvedValue({
      ok: true,
      redirect_url: null,
      user: { user_id: '1', role: 'FOREMAN' },
    })

    renderLogin()
    fireEvent.click(screen.getByLabelText('login.rememberMe'))
    fireEvent.change(screen.getByPlaceholderText('login.emailPlaceholder'), {
      target: { value: 'jane@example.com' },
    })
    fireEvent.change(screen.getByPlaceholderText('login.pinPlaceholder'), {
      target: { value: 'TOP-SECRET-PIN-1234' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'login.submit' }))

    await waitFor(() => {
      expect(localStorage.getItem('mep_remember_email')).toBe('jane@example.com')
    })
    // Verify the PIN never landed in localStorage under any key.
    const allKeys = Object.keys(localStorage)
    for (const key of allKeys) {
      expect(localStorage.getItem(key)).not.toContain('TOP-SECRET-PIN')
    }
  })
})

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
