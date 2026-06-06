import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import api from '@/lib/api'
import { usePermissions } from '@/hooks/usePermissions.jsx'
import {
  Recycle, Plus, Send, Loader2, Check, AlertCircle, Trash2,
  ChevronDown, PackageOpen, RefreshCw,
} from 'lucide-react'

// Material Return / Surplus page (DECISIONS §8 / §126). Frontend over the
// existing endpoints: POST /materials/returns (declare), GET /materials/surplus
// (available company-wide), GET /materials/returns (my declarations). Mirrors
// MaterialRequestPage's design system (header + tabs + cards + tables, i18n).

const UNITS = ['pcs', 'm', 'ft', 'kg', 'lb', 'box', 'roll', 'bag', 'set', 'pair', 'L', 'gal']

// ── Declare tab ───────────────────────────────────────────────
function DeclareTab({ onDeclared }) {
  const { t } = useTranslation()
  const [todayAssignment, setTodayAssignment] = useState(null)
  const [projects, setProjects] = useState([])
  const [selectedProj, setSelectedProj] = useState('')
  const [items, setItems] = useState([{ item_name: '', quantity: '', unit: 'pcs' }])
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    // Section 129.5 pattern: foreman has no projects.view — use the
    // today-assignment project directly; managers get the dropdown.
    api.get('/assignments/my-today')
      .then(r => {
        const asgn = r.data.assignment
        if (asgn) {
          setTodayAssignment(asgn)
          setSelectedProj(String(asgn.project_id))
        } else {
          api.get('/projects?status=ACTIVE')
            .then(pr => {
              const list = pr.data.projects || pr.data.rows || []
              setProjects(list)
              if (list.length) setSelectedProj(String(list[0].id))
            })
            .catch(e => console.error('Failed to load projects:', e))
        }
      })
      .catch(e => console.error('Failed to load today assignment:', e))
  }, [])

  const addItem = () => setItems(prev => [...prev, { item_name: '', quantity: '', unit: 'pcs' }])
  const updateItem = (i, k, v) => setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [k]: v } : it))
  const removeItem = (i) => setItems(prev => prev.filter((_, idx) => idx !== i))

  const handleSubmit = async () => {
    setError('')
    if (!selectedProj) return setError(t('surplus.declare.errors.selectProject'))
    const valid = items.filter(it => it.item_name.trim() && Number(it.quantity) > 0)
    if (!valid.length) return setError(t('surplus.declare.errors.addItem'))
    setSaving(true)
    try {
      await api.post('/materials/returns', {
        project_id: Number(selectedProj),
        items: valid.map(it => ({
          item_name: it.item_name.trim(),
          quantity: Number(it.quantity),
          unit: it.unit,
        })),
        note: note || undefined,
      })
      setItems([{ item_name: '', quantity: '', unit: 'pcs' }])
      setNote('')
      onDeclared()
    } catch (e) {
      setError(e.response?.data?.error || e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Project */}
      <div>
        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
          {t('surplus.declare.project')}
        </label>
        {todayAssignment ? (
          <div className="flex items-center gap-3 px-4 py-3 bg-primary-pale border border-primary-pale rounded-xl max-w-sm">
            <div className="w-2 h-2 rounded-full bg-primary-light flex-shrink-0" />
            <div>
              <div className="text-sm font-bold text-primary-dark">
                {todayAssignment.project_code}{todayAssignment.project_name ? ` — ${todayAssignment.project_name}` : ''}
              </div>
              <div className="text-[10px] text-primary-light mt-0.5">{t('surplus.declare.todayAssignment')}</div>
            </div>
          </div>
        ) : (
          <select value={selectedProj} onChange={e => setSelectedProj(e.target.value)}
            className="w-full max-w-sm px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-light">
            <option value="">{t('surplus.declare.selectProject')}</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>
                {p.project_code}{p.project_name ? ` — ${p.project_name}` : ''}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Items */}
      <div>
        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">
          {t('surplus.declare.items')}
        </label>
        <div className="space-y-2.5">
          {items.map((item, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-3">
              <div className="grid grid-cols-[1fr_100px_80px_auto] gap-2 items-center">
                <input type="text" value={item.item_name}
                  onChange={e => updateItem(i, 'item_name', e.target.value)}
                  placeholder={t('surplus.declare.itemNamePlaceholder')}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-light placeholder:text-slate-300" />
                <input type="number" min="1" step="1" value={item.quantity}
                  onChange={e => updateItem(i, 'quantity', Math.floor(Math.abs(e.target.value)) || '')}
                  placeholder={t('surplus.declare.qtyPlaceholder')}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-light text-center" />
                <div className="relative">
                  <select value={item.unit} onChange={e => updateItem(i, 'unit', e.target.value)}
                    className="w-full px-2 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-light appearance-none pr-6">
                    {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                  <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                </div>
                <button onClick={() => removeItem(i)}
                  className="p-2 text-slate-300 hover:text-red-400 transition-colors rounded-lg">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
        <button onClick={addItem}
          className="mt-3 flex items-center gap-2 px-4 py-2 bg-white border border-dashed border-slate-300 text-slate-500 text-xs font-semibold rounded-xl hover:border-primary-light hover:text-primary transition-colors w-full justify-center">
          <Plus className="w-3.5 h-3.5" />{t('surplus.declare.addItem')}
        </button>
      </div>

      {/* Note */}
      <div>
        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
          {t('surplus.declare.note')}
        </label>
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
          placeholder={t('surplus.declare.notePlaceholder')}
          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-light placeholder:text-slate-300 resize-none" />
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
        </div>
      )}

      <button onClick={handleSubmit} disabled={saving}
        className="flex items-center gap-2 px-6 py-2.5 bg-primary text-white text-sm font-bold rounded-xl hover:bg-primary-dark transition-colors disabled:opacity-60">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4" />{t('surplus.declare.submit')}</>}
      </button>
    </div>
  )
}

// ── Available tab ─────────────────────────────────────────────
function AvailableTab() {
  const { t } = useTranslation()
  const [surplus, setSurplus] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchSurplus = async () => {
    setLoading(true)
    try {
      const r = await api.get('/materials/surplus')
      setSurplus(r.data.surplus || [])
    } catch (e) { console.error('Failed to load surplus:', e) }
    finally { setLoading(false) }
  }
  useEffect(() => { fetchSurplus() }, [])

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={fetchSurplus} className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
        <span className="text-xs text-slate-400 ml-auto">{t('surplus.available.count', { count: surplus.length })}</span>
      </div>

      {surplus.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <PackageOpen className="w-10 h-10 text-slate-200 mb-3" />
          <p className="text-sm font-semibold text-slate-400">{t('surplus.available.empty')}</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 py-2.5">{t('surplus.available.th.item')}</th>
                <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 py-2.5">{t('surplus.available.th.qty')}</th>
                <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 py-2.5">{t('surplus.available.th.source')}</th>
              </tr>
            </thead>
            <tbody>
              {surplus.map(s => (
                <tr key={s.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-slate-700">{s.item_name}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className="font-bold text-primary">{s.qty_available}</span>
                    <span className="text-xs text-slate-400 ml-1">{s.unit}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {s.project_code}{s.project_name ? ` — ${s.project_name}` : ''}
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

export default function SurplusPage() {
  const { t } = useTranslation()
  const { can, loading: permsLoading } = usePermissions()
  const canDeclare = !permsLoading && can('materials', 'surplus_declare')
  const [tab, setTab] = useState(canDeclare ? 'declare' : 'available')
  const [flash, setFlash] = useState(false)

  // If perms resolve after mount and the user can't declare, force the
  // Available tab.
  useEffect(() => {
    if (!permsLoading && !canDeclare) setTab('available')
  }, [permsLoading, canDeclare])

  const handleDeclared = () => {
    setFlash(true)
    setTimeout(() => setFlash(false), 4000)
    setTab('available')
  }

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center">
            <Recycle className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">{t('surplus.title')}</h1>
            <p className="text-xs text-slate-400 mt-0.5">{t('surplus.subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {canDeclare && (
            <button onClick={() => setTab('declare')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
                tab === 'declare' ? 'bg-primary text-white' : 'text-slate-500 hover:bg-slate-100'
              }`}>
              <Plus className="w-3.5 h-3.5" />{t('surplus.tabs.declare')}
            </button>
          )}
          <button onClick={() => setTab('available')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
              tab === 'available' ? 'bg-primary text-white' : 'text-slate-500 hover:bg-slate-100'
            }`}>
            <PackageOpen className="w-3.5 h-3.5" />{t('surplus.tabs.available')}
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {flash && (
          <div className="mb-4 flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-xs text-emerald-700">
            <Check className="w-4 h-4 flex-shrink-0" />{t('surplus.declare.success')}
          </div>
        )}
        {tab === 'declare' && canDeclare && <DeclareTab onDeclared={handleDeclared} />}
        {tab === 'available' && <AvailableTab />}
      </div>
    </div>
  )
}
