import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import {
  Plus, Search, Filter, Edit2, Loader2,
  AlertCircle, Users, Phone, Mail,
  BadgeCheck, X
} from 'lucide-react'

// ── Role & Trade badge colors ─────────────────────────────────
const roleColors = {
  COMPANY_ADMIN:   'bg-violet-100 text-violet-700 border-violet-200',
  TRADE_ADMIN:     'bg-blue-100 text-blue-700 border-blue-200',
  PROJECT_MANAGER: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  WORKER:          'bg-slate-100 text-slate-600 border-slate-200',
  PURCHASING:      'bg-amber-100 text-amber-700 border-amber-200',
  ADMIN:           'bg-violet-100 text-violet-700 border-violet-200',
}

function RoleBadge({ role }) {
  const cls = roleColors[role] || 'bg-slate-100 text-slate-600 border-slate-200'
  const label = role === 'COMPANY_ADMIN' ? 'Co. Admin'
    : role === 'PROJECT_MANAGER' ? 'PM'
    : role === 'TRADE_ADMIN' ? 'Trade Admin'
    : role
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${cls}`}>
      {label}
    </span>
  )
}

// ── Avatar ────────────────────────────────────────────────────
function Avatar({ name, size = 'md' }) {
  const initials = name
    ? name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : '?'
  const colors = [
    'bg-indigo-500', 'bg-emerald-500', 'bg-amber-500',
    'bg-rose-500', 'bg-violet-500', 'bg-cyan-500'
  ]
  const color = colors[initials.charCodeAt(0) % colors.length]
  const sz = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm'
  return (
    <div className={`${sz} ${color} rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0`}>
      {initials}
    </div>
  )
}

// ── Invite Modal ──────────────────────────────────────────────
function InviteModal({ trades, onClose, onSaved }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    first_name: '', last_name: '', email: '',
    trade_type_id: '', level_code: '', role: 'WORKER', emp_code: '',
  })
  const [error, setError]   = useState('')
  const [success, setSuccess] = useState(null)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const mutation = useMutation({
    mutationFn: data => api.post('/invite-employee', data),
    onSuccess: (res) => {
      qc.invalidateQueries(['employees'])
      setSuccess(res.data)
    },
    onError: (err) => {
      const msgs = {
        EMAIL_ALREADY_REGISTERED: 'This email is already registered',
        INVALID_EMAIL: 'Invalid email address',
        FIRST_NAME_REQUIRED: 'First name is required',
        LAST_NAME_REQUIRED: 'Last name is required',
        EMAIL_REQUIRED: 'Email is required',
      }
      setError(msgs[err.response?.data?.error] || err.response?.data?.error || 'Failed to send invite')
    }
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')
    if (!form.first_name.trim()) return setError('First name is required')
    if (!form.last_name.trim())  return setError('Last name is required')
    if (!form.email.trim())      return setError('Email is required')
    mutation.mutate(form)
  }

  const roles = [
    { value: 'WORKER',          label: 'Worker' },
    { value: 'PROJECT_MANAGER', label: 'Project Manager' },
    { value: 'TRADE_ADMIN',     label: 'Trade Admin' },
    { value: 'PURCHASING',      label: 'Purchasing' },
  ]

  const levels = [
    'APPRENTICE_1','APPRENTICE_2','APPRENTICE_3','APPRENTICE_4',
    'JOURNEYMAN','FOREMAN','MASTER','SUPERVISOR','ENGINEER','MANAGER'
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Users size={18} className="text-indigo-600" />
            <h2 className="font-semibold text-slate-800">Invite Employee</h2>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <X size={16} className="text-slate-500" />
          </button>
        </div>

        {success ? (
          /* ── Success State ── */
          <div className="p-8 text-center">
            <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <BadgeCheck size={28} className="text-emerald-500" />
            </div>
            <h3 className="font-bold text-slate-800 text-lg mb-2">Invitation Sent!</h3>
            <p className="text-slate-500 text-sm mb-1">
              An email has been sent to <strong>{form.email}</strong>
            </p>
            <p className="text-slate-400 text-xs mb-6">
              The employee will complete their profile when they click the link.
            </p>
            {!success.email_sent && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-xs text-amber-700">
                ⚠️ Email could not be sent. Share this link manually:<br/>
                <span className="font-mono break-all text-indigo-600">{success.invite_url}</span>
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={onClose}
                className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">
                Close
              </button>
              <button onClick={() => { setSuccess(null); setForm({ first_name:'',last_name:'',email:'',trade_type_id:'',level_code:'',role:'WORKER',emp_code:'' }) }}
                className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold">
                Invite Another
              </button>
            </div>
          </div>
        ) : (
          /* ── Form ── */
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <p className="text-sm text-slate-500">
              The employee will receive an email to complete their account setup.
            </p>

            {/* Name */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">First Name *</label>
                <input type="text" value={form.first_name}
                  onChange={e => set('first_name', e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="First name" autoFocus />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Last Name *</label>
                <input type="text" value={form.last_name}
                  onChange={e => set('last_name', e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Last name" />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                <Mail size={11} className="inline mr-1" />Work Email *
              </label>
              <input type="email" value={form.email}
                onChange={e => set('email', e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="employee@email.com" />
            </div>

            {/* Trade + Level + Role */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Trade</label>
                <select value={form.trade_type_id} onChange={e => set('trade_type_id', e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                  <option value="">No trade</option>
                  {trades?.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Level</label>
                <select value={form.level_code} onChange={e => set('level_code', e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                  <option value="">No level</option>
                  {levels.map(l => <option key={l} value={l}>{l.replace(/_/g,' ')}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Role</label>
                <select value={form.role} onChange={e => set('role', e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                  {roles.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
            </div>

            {/* Emp Code (optional) */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Employee Code <span className="text-slate-400">(optional)</span></label>
              <input type="text" value={form.emp_code}
                onChange={e => set('emp_code', e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="e.g. W-2001" />
            </div>

            {error && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2.5">
                <AlertCircle size={14} />{error}
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button type="button" onClick={onClose}
                className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">
                Cancel
              </button>
              <button type="submit" disabled={mutation.isPending}
                className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2">
                {mutation.isPending
                  ? <><Loader2 size={14} className="animate-spin" /> Sending...</>
                  : <><Mail size={14} /> Send Invite</>}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────
export default function EmployeesPage() {
  const [search, setSearch]       = useState('')
  const [filterRole, setFilterRole] = useState('')
  const [filterTrade, setFilterTrade] = useState('')
  const [modal, setModal]         = useState(null)

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['employees'],
    queryFn: () => api.get('/employees').then(r => r.data.employees || []),
  })

  const { data: meta } = useQuery({
    queryKey: ['projects-meta'],
    queryFn: () => api.get('/projects/meta').then(r => r.data),
  })

  const trades = meta?.trade_types || []

  const filtered = employees.filter(e => {
    const name = `${e.first_name} ${e.last_name}`.toLowerCase()
    const matchSearch = !search ||
      name.includes(search.toLowerCase()) ||
      e.username?.toLowerCase().includes(search.toLowerCase()) ||
      e.emp_code?.toLowerCase().includes(search.toLowerCase())
    const matchRole  = !filterRole  || e.role === filterRole
    const matchTrade = !filterTrade || String(e.trade_type_id) === filterTrade
    return matchSearch && matchRole && matchTrade
  })

  const roles = [
    { value: 'WORKER',          label: 'Worker' },
    { value: 'PROJECT_MANAGER', label: 'Project Manager' },
    { value: 'TRADE_ADMIN',     label: 'Trade Admin' },
    { value: 'COMPANY_ADMIN',   label: 'Company Admin' },
    { value: 'PURCHASING',      label: 'Purchasing' },
  ]

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Employees</h1>
          <p className="text-slate-500 text-sm mt-0.5">{employees.length} employees total</p>
        </div>
        <button onClick={() => setModal('invite')}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors">
          <Plus size={16} />
          Invite Employee
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search employees..."
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div className="relative">
          <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <select value={filterRole} onChange={e => setFilterRole(e.target.value)}
            className="pl-8 pr-8 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none">
            <option value="">All Roles</option>
            {roles.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
        <div className="relative">
          <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <select value={filterTrade} onChange={e => setFilterTrade(e.target.value)}
            className="pl-8 pr-8 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none">
            <option value="">All Trades</option>
            {trades.map(t => <option key={t.id} value={String(t.id)}>{t.name}</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-indigo-500" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Users size={32} className="mx-auto text-slate-300 mb-3" />
            <p className="text-slate-500 font-medium">No employees found</p>
            <p className="text-slate-400 text-sm mt-1">
              {search || filterRole || filterTrade ? 'Try adjusting your filters' : 'Add your first employee'}
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Employee</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Role</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Trade</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Level</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Contact</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(emp => (
                <tr key={emp.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <Avatar name={`${emp.first_name} ${emp.last_name}`} />
                      <div>
                        <div className="text-sm font-medium text-slate-800">
                          {emp.first_name} {emp.last_name}
                        </div>
                        <div className="text-xs text-slate-400 flex items-center gap-1">
                          {emp.emp_code && <span className="font-mono">{emp.emp_code}</span>}
                          {emp.emp_code && emp.username && <span>·</span>}
                          {emp.username && <span>@{emp.username}</span>}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <RoleBadge role={emp.role} />
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-sm text-slate-600">{emp.trade_name || '—'}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-xs text-slate-500">
                      {emp.level_code ? emp.level_code.replace(/_/g, ' ') : '—'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="space-y-0.5">
                      {emp.email && (
                        <div className="flex items-center gap-1 text-xs text-slate-500">
                          <Mail size={11} />{emp.email}
                        </div>
                      )}
                      {emp.phone && (
                        <div className="flex items-center gap-1 text-xs text-slate-500">
                          <Phone size={11} />{emp.phone}
                        </div>
                      )}
                      {!emp.email && !emp.phone && <span className="text-slate-300 text-xs">—</span>}
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border ${
                      emp.is_active
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-slate-100 text-slate-500 border-slate-200'
                    }`}>
                      <BadgeCheck size={11} />
                      {emp.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <button onClick={() => setModal(emp)}
                      className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-indigo-50 rounded-lg transition-all text-slate-400 hover:text-indigo-600">
                      <Edit2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {modal === 'invite' && (
        <InviteModal
          trades={trades}
          onClose={() => setModal(null)}
          onSaved={() => setModal(null)}
        />
      )}
    </div>
  )
}
