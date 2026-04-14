import React from 'react';
import SubMenuScreen, { SubMenuItem } from '../shared/SubMenuScreen';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../store/useAuthStore';

const FOREMAN_ROLES = ['FOREMAN', 'TRADE_ADMIN', 'COMPANY_ADMIN', 'TRADE_PROJECT_MANAGER', 'SUPER_ADMIN', 'IT_ADMIN'];

export default function MaterialsMenuScreen() {
  const { t } = useTranslation();
  const user = useAuthStore(s => s.user);
  const isForeman = FOREMAN_ROLES.includes((user?.role || '').toUpperCase());

  const items: SubMenuItem[] = [
    {
      id: 'new_request',
      label: t('materials.newRequest'),
      description: t('materials.newRequestDesc'),
      icon: 'add-circle-outline',
      color: '#0891b2',
      bg: '#ecfeff',
      screen: 'MaterialRequest',
    },
    {
      id: 'my_requests',
      label: t('materials.myRequests'),
      description: t('materials.myRequestsDesc'),
      icon: 'list-outline',
      color: '#7c3aed',
      bg: '#f5f3ff',
      screen: 'MyRequests',
    },
  ];

  return <SubMenuScreen title="Materials" items={items} />;
}
