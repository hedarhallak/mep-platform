// src/admin/AdminIdleGuard.test.jsx
//
// Section 133.2 — idle auto-logout for the SUPER_ADMIN portal.

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const apiPost = vi.fn(() => Promise.resolve({ data: {} }))
vi.mock('../lib/api', () => ({ default: { post: (...a) => apiPost(...a) } }))

import AdminIdleGuard from './AdminIdleGuard.jsx'

const IDLE_MS = 15 * 60 * 1000

// jsdom forbids spying on window.location.assign (non-configurable). The
// standard workaround is to redefine the whole location object as a
// configurable mock. The component only reads location.assign; React Router
// drives navigation through its own history, so this doesn't affect routing.
const assign = vi.fn()
let originalLocation

describe('AdminIdleGuard', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    apiPost.mockClear()
    assign.mockClear()
    originalLocation = window.location
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { assign, search: '', href: '', pathname: '/' },
    })
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: originalLocation,
    })
  })

  test('signs out after the idle window on a non-login route', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AdminIdleGuard />
      </MemoryRouter>
    )

    // Just before the threshold — nothing fires yet.
    await vi.advanceTimersByTimeAsync(IDLE_MS - 1000)
    expect(assign).not.toHaveBeenCalled()

    // Cross the threshold → best-effort revoke + redirect to login.
    await vi.advanceTimersByTimeAsync(2000)
    expect(apiPost).toHaveBeenCalledWith('/auth/logout', {})
    expect(assign).toHaveBeenCalledWith('/login?reason=idle')
  })

  test('does NOT arm the idle timer on the /login route', async () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <AdminIdleGuard />
      </MemoryRouter>
    )
    await vi.advanceTimersByTimeAsync(2 * IDLE_MS)
    expect(assign).not.toHaveBeenCalled()
    expect(apiPost).not.toHaveBeenCalled()
  })
})
