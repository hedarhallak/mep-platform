// src/admin/RequireAdminTab.test.jsx
//
// Section 133.5 — per-tab session gate for the SUPER_ADMIN portal.

import { describe, test, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import RequireAdminTab, {
  ADMIN_TAB_SESSION_KEY,
  markAdminTabSession,
  clearAdminTabSession,
  hasAdminTabSession,
} from './RequireAdminTab.jsx'

function renderAt(initialPath) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path="/"
          element={
            <RequireAdminTab>
              <div>PROTECTED CONTENT</div>
            </RequireAdminTab>
          }
        />
        <Route path="/login" element={<div>LOGIN SCREEN</div>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('RequireAdminTab', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  test('redirects to /login when the per-tab marker is absent (reopened / new tab)', () => {
    renderAt('/')
    expect(screen.getByText('LOGIN SCREEN')).toBeInTheDocument()
    expect(screen.queryByText('PROTECTED CONTENT')).not.toBeInTheDocument()
  })

  test('renders the protected content once the tab has been marked', () => {
    markAdminTabSession()
    renderAt('/')
    expect(screen.getByText('PROTECTED CONTENT')).toBeInTheDocument()
  })

  test('markAdminTabSession / clearAdminTabSession round-trip', () => {
    expect(hasAdminTabSession()).toBe(false)
    markAdminTabSession()
    expect(sessionStorage.getItem(ADMIN_TAB_SESSION_KEY)).toBe('1')
    expect(hasAdminTabSession()).toBe(true)
    clearAdminTabSession()
    expect(hasAdminTabSession()).toBe(false)
  })
})
