import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import {
  Users, Search, Filter, Shield, ToggleLeft, ToggleRight,
  Mail, Loader2, AlertCircle, X, CheckCircle, Clock, Ban
} from 'lucide-react'

// ── Constants ─────────────────────────────────────────────────
const ROLES = [
  { value: 'WORKER',                label: 'Worker'               },
  { value: 'TRADE_ADMIN',           label: 'Trade Admin'          },
  { value: 'TRADE_PROJECT_MANAGER', label: 'Trade Project Manager'},
  { value: 'COMPANY_ADMIN',         label: 'Company Admin'        },
  { value: 'IT_ADMIN',              label: 'IT Admin'             },
]

const ROLE_COLORS = {
  SUPER_ADMIN:           'bg-red-100    text-red-700    border-red-200',
  IT_ADMIN:              'bg-orange-100 text-orange-700 border-orange-200',
  COMPANY_ADMIN:         'bg-violet-100 text-violet-700 border-violet-200',
  TRADE_PROJECT_MANAGER: 'bg-blue-100   text-blue-700   border-blue-200',
  TRADE_ADMIN:           'bg-indigo-100 text-indigo-700 border-indigo-200',
  WORKER:                'bg-slate-100  text-slate-600  border-slate-200',
}

const ROLE_LABELS = {
  SUPER_ADMIN:           'Super Admin',
  IT_ADMIN:              'IT Admin',
  COMPANY_ADMIN:         'Co. Admin',
  TRADE_PROJECT_MANAGER: 'Project Mgr',
  TRADE_ADMIN:           'Trade Admin',
  WORKER:                'Worker',
}

// ── Sub-components ────────────────────────────────────────────
function Avatar({ name, size = 'md' }) {
  const initials = name
    ? name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : '?'
  const colors = [
    'bg-indigo-500', 'bg-emerald-500', 'bg-amber-500',
    'bg-rose-500',   'bg-violet-500',  'bg-cyan-500',
  ]
  const color = colors[initials.charCodeAt(0) % colors.length]
  const sz = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm'
  return (
    <div className={`${sz} ${color} rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0`}>
      {initials}
    </div>
  )
}

