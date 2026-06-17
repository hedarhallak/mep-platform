// src/pages/crews/CrewsPage.test.jsx
//
// CREWS Slice 3 (§146) — RTL smoke for the crews-management page.

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k, opts) => (opts && opts.count != null ? `${k}:${opts.count}` : k),
    i18n: { language: 'en' },
  }),
}))

const apiGet = vi.fn()
const apiPost = vi.fn()
const apiPatch = vi.fn()
const apiDelete = vi.fn()
vi.mock('@/lib/api', () => ({
  default: {
    get: (...a) => apiGet(...a),
    post: (...a) => apiPost(...a),
    patch: (...a) => apiPatch(...a),
    delete: (...a) => apiDelete(...a),
  },
}))

let canImpl = () => true
vi.mock('@/hooks/usePermissions.jsx', () => ({
  usePermissions: () => ({ can: (...a) => canImpl(...a), loading: false }),
}))

import CrewsPage from './CrewsPage.jsx'

function mockData(crews = [], workers = []) {
  apiGet.mockImplementation((url) => {
    if (url === '/crews') return Promise.resolve({ data: { crews } })
    if (url === '/hub/workers') return Promise.resolve({ data: { workers } })
    return Promise.resolve({ data: {} })
  })
}

describe('CrewsPage', () => {
  beforeEach(() => {
    apiGet.mockReset()
    apiPost.mockReset()
    apiPatch.mockReset()
    apiDelete.mockReset()
    canImpl = () => true
  })

  test('fetches /crews + /hub/workers on mount and renders a crew row', async () => {
    mockData([
      { id: 1, name: 'Plumbing A', foreman_name: 'Bob', member_count: 3, trade_code: 'PLUMBING', is_active: true },
    ])
    render(<CrewsPage />)
    await waitFor(() => expect(screen.getByText('Plumbing A')).toBeInTheDocument())
    expect(apiGet).toHaveBeenCalledWith('/crews')
    expect(apiGet).toHaveBeenCalledWith('/hub/workers')
    expect(screen.getByText('Bob')).toBeInTheDocument()
  })

  test('shows empty state when there are no crews', async () => {
    mockData([])
    render(<CrewsPage />)
    await waitFor(() => expect(screen.getByText('crews.empty')).toBeInTheDocument())
  })

  test('hides the New Crew button without assignments.create', async () => {
    mockData([])
    canImpl = (mod, act) => !(mod === 'assignments' && act === 'create')
    render(<CrewsPage />)
    await waitFor(() => expect(screen.getByText('crews.empty')).toBeInTheDocument())
    expect(screen.queryByText('crews.addButton')).toBeNull()
  })

  test('opens the create modal on New Crew click', async () => {
    mockData([])
    render(<CrewsPage />)
    await waitFor(() => expect(screen.getByText('crews.empty')).toBeInTheDocument())
    fireEvent.click(screen.getByText('crews.addButton'))
    expect(screen.getByText('crews.modal.titleNew')).toBeInTheDocument()
  })
})
