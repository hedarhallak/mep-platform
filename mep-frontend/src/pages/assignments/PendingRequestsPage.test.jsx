// src/pages/assignments/PendingRequestsPage.test.jsx
// Method 4 (§147.5) dispatcher review screen — RTL smoke.

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k, opts) => (opts && opts.count != null ? `${k}:${opts.count}` : opts && opts.name ? `${k}:${opts.name}` : k),
    i18n: { language: 'en' },
  }),
}))

const apiGet = vi.fn()
const apiPatch = vi.fn()
vi.mock('@/lib/api', () => ({
  default: { get: (...a) => apiGet(...a), patch: (...a) => apiPatch(...a) },
}))

let canImpl = () => true
vi.mock('@/hooks/usePermissions.jsx', () => ({
  usePermissions: () => ({ can: (...a) => canImpl(...a), loading: false }),
}))

import PendingRequestsPage from './PendingRequestsPage.jsx'

const ONE = {
  id: 1,
  status: 'PENDING',
  start_date: '2026-07-15',
  end_date: '2026-07-15',
  project_code: 'P-100',
  project_name: 'Tower A',
  employee_name: 'Ali Hassan',
  employee_trade: 'PLUMBING',
  requested_by_name: 'foreman_khaled',
}

describe('PendingRequestsPage', () => {
  beforeEach(() => {
    apiGet.mockReset()
    apiPatch.mockReset()
    canImpl = () => true
  })

  test('fetches pending requests on mount and renders grouped by project', async () => {
    apiGet.mockResolvedValue({ data: { requests: [ONE] } })
    render(<PendingRequestsPage />)
    await waitFor(() => expect(screen.getByText('Ali Hassan')).toBeInTheDocument())
    expect(apiGet).toHaveBeenCalledWith('/assignments/requests?status=PENDING')
    expect(screen.getByText('P-100')).toBeInTheDocument()
  })

  test('approve calls the approve endpoint and removes the row', async () => {
    apiGet.mockResolvedValue({ data: { requests: [ONE] } })
    apiPatch.mockResolvedValue({ data: { ok: true } })
    render(<PendingRequestsPage />)
    await waitFor(() => expect(screen.getByText('Ali Hassan')).toBeInTheDocument())

    fireEvent.click(screen.getByText('pendingRequests.approve'))
    await waitFor(() =>
      expect(apiPatch).toHaveBeenCalledWith('/assignments/requests/1/approve')
    )
    await waitFor(() => expect(screen.queryByText('Ali Hassan')).toBeNull())
  })

  test('shows empty state when there are no pending requests', async () => {
    apiGet.mockResolvedValue({ data: { requests: [] } })
    render(<PendingRequestsPage />)
    await waitFor(() => expect(screen.getByText('pendingRequests.empty')).toBeInTheDocument())
  })

  test('hides approve/reject without assignments.edit', async () => {
    apiGet.mockResolvedValue({ data: { requests: [ONE] } })
    canImpl = (mod, act) => !(mod === 'assignments' && act === 'edit')
    render(<PendingRequestsPage />)
    await waitFor(() => expect(screen.getByText('Ali Hassan')).toBeInTheDocument())
    expect(screen.queryByText('pendingRequests.approve')).toBeNull()
  })
})
