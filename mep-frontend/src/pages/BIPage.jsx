import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import api from '@/lib/api'
import {
  BarChart3, Users, Clock, MapPin, Building2,
  Loader2, AlertCircle, TrendingUp, AlertTriangle, CheckCircle2,
} from 'lucide-react'

// ── small presentational helpers ──────────────────────────────
function StatTile({ icon: Icon, label, value, sub, tone = 'primary' }) {
  const tones = {
    primary: 'bg-primary/10 text-primary',
    amber: 'bg-amber-100 text-amber-600',
    green: 'bg-emerald-100 text-emerald-600',
    red: 'bg-red-100 text-red-600',
  }
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-start gap-3">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${tones[tone]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-bold text-slate-800 leading-tight">{value}</div>
        <div className="text-xs font-semibold text-slate-500">{label}</div>
        {sub != null && <div className="text-[11px] text-slate-400 mt-0.5">{sub}</div>}
      </div>
    </div>
  )
}

function BarRow({ label, value, max, suffix, danger }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="flex items-center gap-3 py-1.5">
      <div className="w-32 shrink-0 truncate text-xs font-medium text-slate-600" title={label}>{label}</div>
      <div className="flex-1 h-2.5 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full ${danger ? 'bg-red-400' : 'bg-primary'}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="w-16 shrink-0 text-right text-xs font-semibold text-slate-700">
        {value}{suffix || ''}
      </div>
    </div>
  )
}

function Card({ icon: Icon, title, children, right }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Icon className="w-4.5 h-4.5 text-primary" />
          <h2 className="text-sm font-bold text-slate-800">{title}</h2>
        </div>
        {right}
      </div>
      {children}
    </div>
  )
}

export default function BIPage() {
  const { t } = useTranslation()
  const [days, setDays] = useState(30)
  const [d, setD] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const r = await api.get(`/bi/overview?days=${days}`)
      setD(r.data)
    } catch (e) {
      setError(e.response?.data?.error || e.message)
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => { load() }, [load])

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-end justify-between flex-wrap gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-primary" />
            {t('bi.title')}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">{t('bi.subtitle')}</p>
        </div>
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
          {[30, 60, 90].map((n) => (
            <button key={n} onClick={() => setDays(n)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                days === n ? 'bg-white text-primary shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}>
              {t('bi.lastNDays', { n })}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-24 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      )}

      {!loading && error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
          <AlertCircle className="w-5 h-5" /> {error}
        </div>
      )}

      {!loading && !error && d && (
        <div className="space-y-6">
          {/* top stat tiles */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatTile icon={Users} tone="primary"
              value={`${d.workforce.utilization_pct}%`} label={t('bi.workforce.utilization')}
              sub={t('bi.workforce.assignedOfTotal', { a: d.workforce.assigned_today, n: d.workforce.total_employees })} />
            <StatTile icon={Clock} tone="amber"
              value={d.hours.total_hours} label={t('bi.hours.totalHours')}
              sub={t('bi.hours.otShare', { p: d.hours.overtime_pct })} />
            <StatTile icon={MapPin} tone={d.travel.over_65 > 0 ? 'red' : 'green'}
              value={d.travel.over_65} label={t('bi.travel.over65')}
              sub={d.travel.avg_distance_km != null ? t('bi.travel.avg', { km: d.travel.avg_distance_km }) : '—'} />
            <StatTile icon={Building2} tone={d.coverage.uncovered > 0 ? 'red' : 'green'}
              value={`${d.coverage.covered}/${d.coverage.active_projects}`} label={t('bi.coverage.covered')}
              sub={d.coverage.uncovered > 0 ? t('bi.coverage.uncoveredN', { n: d.coverage.uncovered }) : t('bi.coverage.allStaffed')} />
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            {/* workforce by trade */}
            <Card icon={Users} title={t('bi.workforce.byTrade')}>
              {d.workforce.by_trade.length === 0
                ? <p className="text-sm text-slate-400">{t('bi.noData')}</p>
                : d.workforce.by_trade.map((r) => (
                    <BarRow key={r.trade} label={r.trade} value={r.assigned}
                      max={Math.max(...d.workforce.by_trade.map((x) => x.assigned))} />
                  ))}
            </Card>

            {/* hours by project */}
            <Card icon={Clock} title={t('bi.hours.byProject')}
              right={<span className="text-xs text-slate-400">{t('bi.hours.regOt', { reg: d.hours.regular_hours, ot: d.hours.overtime_hours })}</span>}>
              {d.hours.by_project.length === 0
                ? <p className="text-sm text-slate-400">{t('bi.noData')}</p>
                : d.hours.by_project.map((r) => (
                    <BarRow key={r.project_code} label={`${r.project_code} ${r.project_name}`} value={r.hours} suffix="h"
                      max={Math.max(...d.hours.by_project.map((x) => x.hours))} />
                  ))}
            </Card>

            {/* travel / CCQ bands */}
            <Card icon={MapPin} title={t('bi.travel.title')}>
              <div className="space-y-2.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">{t('bi.travel.band4165')}</span>
                  <span className="font-semibold text-amber-600">{d.travel.band_41_65}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">{t('bi.travel.bandOver65')}</span>
                  <span className="font-semibold text-red-600">{d.travel.over_65}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">{t('bi.travel.bandUnder41')}</span>
                  <span className="font-semibold text-slate-700">{d.travel.under_41}</span>
                </div>
                <div className="pt-2 mt-1 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                  <span>{t('bi.travel.avgLabel')}</span>
                  <span>{d.travel.avg_distance_km != null ? `${d.travel.avg_distance_km} km` : '—'}</span>
                </div>
              </div>
            </Card>

            {/* project coverage */}
            <Card icon={Building2} title={t('bi.coverage.title')}>
              {d.coverage.projects.length === 0
                ? <p className="text-sm text-slate-400">{t('bi.noData')}</p>
                : (
                  <div className="space-y-1.5 max-h-64 overflow-auto pr-1">
                    {d.coverage.projects.map((p) => (
                      <div key={p.project_code} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-slate-50">
                        <div className="min-w-0">
                          <span className="text-xs font-semibold text-slate-700">{p.project_code}</span>
                          <span className="text-xs text-slate-400 ml-2 truncate">{p.project_name}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] uppercase tracking-wide text-slate-400">{p.ccq_sector}</span>
                          {p.assigned > 0
                            ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600"><CheckCircle2 className="w-3.5 h-3.5" />{p.assigned}</span>
                            : <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-500"><AlertTriangle className="w-3.5 h-3.5" />{t('bi.coverage.none')}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
            </Card>
          </div>

          <p className="text-[11px] text-slate-400 flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5" />
            {t('bi.footnote', { from: d.period.from, to: d.period.to })}
          </p>
        </div>
      )}
    </div>
  )
}
