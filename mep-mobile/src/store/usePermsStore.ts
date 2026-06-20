// §149 — mobile permission store. Mirrors the web `usePermissions`: it fetches
// the user's EFFECTIVE permissions from `/api/permissions/my-permissions`
// (which already applies the §148 user ▸ company ▸ role resolution and grants
// SUPER_ADMIN everything), so the Dashboard icons reflect what the user can
// actually do — not a hardcoded role list.

import { create } from 'zustand';
import { apiClient } from '../api/client';

type PermMap = Record<string, Record<string, boolean>>;

interface PermsStore {
  perms: PermMap;
  role: string | null;
  loaded: boolean;
  fetchPerms: () => Promise<void>;
  can: (module: string, action: string) => boolean;
  canAny: (pairs: [string, string][]) => boolean;
  clear: () => void;
}

export const usePermsStore = create<PermsStore>((set, get) => ({
  perms: {},
  role: null,
  loaded: false,

  fetchPerms: async () => {
    try {
      const r = await apiClient.get('/api/permissions/my-permissions');
      set({ perms: r.data?.permissions || {}, role: r.data?.role || null, loaded: true });
    } catch {
      // Fail CLOSED (show nothing extra) but mark loaded so the UI proceeds.
      set({ loaded: true });
    }
  },

  can: (module, action) => !!get().perms?.[module]?.[action],
  canAny: (pairs) => pairs.some(([m, a]) => !!get().perms?.[m]?.[a]),
  clear: () => set({ perms: {}, role: null, loaded: false }),
}));
