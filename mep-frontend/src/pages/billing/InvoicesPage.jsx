// mep-frontend/src/pages/billing/InvoicesPage.jsx
//
// Phase 6-D-5 PR 2 / Section 119 — Customer-facing Invoices list page.
//
// Renders a paginated, filterable table of the tenant's invoices for the
// COMPANY_ADMIN. Fetches GET /api/admin/invoices with optional ?type filter
// and ?page / ?limit pagination. Status badges color-coded; amounts shown
// in CAD with two-decimal formatting. internal_notes are deliberately not
// requested or rendered — those are SUPER_ADMIN-only per Section 116.
//
// RBAC gate: <RequirePermission module="settings" action="company">
// (matches the Subscription page from PR 1).

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import {
  FileText, AlertCircle, Loader2, ChevronLeft, ChevronRight, Filter, Download, Eye, X,
} from 'lucide-react'

// ─── Constants ──────────────────────────────────────────────────────────

const TYPES = [
  { value: '',                      labelKey: 'billing.filters.allTypes' },
  { value: 'SUBSCRIPTION_RECURRING', labelKey: 'billing.types.SUBSCRIPTION_RECURRING' },
  { value: 'TRAINING',               labelKey: 'billing.types.TRAINING' },
  { value: 'CUSTOM_DEMAND',          labelKey: 'billing.types.CUSTOM_DEMAND' },
  { value: 'OTHER',                  labelKey: 'billing.types.OTHER' },
]

// Status filter — backend supports ?status=; labels reuse the badge keys.
const STATUSES = [
  { value: '',             labelKey: 'billing.filters.allStatuses' },
  { value: 'DRAFT',        labelKey: 'billing.statuses.DRAFT' },
  { value: 'QUOTE_SENT',   labelKey: 'billing.statuses.QUOTE_SENT' },
  { value: 'APPROVED',     labelKey: 'billing.statuses.APPROVED' },
  { value: 'PARTIAL_PAID', labelKey: 'billing.statuses.PARTIAL_PAID' },
  { value: 'PAID',         labelKey: 'billing.statuses.PAID' },
  { value: 'OVERDUE',      labelKey: 'billing.statuses.OVERDUE' },
  { value: 'VOID',         labelKey: 'billing.statuses.VOID' },
  { value: 'REFUNDED',     labelKey: 'billing.statuses.REFUNDED' },
]

const PAGE_SIZE = 20

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

// Status → Tailwind badge classes
function statusBadge(status) {
  switch (status) {
    case 'PAID':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200'
    case 'PARTIAL_PAID':
      return 'bg-amber-100 text-amber-800 border-amber-200'
    case 'OVERDUE':
      return 'bg-red-100 text-red-800 border-red-200'
    case 'APPROVED':
      return 'bg-sky-100 text-sky-800 border-sky-200'
    case 'DRAFT':
    case 'QUOTE_SENT':
      return 'bg-slate-100 text-slate-700 border-slate-200'
    case 'VOID':
    case 'REFUNDED':
      return 'bg-slate-200 text-slate-500 border-slate-300 line-through'
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200'
  }
}

// ─── Detail modal (§150.3) ────────────────────────────────────────────────

