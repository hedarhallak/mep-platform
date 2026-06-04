import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import api from '@/lib/api'
import { trade } from '@/constants/trades'
import { usePermissions } from '@/hooks/usePermissions.jsx'
import {
  Brain, MapPin, AlertTriangle, Check, Loader2, RefreshCw, ArrowRight,
  Users, Route, Zap, X, CalendarDays, Sparkles, Send, UserX,
} from 'lucide-react'

// Section 130 — UNIFIED Workforce Planner (Hedar's merge decision §130.1):
// one sidebar entry, two tabs:
//   * Plan     — pick a target date → auto-suggest a full staffing plan
//                (carry-over / replacement / gap / new, distance-scored)
//                → review/remove → one confirm creates the assignments and
//                emails everyone. (/api/assignments/auto-suggest|confirm,
//                permission assignments.smart_assign)
//   * Optimize — the original BI proximity suggestions: move a worker to a
//                closer project. (/api/bi/workforce-suggestions, permission
//                bi.workforce_planner)
// The old /bi/workforce-planner route redirects here; the BI sidebar
// section is gone (this was its only item).

function TradePill({ code }) {
  if (!code) return null
  const c = trade(code)
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${c.light}`}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.dot }} />
      {code}
    </span>
  )
}

function DistanceBadge({ km, threshold = 65 }) {
  const isFar = km >= threshold
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${
      isFar ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500'
    }`}>
      <MapPin className="w-3 h-3" />{km} km
    </span>
  )
}

function SummaryCard({ icon: Icon, label, value, color }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 px-5 py-4 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <div className="text-2xl font-black text-slate-800">{value}</div>
        <div className="text-xs text-slate-400 mt-0.5">{label}</div>
      </div>
    </div>
  )
}

// ── Plan tab (Section 130) ────────────────────────────────────
const PLAN_TYPE_STYLE = {
  carry_over:  'bg-blue-100 text-blue-700',
  replacement: 'bg-amber-100 text-amber-700',
  new:         'bg-emerald-100 text-emerald-700',
  gap:         'bg-red-100 text-red-600',
}

function tomorrowISO() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0]
}

