// src/admin/CustomDemandsPage.test.jsx
//
// Phase 6-D-6 PR 3 / Section 122 — RTL smoke coverage for the SUPER_ADMIN
// Custom Demands page.
//
// Strategy mirrors CompaniesList.test.jsx: mock @/lib/api at file top so the
// component runs against deterministic data, then assert against the rendered
// shell. Covers loading / error / empty / populated states plus the Create
// modal opening + Create draft submission.

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import CustomDemandsPage from './CustomDemandsPage.jsx'

// CustomDemandsPage renders <Link to="/">, AdminLogoutButton (which uses
// useNavigate), and uses the same api shape as TrainingQuotesPage. Wrap in
// MemoryRouter so Link/useNavigate work.
function renderWithRouter(ui) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

// --- Mock api -------------------------------------------------------------
//
// The page fires two parallel GETs in load():
//   - /super/custom-demands/quotes
//   - /super/companies/overview
// and one POST when Create draft is submitted. Route each one to a per-URL
// fixture via the maps below.
const apiResponses = {}
const apiErrors = {}
const postCalls = []

vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn((url) => {
      if (apiErrors[url]) return Promise.reject(apiErrors[url])
      return Promise.resolve({
        data: apiResponses[url] || {},
        status: 200,
      })
    }),
    post: vi.fn((url, body) => {
      postCalls.push({ url, body })
      if (apiErrors[`POST ${url}`]) return Promise.reject(apiErrors[`POST ${url}`])
      return Promise.resolve({
        data: apiResponses[`POST ${url}`] || {
          ok: true,
          invoice: { invoice_number: 'CONS-2026-9999' },
        },
        status: 200,
      })
    }),
  },
}))

beforeEach(() => {
  for (const k of Object.keys(apiResponses)) delete apiResponses[k]
  for (const k of Object.keys(apiErrors)) delete apiErrors[k]
  postCalls.length = 0
})

// --- Fixtures -------------------------------------------------------------

const QUOTES_FIXTURE = {
  ok: true,
  quotes: [
    {
      id: 1,
      invoice_number: 'CONS-2026-0042',
      status: 'DRAFT',
      company_id: 1,
      company_name: 'Acme Mechanical',
      company_code: 'ACME001',
      subtotal_cents: 400000,
      qst_cents: 39900,
      gst_cents: 20000,
      total_cents: 459900,
      amount_paid_cents: 0,
      currency: 'CAD',
      issue_date: '2026-05-30',
      quote_expires_at: '2026-06-30',
      customer_notes: null,
      details: { title: 'QuickBooks integration' },
      created_at: '2026-05-30T10:00:00Z',
    },
    {
      id: 2,
      invoice_number: 'CONS-2026-0043',
      status: 'QUOTE_SENT',
      company_id: 2,
      company_name: 'Bolt Plumbing',
      company_code: 'BOLT001',
      subtotal_cents: 150000,
      qst_cents: 14962,
      gst_cents: 7500,
      total_cents: 172462,
      amount_paid_cents: 0,
      currency: 'CAD',
      issue_date: '2026-05-28',
      quote_expires_at: '2026-06-28',
      customer_notes: null,
      details: { title: 'Custom reporting dashboard' },
      created_at: '2026-05-28T10:00:00Z',
    },
  ],
}

const COMPANIES_FIXTURE = {
  ok: true,
  companies: [
    { company_id: 1, name: 'Acme Mechanical', company_code: 'ACME001' },
    { company_id: 2, name: 'Bolt Plumbing', company_code: 'BOLT001' },
  ],
}

// ---------------------------------------------------------------------------
// Render lifecycle
// ---------------------------------------------------------------------------

