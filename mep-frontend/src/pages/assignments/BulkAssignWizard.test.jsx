// src/pages/assignments/BulkAssignWizard.test.jsx
//
// Section 131 — RTL smoke for the bulk-assign wizard (sequential
// questions → preview with allowance totals → confirm).

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k, o) => {
      if (o && o.count != null) return `${k}:${o.count}`
      if (o && o.amount != null) return `${k}:${o.amount}`
      return k
    },
    i18n: { language: 'en' },
  }),
}))

const apiPost = vi.fn()
vi.mock('@/lib/api', () => ({
  default: { post: (...a) => apiPost(...a) },
}))

import BulkAssignWizard from './BulkAssignWizard.jsx'

const PROJECTS = [{ id: 7, project_code: 'PROJ-7', project_name: 'Tower' }]

function renderWizard() {
  const onClose = vi.fn()
  const onConfirmed = vi.fn()
  render(<BulkAssignWizard projects={PROJECTS} onClose={onClose} onConfirmed={onConfirmed} />)
  return { onClose, onConfirmed }
}

describe('BulkAssignWizard', () => {
  beforeEach(() => {
    apiPost.mockReset()
  })

  test('walks the three questions and generates with the chosen options', async () => {
    apiPost.mockResolvedValue({
      data: {
        target_date: '2027-06-15',
        suggestions: [
          {
            project_id: 7, project_code: 'PROJ-7', project_name: 'Tower',
            shift_start: '06:00', shift_end: '14:30', today_count: 2,
            allowance_total_cents: 5389,
            foremen: {},
            employees: [
              { employee_id: 1, employee_name: 'Sam', trade_code: 'ELECTRICAL', type: 'carry_over', distance_km: 120, allowance_cents: 5389 },
              { employee_id: null, trade_code: 'PLUMBING', type: 'gap', replacing: 'Bob', distance_km: null, allowance_cents: null },
            ],
          },
        ],
        totals: { headcount: 1, allowance_total_cents: 5389 },
      },
    })

    renderWizard()
    // Q1 (date defaults to tomorrow) → next
    expect(screen.getByText('assignments.wizard.q1')).toBeInTheDocument()
    fireEvent.click(screen.getByText('assignments.wizard.next'))
    // Q2 — pick FULL → next
    expect(screen.getByText('assignments.wizard.q2')).toBeInTheDocument()
    fireEvent.click(screen.getByText('assignments.wizard.basis.full'))
    fireEvent.click(screen.getByText('assignments.wizard.next'))
    // Q3 — toggle gaps OFF, generate
    expect(screen.getByText('assignments.wizard.q3')).toBeInTheDocument()
    fireEvent.click(screen.getByText('assignments.wizard.opt.gaps'))
    fireEvent.click(screen.getByText('assignments.wizard.generate'))

    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1))
    const [url, body] = apiPost.mock.calls[0]
    expect(url).toBe('/assignments/auto-suggest')
    expect(body.mode).toBe('FULL')
    expect(body.optimize_distance).toBe(true)
    expect(body.fill_gaps).toBe(false)

    // Preview shows the carry-over row, the gap, and the allowance banner.
    await waitFor(() => expect(screen.getByText('Sam')).toBeInTheDocument())
    expect(screen.getByText('assignments.wizard.gap')).toBeInTheDocument()
    expect(screen.getByText('assignments.wizard.allowanceTotal:$53.89')).toBeInTheDocument()
  })

  test('REPEAT basis skips the optimizations question (S131.7)', () => {
    apiPost.mockResolvedValue({ data: { target_date: 'x', suggestions: [], totals: { headcount: 0, allowance_total_cents: 0 } } })
    renderWizard()
    fireEvent.click(screen.getByText('assignments.wizard.next')) // → Q2
    fireEvent.click(screen.getByText('assignments.wizard.basis.repeat'))
    // No "Next" anymore — Generate appears directly at Q2.
    expect(screen.queryByText('assignments.wizard.next')).not.toBeInTheDocument()
    expect(screen.getByText('assignments.wizard.generate')).toBeInTheDocument()
  })

  // Section 131.12 — already_assigned rows are informational: badge shown,
  // no remove button, excluded from the kept count and the confirm payload.
  test('already_assigned rows are excluded from count and confirm payload', async () => {
    apiPost.mockResolvedValueOnce({
      data: {
        target_date: '2027-06-15',
        suggestions: [
          {
            project_id: 7, project_code: 'PROJ-7', project_name: 'Tower',
            shift_start: '06:00', shift_end: '14:30', today_count: 2,
            allowance_total_cents: 0,
            foremen: {},
            employees: [
              { employee_id: 1, employee_name: 'Sam', trade_code: 'ELECTRICAL', type: 'already_assigned', distance_km: 120, allowance_cents: 5389 },
              { employee_id: 2, employee_name: 'Lea', trade_code: 'PLUMBING', type: 'new', distance_km: 10, allowance_cents: 0 },
            ],
          },
        ],
        totals: { headcount: 1, allowance_total_cents: 0 },
      },
    })

    renderWizard()
    fireEvent.click(screen.getByText('assignments.wizard.next')) // → Q2
    fireEvent.click(screen.getByText('assignments.wizard.basis.repeat'))
    fireEvent.click(screen.getByText('assignments.wizard.generate'))

    await waitFor(() => expect(screen.getByText('Sam')).toBeInTheDocument())
    expect(screen.getByText('assignments.wizard.type.already_assigned')).toBeInTheDocument()
    // Only Lea counts toward the plan.
    expect(screen.getByText('assignments.wizard.keptCount:1')).toBeInTheDocument()
    expect(screen.getByText('assignments.wizard.confirm:1')).toBeInTheDocument()

    apiPost.mockResolvedValueOnce({ data: { assignments_created: 1, assignments_skipped: 0, emails_sent: 0 } })
    fireEvent.click(screen.getByText('assignments.wizard.confirm:1'))
    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(2))
    const [, confirmBody] = apiPost.mock.calls[1]
    const sentEmployees = confirmBody.confirmed.flatMap(p => p.employees)
    expect(sentEmployees.map(e => e.employee_id)).toEqual([2]) // Sam (already_assigned) excluded
  })

  // Section 131.12 — skipped count surfaces on the done screen.
  test('done screen shows the skipped line when assignments_skipped > 0', async () => {
    apiPost
      .mockResolvedValueOnce({
        data: {
          target_date: '2027-06-15',
          suggestions: [
            {
              project_id: 7, project_code: 'PROJ-7', project_name: 'Tower',
              shift_start: '06:00', shift_end: '14:30', today_count: 1,
              allowance_total_cents: 0, foremen: {},
              employees: [
                { employee_id: 3, employee_name: 'Zed', trade_code: 'ELECTRICAL', type: 'carry_over', distance_km: 5, allowance_cents: 0 },
              ],
            },
          ],
          totals: { headcount: 1, allowance_total_cents: 0 },
        },
      })
      .mockResolvedValueOnce({ data: { assignments_created: 0, assignments_skipped: 1, emails_sent: 0 } })

    renderWizard()
    fireEvent.click(screen.getByText('assignments.wizard.next'))
    fireEvent.click(screen.getByText('assignments.wizard.basis.repeat'))
    fireEvent.click(screen.getByText('assignments.wizard.generate'))
    await waitFor(() => expect(screen.getByText('Zed')).toBeInTheDocument())
    fireEvent.click(screen.getByText('assignments.wizard.confirm:1'))
    await waitFor(() => expect(screen.getByText('assignments.wizard.doneSkipped:1')).toBeInTheDocument())
  })

  test('PROJECT basis requires picking a project before Next enables', () => {
    renderWizard()
    fireEvent.click(screen.getByText('assignments.wizard.next')) // → Q2
    fireEvent.click(screen.getByText('assignments.wizard.basis.project'))
    const next = screen.getByText('assignments.wizard.next')
    expect(next).toBeDisabled()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '7' } })
    expect(screen.getByText('assignments.wizard.next')).not.toBeDisabled()
  })
})
