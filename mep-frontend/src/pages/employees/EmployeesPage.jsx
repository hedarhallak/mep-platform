import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import {
  Plus, Search, Filter, Edit2, Loader2,
  AlertCircle, Users, Phone, Mail, ClipboardCheck,
  BadgeCheck, X, UserX, UserCheck, Shield, Save, Trash2
} from 'lucide-react'

// ── Role & Trade badge colors ─────────────────────────────────
const roleColors = {
  COMPANY_ADMIN:         'bg-violet-100 text-violet-700 border-violet-200',
  TRADE_ADMIN:           'bg-blue-100 text-blue-700 border-blue-200',
  TRADE_PROJECT_MANAGER: 'bg-primary-pale text-primary-dark border-primary-pale',
  PROJECT_MANAGER:       'bg-primary-pale text-primary-dark border-primary-pale',
  FOREMAN:               'bg-teal-100 text-teal-700 border-teal-200',
  JOURNEYMAN:            'bg-cyan-100 text-cyan-700 border-cyan-200',
  APPRENTICE_4:          'bg-sky-50 text-sky-700 border-sky-200',
  APPRENTICE_3:          'bg-sky-50 text-sky-700 border-sky-200',
  APPRENTICE_2:          'bg-sky-50 text-sky-700 border-sky-200',
  APPRENTICE_1:          'bg-sky-50 text-sky-700 border-sky-200',
  WORKER:                'bg-slate-100 text-slate-600 border-slate-200',
  DRIVER:                'bg-amber-100 text-amber-700 border-amber-200',
  PURCHASING:            'bg-amber-100 text-amber-700 border-amber-200',
}

// Section 55: roleLabel + ALL_ROLES + INVITE_ROLES are now i18n-aware.
// They take `t` as an argument (or are computed inside components).
const roleLabel = (t, role) =>
  t(`employees.roleShort.${role}`, { defaultValue: role?.replace(/_/g, ' ') || '—' })

