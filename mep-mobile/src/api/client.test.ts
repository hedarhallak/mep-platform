// §149.10 — api/client interceptor tests: Bearer auto-attach + the 401→refresh
// rotation flow. No network and no extra deps: we swap apiClient's axios adapter
// for a controllable mock and spy on axios.post (used for the refresh call).
// SecureStore is mocked.

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(async () => {}),
  getItemAsync: jest.fn(async () => null),
  deleteItemAsync: jest.fn(async () => {}),
}));

import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { apiClient, DEV_URL } from './client';

const getItem = SecureStore.getItemAsync as jest.Mock;
const setItem = SecureStore.setItemAsync as jest.Mock;
const delItem = SecureStore.deleteItemAsync as jest.Mock;

const ok = (config: any) => ({ data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config });
const httpError = (config: any, status: number) => {
  const e: any = new Error(`status ${status}`);
  e.config = config;
  e.response = { status, data: {} };
  return e;
};

// Stateful SecureStore so a rotated token persisted mid-flow is read back on retry.
let creds: Record<string, string>;
let adapter: jest.Mock;
beforeEach(() => {
  creds = {};
  getItem.mockReset().mockImplementation(async (k: string) => (k in creds ? creds[k] : null));
  setItem.mockReset().mockImplementation(async (k: string, v: string) => { creds[k] = v; });
  delItem.mockReset().mockImplementation(async (k: string) => { delete creds[k]; });
  adapter = jest.fn(async (config) => ok(config));
  apiClient.defaults.adapter = adapter as any;
});
afterEach(() => jest.restoreAllMocks());

describe('request interceptor — Bearer token', () => {
  test('attaches Authorization when a token is stored', async () => {
    creds.mep_token = 'tok123';
    await apiClient.get('/api/anything');
    expect(adapter.mock.calls[0][0].headers.Authorization).toBe('Bearer tok123');
  });

  test('omits Authorization when no token is stored', async () => {
    await apiClient.get('/api/anything');
    expect(adapter.mock.calls[0][0].headers.Authorization).toBeUndefined();
  });
});

describe('response interceptor — error passthrough', () => {
  test('a non-401 error rejects unchanged and triggers no refresh', async () => {
    const postSpy = jest.spyOn(axios, 'post');
    adapter.mockImplementationOnce(async (config) => Promise.reject(httpError(config, 500)));
    await expect(apiClient.get('/api/x')).rejects.toMatchObject({ response: { status: 500 } });
    expect(postSpy).not.toHaveBeenCalled();
  });
});

describe('response interceptor — 401 refresh flow', () => {
  test('refreshes, persists rotated tokens, and retries the original request', async () => {
    creds.mep_token = 'oldtok';
    creds.mep_refresh_token = 'oldref';
    const postSpy = jest
      .spyOn(axios, 'post')
      .mockResolvedValue({ data: { ok: true, token: 'newtok', refresh_token: 'newref' } } as any);
    // first hit 401, retry succeeds
    adapter
      .mockImplementationOnce(async (config) => Promise.reject(httpError(config, 401)))
      .mockImplementationOnce(async (config) => ok(config));

    const res = await apiClient.get('/api/secure');
    expect(res.status).toBe(200);
    expect(postSpy).toHaveBeenCalledWith(`${DEV_URL}/api/auth/refresh`, { refresh_token: 'oldref' });
    expect(setItem).toHaveBeenCalledWith('mep_token', 'newtok');
    expect(setItem).toHaveBeenCalledWith('mep_refresh_token', 'newref');
    // retry carried the fresh token
    expect(adapter.mock.calls[1][0].headers.Authorization).toBe('Bearer newtok');
  });

  test('clears the session and rejects when the refresh call fails', async () => {
    creds.mep_token = 'oldtok';
    creds.mep_refresh_token = 'oldref';
    jest.spyOn(axios, 'post').mockRejectedValue(new Error('refresh 401'));
    adapter.mockImplementationOnce(async (config) => Promise.reject(httpError(config, 401)));

    await expect(apiClient.get('/api/secure')).rejects.toBeTruthy();
    expect(delItem).toHaveBeenCalledWith('mep_token');
    expect(delItem).toHaveBeenCalledWith('mep_refresh_token');
    expect(delItem).toHaveBeenCalledWith('mep_user');
  });

  test('does not attempt a refresh for the login endpoint', async () => {
    const postSpy = jest.spyOn(axios, 'post');
    adapter.mockImplementationOnce(async (config) => Promise.reject(httpError(config, 401)));
    await expect(apiClient.post('/api/auth/login', {})).rejects.toMatchObject({ response: { status: 401 } });
    expect(postSpy).not.toHaveBeenCalled();
  });
});
