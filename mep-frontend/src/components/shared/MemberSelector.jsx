// src/components/shared/MemberSelector.jsx
//
// Browsable, trade-filterable multi-select for picking a whole team fast
// (DECISIONS §146.3). Unlike the type-to-search WorkerPicker (great for ONE
// person), this shows the full employee list with checkboxes + a trade filter
// + "Select all" — e.g. filter PLUMBING → Select all → every plumber in one
// click. Used by the Crews roster editor and the Method-4 foreman request
// screen (§147).
//
// Props:
//   workers  — [{ id, first_name, last_name, username, trade_name }]
//   value    — selected worker objects[]
//   onChange — (worker[]) => void

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { WorkerAvatar, workerName } from '@/components/shared/WorkerPicker'
import { Search, CheckSquare, Square } from 'lucide-react'

export default function MemberSelector({ workers = [], value = [], onChange }) {
  const { t } = useTranslation()
  const [q, setQ] = useState('')
  const [trade, setTrade] = useState('ALL')

  const selectedIds = new Set(value.map((w) => w.id))
  const tradesPresent = [...new Set(workers.map((w) => w.trade_name).filter(Boolean))].sort()

  const matches = (w) => {
    const name = `${w.first_name || ''} ${w.last_name || ''} ${w.username || ''}`.toLowerCase()
    const okQ = !q || name.includes(q.toLowerCase())
    const okT = trade === 'ALL' || w.trade_name === trade
    return okQ && okT
  }
  const filtered = workers.filter(matches)
  const allFilteredSelected = filtered.length > 0 && filtered.every((w) => selectedIds.has(w.id))

  const toggle = (w) => {
    if (selectedIds.has(w.id)) onChange(value.filter((x) => x.id !== w.id))
    else onChange([...value, w])
  }
  const toggleAllFiltered = () => {
    if (allFilteredSelected) {
      const rm = new Set(filtered.map((w) => w.id))
      onChange(value.filter((x) => !rm.has(x.id)))
    } else {
      const have = new Set(value.map((w) => w.id))
      onChange([...value, ...filtered.filter((w) => !have.has(w.id))])
    }
  }

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      {/* Search */}
      <div className="relative border-b border-slate-100">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('crews.modal.searchMembers')}
          className="w-full pl-9 pr-3 py-2 text-sm outline-none placeholder:text-slate-300"
        />
      </div>

      {/* Trade filter chips */}
      {tradesPresent.length > 1 && (
        <div className="flex flex-wrap gap-1.5 px-3 py-2 border-b border-slate-100 bg-slate-50">
          <button
            onClick={() => setTrade('ALL')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
              trade === 'ALL' ? 'bg-primary text-white' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            {t('trades.all')}
          </button>
          {tradesPresent.map((tr) => (
            <button
              key={tr}
              onClick={() => setTrade(tr)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                trade === tr ? 'bg-primary text-white' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              {tr}
            </button>
          ))}
        </div>
      )}

      {/* Select-all + count */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
        <button
          onClick={toggleAllFiltered}
          disabled={filtered.length === 0}
          className="flex items-center gap-2 text-xs font-semibold text-primary hover:text-primary-dark disabled:opacity-40"
        >
          {allFilteredSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
          {t('crews.modal.selectAll')}
        </button>
        <span className="text-[11px] font-semibold text-slate-400">
          {t('crews.modal.selectedCount', { count: value.length })}
        </span>
      </div>

      {/* List */}
      <div className="max-h-52 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="text-center text-xs text-slate-400 py-6">{t('crews.modal.noEmployees')}</p>
        ) : (
          filtered.map((w) => {
            const checked = selectedIds.has(w.id)
            return (
              <button
                key={w.id}
                type="button"
                onClick={() => toggle(w)}
                className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-primary-pale ${
                  checked ? 'bg-primary-pale' : ''
                }`}
              >
                {checked ? (
                  <CheckSquare className="w-4 h-4 text-primary flex-shrink-0" />
                ) : (
                  <Square className="w-4 h-4 text-slate-300 flex-shrink-0" />
                )}
                <WorkerAvatar worker={w} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-800 truncate">{workerName(w)}</div>
                  {w.trade_name && <div className="text-[11px] text-slate-400">{w.trade_name}</div>}
                </div>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
