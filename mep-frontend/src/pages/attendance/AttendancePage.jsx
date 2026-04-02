import { useState, useEffect, useCallback } from 'react'
import api from '@/lib/api'
import { usePermissions } from '@/hooks/usePermissions.jsx'
import { todayStr, fmtTime, fmtHours } from '@/utils/formatters'
import {
  Calendar, CheckCircle, Clock, AlertTriangle,
  Loader2, Check, X, ChevronDown, Edit2, Users
} from 'lucide-react'

// Round to nearest 0.5
const roundHalf = v => Math.round(parseFloat(v || 0) * 2) / 2

// Dropdown options: 0, 0.5, 1 ... max
function buildHoursOptions(max) {
  const opts = []
  for (let v = 0; v <= max; v += 0.5) opts.push(parseFloat(v.toFixed(1)))
  return opts
}
const REGULAR_OPTIONS = buildHoursOptions(16)
const OT_OPTIONS      = buildHoursOptions(12)

const STATUS_CONFIG = {
  OPEN:        { label: 'Absent',     color: 'bg-slate-100 text-slate-500' },
  CHECKED_IN:  { label: 'On Site',    color: 'bg-emerald-100 text-emerald-700' },
  CHECKED_OUT: { label: 'Pending',    color: 'bg-amber-100 text-amber-700' },
  CONFIRMED:   { label: 'Confirmed',  color: 'bg-indigo-100 text-indigo-700' },
  ADJUSTED:    { label: 'Adjusted',   color: 'bg-purple-100 text-purple-700' },
}

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.OPEN
  return (
    <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.color}`}>
      {cfg.label}
    </span>
  )
}

// ── Adjust / Confirm Modal ───────────────────────────────────
function ConfirmModal({ record, onClose, onSaved }) {
  const initReg = roundHalf(record.confirmed_regular_hours  ?? record.regular_hours  ?? 8)
  const initOT  = roundHalf(record.confirmed_overtime_hours ?? record.overtime_hours ?? 0)

  const [regularHours,  setRegularHours]  = useState(initReg)
  const [overtimeHours, setOvertimeHours] = useState(initOT)
  const [note,          setNote]          = useState(record.foreman_note || '')
  const [saving,        setSaving]        = useState(false)
  const [error,         setError]         = useState('')

  const handleSave = async () => {
    setError('')
    setSaving(true)
    try {
      await api.patch(`/attendance/${record.attendance_id}/confirm`, {
        regular_hours:  regularHours,
        overtime_hours: overtimeHours,
        note:           note || undefined,
      })
      onSaved()
    } catch (e) { setError(e.response?.data?.message || e.message) }
    finally { setSaving(false) }
  }

  const selectCls = base => `w-full px-3 py-2 border rounded-xl text-sm text-center font-bold focus:outline-none focus:ring-2 ${base}`

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-800">Confirm Hours</h3>
            <p className="text-xs text-slate-400 mt-0.5">{record.full_name} — {fmtTime(record.check_in_time)} to {fmtTime(record.check_out_time)}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Calculated summary */}
          <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-500 space-y-1">
            <div className="flex justify-between">
              <span>Check In</span>
              <span className="font-semibold text-slate-700">{fmtTime(record.check_in_time)}</span>
            </div>
            <div className="flex justify-between">
              <span>Check Out</span>
              <span className="font-semibold text-slate-700">{fmtTime(record.check_out_time)}</span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-1 mt-1">
              <span>System Calculated</span>
              <span className="font-bold text-slate-500">
                {fmtHours(record.regular_hours)}
                {parseFloat(record.overtime_hours) > 0 && <span className="ml-2 text-amber-600">+{fmtHours(record.overtime_hours)} OT</span>}
              </span>
            </div>
          </div>

          {/* Foreman final values */}
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Final Hours (Foreman Decision)</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-semibold text-indigo-500 mb-1.5">Regular Hours</label>
                <select value={regularHours} onChange={e => setRegularHours(parseFloat(e.target.value))}
                  className={selectCls('border-indigo-200 focus:ring-indigo-400 bg-white text-indigo-700')}>
                  {REGULAR_OPTIONS.map(v => (
                    <option key={v} value={v}>{v === 0 ? '0h' : `${v}h`}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-amber-500 mb-1.5">Overtime Hours</label>
                <select value={overtimeHours} onChange={e => setOvertimeHours(parseFloat(e.target.value))}
                  className={selectCls('border-amber-200 focus:ring-amber-400 bg-white text-amber-700')}>
                  {OT_OPTIONS.map(v => (
                    <option key={v} value={v}>{v === 0 ? '0h' : `${v}h`}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Note (optional)</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
              placeholder="e.g. Road conditions caused 15min delay..."
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder:text-slate-300" />
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />{error}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-60">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Check className="w-3.5 h-3.5" />Confirm</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Employee Row ─────────────────────────────────────────────
function AttendanceRow({ record, canApprove, onCheckin, onCheckout, onConfirm, actionLoading }) {
  const status   = record.attendance_status || 'OPEN'
  const isLoading = actionLoading === record.assignment_request_id

  const finalRegular  = record.confirmed_regular_hours  ?? record.regular_hours
  const finalOvertime = record.confirmed_overtime_hours ?? record.overtime_hours
  const isLate        = record.late_minutes > 15

  return (
    <div className="grid grid-cols-[1.5fr_80px_90px_90px_70px_70px_90px_auto] items-center px-4 py-3 border-t border-slate-50 hover:bg-slate-50/70 transition-colors">
      {/* Employee */}
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
          {(record.full_name || '?')[0]}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-700 truncate">{record.full_name}</div>
          <div className="text-[10px] text-slate-400">{record.trade_code} · {fmtTime(record.shift_start)} shift</div>
        </div>
      </div>

      {/* Status */}
      <div><StatusBadge status={status} /></div>

      {/* Check In */}
      <div className="text-xs font-medium text-slate-700">
        {record.check_in_time
          ? <span className={isLate && status !== 'OPEN' ? 'text-amber-600' : ''}>
              {fmtTime(record.check_in_time)}
              {isLate && <span className="ml-1 text-[9px] text-amber-500 font-bold">+{record.late_minutes}m</span>}
            </span>
          : '—'}
      </div>

      {/* Check Out */}
      <div className="text-xs font-medium text-slate-700">
        {record.check_out_time ? fmtTime(record.check_out_time) : '—'}
      </div>

      {/* Regular */}
      <div className="text-xs font-bold text-slate-700">
        {finalRegular !== null && finalRegular !== undefined ? fmtHours(finalRegular) : '—'}
      </div>

      {/* Overtime */}
      <div className={`text-xs font-bold ${parseFloat(finalOvertime) > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
        {finalOvertime !== null && finalOvertime !== undefined ? fmtHours(finalOvertime) : '—'}
      </div>

      {/* Confirmed by */}
      <div className="text-[10px] text-slate-400 truncate">
        {record.confirmed_by_name
          ? <span className="text-indigo-600 font-semibold">{record.confirmed_by_name}</span>
          : status === 'CHECKED_OUT' ? <span className="text-amber-500">Pending</span> : '—'}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-1.5">
        {isLoading
          ? <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
          : (
            <>
              {/* Worker: Check In */}
              {record.is_mine && status === 'OPEN' && (
                <button onClick={() => onCheckin(record)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white text-[11px] font-bold rounded-lg hover:bg-emerald-700 transition-colors whitespace-nowrap">
                  <Check className="w-3 h-3" />Check In
                </button>
              )}
              {/* Worker: Check Out */}
              {record.is_mine && status === 'CHECKED_IN' && (
                <button onClick={() => onCheckout(record)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-slate-700 text-white text-[11px] font-bold rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap">
                  <X className="w-3 h-3" />Check Out
                </button>
              )}
              {/* Foreman/Admin: Confirm */}
              {canApprove && status === 'CHECKED_OUT' && (
                <button onClick={() => onConfirm(record)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white text-[11px] font-bold rounded-lg hover:bg-indigo-700 transition-colors whitespace-nowrap">
                  <Check className="w-3 h-3" />Confirm
                </button>
              )}
              {/* Foreman/Admin: Re-adjust */}
              {canApprove && (status === 'CONFIRMED' || status === 'ADJUSTED') && (
                <button onClick={() => onConfirm(record)}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-slate-500 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200 whitespace-nowrap">
                  <Edit2 className="w-3 h-3" />Adjust
                </button>
              )}
            </>
          )
        }
      </div>
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────
export default function AttendancePage() {
  const { can } = usePermissions()
  const [date,            setDate]            = useState(todayStr())
  const [projects,        setProjects]        = useState([])
  const [selectedProj,    setSelectedProj]    = useState(null)
  const [todayAssignment, setTodayAssignment] = useState(null)
  const [records,         setRecords]         = useState([])
  const [summary,         setSummary]         = useState({ total: 0, checked_in: 0, checked_out: 0, confirmed: 0 })
  const [loading,         setLoading]         = useState(true)
  const [actionLoading,   setActionLoading]   = useState(null)
  const [successMsg,      setSuccessMsg]      = useState('')
  const [confirmModal,    setConfirmModal]    = useState(null)

  const canApprove = can('attendance', 'approve')

  // For WORKER: auto-select today's assigned project
  useEffect(() => {
    if (canApprove) return // FOREMAN/ADMIN uses tabs
    api.get('/assignments/my-today')
      .then(r => {
        const asgn = r.data.assignment
        if (asgn) {
          setTodayAssignment(asgn)
          setSelectedProj(asgn.project_id)
        }
      })
      .catch(() => {})
  }, [canApprove])

  // Load projects for tabs (FOREMAN/ADMIN only)
  const fetchProjects = useCallback(async () => {
    if (!canApprove) return
    try {
      const r = await api.get(`/attendance/projects?date=${date}`)
      const projs = r.data.projects || []
      setProjects(projs)
      if (projs.length > 0 && !selectedProj) {
        setSelectedProj(projs[0].id)
      }
    } catch { setProjects([]) }
  }, [date, canApprove])

  useEffect(() => { fetchProjects() }, [fetchProjects])

  // Load attendance records
  const fetchRecords = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ date })
      if (selectedProj) params.set('project_id', selectedProj)
      const r = await api.get(`/attendance?${params}`)
      setRecords(r.data.records || [])
      setSummary(r.data.summary || { total: 0, checked_in: 0, checked_out: 0, confirmed: 0 })
    } catch { setRecords([]); setSummary({ total: 0, checked_in: 0, checked_out: 0, confirmed: 0 }) }
    finally { setLoading(false) }
  }, [date, selectedProj])

  useEffect(() => { fetchRecords() }, [fetchRecords])

  const showSuccess = (msg) => {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(''), 4000)
  }

  const handleCheckin = async (record) => {
    setActionLoading(record.assignment_request_id)
    try {
      await api.post('/attendance/checkin', { assignment_request_id: record.assignment_request_id })
      fetchRecords()
      showSuccess('Checked in successfully!')
    } catch (e) {
      const err = e.response?.data
      if (err?.error === 'SHIFT_ENDED') {
        alert(`⛔ ${err.message}`)
      } else {
        alert(err?.message || e.message)
      }
    }
    finally { setActionLoading(null) }
  }

  const handleCheckout = async (record) => {
    setActionLoading(record.assignment_request_id)
    try {
      await api.patch(`/attendance/${record.attendance_id}/checkout`)
      fetchRecords()
      showSuccess('Checked out successfully!')
    } catch (e) { alert(e.response?.data?.message || e.message) }
    finally { setActionLoading(null) }
  }

  const handleConfirmSaved = () => {
    setConfirmModal(null)
    fetchRecords()
    showSuccess('Hours confirmed!')
  }

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Attendance</h1>
              <p className="text-xs text-slate-400 mt-0.5">Track daily check-in / check-out for your team</p>
            </div>
          </div>
          {/* Date picker */}
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-400" />
            <input type="date" value={date} onChange={e => { setDate(e.target.value); setSelectedProj(null) }}
              className="px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white" />
            <button onClick={fetchRecords}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
              <Loader2 className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-500' : ''}`} />
            </button>
          </div>
        </div>

        {/* Project tabs (FOREMAN/ADMIN) or badge (WORKER) */}
        <div className="flex items-center gap-1 overflow-x-auto">
          {!canApprove && todayAssignment ? (
            <div className="flex items-center gap-3 px-4 py-2 bg-indigo-50 border border-indigo-200 rounded-lg">
              <div className="w-2 h-2 rounded-full bg-indigo-500 flex-shrink-0" />
              <div>
                <span className="text-xs font-bold text-indigo-800">
                  {todayAssignment.project_code}{todayAssignment.project_name ? ` — ${todayAssignment.project_name}` : ''}
                </span>
                <span className="text-[10px] text-indigo-400 ml-2">Today's assignment</span>
              </div>
            </div>
          ) : canApprove ? (
            <>
              {projects.map(p => (
                <button key={p.id} onClick={() => setSelectedProj(p.id)}
                  className={`flex-shrink-0 px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
                    selectedProj === p.id
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                  }`}>
                  {p.project_code}
                </button>
              ))}
              {projects.length === 0 && !loading && (
                <span className="text-xs text-slate-400 px-2">No active projects for this date</span>
              )}
            </>
          ) : (
            <span className="text-xs text-slate-400 px-2">No assignment today</span>
          )}
        </div>
      </div>

      {/* Summary stats */}
      <div className="flex-shrink-0 px-6 pt-4 pb-2 flex items-center gap-3">
        {[
          { label: 'Total',       value: summary.total,       color: 'bg-slate-100 text-slate-600'   },
          { label: 'On Site',     value: summary.checked_in,  color: 'bg-emerald-100 text-emerald-700' },
          { label: 'Checked Out', value: summary.checked_out, color: 'bg-amber-100 text-amber-700'   },
          { label: 'Confirmed',   value: summary.confirmed,   color: 'bg-indigo-100 text-indigo-700' },
        ].map(s => (
          <div key={s.label} className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold ${s.color}`}>
            <span className="text-base font-extrabold">{s.value}</span>
            <span className="font-semibold opacity-80">{s.label}</span>
          </div>
        ))}

        {successMsg && (
          <div className="ml-auto flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 font-semibold">
            <Check className="w-3.5 h-3.5" />{successMsg}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-hidden mx-6 mb-6 bg-white rounded-xl border border-slate-200 flex flex-col min-h-0">
        {/* Table header */}
        <div className="flex-shrink-0 grid grid-cols-[1.5fr_80px_90px_90px_70px_70px_90px_auto] px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          <span>Employee</span>
          <span>Status</span>
          <span>Check In</span>
          <span>Check Out</span>
          <span>Regular</span>
          <span>Overtime</span>
          <span>Confirmed By</span>
          <span className="text-right">Actions</span>
        </div>

        {/* Rows */}
        <div className="flex-1 overflow-y-auto">
          {loading
            ? <div className="flex justify-center items-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
              </div>
            : records.length === 0
              ? <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Users className="w-10 h-10 text-slate-200 mb-3" />
                  <p className="text-sm font-semibold text-slate-400">No assignments for this date</p>
                  <p className="text-xs text-slate-300 mt-1">Select a different date or project</p>
                </div>
              : records.map(record => (
                  <AttendanceRow
                    key={record.assignment_request_id}
                    record={record}
                    canApprove={canApprove}
                    onCheckin={handleCheckin}
                    onCheckout={handleCheckout}
                    onConfirm={setConfirmModal}
                    actionLoading={actionLoading}
                  />
                ))
          }
        </div>
      </div>

      {/* Confirm/Adjust Modal */}
      {confirmModal && (
        <ConfirmModal
          record={confirmModal}
          onClose={() => setConfirmModal(null)}
          onSaved={handleConfirmSaved}
        />
      )}
    </div>
  )
}
