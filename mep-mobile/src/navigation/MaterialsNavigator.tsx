import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import MaterialRequestScreen from '../screens/materials/MaterialRequestScreen';
import MyRequestsScreen from '../screens/materials/MyRequestsScreen';
import ForemanWorkspaceScreen from '../screens/materials/ForemanWorkspaceScreen';
import { useAuthStore } from '../store/useAuthStore';

const Stack = createStackNavigator();

const FOREMAN_ROLES = ['TRADE_ADMIN', 'COMPANY_ADMIN', 'TRADE_PROJECT_MANAGER', 'SUPER_ADMIN', 'IT_ADMIN'];

export default function MaterialsNavigator() {
  const user = useAuthStore(s => s.user);
  const role = (user?.role || '').toUpperCase();
  const isForeman = FOREMAN_ROLES.includes(role);

  const headerOptions = {
    headerStyle: { backgroundColor: '#1e3a5f' },
    headerTintColor: '#ffffff',
    headerTitleStyle: { fontWeight: 'bold' as const },
  };

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {isForeman ? (
        <>
          <Stack.Screen
            name="ForemanWorkspace"
            component={ForemanWorkspaceScreen}
            options={{ ...headerOptions, headerShown: true, title: 'Materials' }}
          />
          <Stack.Screen
            name="MaterialRequest"
            component={MaterialRequestScreen}
            options={{ ...headerOptions, headerShown: true, title: 'Submit Request' }}
          />
        </>
      ) : (
        <>
          <Stack.Screen
            name="MaterialRequest"
            component={MaterialRequestScreen}
            options={{ ...headerOptions, headerShown: true, title: 'Materials' }}
          />
        </>
      )}
      <Stack.Screen
        name="MyRequests"
        component={MyRequestsScreen}
        options={{ ...headerOptions, headerShown: true, title: 'My Requests' }}
      />
    </Stack.Navigator>
  );
}
