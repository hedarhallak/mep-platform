import { useState, useEffect, useCallback } from 'react';
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

const ROLES = [
  { key: 'SUPER_ADMIN',           label: 'Super Admin',           color: 'text-red-400',    bg: 'bg-red-500/10    border-red-500/30'    },
  { key: 'IT_ADMIN',              label: 'IT Admin',              color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/30' },
  { key: 'COMPANY_ADMIN',         label: 'Company Admin',         color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/30' },
  { key: 'TRADE_PROJECT_MANAGER', label: 'Project Manager',       color: 'text-blue-400',   bg: 'bg-blue-500/10   border-blue-500/30'   },
  { key: 'TRADE_ADMIN',           label: 'Trade Admin',           color: 'text-cyan-400',   bg: 'bg-cyan-500/10   border-cyan-500/30'   },
  { key: 'FOREMAN',               label: 'Foreman',               color: 'text-teal-400',   bg: 'bg-teal-500/10   border-teal-500/30'   },
  { key: 'JOURNEYMAN',            label: 'Journeyman',            color: 'text-green-400',  bg: 'bg-green-500/10  border-green-500/30'  },
  { key: 'APPRENTICE_4',          label: 'Apprentice 4',          color: 'text-lime-400',   bg: 'bg-lime-500/10   border-lime-500/30'   },
  { key: 'APPRENTICE_3',          label: 'Apprentice 3',          color: 'text-lime-400',   bg: 'bg-lime-500/10   border-lime-500/30'   },
  { key: 'APPRENTICE_2',          label: 'Apprentice 2',          color: 'text-lime-400',   bg: 'bg-lime-500/10   border-lime-500/30'   },
  { key: 'APPRENTICE_1',          label: 'Apprentice 1',          color: 'text-lime-400',   bg: 'bg-lime-500/10   border-lime-500/30'   },
  { key: 'WORKER',                label: 'Worker',                color: 'text-slate-400',  bg: 'bg-slate-500/10  border-slate-500/30'  },
  { key: 'DRIVER',                label: 'Driver',                color: 'text-violet-400', bg: 'bg-violet-500/10 border-violet-500/30' },
];

const MODULES = [
  { key: 'dashboard',         label: 'Dashboard'         },
  { key: 'projects',          label: 'Projects'          },
  { key: 'employees',         label: 'Employees'         },
  { key: 'assignments',       label: 'Assignments'       },
  { key: 'attendance',        label: 'Attendance'        },
  { key: 'material_requests', label: 'Material Requests' },
  { key: 'purchase_orders',   label: 'Purchase Orders'   },
  { key: 'suppliers',         label: 'Suppliers'         },
  { key: 'workforce_planner', label: 'Workforce Planner' },
  { key: 'reports',           label: 'Reports / BI'      },
  { key: 'permissions',       label: 'Permissions'       },
  { key: 'settings',          label: 'Settings'          },
];

const ACTIONS = ['view', 'create', 'edit', 'delete', 'approve'];

const ACTION_META = {
  view:    { label: 'View',    color: 'text-slate-300'   },
  create:  { label: 'Create',  color: 'text-emerald-400' },
  edit:    { label: 'Edit',    color: 'text-blue-400'    },
  delete:  { label: 'Delete',  color: 'text-red-400'     },
  approve: { label: 'Approve', color: 'text-purple-400'  },
};

function buildEmptyMatrix() {
  const m = {};
  for (const role of ROLES) {
    m[role.key] = {};
    for (const mod of MODULES) {
      m[role.key][mod.key] = {};
      for (const action of ACTIONS) {
        m[role.key][mod.key][action] = false;
      }
    }
  }
  return m;
}

function Toast({ message, type, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3 rounded-lg border shadow-xl text-sm font-medium
      ${type === 'success'
        ? 'bg-emerald-950 border-emerald-500/40 text-emerald-300'
        : 'bg-red-950 border-red-500/40 text-red-300'
      }`}>
      {type === 'success'
        ? <Check className="w-4 h-4 text-emerald-400" />
        : <X className="w-4 h-4 text-red-400" />}
      {message}
    </div>
  );
}

function AuditLog({ logs, loading }) {
  if (loading) return <div className="text-center py-8 text-slate-500 text-sm">Loading audit logâ€¦</div>;
  if (!logs.length) return <div className="text-center py-8 text-slate-500 text-sm">No permission changes recorded yet.</div>;
  return (
    <div className="divide-y divide-slate-800">
      {logs.map(entry => (
        <div key={entry.id} className="flex items-start gap-4 py-3 px-1">
          <Clock className="w-4 h-4 text-slate-500 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-slate-300">
              <span className="text-slate-100 font-medium">{entry.changed_by}</span>
              {' '}updated permissions for{' '}
              <span className="font-mono text-xs bg-slate-800 px-1.5 py-0.5 rounded text-amber-300">
                {entry.details?.role || 'â€”'}
              </span>
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              {new Date(entry.created_at).toLocaleString()} Â· {entry.changer_role}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function PermissionCheckbox({ checked, disabled, onChange, action }) {
  const meta = ACTION_META[action];
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`w-7 h-7 rounded flex items-center justify-center border transition-all duration-150
        ${disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer hover:scale-110'}
        ${checked
          ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-400'
          : 'bg-slate-800/60 border-slate-700 text-slate-600 hover:border-slate-500'
        }`}
      title={`${meta.label}${disabled ? ' (locked)' : ''}`}
    >
      {checked
        ? <Check className="w-3.5 h-3.5" />
        : <span className="w-2 h-2 rounded-full bg-current opacity-30" />
      }
    </button>
  );
}

export default function PermissionsPage() {
  const [selectedRole, setSelectedRole]     = useState('COMPANY_ADMIN');
  const [matrix, setMatrix]                 = useState(buildEmptyMatrix());
  const [originalMatrix, setOriginalMatrix] = useState(buildEmptyMatrix());
  const [loading, setLoading]               = useState(true);
  const [saving, setSaving]                 = useState(false);
  const [resetting, setResetting]           = useState(false);
  const [toast, setToast]                   = useState(null);
  const [auditLogs, setAuditLogs]           = useState([]);
  const [auditLoading, setAuditLoading]     = useState(false);
  const [showAudit, setShowAudit]           = useState(false);

  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const callerRank  = { SUPER_ADMIN: 0, IT_ADMIN: 1, COMPANY_ADMIN: 2, TRADE_PROJECT_MANAGER: 3, TRADE_ADMIN: 4, FOREMAN: 5, JOURNEYMAN: 6, APPRENTICE_4: 7, APPRENTICE_3: 7, APPRENTICE_2: 7, APPRENTICE_1: 7, WORKER: 8, DRIVER: 8 };
  const roleInfo    = ROLES.find(r => r.key === selectedRole);
  const isEditable  = callerRank[currentUser.role] < callerRank[selectedRole];

  const showToast = (message, type = 'success') => setToast({ message, type });

  const fetchMatrix = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/permissions/matrix');
      const built = buildEmptyMatrix();
      for (const roleKey of Object.keys(data.matrix)) {
        for (const mod of Object.keys(data.matrix[roleKey])) {
          for (const action of Object.keys(data.matrix[roleKey][mod])) {
            if (built[roleKey]?.[mod] !== undefined) {
              built[roleKey][mod][action] = data.matrix[roleKey][mod][action];
            }
          }
        }
      }
      setMatrix(JSON.parse(JSON.stringify(built)));
      setOriginalMatrix(JSON.parse(JSON.stringify(built)));
    } catch {
      showToast('Failed to load permissions matrix', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMatrix(); }, [fetchMatrix]);

  const fetchAudit = useCallback(async () => {
    if (!showAudit) return;
    setAuditLoading(true);
    try {
      const { data } = await api.get('/permissions/audit');
      setAuditLogs(data.audit || []);
    } catch {
      showToast('Failed to load audit log', 'error');
    } finally {
      setAuditLoading(false);
    }
  }, [showAudit]);

  useEffect(() => { fetchAudit(); }, [fetchAudit]);

  const hasChanges = JSON.stringify(matrix[selectedRole]) !== JSON.stringify(originalMatrix[selectedRole]);

  const togglePermission = (mod, action, value) => {
    if (!isEditable) return;
    setMatrix(prev => ({
      ...prev,
      [selectedRole]: { ...prev[selectedRole], [mod]: { ...prev[selectedRole][mod], [action]: value } }
    }));
  };

  const toggleModule = (mod, value) => {
    if (!isEditable) return;
    const updated = {};
    for (const action of ACTIONS) updated[action] = value;
    setMatrix(prev => ({ ...prev, [selectedRole]: { ...prev[selectedRole], [mod]: updated } }));
  };

  const toggleAction = (action, value) => {
    if (!isEditable) return;
    const updated = { ...matrix[selectedRole] };
    for (const mod of MODULES) updated[mod.key] = { ...updated[mod.key], [action]: value };
    setMatrix(prev => ({ ...prev, [selectedRole]: updated }));
  };

  const discardChanges = () => {
    setMatrix(prev => ({ ...prev, [selectedRole]: JSON.parse(JSON.stringify(originalMatrix[selectedRole])) }));
  };

  const savePermissions = async () => {
    setSaving(true);
    try {
      const permissions = [];
      for (const mod of MODULES)
        for (const action of ACTIONS)
          permissions.push({ module: mod.key, action, allowed: matrix[selectedRole][mod.key][action] });
      await api.put(`/permissions/role/${selectedRole}`, { permissions });
      setOriginalMatrix(prev => ({ ...prev, [selectedRole]: JSON.parse(JSON.stringify(matrix[selectedRole])) }));
      showToast(`Permissions saved for ${roleInfo?.label}`);
    } catch (err) {
      showToast(err.response?.data?.error || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const resetToDefaults = async () => {
    if (!window.confirm(`Reset "${roleInfo?.label}" to system defaults?`)) return;
    setResetting(true);
    try {
      await api.post(`/permissions/reset/${selectedRole}`);
      showToast(`"${roleInfo?.label}" reset to defaults`);
      await fetchMatrix();
    } catch (err) {
      showToast(err.response?.data?.error || 'Reset failed', 'error');
    } finally {
      setResetting(false);
    }
  };

  const moduleAllChecked = (modKey) => ACTIONS.every(a => matrix[selectedRole]?.[modKey]?.[a]);
  const modulePartial    = (modKey) => ACTIONS.some(a => matrix[selectedRole]?.[modKey]?.[a]) && !moduleAllChecked(modKey);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-6">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/10 rounded-lg border border-amber-500/20">
              <Shield className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-100">Permissions Matrix</h1>
              <p className="text-xs text-slate-500 mt-0.5">Role-based access control Â· Changes apply company-wide</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAudit(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500 transition-colors"
            >
              <Clock className="w-3.5 h-3.5" />
              Audit Log
              {showAudit ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>

            {['SUPER_ADMIN', 'IT_ADMIN'].includes(currentUser.role) && (
              <button
                onClick={resetToDefaults}
                disabled={resetting || loading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-red-300 hover:border-red-500/40 transition-colors disabled:opacity-40"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${resetting ? 'animate-spin' : ''}`} />
                Reset to Defaults
              </button>
            )}

            {hasChanges && isEditable && (
              <>
                <button
                  onClick={discardChanges}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  Discard
                </button>
                <button
                  onClick={savePermissions}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-xs rounded-lg font-medium bg-amber-500 hover:bg-amber-400 text-slate-950 disabled:opacity-50 transition-colors shadow-lg shadow-amber-500/20"
                >
                  {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  {saving ? 'Savingâ€¦' : 'Save Changes'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Audit Panel */}
        {showAudit && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <h3 className="text-sm font-medium text-slate-300 mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-400" />
              Recent Permission Changes
            </h3>
            <AuditLog logs={auditLogs} loading={auditLoading} />
          </div>
        )}

        {/* Unsaved banner */}
        {hasChanges && isEditable && (
          <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-300">
            <ShieldAlert className="w-4 h-4" />
            Unsaved changes for <strong>{roleInfo?.label}</strong> â€” click "Save Changes" to apply.
          </div>
        )}

        <div className="grid grid-cols-[240px_1fr] gap-6">

          {/* Role Selector */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-widest mb-3">Roles</p>
            {ROLES.map(role => {
              const locked     = callerRank[currentUser.role] >= callerRank[role.key];
              const isSelected = selectedRole === role.key;
              return (
                <button
                  key={role.key}
                  onClick={() => setSelectedRole(role.key)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-all duration-150 flex items-center justify-between
                    ${isSelected
                      ? `${role.bg} ${role.color} font-medium`
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                    }`}
                >
                  <span>{role.label}</span>
                  {locked && <span className="text-[10px] text-slate-600">locked</span>}
                </button>
              );
            })}
          </div>

          {/* Matrix */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">

            <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`text-sm font-semibold ${roleInfo?.color}`}>{roleInfo?.label}</span>
                {!isEditable && (
                  <span className="text-[10px] px-2 py-0.5 bg-slate-800 rounded-full text-slate-500 border border-slate-700">Read-only</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-600 mr-1">Toggle column:</span>
                {ACTIONS.map(action => {
                  const allOn = MODULES.every(m => matrix[selectedRole]?.[m.key]?.[action]);
                  return (
                    <button
                      key={action}
                      disabled={!isEditable}
                      onClick={() => toggleAction(action, !allOn)}
                      className={`text-xs px-2 py-1 rounded border transition-all
                        ${allOn ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400' : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300'}
                        ${!isEditable ? 'opacity-40 cursor-not-allowed' : 'hover:border-slate-500'}`}
                    >
                      {ACTION_META[action].label}
                    </button>
                  );
                })}
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-20 text-slate-500 text-sm">
                <RefreshCw className="w-5 h-5 animate-spin mr-2" />
                Loading matrixâ€¦
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-800">
                      <th className="text-left px-5 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider w-52">Module</th>
                      {ACTIONS.map(action => (
                        <th key={action} className={`text-center px-3 py-2.5 text-xs font-medium uppercase tracking-wider ${ACTION_META[action].color}`}>
                          {ACTION_META[action].label}
                        </th>
                      ))}
                      <th className="text-center px-3 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider w-20">All</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {MODULES.map((mod, idx) => {
                      const allChecked = moduleAllChecked(mod.key);
                      const partial    = modulePartial(mod.key);
                      return (
                        <tr key={mod.key} className={`transition-colors hover:bg-slate-800/40 ${idx % 2 === 0 ? 'bg-slate-900' : 'bg-slate-900/50'}`}>
                          <td className="px-5 py-3">
                            <span className={`text-sm ${allChecked ? 'text-slate-200' : partial ? 'text-slate-300' : 'text-slate-500'}`}>
                              {mod.label}
                            </span>
                            {partial && <span className="ml-2 text-[10px] text-amber-500/70">partial</span>}
                          </td>
                          {ACTIONS.map(action => (
                            <td key={action} className="text-center px-3 py-3">
                              <div className="flex justify-center">
                                <PermissionCheckbox
                                  checked={matrix[selectedRole]?.[mod.key]?.[action] || false}
                                  disabled={!isEditable}
                                  action={action}
                                  onChange={(val) => togglePermission(mod.key, action, val)}
                                />
                              </div>
                            </td>
                          ))}
                          <td className="text-center px-3 py-3">
                            <div className="flex justify-center">
                              <button
                                disabled={!isEditable}
                                onClick={() => toggleModule(mod.key, !allChecked)}
                                className={`w-7 h-7 rounded flex items-center justify-center border text-xs font-bold transition-all
                                  ${!isEditable ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer hover:scale-110'}
                                  ${allChecked
                                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                                    : 'bg-slate-800 border-slate-700 text-slate-500 hover:border-slate-500'
                                  }`}
                              >
                                {allChecked ? 'âœ“' : 'â—‹'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {!loading && (
              <div className="px-5 py-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-500">
                <span>
                  {MODULES.reduce((sum, m) => sum + ACTIONS.filter(a => matrix[selectedRole]?.[m.key]?.[a]).length, 0)}
                  {' '}/ {MODULES.length * ACTIONS.length} permissions enabled
                </span>
                <span className={roleInfo?.color}>{roleInfo?.label}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
