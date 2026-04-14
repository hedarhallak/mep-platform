import React from 'react';
import SubMenuScreen, { SubMenuItem } from '../shared/SubMenuScreen';

const items: SubMenuItem[] = [
  {
    id: 'this_week',
    label: 'This Week',
    description: 'View your attendance and hours for this week',
    icon: 'today-outline',
    color: '#1e3a5f',
    bg: '#eff6ff',
    screen: 'ReportView',
    params: { period: 'this_week' },
  },
  {
    id: 'last_week',
    label: 'Last Week',
    description: 'View your attendance and hours for last week',
    icon: 'calendar-outline',
    color: '#7c3aed',
    bg: '#f5f3ff',
    screen: 'ReportView',
    params: { period: 'last_week' },
  },
  {
    id: 'custom',
    label: 'Custom Date',
    description: 'Select a custom date range for your report',
    icon: 'options-outline',
    color: '#d97706',
    bg: '#fffbeb',
    screen: 'ReportView',
    params: { period: 'custom' },
  },
];

export default function ReportMenuScreen() {
  return <SubMenuScreen title="My Report" items={items} />;
}
