import React, { useEffect, useState } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import MainStackNavigator from './MainStackNavigator';
import HubMenuScreen from '../screens/hub/HubMenuScreen';
import MyHubScreen from '../screens/hub/MyHubScreen';
import ForemanMaterialsTab from '../screens/materials/ForemanMaterialsTab';
import ProfileScreen from '../screens/profile/ProfileScreen';
import ChangePinScreen from '../screens/profile/ChangePinScreen';
import { createStackNavigator } from '@react-navigation/stack';
import MergeEditScreen from '../screens/materials/MergeEditScreen';
import { apiClient } from '../api/client';
import { useTranslation } from 'react-i18next';

const Tab = createBottomTabNavigator();
const ProfileStack = createStackNavigator();

const headerOptions = {
  headerStyle: { backgroundColor: '#1e3a5f' },
  headerTintColor: '#ffffff',
  headerTitleStyle: { fontWeight: 'bold' as const },
};

const HubStack = createStackNavigator();

const headerOptions2 = {
  headerStyle: { backgroundColor: '#1e3a5f' },
  headerTintColor: '#ffffff',
  headerTitleStyle: { fontWeight: 'bold' as const },
};

function HubNavigator() {
  const { t } = useTranslation();
  return (
    <HubStack.Navigator>
      <HubStack.Screen
        name="HubMenu"
        component={HubMenuScreen}
        options={{ ...headerOptions2, title: t('modules.myHub') }}
      />
      <HubStack.Screen
        name="HubInbox"
        component={MyHubScreen}
        options={{ ...headerOptions2, title: t('hub.inbox') }}
      />
      <HubStack.Screen
        name="HubMaterials"
        component={ForemanMaterialsTab}
        options={{ ...headerOptions2, title: t('hub.materialRequests') }}
      />
      <HubStack.Screen
        name="MergeEdit"
        component={MergeEditScreen}
        options={{ ...headerOptions2, title: t('materials.mergeAndEdit') }}
      />
    </HubStack.Navigator>
  );
}

function ProfileNavigator() {
  const { t } = useTranslation();
  return (
    <ProfileStack.Navigator>
      <ProfileStack.Screen
        name="ProfileMain"
        component={ProfileScreen}
        options={{ ...headerOptions, title: t('modules.profile') }}
      />
      <ProfileStack.Screen
        name="ChangePin"
        component={ChangePinScreen}
        options={{ ...headerOptions, title: t('auth.changePin') }}
      />
    </ProfileStack.Navigator>
  );
}

export default function AppNavigator() {
  const { t } = useTranslation();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const fetchUnread = async () => {
      try {
        const res = await apiClient.get('/api/hub/messages/unread-count');
        setUnreadCount(Number(res.data?.count || 0));
      } catch {}
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 10000);

    return () => clearInterval(interval);
  }, []);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size, focused }) => {
          const icons: Record<string, [string, string]> = {
            Home:    ['home',          'home-outline'],
            Hub:     ['notifications', 'notifications-outline'],
            Profile: ['person-circle', 'person-circle-outline'],
          };
          const [filled, outline] = icons[route.name] || ['ellipse', 'ellipse-outline'];
          return <Ionicons name={focused ? filled : outline} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#1e3a5f',
        tabBarInactiveTintColor: '#9ca3af',
        tabBarStyle: {
          backgroundColor: '#ffffff',
          borderTopColor: '#e5e7eb',
          paddingBottom: 4,
          height: 60,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        headerShown: false,
      })}
    >
      <Tab.Screen
        name="Home"
        component={MainStackNavigator}
        options={{ title: t('modules.home') }}
      />
      <Tab.Screen
        name="Hub"
        component={HubNavigator}
        options={{
          title: t('modules.myHub'),
          headerShown: false,
          tabBarBadge: unreadCount > 0 ? (unreadCount > 99 ? '99+' : unreadCount) : undefined,
          tabBarBadgeStyle: { backgroundColor: '#dc2626', color: '#ffffff', fontSize: 10 },
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileNavigator}
        options={{ title: t('modules.profile') }}
      />
    </Tab.Navigator>
  );
}