function RoleBadge({ role }) {
  const cls   = ROLE_COLORS[role] || ROLE_COLORS.WORKER
  const label = ROLE_LABELS[role] || role
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${cls}`}>
      {label}
    </span>
  )
}

function AccountStatus({ user }) {
  if (!user.is_active) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border bg-red-50 text-red-600 border-red-200">
      <Ban size={10} />Disabled
    </span>
  )
  if (user.activated_at) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border bg-emerald-50 text-emerald-700 border-emerald-200">
      <CheckCircle size={10} />Active
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border bg-amber-50 text-amber-700 border-amber-200">
      <Clock size={10} />Pending
    </span>
  )
}

// ── Edit Role Modal ───────────────────────────────────────────
function EditRoleModal({ user, onClose }) {
  const qc = useQueryClient()
  const [role, setRole]     = useState(user.role)
  const [error, setError]   = useState('')

  const mutation = useMutation({
    mutationFn: (newRole) => api.patch(`/users/${user.id}/role`, { role: newRole }),
    onSuccess: () => {
      qc.invalidateQueries(['users'])
      onClose()
    },
    onError: (err) => {
      const msgs = {
        INSUFFICIENT_PRIVILEGE:   'You cannot change this user\'s role',
        CANNOT_ASSIGN_HIGHER_ROLE:'You cannot assign a role higher than yours',
        INVALID_ROLE:             'Invalid role selected',
      }
      setError(msgs[err.response?.data?.error] || err.response?.data?.error || 'Failed to update role')
    }
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Shield size={16} className="text-indigo-600" />
            <h2 className="font-semibold text-slate-800">Change Role</h2>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg">
            <X size={16} className="text-slate-500" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
            <Avatar name={`${user.first_name} ${user.last_name}`} size="sm" />
            <div>
              <p className="text-sm font-medium text-slate-800">
                {user.first_name} {user.last_name}
              </p>
              <p className="text-xs text-slate-500">@{user.username}</p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">New Role</label>
            <select
              value={role}
              onChange={e => setRole(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              {ROLES.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2.5">
              <AlertCircle size={14} />{error}
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">
              Cancel
            </button>
            <button
              onClick={() => mutation.mutate(role)}
              disabled={mutation.isPending || role === user.role}
              className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2"
            >
              {mutation.isPending
                ? <><Loader2 size={14} className="animate-spin" />Saving...</>
                : <><Shield size={14} />Save Role</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────
export default function UserManagementPage() {
  const qc = useQueryClient()
  const [search, setSearch]       = useState('')
  const [filterRole, setFilterRole] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [editModal, setEditModal] = useState(null)
  const [toast, setToast]         = useState(null)

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then(r => r.data.users || []),
  })

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const statusMutation = useMutation({
    mutationFn: ({ id, is_active }) => api.patch(`/users/${id}/status`, { is_active }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries(['users'])
      showToast(vars.is_active ? 'User activated' : 'User deactivated')
    },
    onError: (err) => {
      const msgs = {
        CANNOT_DEACTIVATE_SELF: 'You cannot deactivate your own account',
        INSUFFICIENT_PRIVILEGE: 'You cannot change this user\'s status',
      }
      showToast(msgs[err.response?.data?.error] || 'Failed to update status', 'error')
    }
  })

  const resendMutation = useMutation({
    mutationFn: (id) => api.post(`/users/${id}/resend`),
    onSuccess: () => {
      qc.invalidateQueries(['users'])
      showToast('Activation email resent')
    },
    onError: (err) => {
      const msgs = {
        ALREADY_ACTIVATED:  'This user is already activated',
        EMAIL_NOT_CONFIGURED: 'Email service not configured',
        NO_EMAIL_ON_RECORD: 'No email found for this user',
      }
      showToast(msgs[err.response?.data?.error] || 'Failed to resend email', 'error')
    }
  })

  const filtered = users.filter(u => {
    const name = `${u.first_name || ''} ${u.last_name || ''} ${u.username || ''}`.toLowerCase()
    const matchSearch = !search || name.includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase())
    const matchRole   = !filterRole || u.role === filterRole
    const matchStatus = !filterStatus ||
      (filterStatus === 'active'   &&  u.is_active && u.activated_at) ||
      (filterStatus === 'pending'  &&  u.is_active && !u.activated_at) ||
      (filterStatus === 'disabled' && !u.is_active)
    return matchSearch && matchRole && matchStatus
  })

  const stats = {
    total:    users.length,
    active:   users.filter(u => u.is_active && u.activated_at).length,
    pending:  users.filter(u => u.is_active && !u.activated_at).length,
    disabled: users.filter(u => !u.is_active).length,
  }

  return (
    <div className="p-8">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">User Management</h1>
          <p className="text-slate-500 text-sm mt-0.5">{users.length} users total</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total',    value: stats.total,    color: 'text-slate-700',   bg: 'bg-slate-50',   border: 'border-slate-200' },
          { label: 'Active',   value: stats.active,   color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
          { label: 'Pending',  value: stats.pending,  color: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-200' },
          { label: 'Disabled', value: stats.disabled, color: 'text-red-700',     bg: 'bg-red-50',     border: 'border-red-200' },
        ].map(s => (
          <div key={s.label} className={`${s.bg} border ${s.border} rounded-xl px-4 py-3`}>
            <p className="text-xs text-slate-500 mb-1">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search users..."
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="relative">
          <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <select value={filterRole} onChange={e => setFilterRole(e.target.value)}
            className="pl-8 pr-8 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none">
            <option value="">All Roles</option>
            {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
        <div className="relative">
          <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="pl-8 pr-8 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none">
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="pending">Pending Activation</option>
            <option value="disabled">Disabled</option>
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
            <p className="text-slate-500 font-medium">No users found</p>
            <p className="text-slate-400 text-sm mt-1">Try adjusting your filters</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">User</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Role</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Trade</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Joined</th>
                <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(u => (
                <tr key={u.id} className="hover:bg-slate-50 transition-colors group">

                  {/* User */}
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <Avatar name={u.first_name ? `${u.first_name} ${u.last_name}` : u.username} />
                      <div>
                        <div className="text-sm font-medium text-slate-800">
                          {u.first_name ? `${u.first_name} ${u.last_name}` : u.username}
                        </div>
                        <div className="text-xs text-slate-400 flex items-center gap-1">
                          {u.username && <span>@{u.username}</span>}
                          {u.username && u.email && <span>·</span>}
                          {u.email && <span className="flex items-center gap-0.5"><Mail size={10} />{u.email}</span>}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Role */}
                  <td className="px-5 py-3.5">
                    <RoleBadge role={u.role} />
                  </td>

                  {/* Trade */}
                  <td className="px-5 py-3.5">
                    <span className="text-sm text-slate-600">{u.trade_name || '—'}</span>
                  </td>

                  {/* Status */}
                  <td className="px-5 py-3.5">
                    <AccountStatus user={u} />
                  </td>

                  {/* Joined */}
                  <td className="px-5 py-3.5">
                    <span className="text-xs text-slate-500">
                      {u.activated_at
                        ? new Date(u.activated_at).toLocaleDateString()
                        : u.activation_sent_at
                          ? `Invited ${new Date(u.activation_sent_at).toLocaleDateString()}`
                          : '—'
                      }
                    </span>
                  </td>

                  {/* Actions */}
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">

                      {/* Change Role */}
                      <button
                        onClick={() => setEditModal(u)}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                        title="Change role"
                      >
                        <Shield size={12} />Role
                      </button>

                      {/* Resend invite (only for pending) */}
                      {u.is_active && !u.activated_at && (
                        <button
                          onClick={() => resendMutation.mutate(u.id)}
                          disabled={resendMutation.isPending}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                          title="Resend activation email"
                        >
                          {resendMutation.isPending
                            ? <Loader2 size={12} className="animate-spin" />
                            : <Mail size={12} />
                          }
                          Resend
                        </button>
                      )}

                      {/* Toggle active */}
                      <button
                        onClick={() => statusMutation.mutate({ id: u.id, is_active: !u.is_active })}
                        disabled={statusMutation.isPending}
                        className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                          u.is_active
                            ? 'text-red-500 hover:bg-red-50'
                            : 'text-emerald-600 hover:bg-emerald-50'
                        }`}
                        title={u.is_active ? 'Disable account' : 'Enable account'}
                      >
                        {u.is_active
                          ? <><ToggleRight size={14} />Disable</>
                          : <><ToggleLeft size={14} />Enable</>
                        }
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Edit Role Modal */}
      {editModal && (
        <EditRoleModal user={editModal} onClose={() => setEditModal(null)} />
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3 rounded-lg border shadow-xl text-sm font-medium
          ${toast.type === 'success'
            ? 'bg-emerald-950 border-emerald-500/40 text-emerald-300'
            : 'bg-red-950 border-red-500/40 text-red-300'
          }`}>
          {toast.type === 'success'
            ? <CheckCircle className="w-4 h-4 text-emerald-400" />
            : <AlertCircle className="w-4 h-4 text-red-400" />
          }
          {toast.msg}
        </div>
      )}
    </div>
  )
}
