import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import api from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';

const PermissionsContext = createContext(null);

export function PermissionsProvider({ children }) {
  const { user, loading: authLoading } = useAuth();
  const [permissions, setPermissions]  = useState(null);
  const [role, setRole]                = useState(null);
  const [error, setError]              = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/permissions/my-permissions');
      setPermissions(data.permissions);
      setRole(data.role);
    } catch {
      setError(true);
      setPermissions({});
    }
  }, []);

  useEffect(() => {
    // Wait until auth is done and user is logged in
    if (authLoading) return;
    if (!user) {
      setPermissions({});
      setRole(null);
      return;
    }
    load();
  }, [user, authLoading, load]);

  const can = useCallback(
    (module, action = 'view') => {
      if (!permissions) return false;
      if (role === 'SUPER_ADMIN') return true;
      return !!permissions?.[module]?.[action];
    },
    [permissions, role]
  );

  return (
    <PermissionsContext.Provider
      value={{
        permissions,
        role,
        can,
        loading: authLoading || permissions === null,
        error,
        reload: load,
      }}
    >
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions() {
  const ctx = useContext(PermissionsContext);
  if (!ctx) throw new Error('usePermissions must be inside PermissionsProvider');
  return ctx;
}

export function Can({ module, action = 'view', fallback = null, children }) {
  const { can, loading } = usePermissions();
  if (loading) return null;
  return can(module, action) ? children : fallback;
}
