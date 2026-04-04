import { useState, useCallback } from 'react'
import api from '@/lib/api'
import { usePermissions } from '@/hooks/usePermissions.jsx'
import { todayStr, tomorrowStr, fmtTime, fmtHours, fmtDate } from '@/utils/formatters'
import {
  BarChart2, Clock, MapPin, CalendarCheck, Users,
  Loader2, AlertCircle, Download, ChevronDown,
  TrendingUp, AlertTriangle, Check, User
} from 'lucide-react'

// ── Helpers ───────────────────────────────────────────────────

function weekRange() {
  const now = new Date()
  const day = now.getDay() || 7
  const mon = new Date(now); mon.setDate(now.getDate() - day + 1)
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
  return { from: mon.toISOString().split('T')[0], to: sun.toISOString().split('T')[0] }
}
function monthRange() {
  const now = new Date()
  const first = new Date(now.getFullYear(), now.getMonth(), 1)
  const last  = new Date(now.getFullYear(), now.getMonth()+1, 0)
  return { from: first.toISOString().split('T')[0], to: last.toISOString().split('T')[0] }
}
function fmtKm(km) {
  if (!km) return '—'
  return `${parseFloat(km).toFixed(1)} km`
}
function fmtCAD(n) {
  if (!n) return '—'
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(n)
}

