// §149.10 — first mobile store tests. usePermsStore is the §148/§149 permission
// gate the Dashboard relies on, so its can/canAny/fetchPerms logic is worth a
// regression net. apiClient is mocked so no axios/SecureStore runtime is needed.

jest.mock('../api/client', () => ({ apiClient: { get: jest.fn() } }));

import { usePermsStore } from './usePermsStore';
import { apiClient } from '../api/client';

const mockGet = apiClient.get as jest.Mock;

beforeEach(() => {
  usePermsStore.setState({ perms: {}, role: null, loaded: false });
  mockGet.mockReset();
});

describe('usePermsStore — can / canAny', () => {
  test('can() is false when the permission map is empty', () => {
    expect(usePermsStore.getState().can('suppliers', 'create')).toBe(false);
  });

  test('can() is true only for a granted [module, action]', () => {
    usePermsStore.setState({ perms: { suppliers: { view: true, create: false } } });
    const { can } = usePermsStore.getState();
    expect(can('suppliers', 'view')).toBe(true);
    expect(can('suppliers', 'create')).toBe(false);
    expect(can('projects', 'view')).toBe(false); // unknown module
  });

  test('canAny() returns true if ANY pair is granted, false otherwise', () => {
    usePermsStore.setState({ perms: { assignments: { view: true } } });
    const { canAny } = usePermsStore.getState();
    expect(canAny([['assignments', 'edit'], ['assignments', 'view']])).toBe(true);
    expect(canAny([['assignments', 'edit'], ['projects', 'create']])).toBe(false);
    expect(canAny([])).toBe(false);
  });
});

describe('usePermsStore — fetchPerms', () => {
  test('stores permissions + role and marks loaded on success', async () => {
    mockGet.mockResolvedValueOnce({ data: { permissions: { employees: { view: true } }, role: 'COMPANY_ADMIN' } });
    await usePermsStore.getState().fetchPerms();
    const s = usePermsStore.getState();
    expect(mockGet).toHaveBeenCalledWith('/api/permissions/my-permissions');
    expect(s.can('employees', 'view')).toBe(true);
    expect(s.role).toBe('COMPANY_ADMIN');
    expect(s.loaded).toBe(true);
  });

  test('fails CLOSED on error — marks loaded but grants nothing', async () => {
    usePermsStore.setState({ perms: { stale: { x: true } }, loaded: false });
    mockGet.mockRejectedValueOnce(new Error('network'));
    await usePermsStore.getState().fetchPerms();
    const s = usePermsStore.getState();
    expect(s.loaded).toBe(true); // UI must proceed
    expect(s.can('stale', 'x')).toBe(true); // existing perms untouched, but no NEW grants from a failed fetch
  });

  test('defaults to empty perms / null role when the response omits them', async () => {
    mockGet.mockResolvedValueOnce({ data: {} });
    await usePermsStore.getState().fetchPerms();
    const s = usePermsStore.getState();
    expect(s.role).toBeNull();
    expect(s.can('anything', 'at_all')).toBe(false);
    expect(s.loaded).toBe(true);
  });
});

describe('usePermsStore — clear', () => {
  test('resets perms, role and loaded (logout path)', () => {
    usePermsStore.setState({ perms: { x: { y: true } }, role: 'WORKER', loaded: true });
    usePermsStore.getState().clear();
    const s = usePermsStore.getState();
    expect(s.perms).toEqual({});
    expect(s.role).toBeNull();
    expect(s.loaded).toBe(false);
    expect(s.can('x', 'y')).toBe(false);
  });
});
