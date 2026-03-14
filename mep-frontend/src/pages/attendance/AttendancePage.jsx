import { useState, useEffect, useCallback } from 'react'
import api from '@/lib/api'
import {
  CalendarCheck, Users, Clock, Check, X, Loader2,
  ChevronRight, AlertCircle, Plus, RefreshCw,
  LogIn, LogOut, Edit2
} from 'lucide-react'

const todayStr = () => new Date().toISOString().split('T')[0]

function fmtTime(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', hour12: true })
}

function fmtHours(h) {
  if (h == null) return '—'
  const n = Number(h)
  const hrs = Math.floor(n)
  const mins = Math.round((n - hrs) * 60)
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`
}

const TRADE_DOT = {
  PLUMBING: '#0ea5e9', ELECTRICAL: '#f59e0b', HVAC: '#10b981',
  CARPENTRY: '#f97316', GENERAL: '#64748b',
}
const dot = (code) => TRADE_DOT[(code||'').toUpperCase()] || '#94a3b8'

function StatusBadge({ row }) {
  if (!row) return <span className="text-[10px] text-slate-400 font-semibold px-2 py-0.5 rounded-full bg-slate-100">Not arrived</span>
  if (row.check_in_at && !row.check_out_at)
    return <span className="text-[10px] text-emerald-700 font-semibold px-2 py-0.5 rounded-full bg-emerald-100">On site</span>
  if (row.check_in_at && row.check_out_at)
    return <span className="text-[10px] text-slate-600 font-semibold px-2 py-0.5 rounded-full bg-slate-100">Done</span>
  return null
}

// ── CheckInModal ─────────────────────────────────────────────
function CheckInModal({ employee, projectId, onClose, onSaved }) {
  const [time, setTime]     = useState(new Date().toTimeString().slice(0,5))
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const handleSave = async () => {
    setSaving(true); setError('')
    try {
      // Convert time to 24h HH:MM format
      const [timePart, period] = time.includes('AM') || time.includes('PM')
        ? [time.slice(0,5), time.slice(6)] : [time, null]
      let [h, m] = timePart.split(':').map(Number)
      if (period === 'PM' && h !== 12) h += 12
      if (period === 'AM' && h === 12) h = 0
      const time24 = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`

      await api.post('/attendance/foreman-checkin', {
        project_id:  projectId,
        employee_id: employee.employee_id,
        start_time:  time24,
      })
      onSaved()
    } catch (e) { setError(e.response?.data?.message || e.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LogIn className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-bold text-slate-800">Check In — {employee.employee_name}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Check-in Time</label>
            <input type="time" value={time} onChange={e => setTime(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
          {error && <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600"><AlertCircle className="w-4 h-4 flex-shrink-0" />{error}</div>}
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 disabled:opacity-60 transition-colors">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Check className="w-3.5 h-3.5" />Confirm</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── CheckOutModal ────────────────────────────────────────────
function CheckOutModal({ employee, attendanceId, onClose, onSaved }) {
  const [time, setTime]           = useState(new Date().toTimeString().slice(0,5))
  const [overtimeHours, setOT]    = useState('')
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')

  const handleSave = async () => {
    setSaving(true); setError('')
    try {
      await api.post('/attendance/foreman-checkout', {
        employee_id:    employee.employee_id,
        overtime_hours: overtimeHours ? Number(overtimeHours) : undefined,
      })
      onSaved()
    } catch (e) { setError(e.response?.data?.message || e.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LogOut className="w-4 h-4 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-800">Check Out — {employee.employee_name}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Check-out Time</label>
            <input type="time" value={time} onChange={e => setTime(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Overtime Hours (optional)</label>
            <input type="number" min="0" max="12" step="0.5" value={overtimeHours}
              onChange={e => setOT(e.target.value)} placeholder="e.g. 2"
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder:text-slate-300" />
            <p className="text-[10px] text-slate-400 mt-1">Leave empty if no overtime</p>
          </div>
          {error && <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600"><AlertCircle className="w-4 h-4 flex-shrink-0" />{error}</div>}
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-60 transition-colors">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Check className="w-3.5 h-3.5" />Confirm</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────
export default function AttendancePage() {
  const [date, setDate]           = useState(todayStr())
  const [projects, setProjects]   = useState([])
  const [selectedProj, setSelectedProj] = useState(null)
  const [team, setTeam]           = useState([]) // assignments + attendance merged
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [checkInModal, setCheckInModal]   = useState(null) // employee obj
  const [checkOutModal, setCheckOutModal] = useState(null) // { employee, attendanceId }
  const [successMsg, setSuccessMsg] = useState('')

  // Load active projects
  useEffect(() => {
    api.get('/projects?status=ACTIVE')
      .then(r => {
        const list = r.data.projects || r.data.rows || []
        setProjects(list)
        if (list.length) setSelectedProj(list[0])
      })
      .catch(() => {})
  }, [])

  // Load team for selected project + date
  const fetchTeam = useCallback(async () => {
    if (!selectedProj) return
    setLoading(true); setError('')
    try {
      // Get assignments for this project on this date
      const [asgRes, attRes] = await Promise.all([
        api.get(`/assignments?project_id=${selectedProj.id}&date=${date}`),
        api.get(`/attendance/report/daily?project_id=${selectedProj.id}&date=${date}`),
      ])

      const assignments = asgRes.data.assignments || []
      const attMap = {}
      for (const r of (attRes.data.records || [])) {
        attMap[r.employee_id || r.employee_name] = r
      }

      // Merge — match by employee_id first, fallback to name
      const merged = assignments.map(a => ({
        ...a,
        attendance: attMap[a.employee_id] || attMap[a.employee_name] || null,
      }))
      setTeam(merged)
    } catch (e) { setError(e.response?.data?.message || e.message) }
    finally { setLoading(false) }
  }, [selectedProj, date])

  useEffect(() => { fetchTeam() }, [fetchTeam])

  const showSuccess = (msg) => {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(''), 4000)
  }

  const present   = team.filter(e => e.attendance?.check_in_at)
  const onSite    = team.filter(e => e.attendance?.check_in_at && !e.attendance?.check_out_at)
  const completed = team.filter(e => e.attendance?.check_in_at && e.attendance?.check_out_at)

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">

      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center">
              <CalendarCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Attendance</h1>
              <p className="text-xs text-slate-400 mt-0.5">Track daily check-in / check-out for your team</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            <button onClick={fetchTeam} disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 text-slate-600 text-xs font-semibold rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Project tabs */}
        <div className="flex items-center gap-1 overflow-x-auto">
          {projects.map(p => (
            <button key={p.id} onClick={() => setSelectedProj(p)}
              className={`flex-shrink-0 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
                selectedProj?.id === p.id ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-100'
              }`}>
              {p.project_code}
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      {!loading && team.length > 0 && (
        <div className="flex-shrink-0 px-6 py-3 flex items-center gap-3">
          {[
            { label: 'Total',     value: team.length,       color: 'text-slate-700  bg-white border-slate-200' },
            { label: 'Present',   value: present.length,    color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
            { label: 'On Site',   value: onSite.length,     color: 'text-indigo-700  bg-indigo-50  border-indigo-200' },
            { label: 'Completed', value: completed.length,  color: 'text-slate-600   bg-slate-50   border-slate-200' },
          ].map(s => (
            <div key={s.label} className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-bold ${s.color}`}>
              <span className="text-lg font-black">{s.value}</span>
              <span className="font-medium opacity-70">{s.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Success */}
      {successMsg && (
        <div className="flex-shrink-0 mx-6 flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-xs text-emerald-700 font-semibold">
          <Check className="w-4 h-4 flex-shrink-0" />{successMsg}
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {error && (
          <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600 mb-4">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
          </div>
        )}

        {loading && (
          <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>
        )}

        {!loading && team.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Users className="w-10 h-10 text-slate-200 mb-3" />
            <p className="text-sm font-semibold text-slate-400">No assignments for this project on {date}</p>
          </div>
        )}

        {!loading && team.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[750px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 py-2.5">Employee</th>
                    <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 py-2.5">Role</th>
                    <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 py-2.5">Check In</th>
                    <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 py-2.5">Check Out</th>
                    <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 py-2.5">Hours</th>
                    <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 py-2.5">Overtime</th>
                    <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 py-2.5">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {team.map((emp, i) => {
                    const att     = emp.attendance
                    const workedH = att?.worked_hours
                    const otH     = att?.overtime_hours
                    return (
                      <tr key={emp.id || i} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors last:border-0">
                        {/* Employee */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white"
                              style={{ background: dot(emp.trade_code) }}>
                              {(emp.employee_name || '?')[0]}
                            </div>
                            <div>
                              <div className="text-sm font-semibold text-slate-700">{emp.employee_name}</div>
                              <div className="text-[10px] text-slate-400">{emp.trade_code}</div>
                            </div>
                          </div>
                        </td>
                        {/* Role */}
                        <td className="px-4 py-3">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                            {emp.assignment_role || 'WORKER'}
                          </span>
                        </td>
                        {/* Check In */}
                        <td className="px-4 py-3 text-xs font-medium text-slate-600">{fmtTime(att?.check_in_at)}</td>
                        {/* Check Out */}
                        <td className="px-4 py-3 text-xs font-medium text-slate-600">{fmtTime(att?.check_out_at)}</td>
                        {/* Hours */}
                        <td className="px-4 py-3 text-xs font-semibold text-slate-700">{fmtHours(workedH)}</td>
                        {/* Overtime */}
                        <td className="px-4 py-3">
                          {otH > 0
                            ? <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">+{otH}h OT</span>
                            : <span className="text-xs text-slate-300">—</span>
                          }
                        </td>
                        {/* Actions */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            {!att?.check_in_at && (
                              <button onClick={() => setCheckInModal(emp)}
                                className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-600 border border-emerald-200 hover:bg-emerald-50 rounded-lg transition-colors whitespace-nowrap">
                                <LogIn className="w-3 h-3" />Check In
                              </button>
                            )}
                            {att?.check_in_at && !att?.check_out_at && (
                              <button onClick={() => setCheckOutModal({ employee: emp, attendanceId: att.attendance_id })}
                                className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-indigo-600 border border-indigo-200 hover:bg-indigo-50 rounded-lg transition-colors whitespace-nowrap">
                                <LogOut className="w-3 h-3" />Check Out
                              </button>
                            )}
                            {att?.check_in_at && att?.check_out_at && (
                              <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
                                <Check className="w-3 h-3" />Done
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {checkInModal && (
        <CheckInModal
          employee={checkInModal}
          projectId={selectedProj?.id}
          onClose={() => setCheckInModal(null)}
          onSaved={() => { setCheckInModal(null); fetchTeam(); showSuccess(`${checkInModal.employee_name} checked in ✓`) }}
        />
      )}
      {checkOutModal && (
        <CheckOutModal
          employee={checkOutModal.employee}
          attendanceId={checkOutModal.attendanceId}
          onClose={() => setCheckOutModal(null)}
          onSaved={() => { setCheckOutModal(null); fetchTeam(); showSuccess(`${checkOutModal.employee.employee_name} checked out ✓`) }}
        />
      )}
    </div>
  )
}
