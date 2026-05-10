// src/admin/CompaniesList.test.jsx
//
// Phase 5 / 90-D — RTL coverage for the admin All-Companies list.
//
// Strategy: mock @/lib/api at the file top so the component runs against
// deterministic data, then assert against the rendered table. We cover
// the loading / error / empty / populated states and the two interactive
// affordances (search + click-sort).

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CompaniesList from './CompaniesList.jsx'

// --- Mock api -------------------------------------------------------------
let nextApiResponse
let nextApiError

vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn(() => {
      if (nextApiError) return Promise.reject(nextApiError)
      return Promise.resolve({ data: nextApiResponse, status: 200, ok: true })
    }),
  },
}))

beforeEach(() => {
  nextApiResponse = undefined
  nextApiError = undefined
})

// --- Fixtures -------------------------------------------------------------

const FIXTURE = {
  ok: true,
  companies: [
    {
      company_id: 1,
      name: 'Acme Mechanical',
      plan: 'PRO',
      status: 'ACTIVE',
      employee_count: 12,
      project_count: 3,
      created_at: '2026-01-15T10:00:00Z',
      last_activity_at: '2026-05-09T18:30:00Z',
    },
    {
      company_id: 2,
      name: 'Bolt Plumbing',
      plan: 'BASIC',
      status: 'TRIAL',
      employee_count: 4,
      project_count: 1,
      created_at: '2026-03-22T09:00:00Z',
      last_activity_at: null,
    },
    {
      company_id: 3,
      name: 'Capital Electric',
      plan: 'ENTERPRISE',
      status: 'SUSPENDED',
      employee_count: 87,
      project_count: 14,
      created_at: '2025-08-10T12:00:00Z',
      last_activity_at: '2026-04-02T11:15:00Z',
    },
  ],
}

// Helper: returns the rendered tbody row count (excluding the empty-state row).
function visibleCompanyRows() {
  const tbody = screen.getByRole('table').querySelector('tbody')
  return within(tbody)
    .getAllByRole('row')
    .filter((tr) => tr.querySelector('td:first-child')?.textContent !== '')
}

// ---------------------------------------------------------------------------
// Render lifecycle
// ---------------------------------------------------------------------------

describe('CompaniesList — render lifecycle', () => {
  test('shows loading then renders rows from the API', async () => {
    nextApiResponse = FIXTURE
    render(<CompaniesList />)

    // Loading state — count text reads "Loading…" before the promise settles.
    expect(screen.getByText(/Loading/i)).toBeInTheDocument()

    // After the promise resolves, all 3 fixture companies appear as rows.
    await waitFor(() => {
      expect(screen.getByText('Acme Mechanical')).toBeInTheDocument()
    })
    expect(screen.getByText('Bolt Plumbing')).toBeInTheDocument()
    expect(screen.getByText('Capital Electric')).toBeInTheDocument()
  })

  test('shows the error banner when the API rejects', async () => {
    nextApiError = Object.assign(new Error('HTTP 500'), {
      response: { status: 500, data: { ok: false, error: 'SERVER_ERROR' } },
    })
    render(<CompaniesList />)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
    expect(screen.getByRole('alert')).toHaveTextContent(/SERVER_ERROR/i)
  })

  test('shows the empty-state row when the API returns zero companies', async () => {
    nextApiResponse = { ok: true, companies: [] }
    render(<CompaniesList />)

    await waitFor(() => {
      expect(screen.getByText(/No companies yet/i)).toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// Interactions
// ---------------------------------------------------------------------------

describe('CompaniesList — search and sort', () => {
  test('search filters rows by name (case-insensitive substring)', async () => {
    nextApiResponse = FIXTURE
    const user = userEvent.setup()
    render(<CompaniesList />)

    await waitFor(() => expect(screen.getByText('Acme Mechanical')).toBeInTheDocument())

    const search = screen.getByLabelText(/search companies/i)
    await user.type(search, 'plum')

    // Only "Bolt Plumbing" matches.
    expect(screen.getByText('Bolt Plumbing')).toBeInTheDocument()
    expect(screen.queryByText('Acme Mechanical')).not.toBeInTheDocument()
    expect(screen.queryByText('Capital Electric')).not.toBeInTheDocument()
  })

  test('search match counter reads "1 of 3" after filtering', async () => {
    nextApiResponse = FIXTURE
    const user = userEvent.setup()
    render(<CompaniesList />)

    await waitFor(() => expect(screen.getByText('Acme Mechanical')).toBeInTheDocument())

    const search = screen.getByLabelText(/search companies/i)
    await user.type(search, 'plum')

    expect(screen.getByText(/1 of 3/i)).toBeInTheDocument()
  })

  test('clicking the Employees header sorts by employee_count ascending then descending', async () => {
    nextApiResponse = FIXTURE
    const user = userEvent.setup()
    render(<CompaniesList />)

    await waitFor(() => expect(screen.getByText('Acme Mechanical')).toBeInTheDocument())

    // Default sort is by name (asc): Acme, Bolt, Capital.
    let rows = visibleCompanyRows()
    expect(rows[0]).toHaveTextContent('Acme Mechanical')
    expect(rows[1]).toHaveTextContent('Bolt Plumbing')
    expect(rows[2]).toHaveTextContent('Capital Electric')

    // First click on Employees → sort by employee_count asc:
    // Bolt (4), Acme (12), Capital (87)
    await user.click(screen.getByText(/Employees/i))
    rows = visibleCompanyRows()
    expect(rows[0]).toHaveTextContent('Bolt Plumbing')
    expect(rows[1]).toHaveTextContent('Acme Mechanical')
    expect(rows[2]).toHaveTextContent('Capital Electric')

    // Second click → descending: Capital (87), Acme (12), Bolt (4)
    await user.click(screen.getByText(/Employees/i))
    rows = visibleCompanyRows()
    expect(rows[0]).toHaveTextContent('Capital Electric')
    expect(rows[1]).toHaveTextContent('Acme Mechanical')
    expect(rows[2]).toHaveTextContent('Bolt Plumbing')
  })

  test('null last_activity_at sorts to the bottom regardless of direction', async () => {
    nextApiResponse = FIXTURE // Bolt's last_activity_at is null
    const user = userEvent.setup()
    render(<CompaniesList />)

    await waitFor(() => expect(screen.getByText('Bolt Plumbing')).toBeInTheDocument())

    // Click Last activity column header — asc, then desc.
    const header = screen.getByText(/Last activity/i)

    await user.click(header)
    let rows = visibleCompanyRows()
    expect(rows[rows.length - 1]).toHaveTextContent('Bolt Plumbing') // null at bottom (asc)

    await user.click(header)
    rows = visibleCompanyRows()
    expect(rows[rows.length - 1]).toHaveTextContent('Bolt Plumbing') // null still at bottom (desc)
  })
})
