// src/admin/CompanyBranding.test.jsx
//
// Smoke coverage for the Phase 6-D-3 frontend (Section 113) admin
// branding page. Strategy mirrors CompaniesList.test.jsx: mock
// @/lib/api for the initial GET, stub global fetch for the multipart
// upload, render the component inside a MemoryRouter with a matching
// route definition so useParams resolves the :id segment.

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import CompanyBranding from './CompanyBranding.jsx'

// --- Mock api (initial GET) -----------------------------------------------
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

// --- Stub URL.createObjectURL / revokeObjectURL (jsdom lacks them) --------
beforeEach(() => {
  nextApiResponse = undefined
  nextApiError = undefined
  if (!URL.createObjectURL) {
    URL.createObjectURL = vi.fn(() => 'blob:mock-url')
    URL.revokeObjectURL = vi.fn()
  } else {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  }
})

afterEach(() => {
  vi.restoreAllMocks()
})

// --- Fixtures -------------------------------------------------------------
// Section 116 (May 24, 2026) — fixtures include both `subscribed_seats` (new
// canonical, from subscriptions table via super_admin.js LEFT JOIN refactor)
// and `max_users` (legacy alias from Section 114, kept for backward-compat
// during transition window). The component prefers subscribed_seats and falls
// back to max_users when only the legacy field is present.
const BELOW_CAP_COMPANY = {
  company_id: 42,
  company_code: 'acme',
  name: 'Acme Mechanical',
  plan: 'PRO',
  status: 'ACTIVE',
  brand_color: '#16a34a',
  brand_logo_url: null,
  subscribed_seats: 25,
  max_users: 25,
  current_users: 7,
  current_bracket_label: '21-35',
  current_unit_price_cents: 2300,
  subscription_status: 'ACTIVE',
  subscription_plan_type: 'MONTHLY',
}

const AT_CAP_COMPANY = {
  ...BELOW_CAP_COMPANY,
  subscribed_seats: 5,
  max_users: 5,
  current_users: 5,
  plan: 'BASIC',
  current_bracket_label: '1-5',
  current_unit_price_cents: 2700,
}

// --- Render helper --------------------------------------------------------
function renderAt(id) {
  return render(
    <MemoryRouter initialEntries={[`/companies/${id}/branding`]}>
      <Routes>
        <Route path="/companies/:id/branding" element={<CompanyBranding />} />
        {/* Stub destinations for the back / cancel buttons so navigation
            doesn't blow up the test renderer. */}
        <Route path="/" element={<div>Home</div>} />
      </Routes>
    </MemoryRouter>
  )
}

// =========================================================================
// Render lifecycle
// =========================================================================

