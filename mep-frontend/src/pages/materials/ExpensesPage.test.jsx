// src/pages/materials/ExpensesPage.test.jsx
//
// Section 129 — RTL smoke for the Expenses (emergency purchase) page.
// Self-contained mocks for react-i18next, usePermissions, and @/lib/api.

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k, o) => (o && o.count != null ? `${k}:${o.count}` : k),
    i18n: { language: 'en' },
  }),
}))

const mockCan = vi.fn(() => true)
vi.mock('@/hooks/usePermissions.jsx', () => ({
  usePermissions: () => ({ can: mockCan, loading: false }),
}))

const apiGet = vi.fn()
const apiPost = vi.fn()
const apiPatch = vi.fn()
vi.mock('@/lib/api', () => ({
  default: {
    get: (...a) => apiGet(...a),
    post: (...a) => apiPost(...a),
    patch: (...a) => apiPatch(...a),
  },
}))

import ExpensesPage from './ExpensesPage.jsx'

describe('ExpensesPage', () => {
  beforeEach(() => {
    apiGet.mockReset()
    apiPost.mockReset()
    apiPatch.mockReset()
    mockCan.mockReturnValue(true)
    apiGet.mockResolvedValue({ data: { projects: [], claims: [] } })
  })

  test('renders both tabs and loads projects when the user can submit', async () => {
    render(<MemoryRouter><ExpensesPage /></MemoryRouter>)
    expect(screen.getByText('expenses.title')).toBeInTheDocument()
    expect(screen.getByText('expenses.tabs.submit')).toBeInTheDocument()
    expect(screen.getByText('expenses.tabs.claims')).toBeInTheDocument()
    await waitFor(() => expect(apiGet).toHaveBeenCalledWith('/projects?status=ACTIVE'))
  })

  test('hides Submit and defaults to Claims when the user can only view', async () => {
    mockCan.mockImplementation((_mod, act) => act === 'view')
    render(<MemoryRouter><ExpensesPage /></MemoryRouter>)
    expect(screen.queryByText('expenses.tabs.submit')).not.toBeInTheDocument()
    expect(screen.getByText('expenses.tabs.claims')).toBeInTheDocument()
    await waitFor(() => expect(apiGet).toHaveBeenCalledWith('/expense-claims'))
  })
})
