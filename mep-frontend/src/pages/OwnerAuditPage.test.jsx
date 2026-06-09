// src/pages/OwnerAuditPage.test.jsx
//
// §132 / §140 Slice 2c — RTL smoke for the OWNER sensitive-edit audit page.

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k) => k, i18n: { language: 'en' } }),
}))

const apiGet = vi.fn()
vi.mock('@/lib/api', () => ({
  default: { get: (...a) => apiGet(...a) },
}))

import OwnerAuditPage from './OwnerAuditPage.jsx'

describe('OwnerAuditPage', () => {
  beforeEach(() => {
    apiGet.mockReset()
  })

  test('fetches /permissions/owner-audit and renders the old→new diff', async () => {
    apiGet.mockResolvedValue({
      data: {
        audit: [
          {
            id: 1,
            action: 'PROJECT_UPDATED',
            entity_name: 'Tower A',
            old_values: { site_address: '100 Old St', updated_at: 'x' },
            new_values: { site_address: '999 Far Blvd', updated_at: 'y' },
            changed_by: 'admin',
            changer_role: 'COMPANY_ADMIN',
            created_at: '2026-06-06T12:00:00Z',
          },
        ],
      },
    })
    render(<OwnerAuditPage />)

    await waitFor(() => expect(screen.getByText(/PROJECT_UPDATED/)).toBeInTheDocument())
    expect(apiGet).toHaveBeenCalledWith('/permissions/owner-audit')
    // The changed field is shown old → new; noise key (updated_at) is hidden.
    expect(screen.getByText('site_address')).toBeInTheDocument()
    expect(screen.getByText('100 Old St')).toBeInTheDocument()
    expect(screen.getByText('999 Far Blvd')).toBeInTheDocument()
    expect(screen.queryByText('updated_at')).not.toBeInTheDocument()
  })

  test('shows the empty state when there are no sensitive edits', async () => {
    apiGet.mockResolvedValue({ data: { audit: [] } })
    render(<OwnerAuditPage />)
    await waitFor(() => expect(screen.getByText('ownerAudit.empty')).toBeInTheDocument())
  })
})
