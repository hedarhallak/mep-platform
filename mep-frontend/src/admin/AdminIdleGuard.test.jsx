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

describe('AdminIdleGuard', () => {
  let assignSpy

  beforeEach(() => {
    vi.useFakeTimers()
    apiPost.mockClear()
    assignSpy = vi.spyOn(window.location, 'assign').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    assignSpy.mockRestore()
  })

  test('signs out after the idle window on a non-login route', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AdminIdleGuard />
      </MemoryRouter>
    )

    // Just before the threshold — nothing fires yet.
    await vi.advanceTimersByTimeAsync(IDLE_MS - 1000)
    expect(assignSpy).not.toHaveBeenCalled()

    // Cross the threshold → best-effort revoke + redirect to login.
    await vi.advanceTimersByTimeAsync(2000)
    expect(apiPost).toHaveBeenCalledWith('/auth/logout', {})
    expect(assignSpy).toHaveBeenCalledWith('/login?reason=idle')
  })

  test('does NOT arm the idle timer on the /login route', async () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <AdminIdleGuard />
      </MemoryRouter>
    )
    await vi.advanceTimersByTimeAsync(2 * IDLE_MS)
    expect(assignSpy).not.toHaveBeenCalled()
    expect(apiPost).not.toHaveBeenCalled()
  })
})
