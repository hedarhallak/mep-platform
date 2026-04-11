import { useState, useEffect, useCallback } from 'react'
import api from '@/lib/api'
import { usePermissions } from '@/hooks/usePermissions.jsx'
import {
  Inbox, CalendarCheck, CheckCheck, Loader2, AlertCircle,
  Check, X, Clock, ChevronRight, RefreshCw, Briefcase, Package,
  FileText, ClipboardList, Eye, CheckCircle2, Upload,
  Plus, Search, Users
} from 'lucide-react'

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const todayStr = () => new Date().toISOString().split('T')[0]
function fmtTime(ts) {
  if (!ts) return 'â€”'
  return new Date(ts).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', hour12: true })
}
function fmtHours(h) {
  if (h == null) return 'â€”'
  const n = Number(h); if (isNaN(n)) return 'â€”'
  const hrs = Math.floor(n); const mins = Math.round((n - hrs) * 60)
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`
}
const TRADE_DOT = { PLUMBING:'#0ea5e9', ELECTRICAL:'#f59e0b', HVAC:'#10b981', CARPENTRY:'#f97316', GENERAL:'#64748b' }
const dot = c => TRADE_DOT[(c||'').toUpperCase()] || '#94a3b8'
const PRIORITY_STYLE = {
  LOW:'bg-slate-100 text-slate-500 border-slate-200',
  NORMAL:'bg-blue-50 text-blue-600 border-blue-200',
  HIGH:'bg-amber-50 text-amber-700 border-amber-200',
  URGENT:'bg-red-50 text-red-600 border-red-200',
}
const TYPE_ICON = { TASK: ClipboardList, BLUEPRINT: FileText, NOTE: Briefcase }

// â”€â”€ Attendance Tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function AttendanceApprovalTab() {
  const [date,      setDate]      = useState(todayStr())
  const [records,   setRecords]   = useState([])
  const [loading,   setLoading]   = useState(false)
  const [confirming,setConfirming]= useState(null)
  const [msg,       setMsg]       = useState(null)

  const flash = (text, type='success') => { setMsg({ type, text }); setTimeout(() => setMsg(null), 4000) }

  const fetchRecords = useCallback(async () => {
    setLoading(true); setMsg(null)
    try {
      const r = await api.get(`/attendance?date=${date}`)
      setRecords(r.data.records || [])
    } catch (e) { setMsg({ type:'error', text: e.response?.data?.message || e.message }) }
    finally { setLoading(false) }
  }, [date])

  useEffect(() => { fetchRecords() }, [fetchRecords])

  const handleConfirm = async (rec) => {
    setConfirming(rec.attendance_id)
    try {
      await api.patch(`/attendance/${rec.attendance_id}/confirm`, {
        regular_hours:  rec.regular_hours,
        overtime_hours: rec.overtime_hours,
      })
      flash('Confirmed âœ“')
      fetchRecords()
    } catch (e) { flash(e.response?.data?.message || e.message, 'error') }
    finally { setConfirming(null) }
  }

  const handleConfirmAll = async () => {
    const pending = records.filter(r => r.attendance_status === 'CHECKED_OUT' && r.attendance_id)
    if (!pending.length) return
    setConfirming('all')
    try {
      await Promise.all(pending.map(r =>
        api.patch(`/attendance/${r.attendance_id}/confirm`, {
          regular_hours:  r.regular_hours,
          overtime_hours: r.overtime_hours,
        })
      ))
      flash(`${pending.length} records confirmed âœ“`)
      fetchRecords()
    } catch (e) { flash(e.response?.data?.message || e.message, 'error') }
    finally { setConfirming(null) }
  }

  const pendingCount = records.filter(r => r.attendance_status === 'CHECKED_OUT').length

  const groups = Object.values(records.reduce((acc, r) => {
    const k = r.project_code || 'Unknown'
    if (!acc[k]) acc[k] = { project_code: r.project_code, project_name: r.project_name, records: [] }
    acc[k].records.push(r)
    return acc
  }, {}))

  const fmtT = (t) => {
    if (!t) return 'â€”'
    const str = String(t).substring(0, 5)
    const [h, m] = str.split(':').map(Number)
    const ap = h < 12 ? 'AM' : 'PM'
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
    return `${String(h12).padStart(2,'0')}:${String(m).padStart(2,'0')} ${ap}`
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          className="px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400" />
        <button onClick={fetchRecords} disabled={loading} className="p-2 bg-white border border-slate-200 rounded-lg text-slate-400 hover:bg-slate-50">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
        {pendingCount > 0 && (
          <button onClick={handleConfirmAll} disabled={confirming === 'all'}
            className="ml-auto flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 disabled:opacity-60">
            {confirming === 'all' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><CheckCheck className="w-3.5 h-3.5" />Confirm All ({pendingCount})</>}
          </button>
        )}
      </div>

      {msg && (
        <div className={`flex items-center gap-2 p-3 rounded-xl text-xs font-semibold ${msg.type==='error' ? 'bg-red-50 border border-red-100 text-red-600' : 'bg-emerald-50 border border-emerald-100 text-emerald-700'}`}>
          {msg.text}
        </div>
      )}

      {loading && <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>}

      {!loading && records.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <CalendarCheck className="w-10 h-10 text-slate-200 mb-3" />
          <p className="text-sm font-semibold text-slate-400">No records for {date}</p>
        </div>
      )}

      {!loading && groups.map(group => (
        <div key={group.project_code} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
            <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <Briefcase className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-sm font-bold text-slate-800">{group.project_code}</span>
            {group.project_name && <span className="text-xs text-slate-400">{group.project_name}</span>}
            <span className="ml-auto text-[10px] font-semibold px-2 py-1 bg-indigo-50 text-indigo-600 rounded-lg">
              {group.records.length} employees
            </span>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                {['Employee','In','Out','Regular','OT','Status',''].map(h => (
                  <th key={h} className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 py-2.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {group.records.map((r, i) => {
                const status = r.attendance_status || 'OPEN'
                const finalReg = r.confirmed_regular_hours  ?? r.regular_hours
                const finalOT  = r.confirmed_overtime_hours ?? r.overtime_hours
                return (
                  <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/60 last:border-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white"
                          style={{ background: dot(r.trade_code) }}>
                          {(r.full_name||'?')[0]}
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-slate-700">{r.full_name}</div>
                          <div className="text-[10px] text-slate-400">{r.assignment_role||'WORKER'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{fmtT(r.check_in_time)}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{fmtT(r.check_out_time)}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-slate-700">
                      {finalReg != null ? `${finalReg}h` : 'â€”'}
                    </td>
                    <td className="px-4 py-3">
                      {parseFloat(finalOT) > 0
                        ? <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">+{finalOT}h</span>
                        : <span className="text-xs text-slate-300">â€”</span>}
                    </td>
                    <td className="px-4 py-3">
                      {status === 'OPEN'        && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-400">Absent</span>}
                      {status === 'CHECKED_IN'  && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-600">On Site</span>}
                      {status === 'CHECKED_OUT' && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-600">Pending</span>}
                      {status === 'CONFIRMED'   && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">Confirmed</span>}
                      {status === 'ADJUSTED'    && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">Adjusted</span>}
                    </td>
                    <td className="px-4 py-3">
                      {status === 'CHECKED_OUT' && r.attendance_id && (
                        <button onClick={() => handleConfirm(r)} disabled={confirming === r.attendance_id}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-600 border border-emerald-200 hover:bg-emerald-50 rounded-lg whitespace-nowrap disabled:opacity-60">
                          {confirming === r.attendance_id ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Check className="w-3 h-3" />Confirm</>}
                        </button>
                      )}
                      {(status === 'CONFIRMED' || status === 'ADJUSTED') && (
                        <span className="text-[10px] text-slate-400">{r.confirmed_by_name || 'âœ“'}</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

// â”€â”€ Send Task Tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function SendTaskTab() {
  const [projects, setProjects] = useState([])
  const [workers, setWorkers]   = useState([])
  const [sent, setSent]         = useState([])
  const [loadingSent, setLoadingSent] = useState(true)
  const [sending, setSending]   = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [msg, setMsg]           = useState(null)
  const [workerSearch, setWorkerSearch] = useState('')
  const [expanded, setExpanded]   = useState({})
  const [file, setFile]         = useState(null)
  const [form, setForm] = useState({ title:'', body:'', type:'TASK', priority:'NORMAL', project_id:'', due_date:'', recipient_ids:[] })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const flash = (text, type='success') => { setMsg({ type, text }); setTimeout(() => setMsg(null), 4000) }

  const filteredWorkers = workerSearch.trim()
    ? workers.filter(w => `${w.first_name||''} ${w.last_name||''} ${w.username||''} ${w.trade_name||''}`.toLowerCase().includes(workerSearch.toLowerCase()))
    : workers

  useEffect(() => {
    api.get('/hub/my-projects').then(r => setProjects(r.data.projects || [])).catch(e => console.error('Failed to load projects:', e))
    api.get('/hub/workers').then(r => setWorkers(r.data.workers || [])).catch(e => console.error('Failed to load workers:', e))
    fetchSent()
  }, [])

  useEffect(() => {
    if (!form.project_id) return
    api.get(`/hub/workers?project_id=${form.project_id}`).then(r => setWorkers(r.data.workers || [])).catch(e => console.error('Failed to load project workers:', e))
  }, [form.project_id])

  const fetchSent = async () => {
    setLoadingSent(true)
    try { const r = await api.get('/hub/messages/sent'); setSent(r.data.messages || []) }
    catch (e) { console.error('Failed to load sent messages:', e) } finally { setLoadingSent(false) }
  }

  const toggleRecipient = id => set('recipient_ids', form.recipient_ids.includes(id) ? form.recipient_ids.filter(r => r !== id) : [...form.recipient_ids, id])
  const selectAll = () => set('recipient_ids', filteredWorkers.map(w => w.id))
  const clearAll  = () => set('recipient_ids', [])

  const resetForm = () => { setForm({ title:'', body:'', type:'TASK', priority:'NORMAL', project_id:'', due_date:'', recipient_ids:[] }); setFile(null); setWorkerSearch(''); setShowForm(false) }

  const handleSend = async () => {
    setMsg(null)
    if (!form.title.trim())         return flash('Title is required', 'error')
    if (!form.recipient_ids.length) return flash('Select at least one recipient', 'error')
    setSending(true)
    try {
      const fd = new FormData()
      fd.append('title', form.title.trim())
      fd.append('body', form.body.trim())
      fd.append('type', form.type)
      fd.append('priority', form.priority)
      fd.append('project_id', form.project_id || '')
      fd.append('due_date', form.due_date || '')
      fd.append('recipient_ids', JSON.stringify(form.recipient_ids))
      if (file) fd.append('file', file)
      const res = await api.post('/hub/messages', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      const d = res.data
      const text = d.pending > 0
        ? `Sent to ${d.sent} worker${d.sent!==1?'s':''} âœ“ â€” ${d.pending} pending assignment`
        : `Sent to ${d.sent} worker${d.sent!==1?'s':''} âœ“`
      flash(text)
      resetForm()
      fetchSent()
    } catch (e) { flash(e.response?.data?.error || e.message || 'Failed to send', 'error') }
    finally { setSending(false) }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-slate-700">Tasks & Blueprints</span>
          {sent.length > 0 && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{sent.length} sent</span>}
        </div>
        <button onClick={() => setShowForm(v => !v)}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${showForm ? 'text-slate-500 hover:bg-slate-100' : 'bg-slate-900 text-white hover:bg-slate-700'}`}>
          <Plus className="w-3.5 h-3.5" />{showForm ? 'Cancel' : 'New Task'}
        </button>
      </div>

      {msg && <div className={`flex items-center gap-2 p-3 rounded-xl text-xs font-semibold ${msg.type==='error' ? 'bg-red-50 border border-red-100 text-red-600' : 'bg-emerald-50 border border-emerald-100 text-emerald-700'}`}>{msg.text}</div>}

      {/* â”€â”€ Compose Form â”€â”€ */}
      {showForm && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">

          {/* Row 1: Type + Priority + Title */}
          <div className="p-4 border-b border-slate-100 space-y-3">
            <div className="flex items-center gap-3">
              {/* Type */}
              <div className="flex rounded-lg border border-slate-200 overflow-hidden">
                {[{v:'TASK',l:'Task'},{v:'BLUEPRINT',l:'Blueprint'},{v:'NOTE',l:'Note'}].map((t,i) => (
                  <button key={t.v} onClick={() => set('type', t.v)}
                    className={`px-3 py-1.5 text-xs font-semibold transition-colors ${t.v===form.type ? 'bg-slate-900 text-white' : 'text-slate-400 hover:bg-slate-50'} ${i>0?'border-l border-slate-200':''}`}>
                    {t.l}
                  </button>
                ))}
              </div>
              {/* Priority */}
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg">
                {[{v:'LOW',c:'bg-slate-300'},{v:'NORMAL',c:'bg-blue-400'},{v:'HIGH',c:'bg-amber-400'},{v:'URGENT',c:'bg-red-500'}].map(p => (
                  <button key={p.v} onClick={() => set('priority', p.v)} title={p.v}
                    className={`w-4 h-4 rounded-full transition-all ${p.c} ${form.priority===p.v ? 'ring-2 ring-offset-1 ring-slate-300 scale-125' : 'opacity-30 hover:opacity-70'}`} />
                ))}
                <span className="text-[10px] font-semibold text-slate-500 ml-1">{form.priority}</span>
              </div>
              {/* Due date â€” inline */}
              <input type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)}
                className="ml-auto px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-800 text-slate-500" />
            </div>
            <input type="text" value={form.title} onChange={e => set('title', e.target.value)}
              placeholder="Task title *"
              className="w-full px-3 py-2.5 text-sm font-medium border border-slate-200 rounded-lg placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900" />
            <textarea value={form.body} onChange={e => set('body', e.target.value)}
              rows={2} placeholder="Instructions for the worker (optional)..."
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900 resize-none" />
          </div>

          {/* Row 2: Project + File in one line */}
          <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3">
            <select value={form.project_id} onChange={e => { set('project_id', e.target.value); set('recipient_ids', []); setWorkerSearch('') }}
              className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-slate-900">
              <option value="">No project</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.project_code} â€” {p.project_name}</option>)}
            </select>
            <label className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors flex-shrink-0 ${file ? 'border-slate-900 bg-slate-50' : 'border-dashed border-slate-200 hover:border-slate-400'}`}>
              <Upload className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
              <span className={`text-xs truncate max-w-[140px] ${file ? 'text-slate-700 font-medium' : 'text-slate-400'}`}>
                {file ? file.name : 'Attach file'}
              </span>
              {file && <button type="button" onClick={e => { e.preventDefault(); setFile(null) }} className="text-slate-400 hover:text-red-500 flex-shrink-0"><X className="w-3 h-3" /></button>}
              <input type="file" accept=".pdf,image/*" className="hidden" onChange={e => setFile(e.target.files?.[0] || null)} />
            </label>
          </div>

          {/* Row 3: Recipients */}
          <div className="px-4 py-3 border-b border-slate-100">
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-700">Recipients</span>
                {form.recipient_ids.length > 0 && <span className="px-2 py-0.5 bg-slate-900 text-white rounded-full text-[10px] font-bold">{form.recipient_ids.length} selected</span>}
              </div>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="text" value={workerSearch} onChange={e => setWorkerSearch(e.target.value)}
                    placeholder="Search..."
                    className="pl-7 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg w-36 focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white" />
                </div>
                <button onClick={selectAll} className="text-[11px] text-indigo-600 hover:underline font-medium">All</button>
                <button onClick={clearAll} className="text-[11px] text-slate-400 hover:underline">Clear</button>
              </div>
            </div>
            {workers.length === 0
              ? <p className="text-xs text-slate-400 py-2 text-center">No workers found</p>
              : <div className="grid grid-cols-3 gap-1.5 max-h-40 overflow-y-auto">
                  {filteredWorkers
                    .sort((a,b) => (b.is_assigned?1:0)-(a.is_assigned?1:0))
                    .map(w => {
                      const selected = form.recipient_ids.includes(w.id)
                      const name = w.first_name ? `${w.first_name} ${w.last_name}` : w.username
                      return (
                        <button key={w.id} onClick={() => toggleRecipient(w.id)}
                          className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-all border ${selected ? 'bg-slate-900 border-slate-900' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}>
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${selected ? 'bg-white text-slate-900' : w.is_assigned ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                            {name[0]?.toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className={`text-xs font-semibold truncate ${selected ? 'text-white' : 'text-slate-700'}`}>{name}</div>
                            <div className={`text-[10px] truncate ${selected ? 'text-slate-400' : 'text-slate-400'}`}>
                              {w.trade_name || 'â€”'}{form.project_id && (w.is_assigned ? <span className="text-emerald-500"> âœ“</span> : <span className="text-amber-500"> â³</span>)}
                            </div>
                          </div>
                        </button>
                      )
                    })
                  }
                </div>
            }
          </div>

          {/* Footer */}
          <div className="px-4 py-3 bg-slate-50 flex items-center justify-between">
            <span className="text-xs text-slate-400">
              {form.recipient_ids.length === 0 ? 'Select at least one recipient' : `Ready to send to ${form.recipient_ids.length} worker${form.recipient_ids.length>1?'s':''}`}
            </span>
            <div className="flex gap-2">
              <button onClick={resetForm} className="px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-200 rounded-lg transition-colors">Cancel</button>
              <button onClick={handleSend} disabled={sending}
                className="flex items-center gap-2 px-5 py-2 bg-slate-900 hover:bg-slate-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold">
                {sending ? <><Loader2 className="w-3.5 h-3.5 animate-spin"/>Sending...</> : <><Send className="w-3.5 h-3.5"/>Send Task</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* â”€â”€ Sent List â€” card style like Material Requests â”€â”€ */}
      {loadingSent && <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-300" /></div>}
      {!loadingSent && sent.length === 0 && !showForm && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Send className="w-10 h-10 text-slate-200 mb-3" />
          <p className="text-sm font-semibold text-slate-400">No tasks sent yet</p>
          <p className="text-xs text-slate-300 mt-1">Create a task to send to your team</p>
        </div>
      )}
      {!loadingSent && sent.map(task => {
        const Icon    = TYPE_ICON[task.type] || ClipboardList
        const total   = Number(task.total_recipients) || 0
        const acked   = Number(task.acknowledged_count) || 0
        const pending = Number(task.pending_count) || 0
        const ackPct  = total > 0 ? Math.round((acked / total) * 100) : 0
        const isOpen  = expanded[task.id]

        return (
          <div key={task.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {/* Card header â€” clickable to expand */}
            <button onClick={() => setExpanded(p => ({...p, [task.id]: !p[task.id]}))}
              className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50 text-left">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                task.type==='BLUEPRINT' ? 'bg-cyan-100' : task.type==='NOTE' ? 'bg-slate-100' : 'bg-indigo-100'
              }`}>
                <Icon className={`w-4 h-4 ${task.type==='BLUEPRINT' ? 'text-cyan-600' : task.type==='NOTE' ? 'text-slate-500' : 'text-indigo-600'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-slate-800">{task.title}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${PRIORITY_STYLE[task.priority]||PRIORITY_STYLE.NORMAL}`}>{task.priority}</span>
                  {task.file_url && <span className="text-[10px] text-slate-400 flex items-center gap-0.5"><FileText className="w-3 h-3" />File</span>}
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400 flex-wrap">
                  <span>{new Date(task.created_at).toLocaleDateString('en-CA',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</span>
                  {task.project_code && <><span>·</span><span>{task.project_code}</span></>}
                  {task.due_date && <span className="text-amber-600">· Due {new Date(task.due_date).toLocaleDateString()}</span>}
                  <span>· {total} recipient{total!==1?'s':''}</span>
                </div>
              </div>
              {/* Mini progress */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="text-right">
                  <div className="text-xs font-bold text-slate-700">{ackPct}%</div>
                  <div className="text-[10px] text-slate-400">done</div>
                </div>
                <div className="w-10 h-10 flex-shrink-0 relative">
                  <svg viewBox="0 0 36 36" className="w-10 h-10 -rotate-90">
                    <circle cx="18" cy="18" r="15" fill="none" stroke="#f1f5f9" strokeWidth="3" />
                    <circle cx="18" cy="18" r="15" fill="none" stroke={ackPct===100?"#10b981":"#6366f1"} strokeWidth="3"
                      strokeDasharray={`${ackPct * 0.942} 94.2`} strokeLinecap="round" />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-[9px] font-bold text-slate-600">{acked}/{total}</span>
                  </div>
                </div>
                <ChevronRight className={`w-4 h-4 text-slate-300 transition-transform ${isOpen?'rotate-90':''}`} />
              </div>
            </button>

            {/* Expanded details */}
            {isOpen && (
              <div className="border-t border-slate-100 p-4 space-y-3">
                {/* Recipient statuses */}
                {task.recipients && task.recipients.length > 0 && (
                  <div>
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">Recipients</p>
                    <div className="space-y-1.5">
                      {task.recipients.map((r, i) => {
                        const rname = r.first_name ? `${r.first_name} ${r.last_name}` : r.username
                        const isPending = r.status === 'PENDING'
                        const isDone    = r.status === 'ACKNOWLEDGED'
                        const isRead    = r.status === 'READ'
                        return (
                          <div key={i} className={`rounded-xl border-l-4 p-3 ${isDone ? 'bg-emerald-50 border-emerald-400' : isPending ? 'bg-amber-50 border-amber-400' : isRead ? 'bg-blue-50 border-blue-400' : 'bg-slate-50 border-slate-300'}`}>
                            <div className="flex items-center gap-2.5">
                              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 ${isDone ? 'bg-emerald-500' : isPending ? 'bg-amber-400' : isRead ? 'bg-blue-500' : 'bg-slate-400'}`}>{rname[0]?.toUpperCase()}</div>
                              <span className="text-xs font-semibold text-slate-800 flex-1">{rname}</span>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isDone?'bg-emerald-100 text-emerald-700':isPending?'bg-amber-100 text-amber-700':isRead?'bg-blue-100 text-blue-700':'bg-slate-100 text-slate-500'}`}>
                                {isDone ? '✓ Done' : isPending ? 'Awaiting' : isRead ? 'Seen' : 'Sent'}
                              </span>
                              {r.acknowledged_at && <span className="text-[10px] text-slate-400">{new Date(r.acknowledged_at).toLocaleDateString()}</span>}
                            </div>
                            {r.completion_note && (
                              <div className="mt-2 flex items-start gap-2 bg-white rounded-lg px-3 py-2 border border-slate-100">
                                <span className="text-slate-400 text-xs mt-0.5">Note:</span>
                                <p className="text-xs text-slate-600 flex-1">{r.completion_note}</p>
                              </div>
                            )}
                            {r.completion_image_url && (
                              <div className="mt-2">
                                <a href={`/uploads${r.completion_image_url}`} target="_blank" rel="noopener noreferrer">
                                  <img src={`/uploads${r.completion_image_url}`} alt="Completion" className="rounded-lg max-h-40 object-cover border border-slate-200 hover:opacity-90 transition-opacity cursor-pointer w-full" />
                                  <p className="text-[10px] text-slate-400 mt-1">Click to view completion photo</p>
                                </a>
                              </div>
                            )}
                          </div>
                        )}
                      })import api from '@/lib/api'
import { usePermissions } from '@/hooks/usePermissions.jsx'
import {
  Inbox, CalendarCheck, CheckCheck, Loader2, AlertCircle,
  Check, X, Clock, ChevronRight, RefreshCw, Briefcase, Package,
  FileText, ClipboardList, Eye, CheckCircle2, Upload,
  Plus, Search, Users
} from 'lucide-react'

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const todayStr = () => new Date().toISOString().split('T')[0]
function fmtTime(ts) {
  if (!ts) return 'â€”'
  return new Date(ts).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', hour12: true })
}
function fmtHours(h) {
  if (h == null) return 'â€”'
  const n = Number(h); if (isNaN(n)) return 'â€”'
  const hrs = Math.floor(n); const mins = Math.round((n - hrs) * 60)
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`
}
const TRADE_DOT = { PLUMBING:'#0ea5e9', ELECTRICAL:'#f59e0b', HVAC:'#10b981', CARPENTRY:'#f97316', GENERAL:'#64748b' }
const dot = c => TRADE_DOT[(c||'').toUpperCase()] || '#94a3b8'
const PRIORITY_STYLE = {
  LOW:'bg-slate-100 text-slate-500 border-slate-200',
  NORMAL:'bg-blue-50 text-blue-600 border-blue-200',
  HIGH:'bg-amber-50 text-amber-700 border-amber-200',
  URGENT:'bg-red-50 text-red-600 border-red-200',
}
const TYPE_ICON = { TASK: ClipboardList, BLUEPRINT: FileText, NOTE: Briefcase }

// â”€â”€ Attendance Tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function AttendanceApprovalTab() {
  const [date,      setDate]      = useState(todayStr())
  const [records,   setRecords]   = useState([])
  const [loading,   setLoading]   = useState(false)
  const [confirming,setConfirming]= useState(null)
  const [msg,       setMsg]       = useState(null)

  const flash = (text, type='success') => { setMsg({ type, text }); setTimeout(() => setMsg(null), 4000) }

  const fetchRecords = useCallback(async () => {
    setLoading(true); setMsg(null)
    try {
      const r = await api.get(`/attendance?date=${date}`)
      setRecords(r.data.records || [])
    } catch (e) { setMsg({ type:'error', text: e.response?.data?.message || e.message }) }
    finally { setLoading(false) }
  }, [date])

  useEffect(() => { fetchRecords() }, [fetchRecords])

  const handleConfirm = async (rec) => {
    setConfirming(rec.attendance_id)
    try {
      await api.patch(`/attendance/${rec.attendance_id}/confirm`, {
        regular_hours:  rec.regular_hours,
        overtime_hours: rec.overtime_hours,
      })
      flash('Confirmed âœ“')
      fetchRecords()
    } catch (e) { flash(e.response?.data?.message || e.message, 'error') }
    finally { setConfirming(null) }
  }

  const handleConfirmAll = async () => {
    const pending = records.filter(r => r.attendance_status === 'CHECKED_OUT' && r.attendance_id)
    if (!pending.length) return
    setConfirming('all')
    try {
      await Promise.all(pending.map(r =>
        api.patch(`/attendance/${r.attendance_id}/confirm`, {
          regular_hours:  r.regular_hours,
          overtime_hours: r.overtime_hours,
        })
      ))
      flash(`${pending.length} records confirmed âœ“`)
      fetchRecords()
    } catch (e) { flash(e.response?.data?.message || e.message, 'error') }
    finally { setConfirming(null) }
  }

  const pendingCount = records.filter(r => r.attendance_status === 'CHECKED_OUT').length

  const groups = Object.values(records.reduce((acc, r) => {
    const k = r.project_code || 'Unknown'
    if (!acc[k]) acc[k] = { project_code: r.project_code, project_name: r.project_name, records: [] }
    acc[k].records.push(r)
    return acc
  }, {}))

  const fmtT = (t) => {
    if (!t) return 'â€”'
    const str = String(t).substring(0, 5)
    const [h, m] = str.split(':').map(Number)
    const ap = h < 12 ? 'AM' : 'PM'
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
    return `${String(h12).padStart(2,'0')}:${String(m).padStart(2,'0')} ${ap}`
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          className="px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400" />
        <button onClick={fetchRecords} disabled={loading} className="p-2 bg-white border border-slate-200 rounded-lg text-slate-400 hover:bg-slate-50">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
        {pendingCount > 0 && (
          <button onClick={handleConfirmAll} disabled={confirming === 'all'}
            className="ml-auto flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 disabled:opacity-60">
            {confirming === 'all' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><CheckCheck className="w-3.5 h-3.5" />Confirm All ({pendingCount})</>}
          </button>
        )}
      </div>

      {msg && (
        <div className={`flex items-center gap-2 p-3 rounded-xl text-xs font-semibold ${msg.type==='error' ? 'bg-red-50 border border-red-100 text-red-600' : 'bg-emerald-50 border border-emerald-100 text-emerald-700'}`}>
          {msg.text}
        </div>
      )}

      {loading && <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>}

      {!loading && records.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <CalendarCheck className="w-10 h-10 text-slate-200 mb-3" />
          <p className="text-sm font-semibold text-slate-400">No records for {date}</p>
        </div>
      )}

      {!loading && groups.map(group => (
        <div key={group.project_code} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
            <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <Briefcase className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-sm font-bold text-slate-800">{group.project_code}</span>
            {group.project_name && <span className="text-xs text-slate-400">{group.project_name}</span>}
            <span className="ml-auto text-[10px] font-semibold px-2 py-1 bg-indigo-50 text-indigo-600 rounded-lg">
              {group.records.length} employees
            </span>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                {['Employee','In','Out','Regular','OT','Status',''].map(h => (
                  <th key={h} className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 py-2.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {group.records.map((r, i) => {
                const status = r.attendance_status || 'OPEN'
                const finalReg = r.confirmed_regular_hours  ?? r.regular_hours
                const finalOT  = r.confirmed_overtime_hours ?? r.overtime_hours
                return (
                  <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/60 last:border-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white"
                          style={{ background: dot(r.trade_code) }}>
                          {(r.full_name||'?')[0]}
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-slate-700">{r.full_name}</div>
                          <div className="text-[10px] text-slate-400">{r.assignment_role||'WORKER'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{fmtT(r.check_in_time)}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{fmtT(r.check_out_time)}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-slate-700">
                      {finalReg != null ? `${finalReg}h` : 'â€”'}
                    </td>
                    <td className="px-4 py-3">
                      {parseFloat(finalOT) > 0
                        ? <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">+{finalOT}h</span>
                        : <span className="text-xs text-slate-300">â€”</span>}
                    </td>
                    <td className="px-4 py-3">
                      {status === 'OPEN'        && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-400">Absent</span>}
                      {status === 'CHECKED_IN'  && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-600">On Site</span>}
                      {status === 'CHECKED_OUT' && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-600">Pending</span>}
                      {status === 'CONFIRMED'   && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">Confirmed</span>}
                      {status === 'ADJUSTED'    && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">Adjusted</span>}
                    </td>
                    <td className="px-4 py-3">
                      {status === 'CHECKED_OUT' && r.attendance_id && (
                        <button onClick={() => handleConfirm(r)} disabled={confirming === r.attendance_id}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-600 border border-emerald-200 hover:bg-emerald-50 rounded-lg whitespace-nowrap disabled:opacity-60">
                          {confirming === r.attendance_id ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Check className="w-3 h-3" />Confirm</>}
                        </button>
                      )}
                      {(status === 'CONFIRMED' || status === 'ADJUSTED') && (
                        <span className="text-[10px] text-slate-400">{r.confirmed_by_name || 'âœ“'}</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

// â”€â”€ Send Task Tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function SendTaskTab() {
  const [projects, setProjects] = useState([])
  const [workers, setWorkers]   = useState([])
  const [sent, setSent]         = useState([])
  const [loadingSent, setLoadingSent] = useState(true)
  const [sending, setSending]   = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [msg, setMsg]           = useState(null)
  const [workerSearch, setWorkerSearch] = useState('')
  const [expanded, setExpanded]   = useState({})
  const [file, setFile]         = useState(null)
  const [form, setForm] = useState({ title:'', body:'', type:'TASK', priority:'NORMAL', project_id:'', due_date:'', recipient_ids:[] })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const flash = (text, type='success') => { setMsg({ type, text }); setTimeout(() => setMsg(null), 4000) }

  const filteredWorkers = workerSearch.trim()
    ? workers.filter(w => `${w.first_name||''} ${w.last_name||''} ${w.username||''} ${w.trade_name||''}`.toLowerCase().includes(workerSearch.toLowerCase()))
    : workers

  useEffect(() => {
    api.get('/hub/my-projects').then(r => setProjects(r.data.projects || [])).catch(e => console.error('Failed to load projects:', e))
    api.get('/hub/workers').then(r => setWorkers(r.data.workers || [])).catch(e => console.error('Failed to load workers:', e))
    fetchSent()
  }, [])

  useEffect(() => {
    if (!form.project_id) return
    api.get(`/hub/workers?project_id=${form.project_id}`).then(r => setWorkers(r.data.workers || [])).catch(e => console.error('Failed to load project workers:', e))
  }, [form.project_id])

  const fetchSent = async () => {
    setLoadingSent(true)
    try { const r = await api.get('/hub/messages/sent'); setSent(r.data.messages || []) }
    catch (e) { console.error('Failed to load sent messages:', e) } finally { setLoadingSent(false) }
  }

  const toggleRecipient = id => set('recipient_ids', form.recipient_ids.includes(id) ? form.recipient_ids.filter(r => r !== id) : [...form.recipient_ids, id])
  const selectAll = () => set('recipient_ids', filteredWorkers.map(w => w.id))
  const clearAll  = () => set('recipient_ids', [])

  const resetForm = () => { setForm({ title:'', body:'', type:'TASK', priority:'NORMAL', project_id:'', due_date:'', recipient_ids:[] }); setFile(null); setWorkerSearch(''); setShowForm(false) }

  const handleSend = async () => {
    setMsg(null)
    if (!form.title.trim())         return flash('Title is required', 'error')
    if (!form.recipient_ids.length) return flash('Select at least one recipient', 'error')
    setSending(true)
    try {
      const fd = new FormData()
      fd.append('title', form.title.trim())
      fd.append('body', form.body.trim())
      fd.append('type', form.type)
      fd.append('priority', form.priority)
      fd.append('project_id', form.project_id || '')
      fd.append('due_date', form.due_date || '')
      fd.append('recipient_ids', JSON.stringify(form.recipient_ids))
      if (file) fd.append('file', file)
      const res = await api.post('/hub/messages', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      const d = res.data
      const text = d.pending > 0
        ? `Sent to ${d.sent} worker${d.sent!==1?'s':''} âœ“ â€” ${d.pending} pending assignment`
        : `Sent to ${d.sent} worker${d.sent!==1?'s':''} âœ“`
      flash(text)
      resetForm()
      fetchSent()
    } catch (e) { flash(e.response?.data?.error || e.message || 'Failed to send', 'error') }
    finally { setSending(false) }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-slate-700">Tasks & Blueprints</span>
          {sent.length > 0 && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{sent.length} sent</span>}
        </div>
        <button onClick={() => setShowForm(v => !v)}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${showForm ? 'text-slate-500 hover:bg-slate-100' : 'bg-slate-900 text-white hover:bg-slate-700'}`}>
          <Plus className="w-3.5 h-3.5" />{showForm ? 'Cancel' : 'New Task'}
        </button>
      </div>

      {msg && <div className={`flex items-center gap-2 p-3 rounded-xl text-xs font-semibold ${msg.type==='error' ? 'bg-red-50 border border-red-100 text-red-600' : 'bg-emerald-50 border border-emerald-100 text-emerald-700'}`}>{msg.text}</div>}

      {/* â”€â”€ Compose Form â”€â”€ */}
      {showForm && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">

          {/* Row 1: Type + Priority + Title */}
          <div className="p-4 border-b border-slate-100 space-y-3">
            <div className="flex items-center gap-3">
              {/* Type */}
              <div className="flex rounded-lg border border-slate-200 overflow-hidden">
                {[{v:'TASK',l:'Task'},{v:'BLUEPRINT',l:'Blueprint'},{v:'NOTE',l:'Note'}].map((t,i) => (
                  <button key={t.v} onClick={() => set('type', t.v)}
                    className={`px-3 py-1.5 text-xs font-semibold transition-colors ${t.v===form.type ? 'bg-slate-900 text-white' : 'text-slate-400 hover:bg-slate-50'} ${i>0?'border-l border-slate-200':''}`}>
                    {t.l}
                  </button>
                ))}
              </div>
              {/* Priority */}
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg">
                {[{v:'LOW',c:'bg-slate-300'},{v:'NORMAL',c:'bg-blue-400'},{v:'HIGH',c:'bg-amber-400'},{v:'URGENT',c:'bg-red-500'}].map(p => (
                  <button key={p.v} onClick={() => set('priority', p.v)} title={p.v}
                    className={`w-4 h-4 rounded-full transition-all ${p.c} ${form.priority===p.v ? 'ring-2 ring-offset-1 ring-slate-300 scale-125' : 'opacity-30 hover:opacity-70'}`} />
                ))}
                <span className="text-[10px] font-semibold text-slate-500 ml-1">{form.priority}</span>
              </div>
              {/* Due date â€” inline */}
              <input type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)}
                className="ml-auto px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-800 text-slate-500" />
            </div>
            <input type="text" value={form.title} onChange={e => set('title', e.target.value)}
              placeholder="Task title *"
              className="w-full px-3 py-2.5 text-sm font-medium border border-slate-200 rounded-lg placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900" />
            <textarea value={form.body} onChange={e => set('body', e.target.value)}
              rows={2} placeholder="Instructions for the worker (optional)..."
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900 resize-none" />
          </div>

          {/* Row 2: Project + File in one line */}
          <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3">
            <select value={form.project_id} onChange={e => { set('project_id', e.target.value); set('recipient_ids', []); setWorkerSearch('') }}
              className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-slate-900">
              <option value="">No project</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.project_code} â€” {p.project_name}</option>)}
            </select>
            <label className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors flex-shrink-0 ${file ? 'border-slate-900 bg-slate-50' : 'border-dashed border-slate-200 hover:border-slate-400'}`}>
              <Upload className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
              <span className={`text-xs truncate max-w-[140px] ${file ? 'text-slate-700 font-medium' : 'text-slate-400'}`}>
                {file ? file.name : 'Attach file'}
              </span>
              {file && <button type="button" onClick={e => { e.preventDefault(); setFile(null) }} className="text-slate-400 hover:text-red-500 flex-shrink-0"><X className="w-3 h-3" /></button>}
              <input type="file" accept=".pdf,image/*" className="hidden" onChange={e => setFile(e.target.files?.[0] || null)} />
            </label>
          </div>

          {/* Row 3: Recipients */}
          <div className="px-4 py-3 border-b border-slate-100">
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-700">Recipients</span>
                {form.recipient_ids.length > 0 && <span className="px-2 py-0.5 bg-slate-900 text-white rounded-full text-[10px] font-bold">{form.recipient_ids.length} selected</span>}
              </div>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="text" value={workerSearch} onChange={e => setWorkerSearch(e.target.value)}
                    placeholder="Search..."
                    className="pl-7 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg w-36 focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white" />
                </div>
                <button onClick={selectAll} className="text-[11px] text-indigo-600 hover:underline font-medium">All</button>
                <button onClick={clearAll} className="text-[11px] text-slate-400 hover:underline">Clear</button>
              </div>
            </div>
            {workers.length === 0
              ? <p className="text-xs text-slate-400 py-2 text-center">No workers found</p>
              : <div className="grid grid-cols-3 gap-1.5 max-h-40 overflow-y-auto">
                  {filteredWorkers
                    .sort((a,b) => (b.is_assigned?1:0)-(a.is_assigned?1:0))
                    .map(w => {
                      const selected = form.recipient_ids.includes(w.id)
                      const name = w.first_name ? `${w.first_name} ${w.last_name}` : w.username
                      return (
                        <button key={w.id} onClick={() => toggleRecipient(w.id)}
                          className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-all border ${selected ? 'bg-slate-900 border-slate-900' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}>
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${selected ? 'bg-white text-slate-900' : w.is_assigned ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                            {name[0]?.toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className={`text-xs font-semibold truncate ${selected ? 'text-white' : 'text-slate-700'}`}>{name}</div>
                            <div className={`text-[10px] truncate ${selected ? 'text-slate-400' : 'text-slate-400'}`}>
                              {w.trade_name || 'â€”'}{form.project_id && (w.is_assigned ? <span className="text-emerald-500"> âœ“</span> : <span className="text-amber-500"> â³</span>)}
                            </div>
                          </div>
                        </button>
                      )
                    })
                  }
                </div>
            }
          </div>

          {/* Footer */}
          <div className="px-4 py-3 bg-slate-50 flex items-center justify-between">
            <span className="text-xs text-slate-400">
              {form.recipient_ids.length === 0 ? 'Select at least one recipient' : `Ready to send to ${form.recipient_ids.length} worker${form.recipient_ids.length>1?'s':''}`}
            </span>
            <div className="flex gap-2">
              <button onClick={resetForm} className="px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-200 rounded-lg transition-colors">Cancel</button>
              <button onClick={handleSend} disabled={sending}
                className="flex items-center gap-2 px-5 py-2 bg-slate-900 hover:bg-slate-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold">
                {sending ? <><Loader2 className="w-3.5 h-3.5 animate-spin"/>Sending...</> : <><Send className="w-3.5 h-3.5"/>Send Task</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* â”€â”€ Sent List â€” card style like Material Requests â”€â”€ */}
      {loadingSent && <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-300" /></div>}
      {!loadingSent && sent.length === 0 && !showForm && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Send className="w-10 h-10 text-slate-200 mb-3" />
          <p className="text-sm font-semibold text-slate-400">No tasks sent yet</p>
          <p className="text-xs text-slate-300 mt-1">Create a task to send to your team</p>
        </div>
      )}
      {!loadingSent && sent.map(task => {
        const Icon    = TYPE_ICON[task.type] || ClipboardList
        const total   = Number(task.total_recipients) || 0
        const acked   = Number(task.acknowledged_count) || 0
        const pending = Number(task.pending_count) || 0
        const ackPct  = total > 0 ? Math.round((acked / total) * 100) : 0
        const isOpen  = expanded[task.id]

        return (
          <div key={task.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {/* Card header â€” clickable to expand */}
            <button onClick={() => setExpanded(p => ({...p, [task.id]: !p[task.id]}))}
              className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50 text-left">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                task.type==='BLUEPRINT' ? 'bg-cyan-100' : task.type==='NOTE' ? 'bg-slate-100' : 'bg-indigo-100'
              }`}>
                <Icon className={`w-4 h-4 ${task.type==='BLUEPRINT' ? 'text-cyan-600' : task.type==='NOTE' ? 'text-slate-500' : 'text-indigo-600'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-slate-800">{task.title}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${PRIORITY_STYLE[task.priority]||PRIORITY_STYLE.NORMAL}`}>{task.priority}</span>
                  {task.file_url && <span className="text-[10px] text-slate-400 flex items-center gap-0.5"><FileText className="w-3 h-3" />File</span>}
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400 flex-wrap">
                  <span>{new Date(task.created_at).toLocaleDateString('en-CA',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</span>
                  {task.project_code && <><span>·</span><span>{task.project_code}</span></>}
                  {task.due_date && <span className="text-amber-600">· Due {new Date(task.due_date).toLocaleDateString()}</span>}
                  <span>· {total} recipient{total!==1?'s':''}</span>
                </div>
              </div>
              {/* Mini progress */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="text-right">
                  <div className="text-xs font-bold text-slate-700">{ackPct}%</div>
                  <div className="text-[10px] text-slate-400">done</div>
                </div>
                <div className="w-10 h-10 flex-shrink-0 relative">
                  <svg viewBox="0 0 36 36" className="w-10 h-10 -rotate-90">
                    <circle cx="18" cy="18" r="15" fill="none" stroke="#f1f5f9" strokeWidth="3" />
                    <circle cx="18" cy="18" r="15" fill="none" stroke={ackPct===100?"#10b981":"#6366f1"} strokeWidth="3"
                      strokeDasharray={`${ackPct * 0.942} 94.2`} strokeLinecap="round" />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-[9px] font-bold text-slate-600">{acked}/{total}</span>
                  </div>
                </div>
                <ChevronRight className={`w-4 h-4 text-slate-300 transition-transform ${isOpen?'rotate-90':''}`} />
              </div>
            </button>

            {/* Expanded details */}
            {isOpen && (
              <div className="border-t border-slate-100 p-4 space-y-3">
                {/* Recipient statuses */}
                {task.recipients && task.recipients.length > 0 && (
                  <div>
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">Recipients</p>
                    <div className="space-y-1.5">
                      {task.recipients.map((r, i) => {
                        const rname = r.first_name ? `${r.first_name} ${r.last_name}` : r.username
                        const isPending = r.status === 'PENDING'
                        const isDone    = r.status === 'ACKNOWLEDGED'
                        const isRead    = r.status === 'READ'
                        return (
                          <div key={i} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg ${
                            isDone ? 'bg-emerald-50' : isPending ? 'bg-amber-50' : isRead ? 'bg-blue-50' : 'bg-slate-50'
                          }`}>
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 ${
                              isDone ? 'bg-emerald-500' : isPending ? 'bg-amber-400' : isRead ? 'bg-blue-500' : 'bg-slate-400'
                            }`}>{rname[0]?.toUpperCase()}</div>
                            <span className="text-xs font-medium text-slate-700 flex-1">{rname}</span>
                            <span className={`text-[10px] font-semibold ${isDone?'text-emerald-600':isPending?'text-amber-600':isRead?'text-blue-600':'text-slate-500'}`}>
                              {isDone ? 'âœ“ Done' : isPending ? 'â³ Awaiting assignment' : isRead ? 'ðŸ‘ Seen' : 'ðŸ“¬ Sent'}
                            </span>
                            {r.acknowledged_at && <span className="text-[10px] text-slate-400">{new Date(r.acknowledged_at).toLocaleDateString()}</span>}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
                {pending > 0 && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 rounded-lg text-xs text-amber-700">
                    <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{pending} recipient{pending!==1?'s':''} will receive this task once assigned to the project</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// â”€â”€ Worker Inbox Tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function WorkerInboxTab() {
  const [messages, setMessages] = useState([])
  const [loading, setLoading]   = useState(true)
  const [expanded, setExpanded] = useState({})
  const [acking, setAcking]     = useState({})
  const [completing, setCompleting] = useState({})
  const [completionNote, setCompletionNote] = useState({})
  const [completionFile, setCompletionFile] = useState({})

  const fetchInbox = useCallback(async () => {
    setLoading(true)
    try { const r = await api.get('/hub/messages/inbox'); setMessages(r.data.messages || []) }
    catch (e) { console.error('Failed to load inbox:', e) } finally { setLoading(false) }
  }, [])
  useEffect(() => { fetchInbox() }, [fetchInbox])

  const handleExpand = async (msg) => {
    const isOpen = expanded[msg.id]
    setExpanded(p => ({ ...p, [msg.id]: !isOpen }))
    if (!isOpen && msg.status === 'SENT') {
      try {
        await api.patch(`/hub/messages/${msg.id}/read`)
        setMessages(prev => prev.map(m => m.id===msg.id ? {...m, status:'READ'} : m))
      } catch (e) { console.error('Failed to mark message as read:', e) }
    }
  }

  const handleAck = async (msgId) => {
    setAcking(p => ({ ...p, [msgId]: true }))
    try {
      await api.patch(`/hub/messages/${msgId}/ack`)
      setMessages(prev => prev.map(m => m.id===msgId ? {...m, status:'ACKNOWLEDGED', acknowledged_at: new Date().toISOString()} : m))
    } catch (e) { console.error('Failed to acknowledge message:', e) } finally { setAcking(p => ({ ...p, [msgId]: false })) }
  }

  const handleComplete = async (msgId) => {
    setCompleting(p => ({ ...p, [msgId]: true }))
    try {
      const fd = new FormData()
      if (completionNote[msgId]?.trim()) fd.append('completion_note', completionNote[msgId].trim())
      if (completionFile[msgId]) fd.append('completion_image', completionFile[msgId])
      await api.patch(`/hub/messages/${msgId}/complete`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setMessages(prev => prev.map(m => m.id===msgId ? {...m, status:'ACKNOWLEDGED', acknowledged_at: new Date().toISOString()} : m))
      setCompletionNote(p => ({ ...p, [msgId]: '' }))
      setCompletionFile(p => ({ ...p, [msgId]: null }))
    } catch (e) { console.error('Failed to complete task:', e) } finally { setCompleting(p => ({ ...p, [msgId]: false })) }
  }

  const unread = messages.filter(m => m.status==='SENT').length

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-bold text-slate-700">My Tasks</span>
        {unread > 0 && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">{unread} new</span>}
        <button onClick={fetchInbox} className="ml-auto p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg"><RefreshCw className="w-3.5 h-3.5" /></button>
      </div>
      {loading && <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>}
      {!loading && messages.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Inbox className="w-10 h-10 text-slate-200 mb-3" />
          <p className="text-sm font-semibold text-slate-400">No tasks yet</p>
          <p className="text-xs text-slate-300 mt-1">Tasks from your foreman will appear here</p>
        </div>
      )}
      {!loading && messages.map(msg => {
        const Icon   = TYPE_ICON[msg.type] || ClipboardList
        const isOpen = expanded[msg.id]
        const isNew  = msg.status === 'SENT'
        const isDone = msg.status === 'ACKNOWLEDGED'
        const sender = msg.sender_first ? `${msg.sender_first} ${msg.sender_last}` : msg.sender_username
        return (
          <div key={msg.id} className={`bg-white rounded-xl border overflow-hidden ${isNew ? 'border-amber-200 shadow-sm' : 'border-slate-200'}`}>
            <button onClick={() => handleExpand(msg)} className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50 text-left">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isDone ? 'bg-emerald-100' : isNew ? 'bg-amber-100' : 'bg-slate-100'}`}>
                <Icon className={`w-4 h-4 ${isDone ? 'text-emerald-600' : isNew ? 'text-amber-600' : 'text-slate-500'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-sm font-semibold ${isNew ? 'text-slate-900' : 'text-slate-700'}`}>{msg.title}</span>
                  {isDone ? <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700"><CheckCircle2 className="w-3 h-3" />Done</span>
                    : isNew ? <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700"><Clock className="w-3 h-3" />New</span>
                    : <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-600"><Eye className="w-3 h-3" />Read</span>}
                  <PriorityBadge priority={msg.priority} />
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5 flex gap-2">
                  <span>From {sender}</span>
                  {msg.project_code && <><span>·</span><span>{msg.project_code}</span></>}
                  {msg.due_date && <span className="text-amber-600">· Due {new Date(msg.due_date).toLocaleDateString()}</span>}
                </div>
              </div>
              <ChevronRight className={`w-4 h-4 text-slate-300 flex-shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
            </button>
            {isOpen && (
              <div className="border-t border-slate-100 p-4 space-y-3">
                {msg.body && <div className="bg-slate-50 rounded-lg p-3"><p className="text-xs font-semibold text-slate-500 mb-1">Instructions</p><p className="text-sm text-slate-700 whitespace-pre-wrap">{msg.body}</p></div>}
                {msg.file_url && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 mb-2">Attached File</p>
                    {msg.file_type?.startsWith('image/')
                      ? <img src={`/uploads${msg.file_url}`} alt={msg.file_name} className="max-w-full rounded-lg border border-slate-200 max-h-96 object-contain" />
                      : <a href={`/uploads${msg.file_url}`} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-3 px-4 py-3 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors">
                          <FileText className="w-5 h-5 text-indigo-600 flex-shrink-0" />
                          <div className="flex-1 min-w-0"><p className="text-sm font-semibold text-indigo-700 truncate">{msg.file_name}</p><p className="text-xs text-indigo-500">Click to open</p></div>
                          <ChevronRight className="w-4 h-4 text-indigo-400" />
                        </a>}
                  </div>
                )}
                {!isDone ? (
                  <div className="space-y-2 pt-2 border-t border-slate-100">
                    <textarea
                      value={completionNote[msg.id] || ''}
                      onChange={e => setCompletionNote(p => ({...p, [msg.id]: e.target.value}))}
                      rows={2} placeholder="Completion notes (optional)..."
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                    />
                    <label className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${completionFile[msg.id] ? 'border-emerald-400 bg-emerald-50' : 'border-dashed border-slate-200 hover:border-slate-400'}`}>
                      <Upload className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                      <span className={`text-xs truncate flex-1 ${completionFile[msg.id] ? 'text-emerald-700 font-medium' : 'text-slate-400'}`}>
                        {completionFile[msg.id] ? completionFile[msg.id].name : 'Add completion photo (optional)'}
                      </span>
                      {completionFile[msg.id] && <button type="button" onClick={e => { e.preventDefault(); setCompletionFile(p => ({...p,[msg.id]:null})) }} className="text-slate-400 hover:text-red-500"><X className="w-3 h-3" /></button>}
                      <input type="file" accept="image/*" className="hidden" onChange={e => setCompletionFile(p => ({...p,[msg.id]:e.target.files?.[0]||null}))} />
                    </label>
                    <button onClick={() => handleComplete(msg.id)} disabled={completing[msg.id]}
                      className="w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-lg text-sm font-semibold">
                      {completing[msg.id] ? <><Loader2 className="w-4 h-4 animate-spin" />Completing...</> : <><CheckCircle2 className="w-4 h-4" />Mark Complete</>}
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2 py-2 text-emerald-600 text-sm font-semibold">
                    <CheckCircle2 className="w-4 h-4" />Completed {msg.acknowledged_at ? new Date(msg.acknowledged_at).toLocaleDateString() : ''}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// â”€â”€ Materials Inbox Tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function InboxTab() {
  const [requests, setRequests] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState({})
  const [mergedItems, setMergedItems] = useState(null)
  const [surplus, setSurplus] = useState({})
  const [sendModal, setSendModal] = useState(false)
  const [sendTarget, setSendTarget] = useState('')
  const [sendNote, setSendNote] = useState('')
  const [sendPoNumber, setSendPoNumber] = useState('')
  const [sending, setSending] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')

  const fetchInbox = async () => {
    setLoading(true); setError('')
    try {
      const [ir, sr] = await Promise.all([api.get('/materials/inbox'), api.get('/suppliers')])
      setRequests(ir.data.requests || []); setSuppliers(sr.data.suppliers || []); setMergedItems(null)
    } catch (e) { setError(e.response?.data?.message || e.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { fetchInbox() }, [])

  const flash = msg => { setSuccessMsg(msg); setTimeout(() => setSuccessMsg(''), 4000) }
  const toggleExpand = id => setExpanded(p => ({ ...p, [id]: !p[id] }))
  const pending = requests.filter(r => r.status==='PENDING' || r.status==='REVIEWED')

  const handleMerge = async () => {
    const map = {}
    for (const req of pending) for (const item of (req.items||[])) {
      const key = `${item.item_name.toLowerCase()}__${item.unit}`
      if (!map[key]) map[key] = { item_name: item.item_name, quantity: 0, unit: item.unit, sources: [] }
      map[key].quantity += Number(item.quantity)
      map[key].sources.push({ requester: req.requester_name, qty: Number(item.quantity) })
    }
    const merged = Object.values(map); setMergedItems(merged)
    const sm = {}
    for (const item of merged) {
      try { const r = await api.get(`/materials/surplus?item_name=${encodeURIComponent(item.item_name)}`); if (r.data.surplus?.length) sm[item.item_name.toLowerCase()] = r.data.surplus } catch (e) { console.error('Failed to check surplus:', e) }
    }
    setSurplus(sm)
  }

  const handleSend = async () => {
    if (!sendTarget) return
    // PO Number required when sending to supplier
    if (sendTarget !== 'procurement' && !sendPoNumber.trim()) {
      alert('PO Number is required when sending to a supplier.')
      return
    }
    setSending(true)
    try {
      const ids = pending.map(r => r.id).join(',')
      const params = new URLSearchParams({ request_ids: ids })
      if (sendTarget !== 'procurement') params.set('supplier_id', sendTarget)
      if (sendNote) params.set('note', sendNote)
      if (sendPoNumber.trim()) params.set('po_number', sendPoNumber.trim())
      const d = (await api.get(`/materials/pdf-data?${params}`)).data.pdf_data
      const html = (() => {
        const itemRows = (d.items||[]).map((it,i) => `
          <tr style="background:${i%2===0?'#f8fafc':'#fff'}">
            <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:13px">${i+1}</td>
            <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:13px;font-weight:500">${it.item_name}</td>
            <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#4f46e5;font-weight:700;text-align:center">${it.quantity}</td>
            <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:13px;text-align:center">${it.unit}</td>
          </tr>`).join('')

        const toSection = d.supplier
          ? `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px;margin-bottom:16px">
              <div style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;margin-bottom:8px">To â€” Supplier</div>
              <div style="font-size:14px;font-weight:700">${d.supplier.name}</div>
              ${d.supplier.email ? `<div style="font-size:12px;color:#64748b">âœ‰ ${d.supplier.email}</div>` : ''}
              ${d.supplier.phone ? `<div style="font-size:12px;color:#64748b">ðŸ“ž ${d.supplier.phone}</div>` : ''}
              ${d.supplier.address ? `<div style="font-size:12px;color:#64748b">ðŸ“ ${d.supplier.address}</div>` : ''}
            </div>`
          : `<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px;margin-bottom:16px">
              <div style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;margin-bottom:8px">To â€” Internal</div>
              <div style="font-size:14px;font-weight:700">Procurement Department</div>
            </div>`

        return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>PO ${d.ref}</title>
          <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,sans-serif;padding:40px;max-width:800px;margin:0 auto}@media print{.noprint{display:none}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style>
        </head><body>
          <div class="noprint" style="margin-bottom:20px;text-align:right">
            <button onclick="window.print()" style="background:#4f46e5;color:#fff;border:none;padding:10px 24px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">ðŸ–¨ Print / Save PDF</button>
          </div>
          <div style="display:flex;justify-content:space-between;margin-bottom:28px;padding-bottom:20px;border-bottom:2px solid #4f46e5">
            <div>
              <div style="font-size:22px;font-weight:800;color:#4f46e5">${d.company?.name||'Company'}</div>
              ${d.company?.address ? `<div style="font-size:12px;color:#64748b;margin-top:4px">ðŸ“ ${d.company.address}</div>` : ''}
              ${d.company?.phone   ? `<div style="font-size:12px;color:#64748b">ðŸ“ž ${d.company.phone}</div>` : ''}
            </div>
            <div style="text-align:right">
              <div style="font-size:20px;font-weight:800">Purchase Order</div>
              <div style="font-size:13px;color:#64748b;margin-top:4px">Ref: <strong>${d.ref}</strong> · ${d.date}</div>
              ${d.po_number ? `<div style="font-size:14px;font-weight:800;color:#4f46e5;margin-top:4px">PO # ${d.po_number}</div>` : ''}
            </div>
          </div>

          <!-- Delivery Location -->
          <div style="background:#fefce8;border:2px solid #fbbf24;border-radius:10px;padding:16px;margin-bottom:16px">
            <div style="font-size:10px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">ðŸ“¦ Delivery Location</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
              <div>
                <div style="font-size:11px;font-weight:600;color:#92400e;margin-bottom:4px">Project</div>
                <div style="font-size:15px;font-weight:800;color:#1e293b">${d.project?.project_code||''}${d.project?.project_name?' â€” '+d.project.project_name:''}</div>
                ${d.project?.site_address
                  ? `<div style="font-size:13px;color:#64748b;margin-top:6px">ðŸ“ ${d.project.site_address}</div>`
                  : '<div style="font-size:12px;color:#94a3b8;margin-top:4px">No site address on file</div>'}
              </div>
              <div>
                <div style="font-size:11px;font-weight:600;color:#92400e;margin-bottom:4px">On-Site Contact (Foreman)</div>
                <div style="font-size:15px;font-weight:800;color:#1e293b">${d.foreman?.full_name||'â€”'}</div>
                ${d.foreman?.foreman_phone ? `<div style="font-size:14px;font-weight:700;color:#4f46e5;margin-top:6px">ðŸ“ž ${d.foreman.foreman_phone}</div>` : ''}
                ${d.foreman?.contact_email ? `<div style="font-size:12px;color:#64748b;margin-top:2px">âœ‰ ${d.foreman.contact_email}</div>` : ''}
              </div>
            </div>
          </div>

          ${toSection}
          <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
            <thead><tr style="background:#4f46e5">
              ${['#','Item','Qty','Unit'].map(h=>`<th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:#fff;text-transform:uppercase">${h}</th>`).join('')}
            </tr></thead>
            <tbody>${itemRows}</tbody>
          </table>
          ${d.note ? `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px;margin-bottom:20px"><div style="font-size:10px;font-weight:700;color:#92400e;text-transform:uppercase;margin-bottom:6px">Notes</div><div style="font-size:13px;color:#78350f">${d.note}</div></div>` : ''}
          <div style="border-top:1px solid #e2e8f0;padding-top:16px;display:flex;justify-content:space-between">
            <div style="font-size:11px;color:#94a3b8">Generated by MEP Platform · ${d.date}</div>
            <div style="font-size:11px;color:#94a3b8">${d.ref}</div>
          </div>
        </body></html>`
      })()
      const win = window.open('','_blank','width=900,height=700'); win.document.write(html); win.document.close(); win.focus()
      await Promise.all(pending.map(r => api.patch(`/materials/requests/${r.id}/review`, { status: 'SENT' })))
      setSendModal(false); setSendNote(''); setSendPoNumber(''); setMergedItems(null); flash('Sent âœ“'); fetchInbox()
    } catch (e) { alert(e.response?.data?.message || e.message) }
    finally { setSending(false) }
  }

  const sc = s => s==='PENDING'?'bg-amber-100 text-amber-700':s==='REVIEWED'?'bg-blue-100 text-blue-700':s==='SENT'?'bg-emerald-100 text-emerald-700':'bg-slate-100 text-slate-500'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-slate-700">Material Requests</span>
          {pending.length > 0 && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">{pending.length} pending</span>}
        </div>
        <div className="flex items-center gap-2">
          {pending.length > 0 && !mergedItems && (
            <button onClick={handleMerge} className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700"><Package className="w-3.5 h-3.5" />Merge & Review</button>
          )}
          <button onClick={fetchInbox} disabled={loading} className="p-2 bg-white border border-slate-200 rounded-lg text-slate-400 hover:bg-slate-50 disabled:opacity-50"><RefreshCw className={`w-3.5 h-3.5 ${loading?'animate-spin':''}`} /></button>
        </div>
      </div>
      {successMsg && <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-xs text-emerald-700 font-semibold"><Check className="w-4 h-4" />{successMsg}</div>}
      {error && <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600"><AlertCircle className="w-4 h-4" />{error}</div>}
      {loading && <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>}
      {!loading && mergedItems && (
        <div className="bg-white rounded-xl border border-indigo-200 overflow-hidden">
          <div className="px-4 py-3 bg-indigo-50 border-b border-indigo-100 flex items-center justify-between">
            <div className="flex items-center gap-2"><Package className="w-4 h-4 text-indigo-600" /><span className="text-sm font-bold text-indigo-800">Merged â€” {mergedItems.length} items from {pending.length} requests</span></div>
            <div className="flex gap-2">
              <button onClick={() => setMergedItems(null)} className="px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button onClick={() => setSendModal(true)} className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700"><Check className="w-3.5 h-3.5" />Send Request</button>
            </div>
          </div>
          <table className="w-full"><thead><tr className="bg-slate-50 border-b border-slate-100">{['Item','Qty','Unit','Sources','Surplus'].map(h=><th key={h} className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 py-2.5">{h}</th>)}</tr></thead>
          <tbody>{mergedItems.map((item,i)=>{
            const si = surplus[item.item_name.toLowerCase()]||[]; const ts = si.reduce((s,x)=>s+Number(x.qty_available),0)
            return <tr key={i} className="border-b border-slate-50 last:border-0">
              <td className="px-4 py-3 text-sm font-medium text-slate-700">{item.item_name}</td>
              <td className="px-4 py-3"><input type="number" min="0" value={item.quantity} onChange={e=>setMergedItems(prev=>prev.map((it,j)=>j===i?{...it,quantity:Math.max(0,Math.floor(Number(e.target.value)||0))}:it))} className="w-20 px-2 py-1 border border-slate-200 rounded-lg text-sm font-bold text-indigo-600 text-center focus:outline-none focus:ring-2 focus:ring-indigo-300" /></td>
              <td className="px-4 py-3 text-xs text-slate-400">{item.unit}</td>
              <td className="px-4 py-3">{item.sources.map((s,j)=><span key={j} className="text-[10px] text-slate-400 block">{s.requester}: {s.qty}</span>)}</td>
              <td className="px-4 py-3">{ts>0?si.map((s,j)=><span key={j} className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full block w-fit">{s.qty_available} {item.unit} @ {s.project_code}</span>):<span className="text-[10px] text-slate-300">None</span>}</td>
            </tr>
          })}</tbody></table>
        </div>
      )}
      {!loading && requests.length === 0 && <div className="flex flex-col items-center justify-center py-16 text-center"><Inbox className="w-10 h-10 text-slate-200 mb-3" /><p className="text-sm font-semibold text-slate-400">No material requests</p></div>}
      {!loading && requests.map(req => (
        <div key={req.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <button onClick={() => toggleExpand(req.id)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 text-left">
            <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white" style={{background:'#6366f1'}}>{(req.requester_name||'?')[0]}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap"><span className="text-sm font-semibold text-slate-800">{req.requester_name}</span><span className="text-xs text-slate-400">{req.project_code}</span><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${sc(req.status)}`}>{req.status}</span></div>
              <div className="text-[10px] text-slate-400 mt-0.5">{req.items?.length||0} items · {new Date(req.created_at).toLocaleString('en-CA',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</div>
            </div>
            <ChevronRight className={`w-4 h-4 text-slate-300 flex-shrink-0 transition-transform ${expanded[req.id]?'rotate-90':''}`} />
          </button>
          {expanded[req.id] && (
            <div className="border-t border-slate-100">
              {req.note && <div className="px-4 py-2 bg-amber-50 text-xs text-amber-700 border-b border-amber-100">ðŸ“ {req.note}</div>}
              <table className="w-full"><thead><tr className="bg-slate-50 border-b border-slate-100">{['Item','Qty','Unit','Note'].map(h=><th key={h} className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 py-2">{h}</th>)}</tr></thead>
              <tbody>{(req.items||[]).map((item,i)=><tr key={i} className="border-b border-slate-50 last:border-0"><td className="px-4 py-2.5 text-sm font-medium text-slate-700">{item.item_name}</td><td className="px-4 py-2.5 text-sm font-bold text-indigo-600">{item.quantity}</td><td className="px-4 py-2.5 text-xs text-slate-400">{item.unit}</td><td className="px-4 py-2.5 text-xs text-slate-400">{item.note||'â€”'}</td></tr>)}</tbody></table>
            </div>
          )}
        </div>
      ))}
      {sendModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between"><h3 className="text-sm font-bold text-slate-800">Send Request To</h3><button onClick={()=>setSendModal(false)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4" /></button></div>
            <div className="px-6 py-4 space-y-2 max-h-[55vh] overflow-y-auto">
              <button onClick={()=>setSendTarget('procurement')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left ${sendTarget==='procurement'?'border-indigo-400 bg-indigo-50':'border-slate-200 hover:bg-slate-50'}`}>
                <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center"><Briefcase className="w-4 h-4 text-indigo-600" /></div>
                <div><div className="text-sm font-semibold text-slate-800">Procurement Department</div><div className="text-[10px] text-slate-400">Internal</div></div>
                {sendTarget==='procurement' && <Check className="w-4 h-4 text-indigo-600 ml-auto" />}
              </button>
              {suppliers.length > 0 && (<><div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pt-1">Suppliers</div>
                {suppliers.map(s=><button key={s.id} onClick={()=>setSendTarget(String(s.id))} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left ${sendTarget===String(s.id)?'border-indigo-400 bg-indigo-50':'border-slate-200 hover:bg-slate-50'}`}>
                  <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center"><Package className="w-4 h-4 text-slate-500" /></div>
                  <div className="flex-1 min-w-0"><div className="text-sm font-semibold text-slate-800 truncate">{s.name}</div><div className="text-[10px] text-slate-400">{s.trade_code} · {s.email}</div></div>
                  {sendTarget===String(s.id) && <Check className="w-4 h-4 text-indigo-600 ml-auto" />}
                </button>)}</>)}
            </div>
            <div className="px-6 py-3 border-t border-slate-100 space-y-2">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest mb-1">
                  <span className={sendTarget && sendTarget !== 'procurement' ? 'text-red-500' : 'text-slate-400'}>
                    PO Number
                  </span>
                  {sendTarget && sendTarget !== 'procurement'
                    ? <span className="text-red-400 font-semibold"> *required for supplier</span>
                    : <span className="text-slate-300 font-normal normal-case"> (optional)</span>
                  }
                </label>
                <input type="text" value={sendPoNumber} onChange={e=>setSendPoNumber(e.target.value)}
                  placeholder="e.g. PO-2026-001"
                  className={`w-full px-3 py-2 border rounded-xl text-xs focus:outline-none focus:ring-2 placeholder:text-slate-300 ${
                    sendTarget && sendTarget !== 'procurement' && !sendPoNumber.trim()
                      ? 'border-red-300 focus:ring-red-400'
                      : 'border-slate-200 focus:ring-indigo-400'
                  }`} />
              </div>
              <textarea value={sendNote} onChange={e=>setSendNote(e.target.value)} rows={2} placeholder="Notes (optional)" className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none" />
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={()=>setSendModal(false)} className="px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 rounded-xl">Cancel</button>
              <button onClick={handleSend}
                disabled={!sendTarget || sending || (sendTarget !== 'procurement' && !sendPoNumber.trim())}
                className="flex items-center gap-2 px-5 py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 disabled:opacity-60">
                {sending?<Loader2 className="w-3.5 h-3.5 animate-spin"/>:<><Check className="w-3.5 h-3.5"/>Confirm Send</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// â”€â”€ Main Page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function MyHubPage() {
  const { can, loading: permsLoading } = usePermissions()
  const [tab, setTab] = useState(null)
  const [materialsCount, setMaterialsCount] = useState(0)
  const [tasksUnread, setTasksUnread]       = useState(0)

  const canAttendance   = !permsLoading && can('attendance', 'approve')
  const canMaterials    = !permsLoading && can('hub', 'materials_inbox')
  const canReceiveTasks = !permsLoading && can('hub', 'receive_tasks')

  useEffect(() => {
    if (permsLoading || tab) return
    if (canAttendance)    setTab('attendance')
    else if (canReceiveTasks) setTab('tasks')
    else if (canMaterials)    setTab('materials')
  }, [permsLoading])

  useEffect(() => {
    if (!canMaterials) return
    const f = async () => { try { const r = await api.get('/materials/inbox/count'); setMaterialsCount(r.data.count||0) } catch(e){ console.error('Failed to load materials count:', e) } }
    f(); const i = setInterval(f, 30000); return () => clearInterval(i)
  }, [canMaterials])

  useEffect(() => {
    if (!canReceiveTasks) return
    const f = async () => { try { const r = await api.get('/hub/messages/unread-count'); setTasksUnread(r.data.count||0) } catch(e){ console.error('Failed to load unread count:', e) } }
    f(); const i = setInterval(f, 30000); return () => clearInterval(i)
  }, [canReceiveTasks])

  const tabs = [
    canAttendance   && { id:'attendance', icon:CalendarCheck, label:'Attendance' },
    canMaterials    && { id:'materials',  icon:Package,       label:'Materials',  count:materialsCount },
    canReceiveTasks && { id:'tasks',      icon:ClipboardList, label:'My Tasks',   count:tasksUnread },
  ].filter(Boolean)

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center"><Inbox className="w-5 h-5 text-white" /></div>
          <div><h1 className="text-lg font-bold text-slate-900">My Hub</h1><p className="text-xs text-slate-400 mt-0.5">Your daily tasks, approvals and requests</p></div>
        </div>
        <div className="flex items-center gap-1">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${tab===t.id ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`}>
              <t.icon className="w-3.5 h-3.5" />{t.label}
              {t.count > 0 && <span className={`min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full flex items-center justify-center ${tab===t.id ? 'bg-white text-indigo-600' : 'bg-red-500 text-white'}`}>{t.count>99?'99+':t.count}</span>}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {tab==='attendance' && <AttendanceApprovalTab />}
        {tab==='materials'  && <InboxTab />}
        {tab==='tasks'      && <WorkerInboxTab />}
      </div>
    </div>
  )
}
