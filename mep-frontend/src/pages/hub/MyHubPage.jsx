import { useState, useEffect, useCallback } from 'react'
import api from '@/lib/api'
import {
  Inbox, CalendarCheck, CheckCheck, Loader2, AlertCircle,
  Check, X, Clock, Users, ChevronRight, RefreshCw,
  Briefcase, MapPin
} from 'lucide-react'

const todayStr = () => new Date().toISOString().split('T')[0]

function fmtTime(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', hour12: true })
}

function fmtHours(h) {
  if (h == null || h === '') return '—'
  const n = Number(h)
  if (isNaN(n)) return '—'
  const hrs  = Math.floor(n)
  const mins = Math.round((n - hrs) * 60)
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`
}

const TRADE_DOT = {
  PLUMBING: '#0ea5e9', ELECTRICAL: '#f59e0b', HVAC: '#10b981',
  CARPENTRY: '#f97316', GENERAL: '#64748b',
}
const dot = (code) => TRADE_DOT[(code||'').toUpperCase()] || '#94a3b8'

// ── Attendance Approval Tab ───────────────────────────────────
function AttendanceApprovalTab() {
  const [date, setDate]         = useState(todayStr())
  const [records, setRecords]   = useState([])
  const [loading, setLoading]   = useState(false)
  const [approving, setApproving] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const [error, setError]       = useState('')

  const fetchRecords = useCallback(async () => {
    setLoading(true); setError('')
    try {
      // Fetch all attendance for this date (no project filter)
      const r = await api.get(`/attendance/report/daily?date=${date}`)
      setRecords(r.data.records || [])
    } catch (e) { setError(e.response?.data?.message || e.message) }
    finally { setLoading(false) }
  }, [date])

  useEffect(() => { fetchRecords() }, [fetchRecords])

  const showSuccess = (msg) => { setSuccessMsg(msg); setTimeout(() => setSuccessMsg(''), 4000) }

  const handleApproveAll = async () => {
    const toApprove = records.filter(r => r.check_in_at && r.check_out_at && !r.manager_approved)
    if (!toApprove.length) return
    setApproving(true)
    try {
      await Promise.all(toApprove.map(r =>
        api.patch(`/attendance/overtime/${r.attendance_id}/approve`, { approved: true })
      ))
      showSuccess(`${toApprove.length} records approved ✓`)
      fetchRecords()
    } catch (e) { setError(e.response?.data?.message || e.message) }
    finally { setApproving(false) }
  }

  const handleApproveOne = async (attendanceId) => {
    try {
      await api.patch(`/attendance/overtime/${attendanceId}/approve`, { approved: true })
      showSuccess('Approved ✓')
      fetchRecords()
    } catch (e) { alert(e.response?.data?.message || e.message) }
  }

  const pendingCount = records.filter(r => r.check_in_at && r.check_out_at && !r.manager_approved).length

  // Group by project
  const grouped = records.reduce((acc, r) => {
    const key = r.project_code
    if (!acc[key]) acc[key] = { project_code: r.project_code, project_name: r.project_name, records: [] }
    acc[key].records.push(r)
    return acc
  }, {})
  const groups = Object.values(grouped)

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-400">Date</span>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400" />
        </div>
        <button onClick={fetchRecords} disabled={loading}
          className="p-2 bg-white border border-slate-200 rounded-lg text-slate-400 hover:bg-slate-50 transition-colors disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
        {pendingCount > 0 && (
          <button onClick={handleApproveAll} disabled={approving}
            className="ml-auto flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-60">
            {approving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><CheckCheck className="w-3.5 h-3.5" />Approve All ({pendingCount})</>}
          </button>
        )}
      </div>

      {successMsg && (
        <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-xs text-emerald-700 font-semibold">
          <Check className="w-4 h-4 flex-shrink-0" />{successMsg}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
        </div>
      )}

      {loading && <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>}

      {!loading && records.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <CalendarCheck className="w-10 h-10 text-slate-200 mb-3" />
          <p className="text-sm font-semibold text-slate-400">No attendance records for {date}</p>
        </div>
      )}

      {!loading && groups.map(group => (
        <div key={group.project_code} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {/* Project header */}
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
                <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 py-2.5">Employee</th>
                <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 py-2.5">Check In</th>
                <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 py-2.5">Check Out</th>
                <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 py-2.5">Hours</th>
                <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 py-2.5">Overtime</th>
                <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 py-2.5">Status</th>
                <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 py-2.5">Action</th>
              </tr>
            </thead>
            <tbody>
              {group.records.map((r, i) => (
                <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/60 last:border-0 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white"
                        style={{ background: dot(r.trade_code) }}>
                        {(r.employee_name || '?')[0]}
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-slate-700">{r.employee_name}</div>
                        <div className="text-[10px] text-slate-400">{r.assignment_role || 'WORKER'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">{fmtTime(r.check_in_at)}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">{fmtTime(r.check_out_at)}</td>
                  <td className="px-4 py-3 text-xs font-semibold text-slate-700">{fmtHours(r.worked_hours)}</td>
                  <td className="px-4 py-3">
                    {r.overtime_hours > 0
                      ? <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">+{r.overtime_hours}h OT</span>
                      : <span className="text-xs text-slate-300">—</span>
                    }
                  </td>
                  <td className="px-4 py-3">
                    {!r.check_in_at
                      ? <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-400">Absent</span>
                      : !r.check_out_at
                        ? <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-600">On Site</span>
                        : r.manager_approved
                          ? <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 flex items-center gap-1 w-fit"><Check className="w-3 h-3" />Approved</span>
                          : <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-600">Pending</span>
                    }
                  </td>
                  <td className="px-4 py-3">
                    {r.check_in_at && r.check_out_at && !r.manager_approved && (
                      <button onClick={() => handleApproveOne(r.attendance_id)}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-600 border border-emerald-200 hover:bg-emerald-50 rounded-lg transition-colors whitespace-nowrap">
                        <Check className="w-3 h-3" />Approve
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

// ── Inbox Tab ─────────────────────────────────────────────────
function InboxTab() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
        <Inbox className="w-7 h-7 text-slate-300" />
      </div>
      <p className="text-sm font-semibold text-slate-400">Inbox is empty</p>
      <p className="text-xs text-slate-300 mt-1">Material requests and tasks will appear here</p>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────
export default function MyHubPage() {
  const [tab, setTab] = useState('attendance')

  const tabs = [
    { id: 'attendance', icon: CalendarCheck, label: 'Attendance Approval' },
    { id: 'inbox',      icon: Inbox,         label: 'Inbox'               },
  ]

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">

      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center">
            <Inbox className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">My Hub</h1>
            <p className="text-xs text-slate-400 mt-0.5">Your daily tasks, approvals and requests</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
                tab === t.id ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
              }`}>
              <t.icon className="w-3.5 h-3.5" />{t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {tab === 'attendance' && <AttendanceApprovalTab />}
        {tab === 'inbox'      && <InboxTab />}
      </div>
    </div>
  )
}
