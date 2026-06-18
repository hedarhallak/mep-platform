// src/pages/assignments/ForemanRequestPage.jsx
//
// Method 4 (two-stage gated assignment, DECISIONS §147.5) — Stage 1, the
// FOREMAN SUBMIT screen. The foreman picks his project + a date + the team he
// wants (count AND names, via the shared MemberSelector), and submits. Each
// pick becomes a PENDING assignment_request that the dispatcher reviews on the
// Pending Requests screen (Stage 2). Gated: these are requests, not final.
//
// Frontend over existing endpoints:
//   GET  /hub/my-projects        → the foreman's projects
//   GET  /hub/workers            → employee list for the selector
//   POST /assignments/requests   → one PENDING row per chosen employee
//                                  (non-admins create PENDING; admins auto-approve)

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import api from '@/lib/api'
import MemberSelector from '@/components/shared/MemberSelector'
import { Send, Loader2, AlertCircle, Check, CalendarDays, FolderKanban } from 'lucide-react'

function tomorrowISO() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

export default function ForemanRequestPage() {
  const { t } = useTranslation()
  const [projects, setProjects] = useState([])
  const [workers, setWorkers] = useState([])
  const [projectId, setProjectId] = useState('')
  const [date, setDate] = useState(tomorrowISO())
  const [members, setMembers] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null) // { created, skipped }

  useEffect(() => {
    api.get('/hub/my-projects').then((r) => setProjects(r.data.projects || [])).catch(() => {})
    api.get('/hub/workers').then((r) => setWorkers(r.data.workers || [])).catch(() => {})
  }, [])

  const canSubmit = projectId && date && members.length > 0 && !submitting

  const submit = async () => {
    setError('')
    setResult(null)
    if (!canSubmit) return
    setSubmitting(true)
    const outcomes = await Promise.allSettled(
      members.map((m) =>
        api.post('/assignments/requests', {
          project_id: Number(projectId),
          employee_id: m.id,
          start_date: date,
          end_date: date,
          shift_start: '06:00',
          shift_end: '14:30',
          assignment_role: 'WORKER',
        })
      )
    )
    const created = outcomes.filter((o) => o.status === 'fulfilled').length
    const skipped = outcomes.length - created
    setResult({ created, skipped })
    if (created > 0) setMembers([]) // clear on any success; conflicts stay reported
    setSubmitting(false)
  }

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center">
            <Send className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">{t('foremanRequest.title')}</h1>
            <p className="text-xs text-slate-400 mt-0.5">{t('foremanRequest.subtitle')}</p>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="max-w-xl space-y-4">
          {/* Project */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
              {t('foremanRequest.project')}
            </label>
            <div className="relative">
              <FolderKanban className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-light"
              >
                <option value="">{t('foremanRequest.selectProject')}</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.project_code}
                    {p.project_name ? ` — ${p.project_name}` : ''}
                  </option>
                ))}
              </select>
            </div>
            {projects.length === 0 && (
              <p className="text-xs text-amber-600 mt-1">{t('foremanRequest.noProjects')}</p>
            )}
          </div>

          {/* Date */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
              {t('foremanRequest.date')}
            </label>
            <div className="relative">
              <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-light"
              />
            </div>
          </div>

          {/* Team */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
              {t('foremanRequest.team')}
            </label>
            <MemberSelector workers={workers} value={members} onChange={setMembers} />
          </div>

          {result && (
            <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-xs text-emerald-700 font-semibold">
              <Check className="w-4 h-4 flex-shrink-0" />
              {t('foremanRequest.submitted', { count: result.created })}
              {result.skipped > 0 && ` · ${t('foremanRequest.skipped', { count: result.skipped })}`}
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <button
            onClick={submit}
            disabled={!canSubmit}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white text-sm font-bold rounded-xl hover:bg-primary-dark disabled:opacity-50 transition-colors"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {t('foremanRequest.submit', { count: members.length })}
          </button>
        </div>
      </div>
    </div>
  )
}
