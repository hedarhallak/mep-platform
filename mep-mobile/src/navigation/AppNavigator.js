import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { View, Text, StyleSheet } from "react-native";
import { Colors } from "../constants/colors";
import MyHubScreen from "../screens/hub/MyHubScreen";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const PlaceholderScreen = ({ route }) => (
  <View style={styles.placeholder}>
    <Text style={styles.placeholderText}>{route.name}</Text>
  </View>
);

const TabIcon = ({ label, focused }) => (
  <View style={[styles.tabIcon, focused && styles.tabIconFocused]}>
    <Text style={[styles.tabLabel, focused && styles.tabLabelFocused]}>{label}</Text>
  </View>
);

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarShowLabel: false,
      }}
    >
      <Tab.Screen
        name="MyHub"
        component={MyHubScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon label="Hub" focused={focused} /> }}
      />
      <Tab.Screen
        name="Attendance"
        component={PlaceholderScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon label="Attendance" focused={focused} /> }}
      />
      <Tab.Screen
        name="Assignments"
        component={PlaceholderScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon label="Tasks" focused={focused} /> }}
      />
      <Tab.Screen
        name="Profile"
        component={PlaceholderScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon label="Profile" focused={focused} /> }}
      />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Main" component={MainTabs} />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.surface,
    borderTopColor: Colors.border,
    borderTopWidth: 1,
    height: 64,
    paddingBottom: 8,
    paddingTop: 8,
  },
  tabIcon: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
  },
  tabIconFocused: { backgroundColor: Colors.primary + "15" },
  tabLabel: { fontSize: 11, color: Colors.textMuted, fontWeight: "500" },
  tabLabelFocused: { color: Colors.primary, fontWeight: "700" },
  placeholder: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.background },
  placeholderText: { fontSize: 18, color: Colors.textSecondary },
});
