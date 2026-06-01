// src/admin/PaymentsPage.test.jsx
//
// Phase 6-D-6 PR 4 / Section 123 — RTL smoke coverage for the SUPER_ADMIN
// Payments page.
//
// Mirrors CustomDemandsPage.test.jsx: mock @/lib/api at file top so the
// component runs against deterministic data, then assert against the rendered
// shell. Covers loading / error / empty / populated states plus the Record
// Payment modal opening + submission.
//
// Pitfall #57: the toolbar "+ Record payment" button and the modal <h3>
// "Record payment" both match /Record payment/i. Modal-open assertions use
// getByRole('heading', ...); the submit button is matched with an exact /^…$/
// name so it never collides with the toolbar button.

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import PaymentsPage from './PaymentsPage.jsx'

function renderWithRouter(ui) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

// --- Mock api -------------------------------------------------------------
//
// The page fires two parallel GETs in load():
//   - /super/payments
//   - /super/payments/invoices
// and one POST when Record payment is submitted.
const apiResponses = {}
const apiErrors = {}
const postCalls = []

vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn((url) => {
      if (apiErrors[url]) return Promise.reject(apiErrors[url])
      return Promise.resolve({ data: apiResponses[url] || {}, status: 200 })
    }),
    post: vi.fn((url, body) => {
      postCalls.push({ url, body })
      if (apiErrors[`POST ${url}`]) return Promise.reject(apiErrors[`POST ${url}`])
      return Promise.resolve({
        data: apiResponses[`POST ${url}`] || {
          ok: true,
          payment: { amount_cents: 100000 },
          invoice: { invoice_number: 'CONS-2026-0001', status: 'PAID' },
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

const PAYMENTS_FIXTURE = {
  ok: true,
  payments: [
    {
      id: 1,
      invoice_id: 10,
      invoice_number: 'CONS-2026-9999',
      invoice_type: 'SUBSCRIPTION',
      company_id: 1,
      company_name: 'Acme Mechanical',
      company_code: 'ACME001',
      amount_cents: 15522,
      currency: 'CAD',
      method: 'BANK_TRANSFER',
      status: 'SUCCEEDED',
      is_partial: false,
      paid_at: '2026-05-28T12:00:00Z',
      external_ref: 'BANK-REF-001',
      notes: null,
      created_at: '2026-05-28T12:00:00Z',
    },
    {
      id: 2,
      invoice_id: 11,
      invoice_number: 'CONS-2026-0001',
      invoice_type: 'TRAINING',
      company_id: 1,
      company_name: 'Acme Mechanical',
      company_code: 'ACME001',
      amount_cents: 54613,
      currency: 'CAD',
      method: 'CHEQUE',
      status: 'SUCCEEDED',
      is_partial: true,
      paid_at: '2026-05-30T12:00:00Z',
      external_ref: 'CHQ-204',
      notes: null,
      created_at: '2026-05-30T12:00:00Z',
    },
  ],
}

const INVOICES_FIXTURE = {
  ok: true,
  invoices: [
    {
      id: 11,
      invoice_number: 'CONS-2026-0001',
      type: 'TRAINING',
      status: 'APPROVED',
      company_id: 1,
      company_name: 'Acme Mechanical',
      company_code: 'ACME001',
      total_cents: 109226,
      amount_paid_cents: 0,
      balance_cents: 109226,
      currency: 'CAD',
      issue_date: '2026-05-28',
    },
  ],
}

// ---------------------------------------------------------------------------
// Render lifecycle
// ---------------------------------------------------------------------------

describe('PaymentsPage — render lifecycle', () => {
  test('shows Loading then renders the table from the API', async () => {
    apiResponses['/super/payments'] = PAYMENTS_FIXTURE
    apiResponses['/super/payments/invoices'] = INVOICES_FIXTURE
    renderWithRouter(<PaymentsPage />)

    expect(screen.getByText(/Loading/i)).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('CONS-2026-9999')).toBeInTheDocument()
    })
    expect(screen.getByText('CONS-2026-0001')).toBeInTheDocument()
    expect(screen.getByText('BANK-REF-001')).toBeInTheDocument()
    expect(screen.getByText('CHQ-204')).toBeInTheDocument()
    // method labels render — scope to the table because the page subtitle also
    // contains the words "bank transfer, cheque, cash" (collision like #57).
    const table = screen.getByRole('table')
    expect(within(table).getByText(/Bank transfer/i)).toBeInTheDocument()
    expect(within(table).getByText(/Cheque/i)).toBeInTheDocument()
    // partial badge on the second payment
    expect(within(table).getByText(/\(partial\)/i)).toBeInTheDocument()
  })

  test('shows error banner when the payments API rejects', async () => {
    apiErrors['/super/payments'] = Object.assign(new Error('boom'), {
      response: { status: 500, data: { ok: false, error: 'SERVER_ERROR' } },
    })
    apiResponses['/super/payments/invoices'] = INVOICES_FIXTURE
    renderWithRouter(<PaymentsPage />)

    await waitFor(() => {
      expect(screen.getByText(/Failed to load/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/SERVER_ERROR/i)).toBeInTheDocument()
  })

  test('shows empty-state copy when the API returns zero payments', async () => {
    apiResponses['/super/payments'] = { ok: true, payments: [] }
    apiResponses['/super/payments/invoices'] = INVOICES_FIXTURE
    renderWithRouter(<PaymentsPage />)

    await waitFor(() => {
      expect(screen.getByText(/No payments recorded yet/i)).toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// Record Payment modal
// ---------------------------------------------------------------------------

describe('PaymentsPage — record modal', () => {
  test('opens modal and POSTs to /super/payments/record on submit', async () => {
    apiResponses['/super/payments'] = { ok: true, payments: [] }
    apiResponses['/super/payments/invoices'] = INVOICES_FIXTURE
    apiResponses['POST /super/payments/record'] = {
      ok: true,
      payment: { amount_cents: 109226 },
      invoice: { invoice_number: 'CONS-2026-0001', status: 'PAID' },
    }

    const user = userEvent.setup()
    renderWithRouter(<PaymentsPage />)

    await waitFor(() => {
      expect(screen.getByText(/No payments recorded yet/i)).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /\+ Record payment/i }))

    // Modal header (h3). Use role+name to avoid colliding with the
    // "+ Record payment" toolbar button which also matches the text regex
    // (Pitfall #57).
    expect(
      screen.getByRole('heading', { name: /Record payment/i })
    ).toBeInTheDocument()

    // Amount field (placeholder "0.00"); invoice select defaults to the only
    // payable invoice, method defaults to BANK_TRANSFER.
    await user.type(screen.getByPlaceholderText('0.00'), '1092.26')

    // Submit — exact name so it never matches the "+ Record payment" toolbar btn
    await user.click(screen.getByRole('button', { name: /^Record payment$/i }))

    await waitFor(() => {
      expect(postCalls.length).toBe(1)
    })
    expect(postCalls[0].url).toBe('/super/payments/record')
    expect(postCalls[0].body.invoice_id).toBe(11)
    expect(postCalls[0].body.amount_cents).toBe(109226)
    expect(postCalls[0].body.method).toBe('BANK_TRANSFER')

    // Flash banner with the resulting invoice status
    await waitFor(() => {
      expect(screen.getByText(/CONS-2026-0001/i)).toBeInTheDocument()
    })
  })

  test('Cancel closes the modal without POSTing', async () => {
    apiResponses['/super/payments'] = { ok: true, payments: [] }
    apiResponses['/super/payments/invoices'] = INVOICES_FIXTURE

    const user = userEvent.setup()
    renderWithRouter(<PaymentsPage />)

    await waitFor(() => {
      expect(screen.getByText(/No payments recorded yet/i)).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /\+ Record payment/i }))
    expect(
      screen.getByRole('heading', { name: /Record payment/i })
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Cancel/i }))

    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: /Record payment/i })
      ).not.toBeInTheDocument()
    })
    expect(postCalls.length).toBe(0)
  })
})
