// src/pages/materials/ToolsPage.test.jsx
//
// Phase 6-D-9 / §128 — RTL smoke for the Tools page. Self-contained mocks for
// react-i18next, usePermissions, and @/lib/api.

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

import ToolsPage from './ToolsPage.jsx'

describe('ToolsPage', () => {
  beforeEach(() => {
    apiGet.mockReset()
    apiPost.mockReset()
    mockCan.mockReturnValue(true)
    apiGet.mockResolvedValue({ data: { projects: [], catalog: [], assets: [] } })
  })

  test('renders both tabs and loads catalog when the user can request', async () => {
    render(<MemoryRouter><ToolsPage /></MemoryRouter>)
    expect(screen.getByText('tools.title')).toBeInTheDocument()
    expect(screen.getByText('tools.tabs.request')).toBeInTheDocument()
    expect(screen.getByText('tools.tabs.assets')).toBeInTheDocument()
    await waitFor(() => expect(apiGet).toHaveBeenCalledWith('/tools/catalog'))
  })

  test('hides Request and defaults to Assets when the user can only view assets', async () => {
    mockCan.mockImplementation((_mod, act) => act === 'surplus_view')
    render(<MemoryRouter><ToolsPage /></MemoryRouter>)
    expect(screen.queryByText('tools.tabs.request')).not.toBeInTheDocument()
    expect(screen.getByText('tools.tabs.assets')).toBeInTheDocument()
    await waitFor(() => expect(apiGet).toHaveBeenCalledWith('/tools/assets'))
  })
})
