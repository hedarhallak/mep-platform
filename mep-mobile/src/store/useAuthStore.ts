import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { apiClient } from '../api/client';
import { usePermsStore } from './usePermsStore';

interface User {
  id: number;
  email: string;
  name: string;
  role: string;
  employee_id: number;
  company_id: number;
}

interface AuthStore {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  setAuth: (user: User, token: string, refreshToken?: string) => Promise<void>;
  logout: () => Promise<void>;
  loadFromStorage: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  token: null,
  isLoading: true,

  setAuth: async (user, token, refreshToken) => {
    await SecureStore.setItemAsync('mep_token', token);
    await SecureStore.setItemAsync('mep_user', JSON.stringify(user));
    if (refreshToken) {
      await SecureStore.setItemAsync('mep_refresh_token', refreshToken);
    }
    set({ user, token });
    // §149: load the user's effective permissions so the Dashboard gates icons
    // by permission (not a hardcoded role list).
    usePermsStore.getState().fetchPerms();
  },

  logout: async () => {
    // Revoke refresh token on server (best effort)
    try {
      const refreshToken = await SecureStore.getItemAsync('mep_refresh_token');
      if (refreshToken) {
        await apiClient.post('/api/auth/logout', { refresh_token: refreshToken });
      }
    } catch {
      // Best effort — continue with local cleanup
    }
    await SecureStore.deleteItemAsync('mep_token');
    await SecureStore.deleteItemAsync('mep_refresh_token');
    await SecureStore.deleteItemAsync('mep_user');
    usePermsStore.getState().clear();
    set({ user: null, token: null });
  },

  loadFromStorage: async () => {
    try {
      const token = await SecureStore.getItemAsync('mep_token');
      const userStr = await SecureStore.getItemAsync('mep_user');
      if (token && userStr) {
        set({ user: JSON.parse(userStr), token });
        usePermsStore.getState().fetchPerms();
      }
    } catch (e) {
      // ignore
    } finally {
      set({ isLoading: false });
    }
  },
}));
