import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View } from 'react-native';
import { useAuthStore } from '../store/useAuthStore';
import LoginScreen from '../screens/LoginScreen';
import AppNavigator from './AppNavigator';
import MyRequestsScreen from '../screens/materials/MyRequestsScreen';
import ChangePinScreen from '../screens/profile/ChangePinScreen';

const Stack = createNativeStackNavigator();

export default function RootNavigator() {
  const { user, isLoading, loadFromStorage } = useAuthStore();

  useEffect(() => {
    loadFromStorage();
  }, []);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f9fafb' }}>
        <ActivityIndicator size="large" color="#1e3a5f" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
          <>
            <Stack.Screen name="App" component={AppNavigator} />
            <Stack.Screen
              name="MyRequests"
              component={MyRequestsScreen}
              options={{
                headerShown: true,
                title: 'My Requests',
                headerStyle: { backgroundColor: '#1e3a5f' },
                headerTintColor: '#ffffff',
                headerTitleStyle: { fontWeight: 'bold' },
              }}
            />
            <Stack.Screen
              name="ChangePin"
              component={ChangePinScreen}
              options={{
                headerShown: true,
                title: 'Change PIN',
                headerStyle: { backgroundColor: '#1e3a5f' },
                headerTintColor: '#ffffff',
                headerTitleStyle: { fontWeight: 'bold' },
              }}
            />
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
