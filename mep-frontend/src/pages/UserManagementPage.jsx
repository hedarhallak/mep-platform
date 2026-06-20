import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import {
  Users,
  Search,
  Filter,
  Shield,
  ToggleLeft,
  ToggleRight,
  Mail,
  Loader2,
  AlertCircle,
  X,
  CheckCircle,
  Clock,
  Ban,
  SlidersHorizontal,
  Check,
  RefreshCw,
} from 'lucide-react';

// "smart_assign" → "Smart Assign" — fallback label for codes with no i18n key.
const humanizePerm = (key) =>
  String(key || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

// ── Constants ─────────────────────────────────────────────────
// Role colors are presentational only; the role LIST is data-driven from the
// catalog (GET /permissions/roles) so every role — incl. the Phase-4 ones —
// shows up. Unknown roles fall back to the WORKER (slate) chip.
const ROLE_COLORS = {
  SUPER_ADMIN: 'bg-red-100    text-red-700    border-red-200',
  IT_ADMIN: 'bg-orange-100 text-orange-700 border-orange-200',
  COMPANY_ADMIN: 'bg-violet-100 text-violet-700 border-violet-200',
  TRADE_PROJECT_MANAGER: 'bg-blue-100   text-blue-700   border-blue-200',
  TRADE_ADMIN: 'bg-primary-pale text-primary-dark border-primary-pale',
  WORKER: 'bg-slate-100  text-slate-600  border-slate-200',
};

// ── Sub-components ────────────────────────────────────────────
function Avatar({ name, size = 'md' }) {
  const initials = name
    ? name
        .split(' ')
        .map((w) => w[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : '?';
  const colors = [
    'bg-primary-light',
    'bg-emerald-500',
    'bg-amber-500',
    'bg-rose-500',
    'bg-violet-500',
    'bg-cyan-500',
  ];
  const color = colors[initials.charCodeAt(0) % colors.length];
  const sz = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm';
  return (
    <div
      className={`${sz} ${color} rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0`}
    >
      {initials}
    </div>
  );
}

function RoleBadge({ role, label: labelProp }) {
  const { t } = useTranslation();
  const cls = ROLE_COLORS[role] || ROLE_COLORS.WORKER;
  // Prefer the catalog label (covers the Phase-4 roles); fall back to the i18n
  // key, then the raw role key.
  const label = labelProp || t(`userManagement.badgeLabels.${role}`, { defaultValue: role });
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${cls}`}
    >
      {label}
    </span>
  );
}

function AccountStatus({ user }) {
  const { t } = useTranslation();
  if (!user.is_active)
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border bg-red-50 text-red-600 border-red-200">
        <Ban size={10} />
        {t('userManagement.badge.disabled')}
      </span>
    );
  if (user.activated_at)
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border bg-emerald-50 text-emerald-700 border-emerald-200">
        <CheckCircle size={10} />
        {t('userManagement.badge.active')}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border bg-amber-50 text-amber-700 border-amber-200">
      <Clock size={10} />
      {t('userManagement.badge.pending')}
    </span>
  );
}

// ── Edit Role Modal ───────────────────────────────────────────
// `roles` is the data-driven, rank-filtered catalog of roles this admin may
// assign (§148 — was a hardcoded 5-role list that hid Foreman/Journeyman/
// Apprentice/Driver + all the Phase-4 positions).
function EditRoleModal({ user, onClose, roles, roleLabelOf }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [role, setRole] = useState(user.role);
  const [error, setError] = useState('');

  // Always include the user's CURRENT role so the select can display it, even
  // if it's not in the assignable set (e.g. equal/higher than the admin's).
  const options = roles.some((r) => r.role_key === user.role)
    ? roles
    : [{ role_key: user.role, label: roleLabelOf(user.role) }, ...roles];

  const mutation = useMutation({
    mutationFn: (newRole) => api.patch(`/users/${user.id}/role`, { role: newRole }),
    onSuccess: () => {
      qc.invalidateQueries(['users']);
      onClose();
    },
    onError: (err) => {
      const msgs = {
        INSUFFICIENT_PRIVILEGE: t('userManagement.modal.errors.insufficientPrivilege'),
        CANNOT_ASSIGN_HIGHER_ROLE: t('userManagement.modal.errors.cannotAssignHigher'),
        INVALID_ROLE: t('userManagement.modal.errors.invalidRole'),
      };
      setError(
        msgs[err.response?.data?.error] ||
          err.response?.data?.error ||
          t('userManagement.modal.errors.updateFailed')
      );
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Shield size={16} className="text-primary" />
            <h2 className="font-semibold text-slate-800">{t('userManagement.modal.heading')}</h2>
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
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              {t('userManagement.modal.newRoleLabel')}
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
            >
              {options.map((r) => (
                <option key={r.role_key} value={r.role_key}>
                  {r.label || roleLabelOf(r.role_key)}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2.5">
              <AlertCircle size={14} />
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              {t('userManagement.modal.cancel')}
            </button>
            <button
              onClick={() => mutation.mutate(role)}
              disabled={mutation.isPending || role === user.role}
              className="flex-1 px-4 py-2.5 bg-primary hover:bg-primary-dark disabled:opacity-60 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2"
            >
              {mutation.isPending ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  {t('userManagement.modal.saving')}
                </>
              ) : (
                <>
                  <Shield size={14} />
                  {t('userManagement.modal.save')}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Per-user Permissions Modal (§148 Phase 5b) ────────────────
// Shows the user's EFFECTIVE permissions = their role+company baseline
// (`inherited`) overlaid with their personal overrides. Toggling a chip away
// from the inherited value creates an override (amber dot); toggling it back
// clears it. Save sends the full effective set; the backend stores only the
// diffs in `user_permissions` (the most-specific can() layer).
function UserPermissionsModal({ user, onClose }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  // `edits` is an overlay of the admin's unsaved toggles ({ 'mod.act': bool });
  // the effective value = edit ?? override ?? inherited. Deriving rather than
  // syncing state from the query avoids a setState-in-effect.
  const [edits, setEdits] = useState({});
  const [error, setError] = useState('');

  const {
    data,
    isLoading,
    isError,
    error: qErr,
  } = useQuery({
    queryKey: ['user-perms', user.id],
    retry: false,
    queryFn: async () => {
      const [u, m] = await Promise.all([
        api.get(`/permissions/user/${user.id}`),
        api.get('/permissions/matrix'),
      ]);
      return { ...u.data, catalog: m.data.catalog || {} };
    },
  });

  const inheritedOf = (mod, act) => !!data?.inherited?.[mod]?.[act];
  const baseOf = (mod, act) => {
    const code = `${mod}.${act}`;
    return code in (data?.overrides || {}) ? data.overrides[code] : inheritedOf(mod, act);
  };
  const currentOf = (mod, act) => {
    const code = `${mod}.${act}`;
    return code in edits ? edits[code] : baseOf(mod, act);
  };
  const toggle = (mod, act) => setEdits((p) => ({ ...p, [`${mod}.${act}`]: !currentOf(mod, act) }));

  const save = useMutation({
    mutationFn: () => {
      const permissions = [];
      for (const mod of Object.keys(data.catalog))
        for (const act of data.catalog[mod])
          permissions.push({ module: mod, action: act, allowed: currentOf(mod, act) });
      return api.put(`/permissions/user/${user.id}`, { permissions });
    },
    onSuccess: () => {
      qc.invalidateQueries(['users']);
      onClose();
    },
    onError: (err) =>
      setError(
        err.response?.data?.error || t('userPerms.saveFailed', { defaultValue: 'Save failed' })
      ),
  });

  // Clears THIS user's personal overrides → reverts them to the role/company
  // baseline (distinct from the matrix "Reset" which resets the role default).
  const reset = useMutation({
    mutationFn: () => api.delete(`/permissions/user/${user.id}`),
    onSuccess: () => {
      qc.invalidateQueries(['users']);
      onClose();
    },
    onError: (err) =>
      setError(
        err.response?.data?.error || t('userPerms.resetFailed', { defaultValue: 'Reset failed' })
      ),
  });

  const hasOverrides = data && Object.keys(data.overrides || {}).length > 0;

  const name = user.first_name ? `${user.first_name} ${user.last_name}` : user.username;
  const lockMsg =
    qErr?.response?.status === 403
      ? t('userPerms.locked', {
          defaultValue: 'You can only edit users whose role ranks below yours.',
        })
      : qErr
        ? qErr.response?.data?.error ||
          t('userPerms.loadFailed', { defaultValue: 'Failed to load.' })
        : '';
  const modules = data ? Object.keys(data.catalog).sort() : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <SlidersHorizontal size={16} className="text-primary" />
            <h2 className="font-semibold text-slate-800">
              {t('userPerms.heading', { defaultValue: 'Permissions' })} ·{' '}
              <span className="text-slate-500 font-normal">{name}</span>
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg">
            <X size={16} className="text-slate-500" />
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={22} className="animate-spin text-primary-light" />
          </div>
        ) : isError ? (
          <div className="flex items-center gap-2 m-6 bg-amber-50 border border-amber-200 text-amber-700 text-sm rounded-lg px-4 py-3">
            <AlertCircle size={14} />
            {lockMsg}
          </div>
        ) : (
          <>
            <div className="px-6 py-2 text-xs text-slate-500 border-b border-slate-100">
              {t('userPerms.hint', {
                defaultValue:
                  'Inherited from the role; an amber dot marks a personal override for this user.',
              })}
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {modules.map((mod) => (
                <div key={mod} className="px-6 py-3">
                  <div className="text-sm font-medium text-slate-700 mb-2">
                    {t(`permissions.modules.${mod}`, { defaultValue: humanizePerm(mod) })}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {data.catalog[mod].map((act) => {
                      const on = currentOf(mod, act);
                      const overridden = on !== inheritedOf(mod, act);
                      return (
                        <button
                          key={act}
                          type="button"
                          onClick={() => toggle(mod, act)}
                          title={`${mod}.${act}`}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs transition-all hover:scale-[1.03]
                            ${
                              on
                                ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                                : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300'
                            }`}
                        >
                          {on ? (
                            <Check className="w-3 h-3" />
                          ) : (
                            <span className="w-2 h-2 rounded-full bg-current opacity-30" />
                          )}
                          {t(`permissions.actions.${act}`, { defaultValue: humanizePerm(act) })}
                          {overridden && (
                            <span
                              className="w-1.5 h-1.5 rounded-full bg-amber-400"
                              title="override"
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {error && (
              <div className="flex items-center gap-2 mx-6 mb-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2.5">
                <AlertCircle size={14} />
                {error}
              </div>
            )}
            <div className="flex gap-3 px-6 py-4 border-t border-slate-100">
              {/* Reset THIS user to their role/company default (clear overrides) */}
              <button
                onClick={() => {
                  if (
                    window.confirm(
                      t('userPerms.confirmReset', {
                        defaultValue: `Reset ${name} to their role default? This clears all personal overrides.`,
                      })
                    )
                  )
                    reset.mutate();
                }}
                disabled={reset.isPending || !hasOverrides}
                title={t('userPerms.resetTooltip', {
                  defaultValue: 'Clear personal overrides — back to the role default',
                })}
                className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-500 hover:text-red-600 hover:border-red-300 disabled:opacity-40 flex items-center gap-1.5"
              >
                {reset.isPending ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <RefreshCw size={14} />
                )}
                {t('userPerms.reset', { defaultValue: 'Reset to default' })}
              </button>
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                {t('userManagement.modal.cancel')}
              </button>
              <button
                onClick={() => save.mutate()}
                disabled={save.isPending}
                className="flex-1 px-4 py-2.5 bg-primary hover:bg-primary-dark disabled:opacity-60 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2"
              >
                {save.isPending ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    {t('userManagement.modal.saving')}
                  </>
                ) : (
                  <>
                    <Check size={14} />
                    {t('userManagement.modal.save')}
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────
export default function UserManagementPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [editModal, setEditModal] = useState(null);
  const [permModal, setPermModal] = useState(null);
  const [toast, setToast] = useState(null);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then((r) => r.data.users || []),
  });

  // §148: roles are data-driven — the Change Role + filter dropdowns now come
  // from the catalog (rank + label), not a hardcoded 5-role list.
  const { user: me } = useAuth();
  const { data: catalog = [] } = useQuery({
    queryKey: ['roles-catalog'],
    queryFn: () => api.get('/permissions/roles').then((r) => r.data.roles || []),
  });
  const isSuper = me?.role === 'SUPER_ADMIN';
  const myRank = catalog.find((r) => r.role_key === me?.role)?.rank ?? 0;
  const roleLabelOf = (key) =>
    catalog.find((r) => r.role_key === key)?.label ||
    t(`userManagement.roleLabels.${key}`, { defaultValue: humanizePerm(key) });
  // Senior→junior; the assignable set is everything ranked below the admin
  // (the same rank-lock as the permissions matrix). SUPER_ADMIN may assign all.
  const sortedCatalog = [...catalog]
    .filter((r) => r.is_active !== false)
    .sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0));
  const assignableRoles = sortedCatalog.filter((r) => isSuper || (r.rank ?? 0) < myRank);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const statusMutation = useMutation({
    mutationFn: ({ id, is_active }) => api.patch(`/users/${id}/status`, { is_active }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries(['users']);
      showToast(
        vars.is_active ? t('userManagement.toast.activated') : t('userManagement.toast.deactivated')
      );
    },
    onError: (err) => {
      const msgs = {
        CANNOT_DEACTIVATE_SELF: t('userManagement.errors.cannotDeactivateSelf'),
        INSUFFICIENT_PRIVILEGE: t('userManagement.errors.insufficientPrivilegeStatus'),
      };
      showToast(
        msgs[err.response?.data?.error] || t('userManagement.errors.updateStatusFailed'),
        'error'
      );
    },
  });

  const resendMutation = useMutation({
    mutationFn: (id) => api.post(`/users/${id}/resend`),
    onSuccess: () => {
      qc.invalidateQueries(['users']);
      showToast(t('userManagement.toast.resent'));
    },
    onError: (err) => {
      const msgs = {
        ALREADY_ACTIVATED: t('userManagement.errors.alreadyActivated'),
        EMAIL_NOT_CONFIGURED: t('userManagement.errors.emailNotConfigured'),
        NO_EMAIL_ON_RECORD: t('userManagement.errors.noEmailOnRecord'),
      };
      showToast(
        msgs[err.response?.data?.error] || t('userManagement.errors.resendFailed'),
        'error'
      );
    },
  });

  const filtered = users.filter((u) => {
    const name = `${u.first_name || ''} ${u.last_name || ''} ${u.username || ''}`.toLowerCase();
    const matchSearch =
      !search ||
      name.includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase());
    const matchRole = !filterRole || u.role === filterRole;
    const matchStatus =
      !filterStatus ||
      (filterStatus === 'active' && u.is_active && u.activated_at) ||
      (filterStatus === 'pending' && u.is_active && !u.activated_at) ||
      (filterStatus === 'disabled' && !u.is_active);
    return matchSearch && matchRole && matchStatus;
  });

  const stats = {
    total: users.length,
    active: users.filter((u) => u.is_active && u.activated_at).length,
    pending: users.filter((u) => u.is_active && !u.activated_at).length,
    disabled: users.filter((u) => !u.is_active).length,
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{t('userManagement.title')}</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {t('userManagement.totalSuffix', { count: users.length })}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          {
            key: 'total',
            value: stats.total,
            color: 'text-slate-700',
            bg: 'bg-slate-50',
            border: 'border-slate-200',
          },
          {
            key: 'active',
            value: stats.active,
            color: 'text-emerald-700',
            bg: 'bg-emerald-50',
            border: 'border-emerald-200',
          },
          {
            key: 'pending',
            value: stats.pending,
            color: 'text-amber-700',
            bg: 'bg-amber-50',
            border: 'border-amber-200',
          },
          {
            key: 'disabled',
            value: stats.disabled,
            color: 'text-red-700',
            bg: 'bg-red-50',
            border: 'border-red-200',
          },
        ].map((s) => (
          <div key={s.key} className={`${s.bg} border ${s.border} rounded-xl px-4 py-3`}>
            <p className="text-xs text-slate-500 mb-1">{t(`userManagement.stats.${s.key}`)}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('userManagement.searchPlaceholder')}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div className="relative">
          <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            className="pl-8 pr-8 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary appearance-none"
          >
            <option value="">{t('userManagement.allRoles')}</option>
            {sortedCatalog.map((r) => (
              <option key={r.role_key} value={r.role_key}>
                {r.label || roleLabelOf(r.role_key)}
              </option>
            ))}
          </select>
        </div>
        <div className="relative">
          <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="pl-8 pr-8 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary appearance-none"
          >
            <option value="">{t('userManagement.allStatus')}</option>
            <option value="active">{t('userManagement.statusFilter.active')}</option>
            <option value="pending">{t('userManagement.statusFilter.pending')}</option>
            <option value="disabled">{t('userManagement.statusFilter.disabled')}</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-primary-light" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Users size={32} className="mx-auto text-slate-300 mb-3" />
            <p className="text-slate-500 font-medium">{t('userManagement.empty')}</p>
            <p className="text-slate-400 text-sm mt-1">{t('userManagement.emptyHint')}</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  {t('userManagement.th.user')}
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  {t('userManagement.th.role')}
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  {t('userManagement.th.trade')}
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  {t('userManagement.th.status')}
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  {t('userManagement.th.joined')}
                </th>
                <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-right">
                  {t('userManagement.th.actions')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((u) => (
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
                          {u.email && (
                            <span className="flex items-center gap-0.5">
                              <Mail size={10} />
                              {u.email}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Role */}
                  <td className="px-5 py-3.5">
                    <RoleBadge role={u.role} label={roleLabelOf(u.role)} />
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
                          ? t('userManagement.invitedPrefix', {
                              date: new Date(u.activation_sent_at).toLocaleDateString(),
                            })
                          : '—'}
                    </span>
                  </td>

                  {/* Actions */}
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {/* Change Role */}
                      <button
                        onClick={() => setEditModal(u)}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary-pale rounded-lg transition-colors"
                        title={t('userManagement.actions.roleTooltip')}
                      >
                        <Shield size={12} />
                        {t('userManagement.actions.role')}
                      </button>

                      {/* Per-user permissions (§148 Phase 5b) */}
                      <button
                        onClick={() => setPermModal(u)}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary-pale rounded-lg transition-colors"
                        title={t('userPerms.tooltip', {
                          defaultValue: 'Edit this user’s permissions',
                        })}
                      >
                        <SlidersHorizontal size={12} />
                        {t('userPerms.action', { defaultValue: 'Permissions' })}
                      </button>

                      {/* Resend invite (only for pending) */}
                      {u.is_active && !u.activated_at && (
                        <button
                          onClick={() => resendMutation.mutate(u.id)}
                          disabled={resendMutation.isPending}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                          title={t('userManagement.actions.resendTooltip')}
                        >
                          {resendMutation.isPending ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Mail size={12} />
                          )}
                          {t('userManagement.actions.resend')}
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
                        title={
                          u.is_active
                            ? t('userManagement.actions.disableTooltip')
                            : t('userManagement.actions.enableTooltip')
                        }
                      >
                        {u.is_active ? (
                          <>
                            <ToggleRight size={14} />
                            {t('userManagement.actions.disable')}
                          </>
                        ) : (
                          <>
                            <ToggleLeft size={14} />
                            {t('userManagement.actions.enable')}
                          </>
                        )}
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
        <EditRoleModal
          user={editModal}
          onClose={() => setEditModal(null)}
          roles={assignableRoles}
          roleLabelOf={roleLabelOf}
        />
      )}

      {/* Per-user Permissions Modal */}
      {permModal && <UserPermissionsModal user={permModal} onClose={() => setPermModal(null)} />}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3 rounded-lg border shadow-xl text-sm font-medium
          ${
            toast.type === 'success'
              ? 'bg-emerald-950 border-emerald-500/40 text-emerald-300'
              : 'bg-red-950 border-red-500/40 text-red-300'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle className="w-4 h-4 text-emerald-400" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-400" />
          )}
          {toast.msg}
        </div>
      )}
    </div>
  );
}
