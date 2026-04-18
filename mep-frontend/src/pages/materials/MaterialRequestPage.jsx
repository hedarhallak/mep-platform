import { useState, useEffect, useRef } from 'react'
import api from '@/lib/api'
import { usePermissions } from '@/hooks/usePermissions.jsx'
import {
  Package, Plus, Send, Loader2, Check,
  AlertCircle, Trash2, ChevronDown, ClipboardList,
  RefreshCw, ChevronRight
} from 'lucide-react'

const UNITS = ['pcs', 'm', 'ft', 'kg', 'lb', 'box', 'roll', 'bag', 'set', 'pair', 'L', 'gal']

const STATUS_STYLE = {
  PENDING:   'bg-amber-100 text-amber-700',
  REVIEWED:  'bg-blue-100 text-blue-700',
  MERGED:    'bg-violet-100 text-violet-700',
  SENT:      'bg-emerald-100 text-emerald-700',
  CANCELLED: 'bg-slate-100 text-slate-400',
}

// ── My Requests Tab ───────────────────────────────────────────
function MyRequestsTab() {
  const [requests, setRequests] = useState([])
  const [loading, setLoading]   = useState(true)
  const [projects, setProjects] = useState([])
  const [filterProj, setFilterProj] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [selected, setSelected] = useState(null) // detail view

  const fetchRequests = async () => {
    setLoading(true)
    try {
      const r = await api.get('/materials/requests')
      const list = r.data.requests || []
      setRequests(list)
      // Extract unique projects
      const projMap = {}
      list.forEach(r => { if (r.project_id) projMap[r.project_id] = { id: r.project_id, code: r.project_code, name: r.project_name } })
      setProjects(Object.values(projMap))
    } catch (e) { console.error('Failed to load material requests:', e) }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchRequests() }, [])

  const filtered = requests.filter(r => {
    if (filterProj   && String(r.project_id) !== filterProj) return false
    if (filterStatus && r.status !== filterStatus)            return false
    return true
  })

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>

  // ── Detail view ──
  if (selected) return (
    <div className="space-y-4">
      <button onClick={() => setSelected(null)}
        className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary-dark transition-colors">
        ← Back to My Requests
      </button>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-800">{selected.project_code}</span>
              {selected.project_name && <span className="text-xs text-slate-400">— {selected.project_name}</span>}
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_STYLE[selected.status] || STATUS_STYLE.PENDING}`}>
                {selected.status}
              </span>
            </div>
            <div className="text-[10px] text-slate-400 mt-1">
              {new Date(selected.created_at).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' })}
            </div>
          </div>
        </div>
        {selected.note && (
          <div className="px-5 py-3 bg-amber-50 border-b border-amber-100 text-xs text-amber-700">
            📝 {selected.note}
          </div>
        )}
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest px-5 py-3">#</th>
              <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest px-5 py-3">Item</th>
              <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest px-5 py-3">Qty</th>
              <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest px-5 py-3">Unit</th>
              {selected.items?.some(i => i.note) && <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest px-5 py-3">Note</th>}
            </tr>
          </thead>
          <tbody>
            {(selected.items || []).map((it, i) => (
              <tr key={i} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                <td className="px-5 py-3 text-xs text-slate-400">{i + 1}</td>
                <td className="px-5 py-3 text-sm font-medium text-slate-700">{it.item_name}</td>
                <td className="px-5 py-3 text-sm font-bold text-primary">{it.quantity}</td>
                <td className="px-5 py-3 text-xs text-slate-400">{it.unit}</td>
                {selected.items?.some(i => i.note) && <td className="px-5 py-3 text-xs text-slate-400">{it.note || '—'}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <select value={filterProj} onChange={e => setFilterProj(e.target.value)}
          className="px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-primary-light text-slate-600">
          <option value="">All Projects</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.code}{p.name ? ` — ${p.name}` : ''}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-primary-light text-slate-600">
          <option value="">All Statuses</option>
          {['PENDING','REVIEWED','MERGED','SENT','CANCELLED'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button onClick={fetchRequests} className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
        <span className="text-xs text-slate-400 ml-auto">{filtered.length} requests</span>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <ClipboardList className="w-10 h-10 text-slate-200 mb-3" />
          <p className="text-sm font-semibold text-slate-400">No requests found</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 py-2.5">Date</th>
                <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 py-2.5">Project</th>
                <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 py-2.5">Items</th>
                <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(req => (
                <tr key={req.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60 transition-colors cursor-pointer"
                  onClick={() => setSelected(req)}>
                  <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                    {new Date(req.created_at).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm font-semibold text-slate-700">{req.project_code}</span>
                    {req.project_name && <span className="text-xs text-slate-400 ml-1">— {req.project_name}</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {(req.items || []).slice(0, 2).map(it => it.item_name).join(', ')}
                    {(req.items || []).length > 2 && <span className="text-slate-400"> +{req.items.length - 2} more</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_STYLE[req.status] || STATUS_STYLE.PENDING}`}>
                      {req.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <ChevronRight className="w-4 h-4 text-slate-300" />
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

function ItemRow({ item, index, onChange, onRemove }) {
  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const debounceRef = useRef(null)

  const handleNameChange = (val) => {
    onChange(index, 'item_name', val)
    clearTimeout(debounceRef.current)
    if (val.length >= 2) {
      debounceRef.current = setTimeout(async () => {
        try {
          const r = await api.get(`/materials/catalog?q=${encodeURIComponent(val)}`)
          setSuggestions(r.data.items || [])
          setShowSuggestions(true)
        } catch (e) { console.error('Failed to search catalog:', e) }
      }, 300)
    } else {
      setSuggestions([])
      setShowSuggestions(false)
    }
  }

  const selectSuggestion = (s) => {
    onChange(index, 'item_name', s.item_name)
    onChange(index, 'unit', s.default_unit)
    setSuggestions([])
    setShowSuggestions(false)
  }

  return (
    <div className="grid grid-cols-[1fr_100px_80px_auto] gap-2 items-start">
      {/* Item name with autocomplete */}
      <div className="relative">
        <input
          type="text"
          value={item.item_name}
          onChange={e => handleNameChange(e.target.value)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          onFocus={() => item.item_name.length >= 2 && suggestions.length && setShowSuggestions(true)}
          placeholder="e.g. Copper pipe 3/4 inch"
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-light placeholder:text-slate-300"
        />
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
            {suggestions.map((s, i) => (
              <button key={i} onMouseDown={() => selectSuggestion(s)}
                className="w-full flex items-center justify-between px-3 py-2 hover:bg-primary-pale transition-colors text-left">
                <span className="text-sm text-slate-700">{s.item_name}</span>
                <span className="text-[10px] text-slate-400 ml-2 flex-shrink-0">
                  {s.default_unit} · used {s.use_count}×
                </span>
              </button>
            ))}
          </div>
        )}
        {item.note !== undefined && (
          <input
            type="text"
            value={item.note}
            onChange={e => onChange(index, 'note', e.target.value)}
            placeholder="Note (optional)"
            className="w-full px-3 py-1.5 border border-slate-100 rounded-lg text-xs mt-1 focus:outline-none focus:ring-1 focus:ring-primary-pale placeholder:text-slate-300 bg-slate-50"
          />
        )}
      </div>
      {/* Quantity */}
      <input
        type="number"
        min="1"
        step="1"
        value={item.quantity}
        onChange={e => onChange(index, 'quantity', Math.floor(Math.abs(e.target.value)) || '')}
        placeholder="Qty"
        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-light text-center"
      />
      {/* Unit */}
      <div className="relative">
        <select
          value={item.unit}
          onChange={e => onChange(index, 'unit', e.target.value)}
          className="w-full px-2 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-light appearance-none pr-6"
        >
          {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
        <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
      </div>
      {/* Remove */}
      <button
        onClick={() => onRemove(index)}
        className="p-2 text-slate-300 hover:text-red-400 transition-colors rounded-lg"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  )
}

export default function MaterialRequestPage() {
  const { can, loading: permsLoading } = usePermissions()
  const [tab, setTab]               = useState('new')
  const [todayAssignment, setTodayAssignment] = useState(null)
  const [projects, setProjects]     = useState([])
  const [selectedProj, setSelectedProj] = useState('')
  const [items, setItems]           = useState([{ item_name: '', quantity: '', unit: 'pcs', note: undefined }])
  const [note, setNote]             = useState('')
  const [saving, setSaving]         = useState(false)
  const [success, setSuccess]       = useState(false)
  const [error, setError]           = useState('')
  const [showNotes, setShowNotes]   = useState(false)

  useEffect(() => {
    if (permsLoading) return
    if (!can('materials', 'request_submit')) return
    // Get today's assignment — if found, use it directly (no dropdown needed)
    api.get('/assignments/my-today')
      .then(r => {
        const asgn = r.data.assignment
        if (asgn) {
          setTodayAssignment(asgn)
          setSelectedProj(String(asgn.project_id))
        } else {
          // Fallback: load all active projects for manual selection
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
  }, [permsLoading])

  const addItem = () =>
    setItems(prev => [...prev, { item_name: '', quantity: '', unit: 'pcs', note: undefined }])

  const updateItem = (index, key, value) =>
    setItems(prev => prev.map((it, i) => i === index ? { ...it, [key]: value } : it))

  const removeItem = (index) =>
    setItems(prev => prev.filter((_, i) => i !== index))

  const toggleNote = (index) =>
    setItems(prev => prev.map((it, i) => i === index
      ? { ...it, note: it.note === undefined ? '' : undefined }
      : it
    ))

  const handleSubmit = async () => {
    setError('')
    if (!selectedProj) return setError('Select a project')

    const validItems = items.filter(it => it.item_name.trim() && Number(it.quantity) >= 1)
    if (!validItems.length) return setError('Add at least one item with name and quantity')

    setSaving(true)
    try {
      await api.post('/materials/requests', {
        project_id: Number(selectedProj),
        items: validItems.map(it => ({
          item_name: it.item_name.trim(),
          quantity:  Math.floor(Number(it.quantity)),
          unit:      it.unit,
          note:      it.note || undefined,
        })),
        note: note || undefined,
      })
      setSuccess(true)
    } catch (e) { setError(e.response?.data?.message || e.message) }
    finally { setSaving(false) }
  }

  const handleReset = () => {
    setSuccess(false)
    setItems([{ item_name: '', quantity: '', unit: 'pcs', note: undefined }])
    setNote('')
    setError('')
  }

  // ── Success screen ────────────────────────────────────────
  if (success) return (
    <div className="flex flex-col h-screen bg-slate-50 items-center justify-center px-6 text-center">
      <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
        <Check className="w-8 h-8 text-emerald-600" />
      </div>
      <h2 className="text-lg font-bold text-slate-800 mb-2">Request Submitted!</h2>
      <p className="text-sm text-slate-400 mb-6">Your foreman will review it shortly.</p>
      <div className="flex gap-3">
        <button onClick={handleReset}
          className="px-6 py-2.5 bg-primary text-white text-sm font-bold rounded-xl hover:bg-primary-dark transition-colors">
          New Request
        </button>
        <button onClick={() => { handleReset(); setTab('my') }}
          className="px-6 py-2.5 bg-white border border-slate-200 text-slate-600 text-sm font-semibold rounded-xl hover:bg-slate-50 transition-colors">
          My Requests
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">

      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center">
            <Package className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Material Request</h1>
            <p className="text-xs text-slate-400 mt-0.5">Request materials for your project</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {[
            { id: 'new', icon: Plus,          label: 'New Request'  },
            { id: 'my',  icon: ClipboardList, label: 'My Requests'  },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
                tab === t.id ? 'bg-primary text-white' : 'text-slate-500 hover:bg-slate-100'
              }`}>
              <t.icon className="w-3.5 h-3.5" />{t.label}
            </button>
          ))}
        </div>
      </div>

      {/* My Requests Tab */}
      {tab === 'my' && (
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <MyRequestsTab />
        </div>
      )}

      {/* New Request Tab */}
      {tab === 'new' && (<>
      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

        {/* Project */}
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Project</label>
          {todayAssignment ? (
            <div className="flex items-center gap-3 px-4 py-3 bg-primary-pale border border-primary-pale rounded-xl max-w-sm">
              <div className="w-2 h-2 rounded-full bg-primary-light flex-shrink-0" />
              <div>
                <div className="text-sm font-bold text-primary-dark">
                  {todayAssignment.project_code}{todayAssignment.project_name ? ` — ${todayAssignment.project_name}` : ''}
                </div>
                <div className="text-[10px] text-primary-light mt-0.5">Today's assignment · {todayAssignment.assignment_role}</div>
              </div>
            </div>
          ) : (
            <select value={selectedProj} onChange={e => setSelectedProj(e.target.value)}
              className="w-full max-w-sm px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-light">
              <option value="">Select project...</option>
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
          <div className="flex items-center justify-between mb-3">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Items</label>
            <div className="flex items-center gap-2 text-[10px] text-slate-400">
              <span>Name</span>
              <span className="w-[100px] text-center">Quantity</span>
              <span className="w-[80px] text-center">Unit</span>
              <span className="w-8" />
            </div>
          </div>

          <div className="space-y-2.5">
            {items.map((item, i) => (
              <div key={i} className="bg-white rounded-xl border border-slate-200 p-3 space-y-2">
                <ItemRow
                  item={item}
                  index={i}
                  onChange={updateItem}
                  onRemove={removeItem}
                  isLast={items.length === 1}
                />
                <button
                  onClick={() => toggleNote(i)}
                  className="text-[10px] text-primary-light hover:text-primary transition-colors font-semibold">
                  {item.note === undefined ? '+ Add note' : '− Remove note'}
                </button>
              </div>
            ))}
          </div>

          <button onClick={addItem}
            className="mt-3 flex items-center gap-2 px-4 py-2 bg-white border border-dashed border-slate-300 text-slate-500 text-xs font-semibold rounded-xl hover:border-primary-light hover:text-primary transition-colors w-full justify-center">
            <Plus className="w-3.5 h-3.5" />Add Item
          </button>
        </div>

        {/* General note */}
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
            General Note (optional)
          </label>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={2}
            placeholder="Any additional context for the foreman..."
            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-light placeholder:text-slate-300 resize-none"
          />
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 px-6 py-4 bg-white border-t border-slate-100 flex items-center justify-between">
        <span className="text-xs text-slate-400">{items.filter(i => i.item_name.trim()).length} item{items.filter(i => i.item_name.trim()).length !== 1 ? 's' : ''}</span>
        <button onClick={handleSubmit} disabled={saving}
          className="flex items-center gap-2 px-6 py-2.5 bg-primary text-white text-sm font-bold rounded-xl hover:bg-primary-dark transition-colors disabled:opacity-60">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4" />Submit Request</>}
        </button>
      </div>
      </>)}
    </div>
  )
}
