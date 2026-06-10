// src/admin/SuperAuditPage.test.jsx
//
// §132.6 / §140 Slice 3b (frontend) — RTL smoke for the SUPER_ADMIN
// cross-tenant audit page. Mocks ../lib/api; wraps in MemoryRouter
// (the page uses <Link> + AdminLogoutButton → useNavigate).

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const apiGet = vi.fn()
vi.mock('../lib/api', () => ({ default: { get: (...a) => apiGet(...a) } }))

import SuperAuditPage from './SuperAuditPage.jsx'

function renderWithRouter(ui) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

describe('SuperAuditPage', () => {
  beforeEach(() => {
    apiGet.mockReset()
  })

  test('fetches /super/audit and renders company + old→new diff', async () => {
    apiGet.mockResolvedValue({
      data: {
        audit: [
          {
            id: 1,
            company_id: 7,
            company_name: 'MEP Construction',
            action: 'PROJECT_UPDATED',
            entity_name: 'Tower A',
            old_values: { site_address: '100 Old', updated_at: 'x' },
            new_values: { site_address: '999 Far', updated_at: 'y' },
            changed_by: 'admin',
            changer_role: 'COMPANY_ADMIN',
            created_at: '2026-06-09T10:00:00Z',
          },
        ],
      },
    })
    renderWithRouter(<SuperAuditPage />)

    await waitFor(() => expect(screen.getByText('MEP Construction')).toBeInTheDocument())
    expect(apiGet).toHaveBeenCalledWith('/super/audit')
    // Changed field shown old → new; noise key hidden.
    expect(screen.getByText('site_address')).toBeInTheDocument()
    expect(screen.getByText('100 Old')).toBeInTheDocument()
    expect(screen.getByText('999 Far')).toBeInTheDocument()
    expect(screen.queryByText('updated_at')).not.toBeInTheDocument()
  })

  test('shows the empty state when there is no sensitive audit', async () => {
    apiGet.mockResolvedValue({ data: { audit: [] } })
    renderWithRouter(<SuperAuditPage />)
    await waitFor(() => expect(screen.getByText(/No sensitive audit/i)).toBeInTheDocument())
  })
})
