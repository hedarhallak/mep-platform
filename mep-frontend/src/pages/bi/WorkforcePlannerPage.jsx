import { useState, useEffect } from 'react'
import api from '@/lib/api'
import { trade } from '@/constants/trades'
import {
  Brain, MapPin, TrendingDown, AlertTriangle, Check,
  Loader2, RefreshCw, ArrowRight, Users, Route, Zap, X
} from 'lucide-react'

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

export default function WorkforcePlannerPage() {
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
      `Move ${suggestion.employee_name} from ${suggestion.current_project} to ${suggestion.suggested_project}?`
    )) return
    setApplying(suggestion.assignment_id)
    try {
      await api.patch(`/assignments/requests/${suggestion.assignment_id}/move`, {
        new_project_id: suggestion.suggested_project_id
      })
      setSuccessMsg(`${suggestion.employee_name} moved to ${suggestion.suggested_project} ✓`)
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
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">

      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-5 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center">
              <Brain className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Workforce Planner</h1>
              <p className="text-xs text-slate-400 mt-0.5">Geographical assignment optimization · Today's active workforce</p>
            </div>
          </div>
          <button onClick={fetchData} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 text-xs font-semibold rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />Refresh
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

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
              <SummaryCard icon={Users}        label="Active Today"       value={data.summary.total_assignments} color="bg-indigo-50 text-indigo-600" />
              <SummaryCard icon={AlertTriangle} label={`Beyond ${data.threshold_km}km`} value={data.summary.far_assignments}   color="bg-red-50 text-red-500" />
              <SummaryCard icon={Zap}           label="Can Optimize"       value={data.summary.optimizable}       color="bg-amber-50 text-amber-500" />
              <SummaryCard icon={Route}         label="Total Saving (km)"  value={data.summary.total_saving_km}   color="bg-emerald-50 text-emerald-600" />
            </div>

            {/* Filter tabs */}
            <div className="flex items-center gap-2">
              {[
                { id: 'all',         label: `All (${data.suggestions.length})` },
                { id: 'far',         label: `Beyond ${data.threshold_km}km (${data.summary.far_assignments})` },
                { id: 'optimizable', label: `Optimizable (${data.summary.optimizable})` },
              ].map(f => (
                <button key={f.id} onClick={() => setFilter(f.id)}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
                    filter === f.id ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'
                  }`}>
                  {f.label}
                </button>
              ))}
            </div>

            {/* Suggestions list */}
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Check className="w-10 h-10 text-emerald-300 mb-3" />
                <p className="text-sm font-semibold text-slate-400">All assignments look optimal</p>
                <p className="text-xs text-slate-300 mt-1">No improvements found for the selected filter</p>
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
                        ? <><AlertTriangle className="w-3.5 h-3.5" />Beyond {data.threshold_km}km threshold</>
                        : s.can_optimize
                          ? <><Zap className="w-3.5 h-3.5" />Optimization available</>
                          : <><Check className="w-3.5 h-3.5" />Optimal placement</>
                      }
                    </div>

                    <div className="px-4 py-4">
                      {/* Employee info */}
                      <div className="flex items-start gap-3 mb-3">
                        <div className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-bold text-white"
                          style={{ background: tradeColor(s.trade_code).dot }}>
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
                              <span className="text-xs text-slate-500">Now:</span>
                              <span className="text-xs font-bold text-slate-700">{s.current_project}</span>
                              <DistanceBadge km={s.current_distance_km} />
                            </div>

                            {s.can_optimize && (
                              <>
                                <ArrowRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
                                <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-50 rounded-lg border border-emerald-100">
                                  <span className="text-xs text-emerald-600">Suggested:</span>
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
                            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-60 whitespace-nowrap">
                            {applying === s.assignment_id
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <><Check className="w-3.5 h-3.5" />Apply</>
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
    </div>
  )
}
