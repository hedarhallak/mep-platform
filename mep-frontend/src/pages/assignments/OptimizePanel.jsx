import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import api from '@/lib/api'
import { trade } from '@/constants/trades'
import {
  Zap, Check, Loader2, ArrowRight, MapPin, ChevronDown, ChevronUp, X,
} from 'lucide-react'

// Section 131 — optimization suggestions IN CONTEXT (Hedar's merge
// verdict: assists live inside Assignments, never separate pages).
// Replaces the old BI / Workforce Planner "Optimize" surface: a compact
// banner appears above the assignments list when /bi/workforce-suggestions
// finds optimizable assignments; expanding it shows apply-able move cards.

function DistanceBadge({ km }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
      <MapPin className="w-2.5 h-2.5" />{km} km
    </span>
  )
}

export default function OptimizePanel({ onApplied }) {
  const { t } = useTranslation()
  const [data, setData] = useState(null)
  const [open, setOpen] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [applying, setApplying] = useState(null)

  const fetchData = useCallback(async () => {
    try {
      const r = await api.get('/bi/workforce-suggestions')
      setData(r.data)
    } catch (_) { /* silent — panel simply doesn't render */ }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const optimizable = data?.suggestions?.filter(s => s.can_optimize) || []
  if (dismissed || optimizable.length === 0) return null

  const handleApply = async (s) => {
    setApplying(s.assignment_id)
    try {
      await api.patch(`/assignments/requests/${s.assignment_id}/move`, {
        new_project_id: s.suggested_project_id,
      })
      await fetchData()
      onApplied()
    } catch (e) { alert(e.response?.data?.message || e.message) }
    finally { setApplying(null) }
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden flex-shrink-0">
      {/* Banner */}
      <div className="px-4 py-2.5 flex items-center gap-2">
        <Zap className="w-4 h-4 text-amber-500 flex-shrink-0" />
        <span className="text-xs font-bold text-amber-800 flex-1">
          {t('assignments.optimize.banner', {
            count: optimizable.length,
            km: data.summary?.total_saving_km ?? 0,
          })}
        </span>
        <button onClick={() => setOpen(v => !v)}
          className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-amber-700 hover:bg-amber-100 rounded-lg transition-colors">
          {open ? <>{t('assignments.optimize.hide')}<ChevronUp className="w-3 h-3" /></> : <>{t('assignments.optimize.show')}<ChevronDown className="w-3 h-3" /></>}
        </button>
        <button onClick={() => setDismissed(true)}
          className="p-1 text-amber-400 hover:bg-amber-100 rounded-lg transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Expanded suggestions */}
      {open && (
        <div className="border-t border-amber-100 divide-y divide-amber-100 bg-white/60 max-h-72 overflow-y-auto">
          {optimizable.map(s => (
            <div key={s.assignment_id} className="px-4 py-2.5 flex items-center gap-3">
              <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white"
                style={{ background: trade(s.trade_code).dot }}>
                {(s.employee_name || '?')[0]}
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-xs font-bold text-slate-700">{s.employee_name}</span>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  <span className="text-[11px] text-slate-500">{s.current_project}</span>
                  <DistanceBadge km={s.current_distance_km} />
                  <ArrowRight className="w-3 h-3 text-slate-300" />
                  <span className="text-[11px] font-bold text-emerald-700">{s.suggested_project}</span>
                  <DistanceBadge km={s.suggested_distance_km} />
                  <span className="text-[10px] font-bold text-emerald-600">−{s.saving_km} km</span>
                </div>
              </div>
              <button onClick={() => handleApply(s)} disabled={applying === s.assignment_id}
                className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 bg-primary text-white text-[11px] font-bold rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-60">
                {applying === s.assignment_id
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : <><Check className="w-3 h-3" />{t('assignments.optimize.apply')}</>}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
