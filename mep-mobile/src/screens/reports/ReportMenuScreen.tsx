import React from 'react';
import SubMenuScreen, { SubMenuItem } from '../shared/SubMenuScreen';
import { useTranslation } from 'react-i18next';
import Colors from '../../theme/colors';

export default function ReportMenuScreen() {
  const { t } = useTranslation();
  const items: SubMenuItem[] = [
    { id: 'this_week', label: t('report.thisWeek'), description: t('report.thisWeekDesc'), icon: 'today-outline', color: Colors.primary, bg: Colors.primaryPale, screen: 'ReportView', params: { period: 'this_week' } },
    { id: 'last_week', label: t('report.lastWeek'), description: t('report.lastWeekDesc'), icon: 'calendar-outline', color: '#7c3aed', bg: '#f5f3ff', screen: 'ReportView', params: { period: 'last_week' } },
    { id: 'custom', label: t('report.customDate'), description: t('report.customDateDesc'), icon: 'options-outline', color: '#d97706', bg: '#fffbeb', screen: 'ReportView', params: { period: 'custom' } },
  ];
  return <SubMenuScreen items={items} />;
}
