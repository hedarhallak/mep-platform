import { useState, useEffect, useCallback, useRef } from 'react'
import api from '@/lib/api'
import {
  Briefcase, MapPin, Clock, User, Check, X, Loader2,
  ChevronRight, AlertCircle, Plus, Calendar, List,
  Map as MapIcon, Search, Users, TrendingUp, RefreshCw, ArrowLeftRight
} from 'lucide-react'

const todayStr = () => new Date().toISOString().split('T')[0]

function fmt(d, opts = { month: 'short', day: 'numeric' }) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-CA', opts)
}

function daysBetween(a, b) {
  return Math.max(1, Math.round((new Date(b) - new Date(a)) / 86400000) + 1)
}

const TRADE_MAP = {
  PLUMBING:      { bg: 'bg-sky-500',     light: 'bg-sky-100 text-sky-700',        dot: '#0ea5e9' },
  ELECTRICAL:    { bg: 'bg-amber-500',   light: 'bg-amber-100 text-amber-700',    dot: '#f59e0b' },
  HVAC:          { bg: 'bg-emerald-500', light: 'bg-emerald-100 text-emerald-700', dot: '#10b981' },
  CARPENTRY:     { bg: 'bg-orange-500',  light: 'bg-orange-100 text-orange-700',  dot: '#f97316' },
  ELEVATOR_TECH: { bg: 'bg-rose-500',    light: 'bg-rose-100 text-rose-700',      dot: '#f43f5e' },
  GENERAL:       { bg: 'bg-slate-500',   light: 'bg-slate-100 text-slate-600',    dot: '#64748b' },
  DEFAULT:       { bg: 'bg-slate-400',   light: 'bg-slate-100 text-slate-600',    dot: '#94a3b8' },
}
const trade = (code) => TRADE_MAP[(code || '').toUpperCase()] || TRADE_MAP.DEFAULT

const SHIFTS = ['05:00','06:00','07:00','08:00','09:00','12:00',
                '14:00','14:30','15:00','16:00','18:00','20:00','22:00']
const fmtTime = (t) => {
  if (!t) return t
  const [h, m] = t.split(':').map(Number)
  const ap = h < 12 ? 'AM' : 'PM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${String(h12).padStart(2,'0')}:${String(m).padStart(2,'0')} ${ap}`
}

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

function ScoreBar({ score, max = 190 }) {
  const pct = Math.min(100, Math.round((score / max) * 100))
  const color = pct > 66 ? 'bg-emerald-400' : pct > 33 ? 'bg-amber-400' : 'bg-slate-300'
  return (
    <div className="flex items-center gap-1.5 mt-1.5">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] font-medium text-slate-400 w-5 text-right">{score}</span>
    </div>
  )
}

