import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import {
  Plus, Search, MapPin, Calendar, Building2,
  ChevronRight, X, Loader2, AlertCircle, Edit2,
  FolderKanban, Filter
} from 'lucide-react'

const MAPBOX_TOKEN = 'pk.eyJ1IjoiaGVkYXJoYWxsYWs3NiIsImEiOiJjbWxsenc1ZmkwY3JyM2RxOGpya2N0bDl0In0.fivZACTIk6dgF79Uw6-8iQ'

// ── Status badge ──────────────────────────────────────────────
const statusColors = {
  ACTIVE:    'bg-emerald-100 text-emerald-700 border-emerald-200',
  PLANNED:   'bg-blue-100 text-blue-700 border-blue-200',
  ON_HOLD:   'bg-amber-100 text-amber-700 border-amber-200',
  COMPLETED: 'bg-slate-100 text-slate-600 border-slate-200',
  CANCELLED: 'bg-red-100 text-red-600 border-red-200',
}
function StatusBadge({ code, name }) {
  const cls = statusColors[code] || 'bg-slate-100 text-slate-600 border-slate-200'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${cls}`}>
      {name || code}
    </span>
  )
}

// ── Address autocomplete ──────────────────────────────────────
function AddressInput({ value, onChange, onCoords }) {
  const { t } = useTranslation()
  const [suggestions, setSuggestions] = useState([])
  const [open, setOpen] = useState(false)
  const timer = useRef(null)

  const search = useCallback(async (q) => {
    if (q.length < 3) { setSuggestions([]); return }
    try {
      const res = await api.get(`/geocode/suggest?q=${encodeURIComponent(q)}`)
      if (res.data.ok) setSuggestions(res.data.features || [])
    } catch { setSuggestions([]) }
  }, [])

  const handleChange = (e) => {
    onChange(e.target.value)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => search(e.target.value), 400)
    setOpen(true)
  }

  const pick = (f) => {
    onChange(f.place_name)
    onCoords({ lng: f.center[0], lat: f.center[1] })
    setSuggestions([])
    setOpen(false)
  }

  return (
    <div className="relative">
      <div className="relative">
        <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={value}
          onChange={handleChange}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          onFocus={() => suggestions.length && setOpen(true)}
          className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-light"
          placeholder={t('projects.modal.addressPlaceholder')}
        />
      </div>
      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 w-full bg-white border border-slate-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-auto">
          {suggestions.map((f, i) => (
            <li key={i} onMouseDown={() => pick(f)}
              className="px-3 py-2 text-sm hover:bg-primary-pale cursor-pointer flex items-start gap-2">
              <MapPin size={12} className="text-slate-400 mt-0.5 flex-shrink-0" />
              <span>{f.place_name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Project Modal ─────────────────────────────────────────────
function ProjectModal({ project, meta, onClose, onSaved }) {
  const { t } = useTranslation()
  const isEdit = !!project?.id
  const [form, setForm] = useState({
    project_name: project?.project_name || '',
    trade_type_id: project?.trade_type_id || '',
    status_id: project?.status_id || '',
    site_address: project?.site_address || '',
    start_date: project?.start_date?.slice(0, 10) || '',
    end_date: project?.end_date?.slice(0, 10) || '',
    client_id: project?.client_id || '',
    ccq_sector: project?.ccq_sector || 'IC',
  })
  const [coords, setCoords] = useState(
    project?.site_lat ? { lat: project.site_lat, lng: project.site_lng } : null
  )
  const [error, setError] = useState('')
  const qc = useQueryClient()

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const mutation = useMutation({
    mutationFn: async (data) => {
      if (isEdit) return api.patch(`/projects/${project.id}`, data)
      return api.post('/projects', data)
    },
    onSuccess: () => {
      qc.invalidateQueries(['projects'])
      onSaved()
    },
    onError: (err) => {
      setError(err.response?.data?.error || t('projects.modal.errors.saveFailed'))
    }
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')
    if (!form.project_name.trim()) return setError(t('projects.modal.errors.projectNameRequired'))
    if (!form.trade_type_id) return setError(t('projects.modal.errors.tradeTypeRequired'))
    mutation.mutate({ ...form, site_lat: coords?.lat, site_lng: coords?.lng })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <FolderKanban size={18} className="text-primary" />
            <h2 className="font-semibold text-slate-800">
              {isEdit ? t('projects.modal.titleEdit') : t('projects.modal.titleNew')}
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <X size={16} className="text-slate-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Project Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              {t('projects.modal.projectName')}
            </label>
            <input
              type="text"
              value={form.project_name}
              onChange={e => set('project_name', e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-light"
              placeholder={t('projects.modal.projectNamePlaceholder')}
            />
          </div>

          {/* CCQ Sector */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              {t('projects.modal.ccqSector')} <span className="font-normal normal-case text-slate-400">{t('projects.modal.ccqSectorHint')}</span>
            </label>
            <select
              value={form.ccq_sector}
              onChange={e => set('ccq_sector', e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-light bg-white"
            >
              <option value="IC">{t('projects.modal.ccqSectorIC')}</option>
              <option value="INDUSTRIAL">{t('projects.modal.ccqSectorIndustrial')}</option>
              <option value="RESIDENTIAL">{t('projects.modal.ccqSectorResidential')}</option>
            </select>
          </div>

          {/* Trade + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                {t('projects.modal.tradeType')}
              </label>
              <select
                value={form.trade_type_id}
                onChange={e => set('trade_type_id', e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-light bg-white"
              >
                <option value="">{t('projects.modal.selectTrade')}</option>
                {meta?.trade_types?.map(tr => (
                  <option key={tr.id} value={tr.id}>{tr.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                {t('projects.modal.status')}
              </label>
              <select
                value={form.status_id}
                onChange={e => set('status_id', e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-light bg-white"
              >
                <option value="">{t('projects.modal.selectStatus')}</option>
                {meta?.project_statuses?.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Address */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              {t('projects.modal.siteAddress')}
            </label>
            <AddressInput
              value={form.site_address}
              onChange={v => set('site_address', v)}
              onCoords={setCoords}
            />
            {coords && (
              <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                <MapPin size={11} /> {t('projects.modal.coordinatesSaved', { lat: coords.lat.toFixed(4), lng: coords.lng.toFixed(4) })}
              </p>
            )}
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                {t('projects.modal.startDate')}
              </label>
              <input
                type="date"
                value={form.start_date}
                onChange={e => set('start_date', e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-light"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                {t('projects.modal.endDate')}
              </label>
              <input
                type="date"
                value={form.end_date}
                onChange={e => set('end_date', e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-light"
              />
            </div>
          </div>

          {/* Client */}
          {meta?.clients?.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                {t('projects.modal.client')}
              </label>
              <select
                value={form.client_id}
                onChange={e => set('client_id', e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-light bg-white"
              >
                <option value="">{t('projects.modal.noClient')}</option>
                {meta.clients.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2.5">
              <AlertCircle size={14} />
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
              {t('projects.modal.cancel')}
            </button>
            <button type="submit" disabled={mutation.isPending}
              className="flex-1 px-4 py-2.5 bg-primary hover:bg-primary-dark disabled:opacity-60 text-white rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2">
              {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
              {isEdit ? t('projects.modal.saveChanges') : t('projects.modal.createProject')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────
export default function ProjectsPage() {
  const { t, i18n } = useTranslation()
  const [search, setSearch]     = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [modal, setModal]       = useState(null) // null | 'new' | project obj
  const qc = useQueryClient()

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.get('/projects').then(r => r.data.projects || []),
  })

  const { data: meta } = useQuery({
    queryKey: ['projects-meta'],
    queryFn: () => api.get('/projects/meta').then(r => r.data),
  })

  // Filter
  const filtered = projects.filter(p => {
    const matchSearch = !search ||
      p.project_name?.toLowerCase().includes(search.toLowerCase()) ||
      p.project_code?.toLowerCase().includes(search.toLowerCase()) ||
      p.site_address?.toLowerCase().includes(search.toLowerCase())
    const matchStatus = !filterStatus || p.status_code === filterStatus
    return matchSearch && matchStatus
  })

  // Section 56: localize the date format using the current i18n language.
  // FR (Quebec): jj mmm aaaa (e.g. "12 mai 2026"); EN: dd Mmm yyyy.
  const fmt = (d) => {
    if (!d) return '—'
    const locale = i18n.language === 'fr' ? 'fr-CA' : 'en-GB'
    return new Date(d).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' })
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{t('projects.title')}</h1>
          <p className="text-slate-500 text-sm mt-0.5">{t('projects.subtitle', { count: projects.length })}</p>
        </div>
        <button
          onClick={() => setModal('new')}
          className="flex items-center gap-2 bg-primary hover:bg-primary-dark text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors"
        >
          <Plus size={16} />
          {t('projects.newButton')}
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('projects.searchPlaceholder')}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-light"
          />
        </div>
        <div className="relative">
          <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="pl-8 pr-8 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-light appearance-none"
          >
            <option value="">{t('projects.allStatuses')}</option>
            {meta?.project_statuses?.map(s => (
              <option key={s.code} value={s.code}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-primary-light" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <FolderKanban size={32} className="mx-auto text-slate-300 mb-3" />
            <p className="text-slate-500 font-medium">{t('projects.empty')}</p>
            <p className="text-slate-400 text-sm mt-1">
              {search || filterStatus ? t('projects.emptyFiltered') : t('projects.emptyDefault')}
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('projects.th.code')}</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('projects.th.projectName')}</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('projects.th.trade')}</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('projects.th.status')}</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('projects.th.dates')}</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('projects.th.address')}</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(p => (
                <tr key={p.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-5 py-3.5">
                    <span className="text-xs font-mono font-semibold text-primary bg-primary-pale px-2 py-0.5 rounded">
                      {p.project_code}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-sm font-medium text-slate-800">{p.project_name}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-sm text-slate-600">{p.trade_name || '—'}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <StatusBadge code={p.status_code} name={p.status_name} />
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-1 text-xs text-slate-500">
                      <Calendar size={11} />
                      <span>{fmt(p.start_date)}</span>
                      {p.end_date && <><ChevronRight size={10} /><span>{fmt(p.end_date)}</span></>}
                    </div>
                  </td>
                  <td className="px-5 py-3.5 max-w-[200px]">
                    {p.site_address ? (
                      <div className="flex items-start gap-1">
                        <MapPin size={11} className="text-slate-400 mt-0.5 flex-shrink-0" />
                        <span className="text-xs text-slate-500 truncate">{p.site_address}</span>
                      </div>
                    ) : <span className="text-slate-300 text-xs">{t('projects.noAddress')}</span>}
                  </td>
                  <td className="px-5 py-3.5">
                    <button
                      onClick={() => setModal(p)}
                      className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-primary-pale rounded-lg transition-all text-slate-400 hover:text-primary"
                    >
                      <Edit2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <ProjectModal
          project={modal === 'new' ? null : modal}
          meta={meta}
          onClose={() => setModal(null)}
          onSaved={() => setModal(null)}
        />
      )}
    </div>
  )
}
