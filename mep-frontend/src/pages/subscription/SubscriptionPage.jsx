// mep-frontend/src/pages/subscription/SubscriptionPage.jsx
//
// Phase 6-D-5 PR 1 — Customer-facing Subscription page.
//
// Renders the tenant's current subscription summary (plan + bracket +
// per-seat price + seat usage + status) and exposes three "request"
// forms that implement the hybrid DB-audit + mailto workflow from
// Section 117.4:
//
//   - Request seat change   → POST /api/admin/subscription/seat-request
//   - Request cancellation  → POST /api/admin/subscription/cancel-request
//   - Request plan upgrade  → POST /api/admin/subscription/plan-upgrade-request
//
// Each POST returns { ok, request_audit_id, mailto_url } and we open the
// returned mailto: URL via window.location.href so the customer's email
// client launches with the pre-filled billing@constrai.ca message. The
// audit_logs row is already inserted server-side at that point — sending
// the email is the customer's separate, auditable action.
//
// All copy goes through t() for bilingual EN/FR per Section 81 Tier 3.
//
// RBAC gate: <RequirePermission module="settings" action="company">
// (already set on the route in App.jsx). COMPANY_ADMIN + IT_ADMIN +
// SUPER_ADMIN see this page; foremen/workers do not.

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import {
  Receipt, Users, AlertCircle, Loader2, CheckCircle, Mail,
  TrendingUp, XCircle, ArrowUpCircle, Calendar,
} from 'lucide-react'