function exportCSV(rows, columns, filename) {
  const header = columns.map(c => c.label).join(',')
  const body   = rows.map(r => columns.map(c => {
    const v = c.value(r)
    if (v == null || v === '') return ''
    const s = String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s
  }).join(',')).join('\n')
  const blob = new Blob([header + '\n' + body], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
}

// ── Shared: Date filter bar ───────────────────────────────────
function FilterBar({ from, to, setFrom, setTo, onRun, loading, extra }) {
  const setRange = (r) => { setFrom(r.from); setTo(r.to) }
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
        {[
          { label: 'This Week',  fn: weekRange  },
          { label: 'This Month', fn: monthRange  },
        ].map(q => (
          <button key={q.label} onClick={() => setRange(q.fn())}
            className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-white hover:text-slate-900 rounded-md transition-colors">
            {q.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-slate-400">From</span>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)}
          className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400" />
        <span className="text-xs text-slate-400">To</span>
        <input type="date" value={to} min={from} onChange={e => setTo(e.target.value)}
          className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400" />
      </div>
      {extra}
      <button onClick={onRun} disabled={loading}
        className="flex items-center gap-2 px-4 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-60">
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><BarChart2 className="w-3.5 h-3.5" />Run</>}
      </button>
    </div>
  )
}

// ── Shared: empty + error states ─────────────────────────────
function Empty({ icon: Icon, text }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <Icon className="w-10 h-10 text-slate-200 mb-3" />
      <p className="text-sm font-semibold text-slate-400">{text}</p>
      <p className="text-xs text-slate-300 mt-1">Adjust the filters and run the report</p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// 1. Hours Report
// ─────────────────────────────────────────────────────────────
function HoursReport() {
  const wr = weekRange()
  const [from, setFrom] = useState(wr.from)
  const [to,   setTo]   = useState(wr.to)
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const run = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const r = await api.get(`/reports/hours?from=${from}&to=${to}`)
      setData(r.data)
    } catch (e) { setError(e.response?.data?.error || e.message) }
    finally { setLoading(false) }
  }, [from, to])

  const handleExport = () => {
    if (!data?.records?.length) return
    exportCSV(data.records, [
      { label: 'Employee',       value: r => r.full_name },
      { label: 'Trade',          value: r => r.trade_code },
      { label: 'Project',        value: r => r.project_code },
      { label: 'Project Name',   value: r => r.project_name },
      { label: 'Days Worked',    value: r => r.days_worked },
      { label: 'Regular Hours',  value: r => r.total_regular },
      { label: 'Overtime Hours', value: r => r.total_overtime },
      { label: 'Total Hours',    value: r => r.total_hours },
      { label: 'Confirmed Days', value: r => r.confirmed_days },
      { label: 'Late Days',      value: r => r.late_days },
    ], `hours_${from}_${to}.csv`)
  }

  const totals = data?.totals

  return (
    <div className="space-y-4">
      <FilterBar from={from} to={to} setFrom={setFrom} setTo={setTo} onRun={run} loading={loading} />

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
        </div>
      )}

      {totals && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Days Worked',   value: totals.days_worked,                   color: 'bg-slate-100 text-slate-700' },
            { label: 'Regular Hours', value: fmtHours(totals.total_regular),       color: 'bg-indigo-100 text-indigo-700' },
            { label: 'Overtime',      value: fmtHours(totals.total_overtime),      color: 'bg-amber-100 text-amber-700' },
            { label: 'Total Hours',   value: fmtHours(totals.total_hours),         color: 'bg-emerald-100 text-emerald-700' },
          ].map(s => (
            <div key={s.label} className={`flex flex-col px-4 py-3 rounded-xl ${s.color}`}>
              <span className="text-xs font-semibold opacity-70">{s.label}</span>
              <span className="text-2xl font-extrabold mt-1">{s.value}</span>
            </div>
          ))}
        </div>
      )}

      {data?.records?.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-200">
            <span className="text-xs font-bold text-slate-500">{data.records.length} records</span>
            <button onClick={handleExport}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 rounded-lg transition-colors">
              <Download className="w-3.5 h-3.5" />Export CSV
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  {['Employee','Trade','Project','Days','Regular','Overtime','Total','Confirmed','Late'].map(h => (
                    <th key={h} className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 py-2.5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.records.map((r, i) => (
                  <tr key={i} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60 transition-colors">
                    <td className="px-4 py-2.5 text-sm font-semibold text-slate-700">{r.full_name}</td>
                    <td className="px-4 py-2.5">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{r.trade_code}</span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-600">{r.project_code}</td>
                    <td className="px-4 py-2.5 text-xs font-bold text-slate-700">{r.days_worked}</td>
                    <td className="px-4 py-2.5 text-xs font-bold text-indigo-600">{fmtHours(r.total_regular)}</td>
                    <td className="px-4 py-2.5">
                      {parseFloat(r.total_overtime) > 0
                        ? <span className="text-xs font-bold text-amber-600">+{fmtHours(r.total_overtime)}</span>
                        : <span className="text-xs text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-xs font-bold text-emerald-700">{fmtHours(r.total_hours)}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-[10px] font-semibold ${r.confirmed_days === r.days_worked ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {r.confirmed_days}/{r.days_worked}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      {r.late_days > 0
                        ? <span className="text-[10px] font-semibold text-red-500">{r.late_days}x late</span>
                        : <span className="text-[10px] text-slate-300">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && !error && data && data.records.length === 0 && (
        <Empty icon={Clock} text="No hours data for this period" />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// 2. Attendance Summary
// ─────────────────────────────────────────────────────────────
function AttendanceReport() {
  const wr = weekRange()
  const [from, setFrom] = useState(wr.from)
  const [to,   setTo]   = useState(wr.to)
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const run = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const r = await api.get(`/reports/attendance?from=${from}&to=${to}`)
      setData(r.data)
    } catch (e) { setError(e.response?.data?.error || e.message) }
    finally { setLoading(false) }
  }, [from, to])

  const handleExport = () => {
    if (!data?.records?.length) return
    exportCSV(data.records, [
      { label: 'Employee',        value: r => r.full_name },
      { label: 'Trade',           value: r => r.trade_code },
      { label: 'Role',            value: r => r.assignment_role },
      { label: 'Project',         value: r => r.project_code },
      { label: 'Scheduled Days',  value: r => r.scheduled_days },
      { label: 'Present Days',    value: r => r.present_days },
      { label: 'Absent Days',     value: r => r.absent_days },
      { label: 'Late Days',       value: r => r.late_days },
    ], `attendance_${from}_${to}.csv`)
  }

  // Group by project
  const grouped = data?.records ? Object.values(data.records.reduce((acc, r) => {
    const k = r.project_code
    if (!acc[k]) acc[k] = { project_code: r.project_code, project_name: r.project_name, rows: [] }
    acc[k].rows.push(r)
    return acc
  }, {})) : []

  return (
    <div className="space-y-4">
      <FilterBar from={from} to={to} setFrom={setFrom} setTo={setTo} onRun={run} loading={loading} />

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
        </div>
      )}

      {data?.records?.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">{data.records.length} assignments · {grouped.length} projects</span>
            <button onClick={handleExport}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 rounded-lg transition-colors">
              <Download className="w-3.5 h-3.5" />Export CSV
            </button>
          </div>
          {grouped.map(group => (
            <div key={group.project_code} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-2.5 bg-indigo-50 border-b border-indigo-100 flex items-center gap-2">
                <span className="text-sm font-bold text-indigo-800">{group.project_code}</span>
                {group.project_name && <span className="text-xs text-indigo-500">{group.project_name}</span>}
                <span className="ml-auto text-[10px] font-semibold px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-lg">{group.rows.length} employees</span>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100">
                    {['Employee','Trade','Role','Scheduled','Present','Absent','Late'].map(h => (
                      <th key={h} className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 py-2">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map((r, i) => {
                    const pct = r.scheduled_days > 0 ? Math.round((r.present_days / r.scheduled_days) * 100) : 0
                    return (
                      <tr key={i} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                        <td className="px-4 py-2.5 text-sm font-semibold text-slate-700">{r.full_name}</td>
                        <td className="px-4 py-2.5"><span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{r.trade_code}</span></td>
                        <td className="px-4 py-2.5 text-xs text-slate-500">{r.assignment_role}</td>
                        <td className="px-4 py-2.5 text-xs font-semibold text-slate-600">{r.scheduled_days}d</td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-emerald-600">{r.present_days}d</span>
                            <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-[10px] text-slate-400">{pct}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          {r.absent_days > 0
                            ? <span className="text-xs font-bold text-red-500">{r.absent_days}d</span>
                            : <span className="text-xs text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-2.5">
                          {r.late_days > 0
                            ? <span className="text-[10px] font-semibold text-amber-600">{r.late_days}x</span>
                            : <span className="text-xs text-slate-300">—</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </>
      )}

      {!loading && !error && data && data.records.length === 0 && (
        <Empty icon={CalendarCheck} text="No attendance data for this period" />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// 3. CCQ Travel Allowance
// ─────────────────────────────────────────────────────────────
function TravelReport() {
  const mr = monthRange()
  const [from, setFrom] = useState(mr.from)
  const [to,   setTo]   = useState(mr.to)
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const run = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const r = await api.get(`/reports/travel?from=${from}&to=${to}`)
      setData(r.data)
    } catch (e) { setError(e.response?.data?.error || e.message) }
    finally { setLoading(false) }
  }, [from, to])

  const handleExport = () => {
    if (!data?.records?.length) return
    exportCSV(data.records, [
      { label: 'Employee',       value: r => r.full_name },
      { label: 'Trade',          value: r => r.trade_code },
      { label: 'Project',        value: r => r.project_code },
      { label: 'Distance (km)',  value: r => r.distance_km },
      { label: 'Zone',           value: r => r.zone_label },
      { label: 'Rate/Day (CAD)', value: r => r.rate_per_day },
      { label: 'Days Worked',    value: r => r.days_worked },
      { label: 'Total (CAD)',    value: r => r.total_allowance },
    ], `travel_allowance_${from}_${to}.csv`)
  }

  const ZONE_COLOR = {
    'T2200': 'bg-blue-100 text-blue-700',
    'A': 'bg-amber-100 text-amber-700',
    'B': 'bg-amber-100 text-amber-700',
    'C': 'bg-orange-100 text-orange-700',
    'D': 'bg-orange-100 text-orange-700',
    'E': 'bg-red-100 text-red-700',
    'F': 'bg-red-100 text-red-700',
    'G': 'bg-red-100 text-red-700',
  }

  return (
    <div className="space-y-4">
      <FilterBar from={from} to={to} setFrom={setFrom} setTo={setTo} onRun={run} loading={loading} />

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
        </div>
      )}

      {data?.records?.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400">{data.records.length} records</span>
              {data.grand_total > 0 && (
                <span className="text-sm font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200">
                  Total Allowance: {fmtCAD(data.grand_total)}
                </span>
              )}
            </div>
            <button onClick={handleExport}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 rounded-lg transition-colors">
              <Download className="w-3.5 h-3.5" />Export CSV
            </button>
          </div>

          {/* CCQ zone legend */}
          <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl">
            <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-2">CCQ Zone Reference (ACQ Schedule)</p>
            <div className="flex flex-wrap gap-2 text-[10px]">
              {[
                { zone: 'T2200', label: '41–65 km — T2200 tax form only' },
                { zone: 'A', label: '65–75 km — $15.61/day' },
                { zone: 'B', label: '76–100 km — $20.82/day' },
                { zone: 'C', label: '101–125 km — $26.02/day' },
                { zone: 'D', label: '126–150 km — $31.23/day' },
              ].map(z => (
                <span key={z.zone} className={`px-2 py-0.5 rounded-full font-semibold ${ZONE_COLOR[z.zone]}`}>
                  {z.label}
                </span>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {['Employee','Trade','Project','Distance','Zone','Rate/Day','Days','Total'].map(h => (
                    <th key={h} className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 py-2.5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.records.map((r, i) => (
                  <tr key={i} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                    <td className="px-4 py-2.5 text-sm font-semibold text-slate-700">{r.full_name}</td>
                    <td className="px-4 py-2.5"><span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{r.trade_code}</span></td>
                    <td className="px-4 py-2.5 text-xs text-slate-600">{r.project_code}</td>
                    <td className="px-4 py-2.5 text-xs font-bold text-slate-700">{fmtKm(r.distance_km)}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ZONE_COLOR[r.zone] || 'bg-slate-100 text-slate-500'}`}>
                        {r.zone === 'T2200' ? 'T2200' : `Zone ${r.zone}`}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-600">
                      {r.rate_per_day > 0 ? fmtCAD(r.rate_per_day) : <span className="text-slate-400">Form only</span>}
                    </td>
                    <td className="px-4 py-2.5 text-xs font-semibold text-slate-700">{r.days_worked}d</td>
                    <td className="px-4 py-2.5 text-sm font-bold text-emerald-700">
                      {r.total_allowance > 0 ? fmtCAD(r.total_allowance) : <span className="text-xs text-slate-400">T2200</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!loading && !error && data && data.records.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <MapPin className="w-10 h-10 text-slate-200 mb-3" />
          <p className="text-sm font-semibold text-slate-400">No travel allowance data</p>
          <p className="text-xs text-slate-300 mt-1">Only assignments with calculated distance will appear here</p>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// 4. Assignments Report
// ─────────────────────────────────────────────────────────────
function AssignmentsReport() {
  const mr = monthRange()
  const [from, setFrom] = useState(mr.from)
  const [to,   setTo]   = useState(mr.to)
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const run = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const r = await api.get(`/reports/assignments?from=${from}&to=${to}`)
      setData(r.data)
    } catch (e) { setError(e.response?.data?.error || e.message) }
    finally { setLoading(false) }
  }, [from, to])

  const handleExport = () => {
    if (!data?.records?.length) return
    exportCSV(data.records, [
      { label: 'Employee',    value: r => r.full_name },
      { label: 'Trade',       value: r => r.trade_code },
      { label: 'Role',        value: r => r.assignment_role },
      { label: 'Project',     value: r => r.project_code },
      { label: 'Site Address',value: r => r.site_address },
      { label: 'Start Date',  value: r => r.start_date },
      { label: 'End Date',    value: r => r.end_date },
      { label: 'Shift Start', value: r => r.shift_start },
      { label: 'Shift End',   value: r => r.shift_end },
      { label: 'Distance km', value: r => r.distance_km },
    ], `assignments_${from}_${to}.csv`)
  }

  const grouped = data?.records ? Object.values(data.records.reduce((acc, r) => {
    const k = r.project_code
    if (!acc[k]) acc[k] = { project_code: r.project_code, project_name: r.project_name, site_address: r.site_address, rows: [] }
    acc[k].rows.push(r)
    return acc
  }, {})) : []

  return (
    <div className="space-y-4">
      <FilterBar from={from} to={to} setFrom={setFrom} setTo={setTo} onRun={run} loading={loading} />

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
        </div>
      )}

      {data?.records?.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">{data.records.length} assignments · {grouped.length} projects</span>
            <button onClick={handleExport}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 rounded-lg transition-colors">
              <Download className="w-3.5 h-3.5" />Export CSV
            </button>
          </div>
          {grouped.map(group => (
            <div key={group.project_code} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                <span className="text-sm font-bold text-slate-800">{group.project_code}</span>
                {group.project_name && <span className="text-xs text-slate-400">{group.project_name}</span>}
                {group.site_address && <span className="text-[10px] text-slate-400 ml-1">· 📍 {group.site_address}</span>}
                <span className="ml-auto text-[10px] font-semibold px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-lg">{group.rows.length}</span>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100">
                    {['Employee','Trade','Role','Period','Shift','Distance'].map(h => (
                      <th key={h} className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 py-2">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map((r, i) => (
                    <tr key={i} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                      <td className="px-4 py-2.5 text-sm font-semibold text-slate-700">{r.full_name}</td>
                      <td className="px-4 py-2.5"><span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{r.trade_code}</span></td>
                      <td className="px-4 py-2.5 text-xs text-slate-500">{r.assignment_role}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-600">{fmtDate(r.start_date)} → {fmtDate(r.end_date)}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-600">{fmtTime(r.shift_start)} – {fmtTime(r.shift_end)}</td>
                      <td className="px-4 py-2.5 text-xs font-semibold text-slate-600">{fmtKm(r.distance_km)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </>
      )}

      {!loading && !error && data && data.records.length === 0 && (
        <Empty icon={Users} text="No assignments for this period" />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// 5. Distance Report (41km+)
// ─────────────────────────────────────────────────────────────
function DistanceReport() {
  const mr = monthRange()
  const [from, setFrom]       = useState(mr.from)
  const [to,   setTo]         = useState(mr.to)
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [sortCol, setSortCol] = useState('distance_km')
  const [sortDir, setSortDir] = useState('desc')
  const [filterEmp,  setFilterEmp]  = useState('')
  const [filterProj, setFilterProj] = useState('')

  const run = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const r = await api.get(`/reports/distance?from=${from}&to=${to}`)
      setData(r.data)
    } catch (e) { setError(e.response?.data?.error || e.message) }
    finally { setLoading(false) }
  }, [from, to])

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('desc') }
  }

  const SortIcon = ({ col }) => {
    if (sortCol !== col) return <span className="text-slate-300 ml-1">↕</span>
    return <span className="text-indigo-500 ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  const handleExport = () => {
    if (!data?.records?.length) return
    exportCSV(sortedRecords, [
      { label: 'Employee',     value: r => r.full_name },
      { label: 'Trade',        value: r => r.trade_code },
      { label: 'Project',      value: r => r.project_code },
      { label: 'Distance km',  value: r => r.distance_km },
      { label: 'Zone',         value: r => r.zone_label },
      { label: 'Needs T2200',  value: r => r.needs_t2200 ? 'YES' : '' },
      { label: 'Allowance/Day',value: r => r.rate_per_day },
      { label: 'Days Worked',  value: r => r.days_worked },
      { label: 'Total (CAD)',  value: r => r.total_allowance },
    ], `distance_report_${from}_${to}.csv`)
  }

  // Get unique employees and projects for filter dropdowns
  const employees = [...new Set((data?.records || []).map(r => r.full_name))].sort()
  const projects  = [...new Set((data?.records || []).map(r => r.project_code))].sort()

  // Apply filters
  const filtered = (data?.records || []).filter(r => {
    if (filterEmp  && r.full_name    !== filterEmp)  return false
    if (filterProj && r.project_code !== filterProj) return false
    return true
  })

  // Apply sort
  const sortedRecords = [...filtered].sort((a, b) => {
    let va = a[sortCol], vb = b[sortCol]
    if (typeof va === 'string') va = va.toLowerCase()
    if (typeof vb === 'string') vb = vb.toLowerCase()
    if (va < vb) return sortDir === 'asc' ? -1 : 1
    if (va > vb) return sortDir === 'asc' ? 1 : -1
    return 0
  })

  const t2200Count     = filtered.filter(r => r.needs_t2200).length
  const allowanceRecs  = filtered.filter(r => r.needs_allowance)
  const totalAllowance = allowanceRecs.reduce((s, r) => s + r.total_allowance, 0)

  return (
    <div className="space-y-4">
      <FilterBar from={from} to={to} setFrom={setFrom} setTo={setTo} onRun={run} loading={loading} />

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
        </div>
      )}

      {data?.records?.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
              <p className="text-xs font-semibold text-blue-500">Needs T2200 Form</p>
              <p className="text-2xl font-extrabold text-blue-700 mt-1">{t2200Count}</p>
              <p className="text-[10px] text-blue-400 mt-0.5">41–65 km employees</p>
            </div>
            <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
              <p className="text-xs font-semibold text-amber-500">Company Allowance</p>
              <p className="text-2xl font-extrabold text-amber-700 mt-1">{allowanceRecs.length}</p>
              <p className="text-[10px] text-amber-400 mt-0.5">65km+ employees</p>
            </div>
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
              <p className="text-xs font-semibold text-emerald-500">Total Allowance</p>
              <p className="text-2xl font-extrabold text-emerald-700 mt-1">{fmtCAD(totalAllowance)}</p>
              <p className="text-[10px] text-emerald-400 mt-0.5">this period</p>
            </div>
          </div>

          {/* Filters + Export */}
          <div className="flex items-center gap-2 flex-wrap">
            <select value={filterEmp} onChange={e => setFilterEmp(e.target.value)}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400">
              <option value="">All Employees</option>
              {employees.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
            <select value={filterProj} onChange={e => setFilterProj(e.target.value)}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400">
              <option value="">All Projects</option>
              {projects.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            {(filterEmp || filterProj) && (
              <button onClick={() => { setFilterEmp(''); setFilterProj('') }}
                className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg bg-white">
                Clear filters
              </button>
            )}
            <span className="text-xs text-slate-400 ml-auto">{sortedRecords.length} employees 41km+</span>
            <button onClick={handleExport}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 rounded-lg transition-colors">
              <Download className="w-3.5 h-3.5" />Export CSV
            </button>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {[
                    { label: 'Employee',        col: 'full_name' },
                    { label: 'Trade',           col: 'trade_code' },
                    { label: 'Project',         col: 'project_code' },
                    { label: 'Distance',        col: 'distance_km' },
                    { label: 'Action Required', col: null },
                    { label: 'Rate/Day',        col: 'rate_per_day' },
                    { label: 'Days',            col: 'days_worked' },
                    { label: 'Total',           col: 'total_allowance' },
                  ].map(h => (
                    <th key={h.label}
                      onClick={() => h.col && handleSort(h.col)}
                      className={`text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 py-2.5 ${h.col ? 'cursor-pointer hover:text-slate-600 select-none' : ''}`}>
                      {h.label}{h.col && <SortIcon col={h.col} />}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedRecords.map((r, i) => (
                  <tr key={i} className={`border-b border-slate-50 last:border-0 hover:bg-slate-50/60 ${r.needs_t2200 ? 'bg-blue-50/30' : r.needs_allowance ? 'bg-amber-50/30' : ''}`}>
                    <td className="px-4 py-2.5 text-sm font-semibold text-slate-700">{r.full_name}</td>
                    <td className="px-4 py-2.5"><span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{r.trade_code}</span></td>
                    <td className="px-4 py-2.5 text-xs text-slate-600">{r.project_code}</td>
                    <td className="px-4 py-2.5 text-xs font-bold text-slate-700">{fmtKm(r.distance_km)}</td>
                    <td className="px-4 py-2.5">
                      {r.needs_t2200
                        ? <span className="flex items-center gap-1 text-[10px] font-bold text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full w-fit"><AlertTriangle className="w-3 h-3" />T2200 Form</span>
                        : <span className="flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full w-fit"><TrendingUp className="w-3 h-3" />Pay Allowance</span>
                      }
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-600">
                      {r.rate_per_day > 0 ? fmtCAD(r.rate_per_day) : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-xs font-semibold text-slate-700">{r.days_worked}d</td>
                    <td className="px-4 py-2.5 text-sm font-bold text-emerald-700">
                      {r.total_allowance > 0 ? fmtCAD(r.total_allowance) : <span className="text-xs text-blue-600">T2200</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!loading && !error && data && data.records.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <MapPin className="w-10 h-10 text-slate-200 mb-3" />
          <p className="text-sm font-semibold text-slate-400">No employees at 41km+ for this period</p>
          <p className="text-xs text-slate-300 mt-1">Distance is calculated at assignment time via Mapbox</p>
        </div>
      )}
    </div>
  )
}

function yearRange() {
  const y = new Date().getFullYear()
  return { from: `${y}-01-01`, to: `${y}-12-31` }
}

// ─────────────────────────────────────────────────────────────
// My Report — Employee self-service weekly report
// ─────────────────────────────────────────────────────────────
function MyReport() {
  const wr = weekRange()
  const [from, setFrom]             = useState(wr.from)
  const [to,   setTo]               = useState(wr.to)
  const [distFilter, setDistFilter] = useState('all') // 'all' | '41plus'
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const run = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const r = await api.get(`/reports/my-daily?from=${from}&to=${to}`)
      setData(r.data)
    } catch (e) { setError(e.response?.data?.error || e.message) }
    finally { setLoading(false) }
  }, [from, to])

  const ZONE_COLOR = {
    'T2200': 'bg-blue-100 text-blue-700',
    'A': 'bg-amber-100 text-amber-700',
    'B': 'bg-amber-100 text-amber-700',
    'C': 'bg-orange-100 text-orange-700',
    'D': 'bg-orange-100 text-orange-700',
    'E': 'bg-red-100 text-red-700',
    'F': 'bg-red-100 text-red-700',
    'G': 'bg-red-100 text-red-700',
  }

  const STATUS_BADGE = {
    CHECKED_IN:  'bg-emerald-100 text-emerald-700',
    CHECKED_OUT: 'bg-amber-100 text-amber-700',
    CONFIRMED:   'bg-indigo-100 text-indigo-700',
    ADJUSTED:    'bg-purple-100 text-purple-700',
  }

  // Apply distance filter on frontend
  const visibleRecords = distFilter === '41plus'
    ? (data?.records || []).filter(r => parseFloat(r.distance_km || 0) >= 41)
    : (data?.records || [])

  const t = data?.totals

  const distFilterExtra = (
    <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
      <button onClick={() => setDistFilter('all')}
        className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${distFilter === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:bg-white hover:text-slate-900'}`}>
        All Days
      </button>
      <button onClick={() => { setDistFilter('41plus'); setFrom(yearRange().from); setTo(yearRange().to) }}
        className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${distFilter === '41plus' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:bg-white hover:text-slate-900'}`}>
        🚗 41km+ (T2200)
      </button>
    </div>
  )

  return (
    <div className="space-y-4">
      <FilterBar from={from} to={to} setFrom={setFrom} setTo={setTo} onRun={run} loading={loading} extra={distFilterExtra} />

      {distFilter === '41plus' && (
        <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-700">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          Showing only days where your worksite was 41km+ from home — eligible for T2200 tax declaration or company travel allowance.
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
        </div>
      )}

      {t && (
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-white border border-slate-200 rounded-xl px-4 py-3">
            <p className="text-xs font-semibold text-slate-400">Days Worked</p>
            <p className="text-2xl font-extrabold text-slate-700 mt-1">{distFilter === '41plus' ? visibleRecords.length : t.days_worked}</p>
          </div>
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3">
            <p className="text-xs font-semibold text-indigo-400">Regular Hours</p>
            <p className="text-2xl font-extrabold text-indigo-700 mt-1">{fmtHours(t.total_regular)}</p>
          </div>
          <div className={`border rounded-xl px-4 py-3 ${t.total_overtime > 0 ? 'bg-amber-50 border-amber-100' : 'bg-slate-50 border-slate-200'}`}>
            <p className={`text-xs font-semibold ${t.total_overtime > 0 ? 'text-amber-400' : 'text-slate-400'}`}>Overtime</p>
            <p className={`text-2xl font-extrabold mt-1 ${t.total_overtime > 0 ? 'text-amber-700' : 'text-slate-400'}`}>{fmtHours(t.total_overtime)}</p>
          </div>
          <div className={`border rounded-xl px-4 py-3 ${t.total_allowance > 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-200'}`}>
            <p className={`text-xs font-semibold ${t.total_allowance > 0 ? 'text-emerald-500' : 'text-slate-400'}`}>Travel Allowance</p>
            <p className={`text-2xl font-extrabold mt-1 ${t.total_allowance > 0 ? 'text-emerald-700' : 'text-slate-400'}`}>
              {t.total_allowance > 0 ? fmtCAD(t.total_allowance) : '—'}
            </p>
          </div>
        </div>
      )}

      {visibleRecords.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {['Date','Project','Check In','Check Out','Regular','Overtime','Status','Distance','Travel Allowance'].map(h => (
                  <th key={h} className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 py-2.5 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRecords.map((r, i) => (
                <tr key={i} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                  <td className="px-4 py-2.5 text-xs font-semibold text-slate-700 whitespace-nowrap">
                    {new Date(r.attendance_date + 'T00:00:00').toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="text-xs font-semibold text-slate-700">{r.project_code}</div>
                    {r.project_name && <div className="text-[10px] text-slate-400">{r.project_name}</div>}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-600">{fmtTime(r.check_in_time)}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-600">{r.check_out_time ? fmtTime(r.check_out_time) : '—'}</td>
                  <td className="px-4 py-2.5 text-xs font-bold text-indigo-600">{fmtHours(r.regular_hours)}</td>
                  <td className="px-4 py-2.5">
                    {parseFloat(r.overtime_hours) > 0
                      ? <span className="text-xs font-bold text-amber-600">+{fmtHours(r.overtime_hours)}</span>
                      : <span className="text-xs text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_BADGE[r.status] || 'bg-slate-100 text-slate-500'}`}>
                      {r.status === 'CONFIRMED' ? '✓ Confirmed' : r.status === 'ADJUSTED' ? '✓ Adjusted' : r.status === 'CHECKED_OUT' ? 'Pending' : r.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs font-semibold text-slate-600">
                    {r.distance_km ? fmtKm(r.distance_km) : '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    {r.eligible_travel ? (
                      r.needs_t2200
                        ? <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ZONE_COLOR['T2200']}`}>T2200</span>
                        : <span className="text-xs font-bold text-emerald-700">{fmtCAD(r.daily_allowance)}</span>
                    ) : <span className="text-xs text-slate-300">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && visibleRecords.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center bg-white rounded-xl border border-slate-200">
          <Clock className="w-10 h-10 text-slate-200 mb-3" />
          <p className="text-sm font-semibold text-slate-400">
            {distFilter === '41plus' ? 'No days with 41km+ distance for this period' : 'No attendance records for this period'}
          </p>
        </div>
      )}

      {!loading && !error && !data && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <User className="w-10 h-10 text-slate-200 mb-3" />
          <p className="text-sm font-semibold text-slate-400">Select a date range and press Run</p>
        </div>
      )}

      {visibleRecords.length > 0 && (
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[10px] text-slate-400">
          This report is generated from your confirmed attendance records. Hours marked as "Pending" may still be adjusted by your foreman.
          For official documentation, please contact your HR department.
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────
const ADMIN_TABS = [
  { id: 'hours',       icon: Clock,         label: 'Work Hours'     },
  { id: 'attendance',  icon: CalendarCheck, label: 'Attendance'     },
  { id: 'assignments', icon: Users,         label: 'Assignments'    },
  { id: 'distance',    icon: TrendingUp,    label: 'Distance 41km+' },
]

export default function ReportsPage() {
  const { can, loading: permsLoading } = usePermissions()
  const canViewAll = !permsLoading && can('reports', 'view')
  const TABS = canViewAll
    ? [{ id: 'my', icon: User, label: 'My Report' }, ...ADMIN_TABS]
    : [{ id: 'my', icon: User, label: 'My Report' }]

  const [tab, setTab] = useState('my')

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center">
            <BarChart2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Reports</h1>
            <p className="text-xs text-slate-400 mt-0.5">Workforce analytics — hours, attendance, travel &amp; assignments</p>
          </div>
        </div>
        <div className="flex items-center gap-1 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                tab === t.id ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
              }`}>
              <t.icon className="w-3.5 h-3.5" />{t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {tab === 'my'          && <MyReport />}
        {tab === 'hours'       && <HoursReport />}
        {tab === 'attendance'  && <AttendanceReport />}
        {tab === 'assignments' && <AssignmentsReport />}
        {tab === 'distance'    && <DistanceReport />}
      </div>
    </div>
  )
}
