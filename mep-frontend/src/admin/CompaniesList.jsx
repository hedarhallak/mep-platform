// src/admin/CompaniesList.jsx
//
// Phase 5 / 90-D — first real admin screen.
//
// Read-only table of all companies (tenants) with client-side text search
// + click-to-sort columns. Data fetched once on mount from the backend
// /api/super/companies/overview endpoint introduced in this same piece.
//
// Auth assumption (deferred to 90-E for proper handling):
//   The shared lib/api.js auto-attaches `Authorization: Bearer <mep_token>`
//   from localStorage and refreshes on 401. If no token is present (i.e.,
//   the SA hasn't logged in via the tenant portal first), the request 401s,
//   the refresh attempt 401s too, and api.js redirects to /login. The admin
//   portal doesn't have a /login route yet — falls through to admin.html
//   which renders this same component again. 90-E adds proper auth UI.

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../lib/api'

const COLUMNS = [
  { key: 'name', label: 'Name', sortable: true },
  { key: 'plan', label: 'Plan', sortable: true },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'employee_count', label: 'Employees', sortable: true, numeric: true },
  { key: 'project_count', label: 'Projects', sortable: true, numeric: true },
  { key: 'created_at', label: 'Created', sortable: true, dateField: true },
  { key: 'last_activity_at', label: 'Last activity', sortable: true, dateField: true },
]

function formatDate(value) {
  if (!value) return '—'
  try {
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return '—'
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return '—'
  }
}

function statusBadgeClass(status) {
  switch (String(status || '').toUpperCase()) {
    case 'ACTIVE':
      return 'bg-emerald-900/40 text-emerald-300 border-emerald-700/50'
    case 'SUSPENDED':
      return 'bg-rose-900/40 text-rose-300 border-rose-700/50'
    case 'TRIAL':
      return 'bg-amber-900/40 text-amber-300 border-amber-700/50'
    default:
      return 'bg-slate-800 text-slate-300 border-slate-600'
  }
}

export default function CompaniesList() {
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('name')
  const [sortDir, setSortDir] = useState('asc')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    api
      .get('/super/companies/overview')
      .then((res) => {
        if (cancelled) return
        const list = (res.data && res.data.companies) || []
        setCompanies(list)
        setLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        const msg =
          (err.response && err.response.data && err.response.data.error) ||
          err.message ||
          'Failed to load companies'
        setError(msg)
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return companies
    return companies.filter((c) => String(c.name || '').toLowerCase().includes(q))
  }, [companies, search])

  const sorted = useMemo(() => {
    const list = [...filtered]
    list.sort((a, b) => {
      const va = a[sortBy]
      const vb = b[sortBy]

      // Nulls last regardless of direction
      if (va == null && vb == null) return 0
      if (va == null) return 1
      if (vb == null) return -1

      // Numeric vs string vs date — Date.parse handles ISO strings safely.
      const col = COLUMNS.find((c) => c.key === sortBy)
      let cmp
      if (col && col.numeric) {
        cmp = Number(va) - Number(vb)
      } else if (col && col.dateField) {
        cmp = new Date(va).getTime() - new Date(vb).getTime()
      } else {
        cmp = String(va).localeCompare(String(vb))
      }

      return sortDir === 'asc' ? cmp : -cmp
    })
    return list
  }, [filtered, sortBy, sortDir])

  function toggleSort(key) {
    if (sortBy === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(key)
      setSortDir('asc')
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200">
      <header className="border-b border-slate-800 px-6 py-4">
        <div className="flex items-center justify-between gap-4 max-w-7xl mx-auto">
          <h1 className="text-xl font-semibold">Constrai Admin · Companies</h1>
          <span className="text-xs text-slate-500">90-D • All Companies (read-only)</span>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        <div className="mb-4 flex items-center gap-3">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name…"
            aria-label="Search companies by name"
            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-slate-500 w-64"
          />
          <span className="text-sm text-slate-500">
            {loading ? 'Loading…' : `${sorted.length} of ${companies.length}`}
          </span>
          <Link
            to="/companies/new"
            className="ml-auto px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded text-white text-sm font-medium"
          >
            + New company
          </Link>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-4 p-4 bg-rose-900/30 border border-rose-700/50 rounded text-sm text-rose-200"
          >
            <strong className="font-semibold">Failed to load:</strong> {error}
          </div>
        )}

        <div className="border border-slate-800 rounded overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-800/60 text-slate-300 text-left">
              <tr>
                {COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    scope="col"
                    className={
                      'px-4 py-2 font-medium ' +
                      (col.numeric ? 'text-right ' : '') +
                      (col.sortable ? 'cursor-pointer select-none' : '')
                    }
                    onClick={col.sortable ? () => toggleSort(col.key) : undefined}
                    aria-sort={
                      sortBy === col.key
                        ? sortDir === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : col.sortable
                          ? 'none'
                          : undefined
                    }
                  >
                    {col.label}
                    {sortBy === col.key && (
                      <span className="ml-1 text-slate-500">
                        {sortDir === 'asc' ? '▲' : '▼'}
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {!loading && sorted.length === 0 && (
                <tr>
                  <td
                    colSpan={COLUMNS.length}
                    className="px-4 py-8 text-center text-slate-500"
                  >
                    {search ? 'No companies match your search.' : 'No companies yet.'}
                  </td>
                </tr>
              )}
              {sorted.map((c) => (
                <tr key={c.company_id} className="hover:bg-slate-800/30">
                  <td className="px-4 py-2 font-medium text-slate-100">{c.name}</td>
                  <td className="px-4 py-2 text-slate-300">{c.plan || '—'}</td>
                  <td className="px-4 py-2">
                    <span
                      className={
                        'inline-block px-2 py-0.5 text-xs border rounded-full ' +
                        statusBadgeClass(c.status)
                      }
                    >
                      {c.status || 'UNKNOWN'}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-300">
                    {c.employee_count ?? 0}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-300">
                    {c.project_count ?? 0}
                  </td>
                  <td className="px-4 py-2 text-slate-400">{formatDate(c.created_at)}</td>
                  <td className="px-4 py-2 text-slate-400">{formatDate(c.last_activity_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  )
}
