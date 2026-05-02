// Phase 68b (May 2026) — first real component / hook test on mep-frontend.
//
// Covers usePermissions / PermissionsProvider / Can. The hook owns one of
// the most important RBAC surfaces in the app — every gated UI element
// reads from `can(module, action)`, so a regression here is invisible
// until a worker can suddenly see "Delete project" or, worse, an admin
// can't approve a request.
//
// Strategy: mock `@/hooks/useAuth` and `@/lib/api` at the file top so the
// real PermissionsProvider runs against deterministic stubs. Then assert
// against the rendered Can output.

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { PermissionsProvider, Can } from './usePermissions';

// Mock useAuth — return a logged-in user, not loading.
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 1, username: 'tester', role: 'COMPANY_ADMIN' },
    loading: false,
  }),
}));

// Mock the API — capture the next response per test.
let nextApiResponse;
let nextApiError;
vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn(() => {
      if (nextApiError) return Promise.reject(nextApiError);
      return Promise.resolve({ data: nextApiResponse });
    }),
  },
}));

beforeEach(() => {
  nextApiResponse = undefined;
  nextApiError = undefined;
});

// Helper: wrap children in the real provider.
function renderWithProvider(children) {
  return render(<PermissionsProvider>{children}</PermissionsProvider>);
}

// ---------------------------------------------------------------------------
// Can — renders children when the permission is granted
// ---------------------------------------------------------------------------

describe('Can (conditional render gate)', () => {
  test('renders children when the user has the requested permission', async () => {
    nextApiResponse = {
      role: 'COMPANY_ADMIN',
      permissions: { projects: { view: true, edit: true } },
    };
    renderWithProvider(
      <Can module="projects" action="view">
        <span data-testid="ok">visible</span>
      </Can>
    );
    await waitFor(() => expect(screen.getByTestId('ok')).toBeInTheDocument());
  });

  test('renders fallback when the user lacks the permission', async () => {
    nextApiResponse = {
      role: 'WORKER',
      permissions: { projects: { view: true } }, // no `edit`
    };
    renderWithProvider(
      <Can module="projects" action="edit" fallback={<span data-testid="nope">denied</span>}>
        <span data-testid="ok">should not render</span>
      </Can>
    );
    await waitFor(() => expect(screen.getByTestId('nope')).toBeInTheDocument());
    expect(screen.queryByTestId('ok')).toBeNull();
  });

  test('SUPER_ADMIN sees children regardless of explicit permission flags', async () => {
    nextApiResponse = {
      role: 'SUPER_ADMIN',
      permissions: {}, // empty — but SUPER_ADMIN bypasses the lookup
    };
    renderWithProvider(
      <Can module="anything" action="literally_anything">
        <span data-testid="ok">super sees all</span>
      </Can>
    );
    await waitFor(() => expect(screen.getByTestId('ok')).toBeInTheDocument());
  });

  test('defaults action to "view" when not specified', async () => {
    nextApiResponse = {
      role: 'WORKER',
      permissions: { projects: { view: true } },
    };
    renderWithProvider(
      <Can module="projects">
        <span data-testid="ok">view-default</span>
      </Can>
    );
    await waitFor(() => expect(screen.getByTestId('ok')).toBeInTheDocument());
  });

  test('handles missing module entry safely (treats as denied)', async () => {
    nextApiResponse = {
      role: 'WORKER',
      permissions: { projects: { view: true } },
    };
    renderWithProvider(
      <Can module="totally_unknown_module" action="view" fallback={<span data-testid="nope">denied</span>}>
        <span>should not render</span>
      </Can>
    );
    await waitFor(() => expect(screen.getByTestId('nope')).toBeInTheDocument());
  });
});

// ---------------------------------------------------------------------------
// PermissionsProvider — error path
// ---------------------------------------------------------------------------

describe('PermissionsProvider error handling', () => {
  test('falls back to empty permissions when the API call rejects', async () => {
    nextApiError = new Error('network down');
    renderWithProvider(
      <Can module="projects" action="view" fallback={<span data-testid="nope">denied</span>}>
        <span>should not render</span>
      </Can>
    );
    // After the fetch rejects, permissions becomes {} → can() returns false
    // → fallback renders.
    await waitFor(() => expect(screen.getByTestId('nope')).toBeInTheDocument());
  });
});
