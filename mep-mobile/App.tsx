import React from 'react';
import RootNavigator from './src/navigation/RootNavigator';
import { usePushNotifications } from './src/hooks/usePushNotifications';

export default function App() {
  usePushNotifications();
  return <RootNavigator />;
}
