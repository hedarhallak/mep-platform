// src/components/shared/WorkerPicker.jsx
//
// Unified employee/worker autocomplete picker
// Used across: Task Request (multi), Assignments (single), and future pages
//
// Props:
//   mode       — 'single' | 'multi' (default: 'multi')
//   workers    — array of { id, first_name, last_name, username, trade_name, is_assigned? }
//   value      — selected worker(s): object (single) | array (multi)
//   onChange   — (value) => void
//   placeholder — string (optional)
//   disabled   — bool (optional)

import { useState, useRef, useEffect } from 'react'
import { X, Check } from 'lucide-react'

const AVATAR_COLORS = [
  'bg-indigo-500','bg-emerald-500','bg-amber-500',
  'bg-rose-500','bg-violet-500','bg-cyan-500','bg-sky-500','bg-orange-500'
]

export function workerName(w) {
  return w?.first_name ? `${w.first_name} ${w.last_name}`.trim() : (w?.username || '?')
}

export function workerInitial(w) {
  return workerName(w)[0]?.toUpperCase() || '?'
}

export function workerAvatarColor(w) {
  const n = workerName(w)
  return AVATAR_COLORS[(n.charCodeAt(0) || 0) % AVATAR_COLORS.length]
}

// ── Avatar ────────────────────────────────────────────────────
export function WorkerAvatar({ worker, size = 'sm', className = '' }) {
  const sz = size === 'sm' ? 'w-7 h-7 text-xs' : size === 'md' ? 'w-8 h-8 text-sm' : 'w-10 h-10 text-sm'
  return (
    <div className={`${sz} rounded-full flex items-center justify-center font-bold text-white flex-shrink-0 ${workerAvatarColor(worker)} ${className}`}>
      {workerInitial(worker)}
    </div>
  )
}

// ── Worker row — reusable ─────────────────────────────────────
function WorkerRow({ worker, selected, showAssigned, projectSelected, onClick }) {
  const name = workerName(worker)
  return (
    <button
      type="button"
      onMouseDown={onClick}
      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-indigo-50 ${selected ? 'bg-indigo-50' : ''}`}
    >
      <WorkerAvatar worker={worker} size="sm" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-slate-800 truncate">{name}</div>
        <div className="flex items-center gap-1.5 mt-0.5">
          {worker.trade_name && (
            <span className="text-xs text-slate-400">{worker.trade_name}</span>
          )}
          {showAssigned && projectSelected && (
            worker.is_assigned
              ? <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">✓ Assigned</span>
              : <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">⏳ Pending</span>
          )}
        </div>
      </div>
      {selected && <Check size={15} className="text-indigo-600 flex-shrink-0" />}
    </button>
  )
}

// ── Main Component ────────────────────────────────────────────
export default function WorkerPicker({
  mode = 'multi',
  workers = [],
  value,
  onChange,
  placeholder,
  disabled = false,
  showAssigned = false,
  projectSelected = false,
}) {
  const [query, setQuery]   = useState('')
  const [open, setOpen]     = useState(false)
  const [focused, setFocused] = useState(false)
  const inputRef = useRef(null)
  const dropRef  = useRef(null)

  // Normalize value
  const selected    = mode === 'multi' ? (Array.isArray(value) ? value : []) : (value ? [value] : [])
  const selectedIds = selected.map(w => w.id)

  // Suggestions
  const suggestions = query.trim().length >= 1
    ? workers
        .filter(w => {
          if (selectedIds.includes(w.id)) return false
          const n = `${w.first_name||''} ${w.last_name||''} ${w.username||''} ${w.trade_name||''}`.toLowerCase()
          return n.includes(query.toLowerCase())
        })
        .slice(0, 7)
    : []

  const add = (w) => {
    if (mode === 'multi') {
      onChange([...selected, w])
    } else {
      onChange(w)
    }
    setQuery('')
    setOpen(false)
    inputRef.current?.focus()
  }

  const remove = (id) => {
    if (mode === 'multi') {
      onChange(selected.filter(w => w.id !== id))
    } else {
      onChange(null)
    }
  }

  // Close dropdown on outside click
  useEffect(() => {
    const handler = e => { if (!dropRef.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const defaultPlaceholder = mode === 'multi'
    ? 'Type a name to add recipients...'
    : 'Type to search for an employee...'

  return (
    <div ref={dropRef} className="relative">
      {/* Input container */}
      <div
        onClick={() => !disabled && inputRef.current?.focus()}
        className={`min-h-[42px] w-full flex flex-wrap items-center gap-1.5 px-3 py-2 border rounded-xl transition-all cursor-text ${
          disabled
            ? 'bg-slate-50 border-slate-200 cursor-not-allowed opacity-60'
            : focused
              ? 'border-indigo-500 ring-2 ring-indigo-100'
              : 'border-slate-200 hover:border-slate-300'
        }`}
      >
        {/* Chips (multi) or selected name (single) */}
        {mode === 'multi' && selected.map(w => {
          const name = workerName(w)
          return (
            <span key={w.id}
              className={`inline-flex items-center gap-1.5 pl-1.5 pr-1 py-0.5 rounded-full text-xs font-semibold text-white ${workerAvatarColor(w)}`}>
              <span className="w-4 h-4 rounded-full bg-white/30 flex items-center justify-center text-[9px] font-bold">
                {workerInitial(w)}
              </span>
              {name}
              <button
                type="button"
                onClick={e => { e.stopPropagation(); remove(w.id) }}
                className="ml-0.5 w-4 h-4 rounded-full bg-white/20 hover:bg-white/40 flex items-center justify-center transition-colors"
              >
                <X size={9} />
              </button>
            </span>
          )
        })}

        {mode === 'single' && selected.length > 0 && (
          <div className="flex items-center gap-2 flex-1">
            <WorkerAvatar worker={selected[0]} size="sm" />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-semibold text-slate-800 truncate block">{workerName(selected[0])}</span>
              {selected[0].trade_name && <span className="text-xs text-slate-400">{selected[0].trade_name}</span>}
            </div>
            {!disabled && (
              <button type="button" onClick={e => { e.stopPropagation(); remove(selected[0].id) }}
                className="p-1 text-slate-400 hover:text-red-500 rounded-lg flex-shrink-0">
                <X size={14} />
              </button>
            )}
          </div>
        )}

        {/* Input — hidden in single mode when selected */}
        {(mode === 'multi' || selected.length === 0) && (
          <input
            ref={inputRef}
            type="text"
            value={query}
            disabled={disabled}
            onChange={e => { setQuery(e.target.value); setOpen(true) }}
            onFocus={() => { setFocused(true); if (query) setOpen(true) }}
            onBlur={() => setFocused(false)}
            placeholder={selected.length === 0 ? (placeholder || defaultPlaceholder) : ''}
            className="flex-1 min-w-[140px] outline-none text-sm bg-transparent placeholder:text-slate-400"
          />
        )}
      </div>

      {/* Dropdown */}
      {open && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
          {suggestions.map(w => (
            <WorkerRow
              key={w.id}
              worker={w}
              selected={selectedIds.includes(w.id)}
              showAssigned={showAssigned}
              projectSelected={projectSelected}
              onClick={() => add(w)}
            />
          ))}
        </div>
      )}

      {open && query.trim().length >= 1 && suggestions.length === 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg px-4 py-3 text-sm text-slate-400">
          No workers found for "{query}"
        </div>
      )}
    </div>
  )
}