describe('CustomDemandsPage — render lifecycle', () => {
  test('shows Loading then renders the table from the API', async () => {
    apiResponses['/super/custom-demands/quotes'] = QUOTES_FIXTURE
    apiResponses['/super/companies/overview'] = COMPANIES_FIXTURE
    renderWithRouter(<CustomDemandsPage />)

    expect(screen.getByText(/Loading/i)).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('CONS-2026-0042')).toBeInTheDocument()
    })
    expect(screen.getByText('CONS-2026-0043')).toBeInTheDocument()
    expect(screen.getByText('QuickBooks integration')).toBeInTheDocument()
    expect(screen.getByText('Custom reporting dashboard')).toBeInTheDocument()

    // company_name + company_code render in the Company column
    expect(screen.getByText('Acme Mechanical')).toBeInTheDocument()
    expect(screen.getByText('ACME001')).toBeInTheDocument()
  })

  test('shows error banner when the quotes API rejects', async () => {
    apiErrors['/super/custom-demands/quotes'] = Object.assign(new Error('boom'), {
      response: { status: 500, data: { ok: false, error: 'SERVER_ERROR' } },
    })
    apiResponses['/super/companies/overview'] = COMPANIES_FIXTURE
    renderWithRouter(<CustomDemandsPage />)

    await waitFor(() => {
      expect(screen.getByText(/Failed to load/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/SERVER_ERROR/i)).toBeInTheDocument()
  })

  test('shows empty-state copy when the API returns zero quotes', async () => {
    apiResponses['/super/custom-demands/quotes'] = { ok: true, quotes: [] }
    apiResponses['/super/companies/overview'] = COMPANIES_FIXTURE
    renderWithRouter(<CustomDemandsPage />)

    await waitFor(() => {
      expect(screen.getByText(/No custom demands yet/i)).toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// Create modal
// ---------------------------------------------------------------------------

describe('CustomDemandsPage — create modal', () => {
  test('opens modal and POSTs to /super/custom-demands/quotes on submit', async () => {
    apiResponses['/super/custom-demands/quotes'] = { ok: true, quotes: [] }
    apiResponses['/super/companies/overview'] = COMPANIES_FIXTURE
    apiResponses['POST /super/custom-demands/quotes'] = {
      ok: true,
      invoice: { invoice_number: 'CONS-2026-0100' },
    }

    const user = userEvent.setup()
    renderWithRouter(<CustomDemandsPage />)

    await waitFor(() => {
      expect(screen.getByText(/No custom demands yet/i)).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /\+ New custom demand/i }))

    // Modal header is now present
    expect(screen.getByText(/New custom demand/i)).toBeInTheDocument()

    await user.type(screen.getByPlaceholderText(/Custom AP integration/i), 'Custom dashboard')
    await user.type(screen.getByPlaceholderText('1500.00'), '2500')

    await user.click(screen.getByRole('button', { name: /Create draft/i }))

    await waitFor(() => {
      expect(postCalls.length).toBe(1)
    })
    expect(postCalls[0].url).toBe('/super/custom-demands/quotes')
    expect(postCalls[0].body.title).toBe('Custom dashboard')
    expect(postCalls[0].body.subtotal_cents).toBe(250000)
    expect(postCalls[0].body.company_id).toBe(1)

    // After create, the flash banner appears with the new invoice number
    await waitFor(() => {
      expect(screen.getByText(/CONS-2026-0100/i)).toBeInTheDocument()
    })
  })

  test('Cancel closes the modal without POSTing', async () => {
    apiResponses['/super/custom-demands/quotes'] = { ok: true, quotes: [] }
    apiResponses['/super/companies/overview'] = COMPANIES_FIXTURE

    const user = userEvent.setup()
    renderWithRouter(<CustomDemandsPage />)

    await waitFor(() => {
      expect(screen.getByText(/No custom demands yet/i)).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /\+ New custom demand/i }))
    expect(screen.getByText(/New custom demand/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Cancel/i }))

    // Modal header is gone
    await waitFor(() => {
      expect(screen.queryByText(/New custom demand/i)).not.toBeInTheDocument()
    })
    expect(postCalls.length).toBe(0)
  })

  // Touches the milestones array (add + value entry) so dynamic rows are
  // exercised in CI. Doesn't assert backend shape — that's the integration
  // test's job.
  test('milestones array supports adding and entering values', async () => {
    apiResponses['/super/custom-demands/quotes'] = { ok: true, quotes: [] }
    apiResponses['/super/companies/overview'] = COMPANIES_FIXTURE
    apiResponses['POST /super/custom-demands/quotes'] = {
      ok: true,
      invoice: { invoice_number: 'CONS-2026-0101' },
    }

    const user = userEvent.setup()
    renderWithRouter(<CustomDemandsPage />)

    await waitFor(() => {
      expect(screen.getByText(/No custom demands yet/i)).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /\+ New custom demand/i }))

    // Default row 1
    const row1Desc = screen.getByPlaceholderText(/Milestone 1 description/i)
    await user.type(row1Desc, 'Discovery')

    // Add a second row
    await user.click(screen.getByRole('button', { name: /\+ Add milestone/i }))
    const row2Desc = screen.getByPlaceholderText(/Milestone 2 description/i)
    expect(row2Desc).toBeInTheDocument()
    await user.type(row2Desc, 'Implementation')

    // Required fields then submit
    await user.type(screen.getByPlaceholderText(/Custom AP integration/i), 'Phased build')
    await user.type(screen.getByPlaceholderText('1500.00'), '5000')
    // Enter milestone amounts so cleanedMilestones picks them up
    const amountInputs = within(screen.getByRole('button', { name: /Create draft/i }).closest('form'))
      .getAllByPlaceholderText(/Amount/i)
    await user.type(amountInputs[0], '2000')
    await user.type(amountInputs[1], '3000')

    await user.click(screen.getByRole('button', { name: /Create draft/i }))

    await waitFor(() => {
      expect(postCalls.length).toBe(1)
    })
    expect(postCalls[0].body.milestones).toHaveLength(2)
    expect(postCalls[0].body.milestones[0]).toMatchObject({
      description: 'Discovery',
      amount_cents: 200000,
    })
    expect(postCalls[0].body.milestones[1]).toMatchObject({
      description: 'Implementation',
      amount_cents: 300000,
    })
  })
})
