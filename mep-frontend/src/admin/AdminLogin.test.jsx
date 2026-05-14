// src/admin/AdminLogin.test.jsx
//
// Phase 5 / 90-E — RTL coverage for the admin sign-in form.
//
// Strategy: stub global.fetch so we can assert against deterministic
// network responses. Wrap the component in a MemoryRouter so the
// useNavigate() call in the success path is harmless (we don't
// need to assert on it for these tests — just that it doesn't throw).

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import AdminLogin from './AdminLogin.jsx'

// --- Fetch stub -----------------------------------------------------------

let fetchMock
let originalFetch

beforeEach(() => {
  originalFetch = global.fetch
  fetchMock = vi.fn()
  global.fetch = fetchMock
  // Clear localStorage between tests so the "stashes mep_token" assertion
  // doesn't see leftover state from a previous test.
  if (typeof localStorage !== 'undefined') localStorage.clear()
})

afterEach(() => {
  global.fetch = originalFetch
})

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <AdminLogin />
    </MemoryRouter>
  )
}

// --- Tests ----------------------------------------------------------------

describe('AdminLogin — render', () => {
  test('renders email + PIN inputs and a sign-in button', () => {
    renderLogin()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/pin/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  test('the sign-in button is disabled while email or PIN are empty', () => {
    renderLogin()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeDisabled()
  })
})

describe('AdminLogin — submit', () => {
  test('successful login stashes mep_token + mep_refresh_token in localStorage', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        token: 'access-token-abc',
        refresh_token: 'refresh-token-xyz',
        user: { user_id: 1, role: 'SUPER_ADMIN' },
      }),
    })

    const user = userEvent.setup()
    renderLogin()

    await user.type(screen.getByLabelText(/email/i), 'sa@example.com')
    await user.type(screen.getByLabelText(/pin/i), 'sa-pin-1234')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(localStorage.getItem('mep_token')).toBe('access-token-abc')
    })
    expect(localStorage.getItem('mep_refresh_token')).toBe('refresh-token-xyz')

    // The fetch should have hit /api/auth/login with our payload.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [calledUrl, calledInit] = fetchMock.mock.calls[0]
    expect(calledUrl).toBe('/api/auth/login')
    expect(calledInit.method).toBe('POST')
    expect(JSON.parse(calledInit.body)).toEqual({
      email: 'sa@example.com',
      pin: 'sa-pin-1234',
    })
  })

  test('successful login with NO body token (Phase 6-D-1c cookie shape) does not stash localStorage, still renders without error', async () => {
    // Phase 6-D-1c (Section 102): web responses omit `token` /
    // `refresh_token` from the body. AdminLogin should:
    //   - NOT write `undefined` to localStorage
    //   - CLEAR any stale localStorage from a pre-6-D-1c session
    //   - NOT surface an error
    //   - send X-Auth-Channel: cookie + credentials: 'include' on the fetch
    localStorage.setItem('mep_token', 'stale-token-from-old-session')
    localStorage.setItem('mep_refresh_token', 'stale-refresh-from-old-session')

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        // No `token` / `refresh_token` fields — cookie-shaped response.
        user: { user_id: 1, role: 'SUPER_ADMIN' },
      }),
    })

    const user = userEvent.setup()
    renderLogin()

    await user.type(screen.getByLabelText(/email/i), 'sa@example.com')
    await user.type(screen.getByLabelText(/pin/i), 'sa-pin-1234')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      // No alert should be raised — cookie-only is a happy path.
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    // Stale localStorage should be cleared, not overwritten with `undefined`.
    expect(localStorage.getItem('mep_token')).toBeNull()
    expect(localStorage.getItem('mep_refresh_token')).toBeNull()

    // Verify the request shape: X-Auth-Channel + credentials: 'include'.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, calledInit] = fetchMock.mock.calls[0]
    expect(calledInit.credentials).toBe('include')
    expect(calledInit.headers['X-Auth-Channel']).toBe('cookie')
  })

  test('403 BLOCKED_PORTAL_LOGIN renders the friendly inline message', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({
        ok: false,
        error: 'BLOCKED_PORTAL_LOGIN',
        message: 'This account does not have access to the admin portal.',
      }),
    })

    const user = userEvent.setup()
    renderLogin()

    await user.type(screen.getByLabelText(/email/i), 'tenant@example.com')
    await user.type(screen.getByLabelText(/pin/i), '1234')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
    expect(screen.getByRole('alert')).toHaveTextContent(/admin portal/i)
    // The token should NOT be stashed on a blocked attempt.
    expect(localStorage.getItem('mep_token')).toBeNull()
  })

  test('401 INVALID_CREDENTIALS renders the inline error', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ ok: false, error: 'INVALID_CREDENTIALS' }),
    })

    const user = userEvent.setup()
    renderLogin()

    await user.type(screen.getByLabelText(/email/i), 'wrong@example.com')
    await user.type(screen.getByLabelText(/pin/i), '0000')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
    expect(screen.getByRole('alert')).toHaveTextContent(/INVALID_CREDENTIALS/i)
  })

  test('network error renders the error inline (no crash)', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Connection refused'))

    const user = userEvent.setup()
    renderLogin()

    await user.type(screen.getByLabelText(/email/i), 'sa@example.com')
    await user.type(screen.getByLabelText(/pin/i), '1234')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
    expect(screen.getByRole('alert')).toHaveTextContent(/Connection refused/i)
  })
})
