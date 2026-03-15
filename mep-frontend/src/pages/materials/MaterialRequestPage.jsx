import { useState, useEffect, useRef } from 'react'
import api from '@/lib/api'
import {
  Package, Plus, X, Send, Loader2, Check,
  AlertCircle, Trash2, ChevronDown
} from 'lucide-react'

const UNITS = ['pcs', 'm', 'ft', 'kg', 'lb', 'box', 'roll', 'bag', 'set', 'pair', 'L', 'gal']

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
        } catch (_) {}
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
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder:text-slate-300"
        />
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
            {suggestions.map((s, i) => (
              <button key={i} onMouseDown={() => selectSuggestion(s)}
                className="w-full flex items-center justify-between px-3 py-2 hover:bg-indigo-50 transition-colors text-left">
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
            className="w-full px-3 py-1.5 border border-slate-100 rounded-lg text-xs mt-1 focus:outline-none focus:ring-1 focus:ring-indigo-300 placeholder:text-slate-300 bg-slate-50"
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
        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 text-center"
      />
      {/* Unit */}
      <div className="relative">
        <select
          value={item.unit}
          onChange={e => onChange(index, 'unit', e.target.value)}
          className="w-full px-2 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 appearance-none pr-6"
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
  const [projects, setProjects]     = useState([])
  const [selectedProj, setSelectedProj] = useState('')
  const [items, setItems]           = useState([{ item_name: '', quantity: '', unit: 'pcs', note: undefined }])
  const [note, setNote]             = useState('')
  const [saving, setSaving]         = useState(false)
  const [success, setSuccess]       = useState(false)
  const [error, setError]           = useState('')
  const [showNotes, setShowNotes]   = useState(false)

  useEffect(() => {
    api.get('/projects?status=ACTIVE')
      .then(r => {
        const list = r.data.projects || r.data.rows || []
        setProjects(list)
        if (list.length) setSelectedProj(String(list[0].id))
      })
      .catch(() => {})
  }, [])

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
      <button onClick={handleReset}
        className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 transition-colors">
        New Request
      </button>
    </div>
  )

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">

      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center">
            <Package className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Material Request</h1>
            <p className="text-xs text-slate-400 mt-0.5">Request materials for your project</p>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

        {/* Project */}
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Project</label>
          <select value={selectedProj} onChange={e => setSelectedProj(e.target.value)}
            className="w-full max-w-sm px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400">
            <option value="">Select project...</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>
                {p.project_code}{p.project_name ? ` — ${p.project_name}` : ''}
              </option>
            ))}
          </select>
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
                  className="text-[10px] text-indigo-400 hover:text-indigo-600 transition-colors font-semibold">
                  {item.note === undefined ? '+ Add note' : '− Remove note'}
                </button>
              </div>
            ))}
          </div>

          <button onClick={addItem}
            className="mt-3 flex items-center gap-2 px-4 py-2 bg-white border border-dashed border-slate-300 text-slate-500 text-xs font-semibold rounded-xl hover:border-indigo-400 hover:text-indigo-600 transition-colors w-full justify-center">
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
            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder:text-slate-300 resize-none"
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
          className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-60">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4" />Submit Request</>}
        </button>
      </div>
    </div>
  )
}
