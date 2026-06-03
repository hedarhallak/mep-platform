import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import api from '@/lib/api'
import { usePermissions } from '@/hooks/usePermissions.jsx'
import {
  ReceiptText, Send, Loader2, Check, AlertCircle, RefreshCw, Camera, X,
  ClipboardList, ExternalLink, ThumbsUp, ThumbsDown, Banknote,
} from 'lucide-react'

// Emergency / petty purchase claims page (DECISIONS §126.2 / §129).
// NOT a pre-approval flow: the foreman buys first, then uploads the
// receipt as documentation; accounting reviews after the fact.
// Frontend over /api/expense-claims. Mirrors the Tools/Surplus design.

const STATUS_STYLE = {
  PENDING: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-emerald-100 text-emerald-700',
  REJECTED: 'bg-red-100 text-red-600',
  PAID: 'bg-blue-100 text-blue-700',
}

function formatAmount(cents, currency) {
  const n = Number(cents || 0) / 100
  return `$${n.toFixed(2)}${currency && currency !== 'CAD' ? ` ${currency}` : ''}`
}

// ── Submit tab ────────────────────────────────────────────────
function SubmitTab({ onSubmitted }) {
  const { t } = useTranslation()
  const [todayAssignment, setTodayAssignment] = useState(null)
  const [projects, setProjects] = useState([])
  const [selectedProj, setSelectedProj] = useState('')
  const [vendor, setVendor] = useState('')
  const [vendorSuggestions, setVendorSuggestions] = useState([])
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [receiptFile, setReceiptFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const fileInput = useRef(null)

  useEffect(() => {
    // Same pattern as MaterialRequestPage: a foreman usually has a
    // today-assignment → that project is used directly (no dropdown,
    // and no projects.view permission needed). Fallback for manager
    // roles: load the active projects list.
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
    // Smart vendor recall — previously used vendors as <datalist> suggestions.
    api.get('/expense-claims/vendors')
      .then(r => setVendorSuggestions(r.data.vendors || []))
      .catch(() => {})
  }, [])

  const handleSubmit = async () => {
    setError('')
    if (!selectedProj) return setError(t('expenses.submit.errors.selectProject'))
    if (!vendor.trim()) return setError(t('expenses.submit.errors.vendor'))
    const cents = Math.round(parseFloat(amount) * 100)
    if (!Number.isFinite(cents) || cents <= 0) return setError(t('expenses.submit.errors.amount'))

    setSaving(true)
    try {
      // 1. Upload the receipt photo first (if attached) → receipt_url.
      let receiptUrl
      if (receiptFile) {
        const form = new FormData()
        form.append('receipt', receiptFile)
        const up = await api.post('/expense-claims/receipt', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        receiptUrl = up.data.receipt_url
      }
      // 2. Submit the claim.
      await api.post('/expense-claims', {
        project_id: Number(selectedProj),
        vendor: vendor.trim(),
        amount_cents: cents,
        description: description.trim() || undefined,
        receipt_url: receiptUrl,
      })
      setVendor('')
      setAmount('')
      setDescription('')
      setReceiptFile(null)
      if (fileInput.current) fileInput.current.value = ''
      onSubmitted()
    } catch (e) {
      setError(e.response?.data?.error || e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5 max-w-xl">
      {/* Project — today's assignment when present, else dropdown */}
      <div>
        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">{t('expenses.submit.project')}</label>
        {todayAssignment ? (
          <div className="flex items-center gap-3 px-4 py-3 bg-primary-pale border border-primary-pale rounded-xl max-w-sm">
            <div className="w-2 h-2 rounded-full bg-primary-light flex-shrink-0" />
            <div>
              <div className="text-sm font-bold text-primary-dark">
                {todayAssignment.project_code}{todayAssignment.project_name ? ` — ${todayAssignment.project_name}` : ''}
              </div>
              <div className="text-[10px] text-primary-light mt-0.5">{t('expenses.submit.todayAssignment')}</div>
            </div>
          </div>
        ) : (
          <select value={selectedProj} onChange={e => setSelectedProj(e.target.value)}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-light">
            <option value="">{t('expenses.submit.selectProject')}</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.project_code}{p.project_name ? ` — ${p.project_name}` : ''}</option>
            ))}
          </select>
        )}
      </div>

      {/* Vendor + amount */}
      <div className="grid grid-cols-[1fr_140px] gap-2">
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">{t('expenses.submit.vendor')}</label>
          <input type="text" value={vendor} onChange={e => setVendor(e.target.value)}
            list="vendor-suggestions"
            placeholder={t('expenses.submit.vendorPlaceholder')}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-light placeholder:text-slate-300" />
          <datalist id="vendor-suggestions">
            {vendorSuggestions.map(v => <option key={v} value={v} />)}
          </datalist>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">{t('expenses.submit.amount')}</label>
          <input type="number" min="0.01" step="0.01" value={amount}
            onChange={e => setAmount(e.target.value)} placeholder="0.00"
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-light text-right placeholder:text-slate-300" />
        </div>
      </div>

      {/* Receipt photo */}
      <div>
        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">{t('expenses.submit.receipt')}</label>
        <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
          onChange={e => setReceiptFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)} />
        {receiptFile ? (
          <div className="flex items-center gap-2 px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm">
            <Camera className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <span className="truncate text-slate-600">{receiptFile.name}</span>
            <button onClick={() => { setReceiptFile(null); if (fileInput.current) fileInput.current.value = '' }}
              className="ml-auto p-1 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button onClick={() => fileInput.current && fileInput.current.click()}
            className="w-full flex items-center justify-center gap-2 px-3 py-3 border-2 border-dashed border-slate-200 rounded-xl text-xs font-semibold text-slate-400 hover:border-primary-light hover:text-primary transition-colors">
            <Camera className="w-4 h-4" />{t('expenses.submit.attachReceipt')}
          </button>
        )}
        <p className="text-[10px] text-slate-300 mt-1">{t('expenses.submit.receiptHint')}</p>
      </div>

      {/* Description */}
      <div>
        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">{t('expenses.submit.description')}</label>
        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
          placeholder={t('expenses.submit.descriptionPlaceholder')}
          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-light placeholder:text-slate-300 resize-none" />
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
        </div>
      )}

      <button onClick={handleSubmit} disabled={saving}
        className="flex items-center gap-2 px-6 py-2.5 bg-primary text-white text-sm font-bold rounded-xl hover:bg-primary-dark transition-colors disabled:opacity-60">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4" />{t('expenses.submit.submit')}</>}
      </button>
    </div>
  )
}

