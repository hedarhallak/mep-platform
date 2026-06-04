import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import api from '@/lib/api'
import WorkerPicker from '@/components/shared/WorkerPicker'
import { usePermissions } from '@/hooks/usePermissions.jsx'
import { todayStr, tomorrowStr, fmtTime } from '@/utils/formatters'
import { trade } from '@/constants/trades'
import {
  Briefcase, MapPin, User, Check, X, Loader2,
  ChevronRight, AlertCircle, Plus, Calendar, List,
  Map as MapIcon, Search, ArrowLeftRight, Sparkles
} from 'lucide-react'

function fmt(d, locale = 'en-CA', opts = { month: 'short', day: 'numeric' }) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString(locale, opts)
}

const SHIFTS = ['05:00','06:00','07:00','08:00','09:00','12:00',
                '14:00','14:30','15:00','16:00','18:00','20:00','22:00']

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


function MapTab({ selectedProj, form, onAssign, onModify, assigning, modifying, assignments, successMsg }) {
  const { t } = useTranslation()
  const mapRef = useRef(null)
  const mapboxRef = useRef(null)
  const markersRef = useRef([])
  const [empMap, setEmpMap] = useState([])
  const [loading, setLoading] = useState(false)
  const [token, setToken] = useState(null)
  const [hoveredEmp, setHoveredEmp] = useState(null)

  useEffect(() => { api.get('/config').then(r => setToken(r.data.mapbox_token)).catch(e => console.error('Failed to load config:', e)) }, [])

  const loadMap = useCallback(async () => {
    if (!selectedProj) return
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (form.start_date) params.set('start', form.start_date)
      if (form.end_date) params.set('end', form.end_date)
      const r = await api.get(`/assignments/employees-map?${params}`)
      setEmpMap(r.data.employees || [])
    } catch (e) { console.error('Failed to load employee map:', e); setEmpMap([]) } finally { setLoading(false) }
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
      el.innerHTML = `<div style="background:#162d4a;color:white;border-radius:12px;padding:4px 10px;font-size:11px;font-weight:700;box-shadow:0 4px 12px rgba(79,70,229,0.4);white-space:nowrap;border:2px solid white;">📍 ${selectedProj.project_code}</div>`
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
      const popupAvail = t('assignments.map.popupAvailable')
      const popupBusy  = t('assignments.map.popupBusy')
      const popup = new window.mapboxgl.Popup({ offset: 20, closeButton: false })
        .setHTML(`<div style="font-family:system-ui;padding:4px"><div style="font-weight:700;font-size:13px">${emp.full_name}</div><div style="color:#64748b;font-size:11px">${emp.trade_code || ''} · ${emp.rank_code || ''}</div><div style="margin-top:4px;font-size:11px;color:${emp.is_available ? '#10b981' : '#ef4444'};font-weight:600">${emp.is_available ? popupAvail : popupBusy}</div></div>`)
      const m = new window.mapboxgl.Marker({ element: el, anchor: 'left' }).setLngLat([emp.home_lng, emp.home_lat]).setPopup(popup).addTo(map)
      markersRef.current.push(m)
    })
  }, [empMap, selectedProj, onAssign, t])

  if (!token) return (
    <div className="flex-1 flex items-center justify-center bg-slate-100 rounded-xl">
      <div className="text-center"><MapIcon className="w-10 h-10 text-slate-300 mx-auto mb-2" /><p className="text-sm text-slate-400">{t('assignments.map.tokenMissing')}</p></div>
    </div>
  )

  const availableCount = empMap.filter(e => e.is_available).length

  return (
    <div className="flex-1 flex gap-4 min-h-0">
      <div className="flex-1 relative rounded-xl overflow-hidden border border-slate-200">
        <div ref={mapRef} className="w-full h-full" />
        {loading && (
          <div className="absolute top-3 left-3 bg-white rounded-lg px-3 py-2 shadow-md flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-primary-light" /><span className="text-xs text-slate-600">{t('assignments.map.loading')}</span>
          </div>
        )}
        {!selectedProj && (
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center rounded-xl">
            <div className="bg-white rounded-2xl px-8 py-6 text-center shadow-xl">
              <MapPin className="w-8 h-8 text-primary-light mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700">{t('assignments.map.selectProjectHint')}</p>
            </div>
          </div>
        )}
        <div className="absolute bottom-4 left-4 bg-white rounded-xl shadow-lg px-4 py-3 space-y-1.5 border border-slate-100">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">{t('assignments.map.legend')}</div>
          <div className="flex items-center gap-2 text-xs text-slate-600"><div className="w-4 h-4 rounded bg-primary border-2 border-white shadow" />{t('assignments.map.legendProjectSite')}</div>
          <div className="flex items-center gap-2 text-xs text-slate-600"><div className="w-4 h-4 rounded-full bg-emerald-500 border-2 border-white shadow" />{t('assignments.map.legendAvailable')}</div>
          <div className="flex items-center gap-2 text-xs text-slate-400"><div className="w-4 h-4 rounded-full bg-slate-400 border-2 border-white shadow" />{t('assignments.map.legendBusy')}</div>
        </div>
        {hoveredEmp && (
          <div className="absolute top-4 left-4 bg-white rounded-xl shadow-xl px-4 py-3 border border-slate-100 pointer-events-none">
            <div className="font-bold text-sm text-slate-800">{hoveredEmp.full_name}</div>
            <TradePill code={hoveredEmp.trade_code} />
            <div className="text-xs text-emerald-600 font-semibold mt-1">{t('assignments.map.hoverHint')}</div>
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
          <div className="text-xs font-bold text-slate-500 uppercase tracking-widest">{t('assignments.map.sidebarHeader')}</div>
          <div className="text-xs text-slate-400 mt-0.5">{t('assignments.map.countOfTotal', { available: availableCount, total: empMap.length })}</div>
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
                    ? <button disabled className="flex-shrink-0 px-2.5 py-1 bg-primary text-white rounded-lg opacity-50 text-xs font-semibold"><Loader2 className="w-3 h-3 animate-spin" /></button>
                    : <button onClick={() => onAssign(emp.id)}
                        className="flex-shrink-0 px-2.5 py-1 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors text-xs font-semibold whitespace-nowrap">
                        {t('assignments.map.assign')}
                      </button>
                  }
                </div>
              </div>
            )
          })}
          {empMap.filter(e => e.is_available).length === 0 && !loading && selectedProj && (
            <div className="px-4 py-6 text-center text-xs text-slate-400">{t('assignments.map.noAvailable')}</div>
          )}
          {assignments.filter(a => a.project_id === selectedProj?.id).length > 0 && (
            <>
              <div className="px-3 py-2 bg-slate-50 border-t border-slate-200">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t('assignments.map.assignedSection')}</div>
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
                        className="flex-shrink-0 flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-primary-light hover:bg-primary-pale rounded-lg transition-colors border border-primary-pale whitespace-nowrap">
                        {modifying === a.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <><ArrowLeftRight className="w-3 h-3" />{t('assignments.map.modify')}</>}
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


// Role keys at module scope; labels resolved at render time via t().
const ROLE_KEYS = ['WORKER', 'FOREMAN', 'JOURNEYMAN']
const ROLE_COLORS = {
  WORKER:     'bg-slate-100 text-slate-700',
  FOREMAN:    'bg-primary-pale text-primary-dark',
  JOURNEYMAN: 'bg-amber-100 text-amber-700',
}

function RoleBadge({ role }) {
  const { t } = useTranslation()
  const color = ROLE_COLORS[role] || ROLE_COLORS.WORKER
  const label = t(`assignments.role.${role || 'WORKER'}`)
  return <span className={`inline-flex text-[10px] font-bold px-2 py-0.5 rounded-full ${color}`}>{label}</span>
}

function NewAssignmentModal({ projects, onClose, onSaved }) {
  const { t } = useTranslation()
  const [employees, setEmployees] = useState([])
  const [loadingEmp, setLoadingEmp] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    project_id:      '',
    employee_id:     '',
    start_date:      tomorrowStr(),
    end_date:        tomorrowStr(),
    shift_start:     '06:00',
    shift_end:       '14:30',
    assignment_role: 'WORKER',
    notes:           '',
  })
  const set = (k, v) => setForm(f => {
    const updated = { ...f, [k]: v }
    // Rule 1: end_date auto-follows start_date if it was equal or behind
    if (k === 'start_date' && updated.end_date < v) updated.end_date = v
    // Rule 2: start_date cannot go after end_date
    if (k === 'end_date' && v < updated.start_date) return f
    return updated
  })

  useEffect(() => {
    api.get('/assignments/employees')
      .then(r => setEmployees(r.data.employees || []))
      .catch(e => { console.error('Failed to load employees:', e); setEmployees([]) })
      .finally(() => setLoadingEmp(false))
  }, [])



  const handleSave = async () => {
    setError('')
    if (!form.project_id)  return setError(t('assignments.newModal.errors.selectProject'))
    if (!form.employee_id) return setError(t('assignments.newModal.errors.selectEmployee'))
    if (!form.start_date)  return setError(t('assignments.newModal.errors.startDate'))
    if (!form.end_date)    return setError(t('assignments.newModal.errors.endDate'))
    setSaving(true)
    try {
      await api.post('/assignments/requests', {
        project_id:      Number(form.project_id),
        employee_id:     Number(form.employee_id),
        start_date:      form.start_date,
        end_date:        form.end_date,
        shift_start:     form.shift_start,
        shift_end:       form.shift_end,
        assignment_role: form.assignment_role,
        notes:           form.notes || undefined,
      })
      onSaved()
    } catch (e) { setError(e.response?.data?.message || e.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">

        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Plus className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold text-slate-800">{t('assignments.newModal.title')}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4 max-h-[70vh] overflow-y-auto">

          {/* Project */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">{t('assignments.newModal.project')}</label>
            <select value={form.project_id} onChange={e => set('project_id', e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-light">
              <option value="">{t('assignments.newModal.selectProject')}</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.project_code}{p.project_name ? ` — ${p.project_name}` : ''}</option>
              ))}
            </select>
          </div>

          {/* Employee */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">{t('assignments.newModal.employee')}</label>
            {loadingEmp
              ? <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-slate-300" /></div>
              : <WorkerPicker
                  mode="single"
                  workers={employees.map(e => ({
                    id: e.id,
                    first_name: e.full_name?.split(' ')[0] || e.full_name,
                    last_name:  e.full_name?.split(' ').slice(1).join(' ') || '',
                    username:   e.full_name,
                    trade_name: e.trade_code,
                  }))}
                  value={form.employee_id
                    ? employees.filter(e => String(e.id) === String(form.employee_id)).map(e => ({
                        id: e.id,
                        first_name: e.full_name?.split(' ')[0] || e.full_name,
                        last_name:  e.full_name?.split(' ').slice(1).join(' ') || '',
                        username:   e.full_name,
                        trade_name: e.trade_code,
                      }))[0] || null
                    : null
                  }
                  onChange={w => set('employee_id', w ? w.id : '')}
                  placeholder={t('assignments.newModal.employeeSearchPlaceholder')}
                />
            }
          </div>

          {/* Role */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">{t('assignments.newModal.roleOnProject')}</label>
            <div className="flex gap-2">
              {ROLE_KEYS.map(roleKey => (
                <button key={roleKey} onClick={() => set('assignment_role', roleKey)}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-colors ${form.assignment_role === roleKey ? 'bg-primary text-white border-primary' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                  {t(`assignments.role.${roleKey}`)}
                </button>
              ))}
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">{t('assignments.newModal.startDate')}</label>
              <input type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-light" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">{t('assignments.newModal.endDate')}</label>
              <input type="date" value={form.end_date} min={form.start_date} onChange={e => set('end_date', e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-light" />
            </div>
          </div>

          {/* Shift */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { labelKey: 'assignments.newModal.shiftStart', key: 'shift_start' },
              { labelKey: 'assignments.newModal.shiftEnd',   key: 'shift_end' },
            ].map(({ labelKey, key }) => (
              <div key={key}>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">{t(labelKey)}</label>
                <select value={form[key]} onChange={e => set(key, e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-light">
                  {SHIFTS.map(s => <option key={s} value={s}>{fmtTime(s)}</option>)}
                </select>
              </div>
            ))}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">{t('assignments.newModal.notes')}</label>
            <input type="text" value={form.notes} onChange={e => set('notes', e.target.value)}
              placeholder={t('assignments.newModal.notesPlaceholder')}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-light placeholder:text-slate-300" />
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors">
            {t('assignments.newModal.cancel')}
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-primary text-white text-xs font-bold rounded-xl hover:bg-primary-dark transition-colors disabled:opacity-60">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Check className="w-3.5 h-3.5" />{t('assignments.newModal.assign')}</>}
          </button>
        </div>
      </div>
    </div>
  )
}

function ListTab({ projects, assignments, loadingAsgn, onModify, modifying, successMsg, onRefresh }) {
  const { t, i18n } = useTranslation()
  const today = todayStr()
  const locale = i18n.language === 'fr' ? 'fr-CA' : 'en-CA'

  // Filters
  const [filterProject,  setFilterProject]  = useState('')
  const [filterEmployee, setFilterEmployee] = useState('')
  const [filterDate,     setFilterDate]     = useState('')

  // Collapsed project groups
  const [collapsed, setCollapsed] = useState({})
  const toggleCollapse = (k) => setCollapsed(p => ({ ...p, [k]: !p[k] }))

  // Filtered assignments
  const filtered = assignments.filter(a => {
    if (filterProject  && !String(a.project_code).toLowerCase().includes(filterProject.toLowerCase())
                       && !String(a.project_name || '').toLowerCase().includes(filterProject.toLowerCase())) return false
    if (filterEmployee && !String(a.employee_name).toLowerCase().includes(filterEmployee.toLowerCase())) return false
    if (filterDate) {
      const start = (a.start_date || '').slice(0, 10)
      const end   = (a.end_date   || '').slice(0, 10)
      if (!(start <= filterDate && end >= filterDate)) return false
    }
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

  const hasFilter = filterProject || filterEmployee || filterDate

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0 bg-slate-50">
      {/* Success message */}
      {successMsg && (
        <div className="flex-shrink-0 mx-5 mt-4 flex items-center gap-1.5 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 font-semibold">
          <Check className="w-3.5 h-3.5" />{successMsg}
        </div>
      )}

      {/* Filters */}
      <div className="flex-shrink-0 px-5 pt-4 pb-3 flex items-center gap-2">
        <div className="relative flex-1 max-w-[200px]">
          <Briefcase className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          <input value={filterProject} onChange={e => setFilterProject(e.target.value)} placeholder={t('assignments.list.filterProject')}
            className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-xl text-xs bg-white focus:outline-none focus:ring-2 focus:ring-primary-light placeholder:text-slate-400" />
        </div>
        <div className="relative flex-1 max-w-[200px]">
          <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          <input value={filterEmployee} onChange={e => setFilterEmployee(e.target.value)} placeholder={t('assignments.list.filterEmployee')}
            className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-xl text-xs bg-white focus:outline-none focus:ring-2 focus:ring-primary-light placeholder:text-slate-400" />
        </div>
        <div className="relative">
          <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}
            className="pl-8 pr-3 py-2 border border-slate-200 rounded-xl text-xs bg-white focus:outline-none focus:ring-2 focus:ring-primary-light" />
        </div>
        {hasFilter && (
          <button onClick={() => { setFilterProject(''); setFilterEmployee(''); setFilterDate('') }}
            className="flex items-center gap-1 px-3 py-2 text-xs text-slate-500 hover:text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
            <X className="w-3 h-3" />{t('assignments.list.clear')}
          </button>
        )}
        <div className="ml-auto text-[11px] text-slate-400 font-medium">
          {t('assignments.list.countSuffix', { count: filtered.length })}
          {hasFilter ? t('assignments.list.countOf', { total: assignments.length }) : ''}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-3">
        {loadingAsgn
          ? <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>
          : groupList.length === 0
            ? <div className="flex flex-col items-center justify-center py-16 text-center">
                <Briefcase className="w-10 h-10 text-slate-200 mb-3" />
                <p className="text-sm font-semibold text-slate-400">{t('assignments.list.empty')}</p>
                <p className="text-xs text-slate-300 mt-1">
                  {hasFilter ? t('assignments.list.emptyHintFiltered') : t('assignments.list.emptyHintDefault')}
                </p>
              </div>
            : groupList.map(group => {
                const isOpen = !collapsed[group.project_id]
                const onSiteNow = group.employees.filter(a => (a.start_date || '').slice(0,10) <= today && (a.end_date || '').slice(0,10) >= today).length
                return (
                  <div key={group.project_id} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                    {/* Project header */}
                    <button onClick={() => toggleCollapse(group.project_id)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left">
                      <div className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center flex-shrink-0">
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
                        <span className="text-[10px] font-semibold px-2 py-1 bg-primary-pale text-primary rounded-lg">{t('assignments.list.assignedSuffix', { count: group.employees.length })}</span>
                        {onSiteNow > 0 && <span className="text-[10px] font-semibold px-2 py-1 bg-emerald-50 text-emerald-600 rounded-lg">{t('assignments.list.onSiteSuffix', { count: onSiteNow })}</span>}
                        <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                      </div>
                    </button>

                    {/* Employees table */}
                    {isOpen && (
                      <>
                        <div className="border-t border-slate-100 grid grid-cols-[1fr_120px_80px_160px_auto] text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 py-2 bg-slate-50">
                          <span>{t('assignments.list.th.employee')}</span>
                          <span>{t('assignments.list.th.trade')}</span>
                          <span>{t('assignments.list.th.role')}</span>
                          <span>{t('assignments.list.th.period')}</span>
                          <span>{t('assignments.list.th.actions')}</span>
                        </div>
                        {group.employees.map(a => {
                          const isToday = (a.start_date || '').slice(0,10) <= today && (a.end_date || '').slice(0,10) >= today
                          const c = trade(a.trade_code)
                          return (
                            <div key={a.id} className="grid grid-cols-[1fr_120px_80px_160px_auto] items-center px-4 py-2.5 border-t border-slate-50 hover:bg-slate-50/70 transition-colors">
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
                              {/* Role */}
                              <div><RoleBadge role={a.assignment_role} /></div>
                              {/* Period */}
                              <div className="flex items-center gap-1.5">
                                <div className="text-xs text-slate-600 font-medium">{fmt(a.start_date, locale)} → {fmt(a.end_date, locale)}</div>
                                {isToday && <span className="text-[9px] font-bold px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded-full">{t('assignments.list.todayBadge')}</span>}
                              </div>
                              {/* Actions */}
                              <div className="flex items-center gap-1.5">
                                <button onClick={() => onModify(a)} disabled={modifying === a.id}
                                  className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-primary-light hover:bg-primary-pale rounded-lg transition-colors border border-primary-pale whitespace-nowrap disabled:opacity-50">
                                  {modifying === a.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <><ArrowLeftRight className="w-3 h-3" />{t('assignments.list.move')}</>}
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
  const { t } = useTranslation()
  const [tab, setTab] = useState('list')
  const [projects, setProjects] = useState([])
  const [assignments, setAssignments] = useState([])
  const [loadingProj, setLoadingProj] = useState(true)
  const [loadingAsgn, setLoadingAsgn] = useState(true)
  const [assigning, setAssigning] = useState(null)
  const [successMsg, setSuccessMsg] = useState('')
  const [mapProj, setMapProj] = useState(null)
  const [mapForm, setMapForm] = useState({ start_date: tomorrowStr(), end_date: tomorrowStr() })
  const [reassignModal,  setReassignModal]  = useState(null)
  const [modifying,    setModifying]    = useState(null)
  const [newAssignModal, setNewAssignModal] = useState(false)
  // Section 130.5: "Repeat today" removed — the Workforce Planner's Plan tab
  // is a strict superset (carry-over + replacements + gaps + new + emails).
  const navigate = useNavigate()
  const { can, loading: permsLoading } = usePermissions()
  const canSmartPlan = !permsLoading && can('assignments', 'smart_assign')

  useEffect(() => {
    api.get('/projects?status=ACTIVE')
      .then(r => setProjects(r.data.projects || r.data.rows || []))
      .catch(e => { console.error('Failed to load projects:', e); setProjects([]) })
      .finally(() => setLoadingProj(false))
  }, [])

  const fetchAssignments = useCallback(() => {
    setLoadingAsgn(true)
    api.get('/assignments')
      .then(r => setAssignments(r.data.assignments || []))
      .catch(e => { console.error('Failed to load assignments:', e); setAssignments([]) })
      .finally(() => setLoadingAsgn(false))
  }, [])

  useEffect(() => { fetchAssignments() }, [fetchAssignments])

  const handleAssign = async (empId, projectId, form) => {
    setAssigning(empId); setSuccessMsg('')
    try {
      await api.post('/assignments/requests', { project_id: projectId, employee_id: empId, ...form })
      fetchAssignments()
      setSuccessMsg(t('assignments.success.assigned'))
      setTimeout(() => setSuccessMsg(''), 4000)
      return true
    } catch (e) { alert(e.response?.data?.message || e.message); return false }
    finally { setAssigning(null) }
  }

  const handleReassign = (assignment) => {
    const otherProjects = projects.filter(p => p.id !== assignment.project_id)
    setReassignModal({ assignment, otherProjects })
  }

  const handleModifyConfirm = async (newProjectId) => {
    const { assignment } = reassignModal
    setModifying(newProjectId)
    try {
      await api.patch(`/assignments/requests/${assignment.id}/move`, { new_project_id: newProjectId })
      fetchAssignments()
      setReassignModal(null)
      setSuccessMsg(t('assignments.success.moved'))
      setTimeout(() => setSuccessMsg(''), 4000)
    } catch (e) { alert(e.response?.data?.message || e.message) }
    finally { setModifying(null) }
  }

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-lg font-bold text-slate-900">{t('assignments.title')}</h1>
            <p className="text-xs text-slate-400 mt-0.5">{t('assignments.subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setNewAssignModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary-dark transition-colors shadow-sm">
            <Plus className="w-3.5 h-3.5" />{t('assignments.assignButton')}
          </button>
          {canSmartPlan && (
            <button onClick={() => navigate('/workforce-planner')}
              className="flex items-center gap-2 px-4 py-2 bg-white text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-50 transition-colors border border-slate-200">
              <Sparkles className="w-3.5 h-3.5" />{t('assignments.planDayButton')}
            </button>
          )}
          <div className="w-px h-5 bg-slate-200 mx-1" />
          {[
            { id: 'list', icon: List,    labelKey: 'assignments.tabs.list' },
            { id: 'map',  icon: MapIcon, labelKey: 'assignments.tabs.map'  },
          ].map(tabItem => (
            <button key={tabItem.id} onClick={() => setTab(tabItem.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${tab === tabItem.id ? 'bg-primary text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`}>
              <tabItem.icon className="w-3.5 h-3.5" />{t(tabItem.labelKey)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden p-4 gap-4 min-h-0">
        {tab === 'list' && (
          <div className="flex-1 flex rounded-xl border border-slate-200 overflow-hidden bg-white min-h-0">
            <ListTab projects={projects} assignments={assignments} loadingAsgn={loadingAsgn}
              onModify={handleReassign} modifying={modifying} successMsg={successMsg}
              onRefresh={fetchAssignments} />
          </div>
        )}

        {tab === 'map' && (
          <div className="flex-1 flex gap-4 min-h-0">
            <div className="w-52 flex-shrink-0 bg-white rounded-xl border border-slate-200 flex flex-col overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t('assignments.map.selectProject')}</p>
              </div>
              <div className="flex-1 overflow-y-auto">
                {projects.map(p => (
                  <button key={p.id} onClick={() => setMapProj(p)}
                    className={`w-full text-left px-4 py-3 border-b border-slate-50 transition-all ${mapProj?.id === p.id ? 'bg-primary-pale border-l-[3px] border-l-primary-light' : 'hover:bg-slate-50 border-l-[3px] border-l-transparent'}`}>
                    <div className="text-[10px] font-bold text-slate-400">{p.project_code}</div>
                    <div className="text-xs font-semibold text-slate-800 truncate">{p.project_name || p.name}</div>
                  </button>
                ))}
              </div>
              <div className="px-4 py-3 border-t border-slate-100 space-y-2">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">{t('assignments.map.dateStart')}</label>
                  <input type="date" value={mapForm.start_date}
                    onChange={e => {
                      const v = e.target.value
                      setMapForm(f => ({ start_date: v, end_date: f.end_date < v ? v : f.end_date }))
                    }}
                    className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary-light" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">{t('assignments.map.dateEnd')}</label>
                  <input type="date" value={mapForm.end_date} min={mapForm.start_date}
                    onChange={e => {
                      const v = e.target.value
                      if (v >= mapForm.start_date) setMapForm(f => ({ ...f, end_date: v }))
                    }}
                    className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary-light" />
                </div>
              </div>
            </div>
            <MapTab selectedProj={mapProj} form={{ ...mapForm, shift_start: '06:00', shift_end: '14:30', notes: '' }}
              onAssign={(empId) => mapProj && handleAssign(empId, mapProj.id, { ...mapForm, shift_start: '06:00', shift_end: '14:30', notes: '' })}
              onModify={handleReassign} assigning={assigning} modifying={modifying}
              assignments={assignments} successMsg={successMsg} />
          </div>
        )}

      </div>
      {newAssignModal && (
        <NewAssignmentModal
          projects={projects}
          onClose={() => setNewAssignModal(false)}
          onSaved={() => {
            setNewAssignModal(false)
            fetchAssignments()
            setSuccessMsg(t('assignments.success.assigned'))
            setTimeout(() => setSuccessMsg(''), 4000)
          }}
        />
      )}
      {/* Move Modal */}
      {reassignModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-800">{t('assignments.moveModal.title')}</h3>
                <p className="text-xs text-slate-400 mt-0.5"
                  dangerouslySetInnerHTML={{
                    __html: t('assignments.moveModal.subtitle', {
                      employee: `<span class="font-semibold text-slate-600">${reassignModal.assignment.employee_name}</span>`,
                      project:  `<span class="font-semibold text-primary">${reassignModal.assignment.project_code}</span>`,
                    })
                  }}
                />
              </div>
              <button onClick={() => setReassignModal(null)} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="max-h-72 overflow-y-auto divide-y divide-slate-50">
              {reassignModal.otherProjects.length === 0
                ? <div className="py-8 text-center text-xs text-slate-400">{t('assignments.moveModal.empty')}</div>
                : reassignModal.otherProjects.map(proj => (
                    <button key={proj.id} onClick={() => handleModifyConfirm(proj.id)}
                      disabled={modifying === proj.id}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left disabled:opacity-60">
                      <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center flex-shrink-0">
                        <Briefcase className="w-4 h-4 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-slate-800">{proj.project_code}</div>
                        {proj.project_name && <div className="text-xs text-slate-400 truncate">{proj.project_name || proj.name}</div>}
                      </div>
                      {modifying === proj.id
                        ? <Loader2 className="w-4 h-4 animate-spin text-primary-light flex-shrink-0" />
                        : <ArrowLeftRight className="w-4 h-4 text-slate-300 flex-shrink-0" />}
                    </button>
                  ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}