describe('CompanyBranding — render lifecycle', () => {
  test('shows loading then renders form + seat usage', async () => {
    nextApiResponse = { ok: true, company: BELOW_CAP_COMPANY, admins: [] }
    renderAt(42)

    expect(screen.getByText(/Loading company/i)).toBeInTheDocument()

    // Heading appears once the GET resolves
    await waitFor(() => {
      expect(screen.getByText(/Branding · Acme Mechanical/i)).toBeInTheDocument()
    })

    // Seat counter rendered from current_users / max_users. The visual
    // layout is `7 / 25` where the separator is a styled <span>, so the
    // <p>'s direct text content is "7   25" — testing-library's
    // default text matcher won't match the joined string via a plain
    // regex (text broken up by an element). Use a function matcher that
    // looks at the full textContent (descendants included) of the <p>.
    expect(
      screen.getByText((_content, element) => {
        if (!element || element.tagName !== 'P') return false
        const normalized = (element.textContent || '').replace(/\s+/g, ' ').trim()
        return normalized === '7 / 25'
      })
    ).toBeInTheDocument()
    // Plan visible
    expect(screen.getByText('PRO')).toBeInTheDocument()
  })

  test('shows error banner when GET rejects', async () => {
    nextApiError = Object.assign(new Error('HTTP 404'), {
      response: { status: 404, data: { ok: false, error: 'COMPANY_NOT_FOUND' } },
    })
    renderAt(999)

    await waitFor(() => {
      expect(screen.getByText(/Couldn't load company/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/Company not found/i)).toBeInTheDocument()
  })

  test('at-cap company shows amber capacity warning', async () => {
    nextApiResponse = { ok: true, company: AT_CAP_COMPANY, admins: [] }
    renderAt(42)

    await waitFor(() => {
      expect(screen.getByText(/Branding · Acme/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/At capacity/i)).toBeInTheDocument()
    expect(screen.getByText(/new invites will be rejected with HTTP 402/i)).toBeInTheDocument()
  })
})

// =========================================================================
// Form interactions
// =========================================================================

describe('CompanyBranding — form interactions', () => {
  test('client-side validation: invalid hex color shows error', async () => {
    nextApiResponse = { ok: true, company: BELOW_CAP_COMPANY, admins: [] }
    const user = userEvent.setup()
    renderAt(42)

    await waitFor(() =>
      expect(screen.getByText(/Branding · Acme/i)).toBeInTheDocument()
    )

    const hexInput = screen.getByLabelText(/Brand color hex value/i)
    await user.clear(hexInput)
    await user.type(hexInput, '#bogus')

    expect(screen.getByText(/Invalid hex/i)).toBeInTheDocument()
  })

  test('typing a valid hex without leading # auto-prefixes it', async () => {
    nextApiResponse = { ok: true, company: BELOW_CAP_COMPANY, admins: [] }
    const user = userEvent.setup()
    renderAt(42)

    await waitFor(() =>
      expect(screen.getByText(/Branding · Acme/i)).toBeInTheDocument()
    )

    const hexInput = screen.getByLabelText(/Brand color hex value/i)
    await user.clear(hexInput)
    await user.type(hexInput, 'ff0066')

    expect(hexInput.value).toBe('#ff0066')
  })

  test('submit posts multipart FormData to /api/super/companies/:id/branding', async () => {
    nextApiResponse = { ok: true, company: BELOW_CAP_COMPANY, admins: [] }
    const user = userEvent.setup()

    // Mock fetch — return a success body shape mirroring the route.
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          company: { ...BELOW_CAP_COMPANY, brand_color: '#ff0066' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )
    vi.stubGlobal('fetch', fetchMock)

    renderAt(42)
    await waitFor(() =>
      expect(screen.getByText(/Branding · Acme/i)).toBeInTheDocument()
    )

    // Change the color so the form has a real diff vs the loaded value.
    const hexInput = screen.getByLabelText(/Brand color hex value/i)
    await user.clear(hexInput)
    await user.type(hexInput, '#ff0066')

    const submit = screen.getByRole('button', { name: /save branding/i })
    await user.click(submit)

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [calledUrl, calledInit] = fetchMock.mock.calls[0]
    expect(calledUrl).toBe('/api/super/companies/42/branding')
    expect(calledInit.method).toBe('POST')
    expect(calledInit.credentials).toBe('include')
    expect(calledInit.headers['X-Auth-Channel']).toBe('cookie')
    // Body is FormData with the brand_color field
    expect(calledInit.body).toBeInstanceOf(FormData)
    expect(calledInit.body.get('brand_color')).toBe('#ff0066')

    // Success message appears
    await waitFor(() => {
      expect(screen.getByText(/Branding saved/i)).toBeInTheDocument()
    })
  })

  test('server 402 USER_LIMIT_REACHED surfaces as bilingual error', async () => {
    nextApiResponse = { ok: true, company: BELOW_CAP_COMPANY, admins: [] }
    const user = userEvent.setup()

    // Backend shape per routes/invite_employee.js Section 116 enforcement
    // (Phase 6-D-4 PR 2 refactor) — message_en + message_fr are populated
    // with live counts, and the CompanyBranding code prefers them over the
    // static dict. Response includes BOTH subscribed_seats (canonical) and
    // max_users (legacy alias from Section 114) for backward-compat.
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: false,
          error: 'USER_LIMIT_REACHED',
          subscribed_seats: 5,
          max_users: 5,
          current_users: 5,
          message_en: 'Seat limit reached (5/5). Please upgrade your plan.',
          message_fr: 'Limite atteinte (5/5). Veuillez mettre à niveau votre plan.',
        }),
        { status: 402, headers: { 'Content-Type': 'application/json' } }
      )
    )
    vi.stubGlobal('fetch', fetchMock)

    renderAt(42)
    await waitFor(() =>
      expect(screen.getByText(/Branding · Acme/i)).toBeInTheDocument()
    )

    const hexInput = screen.getByLabelText(/Brand color hex value/i)
    await user.clear(hexInput)
    await user.type(hexInput, '#abcdef')

    const submit = screen.getByRole('button', { name: /save branding/i })
    await user.click(submit)

    await waitFor(() => {
      expect(screen.getByText(/seat limit reached/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/Limite atteinte/i)).toBeInTheDocument()
  })

  test('SPACES_NOT_CONFIGURED renders the bucket-not-activated message', async () => {
    nextApiResponse = { ok: true, company: BELOW_CAP_COMPANY, admins: [] }
    const user = userEvent.setup()

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: false,
          error: 'SPACES_NOT_CONFIGURED',
          message: 'DO Spaces credentials/bucket are not configured on this server.',
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    )
    vi.stubGlobal('fetch', fetchMock)

    renderAt(42)
    await waitFor(() =>
      expect(screen.getByText(/Branding · Acme/i)).toBeInTheDocument()
    )

    const hexInput = screen.getByLabelText(/Brand color hex value/i)
    await user.clear(hexInput)
    await user.type(hexInput, '#abcdef')

    await user.click(screen.getByRole('button', { name: /save branding/i }))

    await waitFor(() => {
      expect(screen.getByText(/storage bucket has not been activated/i)).toBeInTheDocument()
    })
  })
})

// =========================================================================
// Upgrade link
// =========================================================================

describe('CompanyBranding — upgrade mailto link', () => {
  test('upgrade button builds a mailto with company details', async () => {
    nextApiResponse = { ok: true, company: BELOW_CAP_COMPANY, admins: [] }
    renderAt(42)

    await waitFor(() =>
      expect(screen.getByText(/Branding · Acme/i)).toBeInTheDocument()
    )

    const link = screen.getByRole('link', { name: /upgrade plan/i })
    expect(link).toHaveAttribute('href', expect.stringContaining('mailto:billing@constrai.ca'))
    expect(link.getAttribute('href')).toMatch(/subject=/)
    expect(link.getAttribute('href')).toMatch(/Acme/)
  })
})
