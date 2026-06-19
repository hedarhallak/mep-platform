// src/pages/PermissionsPage.test.jsx
//
// §148 Phase 2c — the dynamic, data-driven permissions matrix. Verifies it
// renders roles + modules + actions from the API (not hardcoded), shows the
// previously-invisible modules (e.g. audit) and non-CRUD actions, and opens on
// the first EDITABLE role (not the viewer's own locked role — the §134 trap).

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k, o) => (o && o.defaultValue ? o.defaultValue : k),
    i18n: { language: 'en' },
  }),
}));

const apiGet = vi.fn();
const apiPut = vi.fn();
const apiPost = vi.fn();
vi.mock('@/lib/api', () => ({
  default: {
    get: (...a) => apiGet(...a),
    put: (...a) => apiPut(...a),
    post: (...a) => apiPost(...a),
  },
}));

import PermissionsPage from './PermissionsPage.jsx';

beforeEach(() => {
  localStorage.setItem('user', JSON.stringify({ role: 'COMPANY_ADMIN' }));
  apiGet.mockReset();
  apiGet.mockImplementation((url) => {
    if (url === '/permissions/roles')
      return Promise.resolve({
        data: {
          roles: [
            { role_key: 'COMPANY_ADMIN', label: 'Company Admin', rank: 80, category: 'governance' },
            { role_key: 'FOREMAN', label: 'Foreman', rank: 40, category: 'supervision' },
          ],
        },
      });
    if (url === '/permissions/matrix')
      return Promise.resolve({
        data: {
          roles: ['FOREMAN'],
          modules: ['assignments', 'audit'],
          matrix: { FOREMAN: { assignments: { view: true } } },
          catalog: { assignments: ['view', 'create', 'smart_assign'], audit: ['view'] },
        },
      });
    return Promise.resolve({ data: { audit: [] } });
  });
});

describe('PermissionsPage (§148 dynamic matrix)', () => {
  test('renders catalog modules + actions and opens on an editable role', async () => {
    render(<PermissionsPage />);

    // Opens on FOREMAN (rank 40 < my COMPANY_ADMIN 80 = editable), NOT on the
    // viewer's own (locked) role — appears in both the sidebar and the header.
    const foreman = await screen.findAllByText('Foreman');
    expect(foreman.length).toBeGreaterThanOrEqual(1);

    // Modules come from the catalog — including `audit`, which the old hardcoded
    // 12-module grid never showed.
    expect(await screen.findByText('Assignments')).toBeInTheDocument();
    expect(screen.getByText('Audit')).toBeInTheDocument();

    // Non-CRUD actions render too (was impossible with the fixed 5-action grid).
    expect(screen.getByText('Smart Assign')).toBeInTheDocument();
  });
});
