import React from 'react';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import MaterialRequestScreen from '../screens/materials/MaterialRequestScreen';
import MyRequestsScreen from '../screens/materials/MyRequestsScreen';

const Tab = createMaterialTopTabNavigator();

export default function MaterialsNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: '#1e3a5f',
        tabBarInactiveTintColor: '#9ca3af',
        tabBarIndicatorStyle: { backgroundColor: '#1e3a5f', height: 3 },
        tabBarLabelStyle: { fontWeight: '700', fontSize: 13 },
        tabBarStyle: { backgroundColor: '#ffffff' },
      }}
    >
      <Tab.Screen name="New Request" component={MaterialRequestScreen} />
      <Tab.Screen name="My Requests" component={MyRequestsScreen} />
    </Tab.Navigator>
  );
}
