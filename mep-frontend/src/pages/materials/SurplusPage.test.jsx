// src/pages/materials/SurplusPage.test.jsx
//
// Phase 6-D-9 (functional features) — RTL smoke for the Surplus page.
// Self-contained mocks for react-i18next (t returns the key), usePermissions,
// and @/lib/api so the page renders deterministically.

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
vi.mock('@/lib/api', () => ({
  default: { get: (...a) => apiGet(...a), post: (...a) => apiPost(...a) },
}))

import SurplusPage from './SurplusPage.jsx'

describe('SurplusPage', () => {
  beforeEach(() => {
    apiGet.mockReset()
    apiPost.mockReset()
    mockCan.mockReturnValue(true)
    apiGet.mockResolvedValue({ data: { projects: [], surplus: [] } })
  })

  test('renders header + both tabs when the user can declare', async () => {
    render(<MemoryRouter><SurplusPage /></MemoryRouter>)
    expect(screen.getByText('surplus.title')).toBeInTheDocument()
    expect(screen.getByText('surplus.tabs.declare')).toBeInTheDocument()
    expect(screen.getByText('surplus.tabs.available')).toBeInTheDocument()
    // Declare tab is default → loads active projects
    await waitFor(() => expect(apiGet).toHaveBeenCalledWith('/projects?status=ACTIVE'))
  })

  test('hides the Declare tab and defaults to Available when the user cannot declare', async () => {
    mockCan.mockImplementation((_mod, act) => act !== 'surplus_declare')
    render(<MemoryRouter><SurplusPage /></MemoryRouter>)
    expect(screen.queryByText('surplus.tabs.declare')).not.toBeInTheDocument()
    expect(screen.getByText('surplus.tabs.available')).toBeInTheDocument()
    // Available tab loads surplus
    await waitFor(() => expect(apiGet).toHaveBeenCalledWith('/materials/surplus'))
  })
})
