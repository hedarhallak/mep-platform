// src/pages/projects/ProjectStaffingPage.test.jsx
// §147 Phase 1 — project staffing/coverage page, RTL smoke.

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k, opts) => {
      if (!opts) return k
      if (opts.n != null) return `${k}:${opts.n}`
      if (opts.required != null) return `${k}:${opts.required}/${opts.assigned}`
      return k
    },
    i18n: { language: 'en' },
  }),
}))

const apiGet = vi.fn()
vi.mock('@/lib/api', () => ({
  default: { get: (...a) => apiGet(...a), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

let canImpl = () => true
vi.mock('@/hooks/usePermissions.jsx', () => ({
  usePermissions: () => ({ can: (...a) => canImpl(...a), loading: false }),
}))

import ProjectStaffingPage from './ProjectStaffingPage.jsx'

describe('ProjectStaffingPage', () => {
  beforeEach(() => {
    apiGet.mockReset()
    canImpl = () => true
  })

  test('loads projects; selecting one shows coverage with a gap', async () => {
    apiGet.mockImplementation((url) => {
      if (url === '/projects')
        return Promise.resolve({ data: { projects: [{ id: 5, project_code: 'P-5', project_name: 'Tower' }] } })
      if (url.includes('/requirements'))
        return Promise.resolve({
          data: { requirements: [{ id: 1, trade_code: 'PLUMBING', required_count: 2, start_date: '2026-07-01', end_date: '2026-07-31' }] },
        })
      if (url.includes('/coverage'))
        return Promise.resolve({
          data: { coverage: [{ trade_code: 'PLUMBING', required: 2, assigned: 1, gap: 1 }], totals: { required: 2, assigned: 1, gap: 1 } },
        })
      if (url === '/hub/workers') return Promise.resolve({ data: { workers: [] } })
      return Promise.resolve({ data: {} })
    })

    render(<ProjectStaffingPage />)
    // Project dropdown populated
    await waitFor(() => expect(screen.getByText(/P-5/)).toBeInTheDocument())

    fireEvent.change(screen.getByRole('combobox'), { target: { value: '5' } })

    // Coverage shows the PLUMBING gap (short 1) + the requirement row
    await waitFor(() => expect(screen.getByText('projectStaffing.short:1')).toBeInTheDocument())
    expect(apiGet).toHaveBeenCalledWith('/projects/5/requirements')
    expect(apiGet).toHaveBeenCalledWith('/projects/5/coverage?date=' + new Date().toISOString().slice(0, 10))
  })

  test('a red gap shows a Fill button that opens the fill modal', async () => {
    apiGet.mockImplementation((url) => {
      if (url === '/projects')
        return Promise.resolve({ data: { projects: [{ id: 5, project_code: 'P-5', project_name: 'Tower' }] } })
      if (url.includes('/requirements')) return Promise.resolve({ data: { requirements: [] } })
      if (url.includes('/coverage'))
        return Promise.resolve({
          data: { coverage: [{ trade_code: 'PLUMBING', required: 2, assigned: 1, gap: 1 }], totals: { required: 2, assigned: 1, gap: 1 } },
        })
      if (url === '/hub/workers') return Promise.resolve({ data: { workers: [] } })
      return Promise.resolve({ data: {} })
    })

    render(<ProjectStaffingPage />)
    await waitFor(() => expect(screen.getByText(/P-5/)).toBeInTheDocument())
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '5' } })

    const fillBtn = await screen.findByText('projectStaffing.fill')
    fireEvent.click(fillBtn)
    // Modal title interpolates the gap count (n=1) via the test t() mock.
    expect(screen.getByText('projectStaffing.fillModal.title:1')).toBeInTheDocument()
  })
})
