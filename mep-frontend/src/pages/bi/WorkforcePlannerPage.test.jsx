// src/pages/bi/WorkforcePlannerPage.test.jsx
//
// Section 130 — RTL smoke for the UNIFIED Workforce Planner (Plan +
// Optimize tabs). Self-contained mocks for react-i18next, usePermissions,
// and @/lib/api — same pattern as ToolsPage/ExpensesPage tests.

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

import WorkforcePlannerPage from './WorkforcePlannerPage.jsx'

describe('WorkforcePlannerPage (unified)', () => {
  beforeEach(() => {
    apiGet.mockReset()
    apiPost.mockReset()
    apiPatch.mockReset()
    mockCan.mockReturnValue(true)
    apiGet.mockResolvedValue({
      data: {
        threshold_km: 65,
        summary: { total_assignments: 0, far_assignments: 0, optimizable: 0, total_saving_km: 0 },
        suggestions: [],
      },
    })
  })

  test('renders both tabs, defaults to Plan, generate is lazy (no fetch on mount)', () => {
    render(<MemoryRouter><WorkforcePlannerPage /></MemoryRouter>)
    expect(screen.getByText('bi.workforcePlanner.title')).toBeInTheDocument()
    expect(screen.getByText('bi.workforcePlanner.tabs.plan')).toBeInTheDocument()
    expect(screen.getByText('bi.workforcePlanner.tabs.optimize')).toBeInTheDocument()
    // Plan tab is default and only fetches when "Generate" is clicked.
    expect(screen.getByText('bi.workforcePlanner.plan.emptyTitle')).toBeInTheDocument()
    expect(apiGet).not.toHaveBeenCalled()
    expect(apiPost).not.toHaveBeenCalled()
  })

  test('hides Plan and defaults to Optimize when the user lacks smart_assign', async () => {
    mockCan.mockImplementation((mod, act) => !(mod === 'assignments' && act === 'smart_assign'))
    render(<MemoryRouter><WorkforcePlannerPage /></MemoryRouter>)
    expect(screen.queryByText('bi.workforcePlanner.tabs.plan')).not.toBeInTheDocument()
    expect(screen.getByText('bi.workforcePlanner.tabs.optimize')).toBeInTheDocument()
    // Optimize tab fetches the BI suggestions on mount.
    await waitFor(() => expect(apiGet).toHaveBeenCalledWith('/bi/workforce-suggestions'))
  })
})
