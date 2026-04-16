import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { useTranslation } from 'react-i18next';
import { headerColors } from '../theme/colors';
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

const headerOptions = headerColors;

export default function MainStackNavigator() {
  const { t } = useTranslation();
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Dashboard" component={DashboardScreen} />

      {/* Attendance */}
      <Stack.Screen name="Attendance" component={AttendanceScreen}
        options={{ ...headerOptions, headerShown: true, title: t('attendance.title') }} />

      {/* Materials */}
      <Stack.Screen name="Materials" component={MaterialsMenuScreen}
        options={{ ...headerOptions, headerShown: true, title: t('materials.title') }} />
      <Stack.Screen name="MaterialRequest" component={MaterialRequestScreen}
        options={{ ...headerOptions, headerShown: true, title: t('materials.newRequest') }} />
      <Stack.Screen name="MyRequests" component={MyRequestsScreen}
        options={{ ...headerOptions, headerShown: true, title: t('materials.myRequests') }} />
      <Stack.Screen name="MergeEdit" component={MergeEditScreen}
        options={{ ...headerOptions, headerShown: true, title: t('materials.mergeAndEdit') }} />

      {/* Tasks */}
      <Stack.Screen name="Tasks" component={TasksMenuScreen}
        options={{ ...headerOptions, headerShown: true, title: t('tasks.title') }} />
      <Stack.Screen name="NewTask" component={NewTaskScreen}
        options={{ ...headerOptions, headerShown: true, title: t('tasks.newTask') }} />
      <Stack.Screen name="SentTasks" component={SentTasksScreen}
        options={{ ...headerOptions, headerShown: true, title: t('tasks.sentTasks') }} />

      {/* Report */}
      <Stack.Screen name="Report" component={ReportMenuScreen}
        options={{ ...headerOptions, headerShown: true, title: t('report.title') }} />
      <Stack.Screen name="ReportView" component={MyReportScreen}
        options={{ ...headerOptions, headerShown: true, title: t('report.title') }} />

      {/* Profile */}
      <Stack.Screen name="Profile" component={ProfileScreen}
        options={{ ...headerOptions, headerShown: true, title: t('profile.title') }} />
      <Stack.Screen name="ChangePin" component={ChangePinScreen}
        options={{ ...headerOptions, headerShown: true, title: t('auth.changePin') }} />
    </Stack.Navigator>
  );
}
