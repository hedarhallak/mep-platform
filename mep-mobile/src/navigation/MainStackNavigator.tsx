import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import DashboardScreen from '../screens/DashboardScreen';
import AttendanceScreen from '../screens/attendance/AttendanceScreen';
import MaterialsMenuScreen from '../screens/materials/MaterialsMenuScreen';
import MaterialRequestScreen from '../screens/materials/MaterialRequestScreen';
import MyRequestsScreen from '../screens/materials/MyRequestsScreen';
import TasksMenuScreen from '../screens/hub/TasksMenuScreen';
import NewTaskScreen from '../screens/hub/NewTaskScreen';
import SentTasksScreen from '../screens/hub/SentTasksScreen';
import ReportMenuScreen from '../screens/reports/ReportMenuScreen';
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

      {/* Attendance */}
      <Stack.Screen name="Attendance" component={AttendanceScreen}
        options={{ ...headerOptions, headerShown: true, title: 'Check In/Out' }} />

      {/* Materials */}
      <Stack.Screen name="Materials" component={MaterialsMenuScreen}
        options={{ ...headerOptions, headerShown: true, title: 'Materials' }} />
      <Stack.Screen name="MaterialRequest" component={MaterialRequestScreen}
        options={{ ...headerOptions, headerShown: true, title: 'New Request' }} />
      <Stack.Screen name="MyRequests" component={MyRequestsScreen}
        options={{ ...headerOptions, headerShown: true, title: 'My Requests' }} />
      <Stack.Screen name="MergeEdit" component={MergeEditScreen}
        options={{ ...headerOptions, headerShown: true, title: 'Edit & Send Order' }} />

      {/* Tasks */}
      <Stack.Screen name="Tasks" component={TasksMenuScreen}
        options={{ ...headerOptions, headerShown: true, title: 'Tasks' }} />
      <Stack.Screen name="NewTask" component={NewTaskScreen}
        options={{ ...headerOptions, headerShown: true, title: 'New Task' }} />
      <Stack.Screen name="SentTasks" component={SentTasksScreen}
        options={{ ...headerOptions, headerShown: true, title: 'Sent Tasks' }} />

      {/* Report */}
      <Stack.Screen name="Report" component={ReportMenuScreen}
        options={{ ...headerOptions, headerShown: true, title: 'My Report' }} />
      <Stack.Screen name="ReportView" component={MyReportScreen}
        options={{ ...headerOptions, headerShown: true, title: 'Report' }} />

      {/* Profile */}
      <Stack.Screen name="Profile" component={ProfileScreen}
        options={{ ...headerOptions, headerShown: true, title: 'Profile' }} />
      <Stack.Screen name="ChangePin" component={ChangePinScreen}
        options={{ ...headerOptions, headerShown: true, title: 'Change PIN' }} />
    </Stack.Navigator>
  );
}
