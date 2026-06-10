// src/admin/SuperAuditPage.jsx
//
// §132.6 layer 6 / §140 Slice 3b (frontend) — Constrai cross-tenant audit
// oversight. Renders GET /api/super/audit: the high-risk + OWNER audit across
// ALL tenants, with company + per-field old→new diff. SUPER_ADMIN only (the
// endpoint is gated server-side; this page lives behind RequireAdminTab).

import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import api from '../lib/api'
import AdminLogoutButton from './AdminLogoutButton.jsx'

const HIDDEN_KEYS = new Set(['updated_at', 'created_at', 'id', 'company_id'])

function diffFields(oldV, newV) {
  const out = []
  const o = oldV || {}
  const n = newV || {}
  const keys = new Set([...Object.keys(o), ...Object.keys(n)])
  for (const k of keys) {
    if (HIDDEN_KEYS.has(k)) continue
    if (JSON.stringify(o[k]) !== JSON.stringify(n[k])) out.push({ key: k, from: o[k], to: n[k] })
  }
  return out
}

function fmtVal(v) {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

export default function SuperAuditPage() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    api
      .get('/super/audit')
      .then((r) => setRows((r.data && r.data.audit) || []))
      .catch((e) =>
        setError((e.response && e.response.data && e.response.data.error) || e.message || 'Failed')
      )
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200">
      <header className="border-b border-slate-800 px-6 py-4">
        <div className="flex items-center justify-between gap-4 max-w-7xl mx-auto">
          <h1 className="text-xl font-semibold">Constrai Admin · Cross-tenant Audit</h1>
          <div className="flex items-center gap-3">
            <Link to="/" className="text-indigo-300 hover:text-indigo-200 text-sm">
              ← Companies
            </Link>
            <AdminLogoutButton />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        <p className="text-sm text-slate-500 mb-4">
          High-risk + OWNER audit across all tenants (§132.6). Old → new.
        </p>

        {loading && <div className="text-slate-500 text-sm">Loading…</div>}
        {error && (
          <div role="alert" className="text-red-400 text-sm">
            {error}
          </div>
        )}
        {!loading && !error && rows.length === 0 && (
          <div className="text-slate-500 text-sm">No sensitive audit yet.</div>
        )}

        <div className="space-y-3">
          {rows.map((row) => {
            const changes = diffFields(row.old_values, row.new_values)
            return (
              <div key={row.id} className="border border-slate-800 rounded-lg p-4 bg-slate-800/40">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <div className="font-semibold">
                    <span className="text-amber-300">
                      {row.company_name || (row.company_id ? `company #${row.company_id}` : 'platform')}
                    </span>
                    {' · '}
                    {row.action}
                    {row.entity_name ? ` — ${row.entity_name}` : ''}
                  </div>
                  <div className="text-xs text-slate-500">
                    {new Date(row.created_at).toLocaleString()} · {row.changed_by || '—'} (
                    {row.changer_role || '—'})
                  </div>
                </div>
                {changes.length === 0 ? (
                  <div className="text-xs text-slate-500">No field-level changes captured.</div>
                ) : (
                  <ul className="space-y-1">
                    {changes.map((c) => (
                      <li key={c.key} className="text-sm flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs bg-slate-700 px-1.5 py-0.5 rounded">
                          {c.key}
                        </span>
                        <span className="text-red-400 line-through">{fmtVal(c.from)}</span>
                        <span className="text-slate-500">→</span>
                        <span className="text-green-400 font-medium">{fmtVal(c.to)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      </main>
    </div>
  )
}
