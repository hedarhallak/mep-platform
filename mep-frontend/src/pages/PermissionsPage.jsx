import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Shield,
  ShieldAlert,
  RefreshCw,
  Check,
  X,
  Clock,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';

// §148 Phase 2 — the role list, modules and actions are ALL data-driven now:
// roles come from GET /permissions/roles (rank + category), and the modules ×
// actions come from GET /permissions/matrix's `catalog`. Nothing here is
// hardcoded, so a new role or a new permission appears automatically.
//
// §148.10 — restyled to the app's LIGHT theme (was the only dark `bg-slate-950`
// page in an otherwise light app, which read as jarring). Cards are now white on
// the AppLayout's slate-50 background, matching Settings / Staffing / etc.

// Category → soft accent for the role sidebar (the only presentation map left).
const CATEGORY_COLORS = {
  platform: { color: 'text-red-600', bg: 'bg-red-50 border-red-200' },
  governance: { color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200' },
  management: { color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200' },
  engineering: { color: 'text-cyan-600', bg: 'bg-cyan-50 border-cyan-200' },
  supervision: { color: 'text-teal-600', bg: 'bg-teal-50 border-teal-200' },
  field: { color: 'text-green-600', bg: 'bg-green-50 border-green-200' },
};
const catColor = (cat) =>
  CATEGORY_COLORS[cat] || { color: 'text-slate-600', bg: 'bg-slate-100 border-slate-200' };

// "smart_assign" → "Smart Assign" — fallback label for codes with no i18n key.
const humanize = (key) =>
  String(key || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

function Toast({ message, type, onClose }) {
  useEffect(() => {
    const tid = setTimeout(onClose, 3500);
    return () => clearTimeout(tid);
  }, [onClose]);

  return (
    <div
      className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3 rounded-xl border shadow-lg text-sm font-medium
      ${
        type === 'success'
          ? 'bg-white border-emerald-200 text-emerald-700'
          : 'bg-white border-red-200 text-red-600'
      }`}
    >
      {type === 'success' ? (
        <Check className="w-4 h-4 text-emerald-500" />
      ) : (
        <X className="w-4 h-4 text-red-500" />
      )}
      {message}
    </div>
  );
}

function AuditLog({ logs, loading }) {
  const { t } = useTranslation();
  if (loading)
    return (
      <div className="text-center py-8 text-slate-400 text-sm">
        {t('permissions.audit.loading')}
      </div>
    );
  if (!logs.length)
    return (
      <div className="text-center py-8 text-slate-400 text-sm">{t('permissions.audit.empty')}</div>
    );
  return (
    <div className="divide-y divide-slate-100">
      {logs.map((entry) => (
        <div key={entry.id} className="flex items-start gap-4 py-3 px-1">
          <Clock className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-slate-600">
              <span className="text-slate-800 font-medium">{entry.changed_by}</span>{' '}
              {t('permissions.audit.updatedFor')}{' '}
              <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded text-amber-700">
                {entry.details?.role || '—'}
              </span>
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              {new Date(entry.created_at).toLocaleString()} · {entry.changer_role}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function PermissionsPage() {
  const { t } = useTranslation();

  // §148 fix: the current user's role comes from the auth CONTEXT (the app does
  // not persist the user in localStorage) — reading localStorage gave undefined,
  // so the rank-lock computed myRank = 0 and locked EVERY role.
  const { user } = useAuth();
  const currentUserRole = user?.role;

  const [roleList, setRoleList] = useState([]); // [{ role_key, label, rank, category }]
  const [catalog, setCatalog] = useState({}); //  { module: [action, ...] }
  const [selectedRole, setSelectedRole] = useState('');
  const [matrix, setMatrix] = useState({}); //         { role: { module: { action: bool } } }
  const [originalMatrix, setOriginalMatrix] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [toast, setToast] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [showAudit, setShowAudit] = useState(false);

  const rankOf = useCallback(
    (roleKey) => roleList.find((r) => r.role_key === roleKey)?.rank ?? 0,
    [roleList]
  );
  const myRank = rankOf(currentUserRole);
  // §148 rank-lock: you may edit ONLY a role ranked strictly below yours.
  const isEditable = myRank > rankOf(selectedRole);
  const selectedRoleObj = roleList.find((r) => r.role_key === selectedRole);
  const roleLabel =
    selectedRoleObj?.label ||
    t(`permissions.roles.${selectedRole}`, { defaultValue: humanize(selectedRole) });
  const moduleKeys = Object.keys(catalog).sort();

  const showToast = (message, type = 'success') => setToast({ message, type });

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [rolesRes, matrixRes] = await Promise.all([
        api.get('/permissions/roles'),
        api.get('/permissions/matrix'),
      ]);
      const roles = rolesRes.data?.roles || [];
      setRoleList(roles);
      setCatalog(matrixRes.data?.catalog || {});

      const built = {};
      const m = matrixRes.data?.matrix || {};
      for (const roleKey of Object.keys(m)) built[roleKey] = m[roleKey];
      setMatrix(JSON.parse(JSON.stringify(built)));
      setOriginalMatrix(JSON.parse(JSON.stringify(built)));

      // §134/§148 UX: open on the most-senior role we can actually EDIT (the
      // first ranked below us) instead of our own (locked) role — otherwise the
      // matrix opens read-only and looks broken. `roles` is sorted senior→junior.
      setSelectedRole((cur) => {
        if (cur) return cur;
        const mine = roles.find((r) => r.role_key === currentUserRole)?.rank ?? 0;
        const firstEditable = roles.find((r) => mine > (r.rank ?? 0));
        return firstEditable?.role_key || currentUserRole || roles[0]?.role_key || '';
      });
    } catch {
      showToast(t('permissions.toast.loadFailed'), 'error');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const fetchAudit = useCallback(async () => {
    if (!showAudit) return;
    setAuditLoading(true);
    try {
      const { data } = await api.get('/permissions/audit');
      setAuditLogs(data.audit || []);
    } catch {
      showToast(t('permissions.toast.auditLoadFailed'), 'error');
    } finally {
      setAuditLoading(false);
    }
  }, [showAudit, t]);

  useEffect(() => {
    fetchAudit();
  }, [fetchAudit]);

  const isOn = (mod, action) => !!matrix[selectedRole]?.[mod]?.[action];
  const hasChanges =
    JSON.stringify(matrix[selectedRole] || {}) !==
    JSON.stringify(originalMatrix[selectedRole] || {});

  const setOne = (mod, action, value) => {
    if (!isEditable) return;
    setMatrix((prev) => {
      const role = { ...(prev[selectedRole] || {}) };
      role[mod] = { ...(role[mod] || {}), [action]: value };
      return { ...prev, [selectedRole]: role };
    });
  };

  const toggleModule = (mod, value) => {
    if (!isEditable) return;
    setMatrix((prev) => {
      const role = { ...(prev[selectedRole] || {}) };
      const updated = {};
      for (const action of catalog[mod] || []) updated[action] = value;
      role[mod] = updated;
      return { ...prev, [selectedRole]: role };
    });
  };

  const discardChanges = () => {
    setMatrix((prev) => ({
      ...prev,
      [selectedRole]: JSON.parse(JSON.stringify(originalMatrix[selectedRole] || {})),
    }));
  };

  const savePermissions = async () => {
    setSaving(true);
    try {
      const permissions = [];
      for (const mod of moduleKeys)
        for (const action of catalog[mod] || [])
          permissions.push({ module: mod, action, allowed: isOn(mod, action) });
      await api.put(`/permissions/role/${selectedRole}`, { permissions });
      setOriginalMatrix((prev) => ({
        ...prev,
        [selectedRole]: JSON.parse(JSON.stringify(matrix[selectedRole] || {})),
      }));
      showToast(t('permissions.toast.saved', { role: roleLabel }));
    } catch (err) {
      showToast(err.response?.data?.error || t('permissions.toast.saveFailed'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const resetToDefaults = async () => {
    if (!window.confirm(t('permissions.confirmReset', { role: roleLabel }))) return;
    setResetting(true);
    try {
      await api.post(`/permissions/reset/${selectedRole}`);
      showToast(t('permissions.toast.resetDone', { role: roleLabel }));
      await fetchAll();
    } catch (err) {
      showToast(err.response?.data?.error || t('permissions.toast.resetFailed'), 'error');
    } finally {
      setResetting(false);
    }
  };

  const moduleAllChecked = (mod) => (catalog[mod] || []).every((a) => isOn(mod, a));
  const modulePartial = (mod) =>
    (catalog[mod] || []).some((a) => isOn(mod, a)) && !moduleAllChecked(mod);

  return (
    <div className="p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center">
              <Shield className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800">{t('permissions.title')}</h1>
              <p className="text-xs text-slate-400 mt-0.5">{t('permissions.subtitle')}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAudit((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-slate-700 hover:border-slate-300 transition-colors"
            >
              <Clock className="w-3.5 h-3.5" />
              {t('permissions.auditLog')}
              {showAudit ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>

            {['SUPER_ADMIN', 'IT_ADMIN', 'OWNER', 'COMPANY_ADMIN'].includes(currentUserRole) &&
              isEditable && (
                <button
                  onClick={resetToDefaults}
                  disabled={resetting || loading}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-red-600 hover:border-red-300 transition-colors disabled:opacity-40"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${resetting ? 'animate-spin' : ''}`} />
                  {t('permissions.resetDefaults')}
                </button>
              )}

            {hasChanges && isEditable && (
              <>
                <button
                  onClick={discardChanges}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-slate-700 hover:border-slate-300 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  {t('permissions.discard')}
                </button>
                <button
                  onClick={savePermissions}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-xs rounded-lg font-medium bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-50 transition-colors shadow-sm shadow-amber-500/20"
                >
                  {saving ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  {saving ? t('permissions.saving') : t('permissions.save')}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Audit Panel */}
        {showAudit && (
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <h3 className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-400" />
              {t('permissions.recentChanges')}
            </h3>
            <AuditLog logs={auditLogs} loading={auditLoading} />
          </div>
        )}

        {/* Unsaved banner */}
        {hasChanges && isEditable && (
          <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
            <ShieldAlert className="w-4 h-4" />
            {t('permissions.unsavedBanner', { role: roleLabel })}
          </div>
        )}

        <div className="grid grid-cols-[240px_1fr] gap-6">
          {/* Role selector — data-driven, grouped senior→junior */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-widest mb-3">
              {t('permissions.sidebar.heading')}
            </p>
            {roleList.map((role) => {
              const locked = myRank <= (role.rank ?? 0);
              const isSelected = selectedRole === role.role_key;
              const c = catColor(role.category);
              const label =
                role.label ||
                t(`permissions.roles.${role.role_key}`, { defaultValue: humanize(role.role_key) });
              return (
                <button
                  key={role.role_key}
                  onClick={() => setSelectedRole(role.role_key)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-all duration-150 flex items-center justify-between
                    ${
                      isSelected
                        ? `${c.bg} ${c.color} font-semibold`
                        : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700'
                    }`}
                >
                  <span>{label}</span>
                  {locked && (
                    <span className="text-[10px] text-slate-300">
                      {t('permissions.sidebar.locked')}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Matrix — one card per module, each with ITS OWN actions as chips */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
              <span
                className={`text-sm font-semibold ${catColor(selectedRoleObj?.category).color}`}
              >
                {roleLabel}
              </span>
              {!isEditable && (
                <span className="text-[10px] px-2 py-0.5 bg-slate-100 rounded-full text-slate-500 border border-slate-200">
                  {t('permissions.matrix.readOnly')}
                </span>
              )}
            </div>

            {/* §134: explain WHY a role is read-only — you can edit only roles
                ranked below your own (privilege-escalation guard). */}
            {!isEditable && (
              <div className="px-5 py-2 bg-amber-50 border-b border-amber-100 text-[11px] text-amber-700">
                {t('permissions.matrix.readOnlyHint')}
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center py-20 text-slate-400 text-sm">
                <RefreshCw className="w-5 h-5 animate-spin mr-2" />
                {t('permissions.matrix.loading')}
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {moduleKeys.map((mod) => {
                  const actions = catalog[mod] || [];
                  const allChecked = moduleAllChecked(mod);
                  const partial = modulePartial(mod);
                  return (
                    <div key={mod} className="px-5 py-3.5 hover:bg-slate-50 transition-colors">
                      <div className="flex items-center justify-between mb-2">
                        <span
                          className={`text-sm font-medium ${
                            allChecked
                              ? 'text-slate-800'
                              : partial
                                ? 'text-slate-600'
                                : 'text-slate-400'
                          }`}
                        >
                          {t(`permissions.modules.${mod}`, { defaultValue: humanize(mod) })}
                          {partial && (
                            <span className="ml-2 text-[10px] text-amber-600">
                              {t('permissions.matrix.partial')}
                            </span>
                          )}
                        </span>
                        <button
                          disabled={!isEditable}
                          onClick={() => toggleModule(mod, !allChecked)}
                          className={`text-[10px] px-2 py-0.5 rounded border transition-all
                            ${!isEditable ? 'opacity-30 cursor-not-allowed' : 'hover:scale-105'}
                            ${
                              allChecked
                                ? 'bg-amber-100 border-amber-300 text-amber-700'
                                : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300'
                            }`}
                        >
                          {t('permissions.matrix.all')}
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {actions.map((action) => {
                          const on = isOn(mod, action);
                          return (
                            <button
                              key={action}
                              type="button"
                              disabled={!isEditable}
                              onClick={() => setOne(mod, action, !on)}
                              title={action}
                              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs transition-all
                                ${!isEditable ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:scale-[1.03]'}
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
                              {t(`permissions.actions.${action}`, {
                                defaultValue: humanize(action),
                              })}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
