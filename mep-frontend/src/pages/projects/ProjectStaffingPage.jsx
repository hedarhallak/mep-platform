// src/pages/projects/ProjectStaffingPage.jsx
//
// §147 Phase 1 — the PROJECT-CENTRIC staffing view. Pick a project + a date and
// see, per trade, REQUIRED vs ASSIGNED vs GAP (red = short, green = covered) —
// the manager's one question per project ("is it fully staffed?"). Plus manage
// the project's time-phased demand rows (the requirements that drive coverage).
//
// Backend (DECISIONS §147.3, migration 034 — must be applied on prod):
//   GET    /projects                              → project dropdown
//   GET    /projects/:id/requirements             → demand rows
//   POST   /projects/:id/requirements             → add a phase/row
//   PATCH  /projects/:id/requirements/:rid        → edit
//   DELETE /projects/:id/requirements/:rid        → remove
//   GET    /projects/:id/coverage?date=YYYY-MM-DD → required/assigned/gap per trade

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import api from '@/lib/api'
import { usePermissions } from '@/hooks/usePermissions.jsx'
import { TRADES, tradeBadge } from '@/constants/trades'
import {
  Target, Plus, X, Check, Loader2, AlertCircle, Edit2, Trash2, FolderKanban, CalendarDays,
} from 'lucide-react'

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}
function fmt(d) {
  return d ? String(d).slice(0, 10) : ''
}

