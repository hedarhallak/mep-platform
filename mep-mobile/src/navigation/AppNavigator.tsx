import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import AttendanceScreen from '../screens/attendance/AttendanceScreen';
import MaterialRequestScreen from '../screens/materials/MaterialRequestScreen';
import MyReportScreen from '../screens/reports/MyReportScreen';
import MyHubScreen from '../screens/hub/MyHubScreen';
import ProfileScreen from '../screens/profile/ProfileScreen';

const Tab = createBottomTabNavigator();

export default function AppNavigator() {
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
      <Tab.Screen name="Materials" component={MaterialRequestScreen} options={{ title: 'Materials' }} />
      <Tab.Screen name="Report" component={MyReportScreen} options={{ title: 'My Report' }} />
      <Tab.Screen name="Hub" component={MyHubScreen} options={{ title: 'My Hub' }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profile' }} />
    </Tab.Navigator>
  );
}
