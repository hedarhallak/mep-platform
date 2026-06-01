// src/admin/PaymentsPage.jsx
//
// Phase 6-D-6 PR 4 / Section 123 — SUPER_ADMIN Payments UI.
//
// Cross-company list of recorded payments + a Record Payment form that wraps
// POST /api/super/payments/record (Phase 6-D-4 PR 5 / Section 118.4). The
// server auto-transitions the parent invoice to PARTIAL_PAID / PAID when the
// running total meets the invoice total. Mirrors CustomDemandsPage.jsx
// (Section 122) — same table chrome, same logout button, same modal pattern —
// adjusted for the payments schema (invoice picker + method + external_ref).
//
// Payment methods come straight from the payments.method CHECK constraint
// (migration 018): STRIPE_CARD | BANK_TRANSFER | CHEQUE | CASH | OTHER.

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../lib/api'
import AdminLogoutButton from './AdminLogoutButton.jsx'

const METHODS = ['BANK_TRANSFER', 'CHEQUE', 'CASH', 'STRIPE_CARD', 'OTHER']

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

function methodLabel(method) {
  switch (method) {
    case 'BANK_TRANSFER':
      return 'Bank transfer'
    case 'CHEQUE':
      return 'Cheque'
    case 'CASH':
      return 'Cash'
    case 'STRIPE_CARD':
      return 'Card (Stripe)'
    case 'OTHER':
      return 'Other'
    default:
      return method || '—'
  }
}

