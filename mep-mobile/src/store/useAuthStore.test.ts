// §149.10 — useAuthStore tests: token/user persistence via SecureStore, the
// permission-store handshake (fetch on login/restore, clear on logout), and the
// best-effort server logout. SecureStore, apiClient and usePermsStore are mocked.

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(async () => {}),
  getItemAsync: jest.fn(async () => null),
  deleteItemAsync: jest.fn(async () => {}),
}));
jest.mock('../api/client', () => ({ apiClient: { post: jest.fn(async () => ({ data: { ok: true } })) } }));

const mockFetchPerms = jest.fn();
const mockClearPerms = jest.fn();
jest.mock('./usePermsStore', () => ({
  usePermsStore: { getState: () => ({ fetchPerms: mockFetchPerms, clear: mockClearPerms }) },
}));

import * as SecureStore from 'expo-secure-store';
import { useAuthStore } from './useAuthStore';
import { apiClient } from '../api/client';

const setItem = SecureStore.setItemAsync as jest.Mock;
const getItem = SecureStore.getItemAsync as jest.Mock;
const delItem = SecureStore.deleteItemAsync as jest.Mock;
const post = apiClient.post as jest.Mock;

const USER = { id: 1, email: 'a@b.ca', name: 'Hedar', role: 'COMPANY_ADMIN', employee_id: 9, company_id: 5 };

beforeEach(() => {
  useAuthStore.setState({ user: null, token: null, isLoading: true });
  [setItem, getItem, delItem, post, mockFetchPerms, mockClearPerms].forEach((m) => m.mockReset());
  getItem.mockResolvedValue(null);
  post.mockResolvedValue({ data: { ok: true } });
});

describe('useAuthStore — setAuth', () => {
  test('persists token + user (+ refresh) and triggers a permissions fetch', async () => {
    await useAuthStore.getState().setAuth(USER as any, 'tok123', 'ref456');
    expect(setItem).toHaveBeenCalledWith('mep_token', 'tok123');
    expect(setItem).toHaveBeenCalledWith('mep_user', JSON.stringify(USER));
    expect(setItem).toHaveBeenCalledWith('mep_refresh_token', 'ref456');
    const s = useAuthStore.getState();
    expect(s.token).toBe('tok123');
    expect(s.user?.name).toBe('Hedar');
    expect(mockFetchPerms).toHaveBeenCalled();
  });

  test('does not write a refresh token when none is provided', async () => {
    await useAuthStore.getState().setAuth(USER as any, 'tok123');
    expect(setItem).not.toHaveBeenCalledWith('mep_refresh_token', expect.anything());
  });
});

describe('useAuthStore — logout', () => {
  test('revokes refresh token server-side, wipes storage, clears perms + state', async () => {
    getItem.mockResolvedValueOnce('ref456'); // refresh token present
    useAuthStore.setState({ user: USER as any, token: 'tok123' });
    await useAuthStore.getState().logout();
    expect(post).toHaveBeenCalledWith('/api/auth/logout', { refresh_token: 'ref456' });
    expect(delItem).toHaveBeenCalledWith('mep_token');
    expect(delItem).toHaveBeenCalledWith('mep_refresh_token');
    expect(delItem).toHaveBeenCalledWith('mep_user');
    expect(mockClearPerms).toHaveBeenCalled();
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().token).toBeNull();
  });

  test('still clears local state when the server logout call fails (best effort)', async () => {
    getItem.mockResolvedValueOnce('ref456');
    post.mockRejectedValueOnce(new Error('offline'));
    useAuthStore.setState({ user: USER as any, token: 'tok123' });
    await useAuthStore.getState().logout();
    expect(delItem).toHaveBeenCalledWith('mep_token');
    expect(useAuthStore.getState().user).toBeNull();
  });

  test('skips the server call when there is no refresh token', async () => {
    getItem.mockResolvedValue(null);
    await useAuthStore.getState().logout();
    expect(post).not.toHaveBeenCalled();
    expect(useAuthStore.getState().token).toBeNull();
  });
});

describe('useAuthStore — loadFromStorage', () => {
  test('restores session + fetches perms when token & user exist', async () => {
    getItem.mockImplementation(async (k: string) =>
      k === 'mep_token' ? 'tok123' : k === 'mep_user' ? JSON.stringify(USER) : null
    );
    await useAuthStore.getState().loadFromStorage();
    const s = useAuthStore.getState();
    expect(s.token).toBe('tok123');
    expect(s.user?.company_id).toBe(5);
    expect(mockFetchPerms).toHaveBeenCalled();
    expect(s.isLoading).toBe(false);
  });

  test('leaves user null and stops loading when storage is empty', async () => {
    getItem.mockResolvedValue(null);
    await useAuthStore.getState().loadFromStorage();
    const s = useAuthStore.getState();
    expect(s.user).toBeNull();
    expect(s.isLoading).toBe(false);
    expect(mockFetchPerms).not.toHaveBeenCalled();
  });

  test('clears loading even if storage read throws', async () => {
    getItem.mockRejectedValueOnce(new Error('keychain error'));
    await useAuthStore.getState().loadFromStorage();
    expect(useAuthStore.getState().isLoading).toBe(false);
  });
});