function RequirementModal({ projectId, requirement, onClose, onSaved }) {
  const { t } = useTranslation()
  const isEdit = !!requirement?.id
  const [tradeCode, setTradeCode] = useState(requirement?.trade_code || 'PLUMBING')
  const [count, setCount] = useState(requirement?.required_count ?? 1)
  const [startDate, setStartDate] = useState(fmt(requirement?.start_date) || todayISO())
  const [endDate, setEndDate] = useState(fmt(requirement?.end_date) || todayISO())
  const [note, setNote] = useState(requirement?.note || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Real trades only (exclude the ALL sentinel — a requirement is per trade).
  const trades = TRADES.filter((tr) => tr.value !== 'ALL')

  const handleSave = async () => {
    setError('')
    if (startDate > endDate) return setError(t('projectStaffing.modal.errors.dateRange'))
    setSaving(true)
    const body = {
      trade_code: tradeCode,
      required_count: Number(count),
      start_date: startDate,
      end_date: endDate,
      note: note || null,
    }
    try {
      if (isEdit) await api.patch(`/projects/${projectId}/requirements/${requirement.id}`, body)
      else await api.post(`/projects/${projectId}/requirements`, body)
      onSaved()
    } catch (e) {
      setError(e.response?.data?.error || e.response?.data?.message || e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold text-slate-800">
              {isEdit ? t('projectStaffing.modal.titleEdit') : t('projectStaffing.modal.titleNew')}
            </h3>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4 max-h-[65vh] overflow-y-auto">
          {/* Trade */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
              {t('projectStaffing.modal.trade')}
            </label>
            <div className="flex flex-wrap gap-2">
              {trades.map((tr) => (
                <button
                  key={tr.value}
                  onClick={() => setTradeCode(tr.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                    tradeCode === tr.value
                      ? 'bg-primary text-white border-primary'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {t(tr.labelKey)}
                </button>
              ))}
            </div>
          </div>

          {/* Count */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
              {t('projectStaffing.modal.count')}
            </label>
            <input
              type="number"
              min="0"
              value={count}
              onChange={(e) => setCount(e.target.value)}
              className="w-28 px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-light"
            />
          </div>

          {/* Dates */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                {t('projectStaffing.modal.from')}
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-light"
              />
            </div>
            <div className="flex-1">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                {t('projectStaffing.modal.to')}
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-light"
              />
            </div>
          </div>

          {/* Note */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
              {t('projectStaffing.modal.note')}
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('projectStaffing.modal.notePlaceholder')}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-light placeholder:text-slate-300"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 rounded-xl">
            {t('projectStaffing.modal.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-primary text-white text-xs font-bold rounded-xl hover:bg-primary-dark disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            {isEdit ? t('projectStaffing.modal.update') : t('projectStaffing.modal.add')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ProjectStaffingPage() {
  const { t } = useTranslation()
  const { can } = usePermissions()
  const [projects, setProjects] = useState([])
  const [projectId, setProjectId] = useState('')
  const [date, setDate] = useState(todayISO())
  const [requirements, setRequirements] = useState([])
  const [coverage, setCoverage] = useState(null) // { coverage:[], totals:{} }
  const [loading, setLoading] = useState(false)
  const [modal, setModal] = useState(null) // null | 'new' | requirement
  const [error, setError] = useState('')

  const canCreate = can('assignments', 'create')
  const canEdit = can('assignments', 'edit')

  useEffect(() => {
    api.get('/projects').then((r) => setProjects(r.data.projects || [])).catch(() => {})
  }, [])

  const loadRequirements = async (pid) => {
    if (!pid) return setRequirements([])
    try {
      const r = await api.get(`/projects/${pid}/requirements`)
      setRequirements(r.data.requirements || [])
    } catch (e) {
      setError(e.response?.data?.error || e.message)
    }
  }
  const loadCoverage = async (pid, d) => {
    if (!pid) return setCoverage(null)
    try {
      const r = await api.get(`/projects/${pid}/coverage?date=${d}`)
      setCoverage({ coverage: r.data.coverage || [], totals: r.data.totals || {} })
    } catch (e) {
      setError(e.response?.data?.error || e.message)
    }
  }

  // Reload when the project changes (requirements + coverage) or date changes (coverage).
  useEffect(() => {
    if (!projectId) {
      setRequirements([])
      setCoverage(null)
      return
    }
    setLoading(true)
    setError('')
    Promise.all([loadRequirements(projectId), loadCoverage(projectId, date)]).finally(() =>
      setLoading(false)
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  useEffect(() => {
    if (projectId) loadCoverage(projectId, date)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date])

  const refresh = () => {
    loadRequirements(projectId)
    loadCoverage(projectId, date)
  }

  const handleDelete = async (rid) => {
    if (!window.confirm(t('projectStaffing.confirmDelete'))) return
    try {
      await api.delete(`/projects/${projectId}/requirements/${rid}`)
      refresh()
    } catch (e) {
      alert(e.response?.data?.error || e.message)
    }
  }

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center">
            <Target className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">{t('projectStaffing.title')}</h1>
            <p className="text-xs text-slate-400 mt-0.5">{t('projectStaffing.subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <FolderKanban className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-light min-w-[16rem]"
            >
              <option value="">{t('projectStaffing.selectProject')}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.project_code}
                  {p.project_name ? ` — ${p.project_name}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="relative">
            <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-light"
            />
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600 mb-4">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {!projectId && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Target className="w-10 h-10 text-slate-200 mb-3" />
            <p className="text-sm font-semibold text-slate-400">{t('projectStaffing.pickToStart')}</p>
          </div>
        )}

        {projectId && loading && (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
          </div>
        )}

        {projectId && !loading && (
          <div className="max-w-3xl space-y-6">
            {/* Coverage */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                <span className="text-sm font-bold text-slate-800">{t('projectStaffing.coverageOn', { date })}</span>
                {coverage && coverage.totals && (
                  <span className="text-[11px] font-semibold text-slate-500">
                    {t('projectStaffing.totalsLine', {
                      required: coverage.totals.required || 0,
                      assigned: coverage.totals.assigned || 0,
                    })}
                  </span>
                )}
              </div>
              {(!coverage || coverage.coverage.length === 0) ? (
                <p className="text-center text-xs text-slate-400 py-6">{t('projectStaffing.noCoverage')}</p>
              ) : (
                <div className="divide-y divide-slate-50">
                  {coverage.coverage.map((c) => (
                    <div key={c.trade_code} className="flex items-center gap-3 px-5 py-2.5">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${tradeBadge(c.trade_code)}`}>
                        {c.trade_code}
                      </span>
                      <span className="text-xs text-slate-500">
                        {t('projectStaffing.reqVsAsg', { required: c.required, assigned: c.assigned })}
                      </span>
                      <span
                        className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-full ${
                          c.gap > 0
                            ? 'bg-red-100 text-red-700'
                            : c.gap < 0
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-emerald-100 text-emerald-700'
                        }`}
                      >
                        {c.gap > 0
                          ? t('projectStaffing.short', { n: c.gap })
                          : c.gap < 0
                            ? t('projectStaffing.over', { n: -c.gap })
                            : t('projectStaffing.covered')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Requirements */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                <span className="text-sm font-bold text-slate-800">{t('projectStaffing.requirements')}</span>
                {canCreate && (
                  <button
                    onClick={() => setModal('new')}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary-dark"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {t('projectStaffing.addRequirement')}
                  </button>
                )}
              </div>
              {requirements.length === 0 ? (
                <p className="text-center text-xs text-slate-400 py-6">{t('projectStaffing.noRequirements')}</p>
              ) : (
                <div className="divide-y divide-slate-50">
                  {requirements.map((r) => (
                    <div key={r.id} className="flex items-center gap-3 px-5 py-2.5">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${tradeBadge(r.trade_code)}`}>
                        {r.trade_code}
                      </span>
                      <span className="text-sm font-semibold text-slate-700">×{r.required_count}</span>
                      <span className="text-xs text-slate-400">
                        {fmt(r.start_date)} → {fmt(r.end_date)}
                      </span>
                      {r.note && <span className="text-xs text-slate-400 truncate">· {r.note}</span>}
                      {canEdit && (
                        <div className="ml-auto flex items-center gap-1 flex-shrink-0">
                          <button onClick={() => setModal(r)} className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary-pale rounded-lg">
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleDelete(r.id)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {modal && (
        <RequirementModal
          projectId={projectId}
          requirement={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null)
            refresh()
          }}
        />
      )}
    </div>
  )
}
