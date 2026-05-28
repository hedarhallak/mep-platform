// src/admin/SubscriptionRequestsPage.jsx
//
// Phase 6-D-6 PR 1 / Section 120 — SUPER_ADMIN Subscription Request Inbox.
//
// Lists pending CUSTOMER_REQUESTED_SUBSCRIPTION_CHANGE audit rows that
// have NO matching SUPER_ADMIN_APPLIED_SUBSCRIPTION_CHANGE follow-up.
// Per row, Hedar can click "Apply" to commit the change via the existing
// POST /api/super/subscriptions/:id/apply-change endpoint, which in turn
// updates the subscription, writes audit row #2, and sends the Resend
// confirmation email to the customer admin.
//
// This closes the loop on the 5-source audit chain designed in
// Section 117.4 — until this page existed, Hedar had to apply changes
// via curl/Postman.
//
// Auth: AdminApp.jsx already gates the whole SUPER_ADMIN portal at
// admin.constrai.ca, so no additional permission check needed here.

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../lib/api'

function formatDate(iso) {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return '—'
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '—'
  }
}

function categoryLabel(cat) {
  switch (cat) {
    case 'SEAT_CHANGE':
      return 'Seat change'
    case 'CANCEL':
      return 'Cancellation'
    case 'PLAN_CHANGE':
      return 'Plan change'
    default:
      return cat || '—'
  }
}

function categoryBadgeClass(cat) {
  switch (cat) {
    case 'SEAT_CHANGE':
      return 'bg-sky-900/40 text-sky-300 border-sky-700/50'
    case 'CANCEL':
      return 'bg-rose-900/40 text-rose-300 border-rose-700/50'
    case 'PLAN_CHANGE':
      return 'bg-amber-900/40 text-amber-300 border-amber-700/50'
    default:
      return 'bg-slate-800 text-slate-300 border-slate-600'
  }
}

function summarizeChange(req) {
  const cur = req.current || {}
  const want = req.requested || {}
  if (req.change_category === 'SEAT_CHANGE') {
    const from = cur.subscribed_seats ?? '?'
    const to = want.subscribed_seats ?? '?'
    return `${from} → ${to} seats`
  }
  if (req.change_category === 'CANCEL') {
    return want.cancel_at_period_end === false
      ? 'Cancel immediately'
      : 'Cancel at period end'
  }
  if (req.change_category === 'PLAN_CHANGE') {
    return `${cur.plan_type ?? '?'} → ${want.plan_type ?? '?'}`
  }
  return '—'
}

// ─── Apply modal ─────────────────────────────────────────────────────────

