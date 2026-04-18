import { useState, useEffect, useRef } from 'react'
import api from '@/lib/api'
import {
  Send, Plus, Upload, X, Check, Loader2,
  AlertCircle, FileText, ClipboardList, Clock,
  ChevronRight, RefreshCw
} from 'lucide-react'
import WorkerPicker, { workerName, WorkerAvatar, workerAvatarColor } from '@/components/shared/WorkerPicker'

const PRIORITY_STYLE = {
  LOW:    'bg-slate-100  text-slate-500  border-slate-200',
  NORMAL: 'bg-blue-50    text-blue-600   border-blue-200',
  HIGH:   'bg-amber-50   text-amber-700  border-amber-200',
  URGENT: 'bg-red-50     text-red-600    border-red-200',
}
const AVATAR_COLORS = ['bg-primary-pale0','bg-emerald-500','bg-amber-500','bg-rose-500','bg-violet-500','bg-cyan-500']
const avatarColor = name => AVATAR_COLORS[(name?.charCodeAt(0)||0) % AVATAR_COLORS.length]

// ── New Task Form ─────────────────────────────────────────────
function NewTaskTab({ workers, projects, defaultProject, onSent }) {
  const [form, setForm] = useState({
    title: '', body: '', priority: 'NORMAL', project_id: defaultProject || '', due_date: ''
  })
  const [recipients, setRecipients] = useState([])
  const [file, setFile]             = useState(null)
  const [sending, setSending]       = useState(false)
  const [error, setError]           = useState('')

  // Filter workers by project assignment status
  const workersWithProject = form.project_id
    ? workers.map(w => ({
        ...w,
        is_assigned: w.is_assigned || false
      }))
    : workers

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSend = async () => {
    setError('')
    if (!form.title.trim())   return setError('Title is required')
    if (!recipients.length)   return setError('Add at least one recipient')
    setSending(true)
    try {
      const fd = new FormData()
      fd.append('title', form.title.trim())
      fd.append('body', form.body.trim())
      fd.append('type', 'TASK')
      fd.append('priority', form.priority)
      fd.append('project_id', form.project_id || '')
      fd.append('due_date', form.due_date || '')
      fd.append('recipient_ids', JSON.stringify(recipients.map(w => w.id)))
      if (file) fd.append('file', file)
      const res = await api.post('/hub/messages', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      const d = res.data
      onSent(d.pending > 0
        ? `Sent to ${d.sent} worker${d.sent!==1?'s':''} ✓ — ${d.pending} pending assignment`
        : `Sent to ${d.sent} worker${d.sent!==1?'s':''} ✓`)
      setForm({ title:'', body:'', priority:'NORMAL', project_id:'', due_date:'' })
      setRecipients([])
      setFile(null)
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Failed to send')
    } finally { setSending(false) }
  }

  return (
    <div className="grid grid-cols-[1fr_380px] gap-6 h-full">

      {/* LEFT column */}
      <div className="space-y-4">
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
            <AlertCircle size={15}/>{error}
          </div>
        )}

        {/* Title */}
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Title *</label>
          <input type="text" value={form.title} onChange={e => set('title', e.target.value)}
            placeholder="e.g. Install main water line — Section A"
            className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary-light"/>
        </div>

        {/* Instructions */}
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
            Instructions <span className="font-normal normal-case text-slate-400">(optional)</span>
          </label>
          <textarea value={form.body} onChange={e => set('body', e.target.value)}
            rows={4} placeholder="Describe the task in detail..."
            className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary-light resize-none"/>
        </div>

        {/* Priority */}
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Priority</label>
          <div className="flex gap-2">
            {[
              { v:'LOW',    dot:'bg-slate-400',  ring:'ring-slate-300',  label:'Low',    bg:'bg-slate-50   hover:bg-slate-100',  active:'bg-slate-700 text-white'  },
              { v:'NORMAL', dot:'bg-blue-500',   ring:'ring-blue-300',   label:'Normal', bg:'bg-blue-50    hover:bg-blue-100',   active:'bg-blue-600  text-white'  },
              { v:'HIGH',   dot:'bg-amber-500',  ring:'ring-amber-300',  label:'High',   bg:'bg-amber-50   hover:bg-amber-100',  active:'bg-amber-500 text-white'  },
              { v:'URGENT', dot:'bg-red-500',    ring:'ring-red-300',    label:'Urgent', bg:'bg-red-50     hover:bg-red-100',    active:'bg-red-600   text-white'  },
            ].map(p => (
              <button key={p.v} type="button" onClick={() => set('priority', p.v)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-xs font-semibold transition-all ${
                  form.priority===p.v
                    ? `${p.active} border-transparent ring-2 ${p.ring}`
                    : `${p.bg} border-slate-200 text-slate-600`
                }`}>
                <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${p.dot}`}/>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Project + Due date in one row */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Project</label>
            <select value={form.project_id} onChange={e => set('project_id', e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-primary-light">
              <option value="">No project</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.project_code} — {p.project_name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Due Date</label>
            <input type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-light"/>
          </div>
        </div>

        {/* File */}
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
            Attachment <span className="font-normal normal-case text-slate-400">(PDF or image, max 20MB)</span>
          </label>
          <label className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-colors ${
            file ? 'border-primary-pale bg-primary-pale' : 'border-dashed border-slate-200 hover:border-primary-pale hover:bg-primary-pale/30'
          }`}>
            <Upload size={16} className="text-slate-400 flex-shrink-0"/>
            <span className={`text-sm flex-1 truncate ${file ? 'text-primary-dark font-medium' : 'text-slate-400'}`}>
              {file ? file.name : 'Click to upload'}
            </span>
            {file && <button type="button" onClick={e => { e.preventDefault(); setFile(null) }} className="text-slate-400 hover:text-red-500"><X size={14}/></button>}
            <input type="file" accept=".pdf,image/*" className="hidden" onChange={e => setFile(e.target.files?.[0]||null)}/>
          </label>
        </div>

        {/* Send */}
        <div className="flex justify-end pt-1">
          <button onClick={handleSend} disabled={sending}
            className="flex items-center gap-2 px-6 py-2.5 bg-primary hover:bg-primary-dark disabled:opacity-50 text-white rounded-xl text-sm font-bold transition-colors">
            {sending ? <><Loader2 size={15} className="animate-spin"/>Sending...</> : <><Send size={15}/>Send Task</>}
          </button>
        </div>
      </div>

      {/* RIGHT column — Recipients */}
      <div className="bg-white border border-slate-200 rounded-xl flex flex-col overflow-hidden" style={{maxHeight:'calc(100vh - 180px)'}}>
        <div className="px-4 py-3.5 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Recipients *
              {recipients.length > 0 && (
                <span className="ml-2 px-1.5 py-0.5 bg-primary-pale text-primary rounded-full text-[10px] font-bold normal-case">
                  {recipients.length}
                </span>
              )}
            </label>
          </div>
        </div>
        <div className="px-4 pt-3 pb-2">
          <WorkerPicker
            mode="multi"
            workers={workersWithProject}
            value={recipients}
            onChange={setRecipients}
            showAssigned={!!form.project_id}
            projectSelected={!!form.project_id}
          />
          <p className="text-xs text-slate-400 mt-1.5">Start typing to search by name or trade</p>
        </div>
        {/* Selected chips preview in a scrollable area */}
        {recipients.length === 0 && (
          <div className="flex-1 flex items-center justify-center text-center px-4 pb-4">
            <div>
              <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-2">
                <Send size={16} className="text-slate-400"/>
              </div>
              <p className="text-xs text-slate-400 font-medium">No recipients yet</p>
              <p className="text-xs text-slate-300 mt-0.5">Type above to search workers</p>
            </div>
          </div>
        )}
        {recipients.length > 0 && (
          <div className="flex-1 overflow-y-auto px-4 pb-4 pt-1 space-y-1.5">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Selected</p>
            {recipients.map(w => {
              const name = w.first_name ? `${w.first_name} ${w.last_name}` : w.username
              return (
                <div key={w.id} className="flex items-center gap-2.5 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg group">
                  <WorkerAvatar worker={w} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-slate-700 truncate">{name}</div>
                    <div className="text-[10px] text-slate-400">{w.trade_name || '—'}</div>
                  </div>
                  <button onClick={() => setRecipients(r => r.filter(x => x.id !== w.id))}
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-red-500 rounded transition-all">
                    <X size={13}/>
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Sent Tasks Tab ────────────────────────────────────────────
function SentTasksTab() {
  const [sent, setSent]       = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState({})

  useEffect(() => { fetchSent() }, [])

  const fetchSent = async () => {
    setLoading(true)
    try { const r = await api.get('/hub/messages/sent'); setSent(r.data.messages||[]) }
    catch(_){} finally { setLoading(false) }
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 size={22} className="animate-spin text-slate-300"/></div>

  if (sent.length === 0) return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <Send size={36} className="text-slate-200 mb-3"/>
      <p className="text-sm font-semibold text-slate-400">No tasks sent yet</p>
      <p className="text-xs text-slate-300 mt-1">Switch to "New Task" to get started</p>
    </div>
  )

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50">
            {['Task','Project','Due','Priority','Recipients','Progress',''].map(h => (
              <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sent.map(task => {
            const total   = Number(task.total_recipients)||0
            const acked   = Number(task.acknowledged_count)||0
            const pending = Number(task.pending_count)||0
            const ackPct  = total>0 ? Math.round((acked/total)*100) : 0
            const isOpen  = expanded[task.id]

            return (
              <>
                <tr key={task.id} className="hover:bg-slate-50 cursor-pointer group"
                  onClick={() => setExpanded(p => ({...p, [task.id]: !p[task.id]}))}>

                  {/* Task */}
                  <td className="px-5 py-4">
                    <div className="text-sm font-semibold text-slate-800">{task.title}</div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {new Date(task.created_at).toLocaleDateString('en-CA',{month:'short',day:'numeric'})}
                      {task.file_url && <span className="ml-1.5 text-primary-light">· 📎</span>}
                    </div>
                  </td>

                  {/* Project */}
                  <td className="px-5 py-4 text-sm text-slate-600">{task.project_code || '—'}</td>

                  {/* Due */}
                  <td className="px-5 py-4">
                    {task.due_date
                      ? <span className="text-xs font-medium text-amber-600">{new Date(task.due_date).toLocaleDateString()}</span>
                      : <span className="text-xs text-slate-300">—</span>}
                  </td>

                  {/* Priority */}
                  <td className="px-5 py-4">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${PRIORITY_STYLE[task.priority]||PRIORITY_STYLE.NORMAL}`}>
                      {task.priority}
                    </span>
                  </td>

                  {/* Recipients avatars */}
                  <td className="px-5 py-4">
                    <div className="flex items-center -space-x-2">
                      {(task.recipients||[]).slice(0,5).map((r,i) => {
                        const n = r.first_name ? `${r.first_name} ${r.last_name}` : r.username
                        return (
                          <div key={i} title={n}
                            className={`w-7 h-7 rounded-full border-2 border-white flex items-center justify-center text-[10px] font-bold text-white ${workerAvatarColor({first_name: n})}`}>
                            {n[0]?.toUpperCase()}
                          </div>
                        )
                      })}
                      {total > 5 && (
                        <div className="w-7 h-7 rounded-full border-2 border-white bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-500">
                          +{total-5}
                        </div>
                      )}
                    </div>
                  </td>

                  {/* Progress */}
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-20 bg-slate-100 rounded-full h-1.5">
                        <div className={`h-1.5 rounded-full transition-all ${ackPct===100?'bg-emerald-500':'bg-primary-pale0'}`}
                          style={{width:`${ackPct}%`}}/>
                      </div>
                      <span className="text-xs text-slate-500 whitespace-nowrap">{acked}/{total}</span>
                      {pending > 0 && <Clock size={12} className="text-amber-400" title={`${pending} pending assignment`}/>}
                    </div>
                  </td>

                  <td className="px-5 py-4">
                    <ChevronRight size={15} className={`text-slate-300 transition-transform ${isOpen?'rotate-90':''}`}/>
                  </td>
                </tr>

                {/* Expanded */}
                {isOpen && (
                  <tr key={`${task.id}-exp`}>
                    <td colSpan={7} className="px-5 py-4 bg-slate-50/60 border-b border-slate-100">
                      <div className="space-y-3">
                        {task.body && (
                          <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-600">
                            {task.body}
                          </div>
                        )}
                        <div className="grid grid-cols-4 gap-2">
                          {(task.recipients||[]).map((r,i) => {
                            const n = r.first_name ? `${r.first_name} ${r.last_name}` : r.username
                            const isDone    = r.status==='ACKNOWLEDGED'
                            const isPending = r.status==='PENDING'
                            const isRead    = r.status==='READ'
                            return (
                              <div key={i} className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border ${
                                isDone   ? 'bg-emerald-50 border-emerald-200'
                                : isPending ? 'bg-amber-50 border-amber-200'
                                : isRead    ? 'bg-blue-50 border-blue-200'
                                : 'bg-white border-slate-200'
                              }`}>
                                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 ${
                                  isDone?'bg-emerald-500':isPending?'bg-amber-400':isRead?'bg-blue-500':'bg-slate-400'
                                }`}>{n[0]?.toUpperCase()}</div>
                                <div className="min-w-0">
                                  <div className="text-xs font-semibold text-slate-700 truncate">{n}</div>
                                  <div className={`text-[10px] font-semibold ${isDone?'text-emerald-600':isPending?'text-amber-600':isRead?'text-blue-600':'text-slate-400'}`}>
                                    {isDone?'✓ Done':isPending?'⏳ Awaiting':isRead?'👁 Seen':'📬 Sent'}
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                        {pending > 0 && (
                          <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
                            <Clock size={14} className="flex-shrink-0"/>
                            {pending} recipient{pending!==1?'s':''} will receive this task once assigned to the project
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────
export default function TaskRequestPage() {
  const [tab, setTab]               = useState('new')
  const [workers, setWorkers]       = useState([])
  const [projects, setProjects]     = useState([])
  const [defaultProject, setDefaultProject] = useState('')
  const [flash, setFlash]           = useState(null)

  useEffect(() => {
    api.get('/assignments/my-today')
      .then(r => {
        const asgn = r.data.assignment
        if (asgn) {
          setDefaultProject(String(asgn.project_id))
          setProjects([{ id: asgn.project_id, project_code: asgn.project_code, project_name: asgn.project_name }])
        } else {
          api.get('/hub/my-projects')
            .then(pr => setProjects(pr.data.projects || []))
            .catch(() => {})
        }
      })
      .catch(() => {})
    api.get('/hub/workers').then(r => setWorkers(r.data.workers||[])).catch(()=>{})
  }, [])

  const handleSent = (msg) => {
    setFlash(msg)
    setTab('sent')
    setTimeout(() => setFlash(null), 5000)
  }

  const tabs = [
    { id: 'new',  icon: Plus,          label: 'New Task' },
    { id: 'sent', icon: ClipboardList, label: 'Sent Tasks' },
  ]

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-50">

      {/* Header — matches Material Request style */}
      <div className="flex-shrink-0 bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center">
            <Send size={18} className="text-white"/>
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Task Request</h1>
            <p className="text-xs text-slate-400 mt-0.5">Send tasks and blueprints to your workers</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
                tab===t.id ? 'bg-primary text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
              }`}>
              <t.icon size={14}/>{t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {flash && (
          <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 mb-5">
            <Check size={15}/>{flash}
          </div>
        )}
        {tab==='new'  && <NewTaskTab workers={workers} projects={projects} defaultProject={defaultProject} onSent={handleSent}/>}
        {tab==='sent' && <SentTasksTab/>}
      </div>
    </div>
  )
}