// ── Claims tab ────────────────────────────────────────────────
function ClaimsTab({ canApprove }) {
  const { t } = useTranslation()
  const [claims, setClaims] = useState([])
  const [projects, setProjects] = useState({})
  const [loading, setLoading] = useState(true)
  const [actingId, setActingId] = useState(null)
  const [rejectingId, setRejectingId] = useState(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')

  const fetchClaims = async () => {
    setLoading(true)
    try {
      const r = await api.get('/expense-claims')
      setClaims(r.data.claims || [])
    } catch (e) { console.error('Failed to load expense claims:', e) }
    finally { setLoading(false) }
  }

  useEffect(() => {
    fetchClaims()
    // Map project_id → code for display (the list endpoint returns raw ids).
    api.get('/projects')
      .then(r => {
        const list = r.data.projects || r.data.rows || []
        const map = {}
        list.forEach(p => { map[p.id] = p.project_code || `#${p.id}` })
        setProjects(map)
      })
      .catch(() => {})
  }, [])

  const transition = async (id, status, rejection_reason) => {
    setError('')
    setActingId(id)
    try {
      await api.patch(`/expense-claims/${id}/status`, { status, rejection_reason })
      setRejectingId(null)
      setReason('')
      await fetchClaims()
    } catch (e) {
      setError(e.response?.data?.error || e.message)
    } finally {
      setActingId(null)
    }
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={fetchClaims} className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
        <span className="text-xs text-slate-400 ml-auto">{t('expenses.claims.count', { count: claims.length })}</span>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
        </div>
      )}

      {claims.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <ClipboardList className="w-10 h-10 text-slate-200 mb-3" />
          <p className="text-sm font-semibold text-slate-400">{t('expenses.claims.empty')}</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 py-2.5">{t('expenses.claims.th.date')}</th>
                <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 py-2.5">{t('expenses.claims.th.vendor')}</th>
                <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 py-2.5">{t('expenses.claims.th.project')}</th>
                <th className="text-right text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 py-2.5">{t('expenses.claims.th.amount')}</th>
                <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 py-2.5">{t('expenses.claims.th.status')}</th>
                <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 py-2.5">{t('expenses.claims.th.receipt')}</th>
                {canApprove && <th className="px-4 py-2.5" />}
              </tr>
            </thead>
            <tbody>
              {claims.map(c => (
                <tr key={c.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60 transition-colors align-top">
                  <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{new Date(c.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-sm font-medium text-slate-700">
                    {c.vendor}
                    {c.description && <p className="text-[11px] text-slate-400 font-normal mt-0.5 max-w-[220px] truncate">{c.description}</p>}
                    {c.status === 'REJECTED' && c.rejection_reason && (
                      <p className="text-[11px] text-red-500 font-normal mt-0.5 max-w-[220px]">{t('expenses.claims.reason')}: {c.rejection_reason}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{projects[c.project_id] || `#${c.project_id}`}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-slate-700 text-right whitespace-nowrap">{formatAmount(c.amount_cents, c.currency)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_STYLE[c.status] || STATUS_STYLE.PENDING}`}>
                      {t(`expenses.status.${c.status}`)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {c.receipt_url ? (
                      <a href={c.receipt_url} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                        <ExternalLink className="w-3 h-3" />{t('expenses.claims.view')}
                      </a>
                    ) : <span className="text-xs text-slate-300">—</span>}
                  </td>
                  {canApprove && (
                    <td className="px-4 py-3">
                      {c.status === 'PENDING' && rejectingId !== c.id && (
                        <div className="flex items-center gap-1.5 justify-end">
                          <button onClick={() => transition(c.id, 'APPROVED')} disabled={actingId === c.id}
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 text-white text-[11px] font-bold rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-60">
                            {actingId === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <ThumbsUp className="w-3 h-3" />}
                            {t('expenses.actions.approve')}
                          </button>
                          <button onClick={() => { setRejectingId(c.id); setReason('') }} disabled={actingId === c.id}
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-red-200 text-red-600 text-[11px] font-bold rounded-lg hover:bg-red-50 transition-colors">
                            <ThumbsDown className="w-3 h-3" />{t('expenses.actions.reject')}
                          </button>
                        </div>
                      )}
                      {c.status === 'PENDING' && rejectingId === c.id && (
                        <div className="flex items-center gap-1.5 justify-end">
                          <input autoFocus type="text" value={reason} onChange={e => setReason(e.target.value)}
                            placeholder={t('expenses.actions.reasonPlaceholder')}
                            className="w-44 px-2 py-1.5 border border-red-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-red-200 placeholder:text-slate-300" />
                          <button onClick={() => reason.trim() && transition(c.id, 'REJECTED', reason.trim())}
                            disabled={!reason.trim() || actingId === c.id}
                            className="px-2.5 py-1.5 bg-red-600 text-white text-[11px] font-bold rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50">
                            {actingId === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : t('expenses.actions.confirmReject')}
                          </button>
                          <button onClick={() => { setRejectingId(null); setReason('') }}
                            className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                      {c.status === 'APPROVED' && (
                        <div className="flex justify-end">
                          <button onClick={() => transition(c.id, 'PAID')} disabled={actingId === c.id}
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-600 text-white text-[11px] font-bold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60">
                            {actingId === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Banknote className="w-3 h-3" />}
                            {t('expenses.actions.markPaid')}
                          </button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function ExpensesPage() {
  const { t } = useTranslation()
  const { can, loading: permsLoading } = usePermissions()
  const canSubmit = !permsLoading && can('expense_claims', 'submit')
  const canView = !permsLoading && can('expense_claims', 'view')
  const canApprove = !permsLoading && can('expense_claims', 'approve')
  const [tab, setTab] = useState('submit')
  const [flash, setFlash] = useState(false)

  useEffect(() => {
    if (permsLoading) return
    if (!canSubmit && canView) setTab('claims')
  }, [permsLoading, canSubmit, canView])

  const handleSubmitted = () => {
    setFlash(true)
    setTimeout(() => setFlash(false), 4000)
  }

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center">
            <ReceiptText className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">{t('expenses.title')}</h1>
            <p className="text-xs text-slate-400 mt-0.5">{t('expenses.subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {canSubmit && (
            <button onClick={() => setTab('submit')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${tab === 'submit' ? 'bg-primary text-white' : 'text-slate-500 hover:bg-slate-100'}`}>
              <Send className="w-3.5 h-3.5" />{t('expenses.tabs.submit')}
            </button>
          )}
          {canView && (
            <button onClick={() => setTab('claims')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${tab === 'claims' ? 'bg-primary text-white' : 'text-slate-500 hover:bg-slate-100'}`}>
              <ClipboardList className="w-3.5 h-3.5" />{t('expenses.tabs.claims')}
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {flash && (
          <div className="mb-4 flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-xs text-emerald-700">
            <Check className="w-4 h-4 flex-shrink-0" />{t('expenses.submit.success')}
          </div>
        )}
        {tab === 'submit' && canSubmit && <SubmitTab onSubmitted={handleSubmitted} />}
        {tab === 'claims' && canView && <ClaimsTab canApprove={canApprove} />}
      </div>
    </div>
  )
}
