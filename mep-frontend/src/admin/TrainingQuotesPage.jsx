// src/admin/TrainingQuotesPage.jsx
//
// Phase 6-D-6 PR 2 / Section 120 — SUPER_ADMIN Training Quotes UI.
//
// Cross-company list of TRAINING-type invoices + a Create form that wraps
// POST /api/super/training/quotes (Phase 6-D-4 PR 5). Per row, DRAFT quotes
// expose a "Send" action wrapping POST /api/super/training/quotes/:id/send
// which transitions DRAFT → QUOTE_SENT and dispatches the Resend email.
//
// Data source: GET /api/super/training/quotes returns all TRAINING invoices
// across tenants with company_name joined in. Cross-company visibility is
// safe because the route is gated by superAdmin middleware.

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../lib/api'
import AdminLogoutButton from './AdminLogoutButton.jsx'

const ROLE_CATALOG = [
  { code: 'ADMIN',           label: 'Admin' },
  { code: 'PROJECT_MANAGER', label: 'Project manager' },
  { code: 'FOREMAN',         label: 'Foreman' },
  { code: 'WORKER',          label: 'Worker' },
]

function formatCents(cents) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`
}

function formatDate(iso) {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return '—'
    return d.toISOString().slice(0, 10)
  } catch {
    return '—'
  }
}

function statusBadgeClass(status) {
  switch (status) {
    case 'PAID':
      return 'bg-emerald-900/40 text-emerald-300 border-emerald-700/50'
    case 'PARTIAL_PAID':
      return 'bg-amber-900/40 text-amber-300 border-amber-700/50'
    case 'OVERDUE':
      return 'bg-rose-900/40 text-rose-300 border-rose-700/50'
    case 'APPROVED':
      return 'bg-sky-900/40 text-sky-300 border-sky-700/50'
    case 'QUOTE_SENT':
      return 'bg-indigo-900/40 text-indigo-300 border-indigo-700/50'
    case 'DRAFT':
      return 'bg-slate-800 text-slate-300 border-slate-600'
    case 'VOID':
    case 'REFUNDED':
      return 'bg-slate-800 text-slate-500 border-slate-700 line-through'
    default:
      return 'bg-slate-800 text-slate-300 border-slate-600'
  }
}

// ─── Create form (modal) ────────────────────────────────────────────────

function CreateQuoteModal({ companies, onClose, onCreated }) {
  const [companyId, setCompanyId] = useState(companies[0]?.company_id || '')
  const [distanceKm, setDistanceKm] = useState(50)
  const [trainingDays, setTrainingDays] = useState(1)
  const [trainees, setTrainees] = useState(
    ROLE_CATALOG.map((r) => ({ role: r.code, label: r.label, count: 0 }))
  )
  const [flightRequired, setFlightRequired] = useState(false)
  const [flightCost, setFlightCost] = useState('')
  const [customNotes, setCustomNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  function setRoleCount(role, count) {
    setTrainees((prev) => prev.map((t) => (t.role === role ? { ...t, count } : t)))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const filtered = trainees
        .filter((t) => Number(t.count) > 0)
        .map((t) => ({ role: t.role, count: Number(t.count) }))
      if (filtered.length === 0) {
        throw new Error('Add at least one trainee')
      }
      const body = {
        company_id: Number(companyId),
        trainees: filtered,
        distance_km: Number(distanceKm),
        training_days: Number(trainingDays),
      }
      if (flightRequired && flightCost) {
        body.flight = {
          required: true,
          actual_cost_cents: Math.round(Number(flightCost) * 100),
        }
      }
      if (customNotes.trim()) body.customer_notes = customNotes.trim()
      const r = await api.post('/super/training/quotes', body)
      if (!r.data?.ok) throw new Error(r.data?.error || 'Create failed')
      onCreated(r.data.invoice)
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'SERVER_ERROR')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-950/80 flex items-center justify-center z-50 p-6 overflow-y-auto">
      <form
        onSubmit={handleSubmit}
        className="max-w-2xl w-full bg-slate-900 border border-slate-700 rounded-lg p-6 text-slate-200 space-y-4 my-8"
      >
        <h3 className="text-lg font-bold">New training quote</h3>

        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1">Company</label>
          <select
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            required
            className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-sm focus:outline-none focus:border-slate-500"
          >
            {companies.map((c) => (
              <option key={c.company_id} value={c.company_id}>
                {c.name} ({c.company_code})
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Distance (km)</label>
            <input
              type="number" min="0" max="10000" value={distanceKm}
              onChange={(e) => setDistanceKm(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Training days</label>
            <input
              type="number" min="1" max="60" value={trainingDays}
              onChange={(e) => setTrainingDays(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-sm"
            />
          </div>
        </div>

        <div>
          <div className="text-xs font-semibold text-slate-400 mb-2">Trainees</div>
          <div className="grid grid-cols-2 gap-2">
            {trainees.map((t) => (
              <div key={t.role} className="flex items-center gap-2">
                <label htmlFor={`role-${t.role}`} className="text-xs text-slate-300 flex-1">
                  {t.label}
                </label>
                <input
                  id={`role-${t.role}`}
                  type="number" min="0" max="500"
                  value={t.count}
                  onChange={(e) => setRoleCount(t.role, e.target.value)}
                  className="w-20 px-2 py-1 bg-slate-950 border border-slate-700 rounded text-sm text-right"
                />
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={flightRequired}
              onChange={(e) => setFlightRequired(e.target.checked)}
              className="h-4 w-4 accent-indigo-500"
            />
            Flight required (pass-through cost in CAD)
          </label>
          {flightRequired && (
            <input
              type="number" min="0" step="0.01"
              value={flightCost}
              onChange={(e) => setFlightCost(e.target.value)}
              placeholder="650.00"
              className="mt-2 w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-sm"
            />
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1">
            Customer notes (visible on the quote)
          </label>
          <textarea
            rows={2} maxLength={5000}
            value={customNotes}
            onChange={(e) => setCustomNotes(e.target.value)}
            className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-sm"
          />
        </div>

        {error && (
          <div className="text-xs text-rose-400 border border-rose-900/60 bg-rose-950/40 rounded px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button type="button" onClick={onClose}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold rounded">
            Cancel
          </button>
          <button type="submit" disabled={submitting}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded disabled:opacity-50">
            {submitting ? 'Creating…' : 'Create draft'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Main page ──────────────────────────────────────────────────────────

export default function TrainingQuotesPage() {
  const [quotes, setQuotes] = useState([])
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [creating, setCreating] = useState(false)
  const [flash, setFlash] = useState(null)
  const [sendingId, setSendingId] = useState(null)

  function load() {
    setLoading(true)
    Promise.all([
      api.get('/super/training/quotes'),
      api.get('/super/companies/overview'),
    ])
      .then(([qRes, cRes]) => {
        setQuotes(qRes.data?.quotes || [])
        setCompanies(cRes.data?.companies || [])
        setError(null)
      })
      .catch((err) => setError(err?.response?.data?.error || err?.message || 'SERVER_ERROR'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  async function handleSend(quoteId) {
    if (!confirm('Send this quote to the customer admin email?')) return
    setSendingId(quoteId)
    try {
      const r = await api.post(`/super/training/quotes/${quoteId}/send`, {})
      if (!r.data?.ok) throw new Error(r.data?.error || 'Send failed')
      setFlash(`Quote ${r.data.invoice?.invoice_number || ''} sent ${r.data.email_sent ? '(email dispatched)' : '(email skipped)'}`)
      setTimeout(() => setFlash(null), 4000)
      load()
    } catch (err) {
      alert('Send failed: ' + (err?.response?.data?.error || err?.message || 'SERVER_ERROR'))
    } finally {
      setSendingId(null)
    }
  }

  function handleCreated(invoice) {
    setCreating(false)
    setFlash(`Draft quote ${invoice.invoice_number} created ✓`)
    setTimeout(() => setFlash(null), 4000)
    load()
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 px-6 py-12">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">Training quotes</h1>
            <p className="text-sm text-slate-400">
              Section 115.4 pricing · base $800 + per-role add-ons + per-diem + flight pass-through.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded"
            >
              + New quote
            </button>
            <Link to="/" className="text-indigo-400 hover:text-indigo-300 text-sm">
              ← Back to companies
            </Link>
            <AdminLogoutButton />
          </div>
        </div>

        {flash && (
          <div className="mb-4 px-4 py-2 bg-emerald-900/40 border border-emerald-700/50 text-emerald-300 rounded text-sm">
            {flash}
          </div>
        )}

        {loading && <div className="text-sm text-slate-500">Loading…</div>}

        {!loading && error && (
          <div className="px-4 py-3 bg-rose-900/40 border border-rose-700/50 text-rose-300 rounded text-sm">
            Failed to load: {error}
          </div>
        )}

        {!loading && !error && quotes.length === 0 && (
          <div className="px-6 py-12 bg-slate-800/40 border border-slate-700/50 rounded text-center text-sm text-slate-400">
            No training quotes yet. Click "+ New quote" to create one.
          </div>
        )}

        {!loading && !error && quotes.length > 0 && (
          <div className="overflow-x-auto bg-slate-800/40 border border-slate-700/50 rounded">
            <table className="w-full text-sm">
              <thead className="bg-slate-800/60 border-b border-slate-700/50">
                <tr className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">
                  <th className="px-4 py-3">Invoice #</th>
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-right">Paid</th>
                  <th className="px-4 py-3">Issued</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/40">
                {quotes.map((q) => (
                  <tr key={q.id} className="hover:bg-slate-800/40">
                    <td className="px-4 py-3 font-mono text-xs text-slate-200">
                      {q.invoice_number}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-100">{q.company_name}</div>
                      <div className="text-xs text-slate-500 font-mono">{q.company_code}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${statusBadgeClass(q.status)}`}
                      >
                        {q.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-100">
                      {formatCents(q.total_cents)} {q.currency}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-400">
                      {formatCents(q.amount_paid_cents)}
                    </td>
                    <td className="px-4 py-3 text-slate-400">{formatDate(q.issue_date)}</td>
                    <td className="px-4 py-3 text-right">
                      {q.status === 'DRAFT' && (
                        <button
                          type="button"
                          disabled={sendingId === q.id}
                          onClick={() => handleSend(q.id)}
                          className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded disabled:opacity-50"
                        >
                          {sendingId === q.id ? 'Sending…' : 'Send →'}
                        </button>
                      )}
                      {q.status === 'QUOTE_SENT' && (
                        <span className="text-xs text-slate-500">Awaiting customer</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {creating && (
        <CreateQuoteModal
          companies={companies}
          onClose={() => setCreating(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  )
}
