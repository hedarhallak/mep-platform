import React, { useEffect, useState } from 'react';
import SubMenuScreen, { SubMenuItem } from '../shared/SubMenuScreen';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../../api/client';

export default function TasksMenuScreen() {
  const { t } = useTranslation();
  const [sentCount, setSentCount] = useState(0);

  useEffect(() => {
    apiClient.get('/api/hub/messages/sent')
      .then(r => setSentCount(r.data?.messages?.length || 0))
      .catch(() => {});
  }, []);

  const items: SubMenuItem[] = [
    {
      id: 'new_task',
      label: t('tasks.newTask'),
      description: t('tasks.newTaskDesc'),
      icon: 'send-outline',
      color: '#dc2626',
      bg: '#fef2f2',
      screen: 'NewTask',
    },
    {
      id: 'sent_tasks',
      label: t('tasks.sentTasks'),
      description: t('tasks.sentTasksDesc'),
      icon: 'checkmark-circle-outline',
      color: '#059669',
      bg: '#ecfdf5',
      screen: 'SentTasks',
      badge: sentCount,
    },
  ];

  return <SubMenuScreen title="Tasks" items={items} />;
}
