import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import api from '@/lib/api'
import { ShieldAlert, Loader2, AlertCircle, ArrowRight } from 'lucide-react'

// §132 / §140 Slice 2c — OWNER-only sensitive-edit audit viewer. Consumes
// GET /api/permissions/owner-audit (gated by audit.view → OWNER + SUPER_ADMIN).
// Surfaces the high-risk old→new diffs (project address/location/sector,
// assignment shift/date/project moves, attendance edits, company settings) so
// the owner can detect tampering. The backend already filters to the sensitive
// action set; here we render the per-field old→new changes.

// Noise keys that change on every write and aren't meaningful to the owner.
const HIDDEN_KEYS = new Set(['updated_at', 'created_at', 'id', 'company_id'])

// Diff two snapshots (either may be null) → list of changed fields.
function diffFields(oldV, newV) {
  const out = []
  const o = oldV || {}
  const n = newV || {}
  const keys = new Set([...Object.keys(o), ...Object.keys(n)])
  for (const k of keys) {
    if (HIDDEN_KEYS.has(k)) continue
    if (JSON.stringify(o[k]) !== JSON.stringify(n[k])) {
      out.push({ key: k, from: o[k], to: n[k] })
    }
  }
  return out
}

function fmtVal(v) {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

export default function OwnerAuditPage() {
  const { t } = useTranslation()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .get('/permissions/owner-audit')
      .then((r) => setRows(r.data.audit || []))
      .catch(() => setError(t('ownerAudit.loadError')))
      .finally(() => setLoading(false))
  }, [t])

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2 text-slate-500">
        <Loader2 className="animate-spin" size={18} />
        {t('ownerAudit.loading')}
      </div>
    )
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-2 mb-1">
        <ShieldAlert className="text-amber-600" size={22} />
        <h1 className="text-2xl font-bold">{t('ownerAudit.title')}</h1>
      </div>
      <p className="text-sm text-slate-500 mb-5">{t('ownerAudit.subtitle')}</p>

      {error && (
        <div className="mb-4 flex items-center gap-2 text-sm text-red-600">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {!error && rows.length === 0 && (
        <div className="text-sm text-slate-500">{t('ownerAudit.empty')}</div>
      )}

      <div className="space-y-3">
        {rows.map((row) => {
          const changes = diffFields(row.old_values, row.new_values)
          return (
            <div key={row.id} className="border border-slate-200 rounded-lg p-4 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div className="font-semibold text-slate-800">
                  {row.action}
                  {row.entity_name ? ` — ${row.entity_name}` : ''}
                </div>
                <div className="text-xs text-slate-500">
                  {new Date(row.created_at).toLocaleString()} · {row.changed_by || '—'} (
                  {row.changer_role || '—'})
                </div>
              </div>
              {changes.length === 0 ? (
                <div className="text-xs text-slate-400">{t('ownerAudit.noFieldDiff')}</div>
              ) : (
                <ul className="space-y-1">
                  {changes.map((c) => (
                    <li key={c.key} className="text-sm flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">
                        {c.key}
                      </span>
                      <span className="text-red-600 line-through">{fmtVal(c.from)}</span>
                      <ArrowRight size={14} className="text-slate-400" />
                      <span className="text-green-700 font-medium">{fmtVal(c.to)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