// ─── Helpers ────────────────────────────────────────────────────────────
function formatCents(cents) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`
}

function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toISOString().slice(0, 10)
}

// Map subscription status → Tailwind badge classes
function statusBadge(status) {
  switch (status) {
    case 'ACTIVE':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200'
    case 'TRIAL':
      return 'bg-sky-100 text-sky-800 border-sky-200'
    case 'PAST_DUE':
    case 'SUSPENDED':
      return 'bg-amber-100 text-amber-800 border-amber-200'
    case 'CANCELLED':
    case 'DELETED':
      return 'bg-slate-200 text-slate-700 border-slate-300'
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200'
  }
}

// ─── Request forms ──────────────────────────────────────────────────────

// §117.4 step 4: after the request is recorded server-side + the mailto fires,
// show a confirmation (instead of silently closing) so the customer knows the
// request is logged and that SENDING the email is the action that completes it.
function RequestSuccess({ mailtoUrl, onClose }) {
  const { t } = useTranslation()
  return (
    <div className="mt-4 space-y-3 border-t border-slate-200 pt-4">
      <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
        <CheckCircle size={16} className="text-emerald-600 flex-shrink-0 mt-0.5" />
        <div>
          <div className="text-sm font-semibold text-emerald-800">
            {t('subscription.forms.requestRecorded')}
          </div>
          <div className="text-xs text-emerald-700 mt-1">
            {t('subscription.forms.requestRecordedHelp')}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {mailtoUrl && (
          <a
            href={mailtoUrl}
            className="px-3 py-1.5 bg-primary hover:bg-primary-dark text-white text-xs font-semibold rounded-lg flex items-center gap-1.5"
          >
            <Mail size={13} />
            {t('subscription.forms.reopenEmail')}
          </a>
        )}
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg"
        >
          {t('common.close')}
        </button>
      </div>
    </div>
  )
}

function SeatChangeForm({ subscription, onClose }) {
  const { t } = useTranslation()
  const [requestedSeats, setRequestedSeats] = useState(subscription.subscribed_seats)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)
  const [mailtoUrl, setMailtoUrl] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const r = await api.post('/admin/subscription/seat-request', {
        requested_seats: Number(requestedSeats),
        reason: reason.trim() || undefined,
      })
      const url = r.data?.mailto_url
      if (url) {
        setMailtoUrl(url)
        window.location.href = url
      }
      setDone(true)
    } catch (err) {
      const code = err?.response?.data?.error || 'SERVER_ERROR'
      setError(t(`subscription.errors.${code}`, t('subscription.errors.SERVER_ERROR')))
    } finally {
      setSubmitting(false)
    }
  }

  if (done) return <RequestSuccess mailtoUrl={mailtoUrl} onClose={onClose} />

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-3 border-t border-slate-200 pt-4">
      <div>
        <label
          htmlFor="seat-change-count"
          className="block text-xs font-semibold text-slate-600 mb-1"
        >
          {t('subscription.forms.newSeatCount')}
        </label>
        <input
          id="seat-change-count"
          type="number"
          min="1"
          max="10000"
          value={requestedSeats}
          onChange={(e) => setRequestedSeats(e.target.value)}
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>
      <div>
        <label
          htmlFor="seat-change-reason"
          className="block text-xs font-semibold text-slate-600 mb-1"
        >
          {t('subscription.forms.reasonOptional')}
        </label>
        <textarea
          id="seat-change-reason"
          rows={2}
          maxLength={1000}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>
      {error && (
        <div className="flex items-center gap-2 text-xs text-red-600">
          <AlertCircle size={14} />{error}
        </div>
      )}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="px-3 py-1.5 bg-primary hover:bg-primary-dark text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 disabled:opacity-50"
        >
          {submitting ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} />}
          {t('subscription.forms.submitAndEmail')}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg"
        >
          {t('common.cancel')}
        </button>
      </div>
    </form>
  )
}

function CancelRequestForm({ onClose }) {
  const { t } = useTranslation()
  const [cancelImmediately, setCancelImmediately] = useState(false)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)
  const [mailtoUrl, setMailtoUrl] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const r = await api.post('/admin/subscription/cancel-request', {
        cancel_at_period_end: !cancelImmediately,
        reason: reason.trim() || undefined,
      })
      const url = r.data?.mailto_url
      if (url) {
        setMailtoUrl(url)
        window.location.href = url
      }
      setDone(true)
    } catch (err) {
      const code = err?.response?.data?.error || 'SERVER_ERROR'
      setError(t(`subscription.errors.${code}`, t('subscription.errors.SERVER_ERROR')))
    } finally {
      setSubmitting(false)
    }
  }

  if (done) return <RequestSuccess mailtoUrl={mailtoUrl} onClose={onClose} />

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-3 border-t border-slate-200 pt-4">
      <div className="flex items-center gap-2">
        <input
          id="cancel-immediately"
          type="checkbox"
          checked={cancelImmediately}
          onChange={(e) => setCancelImmediately(e.target.checked)}
          className="w-4 h-4 accent-primary"
        />
        <label htmlFor="cancel-immediately" className="text-xs text-slate-700">
          {t('subscription.forms.cancelImmediately')}
        </label>
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1">
          {t('subscription.forms.reasonOptional')}
        </label>
        <textarea
          rows={2}
          maxLength={1000}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>
      {error && (
        <div className="flex items-center gap-2 text-xs text-red-600">
          <AlertCircle size={14} />{error}
        </div>
      )}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 disabled:opacity-50"
        >
          {submitting ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} />}
          {t('subscription.forms.submitAndEmail')}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg"
        >
          {t('common.cancel')}
        </button>
      </div>
    </form>
  )
}

function PlanUpgradeRequestForm({ subscription, onClose }) {
  const { t } = useTranslation()
  const [targetPlan, setTargetPlan] = useState(
    subscription.plan_type === 'MONTHLY' ? 'ANNUAL' : 'ENTERPRISE'
  )
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)
  const [mailtoUrl, setMailtoUrl] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const r = await api.post('/admin/subscription/plan-upgrade-request', {
        requested_plan_type: targetPlan,
        reason: reason.trim() || undefined,
      })
      const url = r.data?.mailto_url
      if (url) {
        setMailtoUrl(url)
        window.location.href = url
      }
      setDone(true)
    } catch (err) {
      const code = err?.response?.data?.error || 'SERVER_ERROR'
      setError(t(`subscription.errors.${code}`, t('subscription.errors.SERVER_ERROR')))
    } finally {
      setSubmitting(false)
    }
  }

  if (done) return <RequestSuccess mailtoUrl={mailtoUrl} onClose={onClose} />

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-3 border-t border-slate-200 pt-4">
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1">
          {t('subscription.forms.targetPlan')}
        </label>
        <select
          value={targetPlan}
          onChange={(e) => setTargetPlan(e.target.value)}
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="MONTHLY">{t('subscription.plans.MONTHLY')}</option>
          <option value="ANNUAL">{t('subscription.plans.ANNUAL')}</option>
          <option value="ENTERPRISE">{t('subscription.plans.ENTERPRISE')}</option>
        </select>
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1">
          {t('subscription.forms.reasonOptional')}
        </label>
        <textarea
          rows={2}
          maxLength={1000}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>
      {error && (
        <div className="flex items-center gap-2 text-xs text-red-600">
          <AlertCircle size={14} />{error}
        </div>
      )}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="px-3 py-1.5 bg-primary hover:bg-primary-dark text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 disabled:opacity-50"
        >
          {submitting ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} />}
          {t('subscription.forms.submitAndEmail')}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg"
        >
          {t('common.cancel')}
        </button>
      </div>
    </form>
  )
}

// ─── Main page ──────────────────────────────────────────────────────────

export default function SubscriptionPage() {
  const { t } = useTranslation()
  const [activeForm, setActiveForm] = useState(null) // 'seat' | 'cancel' | 'plan' | null

  const { data, isLoading, error } = useQuery({
    queryKey: ['subscription'],
    queryFn: async () => {
      const r = await api.get('/admin/subscription')
      return r.data
    },
    staleTime: 30_000,
  })

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center text-slate-400 text-sm">
        <Loader2 className="animate-spin mr-2" size={16} />
        {t('common.loading')}
      </div>
    )
  }

  if (error || !data?.ok) {
    return (
      <div className="p-8">
        <div className="max-w-2xl mx-auto bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 flex items-start gap-2">
          <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-sm">{t('subscription.loadError')}</div>
            <div className="text-xs mt-1 opacity-80">
              {error?.message || data?.error || t('subscription.errors.SERVER_ERROR')}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const sub = data.subscription
  const usage = data.usage
  const company = data.company
  const overCap = usage.current_employees > sub.subscribed_seats

  return (
    <div className="p-6 md:p-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Receipt size={24} className="text-primary" />
        <div>
          <h1 className="text-xl font-bold text-slate-900">{t('subscription.title')}</h1>
          <p className="text-sm text-slate-500">{company.name}</p>
        </div>
      </div>

      {/* Plan card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-4">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
              {t('subscription.currentPlan')}
            </div>
            <div className="text-2xl font-bold text-slate-900">
              {t(`subscription.plans.${sub.plan_type}`, sub.plan_type)}
            </div>
            <div className="text-sm text-slate-600 mt-1">
              {sub.current_bracket_label
                ? t('subscription.bracketLine', {
                    label: sub.current_bracket_label,
                    price: formatCents(sub.current_unit_price_cents),
                  })
                : '—'}
            </div>
          </div>
          <span
            className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${statusBadge(sub.status)}`}
          >
            {t(`subscription.statuses.${sub.status}`, sub.status)}
          </span>
        </div>

        {/* Billing dates */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-4 border-t border-slate-100">
          {sub.status === 'TRIAL' && sub.trial_ends_at && (
            <div className="flex items-center gap-2 text-sm">
              <Calendar size={14} className="text-slate-400" />
              <span className="text-slate-500">{t('subscription.trialEndsAt')}:</span>
              <span className="font-semibold text-slate-700">{formatDate(sub.trial_ends_at)}</span>
            </div>
          )}
          {sub.next_billing_at && (
            <div className="flex items-center gap-2 text-sm">
              <Calendar size={14} className="text-slate-400" />
              <span className="text-slate-500">{t('subscription.nextBillingAt')}:</span>
              <span className="font-semibold text-slate-700">{formatDate(sub.next_billing_at)}</span>
            </div>
          )}
          {sub.cancel_at_period_end && (
            <div className="flex items-center gap-2 text-sm text-amber-700 md:col-span-2">
              <AlertCircle size={14} />
              {t('subscription.cancelAtPeriodEnd')}
            </div>
          )}
        </div>
      </div>

      {/* Seat usage card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-4">
        <div className="flex items-start justify-between mb-3">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            {t('subscription.seatUsage')}
          </div>
          {overCap ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border bg-amber-100 text-amber-800 border-amber-200">
              <AlertCircle size={11} />{t('subscription.atCapacity')}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border bg-emerald-50 text-emerald-700 border-emerald-200">
              <CheckCircle size={11} />{t('subscription.withinCapacity')}
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-2">
          <div className="text-3xl font-bold text-slate-900">
            {usage.current_employees}
          </div>
          <div className="text-2xl text-slate-400">/</div>
          <div className="text-2xl font-semibold text-slate-600">{sub.subscribed_seats}</div>
          <div className="text-sm text-slate-500 ml-2">{t('subscription.seatsUsedOfSubscribed')}</div>
        </div>
        <div className="text-xs text-slate-500 mt-1 flex items-center gap-1">
          <Users size={12} />
          {overCap
            ? t('subscription.atCapacityHelp')
            : t('subscription.seatsRemainingHelp', { count: usage.seats_remaining })}
        </div>
        {/* Progress bar */}
        <div className="mt-3 h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full ${overCap ? 'bg-amber-500' : 'bg-primary'}`}
            style={{
              width: `${Math.min(100, (usage.current_employees / Math.max(1, sub.subscribed_seats)) * 100)}%`,
            }}
          />
        </div>
      </div>

      {/* Request buttons */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
          {t('subscription.requestChanges')}
        </div>
        <p className="text-xs text-slate-500 mb-4">
          {t('subscription.requestExplanation')}
        </p>

        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setActiveForm(activeForm === 'seat' ? null : 'seat')}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeForm === 'seat'
                ? 'bg-primary text-white'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-700'
            }`}
          >
            <TrendingUp size={14} />
            <span className="flex-1 text-left">{t('subscription.actions.requestSeatChange')}</span>
          </button>
          {activeForm === 'seat' && (
            <SeatChangeForm subscription={sub} onClose={() => setActiveForm(null)} />
          )}

          <button
            type="button"
            onClick={() => setActiveForm(activeForm === 'plan' ? null : 'plan')}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeForm === 'plan'
                ? 'bg-primary text-white'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-700'
            }`}
          >
            <ArrowUpCircle size={14} />
            <span className="flex-1 text-left">{t('subscription.actions.requestPlanUpgrade')}</span>
          </button>
          {activeForm === 'plan' && (
            <PlanUpgradeRequestForm subscription={sub} onClose={() => setActiveForm(null)} />
          )}

          <button
            type="button"
            onClick={() => setActiveForm(activeForm === 'cancel' ? null : 'cancel')}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeForm === 'cancel'
                ? 'bg-red-600 text-white'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-700'
            }`}
          >
            <XCircle size={14} />
            <span className="flex-1 text-left">{t('subscription.actions.requestCancel')}</span>
          </button>
          {activeForm === 'cancel' && (
            <CancelRequestForm onClose={() => setActiveForm(null)} />
          )}
        </div>
      </div>
    </div>
  )
}
