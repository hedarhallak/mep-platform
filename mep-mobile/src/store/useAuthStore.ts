import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
  setAuth: (user: User, token: string) => Promise<void>;
  logout: () => Promise<void>;
  loadFromStorage: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  token: null,
  isLoading: true,

  setAuth: async (user, token) => {
    await AsyncStorage.setItem('mep_token', token);
    await AsyncStorage.setItem('mep_user', JSON.stringify(user));
    set({ user, token });
  },

  logout: async () => {
    await AsyncStorage.removeItem('mep_token');
    await AsyncStorage.removeItem('mep_user');
    set({ user: null, token: null });
  },

  loadFromStorage: async () => {
    try {
      const token = await AsyncStorage.getItem('mep_token');
      const userStr = await AsyncStorage.getItem('mep_user');
      if (token && userStr) {
        set({ user: JSON.parse(userStr), token });
      }
    } catch (e) {
      // ignore
    } finally {
      set({ isLoading: false });
    }
  },
}));
