// src/pages/subscription/SubscriptionPage.test.jsx
//
// Phase 6-D-5 PR 1 — smoke coverage for the customer-facing Subscription
// page. Mocks @/lib/api for the GET /admin/subscription read and the
// 3 POST request endpoints (seat-request / cancel-request /
// plan-upgrade-request). Verifies:
//   - the page renders the plan / bracket / status / seat usage from the
//     GET response
//   - clicking "Request seat change" opens the inline form
//   - submitting the form calls api.post with the correct body shape
//     and the returned mailto_url is assigned to window.location.href
//
// Pattern mirrors CompanyBranding.test.jsx + i18n in src/test/rtl_smoke.test.jsx.

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// --- Mock react-i18next BEFORE importing the component --------------------
//
// Returning the key (or a known English value where assertions need it)
// keeps tests deterministic and avoids loading the real i18next runtime.
const I18N_MAP = {
  'common.loading': 'Loading…',
  'common.cancel': 'Cancel',
  'subscription.title': 'Subscription',
  'subscription.loadError': 'Could not load subscription details',
  'subscription.currentPlan': 'Current plan',
  'subscription.seatUsage': 'Seat usage',
  'subscription.seatsUsedOfSubscribed': 'seats used',
  'subscription.atCapacity': 'At capacity',
  'subscription.withinCapacity': 'Within capacity',
  'subscription.nextBillingAt': 'Next billing',
  'subscription.trialEndsAt': 'Trial ends',
  'subscription.requestChanges': 'Request changes',
  'subscription.requestExplanation': 'Submit a request below.',
  'subscription.actions.requestSeatChange': 'Request seat change',
  'subscription.actions.requestPlanUpgrade': 'Request plan upgrade',
  'subscription.actions.requestCancel': 'Request cancellation',
  'subscription.forms.newSeatCount': 'New seat count',
  'subscription.forms.reasonOptional': 'Reason (optional)',
  'subscription.forms.submitAndEmail': 'Submit + open email',
  'subscription.forms.cancelImmediately': 'Cancel immediately',
  'subscription.forms.targetPlan': 'Target plan',
  'subscription.plans.MONTHLY': 'Monthly',
  'subscription.plans.ANNUAL': 'Annual',
  'subscription.plans.ENTERPRISE': 'Enterprise',
  'subscription.statuses.ACTIVE': 'Active',
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key, options) => {
      if (I18N_MAP[key] != null) return I18N_MAP[key]
      // bracketLine has interpolation { label, price }
      if (key === 'subscription.bracketLine' && options) {
        return `${options.label} (${options.price}/seat/month)`
      }
      if (key === 'subscription.seatsRemainingHelp' && options) {
        return `${options.count} seats remaining`
      }
      return typeof options === 'string' ? options : key
    },
  }),
}))

import SubscriptionPage from './SubscriptionPage.jsx'

// --- Mock @/lib/api -------------------------------------------------------

const apiMock = {
  get: vi.fn(),
  post: vi.fn(),
}

vi.mock('@/lib/api', () => ({
  default: apiMock,
}))

// --- Fixture --------------------------------------------------------------

const SUBSCRIPTION_FIXTURE = {
  ok: true,
  subscription: {
    id: 1,
    status: 'ACTIVE',
    plan_type: 'MONTHLY',
    subscribed_seats: 10,
    current_unit_price_cents: 2500,
    current_bracket_label: '6-10',
    next_billing_at: '2026-06-15',
    trial_ends_at: null,
    cancel_at_period_end: false,
  },
  usage: {
    current_employees: 7,
    seats_remaining: 3,
  },
  company: {
    id: 42,
    name: 'Acme Mechanical',
    code: 'acme',
  },
}

// --- Render helper --------------------------------------------------------

function renderPage() {
  // Disable retry + caching so failures surface immediately
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  })
  return render(
    <QueryClientProvider client={qc}>
      <SubscriptionPage />
    </QueryClientProvider>
  )
}

// --- Setup / teardown -----------------------------------------------------

beforeEach(() => {
  apiMock.get.mockReset()
  apiMock.post.mockReset()
  apiMock.get.mockResolvedValue({ data: SUBSCRIPTION_FIXTURE, status: 200, ok: true })
})

afterEach(() => {
  vi.restoreAllMocks()
})

// --- Tests ---------------------------------------------------------------

describe('<SubscriptionPage />', () => {
  test('renders plan + bracket + seat usage + company name from GET response', async () => {
    renderPage()

    // Company name in header
    await waitFor(() => {
      expect(screen.getByText('Acme Mechanical')).toBeInTheDocument()
    })

    // Bracket line: "6-10 ($25.00/seat/month)" — exact format depends on locale.
    // Just assert both fragments are present.
    expect(screen.getByText(/6-10/)).toBeInTheDocument()
    expect(screen.getByText(/\$25\.00/)).toBeInTheDocument()

    // Seat usage 7 / 10
    expect(screen.getByText('7')).toBeInTheDocument()
    expect(screen.getByText('10')).toBeInTheDocument()
  })

  test('clicking "Request seat change" reveals the seat-change form', async () => {
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => expect(screen.getByText('Acme Mechanical')).toBeInTheDocument())

    // Initially the form is hidden — clicking the action button reveals it.
    const trigger = await screen.findByRole('button', { name: /Request seat change/i })
    await user.click(trigger)

    // After click the "Submit + open email" button appears (form is rendered)
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Submit \+ open email/i })
      ).toBeInTheDocument()
    })
  })

  test('submitting seat-change form calls POST and follows mailto_url', async () => {
    const user = userEvent.setup()

    // Stub window.location.href so the navigation doesn't actually happen.
    const hrefSetter = vi.fn()
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, set href(v) { hrefSetter(v) } },
    })

    apiMock.post.mockResolvedValue({
      data: {
        ok: true,
        request_audit_id: 999,
        mailto_url: 'mailto:billing@constrai.ca?subject=Seat%20change',
      },
      status: 200,
      ok: true,
    })

    renderPage()
    await waitFor(() => expect(screen.getByText('Acme Mechanical')).toBeInTheDocument())

    // Open the seat-change form
    await user.click(
      await screen.findByRole('button', { name: /Request seat change/i })
    )

    // Find the seat count input and bump it
    const seatInput = await screen.findByLabelText(/New seat count/i)
    await user.clear(seatInput)
    await user.type(seatInput, '15')

    // Submit
    await user.click(
      screen.getByRole('button', { name: /Submit \+ open email/i })
    )

    await waitFor(() => {
      expect(apiMock.post).toHaveBeenCalledWith('/admin/subscription/seat-request', {
        requested_seats: 15,
        reason: undefined,
      })
    })

    // mailto_url assigned to window.location.href
    expect(hrefSetter).toHaveBeenCalledWith(
      'mailto:billing@constrai.ca?subject=Seat%20change'
    )
  })
})