function RoleBadge({ role }) {
  const { t } = useTranslation()
  const cls = roleColors[role] || 'bg-slate-100 text-slate-600 border-slate-200'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${cls}`}>
      {roleLabel(t, role)}
    </span>
  )
}

// ── Avatar ────────────────────────────────────────────────────
function Avatar({ name, size = 'md' }) {
  const initials = name
    ? name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : '?'
  const colors = [
    'bg-primary-light', 'bg-emerald-500', 'bg-amber-500',
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

// ── Role lists ────────────────────────────────────────────────
// Order is preserved. Labels resolved at render time via t().
const ALL_ROLES_KEYS = [
  'COMPANY_ADMIN', 'TRADE_PROJECT_MANAGER', 'TRADE_ADMIN',
  'FOREMAN', 'JOURNEYMAN',
  'APPRENTICE_4', 'APPRENTICE_3', 'APPRENTICE_2', 'APPRENTICE_1',
  'WORKER', 'DRIVER',
]

const INVITE_ROLES_KEYS = [
  'WORKER', 'FOREMAN', 'JOURNEYMAN', 'TRADE_ADMIN', 'TRADE_PROJECT_MANAGER',
]

const LEVELS = [
  'APPRENTICE_1','APPRENTICE_2','APPRENTICE_3','APPRENTICE_4',
  'JOURNEYMAN','FOREMAN','MASTER','SUPERVISOR','ENGINEER','MANAGER'
]

// ── Invite Modal ──────────────────────────────────────────────
function InviteModal({ trades, onClose }) {
  const { t } = useTranslation()
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
      qc.invalidateQueries({ queryKey: ['employees'] })
      setSuccess(res.data)
    },
    onError: (err) => {
      const code = err.response?.data?.error
      // Backend error codes are mapped to localized strings under
      // employees.invite.errors.*. Falls back to raw code or generic message.
      const localized = code ? t(`employees.invite.errors.${code}`, { defaultValue: '' }) : ''
      setError(localized || code || t('employees.invite.errors.sendFailed'))
    }
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')
    if (!form.first_name.trim()) return setError(t('employees.invite.errors.firstNameRequired'))
    if (!form.last_name.trim())  return setError(t('employees.invite.errors.lastNameRequired'))
    if (!form.email.trim())      return setError(t('employees.invite.errors.emailRequired'))
    mutation.mutate(form)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Users size={18} className="text-primary" />
            <h2 className="font-semibold text-slate-800">{t('employees.invite.title')}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <X size={16} className="text-slate-500" />
          </button>
        </div>

        {success ? (
          <div className="p-8 text-center">
            <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <BadgeCheck size={28} className="text-emerald-500" />
            </div>
            <h3 className="font-bold text-slate-800 text-lg mb-2">{t('employees.invite.sentTitle')}</h3>
            <p className="text-slate-500 text-sm mb-1"
              dangerouslySetInnerHTML={{
                __html: t('employees.invite.sentBody', { email: `<strong>${form.email}</strong>` })
              }}
            />
            {!success.email_sent && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-xs text-amber-700">
                {t('employees.invite.emailFailed')}<br/>
                <span className="font-mono break-all text-primary">{success.invite_url}</span>
              </div>
            )}
            <div className="flex gap-3 mt-6">
              <button onClick={onClose}
                className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">
                {t('employees.invite.close')}
              </button>
              <button onClick={() => { setSuccess(null); setForm({ first_name:'',last_name:'',email:'',trade_type_id:'',level_code:'',role:'WORKER',emp_code:'' }) }}
                className="flex-1 px-4 py-2.5 bg-primary hover:bg-primary-dark text-white rounded-lg text-sm font-semibold">
                {t('employees.invite.inviteAnother')}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <p className="text-sm text-slate-500">
              {t('employees.invite.intro')}
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">{t('employees.invite.firstName')}</label>
                <input type="text" value={form.first_name}
                  onChange={e => set('first_name', e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-light"
                  placeholder={t('employees.invite.firstNamePlaceholder')} autoFocus />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">{t('employees.invite.lastName')}</label>
                <input type="text" value={form.last_name}
                  onChange={e => set('last_name', e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-light"
                  placeholder={t('employees.invite.lastNamePlaceholder')} />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                <Mail size={11} className="inline mr-1" />{t('employees.invite.workEmail')}
              </label>
              <input type="email" value={form.email}
                onChange={e => set('email', e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-light"
                placeholder={t('employees.invite.emailPlaceholder')} />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">{t('employees.invite.trade')}</label>
                <select value={form.trade_type_id} onChange={e => set('trade_type_id', e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-light bg-white">
                  <option value="">{t('employees.invite.noTrade')}</option>
                  {trades?.map(tr => <option key={tr.id} value={tr.id}>{tr.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">{t('employees.invite.level')}</label>
                <select value={form.level_code} onChange={e => set('level_code', e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-light bg-white">
                  <option value="">{t('employees.invite.noLevel')}</option>
                  {LEVELS.map(l => <option key={l} value={l}>{l.replace(/_/g,' ')}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">{t('employees.invite.role')}</label>
                <select value={form.role} onChange={e => set('role', e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-light bg-white">
                  {INVITE_ROLES_KEYS.map(r => (
                    <option key={r} value={r}>{t(`employees.roleFull.${r}`)}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                {t('employees.invite.employeeCode')}{' '}
                <span className="text-slate-400">{t('employees.invite.optional')}</span>
              </label>
              <input type="text" value={form.emp_code}
                onChange={e => set('emp_code', e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-light"
                placeholder={t('employees.invite.employeeCodePlaceholder')} />
            </div>

            {error && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2.5">
                <AlertCircle size={14} />{error}
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button type="button" onClick={onClose}
                className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">
                {t('employees.invite.cancel')}
              </button>
              <button type="submit" disabled={mutation.isPending}
                className="flex-1 px-4 py-2.5 bg-primary hover:bg-primary-dark disabled:opacity-60 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2">
                {mutation.isPending
                  ? <><Loader2 size={14} className="animate-spin" /> {t('employees.invite.sending')}</>
                  : <><Mail size={14} /> {t('employees.invite.sendInvite')}</>}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

// ── Edit Employee Modal ───────────────────────────────────────
function EditModal({ employee, trades, onClose }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [form, setForm] = useState({
    first_name:             employee.first_name || '',
    last_name:              employee.last_name || '',
    contact_email:          employee.email || '',
    employee_profile_type:  employee.role || 'WORKER',
    trade_code:             employee.trade_code || '',
    rank_code:              employee.rank_code || '',
    phone:                  employee.phone || '',
    is_active:              employee.is_active !== false,
  })
  const [error, setError]     = useState('')
  const [success, setSuccess] = useState(false)
  const [confirmDeactivate, setConfirmDeactivate] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const saveMutation = useMutation({
    mutationFn: data => api.patch(`/employees/${employee.id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employees'] })
      setSuccess(true)
      setTimeout(() => onClose(), 1200)
    },
    onError: (err) => {
      setError(err.response?.data?.error || t('employees.edit.updateFailed'))
    }
  })

  const handleSave = () => {
    setError('')
    if (!form.first_name.trim()) return setError(t('employees.invite.errors.firstNameRequired'))
    if (!form.last_name.trim())  return setError(t('employees.invite.errors.lastNameRequired'))
    saveMutation.mutate(form)
  }

  const handleDeactivate = () => {
    if (!confirmDeactivate) {
      setConfirmDeactivate(true)
      return
    }
    saveMutation.mutate({ is_active: false })
  }

  const handleReactivate = () => {
    saveMutation.mutate({ is_active: true })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-3">
            <Avatar name={`${employee.first_name} ${employee.last_name}`} size="sm" />
            <div>
              <h2 className="font-semibold text-slate-800 text-sm">{t('employees.edit.title')}</h2>
              <p className="text-xs text-slate-400">{employee.employee_code}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <X size={16} className="text-slate-500" />
          </button>
        </div>

        {success ? (
          <div className="p-8 text-center">
            <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <BadgeCheck size={28} className="text-emerald-500" />
            </div>
            <h3 className="font-bold text-slate-800">{t('employees.edit.updated')}</h3>
          </div>
        ) : (
          <div className="p-6 space-y-5">
            {/* Name */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">{t('employees.edit.firstName')}</label>
                <input type="text" value={form.first_name}
                  onChange={e => set('first_name', e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-light" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">{t('employees.edit.lastName')}</label>
                <input type="text" value={form.last_name}
                  onChange={e => set('last_name', e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-light" />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                <Mail size={11} className="inline mr-1" />{t('employees.edit.email')}
              </label>
              <input type="email" value={form.contact_email}
                onChange={e => set('contact_email', e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-light" />
            </div>

            {/* Phone */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                <Phone size={11} className="inline mr-1" />{t('employees.edit.phone')}
              </label>
              <input type="tel" value={form.phone}
                onChange={e => set('phone', e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-light"
                placeholder={t('employees.edit.phonePlaceholder')} />
            </div>

            {/* Role + Trade + Level */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  <Shield size={11} className="inline mr-1" />{t('employees.edit.role')}
                </label>
                <select value={form.employee_profile_type}
                  onChange={e => set('employee_profile_type', e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-light bg-white">
                  {ALL_ROLES_KEYS.map(r => (
                    <option key={r} value={r}>{t(`employees.roleFull.${r}`)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">{t('employees.edit.trade')}</label>
                <select value={form.trade_code}
                  onChange={e => set('trade_code', e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-light bg-white">
                  <option value="">{t('employees.edit.noTrade')}</option>
                  {trades?.map(tr => <option key={tr.code || tr.id} value={tr.code || ''}>{tr.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">{t('employees.edit.level')}</label>
                <select value={form.rank_code}
                  onChange={e => set('rank_code', e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-light bg-white">
                  <option value="">{t('employees.edit.noLevel')}</option>
                  {LEVELS.map(l => <option key={l} value={l}>{l.replace(/_/g,' ')}</option>)}
                </select>
              </div>
            </div>

            {/* Account info (read-only) */}
            {employee.username && (
              <div className="bg-slate-50 rounded-lg p-4 border border-slate-100">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">{t('employees.edit.accountInfo')}</p>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">{t('employees.edit.username')} <strong>@{employee.username}</strong></span>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border ${
                    employee.account_active !== false
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-red-50 text-red-700 border-red-200'
                  }`}>
                    {employee.account_active !== false ? t('employees.edit.active') : t('employees.edit.deactivated')}
                  </span>
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2.5">
                <AlertCircle size={14} />{error}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-3 pt-2 border-t border-slate-100">
              {/* Deactivate / Reactivate */}
              {employee.is_active ? (
                <button onClick={handleDeactivate}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                    confirmDeactivate
                      ? 'bg-red-500 text-white hover:bg-red-600'
                      : 'border border-red-200 text-red-600 hover:bg-red-50'
                  }`}>
                  <UserX size={13} />
                  {confirmDeactivate ? t('employees.edit.confirmDeactivate') : t('employees.edit.deactivate')}
                </button>
              ) : (
                <button onClick={handleReactivate}
                  className="flex items-center gap-1.5 px-3 py-2 border border-emerald-200 text-emerald-600 hover:bg-emerald-50 rounded-lg text-xs font-medium transition-colors">
                  <UserCheck size={13} />{t('employees.edit.reactivate')}
                </button>
              )}

              <div className="flex-1" />

              <button onClick={onClose}
                className="px-4 py-2.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">
                {t('employees.edit.cancel')}
              </button>
              <button onClick={handleSave} disabled={saveMutation.isPending}
                className="px-4 py-2.5 bg-primary hover:bg-primary-dark disabled:opacity-60 text-white rounded-lg text-sm font-semibold flex items-center gap-2">
                {saveMutation.isPending
                  ? <Loader2 size={14} className="animate-spin" />
                  : <Save size={14} />}
                {t('employees.edit.saveChanges')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────
export default function EmployeesPage() {
  const { t } = useTranslation()
  const [search, setSearch]           = useState('')
  const [filterRole, setFilterRole]   = useState('')
  const [filterTrade, setFilterTrade] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [modal, setModal]             = useState(null) // 'invite' | employee object

  const { data: employees = [], isLoading, error: empError } = useQuery({
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
      e.employee_code?.toLowerCase().includes(search.toLowerCase())
    const matchRole  = !filterRole  || e.role === filterRole
    const matchTrade = !filterTrade || e.trade_code === filterTrade
    const matchActive = showInactive || e.is_active !== false
    return matchSearch && matchRole && matchTrade && matchActive
  })

  const activeCount = employees.filter(e => e.is_active !== false).length
  const inactiveCount = employees.filter(e => e.is_active === false).length
  const incompleteProfileCount = employees.filter(e => e.is_active !== false && e.username && e.profile_status !== 'COMPLETED').length

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{t('employees.title')}</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {t('employees.subtitleActive', { count: activeCount })}
            {inactiveCount > 0 && <span className="text-slate-400">{t('employees.subtitleInactiveSuffix', { count: inactiveCount })}</span>}
            {incompleteProfileCount > 0 && <span className="text-amber-500">{t('employees.subtitleIncompleteSuffix', { count: incompleteProfileCount })}</span>}
          </p>
        </div>
        <button onClick={() => setModal('invite')}
          className="flex items-center gap-2 bg-primary hover:bg-primary-dark text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors">
          <Plus size={16} />
          {t('employees.inviteButton')}
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder={t('employees.searchPlaceholder')}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-light" />
        </div>
        <div className="relative">
          <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <select value={filterRole} onChange={e => setFilterRole(e.target.value)}
            className="pl-8 pr-8 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-light appearance-none">
            <option value="">{t('employees.allRoles')}</option>
            {ALL_ROLES_KEYS.map(r => (
              <option key={r} value={r}>{t(`employees.roleFull.${r}`)}</option>
            ))}
          </select>
        </div>
        <div className="relative">
          <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <select value={filterTrade} onChange={e => setFilterTrade(e.target.value)}
            className="pl-8 pr-8 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-light appearance-none">
            <option value="">{t('employees.allTrades')}</option>
            {trades.map(tr => <option key={tr.id} value={tr.code || String(tr.id)}>{tr.name}</option>)}
          </select>
        </div>
        {inactiveCount > 0 && (
          <label className="flex items-center gap-2 text-sm text-slate-500 cursor-pointer select-none">
            <input type="checkbox" checked={showInactive}
              onChange={e => setShowInactive(e.target.checked)}
              className="rounded border-slate-300 text-primary focus:ring-primary" />
            {t('employees.showInactive', { count: inactiveCount })}
          </label>
        )}
      </div>

      {/* API Error */}
      {empError && (
        <div className="mb-4 flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
          <AlertCircle size={16} />
          <span>{t('employees.loadError', { message: empError.response?.data?.error || empError.message })}</span>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-primary-light" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Users size={32} className="mx-auto text-slate-300 mb-3" />
            <p className="text-slate-500 font-medium">{t('employees.empty')}</p>
            <p className="text-slate-400 text-sm mt-1">
              {search || filterRole || filterTrade ? t('employees.emptyFiltered') : t('employees.emptyDefault')}
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('employees.th.employee')}</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('employees.th.role')}</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('employees.th.trade')}</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('employees.th.level')}</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('employees.th.contact')}</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('employees.th.status')}</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('employees.th.profile')}</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(emp => (
                <tr key={emp.id}
                  className={`hover:bg-slate-50 transition-colors group ${emp.is_active === false ? 'opacity-50' : ''}`}>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <Avatar name={`${emp.first_name} ${emp.last_name}`} />
                      <div>
                        <div className="text-sm font-medium text-slate-800">
                          {emp.first_name} {emp.last_name}
                        </div>
                        <div className="text-xs text-slate-400 flex items-center gap-1">
                          {emp.employee_code && <span className="font-mono">{emp.employee_code}</span>}
                          {emp.employee_code && emp.username && <span>·</span>}
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
                      {emp.rank_code ? emp.rank_code.replace(/_/g, ' ') : '—'}
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
                    {emp.is_active === false ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border bg-red-50 text-red-600 border-red-200">
                        <UserX size={11} />{t('employees.status.inactive')}
                      </span>
                    ) : emp.username ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border bg-emerald-50 text-emerald-700 border-emerald-200">
                        <BadgeCheck size={11} />{t('employees.status.active')}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border bg-amber-50 text-amber-600 border-amber-200">
                        <Mail size={11} />{t('employees.status.invited')}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    {emp.profile_status === 'COMPLETED' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border bg-emerald-50 text-emerald-700 border-emerald-200">
                        <ClipboardCheck size={11} />{t('employees.profileStatus.complete')}
                      </span>
                    ) : emp.username ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border bg-amber-50 text-amber-600 border-amber-200">
                        <AlertCircle size={11} />{t('employees.profileStatus.incomplete')}
                      </span>
                    ) : (
                      <span className="text-slate-300 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <button onClick={() => setModal(emp)}
                      className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-primary-pale rounded-lg transition-all text-slate-400 hover:text-primary">
                      <Edit2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modals */}
      {modal === 'invite' && (
        <InviteModal trades={trades} onClose={() => setModal(null)} />
      )}
      {modal && modal !== 'invite' && (
        <EditModal employee={modal} trades={trades} onClose={() => setModal(null)} />
      )}
    </div>
  )
}