function PlanTab() {
  const { t } = useTranslation()
  const [targetDate, setTargetDate] = useState(tomorrowISO())
  const [plan, setPlan] = useState(null)
  const [loading, setLoading] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [removed, setRemoved] = useState(new Set())
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const generate = async () => {
    setLoading(true); setError(''); setResult(null); setRemoved(new Set())
    try {
      const r = await api.post('/assignments/auto-suggest', { target_date: targetDate })
      setPlan(r.data)
    } catch (e) { setError(e.response?.data?.message || e.response?.data?.error || e.message) }
    finally { setLoading(false) }
  }

  const keyOf = (projectId, employeeId) => `${projectId}:${employeeId}`
  const toggleRemove = (projectId, employeeId) => {
    setRemoved(prev => {
      const next = new Set(prev)
      const k = keyOf(projectId, employeeId)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  }

  const keptCount = plan
    ? plan.suggestions.reduce(
        (n, p) => n + p.employees.filter(e => e.employee_id && !removed.has(keyOf(p.project_id, e.employee_id))).length,
        0
      )
    : 0

  const confirm = async () => {
    if (!plan) return
    const confirmed = plan.suggestions
      .map(p => ({
        project_id: p.project_id,
        shift_start: p.shift_start,
        shift_end: p.shift_end,
        foremen: p.foremen,
        employees: p.employees.filter(
          e => e.employee_id && !removed.has(keyOf(p.project_id, e.employee_id))
        ),
      }))
      .filter(p => p.employees.length)
    if (!confirmed.length) return

    setConfirming(true); setError('')
    try {
      const r = await api.post('/assignments/auto-confirm', { target_date: plan.target_date, confirmed })
      setResult(r.data)
      setPlan(null)
    } catch (e) { setError(e.response?.data?.message || e.response?.data?.error || e.message) }
    finally { setConfirming(false) }
  }

  return (
    <div className="space-y-5">
      {/* Date picker + generate */}
      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">{t('bi.workforcePlanner.plan.targetDate')}</label>
          <div className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-xl">
            <CalendarDays className="w-4 h-4 text-slate-400" />
            <input type="date" value={targetDate} min={new Date().toISOString().split('T')[0]}
              onChange={e => setTargetDate(e.target.value)}
              className="text-sm focus:outline-none bg-transparent" />
          </div>
        </div>
        <button onClick={generate} disabled={loading || !targetDate}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white text-sm font-bold rounded-xl hover:bg-primary-dark transition-colors disabled:opacity-60">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Sparkles className="w-4 h-4" />{t('bi.workforcePlanner.plan.generate')}</>}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />{error}
        </div>
      )}

      {result && (
        <div className="flex items-center gap-2 p-4 bg-emerald-50 border border-emerald-100 rounded-xl text-sm text-emerald-700 font-semibold">
          <Check className="w-4 h-4 flex-shrink-0" />
          {t('bi.workforcePlanner.plan.confirmed', {
            count: result.assignments_created,
            emails: result.emails_sent,
          })}
        </div>
      )}

      {!plan && !loading && !result && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Sparkles className="w-10 h-10 text-slate-200 mb-3" />
          <p className="text-sm font-semibold text-slate-400">{t('bi.workforcePlanner.plan.emptyTitle')}</p>
          <p className="text-xs text-slate-300 mt-1">{t('bi.workforcePlanner.plan.emptySubtitle')}</p>
        </div>
      )}

      {plan && plan.suggestions.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Check className="w-10 h-10 text-emerald-300 mb-3" />
          <p className="text-sm font-semibold text-slate-400">{t('bi.workforcePlanner.plan.noProjects')}</p>
        </div>
      )}

      {plan && plan.suggestions.length > 0 && (
        <>
          <div className="space-y-3">
            {plan.suggestions.map(p => (
              <div key={p.project_id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-3 flex-wrap">
                  <span className="text-sm font-bold text-slate-800">
                    {p.project_code}{p.project_name ? ` — ${p.project_name}` : ''}
                  </span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-200 text-slate-500">
                    {p.shift_start}–{p.shift_end}
                  </span>
                  <span className="text-xs text-slate-400 ml-auto">
                    {t('bi.workforcePlanner.plan.todayCount', { count: p.today_count })}
                  </span>
                </div>
                <div className="divide-y divide-slate-50">
                  {p.employees.length === 0 && (
                    <div className="px-4 py-3 text-xs text-slate-300">{t('bi.workforcePlanner.plan.noSuggestions')}</div>
                  )}
                  {p.employees.map((e, idx) => {
                    const isGap = !e.employee_id
                    const isRemoved = !isGap && removed.has(keyOf(p.project_id, e.employee_id))
                    return (
                      <div key={`${e.employee_id || 'gap'}-${idx}`}
                        className={`px-4 py-2.5 flex items-center gap-3 ${isRemoved ? 'opacity-40' : ''}`}>
                        {isGap ? (
                          <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
                            <UserX className="w-4 h-4 text-red-400" />
                          </div>
                        ) : (
                          <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white"
                            style={{ background: trade(e.trade_code).dot }}>
                            {(e.employee_name || '?')[0]}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-sm font-semibold ${isGap ? 'text-red-500' : 'text-slate-700'}`}>
                              {isGap ? t('bi.workforcePlanner.plan.gap') : e.employee_name}
                            </span>
                            <TradePill code={e.trade_code} />
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${PLAN_TYPE_STYLE[e.type] || PLAN_TYPE_STYLE.new}`}>
                              {t(`bi.workforcePlanner.plan.type.${e.type}`)}
                            </span>
                          </div>
                          {e.replacing && (
                            <div className="text-[11px] text-slate-400 mt-0.5">
                              {t('bi.workforcePlanner.plan.replacing', { name: e.replacing })}
                            </div>
                          )}
                        </div>
                        {!isGap && (
                          <button onClick={() => toggleRemove(p.project_id, e.employee_id)}
                            title={isRemoved ? t('bi.workforcePlanner.plan.restore') : t('bi.workforcePlanner.plan.remove')}
                            className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0">
                            {isRemoved ? <RefreshCw className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          <button onClick={confirm} disabled={confirming || keptCount === 0}
            className="flex items-center gap-2 px-6 py-2.5 bg-primary text-white text-sm font-bold rounded-xl hover:bg-primary-dark transition-colors disabled:opacity-60">
            {confirming
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <><Send className="w-4 h-4" />{t('bi.workforcePlanner.plan.confirm', { count: keptCount })}</>}
          </button>
        </>
      )}
    </div>
  )
}

// ── Optimize tab (the original BI page body) ──────────────────
function OptimizeTab() {
  const { t } = useTranslation()
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [filter, setFilter]   = useState('all') // all | far | optimizable
  const [applying, setApplying] = useState(null)
  const [successMsg, setSuccessMsg] = useState('')

  const fetchData = async () => {
    setLoading(true); setError('')
    try {
      const r = await api.get('/bi/workforce-suggestions')
      setData(r.data)
    } catch (e) { setError(e.response?.data?.message || e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchData() }, [])

  const handleApply = async (suggestion) => {
    if (!window.confirm(
      t('bi.workforcePlanner.confirmMove', {
        employee: suggestion.employee_name,
        currentProject: suggestion.current_project,
        suggestedProject: suggestion.suggested_project,
      })
    )) return
    setApplying(suggestion.assignment_id)
    try {
      await api.patch(`/assignments/requests/${suggestion.assignment_id}/move`, {
        new_project_id: suggestion.suggested_project_id
      })
      setSuccessMsg(t('bi.workforcePlanner.successMove', {
        employee: suggestion.employee_name,
        suggestedProject: suggestion.suggested_project,
      }))
      setTimeout(() => setSuccessMsg(''), 4000)
      fetchData()
    } catch (e) { alert(e.response?.data?.message || e.message) }
    finally { setApplying(null) }
  }

  const filtered = data?.suggestions?.filter(s => {
    if (filter === 'far')        return s.is_far
    if (filter === 'optimizable') return s.can_optimize
    return true
  }) || []

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-end">
        <button onClick={fetchData} disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 text-xs font-semibold rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />{t('bi.workforcePlanner.refresh')}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />{error}
        </div>
      )}

      {successMsg && (
        <div className="flex items-center gap-2 p-4 bg-emerald-50 border border-emerald-100 rounded-xl text-sm text-emerald-700 font-semibold">
          <Check className="w-4 h-4 flex-shrink-0" />{successMsg}
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
        </div>
      )}

      {!loading && data && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-4 gap-3">
            <SummaryCard icon={Users}         label={t('bi.workforcePlanner.summary.activeToday')}                                value={data.summary.total_assignments} color="bg-primary-pale text-primary" />
            <SummaryCard icon={AlertTriangle} label={t('bi.workforcePlanner.summary.beyondKm', { km: data.threshold_km })}        value={data.summary.far_assignments}   color="bg-red-50 text-red-500" />
            <SummaryCard icon={Zap}           label={t('bi.workforcePlanner.summary.canOptimize')}                                value={data.summary.optimizable}       color="bg-amber-50 text-amber-500" />
            <SummaryCard icon={Route}         label={t('bi.workforcePlanner.summary.totalSavingKm')}                              value={data.summary.total_saving_km}   color="bg-emerald-50 text-emerald-600" />
          </div>

          {/* Filter tabs */}
          <div className="flex items-center gap-2">
            {[
              { id: 'all',         label: t('bi.workforcePlanner.filter.all',         { count: data.suggestions.length }) },
              { id: 'far',         label: t('bi.workforcePlanner.filter.beyondKm',    { km: data.threshold_km, count: data.summary.far_assignments }) },
              { id: 'optimizable', label: t('bi.workforcePlanner.filter.optimizable', { count: data.summary.optimizable }) },
            ].map(f => (
              <button key={f.id} onClick={() => setFilter(f.id)}
                className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
                  filter === f.id ? 'bg-primary text-white' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'
                }`}>
                {f.label}
              </button>
            ))}
          </div>

          {/* Suggestions list */}
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Check className="w-10 h-10 text-emerald-300 mb-3" />
              <p className="text-sm font-semibold text-slate-400">{t('bi.workforcePlanner.empty.title')}</p>
              <p className="text-xs text-slate-300 mt-1">{t('bi.workforcePlanner.empty.subtitle')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map(s => (
                <div key={s.assignment_id}
                  className={`bg-white rounded-xl border overflow-hidden ${
                    s.is_far ? 'border-red-200' : s.can_optimize ? 'border-amber-200' : 'border-slate-200'
                  }`}>

                  {/* Top bar */}
                  <div className={`px-4 py-2 flex items-center gap-2 text-xs font-bold ${
                    s.is_far ? 'bg-red-50 text-red-600' : s.can_optimize ? 'bg-amber-50 text-amber-600' : 'bg-slate-50 text-slate-500'
                  }`}>
                    {s.is_far
                      ? <><AlertTriangle className="w-3.5 h-3.5" />{t('bi.workforcePlanner.badge.beyondThreshold', { km: data.threshold_km })}</>
                      : s.can_optimize
                        ? <><Zap className="w-3.5 h-3.5" />{t('bi.workforcePlanner.badge.canOptimize')}</>
                        : <><Check className="w-3.5 h-3.5" />{t('bi.workforcePlanner.badge.optimal')}</>
                    }
                  </div>

                  <div className="px-4 py-4">
                    {/* Employee info */}
                    <div className="flex items-start gap-3 mb-3">
                      <div className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-bold text-white"
                        style={{ background: trade(s.trade_code).dot }}>
                        {(s.employee_name || '?')[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-slate-800">{s.employee_name}</span>
                          <TradePill code={s.trade_code} />
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                            {s.assignment_role}
                          </span>
                        </div>

                        {/* Current → Suggested */}
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 rounded-lg">
                            <span className="text-xs text-slate-500">{t('bi.workforcePlanner.now')}</span>
                            <span className="text-xs font-bold text-slate-700">{s.current_project}</span>
                            <DistanceBadge km={s.current_distance_km} />
                          </div>

                          {s.can_optimize && (
                            <>
                              <ArrowRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
                              <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-50 rounded-lg border border-emerald-100">
                                <span className="text-xs text-emerald-600">{t('bi.workforcePlanner.suggested')}</span>
                                <span className="text-xs font-bold text-emerald-700">{s.suggested_project}</span>
                                <DistanceBadge km={s.suggested_distance_km} />
                                <span className="text-[10px] font-bold text-emerald-600">−{s.saving_km}km</span>
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Apply button */}
                      {s.can_optimize && (
                        <button onClick={() => handleApply(s)} disabled={applying === s.assignment_id}
                          className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-60 whitespace-nowrap">
                          {applying === s.assignment_id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <><Check className="w-3.5 h-3.5" />{t('bi.workforcePlanner.apply')}</>
                          }
                        </button>
                      )}
                    </div>

                    {/* Reason */}
                    <div className="text-xs text-slate-400 leading-relaxed bg-slate-50 rounded-lg px-3 py-2">
                      💡 {s.reason}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default function WorkforcePlannerPage() {
  const { t } = useTranslation()
  const { can, loading: permsLoading } = usePermissions()
  const canPlan = !permsLoading && can('assignments', 'smart_assign')
  const canOptimize = !permsLoading && can('bi', 'workforce_planner')
  const [tab, setTab] = useState('plan')

  useEffect(() => {
    if (permsLoading) return
    if (!canPlan && canOptimize) setTab('optimize')
  }, [permsLoading, canPlan, canOptimize])

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">{t('bi.workforcePlanner.title')}</h1>
            <p className="text-xs text-slate-400 mt-0.5">{t('bi.workforcePlanner.subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {canPlan && (
            <button onClick={() => setTab('plan')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${tab === 'plan' ? 'bg-primary text-white' : 'text-slate-500 hover:bg-slate-100'}`}>
              <Sparkles className="w-3.5 h-3.5" />{t('bi.workforcePlanner.tabs.plan')}
            </button>
          )}
          {canOptimize && (
            <button onClick={() => setTab('optimize')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${tab === 'optimize' ? 'bg-primary text-white' : 'text-slate-500 hover:bg-slate-100'}`}>
              <Zap className="w-3.5 h-3.5" />{t('bi.workforcePlanner.tabs.optimize')}
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {tab === 'plan' && canPlan && <PlanTab />}
        {tab === 'optimize' && canOptimize && <OptimizeTab />}
      </div>
    </div>
  )
}
