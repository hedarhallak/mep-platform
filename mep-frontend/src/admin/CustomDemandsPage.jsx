// src/admin/CustomDemandsPage.jsx
//
// Phase 6-D-6 PR 3 / Section 122 — SUPER_ADMIN Custom Demands UI.
//
// Cross-company list of CUSTOM_DEMAND-type invoices + a Create form that
// wraps POST /api/super/custom-demands/quotes (Phase 6-D-4 PR 5). Mirrors
// TrainingQuotesPage.jsx (Section 120.3) — same table chrome, same logout
// button, same modal pattern — adjusted for the custom-demand schema
// (title + scope_of_work + subtotal + milestones array).
//
// Custom demands cover ad-hoc work: custom integrations, custom reports,
// white-label branding, data migrations, etc. (Section 115.5)

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../lib/api'
import AdminLogoutButton from './AdminLogoutButton.jsx'

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

// ─── Create modal ────────────────────────────────────────────────────────

function CreateCustomDemandModal({ companies, onClose, onCreated }) {
  const [companyId, setCompanyId] = useState(companies[0]?.company_id || '')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [scopeOfWork, setScopeOfWork] = useState('')
  const [subtotalDollars, setSubtotalDollars] = useState('')
  const [estimatedCompletion, setEstimatedCompletion] = useState('')
  const [customerNotes, setCustomerNotes] = useState('')
  // Milestones: dynamic array of { description, amount_cents }.
  const [milestones, setMilestones] = useState([
    { description: '', amount: '' },
  ])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  function addMilestone() {
    setMilestones((prev) => [...prev, { description: '', amount: '' }])
  }
  function removeMilestone(idx) {
    setMilestones((prev) => prev.filter((_, i) => i !== idx))
  }
  function setMilestoneField(idx, field, value) {
    setMilestones((prev) => prev.map((m, i) => (i === idx ? { ...m, [field]: value } : m)))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      if (!title.trim()) throw new Error('Title is required')
      const subtotalCents = Math.round(Number(subtotalDollars) * 100)
      if (!Number.isFinite(subtotalCents) || subtotalCents <= 0) {
        throw new Error('Subtotal must be a positive amount')
      }
      const body = {
        company_id: Number(companyId),
        title: title.trim(),
        subtotal_cents: subtotalCents,
      }
      if (description.trim()) body.description = description.trim()
      if (scopeOfWork.trim()) body.scope_of_work = scopeOfWork.trim()
      if (estimatedCompletion) body.estimated_completion_date = estimatedCompletion
      if (customerNotes.trim()) body.customer_notes = customerNotes.trim()
      // Only attach non-empty milestones.
      const cleanedMilestones = milestones
        .filter((m) => m.description.trim() && Number(m.amount) > 0)
        .map((m) => ({
          description: m.description.trim(),
          amount_cents: Math.round(Number(m.amount) * 100),
        }))
      if (cleanedMilestones.length > 0) body.milestones = cleanedMilestones

      const r = await api.post('/super/custom-demands/quotes', body)
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
        <h3 className="text-lg font-bold">New custom demand</h3>

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

        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1">Title *</label>
          <input
            type="text" maxLength={200} required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Custom AP integration"
            className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1">Short description</label>
          <input
            type="text" maxLength={500}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="One-sentence summary (customer-facing)"
            className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1">Scope of work</label>
          <textarea
            rows={3} maxLength={5000}
            value={scopeOfWork}
            onChange={(e) => setScopeOfWork(e.target.value)}
            placeholder="Bullet-style scope or paragraph (customer-facing)"
            className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Subtotal (CAD) *
            </label>
            <input
              type="number" min="0" step="0.01" required
              value={subtotalDollars}
              onChange={(e) => setSubtotalDollars(e.target.value)}
              placeholder="1500.00"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Estimated completion
            </label>
            <input
              type="date"
              value={estimatedCompletion}
              onChange={(e) => setEstimatedCompletion(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-sm"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-400">Milestones (optional)</span>
            <button
              type="button" onClick={addMilestone}
              className="text-xs text-indigo-400 hover:text-indigo-300"
            >
              + Add milestone
            </button>
          </div>
          <div className="space-y-2">
            {milestones.map((m, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  type="text" maxLength={200}
                  value={m.description}
                  onChange={(e) => setMilestoneField(idx, 'description', e.target.value)}
                  placeholder={`Milestone ${idx + 1} description`}
                  className="flex-1 px-3 py-1.5 bg-slate-950 border border-slate-700 rounded text-sm"
                />
                <input
                  type="number" min="0" step="0.01"
                  value={m.amount}
                  onChange={(e) => setMilestoneField(idx, 'amount', e.target.value)}
                  placeholder="Amount $"
                  className="w-28 px-2 py-1.5 bg-slate-950 border border-slate-700 rounded text-sm text-right"
                />
                {milestones.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeMilestone(idx)}
                    className="text-xs text-rose-400 hover:text-rose-300 px-2"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1">
            Customer notes (visible on quote)
          </label>
          <textarea
            rows={2} maxLength={5000}
            value={customerNotes}
            onChange={(e) => setCustomerNotes(e.target.value)}
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

export default function CustomDemandsPage() {
  const [quotes, setQuotes] = useState([])
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [creating, setCreating] = useState(false)
  const [flash, setFlash] = useState(null)

  function load() {
    setLoading(true)
    Promise.all([
      api.get('/super/custom-demands/quotes'),
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

  function handleCreated(invoice) {
    setCreating(false)
    setFlash(`Draft custom demand ${invoice.invoice_number} created ✓`)
    setTimeout(() => setFlash(null), 4000)
    load()
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 px-6 py-12">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">Custom demands</h1>
            <p className="text-sm text-slate-400">
              Section 115.5 · Ad-hoc work (custom integrations, reports, migrations).
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded"
            >
              + New custom demand
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
            No custom demands yet. Click "+ New custom demand" to create one.
          </div>
        )}

        {!loading && !error && quotes.length > 0 && (
          <div className="overflow-x-auto bg-slate-800/40 border border-slate-700/50 rounded">
            <table className="w-full text-sm">
              <thead className="bg-slate-800/60 border-b border-slate-700/50">
                <tr className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">
                  <th className="px-4 py-3">Invoice #</th>
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-right">Paid</th>
                  <th className="px-4 py-3">Issued</th>
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
                    <td className="px-4 py-3 text-slate-300 max-w-xs">
                      {q.details?.title || <span className="text-slate-600">—</span>}
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {creating && (
        <CreateCustomDemandModal
          companies={companies}
          onClose={() => setCreating(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  )
}
