import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import api from '@/lib/api'
import { trade } from '@/constants/trades'
import {
  X, Check, Loader2, Sparkles, Send, UserX, RefreshCw,
  CalendarDays, AlertTriangle, MapPin, Banknote, ChevronLeft,
} from 'lucide-react'

// Section 131 (assignments-redesign Phase 1) — the bulk-assign WIZARD.
// Hedar's model: sequential questions instead of scattered pages.
//   Q1  When?           target date
//   Q2  What basis?     REPEAT today / FULL plan / one PROJECT
//   Q3  Optimizations?  distance/CCQ-allowance ranking + gap filling
//   →   editable preview (with the plan's estimated allowance cost in $)
//   →   one confirm → assignments created + emails sent.
// Engine: POST /assignments/auto-suggest + /auto-confirm (Section 131.3).

const TYPE_STYLE = {
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

function money(cents) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`
}

// Section 131.6: renders as a TAB PANEL (inline=true) or as a modal.
// In inline mode there is no close X; finishing offers a reset instead.
export default function BulkAssignWizard({ projects, onClose, onConfirmed, inline = false }) {
  const { t } = useTranslation()
  const [step, setStep] = useState(1)

  // Q1-Q3 answers
  const [targetDate, setTargetDate] = useState(tomorrowISO())
  const [mode, setMode] = useState('REPEAT')
  const [projectId, setProjectId] = useState('')
  const [optimizeDistance, setOptimizeDistance] = useState(true)
  const [fillGaps, setFillGaps] = useState(true)

  // Preview / confirm state
  const [plan, setPlan] = useState(null)
  const [removed, setRemoved] = useState(new Set())
  const [loading, setLoading] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const generate = async () => {
    setLoading(true); setError(''); setRemoved(new Set())
    try {
      const r = await api.post('/assignments/auto-suggest', {
        target_date: targetDate,
        mode,
        project_id: mode === 'PROJECT' ? Number(projectId) : undefined,
        optimize_distance: optimizeDistance,
        fill_gaps: fillGaps,
      })
      setPlan(r.data)
      setStep(4)
    } catch (e) { setError(e.response?.data?.message || e.response?.data?.error || e.message) }
    finally { setLoading(false) }
  }

  const keyOf = (pid, eid) => `${pid}:${eid}`
  const toggleRemove = (pid, eid) => {
    setRemoved(prev => {
      const next = new Set(prev)
      const k = keyOf(pid, eid)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  }

  const kept = plan
    ? plan.suggestions.flatMap(p =>
        p.employees.filter(e => e.employee_id && !removed.has(keyOf(p.project_id, e.employee_id)))
      )
    : []
  const keptAllowanceCents = kept.reduce((n, e) => n + (e.allowance_cents || 0), 0)

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
      setStep(5)
      onConfirmed()
    } catch (e) { setError(e.response?.data?.message || e.response?.data?.error || e.message) }
    finally { setConfirming(false) }
  }

  const stepValid =
    step === 1 ? !!targetDate :
    step === 2 ? (mode !== 'PROJECT' || !!projectId) :
    true

  // Section 131.7 (Hedar): REPEAT = "same as yesterday" — the
  // optimizations question is meaningless there, so Q3 is SKIPPED and
  // Q2 generates directly (defaults stay on: busy workers still get
  // replacement suggestions, visible in the preview).
  const skipQ3 = mode === 'REPEAT'
  const wizardSteps = skipQ3 ? [1, 2] : [1, 2, 3]

  const resetWizard = () => {
    setStep(1)
    setPlan(null)
    setResult(null)
    setRemoved(new Set())
    setError('')
  }

  return (
    <div className={inline ? '' : 'fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4'}>
      <div className={`bg-white w-full max-w-2xl flex flex-col overflow-hidden ${inline ? 'rounded-xl border border-slate-200' : 'rounded-2xl shadow-2xl max-h-[88vh]'}`}>

        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold text-slate-800">{t('assignments.wizard.title')}</h3>
          </div>
          <div className="flex items-center gap-3">
            {step <= 3 && (
              <div className="flex items-center gap-1.5">
                {wizardSteps.map(s => (
                  <span key={s} className={`w-2 h-2 rounded-full ${s === step ? 'bg-primary' : s < step ? 'bg-primary-light' : 'bg-slate-200'}`} />
                ))}
              </div>
            )}
            {!inline && (
              <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {error && (
            <div className="mb-4 flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />{error}
            </div>
          )}

          {/* Q1 — date */}
          {step === 1 && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-slate-700">{t('assignments.wizard.q1')}</p>
              <div className="flex items-center gap-2 px-3 py-2.5 bg-white border border-slate-200 rounded-xl w-fit">
                <CalendarDays className="w-4 h-4 text-slate-400" />
                <input type="date" value={targetDate} min={new Date().toISOString().split('T')[0]}
                  onChange={e => setTargetDate(e.target.value)}
                  className="text-sm focus:outline-none bg-transparent" />
              </div>
            </div>
          )}

          {/* Q2 — basis */}
          {step === 2 && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-slate-700">{t('assignments.wizard.q2')}</p>
              {[
                { id: 'REPEAT',  title: t('assignments.wizard.basis.repeat'),  hint: t('assignments.wizard.basis.repeatHint') },
                { id: 'FULL',    title: t('assignments.wizard.basis.full'),    hint: t('assignments.wizard.basis.fullHint') },
                { id: 'PROJECT', title: t('assignments.wizard.basis.project'), hint: t('assignments.wizard.basis.projectHint') },
              ].map(opt => (
                <button key={opt.id} onClick={() => setMode(opt.id)}
                  className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${mode === opt.id ? 'border-primary bg-primary-pale' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                  <div className="flex items-center gap-2">
                    <span className={`w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 ${mode === opt.id ? 'border-primary bg-primary' : 'border-slate-300'}`} />
                    <span className="text-sm font-bold text-slate-800">{opt.title}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 ml-5.5 pl-0.5">{opt.hint}</p>
                </button>
              ))}
              {mode === 'PROJECT' && (
                <select value={projectId} onChange={e => setProjectId(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-light">
                  <option value="">{t('assignments.wizard.selectProject')}</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.project_code}{p.project_name ? ` — ${p.project_name}` : ''}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Q3 — optimizations */}
          {step === 3 && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-slate-700">{t('assignments.wizard.q3')}</p>
              {[
                {
                  checked: optimizeDistance, set: setOptimizeDistance, icon: Banknote,
                  title: t('assignments.wizard.opt.distance'),
                  hint: t('assignments.wizard.opt.distanceHint'),
                },
                {
                  checked: fillGaps, set: setFillGaps, icon: RefreshCw,
                  title: t('assignments.wizard.opt.gaps'),
                  hint: t('assignments.wizard.opt.gapsHint'),
                },
              ].map((opt, i) => (
                <button key={i} onClick={() => opt.set(v => !v)}
                  className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${opt.checked ? 'border-primary bg-primary-pale' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                  <div className="flex items-center gap-2">
                    <span className={`w-4 h-4 rounded flex-shrink-0 flex items-center justify-center ${opt.checked ? 'bg-primary' : 'border-2 border-slate-300'}`}>
                      {opt.checked && <Check className="w-3 h-3 text-white" />}
                    </span>
                    <opt.icon className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-sm font-bold text-slate-800">{opt.title}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 pl-6">{opt.hint}</p>
                </button>
              ))}
            </div>
          )}

          {/* Preview */}
          {step === 4 && plan && (
            <div className="space-y-4">
              {/* Allowance total banner */}
              <div className="flex items-center gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="w-9 h-9 bg-emerald-50 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Banknote className="w-4.5 h-4.5 text-emerald-600" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-bold text-slate-800">
                    {t('assignments.wizard.allowanceTotal', { amount: money(keptAllowanceCents) })}
                  </div>
                  <div className="text-[11px] text-slate-400">{t('assignments.wizard.allowanceHint')}</div>
                </div>
                <span className="text-xs font-bold text-slate-500">{t('assignments.wizard.keptCount', { count: kept.length })}</span>
              </div>

              {plan.suggestions.length === 0 && (
                <p className="text-sm text-center text-slate-400 py-8">{t('assignments.wizard.noProjects')}</p>
              )}

              {plan.suggestions.map(p => (
                <div key={p.project_id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-slate-800">
                      {p.project_code}{p.project_name ? ` — ${p.project_name}` : ''}
                    </span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-200 text-slate-500">
                      {p.shift_start}–{p.shift_end}
                    </span>
                    {p.allowance_total_cents > 0 && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 ml-auto">
                        {money(p.allowance_total_cents)}/{t('assignments.wizard.day')}
                      </span>
                    )}
                  </div>
                  <div className="divide-y divide-slate-50">
                    {p.employees.length === 0 && (
                      <div className="px-4 py-3 text-xs text-slate-300">{t('assignments.wizard.noSuggestions')}</div>
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
                                {isGap ? t('assignments.wizard.gap') : e.employee_name}
                              </span>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${TYPE_STYLE[e.type] || TYPE_STYLE.new}`}>
                                {t(`assignments.wizard.type.${e.type}`)}
                              </span>
                              {e.distance_km != null && (
                                <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-slate-400">
                                  <MapPin className="w-3 h-3" />~{e.distance_km} km
                                </span>
                              )}
                              {e.allowance_cents > 0 && (
                                <span className="text-[10px] font-bold text-amber-600">
                                  {money(e.allowance_cents)}/{t('assignments.wizard.day')}
                                </span>
                              )}
                            </div>
                            {e.replacing && (
                              <div className="text-[11px] text-slate-400 mt-0.5">
                                {t('assignments.wizard.replacing', { name: e.replacing })}
                              </div>
                            )}
                          </div>
                          {!isGap && (
                            <button onClick={() => toggleRemove(p.project_id, e.employee_id)}
                              title={isRemoved ? t('assignments.wizard.restore') : t('assignments.wizard.remove')}
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
          )}

          {/* Done */}
          {step === 5 && result && (
            <div className="py-8 text-center">
              <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="w-6 h-6 text-emerald-600" />
              </div>
              <h3 className="text-base font-bold text-slate-800 mb-1">{t('assignments.wizard.doneTitle')}</h3>
              <p className="text-xs text-slate-400">
                {t('assignments.wizard.doneBody', {
                  count: result.assignments_created,
                  emails: result.emails_sent,
                })}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between flex-shrink-0">
          {step > 1 && step <= 4 ? (
            <button onClick={() => setStep(s => (s === 4 ? (skipQ3 ? 2 : 3) : s - 1))}
              className="flex items-center gap-1.5 px-4 py-2 text-slate-500 text-xs font-bold rounded-xl hover:bg-slate-100 transition-colors">
              <ChevronLeft className="w-3.5 h-3.5" />{t('assignments.wizard.back')}
            </button>
          ) : <span />}

          {step === 1 && (
            <button onClick={() => setStep(2)} disabled={!stepValid}
              className="px-5 py-2 bg-primary text-white text-xs font-bold rounded-xl hover:bg-primary-dark transition-colors disabled:opacity-50">
              {t('assignments.wizard.next')}
            </button>
          )}
          {step === 2 && !skipQ3 && (
            <button onClick={() => setStep(3)} disabled={!stepValid}
              className="px-5 py-2 bg-primary text-white text-xs font-bold rounded-xl hover:bg-primary-dark transition-colors disabled:opacity-50">
              {t('assignments.wizard.next')}
            </button>
          )}
          {(step === 3 || (step === 2 && skipQ3)) && (
            <button onClick={generate} disabled={loading || !stepValid}
              className="flex items-center gap-2 px-5 py-2 bg-primary text-white text-xs font-bold rounded-xl hover:bg-primary-dark transition-colors disabled:opacity-60">
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Sparkles className="w-3.5 h-3.5" />{t('assignments.wizard.generate')}</>}
            </button>
          )}
          {step === 4 && (
            <button onClick={confirm} disabled={confirming || kept.length === 0}
              className="flex items-center gap-2 px-5 py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-60">
              {confirming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Send className="w-3.5 h-3.5" />{t('assignments.wizard.confirm', { count: kept.length })}</>}
            </button>
          )}
          {step === 5 && (
            <button onClick={inline ? resetWizard : onClose}
              className="px-5 py-2 bg-primary text-white text-xs font-bold rounded-xl hover:bg-primary-dark transition-colors">
              {inline ? t('assignments.wizard.newPlan') : t('assignments.wizard.close')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