function statusBadgeClass(status) {
  switch (status) {
    case 'SUCCEEDED':
      return 'bg-emerald-900/40 text-emerald-300 border-emerald-700/50'
    case 'PENDING':
      return 'bg-amber-900/40 text-amber-300 border-amber-700/50'
    case 'FAILED':
      return 'bg-rose-900/40 text-rose-300 border-rose-700/50'
    case 'REFUNDED':
      return 'bg-slate-800 text-slate-500 border-slate-700 line-through'
    default:
      return 'bg-slate-800 text-slate-300 border-slate-600'
  }
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

// ─── Record Payment modal ──────────────────────────────────────────────────

function RecordPaymentModal({ invoices, onClose, onRecorded }) {
  const [invoiceId, setInvoiceId] = useState(invoices[0]?.id || '')
  const [amountDollars, setAmountDollars] = useState('')
  const [method, setMethod] = useState('BANK_TRANSFER')
  const [externalRef, setExternalRef] = useState('')
  const [paidAt, setPaidAt] = useState(todayISO())
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const selected = invoices.find((i) => String(i.id) === String(invoiceId))

  // Default the amount to the outstanding balance when an invoice is picked
  // and the field hasn't been touched yet.
  function handleInvoiceChange(e) {
    const id = e.target.value
    setInvoiceId(id)
    const inv = invoices.find((i) => String(i.id) === String(id))
    if (inv) setAmountDollars((inv.balance_cents / 100).toFixed(2))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      if (!invoiceId) throw new Error('Pick an invoice')
      const amountCents = Math.round(Number(amountDollars) * 100)
      if (!Number.isInteger(amountCents) || amountCents <= 0) {
        throw new Error('Amount must be a positive number')
      }
      const body = {
        invoice_id: Number(invoiceId),
        amount_cents: amountCents,
        method,
        paid_at: paidAt || todayISO(),
      }
      if (externalRef.trim()) body.external_ref = externalRef.trim().slice(0, 200)
      if (notes.trim()) body.notes = notes.trim()

      const r = await api.post('/super/payments/record', body)
      if (!r.data?.ok) throw new Error(r.data?.error || 'Record failed')
      onRecorded(r.data.payment, r.data.invoice)
    } catch (err) {
      setError(err?.response?.data?.message || err?.response?.data?.error || err?.message || 'SERVER_ERROR')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-950/80 flex items-center justify-center z-50 p-6 overflow-y-auto">
      <form
        onSubmit={handleSubmit}
        className="max-w-xl w-full bg-slate-900 border border-slate-700 rounded-lg p-6 text-slate-200 space-y-4 my-8"
      >
        <h3 className="text-lg font-bold">Record payment</h3>

        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1">Invoice *</label>
          {invoices.length === 0 ? (
            <div className="text-xs text-slate-500 border border-slate-700 rounded px-3 py-2">
              No payable invoices — every invoice is fully paid, void, or refunded.
            </div>
          ) : (
            <select
              value={invoiceId}
              onChange={handleInvoiceChange}
              required
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-sm focus:outline-none focus:border-slate-500"
            >
              {invoices.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.invoice_number} · {i.company_name} · {i.type} · balance{' '}
                  {formatCents(i.balance_cents)}
                </option>
              ))}
            </select>
          )}
        </div>

        {selected && (
          <div className="text-xs text-slate-400 bg-slate-950/60 border border-slate-800 rounded px-3 py-2">
            Total {formatCents(selected.total_cents)} · Already paid{' '}
            {formatCents(selected.amount_paid_cents)} · Outstanding{' '}
            <span className="text-slate-200 font-semibold">{formatCents(selected.balance_cents)}</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Amount (CAD) *</label>
            <input
              type="number" min="0" step="0.01" required
              value={amountDollars}
              onChange={(e) => setAmountDollars(e.target.value)}
              placeholder="0.00"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-sm text-right"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Method *</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-sm focus:outline-none focus:border-slate-500"
            >
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {methodLabel(m)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Payment date</label>
            <input
              type="date"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              External ref (optional)
            </label>
            <input
              type="text" maxLength={200}
              value={externalRef}
              onChange={(e) => setExternalRef(e.target.value)}
              placeholder="Cheque # / bank ref / e-transfer ID"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1">Notes (optional)</label>
          <textarea
            rows={2} maxLength={2000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
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
          <button type="submit" disabled={submitting || invoices.length === 0}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded disabled:opacity-50">
            {submitting ? 'Recording…' : 'Record payment'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Main page ──────────────────────────────────────────────────────────────

export default function PaymentsPage() {
  const [payments, setPayments] = useState([])
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [recording, setRecording] = useState(false)
  const [flash, setFlash] = useState(null)

  function load() {
    setLoading(true)
    Promise.all([
      api.get('/super/payments'),
      api.get('/super/payments/invoices'),
    ])
      .then(([pRes, iRes]) => {
        setPayments(pRes.data?.payments || [])
        setInvoices(iRes.data?.invoices || [])
        setError(null)
      })
      .catch((err) => setError(err?.response?.data?.error || err?.message || 'SERVER_ERROR'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  function handleRecorded(payment, invoice) {
    setRecording(false)
    setFlash(
      `Recorded ${formatCents(payment.amount_cents)} on ${invoice.invoice_number} — invoice is now ${invoice.status} ✓`
    )
    setTimeout(() => setFlash(null), 5000)
    load()
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 px-6 py-12">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">Payments</h1>
            <p className="text-sm text-slate-400">
              Section 116.5 · Manually recorded payments (bank transfer, cheque, cash). Stripe-driven
              payments arrive in Phase 9-B.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setRecording(true)}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded"
            >
              + Record payment
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

        {!loading && !error && payments.length === 0 && (
          <div className="px-6 py-12 bg-slate-800/40 border border-slate-700/50 rounded text-center text-sm text-slate-400">
            No payments recorded yet. Click "+ Record payment" to record one.
          </div>
        )}

        {!loading && !error && payments.length > 0 && (
          <div className="overflow-x-auto bg-slate-800/40 border border-slate-700/50 rounded">
            <table className="w-full text-sm">
              <thead className="bg-slate-800/60 border-b border-slate-700/50">
                <tr className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">
                  <th className="px-4 py-3">Paid</th>
                  <th className="px-4 py-3">Invoice #</th>
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">Method</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">External ref</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/40">
                {payments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-800/40">
                    <td className="px-4 py-3 text-slate-400">{formatDate(p.paid_at)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-200">
                      {p.invoice_number}
                      <div className="text-slate-500">{p.invoice_type}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-100">{p.company_name}</div>
                      <div className="text-xs text-slate-500 font-mono">{p.company_code}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {methodLabel(p.method)}
                      {p.is_partial && (
                        <span className="ml-1 text-xs text-amber-400">(partial)</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-100">
                      {formatCents(p.amount_cents)} {p.currency}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${statusBadgeClass(p.status)}`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400 font-mono text-xs">
                      {p.external_ref || <span className="text-slate-600">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {recording && (
        <RecordPaymentModal
          invoices={invoices}
          onClose={() => setRecording(false)}
          onRecorded={handleRecorded}
        />
      )}
    </div>
  )
}
