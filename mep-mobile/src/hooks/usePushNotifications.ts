import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { apiClient } from '../api/client';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerPushToken() {
  // Skip in Expo Go — push notifications not supported in SDK 53+
  const isExpoGo = Constants.appOwnership === 'expo';
  if (isExpoGo || !Device.isDevice) return;

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return;

  const tokenData = await Notifications.getExpoPushTokenAsync();
  const token = tokenData.data;

  await apiClient.post('/api/profile/push-token', {
    token,
    platform: Platform.OS,
  });
}

export function usePushNotifications() {
  useEffect(() => {
    registerPushToken().catch(() => {});
  }, []);
}
