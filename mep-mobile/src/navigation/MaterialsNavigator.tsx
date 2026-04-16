import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { useTranslation } from 'react-i18next';
import MaterialRequestScreen from '../screens/materials/MaterialRequestScreen';
import MyRequestsScreen from '../screens/materials/MyRequestsScreen';
import ForemanWorkspaceScreen from '../screens/materials/ForemanWorkspaceScreen';
import { useAuthStore } from '../store/useAuthStore';
import { headerColors } from '../theme/colors';

const Stack = createStackNavigator();

const FOREMAN_ROLES = ['TRADE_ADMIN', 'COMPANY_ADMIN', 'TRADE_PROJECT_MANAGER', 'SUPER_ADMIN', 'IT_ADMIN'];

export default function MaterialsNavigator() {
  const { t } = useTranslation();
  const user = useAuthStore(s => s.user);
  const role = (user?.role || '').toUpperCase();
  const isForeman = FOREMAN_ROLES.includes(role);

  const headerOptions = headerColors;

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {isForeman ? (
        <>
          <Stack.Screen
            name="ForemanWorkspace"
            component={ForemanWorkspaceScreen}
            options={{ ...headerOptions, headerShown: true, title: t('materials.title') }}
          />
          <Stack.Screen
            name="MaterialRequest"
            component={MaterialRequestScreen}
            options={{ ...headerOptions, headerShown: true, title: t('materials.newRequest') }}
          />
        </>
      ) : (
        <>
          <Stack.Screen
            name="MaterialRequest"
            component={MaterialRequestScreen}
            options={{ ...headerOptions, headerShown: true, title: t('materials.title') }}
          />
        </>
      )}
      <Stack.Screen
        name="MyRequests"
        component={MyRequestsScreen}
        options={{ ...headerOptions, headerShown: true, title: t('materials.myRequests') }}
      />
    </Stack.Navigator>
  );
}
