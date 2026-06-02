import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import api from '@/lib/api'
import { usePermissions } from '@/hooks/usePermissions.jsx'
import {
  Wrench, Send, Loader2, Check, AlertCircle, RefreshCw, ChevronDown, PackageSearch,
} from 'lucide-react'

// Tool Request + asset tracking page (DECISIONS §126.1 / §128). Frontend over
// /api/tools: catalog (trade-filtered) + requests + assets. Mirrors the
// MaterialRequest/Surplus design system.

const TRADES = ['GENERAL', 'ELECTRICAL', 'PLUMBING', 'MECHANICAL', 'LAYOUT']

const ASSET_STATUS_STYLE = {
  AVAILABLE: 'bg-emerald-100 text-emerald-700',
  ASSIGNED: 'bg-blue-100 text-blue-700',
  MAINTENANCE: 'bg-amber-100 text-amber-700',
  RETIRED: 'bg-slate-100 text-slate-400',
}

// ── Request tab ───────────────────────────────────────────────
function RequestTab({ onRequested }) {
  const { t } = useTranslation()
  const [projects, setProjects] = useState([])
  const [selectedProj, setSelectedProj] = useState('')
  const [trade, setTrade] = useState('')
  const [catalog, setCatalog] = useState([])
  const [catalogId, setCatalogId] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/projects?status=ACTIVE')
      .then(r => {
        const list = r.data.projects || r.data.rows || []
        setProjects(list)
        if (list.length) setSelectedProj(String(list[0].id))
      })
      .catch(e => console.error('Failed to load projects:', e))
  }, [])

  // Reload catalog when the trade filter changes.
  useEffect(() => {
    const qs = trade ? `?trade=${trade}` : ''
    api.get(`/tools/catalog${qs}`)
      .then(r => {
        const list = r.data.catalog || []
        setCatalog(list)
        setCatalogId(list.length ? String(list[0].id) : '')
      })
      .catch(e => console.error('Failed to load tool catalog:', e))
  }, [trade])

  const handleSubmit = async () => {
    setError('')
    if (!selectedProj) return setError(t('tools.request.errors.selectProject'))
    if (!catalogId) return setError(t('tools.request.errors.selectTool'))
    setSaving(true)
    try {
      await api.post('/tools/requests', {
        project_id: Number(selectedProj),
        catalog_id: Number(catalogId),
        quantity: Number(quantity) || 1,
        note: note || undefined,
      })
      setNote('')
      setQuantity(1)
      onRequested()
    } catch (e) {
      setError(e.response?.data?.error || e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5 max-w-xl">
      {/* Project */}
      <div>
        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">{t('tools.request.project')}</label>
        <select value={selectedProj} onChange={e => setSelectedProj(e.target.value)}
          className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-light">
          <option value="">{t('tools.request.selectProject')}</option>
          {projects.map(p => (
            <option key={p.id} value={p.id}>{p.project_code}{p.project_name ? ` — ${p.project_name}` : ''}</option>
          ))}
        </select>
      </div>

      {/* Trade filter (smart filter by specialty) */}
      <div>
        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">{t('tools.request.trade')}</label>
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setTrade('')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${trade === '' ? 'bg-primary text-white' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
            {t('tools.request.allTrades')}
          </button>
          {TRADES.map(tr => (
            <button key={tr} onClick={() => setTrade(tr)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${trade === tr ? 'bg-primary text-white' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
              {t(`tools.trades.${tr}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Tool + quantity */}
      <div className="grid grid-cols-[1fr_100px] gap-2">
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">{t('tools.request.tool')}</label>
          <div className="relative">
            <select value={catalogId} onChange={e => setCatalogId(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-light appearance-none pr-7">
              {catalog.length === 0 && <option value="">{t('tools.request.noTools')}</option>}
              {catalog.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          </div>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">{t('tools.request.qty')}</label>
          <input type="number" min="1" step="1" value={quantity}
            onChange={e => setQuantity(Math.max(1, Math.floor(Math.abs(e.target.value)) || 1))}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-light text-center" />
        </div>
      </div>

      {/* Note */}
      <div>
        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">{t('tools.request.note')}</label>
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
          placeholder={t('tools.request.notePlaceholder')}
          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-light placeholder:text-slate-300 resize-none" />
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
        </div>
      )}

      <button onClick={handleSubmit} disabled={saving || !catalogId}
        className="flex items-center gap-2 px-6 py-2.5 bg-primary text-white text-sm font-bold rounded-xl hover:bg-primary-dark transition-colors disabled:opacity-60">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4" />{t('tools.request.submit')}</>}
      </button>
    </div>
  )
}

// ── Assets tab ────────────────────────────────────────────────
function AssetsTab() {
  const { t } = useTranslation()
  const [assets, setAssets] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchAssets = async () => {
    setLoading(true)
    try {
      const r = await api.get('/tools/assets')
      setAssets(r.data.assets || [])
    } catch (e) { console.error('Failed to load tool assets:', e) }
    finally { setLoading(false) }
  }
  useEffect(() => { fetchAssets() }, [])

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={fetchAssets} className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
        <span className="text-xs text-slate-400 ml-auto">{t('tools.assets.count', { count: assets.length })}</span>
      </div>

      {assets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <PackageSearch className="w-10 h-10 text-slate-200 mb-3" />
          <p className="text-sm font-semibold text-slate-400">{t('tools.assets.empty')}</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 py-2.5">{t('tools.assets.th.tool')}</th>
                <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 py-2.5">{t('tools.assets.th.tag')}</th>
                <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 py-2.5">{t('tools.assets.th.status')}</th>
                <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 py-2.5">{t('tools.assets.th.location')}</th>
              </tr>
            </thead>
            <tbody>
              {assets.map(a => (
                <tr key={a.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-slate-700">{a.tool_name}</td>
                  <td className="px-4 py-3 text-xs font-mono text-slate-500">{a.asset_tag}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ASSET_STATUS_STYLE[a.status] || ASSET_STATUS_STYLE.AVAILABLE}`}>
                      {t(`tools.assetStatus.${a.status}`)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {a.current_project_id ? `${a.project_code || ''}${a.project_name ? ` — ${a.project_name}` : ''}` : t('tools.assets.warehouse')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function ToolsPage() {
  const { t } = useTranslation()
  const { can, loading: permsLoading } = usePermissions()
  const canRequest = !permsLoading && can('materials', 'request_submit')
  const canViewAssets = !permsLoading && can('materials', 'surplus_view')
  const [tab, setTab] = useState('request')
  const [flash, setFlash] = useState(false)

  useEffect(() => {
    if (permsLoading) return
    if (!canRequest && canViewAssets) setTab('assets')
  }, [permsLoading, canRequest, canViewAssets])

  const handleRequested = () => {
    setFlash(true)
    setTimeout(() => setFlash(false), 4000)
  }

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center">
            <Wrench className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">{t('tools.title')}</h1>
            <p className="text-xs text-slate-400 mt-0.5">{t('tools.subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {canRequest && (
            <button onClick={() => setTab('request')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${tab === 'request' ? 'bg-primary text-white' : 'text-slate-500 hover:bg-slate-100'}`}>
              <Send className="w-3.5 h-3.5" />{t('tools.tabs.request')}
            </button>
          )}
          {canViewAssets && (
            <button onClick={() => setTab('assets')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${tab === 'assets' ? 'bg-primary text-white' : 'text-slate-500 hover:bg-slate-100'}`}>
              <PackageSearch className="w-3.5 h-3.5" />{t('tools.tabs.assets')}
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {flash && (
          <div className="mb-4 flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-xs text-emerald-700">
            <Check className="w-4 h-4 flex-shrink-0" />{t('tools.request.success')}
          </div>
        )}
        {tab === 'request' && canRequest && <RequestTab onRequested={handleRequested} />}
        {tab === 'assets' && canViewAssets && <AssetsTab />}
      </div>
    </div>
  )
}
