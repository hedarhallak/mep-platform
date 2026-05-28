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
  FileText, AlertCircle, Loader2, ChevronLeft, ChevronRight, Filter,
} from 'lucide-react'

// ─── Constants ──────────────────────────────────────────────────────────

const TYPES = [
  { value: '',                      labelKey: 'billing.filters.allTypes' },
  { value: 'SUBSCRIPTION_RECURRING', labelKey: 'billing.types.SUBSCRIPTION_RECURRING' },
  { value: 'TRAINING',               labelKey: 'billing.types.TRAINING' },
  { value: 'CUSTOM_DEMAND',          labelKey: 'billing.types.CUSTOM_DEMAND' },
  { value: 'OTHER',                  labelKey: 'billing.types.OTHER' },
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

// ─── Main page ──────────────────────────────────────────────────────────

export default function InvoicesPage() {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const [typeFilter, setTypeFilter] = useState('')

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ['admin-invoices', page, typeFilter],
    queryFn: async () => {
      const qs = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) })
      if (typeFilter) qs.set('type', typeFilter)
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
    </div>
  )
}
