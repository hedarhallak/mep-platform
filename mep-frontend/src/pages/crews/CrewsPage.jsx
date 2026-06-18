// src/pages/crews/CrewsPage.jsx
//
// Assignments Phase 2 — CREWS Slice 3 (DECISIONS §131.2 / §146). The
// crews-management UI: list crews + create/edit (name, foreman, members,
// optional trade) + delete. Backend is routes/crews.js (CRUD), gated by the
// existing `assignments.*` permission module (no new permission seeding).
//
// Roster editing reuses the shared WorkerPicker (foreman = single, members =
// multi). The employees list comes from /hub/workers (the same source the
// Task-Request + Assignments pickers use): { id, first_name, last_name,
// username, trade_name }. The crews API returns members as { employee_id,
// full_name, ... }, so on edit we map employee_id → the worker object by id.

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import api from '@/lib/api'
import { usePermissions } from '@/hooks/usePermissions.jsx'
import WorkerPicker, { WorkerAvatar, workerName } from '@/components/shared/WorkerPicker'
import { TRADES, tradeBadge } from '@/constants/trades'
import {
  HardHat, Plus, X, Check, Loader2, AlertCircle, Edit2, Trash2, Search, UserCog, Users,
  CheckSquare, Square,
} from 'lucide-react'

// Browsable, trade-filterable multi-select for building a whole roster fast.
// Unlike the type-to-search WorkerPicker (great for one person), this lets you
// filter by trade and "Select all" — e.g. add every plumber in one click.
function MemberSelector({ workers, value, onChange }) {
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

function CrewModal({ crew, workers, onClose, onSaved }) {
  const { t } = useTranslation()
  const isEdit = !!crew?.id

  const [name, setName] = useState(crew?.name || '')
  const [tradeCode, setTradeCode] = useState(crew?.trade_code || 'ALL')
  const [foreman, setForeman] = useState(null) // worker obj | null
  const [members, setMembers] = useState([]) // worker obj[]
  const [loadingRoster, setLoadingRoster] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const byId = (id) => workers.find((w) => Number(w.id) === Number(id)) || null

  // On edit the list row only carries member_count — fetch the full roster.
  useEffect(() => {
    if (!isEdit) return
    let alive = true
    ;(async () => {
      try {
        const r = await api.get(`/crews/${crew.id}`)
        if (!alive) return
        const c = r.data.crew
        setForeman(c.foreman_employee_id != null ? byId(c.foreman_employee_id) : null)
        setMembers((c.members || []).map((m) => byId(m.employee_id)).filter(Boolean))
      } catch (e) {
        if (alive) setError(e.response?.data?.message || e.message)
      } finally {
        if (alive) setLoadingRoster(false)
      }
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, crew?.id, workers])

  const handleSave = async () => {
    setError('')
    if (!name.trim()) return setError(t('crews.modal.errors.nameRequired'))
    setSaving(true)
    const payload = {
      name: name.trim(),
      foreman_employee_id: foreman?.id || null,
      trade_code: tradeCode === 'ALL' ? null : tradeCode,
      member_ids: members.map((w) => w.id),
    }
    try {
      if (isEdit) await api.patch(`/crews/${crew.id}`, payload)
      else await api.post('/crews', payload)
      onSaved()
    } catch (e) {
      if (e.response?.data?.error === 'NAME_TAKEN') setError(t('crews.modal.errors.nameTaken'))
      else setError(e.response?.data?.message || e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HardHat className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold text-slate-800">
              {isEdit ? t('crews.modal.titleEdit') : t('crews.modal.titleNew')}
            </h3>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4 max-h-[65vh] overflow-y-auto">
          {/* Name */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
              {t('crews.modal.name')}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('crews.modal.namePlaceholder')}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-light placeholder:text-slate-300"
            />
          </div>

          {/* Trade (optional) */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
              {t('crews.modal.trade')}
            </label>
            <div className="flex flex-wrap gap-2">
              {TRADES.map((tr) => (
                <button
                  key={tr.value}
                  onClick={() => setTradeCode(tr.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                    tradeCode === tr.value
                      ? 'bg-primary text-white border-primary'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {t(tr.labelKey)}
                </button>
              ))}
            </div>
          </div>

          {loadingRoster ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
            </div>
          ) : (
            <>
              {/* Foreman */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                  {t('crews.modal.foreman')}
                </label>
                <WorkerPicker
                  mode="single"
                  workers={workers}
                  value={foreman}
                  onChange={setForeman}
                  placeholder={t('crews.modal.foremanPlaceholder')}
                />
              </div>

              {/* Members */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                  {t('crews.modal.members')}
                </label>
                <MemberSelector workers={workers} value={members} onChange={setMembers} />
              </div>
            </>
          )}

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors"
          >
            {t('crews.modal.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loadingRoster}
            className="flex items-center gap-2 px-5 py-2 bg-primary text-white text-xs font-bold rounded-xl hover:bg-primary-dark disabled:opacity-60 transition-colors"
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <>
                <Check className="w-3.5 h-3.5" />
                {isEdit ? t('crews.modal.update') : t('crews.modal.add')}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function CrewsPage() {
  const { t } = useTranslation()
  const { can } = usePermissions()
  const [crews, setCrews] = useState([])
  const [workers, setWorkers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(null) // null | 'new' | crew obj
  const [deleting, setDeleting] = useState(null)
  const [successMsg, setSuccessMsg] = useState('')

  const canCreate = can('assignments', 'create')
  const canEdit = can('assignments', 'edit')

  const fetchCrews = async () => {
    setLoading(true)
    try {
      const r = await api.get('/crews')
      setCrews(r.data.crews || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCrews()
    api
      .get('/hub/workers')
      .then((r) => setWorkers(r.data.workers || []))
      .catch(() => {})
  }, [])

  const showSuccess = (msg) => {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(''), 3000)
  }

  const handleDelete = async (id) => {
    if (!window.confirm(t('crews.confirmDelete'))) return
    setDeleting(id)
    try {
      await api.delete(`/crews/${id}`)
      showSuccess(t('crews.successRemoved'))
      fetchCrews()
    } catch (e) {
      alert(e.response?.data?.message || e.message)
    } finally {
      setDeleting(null)
    }
  }

  const filtered = crews.filter(
    (c) => !search || c.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center">
              <HardHat className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">{t('crews.title')}</h1>
              <p className="text-xs text-slate-400 mt-0.5">{t('crews.subtitle')}</p>
            </div>
          </div>
          {canCreate && (
            <button
              onClick={() => setModal('new')}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary-dark transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              {t('crews.addButton')}
            </button>
          )}
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('crews.searchPlaceholder')}
            className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-primary-light placeholder:text-slate-400"
          />
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {successMsg && (
          <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-xs text-emerald-700 font-semibold mb-4">
            <Check className="w-4 h-4 flex-shrink-0" />
            {successMsg}
          </div>
        )}

        {loading && (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <HardHat className="w-10 h-10 text-slate-200 mb-3" />
            <p className="text-sm font-semibold text-slate-400">{t('crews.empty')}</p>
            <p className="text-xs text-slate-300 mt-1">{t('crews.emptyHint')}</p>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="grid grid-cols-1 gap-3 max-w-4xl">
            {filtered.map((c) => (
              <div
                key={c.id}
                className="bg-white rounded-xl border border-slate-200 px-5 py-4 flex items-start gap-4"
              >
                <div className="w-10 h-10 bg-primary-pale rounded-xl flex items-center justify-center flex-shrink-0">
                  <HardHat className="w-5 h-5 text-primary-light" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-slate-800">{c.name}</span>
                    {c.trade_code && (
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${tradeBadge(c.trade_code)}`}
                      >
                        {c.trade_code}
                      </span>
                    )}
                    {!c.is_active && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                        {t('crews.inactive')}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 mt-1.5 flex-wrap">
                    <span className="flex items-center gap-1 text-xs text-slate-500">
                      <UserCog className="w-3 h-3" />
                      {c.foreman_name || t('crews.noForeman')}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-slate-500">
                      <Users className="w-3 h-3" />
                      {t('crews.memberCount', { count: c.member_count || 0 })}
                    </span>
                  </div>
                </div>
                {canEdit && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => setModal(c)}
                      className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary-pale rounded-lg transition-colors"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(c.id)}
                      disabled={deleting === c.id}
                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {deleting === c.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {modal && (
        <CrewModal
          crew={modal === 'new' ? null : modal}
          workers={workers}
          onClose={() => setModal(null)}
          onSaved={() => {
            const wasNew = modal === 'new'
            setModal(null)
            fetchCrews()
            showSuccess(wasNew ? t('crews.successAdded') : t('crews.successUpdated'))
          }}
        />
      )}
    </div>
  )
}
