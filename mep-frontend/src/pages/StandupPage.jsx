import { useState, useEffect, useRef } from 'react'
import api from '@/lib/api'
import {
  ClipboardList, Users, Package, Check, Plus, Trash2,
  Loader2, AlertCircle, ChevronDown, ChevronRight,
  CheckCircle2, RefreshCw, Edit2, X
} from 'lucide-react'

const UNITS = ['pcs', 'm', 'ft', 'kg', 'lb', 'box', 'roll', 'bag', 'set', 'L', 'gal']

const TRADE_COLORS = {
  PLUMBING:   'bg-sky-500',
  ELECTRICAL: 'bg-amber-500',
  HVAC:       'bg-emerald-500',
  CARPENTRY:  'bg-orange-500',
  GENERAL:    'bg-slate-400',
}

function Avatar({ name, trade }) {
  const color = TRADE_COLORS[(trade || '').toUpperCase()] || 'bg-indigo-500'
  return (
    <div className={`w-8 h-8 rounded-full ${color} flex items-center justify-center text-xs font-bold text-white flex-shrink-0`}>
      {name?.[0]?.toUpperCase() || '?'}
    </div>
  )
}

// ── Item Row (edit existing item) ─────────────────────────────
function ItemRow({ item, requestId, onUpdate, onDelete }) {
  const [editing, setEditing]   = useState(false)
  const [qty, setQty]           = useState(String(item.quantity))
  const [unit, setUnit]         = useState(item.unit)
  const [saving, setSaving]     = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleSave = async () => {
    const n = Math.floor(Number(qty))
    if (!n || n < 1) return
    setSaving(true)
    try {
      const r = await api.patch(`/standup/materials/${requestId}/items/${item.id}`, { quantity: n, unit })
      onUpdate(r.data.item)
      setEditing(false)
    } catch (_) {}
    finally { setSaving(false) }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await api.delete(`/standup/materials/${requestId}/items/${item.id}`)
      onDelete(item.id)
    } catch (_) {}
    finally { setDeleting(false) }
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 last:border-0 group">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-slate-800">{item.item_name}</div>
        {item.note && <div className="text-xs text-slate-400 mt-0.5">{item.note}</div>}
      </div>

      {editing ? (
        <div className="flex items-center gap-2">
          <input
            type="number" min="1" step="1" value={qty}
            onChange={e => setQty(e.target.value.replace(/[^0-9]/g, ''))}
            className="w-20 px-2 py-1 border border-slate-200 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <select value={unit} onChange={e => setUnit(e.target.value)}
            className="px-2 py-1 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400">
            {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
          <button onClick={handleSave} disabled={saving}
            className="p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
          </button>
          <button onClick={() => setEditing(false)}
            className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg">
            <X size={13} />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-indigo-600">{item.quantity}</span>
          <span className="text-xs text-slate-400">{item.unit}</span>
          <button onClick={() => setEditing(true)}
            className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all">
            <Edit2 size={13} />
          </button>
          <button onClick={handleDelete} disabled={deleting}
            className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all">
            {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Add Item Form ─────────────────────────────────────────────
function AddItemForm({ requestId, onAdded }) {
  const [show, setShow]           = useState(false)
  const [name, setName]           = useState('')
  const [qty, setQty]             = useState('')
  const [unit, setUnit]           = useState('pcs')
  const [note, setNote]           = useState('')
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [showSug, setShowSug]     = useState(false)
  const debounceRef               = useRef(null)

  const handleNameChange = (val) => {
    setName(val)
    clearTimeout(debounceRef.current)
    if (val.length >= 2) {
      debounceRef.current = setTimeout(async () => {
        try {
          const r = await api.get(`/materials/catalog?q=${encodeURIComponent(val)}`)
          setSuggestions(r.data.items || [])
          setShowSug(true)
        } catch (_) {}
      }, 300)
    } else {
      setSuggestions([])
      setShowSug(false)
    }
  }

  const selectSuggestion = (s) => {
    setName(s.item_name)
    setUnit(s.default_unit || 'pcs')
    setSuggestions([])
    setShowSug(false)
  }

  const handleAdd = async () => {
    setError('')
    if (!name.trim())            return setError('Item name required')
    const n = Math.floor(Number(qty))
    if (!qty || n < 1)           return setError('Quantity must be at least 1')
    setSaving(true)
    try {
      const r = await api.post(`/standup/materials/${requestId}/items`, {
        item_name: name.trim(), quantity: n, unit, note: note.trim() || null
      })
      onAdded(r.data.item)
      setName(''); setQty(''); setUnit('pcs'); setNote('')
      setShow(false)
    } catch (_) { setError('Failed to add item') }
    finally { setSaving(false) }
  }

  if (!show) return (
    <button onClick={() => setShow(true)}
      className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-indigo-600 hover:bg-indigo-50 transition-colors border-t border-slate-100">
      <Plus size={15} />Add item
    </button>
  )

  return (
    <div className="px-4 py-3 border-t border-slate-100 bg-slate-50 space-y-2">

      {/* Name with autocomplete */}
      <div className="relative">
        <input
          type="text"
          value={name}
          onChange={e => handleNameChange(e.target.value)}
          onBlur={() => setTimeout(() => setShowSug(false), 150)}
          onFocus={() => name.length >= 2 && suggestions.length && setShowSug(true)}
          placeholder="e.g. Copper pipe 3/4 inch"
          autoFocus
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder:text-slate-300"
        />
        {showSug && suggestions.length > 0 && (
          <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
            {suggestions.map((s, i) => (
              <button key={i} onMouseDown={() => selectSuggestion(s)}
                className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-indigo-50 text-left transition-colors">
                <span className="text-sm text-slate-700">{s.item_name}</span>
                <span className="text-[10px] text-slate-400 ml-2 flex-shrink-0">
                  {s.default_unit} · used {s.use_count}×
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Qty + Unit — integer only */}
      <div className="flex gap-2">
        <input
          type="number"
          min="1"
          step="1"
          value={qty}
          onChange={e => setQty(e.target.value.replace(/[^0-9]/g, ''))}
          placeholder="Qty *"
          className="w-24 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        <select value={unit} onChange={e => setUnit(e.target.value)}
          className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400">
          {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
      </div>

      <input
        type="text" value={note} onChange={e => setNote(e.target.value)}
        placeholder="Note (optional)"
        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
      />

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex gap-2">
        <button onClick={() => { setShow(false); setError('') }}
          className="flex-1 px-3 py-2 text-sm text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-100">
          Cancel
        </button>
        <button onClick={handleAdd} disabled={saving}
          className="flex-1 px-3 py-2 text-sm font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-1.5">
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}Add
        </button>
      </div>
    </div>
  )
}

// ── Project Standup Card ──────────────────────────────────────
function ProjectStandupCard({ project, onComplete }) {
  const [expanded, setExpanded]     = useState(true)
  const [matRequest, setMatRequest] = useState(project.material_request)
  const [session, setSession]       = useState(project.session)
  const [loading, setLoading]       = useState(false)
  const [completing, setCompleting] = useState(false)
  const [note, setNote]             = useState('')
  const [showNote, setShowNote]     = useState(false)

  const isCompleted = session?.status === 'COMPLETED'

  const ensureRequest = async () => {
    if (matRequest) return matRequest
    setLoading(true)
    try {
      const r = await api.get(`/standup/materials/${project.id}`)
      setMatRequest(r.data.request)
      return r.data.request
    } catch (_) { return null }
    finally { setLoading(false) }
  }

  const ensureSession = async () => {
    if (session) return session
    try {
      const r = await api.post('/standup/session', { project_id: project.id })
      setSession(r.data.session)
      return r.data.session
    } catch (_) { return null }
  }

  const handleOpenMaterials = async () => {
    await ensureSession()
    await ensureRequest()
  }

  const handleComplete = async () => {
    setCompleting(true)
    try {
      const s = await ensureSession()
      if (!s) return
      const r = await api.post(`/standup/session/${s.id}/complete`, { note })
      setSession(r.data.session)
      setShowNote(false)
      onComplete?.(project.id)
    } catch (_) {}
    finally { setCompleting(false) }
  }

  const updateItem = (updated) => {
    setMatRequest(prev => ({
      ...prev,
      items: (prev.items || []).map(it => it.id === updated.id ? updated : it)
    }))
  }

  const deleteItem = (id) => {
    setMatRequest(prev => ({
      ...prev,
      items: (prev.items || []).filter(it => it.id !== id)
    }))
  }

  const addItem = (item) => {
    setMatRequest(prev => ({
      ...prev,
      items: [...(prev.items || []), item]
    }))
  }

  return (
    <div className={`bg-white rounded-xl border overflow-hidden shadow-sm ${
      isCompleted ? 'border-emerald-200' : 'border-slate-200'
    }`}>
      {/* Header */}
      <button onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-slate-50 transition-colors">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
          isCompleted ? 'bg-emerald-100' : 'bg-indigo-100'
        }`}>
          {isCompleted
            ? <CheckCircle2 size={20} className="text-emerald-600" />
            : <ClipboardList size={20} className="text-indigo-600" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-slate-800">{project.project_code}</span>
            {project.project_name && <span className="text-xs text-slate-400">— {project.project_name}</span>}
          </div>
          <div className="text-xs text-slate-400 mt-0.5">
            {project.team.length} worker{project.team.length !== 1 ? 's' : ''} tomorrow
            {isCompleted && <span className="ml-2 text-emerald-600 font-semibold">✓ Reviewed</span>}
          </div>
        </div>
        {expanded
          ? <ChevronDown size={16} className="text-slate-400" />
          : <ChevronRight size={16} className="text-slate-400" />}
      </button>

      {expanded && (
        <div className="border-t border-slate-100 divide-y divide-slate-100">

          {/* Team */}
          <div className="px-5 py-4">
            <div className="flex items-center gap-2 mb-3">
              <Users size={14} className="text-slate-400" />
              <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Team Tomorrow</span>
            </div>
            {project.team.length === 0
              ? <p className="text-sm text-slate-400 italic">No workers assigned yet</p>
              : (
                <div className="flex flex-wrap gap-2">
                  {project.team.map(w => {
                    const name = `${w.first_name} ${w.last_name}`
                    return (
                      <div key={w.employee_id} className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg">
                        <Avatar name={name} trade={w.trade_code} />
                        <div>
                          <div className="text-xs font-semibold text-slate-700">{name}</div>
                          <div className="text-[10px] text-slate-400">
                            {w.trade_name || '—'}{w.shift ? ` · ${w.shift}` : ''}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            }
          </div>

          {/* Materials */}
          <div className="px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Package size={14} className="text-slate-400" />
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Materials for Tomorrow</span>
              </div>
              {!matRequest && !loading && (
                <button onClick={handleOpenMaterials}
                  className="text-xs text-indigo-600 hover:underline font-medium">
                  + Add materials
                </button>
              )}
            </div>

            {loading && (
              <div className="flex justify-center py-4">
                <Loader2 size={18} className="animate-spin text-slate-300" />
              </div>
            )}

            {!loading && !matRequest && (
              <p className="text-sm text-slate-400 italic">No material request yet for tomorrow</p>
            )}

            {!loading && matRequest && (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                {(matRequest.items || []).length === 0
                  ? <p className="text-sm text-slate-400 italic px-4 py-3">No items — add what you need</p>
                  : (matRequest.items || []).map(item => (
                      <ItemRow
                        key={item.id}
                        item={item}
                        requestId={matRequest.id}
                        onUpdate={updateItem}
                        onDelete={deleteItem}
                      />
                    ))
                }
                {!isCompleted && (
                  <AddItemForm requestId={matRequest.id} onAdded={addItem} />
                )}
              </div>
            )}
          </div>

          {/* Mark as Reviewed */}
          {!isCompleted && (
            <div className="px-5 py-4 bg-slate-50">
              {showNote ? (
                <div className="space-y-2">
                  <textarea
                    value={note} onChange={e => setNote(e.target.value)}
                    rows={2} placeholder="Any notes or blockers? (optional)"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none"
                  />
                  <div className="flex gap-2">
                    <button onClick={() => setShowNote(false)}
                      className="flex-1 px-4 py-2 text-sm text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-100">
                      Cancel
                    </button>
                    <button onClick={handleComplete} disabled={completing}
                      className="flex-1 px-4 py-2 text-sm font-bold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2">
                      {completing ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                      Complete Standup
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setShowNote(true)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold transition-colors">
                  <CheckCircle2 size={16} />
                  Mark as Reviewed
                </button>
              )}
            </div>
          )}

          {isCompleted && session?.note && (
            <div className="px-5 py-3 bg-emerald-50 text-sm text-emerald-700">
              📝 {session.note}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────
export default function StandupPage() {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  const fetchData = async () => {
    setLoading(true); setError('')
    try {
      const r = await api.get('/standup/tomorrow')
      setData(r.data)
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load standup data')
    } finally { setLoading(false) }
  }

  useEffect(() => { fetchData() }, [])

  const completedCount = data?.projects.filter(p => p.session?.status === 'COMPLETED').length || 0
  const totalCount     = data?.projects.length || 0

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-50">

      {/* Header */}
      <div className="flex-shrink-0 bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center">
              <ClipboardList size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Daily Standup</h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Review tomorrow's plan —{' '}
                <span className="font-semibold text-slate-600">
                  {data?.date
                    ? new Date(data.date + 'T00:00:00').toLocaleDateString('en-CA', {
                        weekday: 'long', month: 'long', day: 'numeric'
                      })
                    : '—'}
                </span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {totalCount > 0 && (
              <div className="text-right">
                <div className="text-sm font-bold text-slate-700">{completedCount}/{totalCount}</div>
                <div className="text-xs text-slate-400">reviewed</div>
              </div>
            )}
            <button onClick={fetchData} disabled={loading}
              className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors">
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Progress bar */}
        {totalCount > 0 && (
          <div className="mt-3 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-500"
              style={{ width: `${(completedCount / totalCount) * 100}%` }}
            />
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {loading && (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 size={28} className="animate-spin text-slate-300 mb-3" />
            <p className="text-sm text-slate-400">Loading tomorrow's plan...</p>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
            <AlertCircle size={16} />{error}
          </div>
        )}

        {!loading && !error && totalCount === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <ClipboardList size={40} className="text-slate-200 mb-3" />
            <p className="text-sm font-semibold text-slate-400">No projects scheduled for tomorrow</p>
            <p className="text-xs text-slate-300 mt-1">Assignments for tomorrow will appear here</p>
          </div>
        )}

        {!loading && !error && (
          <div className="space-y-4 max-w-3xl">
            {(data?.projects || []).map(project => (
              <ProjectStandupCard
                key={project.id}
                project={project}
                onComplete={() => fetchData()}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
