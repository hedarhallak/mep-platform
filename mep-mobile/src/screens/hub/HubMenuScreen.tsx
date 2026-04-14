import React, { useEffect, useState } from 'react';
import SubMenuScreen, { SubMenuItem } from '../shared/SubMenuScreen';
import { useAuthStore } from '../../store/useAuthStore';
import { apiClient } from '../../api/client';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';

const FOREMAN_ROLES = ['FOREMAN', 'TRADE_ADMIN', 'COMPANY_ADMIN', 'TRADE_PROJECT_MANAGER', 'SUPER_ADMIN', 'IT_ADMIN'];

export default function HubMenuScreen() {
  const user = useAuthStore(s => s.user);
  const isForeman = FOREMAN_ROLES.includes((user?.role || '').toUpperCase());
  const [unread, setUnread] = useState(0);
  const [materialCount, setMaterialCount] = useState(0);

  const fetchCounts = useCallback(async () => {
    try {
      const [r1, r2] = await Promise.all([
        apiClient.get('/api/hub/messages/unread-count'),
        isForeman ? apiClient.get('/api/materials/inbox/count') : Promise.resolve({ data: { count: 0 } }),
      ]);
      setUnread(Number(r1.data?.count || 0));
      setMaterialCount(Number(r2.data?.count || 0));
    } catch {}
  }, [isForeman]);

  useFocusEffect(useCallback(() => { fetchCounts(); }, [fetchCounts]));

  const items: SubMenuItem[] = [
    {
      id: 'inbox',
      label: 'Inbox',
      description: 'Tasks, requests and notifications',
      icon: 'mail-outline',
      color: '#1e3a5f',
      bg: '#eff6ff',
      screen: 'HubInbox',
      badge: unread,
    },
    ...(isForeman ? [{
      id: 'material_requests',
      label: 'Material Requests',
      description: 'Review and merge worker requests',
      icon: 'cube-outline',
      color: '#0891b2',
      bg: '#ecfeff',
      screen: 'HubMaterials',
      badge: materialCount,
    }] : []),
  ];

  return <SubMenuScreen title="My Hub" items={items} />;
}
