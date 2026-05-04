import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
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

// Section 59: status colors stay at module scope; labels resolved per render via t().
const STATUS_COLORS = {
  OPEN:        'bg-slate-100 text-slate-500',
  CHECKED_IN:  'bg-emerald-100 text-emerald-700',
  CHECKED_OUT: 'bg-amber-100 text-amber-700',
  CONFIRMED:   'bg-primary-pale text-primary-dark',
  ADJUSTED:    'bg-purple-100 text-purple-700',
}

function StatusBadge({ status }) {
  const { t } = useTranslation()
  const color = STATUS_COLORS[status] || STATUS_COLORS.OPEN
  const label = t(`attendance.statusBadge.${status || 'OPEN'}`)
  return (
    <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full ${color}`}>
      {label}
    </span>
  )
}

// ── Adjust / Confirm Modal ───────────────────────────────────
function ConfirmModal({ record, onClose, onSaved }) {
  const { t } = useTranslation()
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
            <h3 className="text-sm font-bold text-slate-800">{t('attendance.modal.title')}</h3>
            <p className="text-xs text-slate-400 mt-0.5">{record.full_name} — {fmtTime(record.check_in_time)} → {fmtTime(record.check_out_time)}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Calculated summary */}
          <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-500 space-y-1">
            <div className="flex justify-between">
              <span>{t('attendance.modal.checkIn')}</span>
              <span className="font-semibold text-slate-700">{fmtTime(record.check_in_time)}</span>
            </div>
            <div className="flex justify-between">
              <span>{t('attendance.modal.checkOut')}</span>
              <span className="font-semibold text-slate-700">{fmtTime(record.check_out_time)}</span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-1 mt-1">
              <span>{t('attendance.modal.systemCalculated')}</span>
              <span className="font-bold text-slate-500">
                {fmtHours(record.regular_hours)}
                {parseFloat(record.overtime_hours) > 0 && <span className="ml-2 text-amber-600">+{fmtHours(record.overtime_hours)} {t('attendance.modal.otSuffix')}</span>}
              </span>
            </div>
          </div>

          {/* Foreman final values */}
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">{t('attendance.modal.finalHours')}</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-semibold text-primary-light mb-1.5">{t('attendance.modal.regularHours')}</label>
                <select value={regularHours} onChange={e => setRegularHours(parseFloat(e.target.value))}
                  className={selectCls('border-primary-pale focus:ring-primary-light bg-white text-primary-dark')}>
                  {REGULAR_OPTIONS.map(v => (
                    <option key={v} value={v}>{v === 0 ? '0h' : `${v}h`}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-amber-500 mb-1.5">{t('attendance.modal.overtimeHours')}</label>
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
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">{t('attendance.modal.note')}</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
              placeholder={t('attendance.modal.notePlaceholder')}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs resize-none focus:outline-none focus:ring-2 focus:ring-primary-light placeholder:text-slate-300" />
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />{error}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors">
            {t('attendance.modal.cancel')}
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-primary text-white text-xs font-bold rounded-xl hover:bg-primary-dark transition-colors disabled:opacity-60">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Check className="w-3.5 h-3.5" />{t('attendance.modal.confirm')}</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Employee Row ─────────────────────────────────────────────
function AttendanceRow({ record, canApprove, onCheckin, onCheckout, onConfirm, actionLoading }) {
  const { t } = useTranslation()
  const status   = record.attendance_status || 'OPEN'
  const isLoading = actionLoading === record.assignment_request_id

  const finalRegular  = record.confirmed_regular_hours  ?? record.regular_hours
  const finalOvertime = record.confirmed_overtime_hours ?? record.overtime_hours
  const isLate        = record.late_minutes > 15

  return (
    <div className="grid grid-cols-[1.5fr_80px_90px_90px_70px_70px_90px_auto] items-center px-4 py-3 border-t border-slate-50 hover:bg-slate-50/70 transition-colors">
      {/* Employee */}
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
          {(record.full_name || '?')[0]}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-700 truncate">{record.full_name}</div>
          <div className="text-[10px] text-slate-400">{record.trade_code} · {fmtTime(record.shift_start)} {t('attendance.row.shiftSuffix')}</div>
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
          ? <span className="text-primary font-semibold">{record.confirmed_by_name}</span>
          : status === 'CHECKED_OUT' ? <span className="text-amber-500">{t('attendance.row.pending')}</span> : '—'}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-1.5">
        {isLoading
          ? <Loader2 className="w-4 h-4 animate-spin text-primary-light" />
          : (
            <>
              {/* Worker: Check In */}
              {record.is_mine && status === 'OPEN' && (
                <button onClick={() => onCheckin(record)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white text-[11px] font-bold rounded-lg hover:bg-emerald-700 transition-colors whitespace-nowrap">
                  <Check className="w-3 h-3" />{t('attendance.row.checkIn')}
                </button>
              )}
              {/* Worker: Check Out */}
              {record.is_mine && status === 'CHECKED_IN' && (
                <button onClick={() => onCheckout(record)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-slate-700 text-white text-[11px] font-bold rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap">
                  <X className="w-3 h-3" />{t('attendance.row.checkOut')}
                </button>
              )}
              {/* Foreman/Admin: Confirm */}
              {canApprove && status === 'CHECKED_OUT' && (
                <button onClick={() => onConfirm(record)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white text-[11px] font-bold rounded-lg hover:bg-primary-dark transition-colors whitespace-nowrap">
                  <Check className="w-3 h-3" />{t('attendance.row.confirm')}
                </button>
              )}
              {/* Foreman/Admin: Re-adjust */}
              {canApprove && (status === 'CONFIRMED' || status === 'ADJUSTED') && (
                <button onClick={() => onConfirm(record)}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-slate-500 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200 whitespace-nowrap">
                  <Edit2 className="w-3 h-3" />{t('attendance.row.adjust')}
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
  const { t } = useTranslation()
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
      .catch(e => console.error('Failed to load today assignment:', e))
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
    } catch (e) { console.error('Failed to load projects:', e); setProjects([]) }
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
    } catch (e) { console.error('Failed to load attendance records:', e); setRecords([]); setSummary({ total: 0, checked_in: 0, checked_out: 0, confirmed: 0 }) }
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
      showSuccess(t('attendance.success.checkedIn'))
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
      showSuccess(t('attendance.success.checkedOut'))
    } catch (e) { alert(e.response?.data?.message || e.message) }
    finally { setActionLoading(null) }
  }

  const handleConfirmSaved = () => {
    setConfirmModal(null)
    fetchRecords()
    showSuccess(t('attendance.success.hoursConfirmed'))
  }

  const summaryStats = [
    { key: 'total',      label: t('attendance.summary.total'),      value: summary.total,       color: 'bg-slate-100 text-slate-600'   },
    { key: 'onSite',     label: t('attendance.summary.onSite'),     value: summary.checked_in,  color: 'bg-emerald-100 text-emerald-700' },
    { key: 'checkedOut', label: t('attendance.summary.checkedOut'), value: summary.checked_out, color: 'bg-amber-100 text-amber-700'   },
    { key: 'confirmed',  label: t('attendance.summary.confirmed'),  value: summary.confirmed,   color: 'bg-primary-pale text-primary-dark' },
  ]

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">{t('attendance.title')}</h1>
              <p className="text-xs text-slate-400 mt-0.5">{t('attendance.subtitle')}</p>
            </div>
          </div>
          {/* Date picker */}
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-400" />
            <input type="date" value={date} onChange={e => { setDate(e.target.value); setSelectedProj(null) }}
              className="px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-light bg-white" />
            <button onClick={fetchRecords}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
              <Loader2 className={`w-4 h-4 ${loading ? 'animate-spin text-primary' : ''}`} />
            </button>
          </div>
        </div>

        {/* Project tabs (FOREMAN/ADMIN) or badge (WORKER) */}
        <div className="flex items-center gap-1 overflow-x-auto">
          {!canApprove && todayAssignment ? (
            <div className="flex items-center gap-3 px-4 py-2 bg-primary-pale border border-primary-pale rounded-lg">
              <div className="w-2 h-2 rounded-full bg-primary-light flex-shrink-0" />
              <div>
                <span className="text-xs font-bold text-primary-dark">
                  {todayAssignment.project_code}{todayAssignment.project_name ? ` — ${todayAssignment.project_name}` : ''}
                </span>
                <span className="text-[10px] text-primary-light ml-2">{t('attendance.todaysAssignment')}</span>
              </div>
            </div>
          ) : canApprove ? (
            <>
              {projects.map(p => (
                <button key={p.id} onClick={() => setSelectedProj(p.id)}
                  className={`flex-shrink-0 px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
                    selectedProj === p.id
                      ? 'bg-primary text-white shadow-sm'
                      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                  }`}>
                  {p.project_code}
                </button>
              ))}
              {projects.length === 0 && !loading && (
                <span className="text-xs text-slate-400 px-2">{t('attendance.noProjects')}</span>
              )}
            </>
          ) : (
            <span className="text-xs text-slate-400 px-2">{t('attendance.noAssignmentToday')}</span>
          )}
        </div>
      </div>

      {/* Summary stats */}
      <div className="flex-shrink-0 px-6 pt-4 pb-2 flex items-center gap-3">
        {summaryStats.map(s => (
          <div key={s.key} className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold ${s.color}`}>
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
          <span>{t('attendance.th.employee')}</span>
          <span>{t('attendance.th.status')}</span>
          <span>{t('attendance.th.checkIn')}</span>
          <span>{t('attendance.th.checkOut')}</span>
          <span>{t('attendance.th.regular')}</span>
          <span>{t('attendance.th.overtime')}</span>
          <span>{t('attendance.th.confirmedBy')}</span>
          <span className="text-right">{t('attendance.th.actions')}</span>
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
                  <p className="text-sm font-semibold text-slate-400">{t('attendance.empty')}</p>
                  <p className="text-xs text-slate-300 mt-1">{t('attendance.emptyHint')}</p>
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
