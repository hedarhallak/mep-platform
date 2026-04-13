import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import DashboardScreen from '../screens/DashboardScreen';
import AttendanceScreen from '../screens/attendance/AttendanceScreen';
import MaterialsNavigator from './MaterialsNavigator';
import MyReportScreen from '../screens/reports/MyReportScreen';
import ProfileScreen from '../screens/profile/ProfileScreen';
import ChangePinScreen from '../screens/profile/ChangePinScreen';
import MergeEditScreen from '../screens/materials/MergeEditScreen';

const Stack = createStackNavigator();

const headerOptions = {
  headerStyle: { backgroundColor: '#1e3a5f' },
  headerTintColor: '#ffffff',
  headerTitleStyle: { fontWeight: 'bold' as const },
};

export default function MainStackNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Dashboard" component={DashboardScreen} />
      <Stack.Screen
        name="Attendance"
        component={AttendanceScreen}
        options={{ ...headerOptions, headerShown: true, title: 'Check In/Out' }}
      />
      <Stack.Screen
        name="Materials"
        component={MaterialsNavigator}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Report"
        component={MyReportScreen}
        options={{ ...headerOptions, headerShown: true, title: 'My Report' }}
      />
      <Stack.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ ...headerOptions, headerShown: true, title: 'Profile' }}
      />
      <Stack.Screen
        name="ChangePin"
        component={ChangePinScreen}
        options={{ ...headerOptions, headerShown: true, title: 'Change PIN' }}
      />
      <Stack.Screen
        name="MergeEdit"
        component={MergeEditScreen}
        options={{ ...headerOptions, headerShown: true, title: 'Edit & Send Order' }}
      />
    </Stack.Navigator>
  );
}
