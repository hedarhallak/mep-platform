import React from 'react';
import SubMenuScreen, { SubMenuItem } from '../shared/SubMenuScreen';
import { useAuthStore } from '../../store/useAuthStore';

const FOREMAN_ROLES = ['FOREMAN', 'TRADE_ADMIN', 'COMPANY_ADMIN', 'TRADE_PROJECT_MANAGER', 'SUPER_ADMIN', 'IT_ADMIN'];

export default function MaterialsMenuScreen() {
  const user = useAuthStore(s => s.user);
  const isForeman = FOREMAN_ROLES.includes((user?.role || '').toUpperCase());

  const items: SubMenuItem[] = [
    {
      id: 'new_request',
      label: 'New Request',
      description: 'Submit a new material request for your project',
      icon: 'add-circle-outline',
      color: '#0891b2',
      bg: '#ecfeff',
      screen: 'MaterialRequest',
    },
    {
      id: 'my_requests',
      label: 'My Requests',
      description: 'View and track your submitted requests',
      icon: 'list-outline',
      color: '#7c3aed',
      bg: '#f5f3ff',
      screen: 'MyRequests',
    },
  ];

  return <SubMenuScreen title="Materials" items={items} />;
}
