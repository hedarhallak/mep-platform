// src/pages/assignments/PendingRequestsPage.jsx
//
// Method 4 (two-stage gated assignment, DECISIONS §147.5) — the DISPATCHER
// REVIEW screen. Stage 2: the foreman has submitted PENDING requests (Stage 1);
// the dispatcher reviews them grouped by project and approves or rejects each.
// Gated: nothing is final until the dispatcher acts.
//
// Pure frontend over EXISTING endpoints:
//   GET   /assignments/requests?status=PENDING   (enriched: project, employee,
//                                                  trade, requested_by)
//   PATCH /assignments/requests/:id/approve      (→ §144 distance + allowance)
//   PATCH /assignments/requests/:id/reject       ({ reason } optional)

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import api from '@/lib/api'
import { usePermissions } from '@/hooks/usePermissions.jsx'
import { tradeBadge } from '@/constants/trades'
import {
  ClipboardCheck, Check, X, Loader2, AlertCircle, UserCircle, CalendarDays, FolderKanban,
} from 'lucide-react'

function fmtDate(d) {
  if (!d) return ''
  return String(d).slice(0, 10)
}

export default function PendingRequestsPage() {
  const { t } = useTranslation()
  const { can } = usePermissions()
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(null) // request id being approved/rejected
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  const canEdit = can('assignments', 'edit')

  const fetchPending = async () => {
    setLoading(true)
    setError('')
    try {
      const r = await api.get('/assignments/requests?status=PENDING')
      setRequests(r.data.requests || [])
    } catch (e) {
      setError(e.response?.data?.message || e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPending()
  }, [])

  const showSuccess = (msg) => {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(''), 3000)
  }

  const approve = async (id) => {
    setActing(id)
    setError('')
    try {
      await api.patch(`/assignments/requests/${id}/approve`)
      setRequests((rs) => rs.filter((r) => r.id !== id))
      showSuccess(t('pendingRequests.approved'))
    } catch (e) {
      setError(e.response?.data?.message || e.response?.data?.error || e.message)
    } finally {
      setActing(null)
    }
  }

  const reject = async (id) => {
    const reason = window.prompt(t('pendingRequests.rejectReason')) // optional; cancel = abort
    if (reason === null) return
    setActing(id)
    setError('')
    try {
      await api.patch(`/assignments/requests/${id}/reject`, { reason: reason || null })
      setRequests((rs) => rs.filter((r) => r.id !== id))
      showSuccess(t('pendingRequests.rejected'))
    } catch (e) {
      setError(e.response?.data?.message || e.response?.data?.error || e.message)
    } finally {
      setActing(null)
    }
  }

  // Group pending requests by project for the project-centric view.
  const groups = []
  const byProject = new Map()
  for (const r of requests) {
    const key = r.project_code || `#${r.project_id}`
    if (!byProject.has(key)) {
      const g = { key, project_code: r.project_code, project_name: r.project_name, rows: [] }
      byProject.set(key, g)
      groups.push(g)
    }
    byProject.get(key).rows.push(r)
  }

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center">
            <ClipboardCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">{t('pendingRequests.title')}</h1>
            <p className="text-xs text-slate-400 mt-0.5">{t('pendingRequests.subtitle')}</p>
          </div>
          {!loading && requests.length > 0 && (
            <span className="ml-auto text-xs font-bold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full">
              {t('pendingRequests.count', { count: requests.length })}
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {successMsg && (
          <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-xs text-emerald-700 font-semibold mb-4">
            <Check className="w-4 h-4 flex-shrink-0" />
            {successMsg}
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600 mb-4">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {loading && (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
          </div>
        )}

        {!loading && groups.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <ClipboardCheck className="w-10 h-10 text-slate-200 mb-3" />
            <p className="text-sm font-semibold text-slate-400">{t('pendingRequests.empty')}</p>
            <p className="text-xs text-slate-300 mt-1">{t('pendingRequests.emptyHint')}</p>
          </div>
        )}

        {!loading && groups.length > 0 && (
          <div className="space-y-5 max-w-4xl">
            {groups.map((g) => (
              <div key={g.key} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100 bg-slate-50">
                  <FolderKanban className="w-4 h-4 text-primary-light" />
                  <span className="text-sm font-bold text-slate-800">{g.project_code}</span>
                  {g.project_name && <span className="text-xs text-slate-400">— {g.project_name}</span>}
                  <span className="ml-auto text-[11px] font-semibold text-slate-400">
                    {t('pendingRequests.count', { count: g.rows.length })}
                  </span>
                </div>
                <div className="divide-y divide-slate-50">
                  {g.rows.map((r) => (
                    <div key={r.id} className="flex items-center gap-3 px-5 py-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-slate-800">{r.employee_name}</span>
                          {r.employee_trade && (
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${tradeBadge(r.employee_trade)}`}>
                              {r.employee_trade}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 mt-1 flex-wrap text-xs text-slate-400">
                          <span className="flex items-center gap-1">
                            <CalendarDays className="w-3 h-3" />
                            {fmtDate(r.start_date)}
                            {r.end_date && r.end_date !== r.start_date ? ` → ${fmtDate(r.end_date)}` : ''}
                          </span>
                          {r.requested_by_name && (
                            <span className="flex items-center gap-1">
                              <UserCircle className="w-3 h-3" />
                              {t('pendingRequests.requestedBy', { name: r.requested_by_name })}
                            </span>
                          )}
                        </div>
                      </div>
                      {canEdit && (
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            onClick={() => approve(r.id)}
                            disabled={acting === r.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                          >
                            {acting === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                            {t('pendingRequests.approve')}
                          </button>
                          <button
                            onClick={() => reject(r.id)}
                            disabled={acting === r.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-red-600 border border-red-200 text-xs font-bold rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                            {t('pendingRequests.reject')}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
