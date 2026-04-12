import React, { useEffect, useState } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import AttendanceScreen from '../screens/attendance/AttendanceScreen';
import MaterialsNavigator from './MaterialsNavigator';
import MyReportScreen from '../screens/reports/MyReportScreen';
import MyHubScreen from '../screens/hub/MyHubScreen';
import ProfileScreen from '../screens/profile/ProfileScreen';
import { apiClient } from '../api/client';

const Tab = createBottomTabNavigator();

export default function AppNavigator() {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const fetchUnread = async () => {
      try {
        const res = await apiClient.get('/api/hub/messages/unread-count');
        setUnreadCount(Number(res.data?.count || 0));
      } catch {}
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size }) => {
          const icons: Record<string, any> = {
            Attendance: 'location-outline',
            Materials: 'cube-outline',
            Report: 'bar-chart-outline',
            Hub: 'notifications-outline',
            Profile: 'person-outline',
          };
          return <Ionicons name={icons[route.name]} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#1e3a5f',
        tabBarInactiveTintColor: '#9ca3af',
        tabBarStyle: { backgroundColor: '#ffffff', borderTopColor: '#e5e7eb' },
        headerStyle: { backgroundColor: '#1e3a5f' },
        headerTintColor: '#ffffff',
        headerTitleStyle: { fontWeight: 'bold' },
      })}
    >
      <Tab.Screen name="Attendance" component={AttendanceScreen} options={{ title: 'Check In/Out' }} />
      <Tab.Screen
        name="Materials"
        component={MaterialsNavigator}
        options={{ headerShown: false, title: 'Materials' }}
      />
      <Tab.Screen name="Report" component={MyReportScreen} options={{ title: 'My Report' }} />
      <Tab.Screen
        name="Hub"
        component={MyHubScreen}
        options={{
          title: 'My Hub',
          tabBarBadge: unreadCount > 0 ? (unreadCount > 99 ? '99+' : unreadCount) : undefined,
          tabBarBadgeStyle: { backgroundColor: '#dc2626', color: '#ffffff', fontSize: 10 },
        }}
      />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profile' }} />
    </Tab.Navigator>
  );
}
