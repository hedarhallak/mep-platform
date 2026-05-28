// src/pages/billing/InvoicesPage.test.jsx
//
// Phase 6-D-5 PR 2 — Vitest + RTL smoke for the customer-facing Invoices
// list. Mocks @/lib/api with vi.hoisted() per Pitfall #52 (Vitest does NOT
// honor the Jest `mock*` prefix auto-allow). Mocks react-i18next so we
// don't need the real i18n runtime — keys resolve to a small EN dictionary
// for deterministic assertions.

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// --- Mock react-i18next BEFORE importing the component --------------------
const I18N_MAP = {
  'common.loading': 'Loading…',
  'billing.title': 'Billing & Invoices',
  'billing.subtitle': 'All invoices issued to your company',
  'billing.loadError': 'Could not load invoices',
  'billing.empty': 'No invoices yet.',
  'billing.filters.typeLabel': 'Type',
  'billing.filters.allTypes': 'All types',
  'billing.types.SUBSCRIPTION_RECURRING': 'Subscription',
  'billing.types.TRAINING': 'Training',
  'billing.types.CUSTOM_DEMAND': 'Custom work',
  'billing.types.OTHER': 'Other',
  'billing.statuses.PAID': 'Paid',
  'billing.statuses.DRAFT': 'Draft',
  'billing.statuses.APPROVED': 'Approved',
  'billing.table.invoiceNumber': 'Invoice #',
  'billing.table.type': 'Type',
  'billing.table.status': 'Status',
  'billing.table.total': 'Total',
  'billing.table.paid': 'Paid',
  'billing.table.issueDate': 'Issued',
  'billing.table.dueDate': 'Due',
  'billing.pagination.prev': 'Previous',
  'billing.pagination.next': 'Next',
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key, options) => {
      if (I18N_MAP[key] != null) return I18N_MAP[key]
      if (key === 'billing.totalCount' && options) return `${options.count} invoice(s) total`
      if (key === 'billing.pagination.showing' && options)
        return `Showing ${options.from}-${options.to} of ${options.total}`
      if (key === 'billing.pagination.pageOf' && options)
        return `Page ${options.page} of ${options.totalPages}`
      return typeof options === 'string' ? options : key
    },
  }),
}))

// --- Mock @/lib/api via vi.hoisted (Pitfall #52) --------------------------
const mockApi = vi.hoisted(() => ({
  get: vi.fn(),
}))

vi.mock('@/lib/api', () => ({
  default: mockApi,
}))

import InvoicesPage from './InvoicesPage.jsx'

// --- Fixtures -------------------------------------------------------------

const INVOICES_FIXTURE = {
  ok: true,
  invoices: [
    {
      id: 1,
      invoice_number: 'CONS-2026-0001',
      type: 'TRAINING',
      status: 'PAID',
      subtotal_cents: 80000,
      qst_cents: 7980,
      gst_cents: 4000,
      total_cents: 91980,
      amount_paid_cents: 91980,
      currency: 'CAD',
      issue_date: '2026-05-20',
      due_date: '2026-06-19',
      paid_date: '2026-05-21',
      quote_expires_at: null,
      customer_notes: null,
      created_at: '2026-05-20T12:00:00Z',
    },
    {
      id: 2,
      invoice_number: 'CONS-2026-0002',
      type: 'SUBSCRIPTION_RECURRING',
      status: 'APPROVED',
      subtotal_cents: 13500,
      qst_cents: 1347,
      gst_cents: 675,
      total_cents: 15522,
      amount_paid_cents: 0,
      currency: 'CAD',
      issue_date: '2026-05-15',
      due_date: '2026-06-14',
      paid_date: null,
      quote_expires_at: null,
      customer_notes: null,
      created_at: '2026-05-15T12:00:00Z',
    },
  ],
  pagination: { page: 1, limit: 20, total: 2, total_pages: 1 },
}

// --- Helpers --------------------------------------------------------------

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  })
  return render(
    <QueryClientProvider client={qc}>
      <InvoicesPage />
    </QueryClientProvider>
  )
}

// --- Setup / teardown -----------------------------------------------------

beforeEach(() => {
  mockApi.get.mockReset()
  mockApi.get.mockResolvedValue({ data: INVOICES_FIXTURE, status: 200, ok: true })
})

afterEach(() => {
  vi.restoreAllMocks()
})

// --- Tests ----------------------------------------------------------------

describe('<InvoicesPage />', () => {
  test('renders invoice rows from GET /admin/invoices response', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('CONS-2026-0001')).toBeInTheDocument()
    })
    expect(screen.getByText('CONS-2026-0002')).toBeInTheDocument()
    expect(screen.getByText('Training')).toBeInTheDocument()
    expect(screen.getByText('Subscription')).toBeInTheDocument()
    // Total $919.80 = 91980 cents
    expect(screen.getByText(/\$919\.80/)).toBeInTheDocument()
  })

  test('changing the type filter calls api.get with ?type= query', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getByText('CONS-2026-0001')).toBeInTheDocument())

    const select = screen.getByLabelText(/Type/i)
    await user.selectOptions(select, 'TRAINING')

    await waitFor(() => {
      // First call was with no filter; the second call (after change) carries ?type=TRAINING.
      const calls = mockApi.get.mock.calls.map((c) => c[0])
      expect(calls.some((url) => url.includes('type=TRAINING'))).toBe(true)
    })
  })

  test('renders empty state when invoices list is empty', async () => {
    mockApi.get.mockResolvedValueOnce({
      data: { ok: true, invoices: [], pagination: { page: 1, limit: 20, total: 0, total_pages: 1 } },
      status: 200,
      ok: true,
    })
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('No invoices yet.')).toBeInTheDocument()
    })
  })
})