function ApplyModal({ request, onClose, onApplied }) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  // Pre-fill from the request's requested values; SUPER_ADMIN can edit before apply.
  const [newSeats, setNewSeats] = useState(
    request.requested?.subscribed_seats ?? request.subscription?.subscribed_seats ?? ''
  )
  const [newPlan, setNewPlan] = useState(
    request.requested?.plan_type ?? request.subscription?.plan_type ?? 'MONTHLY'
  )
  const [cancelImmediately, setCancelImmediately] = useState(
    request.requested?.cancel_at_period_end === false
  )
  const [reason, setReason] = useState('')
  const [sendEmail, setSendEmail] = useState(true)

  const subscriptionId = request.subscription?.id
  if (!subscriptionId) {
    return (
      <div className="fixed inset-0 bg-slate-950/80 flex items-center justify-center z-50 p-6">
        <div className="max-w-md w-full bg-slate-900 border border-rose-700 rounded-lg p-6 text-slate-200">
          <h3 className="text-lg font-bold mb-2">Cannot apply</h3>
          <p className="text-sm text-slate-400 mb-4">
            This company has no subscription row to update. Create one first.
          </p>
          <button
            onClick={onClose}
            className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-100 text-sm font-semibold rounded"
          >
            Close
          </button>
        </div>
      </div>
    )
  }

  async function handleApply(e) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const body = {
        type: request.change_category,
        request_audit_id: request.audit_id,
        reason: reason.trim() || undefined,
        send_confirmation_email: sendEmail,
      }
      if (request.change_category === 'SEAT_CHANGE') {
        body.new_seats = Number(newSeats)
      } else if (request.change_category === 'CANCEL') {
        body.cancel_at_period_end = !cancelImmediately
      } else if (request.change_category === 'PLAN_CHANGE') {
        body.new_plan_type = newPlan
      }
      const r = await api.post(`/super/subscriptions/${subscriptionId}/apply-change`, body)
      if (!r.data?.ok) throw new Error(r.data?.error || 'Apply failed')
      onApplied(request.audit_id)
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'SERVER_ERROR')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-950/80 flex items-center justify-center z-50 p-6">
      <form
        onSubmit={handleApply}
        className="max-w-lg w-full bg-slate-900 border border-slate-700 rounded-lg p-6 text-slate-200 space-y-4"
      >
        <div>
          <h3 className="text-lg font-bold">
            Apply {categoryLabel(request.change_category)}
          </h3>
          <p className="text-sm text-slate-400">
            {request.company.name} · request #{request.audit_id} from{' '}
            {request.requester.username}
          </p>
        </div>

        {/* Per-category fields */}
        {request.change_category === 'SEAT_CHANGE' && (
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              New seat count
            </label>
            <input
              type="number"
              min="1"
              max="10000"
              value={newSeats}
              onChange={(e) => setNewSeats(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-sm text-slate-100 focus:outline-none focus:border-slate-500"
            />
          </div>
        )}
        {request.change_category === 'PLAN_CHANGE' && (
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              New plan type
            </label>
            <select
              value={newPlan}
              onChange={(e) => setNewPlan(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-sm text-slate-100 focus:outline-none focus:border-slate-500"
            >
              <option value="MONTHLY">Monthly</option>
              <option value="ANNUAL">Annual</option>
              <option value="ENTERPRISE">Enterprise</option>
            </select>
          </div>
        )}
        {request.change_category === 'CANCEL' && (
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={cancelImmediately}
              onChange={(e) => setCancelImmediately(e.target.checked)}
              className="h-4 w-4 accent-rose-500"
            />
            Cancel immediately (not at period end)
          </label>
        )}

        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1">
            Notes / reason (optional, audit-logged)
          </label>
          <textarea
            rows={2}
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-sm text-slate-100 focus:outline-none focus:border-slate-500"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={sendEmail}
            onChange={(e) => setSendEmail(e.target.checked)}
            className="h-4 w-4 accent-indigo-500"
          />
          Send Resend confirmation email to the customer admin
        </label>

        {error && (
          <div className="text-xs text-rose-400 border border-rose-900/60 bg-rose-950/40 rounded px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold rounded"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded disabled:opacity-50"
          >
            {submitting ? 'Applying…' : 'Apply change'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Main page ───────────────────────────────────────────────────────────

export default function SubscriptionRequestsPage() {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeRequest, setActiveRequest] = useState(null)
  const [flash, setFlash] = useState(null)

  function load() {
    setLoading(true)
    setError(null)
    api
      .get('/super/subscription-requests')
      .then((res) => {
        if (res.data?.ok) {
          setRequests(res.data.requests || [])
        } else {
          setError(res.data?.error || 'SERVER_ERROR')
        }
      })
      .catch((err) => {
        setError(err?.response?.data?.error || err?.message || 'SERVER_ERROR')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  function handleApplied(auditId) {
    setActiveRequest(null)
    setFlash(`Request #${auditId} applied ✓`)
    setTimeout(() => setFlash(null), 4000)
    load()
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 px-6 py-12">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">Subscription requests</h1>
            <p className="text-sm text-slate-400">
              Pending customer-initiated subscription changes (Section 117.4 audit chain).
            </p>
          </div>
          <Link to="/" className="text-indigo-400 hover:text-indigo-300 text-sm">
            ← Back to companies
          </Link>
        </div>

        {/* Flash */}
        {flash && (
          <div className="mb-4 px-4 py-2 bg-emerald-900/40 border border-emerald-700/50 text-emerald-300 rounded text-sm">
            {flash}
          </div>
        )}

        {/* Body */}
        {loading && <div className="text-sm text-slate-500">Loading…</div>}

        {!loading && error && (
          <div className="px-4 py-3 bg-rose-900/40 border border-rose-700/50 text-rose-300 rounded text-sm">
            Failed to load requests: {error}
          </div>
        )}

        {!loading && !error && requests.length === 0 && (
          <div className="px-6 py-12 bg-slate-800/40 border border-slate-700/50 rounded text-center text-sm text-slate-400">
            No pending requests. All caught up ✓
          </div>
        )}

        {!loading && !error && requests.length > 0 && (
          <div className="overflow-x-auto bg-slate-800/40 border border-slate-700/50 rounded">
            <table className="w-full text-sm">
              <thead className="bg-slate-800/60 border-b border-slate-700/50">
                <tr className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">
                  <th className="px-4 py-3">When</th>
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Change</th>
                  <th className="px-4 py-3">Reason</th>
                  <th className="px-4 py-3">Requester</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/40">
                {requests.map((req) => (
                  <tr key={req.audit_id} className="hover:bg-slate-800/40">
                    <td className="px-4 py-3 text-slate-300">{formatDate(req.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-100">{req.company.name}</div>
                      <div className="text-xs text-slate-500 font-mono">
                        {req.company.company_code}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${categoryBadgeClass(req.change_category)}`}
                      >
                        {categoryLabel(req.change_category)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-200 font-mono">
                      {summarizeChange(req)}
                    </td>
                    <td className="px-4 py-3 text-slate-300 max-w-xs">
                      {req.reason ? (
                        <span title={req.reason}>{req.reason.slice(0, 60)}{req.reason.length > 60 ? '…' : ''}</span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">
                      {req.requester.username || '—'}
                      <div className="text-slate-600">{req.requester.role}</div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setActiveRequest(req)}
                        className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded"
                      >
                        Apply →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {activeRequest && (
        <ApplyModal
          request={activeRequest}
          onClose={() => setActiveRequest(null)}
          onApplied={handleApplied}
        />
      )}
    </div>
  )
}