function GanttTimeline({ assignments }) {
  if (!assignments.length) return null
  const allDates = assignments.flatMap(a => [a.start_date, a.end_date]).sort()
  const minDate = new Date(allDates[0])
  const maxDate = new Date(allDates[allDates.length - 1])
  const totalDays = Math.max(daysBetween(minDate, maxDate), 14)
  const weeks = []
  const cur = new Date(minDate)
  cur.setDate(cur.getDate() - cur.getDay())
  while (cur <= maxDate) { weeks.push(new Date(cur)); cur.setDate(cur.getDate() + 7) }
  const leftPct = (date) => ((new Date(date) - minDate) / (totalDays * 86400000)) * 100
  const widthPct = (s, e) => Math.max(1, ((new Date(e) - new Date(s)) / (totalDays * 86400000)) * 100)
  const grouped = {}
  assignments.forEach(a => {
    if (!grouped[a.project_id]) grouped[a.project_id] = { ...a, rows: [] }
    grouped[a.project_id].rows.push(a)
  })
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-700">Assignment Timeline</h3>
        <span className="text-xs text-slate-400">{assignments.length} assignments</span>
      </div>
      <div className="overflow-x-auto">
        <div style={{ minWidth: 700 }}>
          <div className="flex border-b border-slate-100 bg-slate-50">
            <div className="w-48 flex-shrink-0 px-4 py-2 text-xs font-semibold text-slate-500 border-r border-slate-100">Employee / Project</div>
            <div className="flex-1 relative h-8">
              {weeks.map((w, i) => (
                <div key={i} className="absolute top-0 h-full flex items-center" style={{ left: `${leftPct(w)}%` }}>
                  <span className="text-[10px] text-slate-400 pl-1.5 font-medium whitespace-nowrap">{w.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}</span>
                  <div className="absolute left-0 top-0 h-full w-px bg-slate-200" />
                </div>
              ))}
            </div>
          </div>
          {Object.values(grouped).map(group => (
            <div key={group.project_id}>
              <div className="flex border-b border-slate-50 bg-slate-50/60">
                <div className="w-48 flex-shrink-0 px-4 py-1.5 flex items-center gap-2 border-r border-slate-100">
                  <div className="w-4 h-4 bg-indigo-500 rounded flex items-center justify-center"><Briefcase className="w-2.5 h-2.5 text-white" /></div>
                  <span className="text-xs font-bold text-slate-600 truncate">{group.project_code}</span>
                </div>
                <div className="flex-1" />
              </div>
              {group.rows.map(a => {
                const c = trade(a.trade_code)
                return (
                  <div key={a.id} className="flex border-b border-slate-50 hover:bg-slate-50/40 transition-colors">
                    <div className="w-48 flex-shrink-0 px-4 py-2 flex items-center gap-2 border-r border-slate-100">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 text-white" style={{ background: c.dot }}>{(a.employee_name || '?')[0]}</div>
                      <div className="min-w-0"><div className="text-xs font-medium text-slate-700 truncate">{a.employee_name}</div><TradePill code={a.trade_code} /></div>
                    </div>
                    <div className="flex-1 relative py-2 pr-2">
                      <div className={`absolute top-2 bottom-2 rounded-md ${c.bg} opacity-80 flex items-center px-2 overflow-hidden`}
                        style={{ left: `${leftPct(a.start_date)}%`, width: `${widthPct(a.start_date, a.end_date)}%`, minWidth: 4 }}>
                        <span className="text-[10px] text-white font-semibold truncate whitespace-nowrap">{fmtTime(a.shift_start)} – {fmtTime(a.shift_end)}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function MapTab({ selectedProj, form, onAssign, onModify, assigning, modifying, assignments, successMsg }) {
  const mapRef = useRef(null)
  const mapboxRef = useRef(null)
  const markersRef = useRef([])
  const [empMap, setEmpMap] = useState([])
  const [loading, setLoading] = useState(false)
  const [token, setToken] = useState(null)
  const [hoveredEmp, setHoveredEmp] = useState(null)

  useEffect(() => { api.get('/config').then(r => setToken(r.data.mapbox_token)).catch(() => {}) }, [])

  const loadMap = useCallback(async () => {
    if (!selectedProj) return
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (form.start_date) params.set('start', form.start_date)
      if (form.end_date) params.set('end', form.end_date)
      const r = await api.get(`/assignments/employees-map?${params}`)
      setEmpMap(r.data.employees || [])
    } catch { setEmpMap([]) } finally { setLoading(false) }
  }, [selectedProj, form.start_date, form.end_date])

  useEffect(() => { loadMap() }, [loadMap])

  useEffect(() => {
    if (!token || !mapRef.current || mapboxRef.current) return
    const script = document.createElement('script')
    script.src = 'https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.js'
    script.onload = () => {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = 'https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.css'
      document.head.appendChild(link)
      window.mapboxgl.accessToken = token
      const map = new window.mapboxgl.Map({ container: mapRef.current, style: 'mapbox://styles/mapbox/light-v11', center: [-73.5674, 45.5019], zoom: 10 })
      map.addControl(new window.mapboxgl.NavigationControl(), 'top-right')
      mapboxRef.current = map
    }
    document.head.appendChild(script)
  }, [token])

  useEffect(() => {
    const map = mapboxRef.current
    if (!map || !window.mapboxgl) return
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []
    if (selectedProj?.site_lat && selectedProj?.site_lng) {
      const el = document.createElement('div')
      el.innerHTML = `<div style="background:#4f46e5;color:white;border-radius:12px;padding:4px 10px;font-size:11px;font-weight:700;box-shadow:0 4px 12px rgba(79,70,229,0.4);white-space:nowrap;border:2px solid white;">📍 ${selectedProj.project_code}</div>`
      const m = new window.mapboxgl.Marker({ element: el }).setLngLat([selectedProj.site_lng, selectedProj.site_lat]).addTo(map)
      markersRef.current.push(m)
      map.flyTo({ center: [selectedProj.site_lng, selectedProj.site_lat], zoom: 11 })
    }
    empMap.forEach(emp => {
      if (!emp.home_lat || !emp.home_lng) return
      const c = trade(emp.trade_code)
      const color = emp.is_available ? c.dot : '#94a3b8'
      const el = document.createElement('div')
      el.innerHTML = `<div style="display:inline-flex;align-items:center;gap:5px;background:${color};color:white;border-radius:20px;padding:4px 10px 4px 6px;border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.25);white-space:nowrap;font-family:system-ui;font-size:11px;font-weight:700;opacity:${emp.is_available ? 1 : 0.6};"><span style="width:18px;height:18px;border-radius:50%;background:rgba(255,255,255,0.25);display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;">${(emp.full_name || '?')[0].toUpperCase()}</span> ${emp.full_name}</div>`
      if (emp.is_available) {
        el.firstChild.style.cursor = 'pointer'
        el.firstChild.onmouseenter = () => { el.firstChild.style.transform = 'scale(1.05)'; setHoveredEmp(emp) }
        el.firstChild.onmouseleave = () => { el.firstChild.style.transform = 'scale(1)'; setHoveredEmp(null) }
        el.firstChild.onclick = () => onAssign(emp.id)
      }
      const popup = new window.mapboxgl.Popup({ offset: 20, closeButton: false })
        .setHTML(`<div style="font-family:system-ui;padding:4px"><div style="font-weight:700;font-size:13px">${emp.full_name}</div><div style="color:#64748b;font-size:11px">${emp.trade_code || ''} · ${emp.rank_code || ''}</div><div style="margin-top:4px;font-size:11px;color:${emp.is_available ? '#10b981' : '#ef4444'};font-weight:600">${emp.is_available ? '✓ Available' : '✗ Busy this period'}</div></div>`)
      const m = new window.mapboxgl.Marker({ element: el, anchor: 'left' }).setLngLat([emp.home_lng, emp.home_lat]).setPopup(popup).addTo(map)
      markersRef.current.push(m)
    })
  }, [empMap, selectedProj, onAssign])

  if (!token) return (
    <div className="flex-1 flex items-center justify-center bg-slate-100 rounded-xl">
      <div className="text-center"><MapIcon className="w-10 h-10 text-slate-300 mx-auto mb-2" /><p className="text-sm text-slate-400">Mapbox token not configured</p></div>
    </div>
  )

  return (
    <div className="flex-1 flex gap-4 min-h-0">
      <div className="flex-1 relative rounded-xl overflow-hidden border border-slate-200">
        <div ref={mapRef} className="w-full h-full" />
        {loading && (
          <div className="absolute top-3 left-3 bg-white rounded-lg px-3 py-2 shadow-md flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500" /><span className="text-xs text-slate-600">Loading...</span>
          </div>
        )}
        {!selectedProj && (
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center rounded-xl">
            <div className="bg-white rounded-2xl px-8 py-6 text-center shadow-xl">
              <MapPin className="w-8 h-8 text-indigo-400 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700">Select a project to view the map</p>
            </div>
          </div>
        )}
        <div className="absolute bottom-4 left-4 bg-white rounded-xl shadow-lg px-4 py-3 space-y-1.5 border border-slate-100">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">Legend</div>
          <div className="flex items-center gap-2 text-xs text-slate-600"><div className="w-4 h-4 rounded bg-indigo-600 border-2 border-white shadow" />Project site</div>
          <div className="flex items-center gap-2 text-xs text-slate-600"><div className="w-4 h-4 rounded-full bg-emerald-500 border-2 border-white shadow" />Available · Click to assign</div>
          <div className="flex items-center gap-2 text-xs text-slate-400"><div className="w-4 h-4 rounded-full bg-slate-400 border-2 border-white shadow" />Busy this period</div>
        </div>
        {hoveredEmp && (
          <div className="absolute top-4 left-4 bg-white rounded-xl shadow-xl px-4 py-3 border border-slate-100 pointer-events-none">
            <div className="font-bold text-sm text-slate-800">{hoveredEmp.full_name}</div>
            <TradePill code={hoveredEmp.trade_code} />
            <div className="text-xs text-emerald-600 font-semibold mt-1">Click to assign</div>
          </div>
        )}
        {successMsg && (
          <div className="absolute top-4 right-4 bg-emerald-500 text-white rounded-xl px-4 py-2.5 shadow-lg flex items-center gap-2">
            <Check className="w-4 h-4" /> {successMsg}
          </div>
        )}
      </div>
      <div className="w-56 flex-shrink-0 bg-white rounded-xl border border-slate-200 flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-widest">Available to Assign</div>
          <div className="text-xs text-slate-400 mt-0.5">{empMap.filter(e => e.is_available).length} of {empMap.length}</div>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
          {empMap.filter(e => e.is_available).map(emp => {
            const c = trade(emp.trade_code)
            return (
              <div key={emp.id} className="px-3 py-2.5 hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 text-white" style={{ background: c.dot }}>{(emp.full_name || '?')[0]}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-slate-700 truncate">{emp.full_name}</div>
                    <TradePill code={emp.trade_code} />
                  </div>
                  {assigning === emp.id
                    ? <button disabled className="flex-shrink-0 px-2.5 py-1 bg-indigo-600 text-white rounded-lg opacity-50 text-xs font-semibold"><Loader2 className="w-3 h-3 animate-spin" /></button>
                    : <button onClick={() => onAssign(emp.id)}
                        className="flex-shrink-0 px-2.5 py-1 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-xs font-semibold whitespace-nowrap">
                        Assign
                      </button>
                  }
                </div>
              </div>
            )
          })}
          {empMap.filter(e => e.is_available).length === 0 && !loading && selectedProj && (
            <div className="px-4 py-6 text-center text-xs text-slate-400">No available employees for this period</div>
          )}
          {assignments.filter(a => a.project_id === selectedProj?.id).length > 0 && (
            <>
              <div className="px-3 py-2 bg-slate-50 border-t border-slate-200">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Assigned</div>
              </div>
              {assignments.filter(a => a.project_id === selectedProj?.id).map(a => {
                const c = trade(a.trade_code)
                return (
                  <div key={a.id} className="px-3 py-2.5 hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 text-white" style={{ background: c.dot }}>{(a.employee_name || '?')[0]}</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-slate-700 truncate">{a.employee_name}</div>
                        <TradePill code={a.trade_code} />
                      </div>
                      <button onClick={() => onModify(a)} disabled={modifying === a.id}
                        className="flex-shrink-0 flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-indigo-500 hover:bg-indigo-50 rounded-lg transition-colors border border-indigo-200 whitespace-nowrap">
                        {modifying === a.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <><ArrowLeftRight className="w-3 h-3" />Modify</>}
                      </button>
                    </div>
                  </div>
                )
              })}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function ListTab({ projects, assignments, loadingAsgn, onCancel, onModify, cancelling, modifying, successMsg }) {
  const today = todayStr()
  const thisWeek = new Date(); thisWeek.setDate(thisWeek.getDate() + 7)
  const thisWeekStr = thisWeek.toISOString().split('T')[0]

  // Filters
  const [filterProject, setFilterProject] = useState('')
  const [filterEmployee, setFilterEmployee] = useState('')
  const [filterDate, setFilterDate] = useState('')

  // Collapsed project groups
  const [collapsed, setCollapsed] = useState({})
  const toggleCollapse = (k) => setCollapsed(p => ({ ...p, [k]: !p[k] }))

  // Stats
  const activeToday   = assignments.filter(a => a.start_date <= today && a.end_date >= today).length
  const activeWeek    = assignments.filter(a => a.start_date <= thisWeekStr && a.end_date >= today).length
  const projectsCount = new Set(assignments.map(a => a.project_id)).size

  // Filtered assignments
  const filtered = assignments.filter(a => {
    if (filterProject  && !String(a.project_code).toLowerCase().includes(filterProject.toLowerCase())
                       && !String(a.project_name || '').toLowerCase().includes(filterProject.toLowerCase())) return false
    if (filterEmployee && !String(a.employee_name).toLowerCase().includes(filterEmployee.toLowerCase())) return false
    if (filterDate     && !(a.start_date <= filterDate && a.end_date >= filterDate)) return false
    return true
  })

  // Group by project
  const grouped = filtered.reduce((acc, a) => {
    const k = String(a.project_id)
    if (!acc[k]) acc[k] = { project_id: a.project_id, project_code: a.project_code, project_name: a.project_name, site_address: a.site_address, employees: [] }
    acc[k].employees.push(a)
    return acc
  }, {})

  const groupList = Object.values(grouped).sort((a, b) => a.project_code.localeCompare(b.project_code))

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0 bg-slate-50">

      {/* Stats bar */}
      <div className="flex-shrink-0 px-5 pt-4 pb-3 flex items-center gap-3">
        {[
          { label: 'Total Active',     value: assignments.length, color: 'text-indigo-600',  bg: 'bg-indigo-50  border-indigo-200' },
          { label: 'On Site Today',    value: activeToday,        color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200' },
          { label: 'Active This Week', value: activeWeek,         color: 'text-violet-600',  bg: 'bg-violet-50  border-violet-200' },
          { label: 'Projects',         value: projectsCount,      color: 'text-amber-600',   bg: 'bg-amber-50   border-amber-200' },
        ].map(s => (
          <div key={s.label} className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border ${s.bg}`}>
            <div className={`text-xl font-black ${s.color}`}>{s.value}</div>
            <div className="text-[10px] font-semibold text-slate-500 leading-tight">{s.label}</div>
          </div>
        ))}
        {successMsg && (
          <div className="ml-auto flex items-center gap-1.5 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 font-semibold">
            <Check className="w-3.5 h-3.5" />{successMsg}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex-shrink-0 px-5 pb-3 flex items-center gap-2">
        <div className="relative flex-1 max-w-[200px]">
          <Briefcase className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          <input value={filterProject} onChange={e => setFilterProject(e.target.value)} placeholder="Filter by project..."
            className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-xl text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder:text-slate-400" />
        </div>
        <div className="relative flex-1 max-w-[200px]">
          <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          <input value={filterEmployee} onChange={e => setFilterEmployee(e.target.value)} placeholder="Filter by employee..."
            className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-xl text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder:text-slate-400" />
        </div>
        <div className="relative">
          <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}
            className="pl-8 pr-3 py-2 border border-slate-200 rounded-xl text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400" />
        </div>
        {(filterProject || filterEmployee || filterDate) && (
          <button onClick={() => { setFilterProject(''); setFilterEmployee(''); setFilterDate('') }}
            className="flex items-center gap-1 px-3 py-2 text-xs text-slate-500 hover:text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
            <X className="w-3 h-3" />Clear
          </button>
        )}
        <div className="ml-auto text-[11px] text-slate-400 font-medium">
          {filtered.length} assignment{filtered.length !== 1 ? 's' : ''}
          {(filterProject || filterEmployee || filterDate) ? ` of ${assignments.length}` : ''}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-3">
        {loadingAsgn
          ? <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>
          : groupList.length === 0
            ? <div className="flex flex-col items-center justify-center py-16 text-center">
                <Briefcase className="w-10 h-10 text-slate-200 mb-3" />
                <p className="text-sm font-semibold text-slate-400">No assignments found</p>
                <p className="text-xs text-slate-300 mt-1">
                  {(filterProject || filterEmployee || filterDate) ? 'Try adjusting the filters' : 'Use Map View to assign employees'}
                </p>
              </div>
            : groupList.map(group => {
                const isOpen = !collapsed[group.project_id]
                const onSiteNow = group.employees.filter(a => a.start_date <= today && a.end_date >= today).length
                return (
                  <div key={group.project_id} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                    {/* Project header */}
                    <button onClick={() => toggleCollapse(group.project_id)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left">
                      <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Briefcase className="w-3.5 h-3.5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-slate-800">{group.project_code}</span>
                          {group.project_name && <span className="text-xs text-slate-400 truncate">{group.project_name}</span>}
                        </div>
                        {group.site_address && (
                          <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                            <MapPin className="w-2.5 h-2.5 flex-shrink-0" />{group.site_address}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-[10px] font-semibold px-2 py-1 bg-indigo-50 text-indigo-600 rounded-lg">{group.employees.length} assigned</span>
                        {onSiteNow > 0 && <span className="text-[10px] font-semibold px-2 py-1 bg-emerald-50 text-emerald-600 rounded-lg">{onSiteNow} on site</span>}
                        <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                      </div>
                    </button>

                    {/* Employees table */}
                    {isOpen && (
                      <>
                        <div className="border-t border-slate-100 grid grid-cols-[1fr_120px_160px_auto] text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 py-2 bg-slate-50">
                          <span>Employee</span>
                          <span>Trade</span>
                          <span>Period</span>
                          <span>Actions</span>
                        </div>
                        {group.employees.map(a => {
                          const isToday = a.start_date <= today && a.end_date >= today
                          const c = trade(a.trade_code)
                          return (
                            <div key={a.id} className="grid grid-cols-[1fr_120px_160px_auto] items-center px-4 py-2.5 border-t border-slate-50 hover:bg-slate-50/70 transition-colors">
                              {/* Employee */}
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white" style={{ background: c.dot }}>
                                  {(a.employee_name || '?')[0]}
                                </div>
                                <div className="min-w-0">
                                  <div className="text-sm font-semibold text-slate-700 truncate">{a.employee_name}</div>
                                  {a.shift_start && <div className="text-[10px] text-slate-400">{fmtTime(a.shift_start)} – {fmtTime(a.shift_end)}</div>}
                                </div>
                              </div>
                              {/* Trade */}
                              <div><TradePill code={a.trade_code} /></div>
                              {/* Period */}
                              <div className="flex items-center gap-1.5">
                                <div className="text-xs text-slate-600 font-medium">{fmt(a.start_date)} → {fmt(a.end_date)}</div>
                                {isToday && <span className="text-[9px] font-bold px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded-full">TODAY</span>}
                              </div>
                              {/* Actions */}
                              <div className="flex items-center gap-1.5">
                                <button onClick={() => onModify(a)} disabled={modifying === a.id}
                                  className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-indigo-500 hover:bg-indigo-50 rounded-lg transition-colors border border-indigo-200 whitespace-nowrap disabled:opacity-50">
                                  {modifying === a.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <><ArrowLeftRight className="w-3 h-3" />Modify</>}
                                </button>
                                <button onClick={() => onCancel(a.id)} disabled={cancelling === a.id}
                                  className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-red-400 hover:bg-red-50 rounded-lg transition-colors border border-red-200 whitespace-nowrap disabled:opacity-50">
                                  {cancelling === a.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <><X className="w-3 h-3" />Cancel</>}
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </>
                    )}
                  </div>
                )
              })
        }
      </div>
    </div>
  )
}

export default function AssignmentsPage() {
  const [tab, setTab] = useState('list')
  const [projects, setProjects] = useState([])
  const [assignments, setAssignments] = useState([])
  const [loadingProj, setLoadingProj] = useState(true)
  const [loadingAsgn, setLoadingAsgn] = useState(true)
  const [assigning, setAssigning] = useState(null)
  const [cancelling, setCancelling] = useState(null)
  const [successMsg, setSuccessMsg] = useState('')
  const [mapProj, setMapProj] = useState(null)
  const [mapForm,        setMapForm]        = useState({ start_date: todayStr(), end_date: todayStr() })
  const [reassignModal,  setReassignModal]  = useState(null)
  const [loadingReassign,setLoadingReassign]= useState(false)
  const [modifying,    setModifying]    = useState(null)

  useEffect(() => {
    api.get('/projects?status=ACTIVE')
      .then(r => setProjects(r.data.projects || r.data.rows || []))
      .catch(() => setProjects([]))
      .finally(() => setLoadingProj(false))
  }, [])

  const fetchAssignments = useCallback(() => {
    setLoadingAsgn(true)
    api.get('/assignments')
      .then(r => setAssignments(r.data.assignments || []))
      .catch(() => setAssignments([]))
      .finally(() => setLoadingAsgn(false))
  }, [])

  useEffect(() => { fetchAssignments() }, [fetchAssignments])

  const handleAssign = async (empId, projectId, form) => {
    setAssigning(empId); setSuccessMsg('')
    try {
      await api.post('/assignments/requests', { project_id: projectId, employee_id: empId, ...form })
      fetchAssignments()
      setSuccessMsg('Assigned successfully!')
      setTimeout(() => setSuccessMsg(''), 4000)
      return true
    } catch (e) { alert(e.response?.data?.message || e.message); return false }
    finally { setAssigning(null) }
  }

  const handleCancel = async (id) => {
    if (!window.confirm('Cancel this assignment?')) return
    setCancelling(id)
    try { await api.patch(`/assignments/requests/${id}/cancel`); fetchAssignments() }
    catch (e) { alert(e.response?.data?.message || e.message) }
    finally { setCancelling(null) }
  }

  const handleReassign = async (assignment) => {
    setLoadingReassign(true)
    try {
      const r = await api.get(`/assignments/suggest/${assignment.project_id}?start_date=${assignment.start_date}&end_date=${assignment.end_date}`)
      // Get IDs of all employees currently assigned to this project (exclude them from suggestions)
      // Note: GET /assignments returns employee_id (from ep.employee_id), not requested_for_employee_id
      const assignedToProject = new Set(
        assignments
          .filter(a => a.project_id === assignment.project_id)
          .map(a => a.employee_id)
      )
      const suggestions = (r.data.suggestions || []).filter(s => !assignedToProject.has(s.id))
      setReassignModal({ assignment, suggestions })
    } catch (e) { alert(e.response?.data?.message || e.message) }
    finally { setLoadingReassign(false) }
  }

  const handleModifyConfirm = async (newEmpId) => {
    const { assignment } = reassignModal
    setModifying(newEmpId)
    try {
      // Atomic reassign — cancel old + create new in one DB transaction
      await api.patch(`/assignments/requests/${assignment.id}/reassign`, { new_employee_id: newEmpId })
      fetchAssignments()
      setReassignModal(null)
      setSuccessMsg('Modified successfully!')
      setTimeout(() => setSuccessMsg(''), 4000)
    } catch (e) { alert(e.response?.data?.message || e.message) }
    finally { setModifying(null) }
  }

  const assignedToday = assignments.filter(a => { const t = todayStr(); return a.start_date <= t && a.end_date >= t }).length

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-900">Assignments</h1>
            <p className="text-xs text-slate-400 mt-0.5">Manage workforce assignments across all projects</p>
          </div>
          <div className="flex items-center gap-3">
            {[
              { icon: Briefcase,  label: 'Active Projects', value: projects.length,   color: 'text-indigo-500' },
              { icon: Users,      label: 'Assigned Today',  value: assignedToday,      color: 'text-emerald-500' },
              { icon: TrendingUp, label: 'Total Active',    value: assignments.length, color: 'text-violet-500' },
            ].map(({ icon: Icon, label, value, color }) => (
              <div key={label} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2">
                <Icon className={`w-4 h-4 ${color}`} />
                <div><div className="text-[10px] text-slate-500">{label}</div><div className="text-sm font-bold text-slate-800">{value}</div></div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1 mt-4">
          {[
            { id: 'list',     icon: List,     label: 'List View' },
            { id: 'map',      icon: MapIcon,  label: 'Map View' },
            { id: 'timeline', icon: Calendar, label: 'Timeline' },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${tab === t.id ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`}>
              <t.icon className="w-3.5 h-3.5" />{t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden p-4 gap-4 min-h-0">
        {tab === 'list' && (
          <div className="flex-1 flex rounded-xl border border-slate-200 overflow-hidden bg-white min-h-0">
            <ListTab assignments={assignments} loadingAsgn={loadingAsgn}
              onCancel={handleCancel} onModify={handleReassign} cancelling={cancelling} modifying={modifying} successMsg={successMsg} />
          </div>
        )}

        {tab === 'map' && (
          <div className="flex-1 flex gap-4 min-h-0">
            <div className="w-52 flex-shrink-0 bg-white rounded-xl border border-slate-200 flex flex-col overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Select Project</p>
              </div>
              <div className="flex-1 overflow-y-auto">
                {projects.map(p => (
                  <button key={p.id} onClick={() => setMapProj(p)}
                    className={`w-full text-left px-4 py-3 border-b border-slate-50 transition-all ${mapProj?.id === p.id ? 'bg-indigo-50 border-l-[3px] border-l-indigo-500' : 'hover:bg-slate-50 border-l-[3px] border-l-transparent'}`}>
                    <div className="text-[10px] font-bold text-slate-400">{p.project_code}</div>
                    <div className="text-xs font-semibold text-slate-800 truncate">{p.project_name || p.name}</div>
                  </button>
                ))}
              </div>
              <div className="px-4 py-3 border-t border-slate-100 space-y-2">
                {[['Start','start_date'],['End','end_date']].map(([label, key]) => (
                  <div key={key}>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">{label}</label>
                    <input type="date" value={mapForm[key]} onChange={e => setMapForm(f => ({ ...f, [key]: e.target.value }))}
                      className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                  </div>
                ))}
              </div>
            </div>
            <MapTab selectedProj={mapProj} form={{ ...mapForm, shift_start: '06:00', shift_end: '14:30', notes: '' }}
              onAssign={(empId) => mapProj && handleAssign(empId, mapProj.id, { ...mapForm, shift_start: '06:00', shift_end: '14:30', notes: '' })}
              onModify={handleReassign} assigning={assigning} modifying={modifying}
              assignments={assignments} successMsg={successMsg} />
          </div>
        )}

        {tab === 'timeline' && (
          <div className="flex-1 overflow-y-auto">
            {loadingAsgn
              ? <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>
              : assignments.length === 0
                ? <div className="flex flex-col items-center justify-center py-20 text-center"><Calendar className="w-10 h-10 text-slate-200 mb-3" /><p className="text-sm text-slate-400">No assignments to display in timeline</p></div>
                : <GanttTimeline assignments={assignments} />
            }
          </div>
        )}
      </div>
      {/* Modify Modal */}
      {reassignModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Modify Assignment</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Replacing <span className="font-semibold text-slate-600">{reassignModal.assignment.employee_name}</span> on <span className="font-semibold text-indigo-600">{reassignModal.assignment.project_code}</span>
                </p>
              </div>
              <button onClick={() => setReassignModal(null)} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto divide-y divide-slate-50">
              {loadingReassign
                ? <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-300" /></div>
                : reassignModal.suggestions.length === 0
                  ? <div className="py-8 text-center text-xs text-slate-400">No available employees for this period</div>
                  : reassignModal.suggestions.filter(s => s.is_available && s.id !== reassignModal.assignment.employee_id).map(emp => {
                      const c = trade(emp.trade_code)
                      return (
                        <div key={emp.id} className="px-4 py-3 flex items-center gap-3 hover:bg-slate-50 transition-colors">
                          <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white" style={{ background: c.dot }}>
                            {(emp.full_name || '?')[0]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-slate-800 truncate">{emp.full_name}</div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <TradePill code={emp.trade_code} />
                              {emp.distance_km != null && <span className="text-[10px] text-slate-400">{emp.distance_km} km</span>}
                              <span className="text-[10px] font-semibold text-slate-400">Score: {emp.score}</span>
                            </div>
                          </div>
                          <button onClick={() => handleModifyConfirm(emp.id)} disabled={modifying === emp.id}
                            className="flex-shrink-0 px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-60 whitespace-nowrap flex items-center gap-1">
                            {modifying === emp.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <><ArrowLeftRight className="w-3 h-3" />Select</>}
                          </button>
                        </div>
                      )
                    })
              }
            </div>
            <div className="px-6 py-3 border-t border-slate-100 flex justify-end">
              <button onClick={() => setReassignModal(null)} className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
