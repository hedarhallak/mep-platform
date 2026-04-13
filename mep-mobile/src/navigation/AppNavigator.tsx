import React, { useEffect, useState } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import MainStackNavigator from './MainStackNavigator';
import MyHubScreen from '../screens/hub/MyHubScreen';
import ProfileScreen from '../screens/profile/ProfileScreen';
import ChangePinScreen from '../screens/profile/ChangePinScreen';
import { createStackNavigator } from '@react-navigation/stack';
import MergeEditScreen from '../screens/materials/MergeEditScreen';
import { apiClient } from '../api/client';

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
  return (
    <HubStack.Navigator>
      <HubStack.Screen
        name="MyHubMain"
        component={MyHubScreen}
        options={{ ...headerOptions2, title: 'My Hub' }}
      />
      <HubStack.Screen
        name="MergeEdit"
        component={MergeEditScreen}
        options={{ ...headerOptions2, title: 'Edit & Send Order' }}
      />
    </HubStack.Navigator>
  );
}

function ProfileNavigator() {
  return (
    <ProfileStack.Navigator>
      <ProfileStack.Screen
        name="ProfileMain"
        component={ProfileScreen}
        options={{ ...headerOptions, title: 'Profile' }}
      />
      <ProfileStack.Screen
        name="ChangePin"
        component={ChangePinScreen}
        options={{ ...headerOptions, title: 'Change PIN' }}
      />
    </ProfileStack.Navigator>
  );
}

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
        options={{ title: 'Home' }}
      />
      <Tab.Screen
        name="Hub"
        component={HubNavigator}
        options={{
          title: 'My Hub',
          headerShown: false,
          tabBarBadge: unreadCount > 0 ? (unreadCount > 99 ? '99+' : unreadCount) : undefined,
          tabBarBadgeStyle: { backgroundColor: '#dc2626', color: '#ffffff', fontSize: 10 },
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileNavigator}
        options={{ title: 'Profile' }}
      />
    </Tab.Navigator>
  );
}