function InvoiceDetailModal({ id, onClose, onDownload, downloading }) {
  const { t } = useTranslation()
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-invoice', id],
    queryFn: async () => (await api.get(`/admin/invoices/${id}`)).data,
    enabled: id != null,
    staleTime: 30_000,
  })

  const inv = data?.invoice
  const payments = data?.payments || []
  const details = inv?.details || {}
  const seats = details.seats_billed != null ? Number(details.seats_billed) : null
  const unitCents = details.unit_price_cents != null ? Number(details.unit_price_cents) : null
  const balance = inv ? Number(inv.total_cents) - Number(inv.amount_paid_cents) : 0

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2 min-w-0">
            <FileText size={18} className="text-primary flex-shrink-0" />
            <span className="font-mono text-sm font-semibold text-slate-800 truncate">
              {inv?.invoice_number || t('billing.detail.title')}
            </span>
            {inv && (
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${statusBadge(inv.status)}`}
              >
                {t(`billing.statuses.${inv.status}`, inv.status)}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </div>

        {isLoading ? (
          <div className="p-8 flex items-center justify-center text-slate-400 text-sm">
            <Loader2 className="animate-spin mr-2" size={16} />
            {t('common.loading')}
          </div>
        ) : error || !inv ? (
          <div className="p-6 text-sm text-red-600 flex items-center gap-2">
            <AlertCircle size={16} />
            {t('billing.loadError')}
          </div>
        ) : (
          <div className="p-5 space-y-5">
            {/* Meta */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div>
                <div className="text-xs text-slate-400">{t('billing.table.type')}</div>
                <div className="text-slate-700">{t(`billing.types.${inv.type}`, inv.type)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-400">{t('billing.table.issueDate')}</div>
                <div className="text-slate-700">{formatDate(inv.issue_date)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-400">{t('billing.table.dueDate')}</div>
                <div className="text-slate-700">{formatDate(inv.due_date)}</div>
              </div>
              {inv.paid_date && (
                <div>
                  <div className="text-xs text-slate-400">{t('billing.detail.paidOn')}</div>
                  <div className="text-slate-700">{formatDate(inv.paid_date)}</div>
                </div>
              )}
            </div>

            {/* Line item */}
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                {t('billing.detail.lineItems')}
              </div>
              <div className="rounded-lg border border-slate-200 overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="text-slate-700">
                    {t(`billing.types.${inv.type}`, inv.type)}
                    {seats != null && unitCents != null && (
                      <span className="text-slate-400">
                        {' '}· {seats} × {formatCents(unitCents)}
                      </span>
                    )}
                  </span>
                  <span className="font-medium text-slate-900">{formatCents(inv.subtotal_cents)}</span>
                </div>
              </div>
            </div>

            {/* Tax breakdown */}
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>{t('billing.detail.subtotal')}</span><span>{formatCents(inv.subtotal_cents)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>{t('billing.detail.qst')}</span><span>{formatCents(inv.qst_cents)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>{t('billing.detail.gst')}</span><span>{formatCents(inv.gst_cents)}</span>
              </div>
              <div className="flex justify-between font-bold text-slate-900 pt-1.5 border-t border-slate-200">
                <span>{t('billing.detail.total')}</span><span>{formatCents(inv.total_cents)} {inv.currency}</span>
              </div>
              {Number(inv.amount_paid_cents) > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>{t('billing.detail.amountPaid')}</span><span>-{formatCents(inv.amount_paid_cents)}</span>
                </div>
              )}
              {balance > 0 && (
                <div className="flex justify-between font-semibold text-amber-700">
                  <span>{t('billing.detail.balanceDue')}</span><span>{formatCents(balance)} {inv.currency}</span>
                </div>
              )}
            </div>

            {/* Customer notes */}
            {inv.customer_notes && (
              <div className="text-sm bg-slate-50 border border-slate-200 rounded-lg p-3 text-slate-600">
                {inv.customer_notes}
              </div>
            )}

            {/* Payments */}
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                {t('billing.detail.payments')}
              </div>
              {payments.length === 0 ? (
                <div className="text-sm text-slate-400">{t('billing.detail.noPayments')}</div>
              ) : (
                <div className="space-y-2">
                  {payments.map((p) => (
                    <div key={p.id} className="flex items-center justify-between text-sm border border-slate-100 rounded-lg px-3 py-2">
                      <div>
                        <div className="text-slate-700">{t(`billing.paymentMethods.${p.method}`, p.method)}</div>
                        <div className="text-xs text-slate-400">
                          {t(`billing.paymentStatuses.${p.status}`, p.status)}
                          {p.paid_at ? ` · ${formatDate(p.paid_at)}` : ''}
                        </div>
                      </div>
                      <span className="font-medium text-slate-900">{formatCents(p.amount_cents)} {p.currency}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => onDownload(inv)}
                disabled={downloading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary-dark text-white text-xs font-semibold rounded-lg disabled:opacity-50"
              >
                {downloading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                {t('billing.table.download')}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main page ──────────────────────────────────────────────────────────

export default function InvoicesPage() {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [downloadingId, setDownloadingId] = useState(null)
  const [downloadError, setDownloadError] = useState(null)
  const [detailId, setDetailId] = useState(null)

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ['admin-invoices', page, typeFilter, statusFilter],
    queryFn: async () => {
      const qs = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) })
      if (typeFilter) qs.set('type', typeFilter)
      if (statusFilter) qs.set('status', statusFilter)
      const r = await api.get(`/admin/invoices?${qs.toString()}`)
      return r.data
    },
    keepPreviousData: true,
    staleTime: 30_000,
  })

  function handleTypeChange(newType) {
    setTypeFilter(newType)
    setPage(1) // reset to first page on filter change
  }

  function handleStatusChange(newStatus) {
    setStatusFilter(newStatus)
    setPage(1)
  }

  // Download a single invoice PDF. The API client authenticates via the
  // Authorization header (not a cookie), so a plain <a href> won't work —
  // fetch the PDF as a blob and trigger a client-side download.
  async function handleDownload(inv) {
    setDownloadError(null)
    setDownloadingId(inv.id)
    try {
      const r = await api.get(`/admin/invoices/${inv.id}/pdf`, { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([r.data], { type: 'application/pdf' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `${inv.invoice_number || 'invoice'}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      setDownloadError(inv.id)
    } finally {
      setDownloadingId(null)
    }
  }

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
            <div className="font-semibold text-sm">{t('billing.loadError')}</div>
            <div className="text-xs mt-1 opacity-80">
              {error?.message || data?.error || t('billing.errors.SERVER_ERROR')}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const invoices = data.invoices || []
  const pagination = data.pagination || { page: 1, total: 0, total_pages: 1 }

  return (
    <div className="p-6 md:p-8 max-w-6xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <FileText size={24} className="text-primary" />
        <div>
          <h1 className="text-xl font-bold text-slate-900">{t('billing.title')}</h1>
          <p className="text-sm text-slate-500">{t('billing.subtitle')}</p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 mb-4 flex items-center gap-3">
        <Filter size={14} className="text-slate-400" />
        <label htmlFor="invoice-type-filter" className="text-xs font-semibold text-slate-600">
          {t('billing.filters.typeLabel')}:
        </label>
        <select
          id="invoice-type-filter"
          value={typeFilter}
          onChange={(e) => handleTypeChange(e.target.value)}
          className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          {TYPES.map((tt) => (
            <option key={tt.value || 'all'} value={tt.value}>
              {t(tt.labelKey)}
            </option>
          ))}
        </select>
        <label htmlFor="invoice-status-filter" className="text-xs font-semibold text-slate-600">
          {t('billing.filters.statusLabel')}:
        </label>
        <select
          id="invoice-status-filter"
          value={statusFilter}
          onChange={(e) => handleStatusChange(e.target.value)}
          className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          {STATUSES.map((st) => (
            <option key={st.value || 'all'} value={st.value}>
              {t(st.labelKey)}
            </option>
          ))}
        </select>
        <div className="ml-auto text-xs text-slate-500">
          {t('billing.totalCount', { count: pagination.total })}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {invoices.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            {t('billing.empty')}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  <th className="px-4 py-3">{t('billing.table.invoiceNumber')}</th>
                  <th className="px-4 py-3">{t('billing.table.type')}</th>
                  <th className="px-4 py-3">{t('billing.table.status')}</th>
                  <th className="px-4 py-3 text-right">{t('billing.table.total')}</th>
                  <th className="px-4 py-3 text-right">{t('billing.table.paid')}</th>
                  <th className="px-4 py-3">{t('billing.table.issueDate')}</th>
                  <th className="px-4 py-3">{t('billing.table.dueDate')}</th>
                  <th className="px-4 py-3 text-right">{t('billing.table.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">
                      {inv.invoice_number}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {t(`billing.types.${inv.type}`, inv.type)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${statusBadge(inv.status)}`}
                      >
                        {t(`billing.statuses.${inv.status}`, inv.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">
                      {formatCents(inv.total_cents)} {inv.currency}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600">
                      {formatCents(inv.amount_paid_cents)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{formatDate(inv.issue_date)}</td>
                    <td className="px-4 py-3 text-slate-600">{formatDate(inv.due_date)}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setDetailId(inv.id)}
                        aria-label={t('billing.table.view')}
                        title={t('billing.table.view')}
                        className="inline-flex items-center justify-center p-1.5 rounded-lg text-slate-500 hover:text-primary hover:bg-slate-100 mr-1"
                      >
                        <Eye size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownload(inv)}
                        disabled={downloadingId === inv.id}
                        aria-label={t('billing.table.download')}
                        title={downloadError === inv.id ? t('billing.downloadFailed') : t('billing.table.download')}
                        className={`inline-flex items-center justify-center p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-50 ${
                          downloadError === inv.id ? 'text-red-500' : 'text-slate-500 hover:text-primary'
                        }`}
                      >
                        {downloadingId === inv.id ? (
                          <Loader2 size={15} className="animate-spin" />
                        ) : (
                          <Download size={15} />
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {pagination.total > PAGE_SIZE && (
          <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-between text-xs">
            <div className="text-slate-500">
              {t('billing.pagination.showing', {
                from: (page - 1) * PAGE_SIZE + 1,
                to: Math.min(page * PAGE_SIZE, pagination.total),
                total: pagination.total,
              })}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1 || isFetching}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-2 py-1 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={13} />
                {t('billing.pagination.prev')}
              </button>
              <span className="text-slate-500 px-2">
                {t('billing.pagination.pageOf', {
                  page,
                  totalPages: pagination.total_pages,
                })}
              </span>
              <button
                type="button"
                disabled={page >= pagination.total_pages || isFetching}
                onClick={() => setPage((p) => Math.min(pagination.total_pages, p + 1))}
                className="px-2 py-1 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {t('billing.pagination.next')}
                <ChevronRight size={13} />
              </button>
            </div>
          </div>
        )}
      </div>

      {detailId != null && (
        <InvoiceDetailModal
          id={detailId}
          onClose={() => setDetailId(null)}
          onDownload={handleDownload}
          downloading={downloadingId === detailId}
        />
      )}
    </div>
  )
}
