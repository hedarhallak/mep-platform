// src/pages/assignments/ForemanRequestPage.test.jsx
// Method 4 (§147.5) foreman submit screen — RTL smoke.

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k, opts) => (opts && opts.count != null ? `${k}:${opts.count}` : k),
    i18n: { language: 'en' },
  }),
}))

const apiGet = vi.fn()
const apiPost = vi.fn()
vi.mock('@/lib/api', () => ({
  default: { get: (...a) => apiGet(...a), post: (...a) => apiPost(...a) },
}))

import ForemanRequestPage from './ForemanRequestPage.jsx'

function mockData() {
  apiGet.mockImplementation((url) => {
    if (url === '/hub/my-projects')
      return Promise.resolve({ data: { projects: [{ id: 7, project_code: 'P-7', project_name: 'Tower' }] } })
    if (url === '/hub/workers')
      return Promise.resolve({
        data: { workers: [{ id: 1, first_name: 'Ali', last_name: 'H', trade_name: 'PLUMBING' }] },
      })
    return Promise.resolve({ data: {} })
  })
}

describe('ForemanRequestPage', () => {
  beforeEach(() => {
    apiGet.mockReset()
    apiPost.mockReset()
  })

  test('loads my-projects + workers on mount', async () => {
    mockData()
    render(<ForemanRequestPage />)
    await waitFor(() => expect(screen.getByText('Ali H')).toBeInTheDocument())
    expect(apiGet).toHaveBeenCalledWith('/hub/my-projects')
    expect(apiGet).toHaveBeenCalledWith('/hub/workers')
  })

  test('submitting posts one PENDING request per chosen member', async () => {
    mockData()
    apiPost.mockResolvedValue({ data: { ok: true } })
    render(<ForemanRequestPage />)
    await waitFor(() => expect(screen.getByText('Ali H')).toBeInTheDocument())

    // Pick project
    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: '7' } })
    // Pick the worker (click the row in the member selector)
    fireEvent.click(screen.getByText('Ali H'))

    // Submit
    fireEvent.click(screen.getByText('foremanRequest.submit:1'))

    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1))
    const [url, body] = apiPost.mock.calls[0]
    expect(url).toBe('/assignments/requests')
    expect(body).toMatchObject({ project_id: 7, employee_id: 1, assignment_role: 'WORKER' })
    expect(body.start_date).toBe(body.end_date)
  })
})
