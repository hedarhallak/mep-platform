// src/pages/SettingsPage.test.jsx
//
// Section 134.4 — RTL smoke for the tenant company Settings page.

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k) => k, i18n: { language: 'en' } }),
}))

const apiGet = vi.fn()
const apiPatch = vi.fn()
vi.mock('@/lib/api', () => ({
  default: { get: (...a) => apiGet(...a), patch: (...a) => apiPatch(...a) },
}))

import SettingsPage from './SettingsPage.jsx'

const SETTINGS = {
  name: 'MEP Construction', company_code: 'mep', plan: 'BASIC', status: 'ACTIVE',
  phone: '514-000-0000', procurement_email: 'buy@mep.ca', address: '1 Rue A',
  default_shift_start: '06:00', default_shift_end: '14:30',
}

describe('SettingsPage', () => {
  beforeEach(() => {
    apiGet.mockReset()
    apiPatch.mockReset()
    apiGet.mockResolvedValue({ data: { settings: SETTINGS } })
  })

  test('loads and shows company identity + editable fields', async () => {
    render(<SettingsPage />)
    await waitFor(() => expect(screen.getByText('MEP Construction')).toBeInTheDocument())
    expect(apiGet).toHaveBeenCalledWith('/company/settings')
    expect(screen.getByDisplayValue('06:00')).toBeInTheDocument()
    expect(screen.getByDisplayValue('514-000-0000')).toBeInTheDocument()
  })

  test('saves edited fields via PATCH', async () => {
    apiPatch.mockResolvedValue({ data: { settings: { ...SETTINGS, default_shift_start: '07:00' } } })
    render(<SettingsPage />)
    await waitFor(() => expect(screen.getByDisplayValue('06:00')).toBeInTheDocument())

    fireEvent.change(screen.getByDisplayValue('06:00'), { target: { value: '07:00' } })
    fireEvent.click(screen.getByText('settings.save'))

    await waitFor(() => expect(apiPatch).toHaveBeenCalledTimes(1))
    const [url, body] = apiPatch.mock.calls[0]
    expect(url).toBe('/company/settings')
    expect(body.default_shift_start).toBe('07:00')
    await waitFor(() => expect(screen.getByText('settings.saved')).toBeInTheDocument())
  })
})
